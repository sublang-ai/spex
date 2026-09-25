// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Authoring coverage (playbook-library-72..76, core-service-97):
// drafts driven over the WebSocket protocol against the scripted fake
// adapter and a stub slc — no network, no agent credentials, no real
// compiler (DR-058).

import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { authoringDocuments } from "./authoring.js";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { fakeAdapterImports, type FakeAdapterStats, type FakeScript } from "./testing/fake-adapter.js";
import { AUTHORING_SOURCE, authoringScript } from "./testing/authoring.js";
import { stubSlcBlockingSource, stubSlcScriptedSource, stubSlcSource } from "./testing/stub-slc.js";
import type {
  Command,
  CommandResults,
  CompileProgressMessage,
  DraftInfo,
  DraftRecordMessage,
  DraftSourceMessage,
  DraftStateMessage,
  ServerMessage,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const CONFIG = `
captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
  dev.reviewer:
    adapter: codex
    model: codex-test
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
  review:
    from: "@sublang/playbook/review/registry"
    roles:
      coder: dev.coder
      reviewer: dev.reviewer
`;

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id, 120_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }

  async expectError<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
    code: string,
  ): Promise<{ code: string; message: string }> {
    const reply = await this.command(type, fields);
    assert.ok(!reply.ok, `${type} must be refused`);
    if (reply.ok) throw new Error("unreachable");
    assert.equal(reply.error.code, code, `${type}: ${reply.error.message}`);
    return reply.error;
  }

  async waitFor(check: (message: ServerMessage) => boolean, timeoutMs = 10_000): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timeout waiting; got ${JSON.stringify(this.messages.map((m) => m.type))}`);
      }
      await sleep(10);
    }
  }

  states(id: string): DraftInfo[] {
    return this.messages
      .filter((m): m is DraftStateMessage => m.type === "draft.state" && m.draft.id === id)
      .map((m) => m.draft);
  }

  latest(id: string): DraftInfo | undefined {
    return this.states(id).at(-1);
  }

  records(id: string): DraftRecordMessage[] {
    return this.messages.filter((m): m is DraftRecordMessage => m.type === "draft.record" && m.draftId === id);
  }

  statusLines(id: string): string[] {
    return this.records(id)
      .filter((m) => m.record.type === "captain_status")
      .map((m) => (m.record as { message: string }).message);
  }

  turnStarts(id: string): string[] {
    return this.records(id)
      .filter((m) => m.record.type === "turn_started")
      .map((m) => (m.record as { turn: { prompt: string } }).turn.prompt);
  }

  progress(id: string): string[] {
    return this.messages
      .filter((m): m is CompileProgressMessage => m.type === "compile.progress" && m.playbookId === id)
      .map((m) => m.line);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean, timeoutMs = 60_000, what = "condition"): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(15);
  }
}

interface Harness {
  service: CoreService;
  stats: FakeAdapterStats;
  dir: string;
  dataDir: string;
  configPath: string;
  /** Every spawn but a `--version` probe — the stub slc — with its env. */
  slcCalls: { argv: string[]; env?: NodeJS.ProcessEnv }[];
}

/** The toolchain probe wants a system Node; every other spawn — the
 * stub slc — is real, and recorded with its env. */
function probeSpawner(slcCalls: Harness["slcCalls"]): LineSpawner {
  return (command, args, cwd, onLine, signal, env) => {
    const probe = args.length === 1 && args[0] === "--version";
    if (probe && command !== process.execPath) {
      onLine("v24.1.0");
      return Promise.resolve(0);
    }
    if (!probe) slcCalls.push({ argv: [command, ...args], env });
    return defaultSpawner(command, args, cwd, onLine, signal, env);
  };
}

async function startHarness(options: { script: FakeScript; slc: string; dir?: string }): Promise<Harness> {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), "spex-authoring-it-"));
  const configPath = join(dir, "playbook.config.yaml");
  if (!existsSync(configPath)) writeFileSync(configPath, CONFIG);
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, options.slc);
  const dataDir = join(dir, "state");
  const { imports, stats } = fakeAdapterImports(options.script);
  const slcCalls: Harness["slcCalls"] = [];
  const service = await CoreService.start({
    token: "test",
    configPath,
    dataDir,
    adapterImports: imports,
    adapterRuntime: () => ({ usable: true }),
    env: { SPEX_SLC: `${process.execPath} ${stubPath}` },
    home: join(dir, "home"),
    watchConfig: false,
    compileSpawner: probeSpawner(slcCalls),
  });
  return { service, stats, dir, dataDir, configPath, slcCalls };
}

const SOURCE = AUTHORING_SOURCE.replaceAll("<id>", "triage");

// ---------------------------------------------------------------------------
// playbook-library-72: the happy path through registration
// ---------------------------------------------------------------------------

test("playbook-library-72: a draft is authored, compiled, proposed, and registered over the protocol", async () => {
  const harness = await startHarness({ script: authoringScript(), slc: stubSlcSource("['Triager', 'Verifier']") });
  const { stats, dataDir, configPath } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  const configBefore = readFileSync(configPath, "utf8");
  const draftDir = join(dataDir, "playbooks", "triage");

  // The channel exists once the draft does (core-service-96).
  const created = await client.expectOk("draft.create", { draftId: "triage" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
  assert.equal(created.state, "no-source");
  assert.equal(created.activity, "idle");
  assert.equal(created.player, null);
  assert.equal(created.agent.adapter, "claude");
  assert.ok(existsSync(draftDir), "the library directory is made");
  assert.ok(existsSync(join(dataDir, "local", "drafts", "triage", "draft.json")), "the record is made");
  // An id a configured playbook, a built-in, or a draft holds is refused.
  await client.expectError("draft.create", { draftId: "code" }, "invalid_request");
  await client.expectError("draft.create", { draftId: "decide" }, "invalid_request");
  await client.expectError("draft.create", { draftId: "triage" }, "conflict");

  const sent = await client.expectOk("draft.send", { draftId: "triage", text: "I want a playbook that triages new issues into labels." });
  assert.deepEqual(sent, { accepted: true, queued: false });
  await until(() => {
    const draft = client.latest("triage");
    return draft?.activity === "idle" && draft.proposal !== undefined;
  }, 120_000, "the proposal");

  // playbook-library-64: the fake ran in the draft directory with
  // `{ mode: "auto" }`, no tool lists, no resume.
  const first = stats.runs[0];
  assert.equal(first.cwd, draftDir);
  assert.deepEqual(first.permissions, { mode: "auto" });
  assert.equal(first.allowedTools, undefined);
  assert.equal(first.disallowedTools, undefined);
  assert.equal(first.resume, undefined);
  assert.equal(first.model, "claude-test");
  // playbook-library-65: the prompt carried the source path, the four
  // documents, and both directive kinds.
  assert.ok(first.prompt.includes(join(draftDir, "triage.md")), "the source path");
  for (const document of authoringDocuments()) assert.ok(first.prompt.includes(document.path), document.path);
  assert.match(first.prompt, /kind: compile/);
  assert.match(first.prompt, /kind: register/);
  assert.match(first.prompt, /Boss: I want a playbook that triages/);
  assert.match(first.prompt, /Before work begins, ensure the current directory/);
  assert.match(first.prompt, /A source the Boss placed may be a SKILL\.md/);

  // playbook-library-64: author player records and a Boss turn, in sequence.
  const records = client.records("triage");
  assert.deepEqual(records.map((m) => m.seq), records.map((_m, index) => index + 1), "records arrive in sequence");
  const types = records.map((m) => m.record.type);
  assert.equal(types[0], "turn_started");
  assert.equal((records[0].record as { turn: { prompt: string } }).turn.prompt, "I want a playbook that triages new issues into labels.");
  for (const kind of ["player_prompt", "player_event", "player_finished"]) {
    const found = records.filter((m) => m.record.type === kind);
    assert.ok(found.length > 0, kind);
    assert.ok(found.every((m) => (m.record as { playerId: string }).playerId === "author"), `${kind} names author`);
  }
  assert.ok(types.includes("turn_finished"));

  // playbook-library-71: the source broadcast after the write, before the turn ended.
  const sourceIndex = client.messages.findIndex((m): m is DraftSourceMessage => m.type === "draft.source" && m.draftId === "triage");
  const finishedIndex = client.messages.findIndex((m) => m.type === "draft.record" && m.draftId === "triage" && m.record.type === "player_finished");
  assert.ok(sourceIndex >= 0 && sourceIndex < finishedIndex, "the source streamed before the turn ended");
  const source = client.messages[sourceIndex] as DraftSourceMessage;
  assert.match(source.markdown, /^# triage\n\nRoles:/);
  assert.equal(source.version.length, 16);

  // playbook-library-66/67: the compile started without a further
  // command, its lines streamed as compile progress, and no config write.
  assert.ok(client.statusLines("triage").includes("◇ Compiling — asked by the agent"));
  const progress = client.progress("triage");
  assert.ok(progress.some((line) => line.startsWith("→ normalize")), "phase lines stream");
  assert.ok(progress.includes("compile complete"));
  assert.ok(client.statusLines("triage").includes("◇ Compiled — roles: Triager, Verifier"));
  assert.equal(readFileSync(configPath, "utf8"), configBefore, "no config write until registration");
  const compiled = client.latest("triage");
  assert.ok(compiled);
  assert.equal(compiled.state, "compiled");
  assert.deepEqual(compiled.compile?.roles, ["Triager", "Verifier"]);
  assert.equal(compiled.compile?.by, "agent");
  // The compile ran on the draft's answering agent, the Captain's block (playbook-library-72, playbook-library-42).
  assert.equal(harness.slcCalls.length, 1, "one stub slc run");
  assert.equal(harness.slcCalls[0].env?.SLC_AGENT, "claude-code");
  assert.equal(harness.slcCalls[0].env?.SLC_MODEL, "claude-test");
  assert.equal(harness.slcCalls[0].env?.SLC_STALL_TIMEOUT, "2400");

  // playbook-library-68/66: the success turn named the roles; the
  // proposal landed with the block's fields.
  const success = stats.runs[1];
  assert.match(success.prompt, /The compile of triage succeeded; the roles are Triager, Verifier\. Propose the registration in a register block/);
  assert.match(success.prompt, /^Spex: /m);
  assert.ok(success.resume, "the success turn continued the provider conversation");
  assert.doesNotMatch(success.prompt, /You are helping the Boss/);
  assert.equal(client.turnStarts("triage")[1], "Spex: the compile succeeded — asking for a registration proposal");
  assert.deepEqual(compiled.proposal, {
    command: "triage",
    intent: "Triage a new issue into the repository's labels",
    players: { Triager: "dev.triager", Verifier: "dev.coder" },
  });

  const artifacts = await client.expectOk("draft.artifacts", { draftId: "triage" });
  assert.ok(artifacts.gears && artifacts.fsm, "the compiled stages serve");
  assert.ok(artifacts.stateIds?.includes("ready"));

  // playbook-library-69/70: registration writes the new player, then
  // the entry keyed by the derived roles; the draft retires.
  const state = await client.expectOk("draft.register", {
    draftId: "triage",
    command: "triage",
    intent: "Label new issues",
    bindings: { Triager: "dev.triager", Verifier: "dev.coder" },
    newPlayers: { "dev.triager": { adapter: "claude" } },
  });
  assert.equal(state.status, "valid");
  const registered = state.status === "valid" ? state.summary.playbooks.find((p) => p.id === "triage") : undefined;
  assert.ok(registered, "the playbook is configured");
  assert.deepEqual(Object.keys(registered.roles), ["Triager", "Verifier"]);
  assert.equal(registered.roles.Triager.playerId, "dev.triager");
  assert.equal(registered.roles.Verifier.playerId, "dev.coder");
  assert.equal(registered.command, "triage");
  assert.equal(registered.intent, "Label new issues");
  const config = readFileSync(configPath, "utf8");
  assert.ok(config.indexOf("dev.triager:") < config.indexOf("\n  triage:\n"), "the new player is written before the entry");
  const wrapper = readFileSync(join(draftDir, "triage.registry.ts"), "utf8");
  assert.match(wrapper, /command: "triage"/);
  assert.match(wrapper, /intent: "Label new issues"/);
  assert.deepEqual(await client.expectOk("draft.list", {}), []);
  await client.waitFor((m) => m.type === "draft.removed" && m.draftId === "triage");
  assert.ok(!existsSync(join(dataDir, "local", "drafts", "triage")), "the record is gone");
  assert.ok(existsSync(join(draftDir, "triage.md")), "the directory stays with the playbook");
  await client.expectError("draft.open", { draftId: "triage" }, "not_found");

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// playbook-library-73: the bounded failure relay
// ---------------------------------------------------------------------------

test("playbook-library-73: failures relay to the agent, stop at three, and a Boss message resets the count", async () => {
  const harness = await startHarness({
    script: authoringScript(),
    slc: stubSlcScriptedSource(
      ["fail:gears2fsm", "fail:gears2fsm", "clarify", "clarify", "fail:gears2fsm", "ok"],
      "['Triager', 'Verifier']",
      { delayMs: 800 },
    ),
  });
  const { stats, configPath, dataDir } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  const configBefore = readFileSync(configPath, "utf8");
  await client.expectOk("draft.create", { draftId: "triage" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
  await client.expectOk("draft.source.write", { draftId: "triage", content: SOURCE });
  const failedCompiles = () => {
    const all = client.states("triage").filter((d) => d.compile?.outcome === "failed").map((d) => d.compile!);
    return all.filter((c, index) => index === 0 || c.at !== all[index - 1].at);
  };

  const boss = await client.expectError("draft.compile", { draftId: "triage" }, "invalid_request");
  assert.match(boss.message, /gears2fsm/);
  // Relay 1 → compile 2 (fails) → relay 2 → compile 3 (clarifies) → stop.
  await until(() => {
    const draft = client.latest("triage");
    return draft?.failures === 3 && draft.activity === "idle" && draft.compile?.questions !== undefined;
  }, 120_000, "three failures");
  await sleep(400);
  assert.equal(stats.runs.length, 2, "no turn after the third failure");

  // playbook-library-67: each failure recorded its phase and output.
  const distinct = failedCompiles();
  assert.deepEqual(distinct.map((c) => c.phase), ["gears2fsm", "gears2fsm", "text2gears"]);
  // What became of each failure travels as a fact beside its line,
  // in the broadcast state and in the persisted record alike.
  assert.deepEqual(distinct.map((c) => c.relay), ["sent", "sent", "stopped"]);
  const stored = JSON.parse(readFileSync(join(dataDir, "local", "drafts", "triage", "draft.json"), "utf8")) as { compile: { relay?: string } };
  assert.equal(stored.compile.relay, "stopped");
  assert.match(distinct[0].output ?? "", /✗ gears2fsm failed at/);
  assert.match(distinct[0].output ?? "", /result 'labeled' declared twice/);
  assert.equal(distinct[2].questions?.[0].id, "q1");
  assert.deepEqual(distinct[2].questions?.[0].choices, ["Triager applies", "The Boss decides"]);

  // playbook-library-65/68: the relay prompts carried the phase, the
  // elapsed time, and the output tail; the third failure relayed nothing.
  for (const run of stats.runs.slice(0, 2)) {
    assert.match(run.prompt, /The compile of triage failed at gears2fsm after 2s\./);
    assert.match(run.prompt, /--- compiler output \(last 200 lines\) ---/);
    assert.match(run.prompt, /result 'labeled' declared twice/);
    assert.match(run.prompt, /Fix triage\.md and explain the cause/);
  }
  // The Boss reads the phase in the row's human words (DR-010 §2); the
  // agent's relay above carried the compiler's id.
  assert.deepEqual(client.turnStarts("triage"), [
    "Spex: the compile failed at Machine — asking the agent to fix the source",
    "Spex: the compile failed at Machine — asking the agent to fix the source",
  ]);
  const lines = client.statusLines("triage");
  assert.equal(lines.filter((l) => l === "◇ Compile failed at Machine — sent to the agent").length, 2);
  assert.ok(lines.includes("◇ Compile failed at Spec items — three in a row; tell the agent how to proceed"));
  assert.ok(!lines.some((l) => /gears2fsm|text2gears/.test(l)), "no compiler id serves as the thread's copy");
  assert.equal(lines.filter((l) => l === "◇ Compiling — asked by you").length, 1);
  assert.equal(lines.filter((l) => l === "◇ Compiling — asked by the agent").length, 2);

  // A Boss message resets the count: its compile clarifies (relayed,
  // with the questions), the next fails (relayed as a preface).
  const reset = await client.expectOk("draft.send", { draftId: "triage", text: "Ask me what you need, then compile again." });
  assert.equal(reset.queued, false);
  await until(() => client.statusLines("triage").filter((l) => l.startsWith("◇ Compiling")).length >= 5, 120_000, "the fifth compile");
  const queued = await client.expectOk("draft.send", { draftId: "triage", text: "Also cite the label definitions." });
  assert.equal(queued.queued, true);
  assert.deepEqual(client.latest("triage")?.queued, ["Also cite the label definitions."]);
  await until(() => {
    const draft = client.latest("triage");
    return draft?.activity === "idle" && draft.state === "compiled" && draft.proposal !== undefined;
  }, 120_000, "the final compile");

  // runs: relay, relay, Boss, relay with questions, prefaced Boss, success.
  assert.equal(stats.runs.length, 6);
  assert.match(stats.runs[2].prompt, /Boss: Ask me what you need/);
  assert.match(stats.runs[2].prompt, /Since your last reply: .*a compile failed at text2gears/);
  const questions = stats.runs[3].prompt;
  assert.match(questions, /The compile of triage stopped at text2gears after \d+s: the compiler asks for clarification/);
  assert.match(questions, /- \[q1\] Who applies the label when the reviewer disagrees\?/);
  assert.match(questions, /Reason: The ending changes with the answer\./);
  assert.match(questions, /Evidence: Roles: lists Triager and Verifier/);
  assert.match(questions, /Choices: Triager applies \| The Boss decides/);
  const prefaced = stats.runs[4].prompt;
  const failureAt = prefaced.indexOf("The compile of triage failed at gears2fsm");
  const bossAt = prefaced.indexOf("Boss: Also cite the label definitions.");
  assert.ok(failureAt >= 0 && bossAt > failureAt, "the queued message carries the failure as its preface");
  assert.doesNotMatch(prefaced, /You are helping the Boss/);
  assert.ok(client.statusLines("triage").includes("◇ Compile failed at Machine — waiting for your queued message"));
  // After the reset, the clarification relayed; the queued message
  // carried the next failure.
  assert.deepEqual(failedCompiles().map((c) => c.relay), ["sent", "sent", "stopped", "sent", "queued"]);
  assert.ok(client.turnStarts("triage").includes("Also cite the label definitions."));
  assert.equal(client.turnStarts("triage").filter((p) => p.startsWith("Spex: the compile failed")).length, 3);
  assert.equal(client.latest("triage")?.failures, 0);
  assert.equal(readFileSync(configPath, "utf8"), configBefore, "no config write throughout");

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// playbook-library-74: the busy and queue matrix
// ---------------------------------------------------------------------------

const IN_FLIGHT: FakeScript = { fallback: { deltas: ["working"], result: "", untilAborted: true } };

test("playbook-library-74: one activity per draft — messages queue, the rest is busy, aborts end cleanly", async () => {
  const harness = await startHarness({ script: IN_FLIGHT, slc: stubSlcBlockingSource("['Helper']") });
  const client = new Client(harness.service.port());
  await client.open();
  await client.expectOk("draft.create", { draftId: "matrix" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "matrix" } });

  // During a turn.
  assert.deepEqual(await client.expectOk("draft.send", { draftId: "matrix", text: "start" }), { accepted: true, queued: false });
  await until(() => client.latest("matrix")?.activity === "turn", 10_000, "the turn");
  assert.deepEqual(await client.expectOk("draft.send", { draftId: "matrix", text: "second" }), { accepted: true, queued: true });
  assert.deepEqual(client.latest("matrix")?.queued, ["second"]);
  await client.expectError("draft.compile", { draftId: "matrix" }, "busy");
  await client.expectError("draft.delete", { draftId: "matrix" }, "busy");
  await client.expectError("draft.register", { draftId: "matrix", command: "matrix", intent: "x", bindings: {} }, "busy");
  await client.expectError("draft.source.write", { draftId: "matrix", content: "# Matrix\n" }, "busy");
  await client.expectError("draft.player.set", { draftId: "matrix", playerId: "dev.coder" }, "busy");
  assert.deepEqual(await client.expectOk("draft.abort", { draftId: "matrix" }), { aborted: true });
  await until(() => client.records("matrix").some((m) => m.record.type === "turn_aborted" && m.record.turnId === 1), 10_000, "turn 1 aborted");
  // The queue stood and dispatches once the draft is idle.
  await until(() => client.turnStarts("matrix").includes("second"), 10_000, "the queued message");
  assert.deepEqual(client.latest("matrix")?.queued, []);
  assert.deepEqual(await client.expectOk("draft.abort", { draftId: "matrix" }), { aborted: true });
  await until(() => client.records("matrix").some((m) => m.record.type === "turn_aborted" && m.record.turnId === 2), 10_000, "turn 2 aborted");
  await until(() => client.latest("matrix")?.activity === "idle", 10_000, "idle");
  assert.deepEqual(await client.expectOk("draft.abort", { draftId: "matrix" }), { aborted: false });

  // During a compile.
  await client.expectOk("draft.source.write", { draftId: "matrix", content: "# Matrix\n\nRoles:\n\n- Helper\n" });
  const compiling = client.command("draft.compile", { draftId: "matrix" });
  await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "matrix" && m.line.startsWith("→ gears2fsm"), 20_000);
  assert.equal(client.latest("matrix")?.activity, "compiling");
  assert.equal(client.latest("matrix")?.state, "compiling");
  assert.deepEqual(await client.expectOk("draft.send", { draftId: "matrix", text: "third" }), { accepted: true, queued: true });
  await client.expectError("draft.compile", { draftId: "matrix" }, "busy");
  await client.expectError("draft.source.write", { draftId: "matrix", content: "# Again\n" }, "busy");
  await client.expectError("draft.register", { draftId: "matrix", command: "matrix", intent: "x", bindings: {} }, "busy");
  await client.expectError("draft.delete", { draftId: "matrix" }, "busy");
  await client.expectError("compile.run", { playbookId: "matrix", sourceText: "# X\n", roles: ["helper"], command: "matrix", intent: "x", bindings: { helper: "dev.coder" } }, "busy");
  assert.deepEqual(await client.expectOk("draft.abort", { draftId: "matrix" }), { aborted: false });
  await client.expectOk("compile.abort", { playbookId: "matrix" });
  const reply = await compiling;
  assert.ok(!reply.ok && reply.error.code === "aborted");
  await until(() => client.latest("matrix")?.compile?.outcome === "canceled", 10_000, "canceled");
  await sleep(100);
  assert.equal(client.progress("matrix").at(-1), "◇ compile canceled");
  assert.ok(client.statusLines("matrix").includes("◇ Compile canceled"));
  // No relay: the next turn is the queued Boss message.
  await until(() => client.turnStarts("matrix").includes("third"), 10_000, "the queued message after the compile");
  assert.ok(!client.turnStarts("matrix").some((p) => p.startsWith("Spex:")), "nothing relayed");
  assert.equal(client.latest("matrix")?.state, "draft");
  await client.expectOk("draft.abort", { draftId: "matrix" });
  await until(() => client.latest("matrix")?.activity === "idle", 10_000, "idle again");

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// playbook-library-75: restart, reseed, resume, the agent switch, delete
// ---------------------------------------------------------------------------

test("playbook-library-75: a restart replays the draft, reseeds the conversation, and an agent switch reseeds too", async () => {
  const script: FakeScript = {
    rules: [
      { match: "Conversation so far", response: { deltas: ["Picking up"], result: "Picking up where we left off." } },
      { match: "Boss: reject", response: { result: "unused", failWith: { code: "SESSION_RESUME_REJECTED", onlyResumed: true } } },
    ],
    fallback: { deltas: ["Noted."], result: "Noted." },
  };
  const first = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']") });
  const { dir, dataDir } = first;
  const client = new Client(first.service.port());
  await client.open();
  await client.expectOk("draft.create", { draftId: "persist" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "persist" } });

  const idle = async (c: Client, n: number) => until(() => c.latest("persist")?.activity === "idle" && c.records("persist").filter((m) => m.record.type === "turn_finished").length >= n, 20_000, `turn ${n}`);
  await client.expectOk("draft.send", { draftId: "persist", text: "hello" });
  await idle(client, 1);
  await client.expectOk("draft.send", { draftId: "persist", text: "reject" });
  await idle(client, 2);
  await client.expectOk("draft.send", { draftId: "persist", text: "again" });
  await idle(client, 3);
  const runs = first.stats.runs;
  assert.equal(runs.length, 4);
  assert.equal(runs[0].resume, undefined, "the first turn has no resume");
  assert.match(runs[0].prompt, /You are helping the Boss/);
  assert.match(runs[1].resume ?? "", /^fake-resume-/, "the second turn passed the first's token");
  assert.doesNotMatch(runs[1].prompt, /Conversation so far/);
  // The provider rejected the resume: re-run once as a reseed.
  assert.equal(runs[2].resume, undefined);
  assert.match(runs[2].prompt, /Conversation so far:\nBoss: hello\nAgent: Noted\.\nBoss: reject/);
  assert.ok(client.statusLines("persist").some((l) => l.includes("rejected the resumed conversation")));
  assert.match(runs[3].resume ?? "", /^fake-resume-/, "the reseed's token continues");
  assert.doesNotMatch(runs[3].prompt, /Conversation so far/);
  assert.equal(client.records("persist").filter((m) => m.record.type === "turn_started").length, 3);

  // A compile in flight when the core stops.
  await client.expectOk("draft.source.write", { draftId: "persist", content: "# Persist\n\nRoles:\n\n- Helper\n" });
  const compiling = client.command("draft.compile", { draftId: "persist" });
  await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "persist" && m.line.startsWith("→ gears2fsm"), 20_000);
  const seqBefore = client.records("persist").at(-1)?.seq ?? 0;
  client.close();
  await first.service.stop();
  await compiling.catch(() => undefined);
  const stored = JSON.parse(readFileSync(join(dataDir, "local", "drafts", "persist", "draft.json"), "utf8")) as { compile: { outcome: string } };
  assert.equal(stored.compile.outcome, "running", "the stop leaves the compile as it was");

  // playbook-library-70: the restart reads it as interrupted, relays nothing.
  const second = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']"), dir });
  const client2 = new Client(second.service.port());
  await client2.open();
  await client2.expectOk("subscribe", { channel: { kind: "draft", draftId: "persist" } });
  const opened = await client2.expectOk("draft.open", { draftId: "persist" });
  assert.equal(opened.draft.state, "interrupted");
  assert.equal(opened.draft.compile?.outcome, "interrupted");
  assert.equal(opened.draft.activity, "idle");
  assert.equal(opened.source?.markdown, "# Persist\n\nRoles:\n\n- Helper\n");
  assert.deepEqual(opened.records.map((r) => r.seq), opened.records.map((_r, index) => index + 1), "the records replay in sequence");
  assert.ok(opened.records.length > seqBefore);
  assert.equal(opened.records.filter((r) => r.record.type === "turn_started").length, 3);
  assert.ok(opened.records.some((r) => r.record.type === "captain_status" && (r.record as { message: string }).message === "◇ Compile interrupted when Spex closed"));
  await sleep(200);
  assert.equal(second.stats.runs.length, 0, "no relay after a restart");

  // playbook-library-65: the next turn reseeds with no resume. The new
  // client subscribed after the restart, so it streams only new records.
  await client2.expectOk("draft.send", { draftId: "persist", text: "back" });
  await idle(client2, 1);
  const back = second.stats.runs[0];
  assert.equal(back.resume, undefined);
  assert.match(back.prompt, /You are helping the Boss/);
  assert.match(back.prompt, /Conversation so far:\nBoss: hello\nAgent: Noted\.\nBoss: reject/);
  assert.match(back.prompt, /Agent: Picking up where we left off\./);
  assert.match(back.prompt, /System: ◇ Compile interrupted when Spex closed/);
  assert.match(back.prompt, /Boss: back$/);
  assert.equal(back.model, "claude-test");

  // The agent switch: the preference, the block, and a reseed.
  const switched = await client2.expectOk("draft.player.set", { draftId: "persist", playerId: "dev.reviewer" });
  assert.equal(switched.player, "dev.reviewer");
  assert.equal(switched.agent.adapter, "codex");
  assert.equal(switched.agent.model, "codex-test");
  const prefs = JSON.parse(readFileSync(join(dataDir, "prefs.json"), "utf8")) as { prefs: Record<string, unknown> };
  assert.equal(prefs.prefs["draft:persist:player"], "dev.reviewer");
  assert.ok(client2.statusLines("persist").includes("◇ Now answering: dev.reviewer — the conversation so far was replayed to it"));
  await client2.expectError("draft.player.set", { draftId: "persist", playerId: "dev.nobody" }, "invalid_request");
  await client2.expectOk("draft.send", { draftId: "persist", text: "switch" });
  await idle(client2, 2);
  const onReviewer = second.stats.runs[1];
  assert.equal(onReviewer.resume, undefined, "a switched agent starts fresh");
  assert.equal(onReviewer.model, "codex-test");
  assert.match(onReviewer.prompt, /Conversation so far:/);
  assert.match(onReviewer.prompt, /answering as dev\.reviewer/);
  const unswitched = await client2.expectOk("draft.player.set", { draftId: "persist", playerId: null });
  assert.equal(unswitched.player, null);
  assert.equal(JSON.parse(readFileSync(join(dataDir, "prefs.json"), "utf8")).prefs["draft:persist:player"], undefined);

  // playbook-library-70: a transcript damaged behind the core's back
  // blocks the draft alone — it opens with its source and a diagnostic,
  // its records withheld, and refuses a message; nothing appends after
  // the damage, and nothing runs.
  await client2.expectOk("draft.player.set", { draftId: "persist", playerId: "dev.reviewer" });
  client2.close();
  await second.service.stop();
  appendFileSync(join(dataDir, "local", "drafts", "persist", "records.jsonl"), '{"seq":999,"record":{"type":"junk"}}\n{not json');
  const third = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']"), dir });
  const client3 = new Client(third.service.port());
  await client3.open();
  const damaged = await client3.expectOk("draft.open", { draftId: "persist" });
  assert.match(damaged.draft.diagnostic ?? "", /records\.jsonl: damaged transcript after record \d+$/);
  assert.deepEqual(damaged.records, [], "the records are withheld");
  assert.equal(damaged.source?.markdown, "# Persist\n\nRoles:\n\n- Helper\n", "the source stands");
  // The record still reads: the interrupted compile and the chosen
  // player stand beside the diagnostic.
  assert.equal(damaged.draft.state, "interrupted");
  assert.equal(damaged.draft.player, "dev.reviewer");
  const listed = await client3.expectOk("draft.list", {});
  assert.equal(listed.length, 1);
  assert.ok(listed[0].diagnostic, "the list carries the diagnostic");
  const refused = await client3.expectError("draft.send", { draftId: "persist", text: "hello?" }, "invalid_request");
  assert.match(refused.message, /damaged transcript/);
  await client3.expectError("draft.compile", { draftId: "persist" }, "invalid_request");
  await client3.expectError("draft.source.write", { draftId: "persist", content: "# Again\n" }, "invalid_request");
  assert.equal(third.stats.runs.length, 0, "nothing ran on a damaged draft");
  const transcript = readFileSync(join(dataDir, "local", "drafts", "persist", "records.jsonl"), "utf8");
  assert.ok(transcript.endsWith("{not json"), "nothing was appended after the damage");

  // playbook-library-70: delete removes the record, the preference, and the directory.
  assert.equal(await client3.expectOk("draft.delete", { draftId: "persist" }), null);
  await client3.waitFor((m) => m.type === "draft.removed" && m.draftId === "persist");
  assert.ok(!existsSync(join(dataDir, "local", "drafts", "persist")), "the record is gone");
  assert.ok(!existsSync(join(dataDir, "playbooks", "persist")), "the library directory is gone");
  assert.equal(JSON.parse(readFileSync(join(dataDir, "prefs.json"), "utf8")).prefs["draft:persist:player"], undefined);
  assert.deepEqual(await client3.expectOk("draft.list", {}), []);
  await client3.expectError("draft.open", { draftId: "persist" }, "not_found");

  client3.close();
  await third.service.stop();
});

// ---------------------------------------------------------------------------
// playbook-library-76: the directive matrix
// ---------------------------------------------------------------------------

const MATRIX_REPLY = [
  "Here is what I would send, as an example:",
  "",
  "````markdown",
  "```spex",
  "kind: compile",
  "```",
  "````",
  "",
  "```spex",
  "kind: register",
  "command: first",
  "intent: The first proposal",
  "players:",
  "  Triager: dev.coder",
  "```",
  "",
  "```spex",
  "kind: register",
  "command: triage",
  "intent: The second proposal wins",
  "players:",
  "  Triager: dev.coder",
  "  Auditor: dev.reviewer",
  "```",
  "",
  "```spex",
  "kind: register",
  "command: bad",
  "intent: carries an unknown key",
  "players:",
  "  Triager: dev.coder",
  "extra: nope",
  "```",
  "",
  "```spex",
  "kind: [unclosed",
  "```",
  "",
  "That is all.",
].join("\n");

test("playbook-library-76: only top-level, well-formed spex blocks act; malformed ones are named in the next prompt", async () => {
  const script: FakeScript = {
    rules: [{ match: "Boss: matrix", response: { deltas: ["Reply."], result: MATRIX_REPLY } }],
    fallback: { deltas: ["Noted."], result: "Noted." },
  };
  const harness = await startHarness({ script, slc: stubSlcSource("['Triager', 'Verifier']") });
  const client = new Client(harness.service.port());
  await client.open();
  await client.expectOk("draft.create", { draftId: "triage" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
  await client.expectOk("draft.source.write", { draftId: "triage", content: SOURCE });
  const compiled = await client.expectOk("draft.compile", { draftId: "triage" });
  assert.deepEqual(compiled, { ok: true, roles: ["Triager", "Verifier"] });
  // The success turn runs (the fallback answers it) before the matrix.
  await until(() => client.latest("triage")?.activity === "idle" && harness.stats.runs.length === 1, 60_000, "the success turn");

  await client.expectOk("draft.send", { draftId: "triage", text: "matrix" });
  await until(() => client.latest("triage")?.activity === "idle" && harness.stats.runs.length === 2, 60_000, "the matrix turn");
  await sleep(200);
  const draft = client.latest("triage");
  assert.ok(draft);
  assert.deepEqual(draft.proposal, {
    command: "triage",
    intent: "The second proposal wins",
    players: { Triager: "dev.coder", Auditor: "dev.reviewer" },
  });
  assert.deepEqual(draft.compile?.roles, ["Triager", "Verifier"], "the derived roles stand; Auditor is a mismatch beside them");
  assert.equal(draft.malformedDirectives?.length, 2);
  assert.ok(draft.malformedDirectives?.some((b) => b.includes("extra: nope")));
  assert.ok(draft.malformedDirectives?.some((b) => b.includes("kind: [unclosed")));
  assert.equal(client.statusLines("triage").filter((l) => l.startsWith("◇ Compiling")).length, 1, "the nested compile block acted as nothing");
  assert.equal(draft.activity, "idle");

  await client.expectOk("draft.send", { draftId: "triage", text: "next" });
  await until(() => harness.stats.runs.length === 3 && client.latest("triage")?.activity === "idle", 60_000, "the next turn");
  const next = harness.stats.runs[2].prompt;
  assert.match(next, /^Spex could not read 2 spex blocks in your last reply/);
  assert.match(next, /extra: nope/);
  assert.match(next, /kind: \[unclosed/);
  assert.match(next, /Boss: next$/);
  assert.equal(client.latest("triage")?.malformedDirectives, undefined);

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// core-service-97: the command family's refusals, channels, and states
// ---------------------------------------------------------------------------

test("core-service-97: draft commands refuse by code, stream on the draft channel only, and publish every transition", async () => {
  const harness = await startHarness({ script: IN_FLIGHT, slc: stubSlcBlockingSource("['Helper']") });
  const a = new Client(harness.service.port());
  const b = new Client(harness.service.port());
  await a.open();
  await b.open();

  // not_found for an unknown draft, on every command — the channel
  // subscription included.
  await a.expectError("subscribe", { channel: { kind: "draft", draftId: "ghost" } }, "not_found");
  await a.expectError("draft.open", { draftId: "ghost" }, "not_found");
  await a.expectError("draft.send", { draftId: "ghost", text: "x" }, "not_found");
  await a.expectError("draft.abort", { draftId: "ghost" }, "not_found");
  await a.expectError("draft.source.write", { draftId: "ghost", content: "x" }, "not_found");
  await a.expectError("draft.compile", { draftId: "ghost" }, "not_found");
  await a.expectError("draft.register", { draftId: "ghost", command: "g", intent: "g", bindings: {} }, "not_found");
  await a.expectError("draft.player.set", { draftId: "ghost", playerId: null }, "not_found");
  await a.expectError("draft.delete", { draftId: "ghost" }, "not_found");
  await a.expectError("draft.artifacts", { draftId: "ghost" }, "not_found");
  // invalid_request for a reserved id.
  await a.expectError("draft.create", { draftId: "review" }, "invalid_request");
  await a.expectError("draft.create", { draftId: "dev" }, "invalid_request");

  await a.expectOk("draft.create", { draftId: "iso" });
  await a.expectOk("subscribe", { channel: { kind: "draft", draftId: "iso" } });
  await b.waitFor((m) => m.type === "draft.state" && m.draft.id === "iso");

  // A malformed draft command is rejected with no state change.
  const statesBefore = a.states("iso").length;
  a.sendRaw(JSON.stringify({ type: "draft.send", id: "bad-1", draftId: "Not Valid", text: "x" }));
  const rejected = await a.waitFor((m) => m.type === "reply" && m.id === "bad-1");
  assert.ok(rejected.type === "reply" && !rejected.ok && rejected.error.code === "invalid_message");
  a.sendRaw(JSON.stringify({ type: "draft.source.write", id: "bad-2", draftId: "iso" }));
  const noSource = await a.waitFor((m) => m.type === "reply" && m.id === "bad-2");
  assert.ok(noSource.type === "reply" && !noSource.ok && noSource.error.code === "invalid_request");
  await sleep(50);
  assert.equal(a.states("iso").length, statesBefore);

  // invalid_request before a successful compile; conflict on a stale version.
  await a.expectError("draft.register", { draftId: "iso", command: "iso", intent: "x", bindings: {} }, "invalid_request");
  await a.expectError("draft.source.write", { draftId: "iso", content: "   " }, "invalid_request");
  const written = await a.expectOk("draft.source.write", { draftId: "iso", content: "# Iso\n\nRoles:\n\n- Helper\n" });
  assert.equal(written.version.length, 16);
  await a.expectError("draft.source.write", { draftId: "iso", content: "# Iso 2\n", baseVersion: "0000000000000000" }, "conflict");
  const again = await a.expectOk("draft.source.write", { draftId: "iso", content: "# Iso 2\n\nRoles:\n\n- Helper\n", baseVersion: written.version });
  assert.notEqual(again.version, written.version);
  assert.ok(a.messages.some((m) => m.type === "draft.source" && m.draftId === "iso" && m.markdown.startsWith("# Iso 2")));

  // The activity table during a turn; records reach the subscriber only.
  await a.expectOk("draft.send", { draftId: "iso", text: "go" });
  await until(() => a.records("iso").some((m) => m.record.type === "player_prompt"), 10_000, "the prompt record");
  assert.deepEqual(await a.expectOk("draft.send", { draftId: "iso", text: "queued" }), { accepted: true, queued: true });
  await a.expectError("draft.compile", { draftId: "iso" }, "busy");
  await a.expectError("draft.source.write", { draftId: "iso", content: "# x\n" }, "busy");
  await a.expectError("draft.register", { draftId: "iso", command: "iso", intent: "x", bindings: {} }, "busy");
  await a.expectError("draft.delete", { draftId: "iso" }, "busy");
  assert.deepEqual(await a.expectOk("draft.abort", { draftId: "iso" }), { aborted: true });
  await until(() => a.turnStarts("iso").includes("queued"), 10_000, "the queued turn");
  assert.deepEqual(await a.expectOk("draft.abort", { draftId: "iso" }), { aborted: true });
  await until(() => a.latest("iso")?.activity === "idle", 10_000, "idle");
  assert.ok(a.records("iso").length > 0);
  assert.equal(b.records("iso").length, 0, "records reach the draft channel's subscribers only");
  assert.ok(b.states("iso").length > 0, "state reaches every client");
  const seqs = a.records("iso").map((m) => m.seq);
  assert.deepEqual(seqs, seqs.map((_s, index) => index + 1), "records arrive in sequence");
  assert.ok(!a.messages.some((m) => m.type === "record"), "draft records never ride the session channel");

  // The activity table during a compile.
  const compiling = a.command("draft.compile", { draftId: "iso" });
  await a.waitFor((m) => m.type === "compile.progress" && m.playbookId === "iso" && m.line.startsWith("→ gears2fsm"), 20_000);
  assert.deepEqual(await a.expectOk("draft.send", { draftId: "iso", text: "later" }), { accepted: true, queued: true });
  await a.expectError("draft.compile", { draftId: "iso" }, "busy");
  await a.expectError("draft.source.write", { draftId: "iso", content: "# x\n" }, "busy");
  await a.expectError("draft.register", { draftId: "iso", command: "iso", intent: "x", bindings: {} }, "busy");
  await a.expectError("draft.delete", { draftId: "iso" }, "busy");
  assert.deepEqual(await a.expectOk("draft.abort", { draftId: "iso" }), { aborted: false });
  await a.expectOk("compile.abort", { playbookId: "iso" });
  const reply = await compiling;
  assert.ok(!reply.ok && reply.error.code === "aborted");
  await until(() => a.turnStarts("iso").includes("later"), 10_000, "the message queued during the compile");
  await a.expectOk("draft.abort", { draftId: "iso" });
  await until(() => a.latest("iso")?.activity === "idle", 10_000, "idle at the end");

  // draft.state followed every transition.
  const activities = a.states("iso").map((d) => d.activity).filter((v, i, all) => i === 0 || v !== all[i - 1]);
  assert.deepEqual(activities, ["idle", "turn", "idle", "turn", "idle", "compiling", "idle", "turn", "idle"]);
  const queueSizes = a.states("iso").map((d) => d.queued.length);
  assert.ok(queueSizes.includes(1) && queueSizes.at(-1) === 0, "the queue's changes were published");
  const chips = a.states("iso").map((d) => d.state).filter((v, i, all) => i === 0 || v !== all[i - 1]);
  assert.deepEqual(chips.slice(0, 2), ["no-source", "draft"]);
  assert.ok(chips.includes("compiling"));

  a.close();
  b.close();
  await harness.service.stop();
});
