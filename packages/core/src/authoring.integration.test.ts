// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Authoring coverage (playbook-library-72..76, core-service-97):
// drafts driven over the WebSocket protocol against the scripted fake
// adapter and a stub slc — no network, no agent credentials, no real
// compiler (DR-058).

import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import { parse as parseYaml } from "yaml";
import type { PermissionPolicy } from "@sublang/cligent";
import { mapPermissionsToClaudeOptions } from "@sublang/cligent/adapters/claude-code";
import { mapPermissionsToCodexOptions } from "@sublang/cligent/adapters/codex";
import { mapPermissionsToGeminiToolConfig } from "@sublang/cligent/adapters/gemini";
import { mapPermissionsToOpenCodeOptions } from "@sublang/cligent/adapters/opencode";

import { CoreService } from "./service.js";
import { authoringDocuments } from "./authoring.js";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { fakeAdapterImports, type FakeAdapterStats, type FakeScript } from "./testing/fake-adapter.js";
import { AUTHORING_SOURCE, authoringScript } from "./testing/authoring.js";
import { STUB_SLC_RELEASE_FILE, stubSlcBlockingSource, stubSlcScriptedSource, stubSlcSource } from "./testing/stub-slc.js";
import { DraftChangedError, DraftStore, legacyInstance } from "./drafts.js";
import { Home } from "./home.js";
import type { ApplicationMedia } from "./media.js";
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
import { scratchDir } from "./testing/scratch.js";

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
    roles:
      coder: dev.coder
  review:
    roles:
      coder: dev.coder
      reviewer: dev.reviewer
`;

/** A command's fields, the session's instance filled in from what the
 * client last saw of it unless the test names one (core-service-96). */
type Fields<T extends Command["type"]> = Omit<Extract<Command, { type: T }>, "type" | "id" | "instance"> & { instance?: string };

const NAMES_INSTANCE = new Set<string>(["draft.send", "draft.abort", "draft.source.write", "draft.compile", "draft.register", "draft.player.set", "draft.delete"]);

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  /** Each session as this client last read it: a state or a reply. */
  readonly known = new Map<string, DraftInfo>();
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(message);
      if (message.type === "draft.state") this.known.set(message.draft.id, message.draft);
      if (message.type === "reply" && message.ok) this.learn(message.result);
    });
  }

  private learn(result: unknown): void {
    const infos = Array.isArray(result) ? result : [(result as { draft?: unknown } | null)?.draft ?? result];
    for (const info of infos) {
      if (info && typeof info === "object" && "state" in info && "activity" in info && typeof (info as DraftInfo).id === "string") {
        this.known.set((info as DraftInfo).id, info as DraftInfo);
      }
    }
  }

  /** The instance the client last read for a session. */
  instance(id: string): string {
    const instance = this.known.get(id)?.instance;
    if (!instance) throw new Error(`no instance known for ${id}`);
    return instance;
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
    fields: Fields<T>,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    const named = fields as { draftId?: string; instance?: string; fileVersion?: string };
    let filled: Record<string, unknown> = { ...fields };
    if (NAMES_INSTANCE.has(type) && named.draftId && named.instance === undefined && named.fileVersion === undefined) {
      const known = this.known.get(named.draftId);
      if (known?.instance) filled = { ...filled, instance: known.instance };
      else if (type === "draft.delete" && known?.fileVersion) filled = { ...filled, fileVersion: known.fileVersion };
    }
    this.socket.send(JSON.stringify({ type, id, ...filled }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id, 120_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: Fields<T>,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }

  async expectError<T extends Command["type"]>(
    type: T,
    fields: Fields<T>,
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
  /** The project whose spex repository holds the authoring sessions. */
  projectId: string;
  /** That spex repository's clone (storage-1). */
  clone: string;
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

/** Pair the harness's working folder once; a restart finds it paired. */
async function pairedProject(port: number, path: string): Promise<string> {
  const client = new Client(port);
  await client.open();
  try {
    const listed = (await client.expectOk("project.list", {})).find((project) => realpathSync(project.path) === realpathSync(path));
    return listed?.id ?? (await client.expectOk("project.register", { path })).id;
  } finally {
    client.close();
  }
}

/** A git-initialized working folder beside the home. */
function workingFolder(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
    execFileSync("git", ["init", "--quiet", path]);
  }
  return path;
}

async function startHarness(options: { script: FakeScript; slc: string; dir?: string }): Promise<Harness> {
  const dir = options.dir ?? scratchDir("spex-authoring-it-");
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
    own: "tester",
    watchConfig: false,
    compileSpawner: probeSpawner(slcCalls),
  });
  // An authoring session belongs to a project paired on this device
  // (core-service-96): the harness pairs one working folder.
  const projectId = await pairedProject(service.port(), workingFolder(join(dir, "project")));
  const clone = join(dataDir, "workspace", ...projectId.split("/"));
  return { service, stats, dir, dataDir, configPath, projectId, clone, slcCalls };
}

/** An authoring session's files in its project's spex repository
 * (storage-23). */
function authoringFiles(clone: string, id: string): { record: string; records: string; assets: string } {
  return {
    record: join(clone, "authoring", `${id}.json`),
    records: join(clone, "authoring", `${id}.records.jsonl`),
    assets: join(clone, "authoring", `${id}.assets`),
  };
}

const SOURCE = AUTHORING_SOURCE.replaceAll("<id>", "triage");

/** Check the options captured from real authoring turns at Cligent's
 * native permission boundary; the scripted adapter alone accepts even
 * invalid absolute writable paths. No SDK or model call is needed. */
function assertAuthoringPermissions(runs: FakeAdapterStats["runs"], packageDir: string): void {
  assert.ok(runs.length > 0, "at least one authoring call reached the adapter");
  for (const run of runs) {
    assert.equal(run.cwd, packageDir, "all calls use the same package working directory");
    const policy = run.permissions as PermissionPolicy | undefined;
    assert.doesNotThrow(() => mapPermissionsToClaudeOptions(policy));
    assert.doesNotThrow(() => mapPermissionsToGeminiToolConfig(policy));
    assert.doesNotThrow(() => mapPermissionsToOpenCodeOptions(policy));
    // Cligent explicitly refuses Codex permission isolation on native
    // Windows; Spex app hosts are macOS and Linux (DR-049).
    if (process.platform !== "win32") {
      assert.doesNotThrow(() => mapPermissionsToCodexOptions(policy));
    }
    assert.deepEqual(policy, { mode: "auto" });
  }
}

// ---------------------------------------------------------------------------
// playbook-library-72: the happy path through registration
// ---------------------------------------------------------------------------

test("playbook-library-72: a draft is authored, compiled, proposed, and registered over the protocol", async () => {
  const harness = await startHarness({ script: authoringScript(), slc: stubSlcSource("['Triager', 'Verifier']") });
  const { stats, configPath, projectId, clone } = harness;
  const files = authoringFiles(clone, "triage");
  const client = new Client(harness.service.port());
  await client.open();
  const configBefore = readFileSync(configPath, "utf8");
  // The spec package under development stands in the project's working
  // folder, the source in its playbook artifact (environments-10).
  const draftDir = join(harness.dir, "project", "spex-packages", "triage");
  const artifactDir = join(draftDir, "playbooks", "en", "triage");

  // The channel exists once the draft does (core-service-96).
  const created = await client.expectOk("draft.create", { projectId, draftId: "triage" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
  assert.equal(created.state, "no-source");
  assert.equal(created.activity, "idle");
  assert.equal(created.player, null);
  assert.equal(created.agent.adapter, "claude");
  assert.equal(created.projectId, projectId);
  assert.equal(created.enabled, false);
  assert.equal(created.package, "local/triage");
  assert.equal(created.packagePath, "spex-packages/triage");
  assert.equal(created.sourcePath, "spex-packages/triage/playbooks/en/triage/triage.md");
  assert.ok(existsSync(draftDir), "the spec package folder is made");
  // playbook-library-70: its manifest names one playbook in en, 0.1.0.
  const meta = parseYaml(readFileSync(join(draftDir, "meta.yaml"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(meta, {
    format: 2, org: "local", name: "triage", version: "0.1.0", description: "The triage playbook",
    artifacts: { triage: { kind: "playbook", language: "en" } },
  });
  // storage-23: the record lands in the project's spex repository.
  const record = JSON.parse(readFileSync(files.record, "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(record).sort(), ["createdAt", "failures", "format", "id", "instance", "package", "queued", "touchedAt"]);
  assert.equal(record.format, 1);
  assert.equal(record.id, "triage");
  assert.equal(record.package, "spex-packages/triage");
  assert.deepEqual(record.queued, []);
  assert.equal(record.failures, 0);
  // An id a configured playbook, a built-in, or a draft holds is refused.
  await client.expectError("draft.create", { projectId, draftId: "code" }, "invalid_request");
  await client.expectError("draft.create", { projectId, draftId: "decide" }, "invalid_request");
  await client.expectError("draft.create", { projectId, draftId: "triage" }, "conflict");

  const sent = await client.expectOk("draft.send", { projectId, draftId: "triage", text: "I want a playbook that triages new issues into labels." });
  assert.deepEqual(sent, { accepted: true, queued: false });
  await until(() => {
    const draft = client.latest("triage");
    return draft?.activity === "idle" && draft.proposal !== undefined;
  }, 120_000, "the proposal");

  // playbook-library-64: the fake ran in the spec package's folder with
  // `{ mode: "auto" }` with no extra writable paths, no tool lists,
  // no resume. Both the initial chat and the proposal turn must pass
  // the real adapters' permission mapping.
  assertAuthoringPermissions(stats.runs, draftDir);
  const first = stats.runs[0];
  assert.equal(first.allowedTools, undefined);
  assert.equal(first.disallowedTools, undefined);
  assert.equal(first.resume, undefined);
  assert.equal(first.model, "claude-test");
  // playbook-library-65: the prompt carried the source path, the four
  // documents, and both directive kinds.
  assert.ok(first.prompt.includes(join(artifactDir, "triage.md")), "the source path");
  assert.ok(first.prompt.includes(join(draftDir, "meta.yaml")), "the manifest the description lives in");
  for (const document of authoringDocuments()) assert.ok(first.prompt.includes(document.path), document.path);
  assert.match(first.prompt, /kind: compile/);
  assert.match(first.prompt, /kind: register/);
  assert.match(first.prompt, /Boss: I want a playbook that triages/);
  assert.match(first.prompt, /Before work begins, ensure the current directory/);
  assert.match(first.prompt, /A source the Boss placed may be a SKILL\.md/);
  // DR-088: slc's link gives each outcome one repository disposition.
  assert.match(first.prompt, /Each outcome has exactly one repository effect/);

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
  assert.match(success.prompt, /The compile of triage succeeded; the roles are Triager, Verifier\. Propose enabling in a register block/);
  assert.match(success.prompt, /^Spex: /m);
  assert.ok(success.resume, "the success turn continued the provider conversation");
  assert.doesNotMatch(success.prompt, /You are helping the Boss/);
  assert.equal(client.turnStarts("triage")[1], "Spex: the compile succeeded — asking for a registration proposal");
  assert.deepEqual(compiled.proposal, {
    command: "triage",
    intent: "Triage a new issue into the repository's labels",
    players: { Triager: "dev.triager", Verifier: "dev.coder" },
  });

  const artifacts = await client.expectOk("draft.artifacts", { projectId, draftId: "triage" });
  assert.ok(artifacts.gears && artifacts.fsm, "the compiled stages serve");
  assert.ok(artifacts.stateIds?.includes("ready"));

  // playbook-library-69/70: enabling requests the spec package by path
  // from the project's environment and installs it, writes the new
  // player to your own roster first, then the project's entry keyed by
  // the derived roles, no `from`; the session stays, enabled.
  const projectConfig = join(clone, "config", "playbook.config.yaml");
  const state = await client.expectOk("draft.register", {
    projectId,
    draftId: "triage",
    command: "triage",
    intent: "Label new issues",
    bindings: { Triager: "dev.triager", Verifier: "dev.coder" },
    newPlayers: { "dev.triager": { adapter: "claude" } },
  });
  assert.equal(state.status, "valid");
  const requests = parseYaml(readFileSync(join(clone, "spex.yaml"), "utf8")) as { packages: Record<string, unknown> };
  assert.deepEqual(requests.packages["local/triage"], { path: "spex-packages/triage" });
  const lock = parseYaml(readFileSync(join(clone, "spex.lock"), "utf8")) as { packages: Record<string, { exports: Record<string, string>; source: Record<string, unknown> }> };
  assert.deepEqual(lock.packages["local/triage"]?.exports, { triage: "triage" });
  assert.equal(lock.packages["local/triage"]?.source.path, "spex-packages/triage");
  const own = parseYaml(readFileSync(configPath, "utf8")) as { players: Record<string, unknown>; playbooks: Record<string, unknown> };
  assert.deepEqual(own.players["dev.triager"], { adapter: "claude" }, "the new player joins your own roster");
  assert.equal(own.playbooks.triage, undefined, "your own group's config is not the one enabling it");
  const entry = (parseYaml(readFileSync(projectConfig, "utf8")) as { playbooks: Record<string, unknown> }).playbooks.triage;
  assert.deepEqual(entry, { roles: { Triager: "dev.triager", Verifier: "dev.coder" } });
  const wrapper = readFileSync(join(artifactDir, "triage.registry.ts"), "utf8");
  assert.match(wrapper, /command: "triage"/);
  assert.match(wrapper, /intent: "Label new issues"/);
  // The session reads enabled and stays (playbook-library-61), its
  // files where they were.
  await until(() => client.latest("triage")?.enabled === true, 10_000, "the enabled session");
  const listed = await client.expectOk("draft.list", {});
  assert.deepEqual(listed.map((draft) => [draft.id, draft.enabled]), [["triage", true]]);
  assert.ok(!client.messages.some((m) => m.type === "draft.removed"), "nothing retires the session");
  for (const path of [files.record, files.records]) assert.ok(existsSync(path), `${path} stays`);
  // The playbook is listed from the project's environment, enabled there.
  const playbooks = await client.expectOk("environment.playbooks", { projectId });
  const triage = playbooks.project?.find((row) => row.id === "triage");
  assert.ok(triage, "the project's environment exports it");
  assert.deepEqual([triage.command, triage.intent, triage.roles, triage.source, triage.package, triage.version, triage.enabled],
    ["triage", "Label new issues", ["Triager", "Verifier"], "path", "local/triage", "0.1.0", ["project"]]);
  assert.equal(client.latest("triage")?.state, "enabled");

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
  const { stats, configPath, projectId, clone } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  const configBefore = readFileSync(configPath, "utf8");
  await client.expectOk("draft.create", { projectId, draftId: "triage" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
  await client.expectOk("draft.source.write", { projectId, draftId: "triage", content: SOURCE });
  const failedCompiles = () => {
    const all = client.states("triage").filter((d) => d.compile?.outcome === "failed").map((d) => d.compile!);
    return all.filter((c, index) => index === 0 || c.at !== all[index - 1].at);
  };

  const boss = await client.expectError("draft.compile", { projectId, draftId: "triage" }, "invalid_request");
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
  const stored = JSON.parse(readFileSync(authoringFiles(clone, "triage").record, "utf8")) as { compile: { relay?: string } };
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
  const reset = await client.expectOk("draft.send", { projectId, draftId: "triage", text: "Ask me what you need, then compile again." });
  assert.equal(reset.queued, false);
  await until(() => client.statusLines("triage").filter((l) => l.startsWith("◇ Compiling")).length >= 5, 120_000, "the fifth compile");
  const queued = await client.expectOk("draft.send", { projectId, draftId: "triage", text: "Also cite the label definitions." });
  assert.equal(queued.queued, true);
  assert.deepEqual(client.latest("triage")?.queued, [{text: "Also cite the label definitions."}]);
  await until(() => {
    const draft = client.latest("triage");
    return draft?.activity === "idle" && draft.state === "compiled" && draft.proposal !== undefined;
  }, 120_000, "the final compile");

  // runs: relay, relay, Boss, relay with questions, prefaced Boss, success.
  assert.equal(stats.runs.length, 6);
  assertAuthoringPermissions(stats.runs, join(harness.dir, "project", "spex-packages", "triage"));
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

test("playbook-library-74: messages queue behind a turn or compile; every other command is admitted beside them", async () => {
  const harness = await startHarness({ script: IN_FLIGHT, slc: stubSlcBlockingSource("['Helper']") });
  const { projectId } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  await client.expectOk("draft.create", { projectId, draftId: "matrix" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "matrix" } });
  const instance = client.instance("matrix");
  const blocking = () => client.progress("matrix").filter((line) => line.startsWith("→ gears2fsm")).length;

  // During a turn: the message queues; the rest is admitted beside it.
  assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "matrix", text: "start" }), { accepted: true, queued: false });
  await until(() => client.latest("matrix")?.activity === "turn", 10_000, "the turn");
  assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "matrix", text: "second" }), { accepted: true, queued: true });
  assert.deepEqual(client.latest("matrix")?.queued, [{text: "second"}]);
  await client.expectOk("draft.source.write", { projectId, draftId: "matrix", content: "# Matrix\n\nRoles:\n\n- Helper\n" });
  await client.expectOk("draft.player.set", { projectId, draftId: "matrix", playerId: "dev.coder" });
  const first = client.command("draft.compile", { projectId, draftId: "matrix" });
  await until(() => blocking() === 1, 20_000, "the compile beside the turn");
  assert.equal(client.latest("matrix")?.activity, "turn");
  assert.deepEqual(await client.expectOk("draft.abort", { projectId, draftId: "matrix" }), { aborted: true });
  await until(() => client.records("matrix").some((m) => m.record.type === "turn_aborted" && m.record.turnId === 1), 10_000, "turn 1 aborted");

  // During a compile: the queue waits for it; a second compile runs too.
  await until(() => client.latest("matrix")?.activity === "compiling", 10_000, "compiling");
  assert.ok(!client.turnStarts("matrix").includes("second"), "the queue waits for the compile");
  const second = client.command("draft.compile", { projectId, draftId: "matrix" });
  await until(() => blocking() === 2, 20_000, "two compiles at once");
  assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "matrix", text: "third" }), { accepted: true, queued: true });
  assert.deepEqual(client.latest("matrix")?.queued, [{text: "second"}, {text: "third"}]);
  assert.deepEqual(await client.expectOk("draft.abort", { projectId, draftId: "matrix" }), { aborted: false });
  // One Cancel naming the session ends both.
  await client.expectOk("compile.abort", { playbookId: "matrix", instance });
  for (const reply of await Promise.all([first, second])) assert.ok(!reply.ok && reply.error.code === "aborted");
  await until(() => client.latest("matrix")?.compile?.outcome === "canceled", 10_000, "canceled");
  await sleep(100);
  assert.equal(client.progress("matrix").at(-1), "◇ compile canceled");
  assert.ok(client.statusLines("matrix").includes("◇ Compile canceled"));
  // No relay: the queued Boss messages go, in order.
  await until(() => client.turnStarts("matrix").includes("second"), 10_000, "the first queued message");
  assert.deepEqual(await client.expectOk("draft.abort", { projectId, draftId: "matrix" }), { aborted: true });
  await until(() => client.turnStarts("matrix").includes("third"), 10_000, "the second queued message");
  assert.deepEqual(client.turnStarts("matrix"), ["start", "second", "third"]);
  assert.equal(client.latest("matrix")?.state, "draft");
  await client.expectOk("draft.abort", { projectId, draftId: "matrix" });
  await until(() => client.latest("matrix")?.activity === "idle", 10_000, "idle again");
  assert.deepEqual(client.latest("matrix")?.queued, []);

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
  const { dir, dataDir, projectId, clone } = first;
  const files = authoringFiles(clone, "persist");
  const prefsFile = join(dataDir, "local", "prefs.json");
  const client = new Client(first.service.port());
  await client.open();
  await client.expectOk("draft.create", { projectId, draftId: "persist" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "persist" } });

  const idle = async (c: Client, n: number) => until(() => c.latest("persist")?.activity === "idle" && c.records("persist").filter((m) => m.record.type === "turn_finished").length >= n, 20_000, `turn ${n}`);
  await client.expectOk("draft.send", { projectId, draftId: "persist", text: "hello" });
  await idle(client, 1);
  await client.expectOk("draft.send", { projectId, draftId: "persist", text: "reject" });
  await idle(client, 2);
  await client.expectOk("draft.send", { projectId, draftId: "persist", text: "again" });
  await idle(client, 3);
  const runs = first.stats.runs;
  assert.equal(runs.length, 4);
  assertAuthoringPermissions(runs, join(dir, "project", "spex-packages", "persist"));
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
  await client.expectOk("draft.source.write", { projectId, draftId: "persist", content: "# Persist\n\nRoles:\n\n- Helper\n" });
  const compiling = client.command("draft.compile", { projectId, draftId: "persist" });
  await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "persist" && m.line.startsWith("→ gears2fsm"), 20_000);
  const seqBefore = client.records("persist").at(-1)?.seq ?? 0;
  // The core's stop cancels the compiler it started, and its reply says
  // so, while the marker stays as it was for the next start to read.
  const stopping = first.service.stop();
  const cut = await compiling;
  assert.ok(!cut.ok && cut.error.code === "aborted", "the stop cancels the compile");
  await stopping;
  client.close();
  const stored = JSON.parse(readFileSync(files.record, "utf8")) as { compile: { outcome: string } };
  assert.equal(stored.compile.outcome, "running", "the stop leaves the compile as it was");

  // playbook-library-70: the restart reads it as interrupted, relays nothing.
  const second = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']"), dir });
  const client2 = new Client(second.service.port());
  await client2.open();
  await client2.expectOk("subscribe", { channel: { kind: "draft", draftId: "persist" } });
  const opened = await client2.expectOk("draft.open", { projectId, draftId: "persist" });
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
  await client2.expectOk("draft.send", { projectId, draftId: "persist", text: "back" });
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
  const switched = await client2.expectOk("draft.player.set", { projectId, draftId: "persist", playerId: "dev.reviewer" });
  assert.equal(switched.player, "dev.reviewer");
  assert.equal(switched.agent.adapter, "codex");
  assert.equal(switched.agent.model, "codex-test");
  // The choice is the session's, kept under its instance (storage-5).
  const playerPref = `authoring:${client2.instance("persist")}:player`;
  const prefs = JSON.parse(readFileSync(prefsFile, "utf8")) as { prefs: Record<string, unknown> };
  assert.equal(prefs.prefs[playerPref], "dev.reviewer");
  assert.ok(client2.statusLines("persist").includes("◇ Now answering: dev.reviewer — the conversation so far was replayed to it"));
  await client2.expectError("draft.player.set", { projectId, draftId: "persist", playerId: "dev.nobody" }, "invalid_request");
  await client2.expectOk("draft.send", { projectId, draftId: "persist", text: "switch" });
  await idle(client2, 2);
  const onReviewer = second.stats.runs[1];
  assertAuthoringPermissions(second.stats.runs, join(dir, "project", "spex-packages", "persist"));
  assert.equal(onReviewer.resume, undefined, "a switched agent starts fresh");
  assert.equal(onReviewer.model, "codex-test");
  assert.match(onReviewer.prompt, /Conversation so far:/);
  assert.match(onReviewer.prompt, /answering as dev\.reviewer/);
  const unswitched = await client2.expectOk("draft.player.set", { projectId, draftId: "persist", playerId: null });
  assert.equal(unswitched.player, null);
  assert.equal(JSON.parse(readFileSync(prefsFile, "utf8")).prefs[playerPref], undefined);

  // playbook-library-70: a transcript damaged behind the core's back
  // blocks the draft alone — it opens with its source and a diagnostic,
  // its records withheld, and refuses a message; nothing appends after
  // the damage, and nothing runs.
  await client2.expectOk("draft.player.set", { projectId, draftId: "persist", playerId: "dev.reviewer" });
  client2.close();
  await second.service.stop();
  appendFileSync(files.records, '{"seq":999,"record":{"type":"junk"}}\n{not json');
  const third = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']"), dir });
  const client3 = new Client(third.service.port());
  await client3.open();
  const damaged = await client3.expectOk("draft.open", { projectId, draftId: "persist" });
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
  const refused = await client3.expectError("draft.send", { projectId, draftId: "persist", text: "hello?" }, "invalid_request");
  assert.match(refused.message, /damaged transcript/);
  await client3.expectError("draft.compile", { projectId, draftId: "persist" }, "invalid_request");
  await client3.expectError("draft.source.write", { projectId, draftId: "persist", content: "# Again\n" }, "invalid_request");
  assert.equal(third.stats.runs.length, 0, "nothing ran on a damaged draft");
  const transcript = readFileSync(files.records, "utf8");
  assert.ok(transcript.endsWith("{not json"), "nothing was appended after the damage");

  // playbook-library-63/70: delete removes the record, the transcript and
  // the preference, and leaves the spec package folder.
  assert.equal(await client3.expectOk("draft.delete", { projectId, draftId: "persist" }), null);
  await client3.waitFor((m) => m.type === "draft.removed" && m.draftId === "persist" && m.projectId === projectId);
  for (const path of Object.values(files)) assert.ok(!existsSync(path), `${path} is gone`);
  assert.ok(existsSync(join(dir, "project", "spex-packages", "persist", "playbooks", "en", "persist", "persist.md")), "the spec package folder stays");
  assert.equal(JSON.parse(readFileSync(prefsFile, "utf8")).prefs[playerPref], undefined);
  assert.deepEqual(await client3.expectOk("draft.list", {}), []);
  await client3.expectError("draft.open", { projectId, draftId: "persist" }, "not_found");

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
  const { projectId } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  await client.expectOk("draft.create", { projectId, draftId: "triage" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
  await client.expectOk("draft.source.write", { projectId, draftId: "triage", content: SOURCE });
  const compiled = await client.expectOk("draft.compile", { projectId, draftId: "triage" });
  assert.deepEqual(compiled, { ok: true, roles: ["Triager", "Verifier"] });
  // The success turn runs (the fallback answers it) before the matrix.
  await until(() => client.latest("triage")?.activity === "idle" && harness.stats.runs.length === 1, 60_000, "the success turn");

  await client.expectOk("draft.send", { projectId, draftId: "triage", text: "matrix" });
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

  await client.expectOk("draft.send", { projectId, draftId: "triage", text: "next" });
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
  const { projectId, clone } = harness;
  const a = new Client(harness.service.port());
  const b = new Client(harness.service.port());
  await a.open();
  await b.open();
  const other = (await a.expectOk("project.register", { path: workingFolder(join(harness.dir, "other")) })).id;

  // not_found for an unknown draft, on every command — the channel
  // subscription included.
  const GHOST = randomUUID();
  await a.expectError("subscribe", { channel: { kind: "draft", draftId: "ghost" } }, "not_found");
  await a.expectError("draft.open", { projectId, draftId: "ghost" }, "not_found");
  await a.expectError("draft.send", { projectId, draftId: "ghost", instance: GHOST, text: "x" }, "not_found");
  await a.expectError("draft.abort", { projectId, draftId: "ghost", instance: GHOST }, "not_found");
  await a.expectError("draft.source.write", { projectId, draftId: "ghost", instance: GHOST, content: "x" }, "not_found");
  await a.expectError("draft.compile", { projectId, draftId: "ghost", instance: GHOST }, "not_found");
  await a.expectError("draft.register", { projectId, draftId: "ghost", instance: GHOST, command: "g", intent: "g", bindings: {} }, "not_found");
  await a.expectError("draft.player.set", { projectId, draftId: "ghost", instance: GHOST, playerId: null }, "not_found");
  await a.expectError("draft.delete", { projectId, draftId: "ghost", instance: GHOST }, "not_found");
  await a.expectError("draft.artifacts", { projectId, draftId: "ghost" }, "not_found");
  // invalid_request for a reserved id, and for a project with no
  // working folder on this device.
  await a.expectError("draft.create", { projectId, draftId: "review" }, "invalid_request");
  await a.expectError("draft.create", { projectId, draftId: "dev" }, "invalid_request");
  await a.expectError("draft.create", { projectId: "tester/elsewhere-spex", draftId: "iso" }, "invalid_request");

  await a.expectOk("draft.create", { projectId, draftId: "iso" });
  // The session's files land in the project's clone (storage-23); its
  // id is the home's, so another project neither takes it nor reaches it.
  assert.ok(existsSync(authoringFiles(clone, "iso").record), "the record is in the project's clone");
  await a.expectError("draft.create", { projectId: other, draftId: "iso" }, "invalid_request");
  await a.expectError("draft.open", { projectId: other, draftId: "iso" }, "not_found");
  await a.expectOk("subscribe", { channel: { kind: "draft", draftId: "iso" } });
  await b.waitFor((m) => m.type === "draft.state" && m.draft.id === "iso");

  // A malformed draft command is rejected with no state change.
  const statesBefore = a.states("iso").length;
  a.sendRaw(JSON.stringify({ type: "draft.send", id: "bad-1", projectId, draftId: "Not Valid", text: "x" }));
  const rejected = await a.waitFor((m) => m.type === "reply" && m.id === "bad-1");
  assert.ok(rejected.type === "reply" && !rejected.ok && rejected.error.code === "invalid_message");
  a.sendRaw(JSON.stringify({ type: "draft.source.write", id: "bad-2", projectId, draftId: "iso", instance: a.instance("iso") }));
  const noSource = await a.waitFor((m) => m.type === "reply" && m.id === "bad-2");
  assert.ok(noSource.type === "reply" && !noSource.ok && noSource.error.code === "invalid_request");
  await sleep(50);
  assert.equal(a.states("iso").length, statesBefore);

  // invalid_request before a successful compile; conflict on a stale version.
  await a.expectError("draft.register", { projectId, draftId: "iso", command: "iso", intent: "x", bindings: {} }, "invalid_request");
  await a.expectError("draft.source.write", { projectId, draftId: "iso", content: "   " }, "invalid_request");
  const written = await a.expectOk("draft.source.write", { projectId, draftId: "iso", content: "# Iso\n\nRoles:\n\n- Helper\n" });
  assert.equal(written.version.length, 16);
  await a.expectError("draft.source.write", { projectId, draftId: "iso", content: "# Iso 2\n", baseVersion: "0000000000000000" }, "conflict");
  const again = await a.expectOk("draft.source.write", { projectId, draftId: "iso", content: "# Iso 2\n\nRoles:\n\n- Helper\n", baseVersion: written.version });
  assert.notEqual(again.version, written.version);
  assert.ok(a.messages.some((m) => m.type === "draft.source" && m.draftId === "iso" && m.markdown.startsWith("# Iso 2")));

  // The activity table during a turn; records reach the subscriber only.
  await a.expectOk("draft.send", { projectId, draftId: "iso", text: "go" });
  await until(() => a.records("iso").some((m) => m.record.type === "player_prompt"), 10_000, "the prompt record");
  assert.deepEqual(await a.expectOk("draft.send", { projectId, draftId: "iso", text: "queued" }), { accepted: true, queued: true });
  // Every other command is admitted beside the turn.
  await a.expectOk("draft.source.write", { projectId, draftId: "iso", content: "# Iso 3\n\nRoles:\n\n- Helper\n" });
  assert.deepEqual(await a.expectOk("draft.abort", { projectId, draftId: "iso" }), { aborted: true });
  await until(() => a.turnStarts("iso").includes("queued"), 10_000, "the queued turn");
  assert.deepEqual(await a.expectOk("draft.abort", { projectId, draftId: "iso" }), { aborted: true });
  await until(() => a.latest("iso")?.activity === "idle", 10_000, "idle");
  assert.ok(a.records("iso").length > 0);
  const stored = readFileSync(authoringFiles(clone, "iso").records, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { seq: number });
  assert.deepEqual(stored.map((line) => line.seq), a.records("iso").map((m) => m.seq), "the transcript lands in the project's clone");
  assert.equal(b.records("iso").length, 0, "records reach the draft channel's subscribers only");
  assert.ok(b.states("iso").length > 0, "state reaches every client");
  const seqs = a.records("iso").map((m) => m.seq);
  assert.deepEqual(seqs, seqs.map((_s, index) => index + 1), "records arrive in sequence");
  assert.ok(!a.messages.some((m) => m.type === "record"), "draft records never ride the session channel");

  // The activity table during a compile.
  const compiling = a.command("draft.compile", { projectId, draftId: "iso" });
  await a.waitFor((m) => m.type === "compile.progress" && m.playbookId === "iso" && m.line.startsWith("→ gears2fsm"), 20_000);
  assert.deepEqual(await a.expectOk("draft.send", { projectId, draftId: "iso", text: "later" }), { accepted: true, queued: true });
  // And beside the compile.
  await a.expectOk("draft.source.write", { projectId, draftId: "iso", content: "# Iso 4\n\nRoles:\n\n- Helper\n" });
  assert.deepEqual(await a.expectOk("draft.abort", { projectId, draftId: "iso" }), { aborted: false });
  // A cancel naming no session reaches no session's compile.
  await a.expectError("compile.abort", { playbookId: "iso" }, "not_found");
  await a.expectOk("compile.abort", { playbookId: "iso", instance: a.instance("iso") });
  const reply = await compiling;
  assert.ok(!reply.ok && reply.error.code === "aborted");
  await until(() => a.turnStarts("iso").includes("later"), 10_000, "the message queued during the compile");
  await a.expectOk("draft.abort", { projectId, draftId: "iso" });
  await until(() => a.latest("iso")?.activity === "idle", 10_000, "idle at the end");

  // draft.state followed every transition.
  const activities = a.states("iso").map((d) => d.activity).filter((v, i, all) => i === 0 || v !== all[i - 1]);
  assert.deepEqual(activities, ["idle", "turn", "idle", "turn", "idle", "compiling", "idle", "turn", "idle"]);
  const queueSizes = a.states("iso").map((d) => d.queued.length);
  assert.ok(queueSizes.includes(1) && queueSizes.at(-1) === 0, "the queue's changes were published");
  const chips = a.states("iso").map((d) => d.state).filter((v, i, all) => i === 0 || v !== all[i - 1]);
  assert.deepEqual(chips.slice(0, 2), ["no-source", "draft"]);
  assert.ok(chips.includes("compiling"));

  // A session made again under its id is another session: a command
  // naming the former instance is a conflict.
  const former = a.instance("iso");
  await a.expectOk("draft.delete", { projectId, draftId: "iso" });
  const successor = await a.expectOk("draft.create", { projectId, draftId: "iso" });
  assert.notEqual(successor.instance, former);
  await a.expectError("draft.send", { projectId, draftId: "iso", instance: former, text: "late" }, "conflict");
  await a.expectError("draft.delete", { projectId, draftId: "iso", instance: former }, "conflict");
  // Its compile is its own: progress names the successor, and a cancel
  // naming the former instance reaches nothing.
  await a.expectOk("draft.source.write", { projectId, draftId: "iso", content: "# Iso\n\nRoles:\n\n- Helper\n" });
  const running = () => a.messages.filter((m) => m.type === "compile.progress" && m.playbookId === "iso" && m.instance === successor.instance && m.line.startsWith("→ gears2fsm")).length;
  const successorCompiles = [a.command("draft.compile", { projectId, draftId: "iso" })];
  await until(() => running() === 1, 20_000, "the successor's compile");
  successorCompiles.push(a.command("draft.compile", { projectId, draftId: "iso" }));
  await until(() => running() === 2, 20_000, "two compiles of one session at once");
  await a.expectError("compile.abort", { playbookId: "iso", instance: former }, "not_found");
  assert.equal(a.latest("iso")?.activity, "compiling");
  await a.expectOk("compile.abort", { playbookId: "iso", instance: successor.instance });
  for (const canceled of await Promise.all(successorCompiles)) assert.ok(!canceled.ok && canceled.error.code === "aborted");
  await a.waitFor((m) => m.type === "compile.progress" && m.playbookId === "iso" && m.instance === successor.instance && m.line === "◇ compile canceled");

  a.close();
  b.close();
  await harness.service.stop();
});


test("draft media preserves file-only input, native bytes, owned output and text-only later turns", {timeout: 30_000}, async () => {
  const image = Buffer.from("real owned fixture image bytes");
  const output = Buffer.from("native screenshot bytes");
  const largeTool = {observations: "seen ".repeat(1600)};
  const harness = await startHarness({script: {fallback: {
    result: "Observed the attached interface.",
    media: [{mimeType: "image/png", source: {type: "base64", data: output.toString("base64")}, name: "screen.png", toolUseId: "screenshot-1"}],
    tools: [{toolName: "inspect", input: {}, output: largeTool}],
  }}, slc: stubSlcSource("['Inspector']")});
  let client = new Client(harness.service.port());
  try {
    await client.open();
    const {projectId, clone} = harness;
    const files = authoringFiles(clone, "visual");
    await client.expectOk("draft.create", {projectId, draftId: "visual"});
    await client.expectOk("subscribe", {channel: {kind: "draft", draftId: "visual"}});
    const owner = {kind: "draft" as const, projectId, id: "visual", instance: client.instance("visual")};
    const uploadId = randomUUID();
    await client.expectOk("media.begin", {owner, uploadId, name: "selected.png", mimeType: "image/png", byteLength: image.length});
    await client.expectOk("media.chunk", {uploadId, offset: 0, data: image.toString("base64")});
    const {asset} = await client.expectOk("media.finish", {uploadId});
    await client.expectOk("draft.send", {projectId, draftId: "visual", text: "", attachments: [asset]});
    await until(() => client.records("visual").some(({record}) => record.type === "turn_finished"), 10_000);
    const native = harness.stats.runs[0].attachments;
    assert.equal(native?.length, 1);
    assert.deepEqual(readFileSync(native![0].path), image);
    assert.equal(native![0].mimeType, "image/png");
    const start = client.records("visual").find(({record}) => record.type === "turn_started")!.record;
    assert.equal(start.type, "turn_started");
    if (start.type === "turn_started") { assert.equal(start.turn.prompt, ""); assert.deepEqual(start.turn.attachments, [asset]); }
    // media-4: the input and the captured output are kept beside the session's file.
    assert.deepEqual(readFileSync(join(files.assets, createHash("sha256").update(image).digest("hex"))), image);
    assert.deepEqual(readFileSync(join(files.assets, createHash("sha256").update(output).digest("hex"))), output);
    const transcript = readFileSync(files.records, "utf8");
    assert.ok(!transcript.includes(output.toString("base64")));
    assert.ok(!transcript.includes(largeTool.observations));
    const media = client.records("visual").find(({record}) => record.type === "player_event" && record.event.type === "media")!.record;
    if (media.type !== "player_event" || media.event.type !== "media" || media.event.payload.source.type !== "uri") throw new Error("missing owned media");
    const mediaId = media.event.payload.source.uri.slice("playbook-asset:".length) as typeof asset.assetId;
    const captured = await client.expectOk("media.read", {owner, assetId: mediaId, offset: 0, length: 65536});
    assert.deepEqual(Buffer.from(captured.data, "base64"), output);
    await client.expectOk("draft.send", {projectId, draftId: "visual", text: "Thanks"});
    await until(() => harness.stats.runs.length === 2 && client.latest("visual")?.activity === "idle", 10_000);
    assert.equal(harness.stats.runs[1].attachments, undefined);
    client.close();
    await harness.service.stop();
    const next = await startHarness({dir: harness.dir, script: {fallback: {result: "Reopened"}}, slc: stubSlcSource("['Inspector']")});
    harness.service = next.service;
    client = new Client(next.service.port());
    await client.open();
    const reopened = await client.expectOk("draft.open", {projectId, draftId: "visual"});
    assert.ok(JSON.stringify(reopened).includes(asset.assetId));
    const retained = await client.expectOk("media.read", {owner, assetId: asset.assetId, offset: 0, length: 65536});
    assert.deepEqual(Buffer.from(retained.data, "base64"), image);
  } finally { client.close(); await harness.service.stop(); }
});

test("media-18: an authoring turn's output whose session was replaced while it was prepared is refused, the successor untouched", {timeout: 30_000}, async () => {
  const output = Buffer.from("native screenshot bytes of the former session");
  const harness = await startHarness({script: {fallback: {
    result: "Observed.",
    media: [{mimeType: "image/png", source: {type: "base64", data: output.toString("base64")}, name: "screen.png", toolUseId: "screenshot-1"}],
  }}, slc: stubSlcSource("['Inspector']")});
  // The core's own private publication, held once its content is prepared.
  const media = (harness.service as unknown as {media: ApplicationMedia}).media;
  const importInto = media.importInto;
  let entered!: () => void;
  const prepared = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let publication: Promise<unknown> | undefined;
  media.importInto = (prepare, place) => {
    if (publication) return importInto.call(media, prepare, place);
    const result = importInto.call(media, async (stage) => { const reference = await prepare(stage); entered(); await held; return reference; }, place);
    publication = result;
    return result;
  };
  const client = new Client(harness.service.port());
  try {
    await client.open();
    const {projectId, clone} = harness;
    const files = authoringFiles(clone, "replaced");
    await client.expectOk("draft.create", {projectId, draftId: "replaced"});
    await client.expectOk("subscribe", {channel: {kind: "draft", draftId: "replaced"}});
    const former = client.instance("replaced");
    await client.expectOk("draft.send", {projectId, draftId: "replaced", text: "Look"});
    await prepared;
    // The session is deleted and made again under its id while the
    // former's output stands prepared.
    await client.expectOk("draft.delete", {projectId, draftId: "replaced", instance: former});
    const successor = (await client.expectOk("draft.create", {projectId, draftId: "replaced"})).instance!;
    assert.notEqual(successor, former);
    release();
    const refused = await publication!.then(() => undefined, (error: unknown) => error);
    assert.ok(refused instanceof DraftChangedError && !refused.gone, String(refused));
    assert.ok(!existsSync(join(files.assets, createHash("sha256").update(output).digest("hex"))), "nothing lands in the successor");
    assert.deepEqual(readdirSync(join(harness.dataDir, "local", "asset-staging")), [], "the private stage is gone");
    client.close();
    await harness.service.stop();
    // The former run's later records reach no file of the successor.
    assert.ok(!existsSync(files.records) || !readFileSync(files.records, "utf8").includes("\"media\""));
  } finally { media.importInto = importInto; client.close(); await harness.service.stop(); }
});

// ---------------------------------------------------------------------------
// playbook-library-96: files changed beside the core, read at each use
// ---------------------------------------------------------------------------

test("playbook-library-96: the authoring store reads its files at use and writes under the version it read", {timeout: 120_000}, async () => {
  const script: FakeScript = { fallback: { deltas: ["Noted."], result: "Noted." } };
  // Every compile holds in its first phase until the test releases it.
  const harness = await startHarness({ script, slc: stubSlcScriptedSource(["ok"], "['Helper']", { hold: true }) });
  const { dir, projectId, clone, dataDir } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  const artifactDir = (id: string) => join(dir, "project", "spex-packages", id, "playbooks", "en", id);
  const held = (id: string) => client.waitFor((m) => m.type === "compile.progress" && m.playbookId === id && m.line.startsWith("→ normalize"), 20_000);
  const release = (id: string) => writeFileSync(join(artifactDir(id), STUB_SLC_RELEASE_FILE), "");
  const turnsDone = (id: string, n: number) => until(() => client.latest(id)?.activity === "idle" && client.records(id).filter((m) => m.record.type === "turn_finished").length >= n, 20_000, `${id} turn ${n}`);
  const SRC = "# Held\n\nRoles:\n\n- Helper\n";

  // A transcript replaced under the same instance: served whole, the
  // next record after its last, the next turn reseeded with no resume.
  await client.expectOk("draft.create", { projectId, draftId: "hist" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "hist" } });
  await client.expectOk("draft.send", { projectId, draftId: "hist", text: "hello" });
  await turnsDone("hist", 1);
  const hist = authoringFiles(clone, "hist");
  const original = readFileSync(hist.records, "utf8");
  // Another writer's history: the Boss's words differ, and one record more.
  const lines = original.trimEnd().split("\n").length;
  const replaced = `${original.replaceAll('"prompt":"hello"', '"prompt":"rewritten"')}${JSON.stringify({ seq: lines + 1, record: { type: "captain_status", turnId: null, timestamp: 1, message: "◇ elsewhere" } })}\n`;
  assert.notEqual(replaced, original);
  const count = lines + 1;
  writeFileSync(hist.records, replaced);
  const reopened = await client.expectOk("draft.open", { projectId, draftId: "hist" });
  assert.equal(reopened.records.length, count, "the replacement served whole");
  assert.equal(reopened.records.find((r) => r.record.type === "turn_started")?.record.type === "turn_started" &&
    (reopened.records.find((r) => r.record.type === "turn_started")!.record as { turn: { prompt: string } }).turn.prompt, "rewritten");
  await client.expectOk("draft.send", { projectId, draftId: "hist", text: "next" });
  await turnsDone("hist", 2);
  const next = client.records("hist").find((m) => m.record.type === "turn_started" && (m.record as { turn: { prompt: string } }).turn.prompt === "next");
  assert.equal(next?.seq, count + 1, "numbered after the replacement's last record");
  assert.equal(harness.stats.runs[1].resume, undefined, "the replaced history drops the resume");
  assert.match(harness.stats.runs[1].prompt, /Conversation so far:\nBoss: rewritten\nAgent: Noted\./);

  // A damaged transcript repaired while the core runs takes a message.
  const good = readFileSync(hist.records);
  appendFileSync(hist.records, "{not json");
  assert.match((await client.expectError("draft.send", { projectId, draftId: "hist", text: "x" }, "invalid_request")).message, /damaged transcript/);
  writeFileSync(hist.records, good);
  await client.expectOk("draft.send", { projectId, draftId: "hist", text: "repaired" });
  await turnsDone("hist", 3);

  // A transcript standing without its session file keeps the id.
  const orphan = join(clone, "authoring", "orphan.records.jsonl");
  writeFileSync(orphan, '{"seq":1,"record":{"type":"captain_status","turnId":null,"timestamp":1,"message":"theirs"}}\n');
  const orphanBytes = readFileSync(orphan);
  await client.expectError("draft.create", { projectId, draftId: "orphan" }, "invalid_request");
  assert.deepEqual(readFileSync(orphan), orphanBytes, "the transcript's bytes stand");
  assert.ok(!existsSync(join(clone, "authoring", "orphan.json")));

  // Deleted beside the core while its compile runs, then made again:
  // the former compile's settlement writes nothing into the successor,
  // and a command naming the former instance is refused.
  await client.expectOk("draft.create", { projectId, draftId: "again" });
  const former = client.instance("again");
  await client.expectOk("draft.source.write", { projectId, draftId: "again", content: SRC });
  const formerCompile = client.command("draft.compile", { projectId, draftId: "again" });
  await held("again");
  const again = authoringFiles(clone, "again");
  rmSync(again.record);
  rmSync(again.records, { force: true });
  const successor = await client.expectOk("draft.create", { projectId, draftId: "again" });
  assert.notEqual(successor.instance, former);
  // The successor is another session: idle beside the former's compile,
  // it takes a message at once.
  assert.equal(successor.activity, "idle");
  assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "again", instance: successor.instance!, text: "beside" }), { accepted: true, queued: false });
  await until(() => client.latest("again")?.instance === successor.instance && client.latest("again")?.activity === "idle", 20_000, "the successor's turn");
  await client.expectOk("compile.abort", { playbookId: "again", instance: former });
  await formerCompile;
  await sleep(200);
  const stored = JSON.parse(readFileSync(again.record, "utf8")) as { instance: string; compile?: unknown };
  assert.equal(stored.instance, successor.instance);
  assert.equal(stored.compile, undefined, "the former compile settled nowhere");
  assert.ok(!existsSync(again.records) || !readFileSync(again.records, "utf8").includes("Compile canceled"));
  await client.expectError("draft.send", { projectId, draftId: "again", instance: former, text: "late" }, "conflict");
  await client.expectError("draft.compile", { projectId, draftId: "again", instance: former }, "conflict");

  // A session file rewritten during a compile: the settlement keeps the
  // newer queue and proposal, the queued message dispatching first.
  await client.expectOk("draft.create", { projectId, draftId: "queue" });
  await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "queue" } });
  await client.expectOk("draft.source.write", { projectId, draftId: "queue", content: SRC });
  const compiling = client.command("draft.compile", { projectId, draftId: "queue" });
  await held("queue");
  const queue = authoringFiles(clone, "queue");
  const proposal = { command: "queue", intent: "Written elsewhere", players: { Helper: "dev.coder" } };
  const rewritten = { ...JSON.parse(readFileSync(queue.record, "utf8")), queued: [{ text: "from elsewhere" }], proposal };
  // A write under the bytes read before the rewrite is refused.
  const location = { key: projectId, authoringDir: join(clone, "authoring"), workingFolder: join(dir, "project") };
  const beside = new DraftStore(() => [location]);
  const before = beside.load("queue");
  writeFileSync(queue.record, JSON.stringify(rewritten));
  assert.throws(() => beside.write({ ...before.draft, failures: 7 }, before.version), DraftChangedError);
  assert.deepEqual(JSON.parse(readFileSync(queue.record, "utf8")), rewritten);
  release("queue");
  assert.ok((await compiling).ok);
  await until(() => client.turnStarts("queue").includes("from elsewhere"), 20_000, "the queued message");
  const dispatched = harness.stats.runs.find((run) => run.prompt.endsWith("Boss: from elsewhere"));
  assert.match(dispatched?.prompt ?? "", /The compile of queue succeeded[^]*Boss: from elsewhere$/);
  await turnsDone("queue", 1);
  assert.deepEqual(client.latest("queue")?.proposal, proposal);
  assert.deepEqual(client.latest("queue")?.queued, []);

  // A source edited while the compiler runs: the success reads Changed.
  await client.expectOk("draft.create", { projectId, draftId: "edit" });
  await client.expectOk("draft.source.write", { projectId, draftId: "edit", content: SRC });
  const editing = client.command("draft.compile", { projectId, draftId: "edit" });
  await held("edit");
  writeFileSync(join(artifactDir("edit"), "edit.md"), `${SRC}\nEdited meanwhile.\n`);
  release("edit");
  assert.ok((await editing).ok);
  await until(() => client.latest("edit")?.compile?.outcome === "ok", 20_000, "the compile");
  assert.equal(client.latest("edit")?.state, "changed");

  // A clone moved under the home: the next record lands where it stands
  // now, and nothing is made at the former path.
  const moves = join(dir, "moves");
  const fromClone = join(moves, "tester", "a-spex");
  const toClone = join(moves, "tester", "b-spex");
  mkdirSync(fromClone, { recursive: true });
  let current = { key: "tester/a-spex", authoringDir: join(fromClone, "authoring"), workingFolder: join(dir, "project") };
  const moving = new DraftStore(() => [current]);
  const made = moving.create("moved", 1, current, "local");
  renameSync(fromClone, toClone);
  current = { ...current, key: "tester/b-spex", authoringDir: join(toClone, "authoring") };
  moving.append("moved", made.instance, { type: "captain_status", turnId: null, timestamp: 2, message: "after the move" } as never);
  assert.match(readFileSync(join(toClone, "authoring", "moved.records.jsonl"), "utf8"), /after the move/);
  assert.ok(!existsSync(fromClone), "the former clone path is not made again");

  // Another device's running compile and open turn, and an earlier
  // version's unmarked turn, stand after a restart; this device's own
  // are closed as interrupted.
  client.close();
  await harness.service.stop();
  const device = Home.load(dataDir).device;
  const seeds = new DraftStore(() => [location]);
  const seed = (id: string, owner: string | undefined) => {
    const draft = seeds.create(id, 1000, location, "local");
    seeds.append(id, draft.instance, { type: "turn_started", turnId: 1, timestamp: 1001, ...(owner ? { device: owner } : {}), turn: { id: 1, prompt: "hi", timestamp: 1001 } } as never);
    seeds.write({ ...draft, compile: { at: 1002, by: "boss", outcome: "running", ...(owner ? { device: owner } : {}) } }, seeds.load(id).version);
  };
  seed("peer", "00000000-0000-4000-8000-000000000000");
  seed("mine", device);
  seed("legacy", undefined);
  // A player chosen by an earlier version, kept by id: for the session
  // written then, without an instance, and for a session of another id
  // made since under a fresh one.
  seeds.create("earlier", 1000, location, "local");
  const { instance: _fresh, ...unmarked } = JSON.parse(readFileSync(seeds.recordFile("earlier"), "utf8")) as Record<string, unknown>;
  writeFileSync(seeds.recordFile("earlier"), JSON.stringify(unmarked));
  seeds.create("successor", 1000, location, "local");
  const prefsFile = join(dataDir, "local", "prefs.json");
  const kept = existsSync(prefsFile) ? JSON.parse(readFileSync(prefsFile, "utf8")) as { format: 1; prefs: Record<string, unknown> } : { format: 1 as const, prefs: {} };
  kept.prefs["authoring:earlier:player"] = "dev.reviewer";
  kept.prefs["authoring:successor:player"] = "dev.reviewer";
  writeFileSync(prefsFile, JSON.stringify(kept));
  const restarted = await startHarness({ script, slc: stubSlcSource("['Helper']"), dir });
  const after = new Client(restarted.service.port());
  await after.open();
  for (const id of ["peer", "legacy"]) {
    const opened = await after.expectOk("draft.open", { projectId, draftId: id });
    assert.equal(opened.draft.compile?.outcome, "running", `${id}'s compile stands`);
    assert.deepEqual(opened.records.map((r) => r.record.type), ["turn_started"], `${id}'s turn stands open`);
  }
  const mine = await after.expectOk("draft.open", { projectId, draftId: "mine" });
  assert.equal(mine.draft.compile?.outcome, "interrupted");
  assert.deepEqual(mine.records.map((r) => r.record.type), ["turn_started", "turn_aborted", "captain_status"]);
  const legacyOpened = await after.expectOk("draft.open", { projectId, draftId: "earlier" });
  assert.equal(legacyOpened.draft.instance, legacyInstance("earlier", 1000));
  assert.equal(legacyOpened.draft.player, "dev.reviewer");
  assert.equal((await after.expectOk("draft.open", { projectId, draftId: "successor" })).draft.player, null);
  const moved = JSON.parse(readFileSync(prefsFile, "utf8")) as { prefs: Record<string, unknown> };
  assert.equal(moved.prefs[`authoring:${legacyInstance("earlier", 1000)}:player`], "dev.reviewer");
  assert.equal(moved.prefs["authoring:earlier:player"], undefined);
  after.close();
  await restarted.service.stop();
});

test("core-service-97: a sync receiving a session's replaced transcript announces it with its instance", {timeout: 120_000}, async () => {
  const harness = await startHarness({ script: { fallback: { deltas: ["Noted."], result: "Noted." } }, slc: stubSlcSource("['Helper']") });
  const { dir, projectId, clone } = harness;
  const client = new Client(harness.service.port());
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  const synced = async () => {
    const after = client.messages.length;
    assert.deepEqual(await client.expectOk("space.sync", { repository: projectId }), { accepted: true });
    const phaseOf = (message: ServerMessage) => message.type === "space.state"
      ? message.state.groups.flatMap((group) => group.repositories).find((repository) => repository.key === projectId)?.sync
      : undefined;
    const settled = await client.waitFor((message) => client.messages.indexOf(message) >= after && ["done", "stopped"].includes(phaseOf(message)?.phase ?? ""), 60_000);
    assert.equal(phaseOf(settled)?.phase, "done", JSON.stringify(phaseOf(settled)));
  };
  try {
    await client.open();
    await client.expectOk("draft.create", { projectId, draftId: "synced" });
    await client.expectOk("draft.send", { projectId, draftId: "synced", text: "hello" });
    await until(() => client.latest("synced")?.activity === "idle" && harness.stats.runs.length === 1, 20_000, "the turn");
    const remote = join(dir, "remote.git");
    git(dir, "init", "--quiet", "--bare", "--initial-branch=spex", remote);
    await client.expectOk("space.remote.set", { repository: projectId, url: remote });
    await synced();
    // Another device rewrites the history, the same records in number.
    const other = join(dir, "other");
    git(dir, "clone", "--quiet", "--branch", "spex", remote, other);
    const transcript = join(other, "authoring", "synced.records.jsonl");
    const before = readFileSync(transcript, "utf8");
    writeFileSync(transcript, before.replaceAll('"prompt":"hello"', '"prompt":"rewritten"'));
    git(other, "-c", "user.name=Other", "-c", "user.email=other@example.test", "commit", "--quiet", "-am", "rewrite elsewhere");
    git(other, "push", "--quiet", "origin", "spex");
    const heard = client.messages.length;
    await synced();
    const announced = client.messages.slice(heard).find((m) => m.type === "draft.history-replaced" && m.draftId === "synced");
    assert.ok(announced && announced.type === "draft.history-replaced");
    assert.equal(announced.instance, client.instance("synced"));
    const reopened = await client.expectOk("draft.open", { projectId, draftId: "synced" });
    assert.equal(reopened.records.length, before.trimEnd().split("\n").length);
    assert.ok(reopened.records.some((r) => r.record.type === "turn_started" && (r.record as { turn: { prompt: string } }).turn.prompt === "rewritten"));
    assert.ok(existsSync(join(clone, "authoring", "synced.json")));
  } finally {
    client.close();
    await harness.service.stop();
  }
});

test("core-service-97: a moved clone's authoring session is announced under its new project", {timeout: 60_000}, async () => {
  const harness = await startHarness({ script: { fallback: { deltas: ["Noted."], result: "Noted." } }, slc: stubSlcSource("['Helper']") });
  const { dataDir, projectId, clone } = harness;
  const client = new Client(harness.service.port());
  try {
    await client.open();
    const created = await client.expectOk("draft.create", { projectId, draftId: "moving" });
    // The clone is moved on disk, the store follows, and the service's
    // own callback runs, as a rename the host reports does (space-60).
    const to = "tester/moved-spex";
    renameSync(clone, join(dataDir, "workspace", ...to.split("/")));
    const store = Reflect.get(harness.service, "store") as { moveRepositories(moves: { from: string; to: string }[]): void };
    store.moveRepositories([{ from: projectId, to }]);
    const heard = client.messages.length;
    await (Reflect.get(harness.service, "repositoriesMoved") as (moves: { from: string; to: string }[]) => Promise<void>).call(harness.service, [{ from: projectId, to }]);
    const announced = await client.waitFor((m) => client.messages.indexOf(m) >= heard && m.type === "draft.state" && m.draft.id === "moving" && m.draft.projectId === to);
    assert.ok(announced.type === "draft.state");
    assert.equal(announced.draft.instance, created.instance, "the same session, under its new project");
    assert.deepEqual(await client.expectOk("draft.send", { projectId: to, draftId: "moving", text: "after the move" }), { accepted: true, queued: false });
  } finally {
    client.close();
    await harness.service.stop();
  }
});

test("playbook-library-96: work goes on beside work, settling only what is its own, resuming only over its own records", {timeout: 120_000}, async () => {
  const script: FakeScript = {
    rules: [
      // Anchored to the prompt's end: a reseed quotes earlier messages.
      { match: /Boss: hold$/, response: { deltas: ["holding"], result: "", untilAborted: true } },
      { match: /Boss: slow$/, response: { deltas: ["thinking"], result: "Slow reply.", delayMs: 1500 } },
    ],
    fallback: { deltas: ["Noted."], result: "Noted." },
  };
  const harness = await startHarness({ script, slc: stubSlcScriptedSource(["ok"], "['Helper']", { hold: true }) });
  const { dir, projectId, clone } = harness;
  const client = new Client(harness.service.port());
  await client.open();
  const artifactDir = (id: string) => join(dir, "project", "spex-packages", id, "playbooks", "en", id);
  const release = (id: string) => writeFileSync(join(artifactDir(id), STUB_SLC_RELEASE_FILE), "");
  const held = (id: string, n = 1) => until(() => client.progress(id).filter((line) => line.startsWith("→ normalize")).length >= n, 20_000, `${id} held ×${n}`);
  const SRC = "# Held\n\nRoles:\n\n- Helper\n";
  const make = async (id: string) => {
    await client.expectOk("draft.create", { projectId, draftId: id });
    await client.expectOk("subscribe", { channel: { kind: "draft", draftId: id } });
    await client.expectOk("draft.source.write", { projectId, draftId: id, content: SRC });
  };
  const stored = (id: string) => JSON.parse(readFileSync(authoringFiles(clone, id).record, "utf8")) as { compile?: { outcome: string; device?: string; at: number } };

  // Deleted while its compile runs: admitted; the compile, ending, makes
  // nothing of the session again.
  await make("gone");
  const goneCompile = client.command("draft.compile", { projectId, draftId: "gone" });
  await held("gone");
  assert.equal(await client.expectOk("draft.delete", { projectId, draftId: "gone" }), null);
  release("gone");
  await goneCompile;
  await sleep(200);
  for (const path of Object.values(authoringFiles(clone, "gone"))) assert.ok(!existsSync(path), `${path} stays gone`);

  // Two compiles settling in either order: one records its outcome, the
  // other finds a marker not its own and records nothing.
  await make("order");
  const both = [client.command("draft.compile", { projectId, draftId: "order" })];
  await held("order");
  both.push(client.command("draft.compile", { projectId, draftId: "order" }));
  await held("order", 2);
  release("order");
  await until(() => !existsSync(join(artifactDir("order"), STUB_SLC_RELEASE_FILE)), 10_000, "one released");
  release("order");
  await Promise.all(both);
  await until(() => client.latest("order")?.activity === "idle", 20_000, "both settled");
  await sleep(200);
  assert.equal(client.statusLines("order").filter((line) => line.startsWith("◇ Compiled")).length, 1);
  assert.equal(stored("order").compile?.outcome, "ok");

  // A running marker a sync replaced with another device's: the
  // settlement leaves it as it stands.
  await make("peer");
  const peerCompile = client.command("draft.compile", { projectId, draftId: "peer" });
  await held("peer");
  const peerFile = authoringFiles(clone, "peer").record;
  const synced = JSON.parse(readFileSync(peerFile, "utf8")) as { compile: { device: string } };
  synced.compile.device = "00000000-0000-4000-8000-0000000000ff";
  writeFileSync(peerFile, JSON.stringify(synced));
  release("peer");
  await peerCompile;
  await sleep(200);
  assert.deepEqual(stored("peer").compile, synced.compile, "another device's marker stands");
  assert.ok(!client.statusLines("peer").some((line) => line.startsWith("◇ Compiled")));

  // A compile settling while a turn runs: its follow-up waits for the
  // turn and starts after it, never beside it.
  await make("wait");
  await client.expectOk("draft.send", { projectId, draftId: "wait", text: "hold" });
  await until(() => client.latest("wait")?.activity === "turn", 10_000, "the turn");
  const waitCompile = client.command("draft.compile", { projectId, draftId: "wait" });
  await held("wait");
  release("wait");
  assert.ok((await waitCompile).ok);
  await sleep(300);
  assert.deepEqual(client.turnStarts("wait"), ["hold"], "nothing beside the running turn");
  await client.expectOk("draft.abort", { projectId, draftId: "wait" });
  await until(() => client.turnStarts("wait").length === 2, 10_000, "the follow-up");
  assert.match(client.turnStarts("wait")[1], /^Spex: the compile succeeded/);
  await until(() => client.latest("wait")?.activity === "idle", 20_000, "idle");

  // A success owing its follow-up, then a newer compile canceled before
  // the turn ends: the latest outcome owes nothing, so nothing starts.
  await make("stale");
  await client.expectOk("draft.send", { projectId, draftId: "stale", text: "hold" });
  await until(() => client.latest("stale")?.activity === "turn", 10_000, "the turn");
  const succeeded = client.command("draft.compile", { projectId, draftId: "stale" });
  await held("stale");
  release("stale");
  assert.ok((await succeeded).ok);
  const canceled = client.command("draft.compile", { projectId, draftId: "stale" });
  await held("stale", 2);
  await client.expectOk("compile.abort", { playbookId: "stale", instance: client.instance("stale") });
  const cut = await canceled;
  assert.ok(!cut.ok && cut.error.code === "aborted");
  await until(() => client.latest("stale")?.compile?.outcome === "canceled", 10_000, "the newer outcome recorded");
  await client.expectOk("draft.abort", { projectId, draftId: "stale" });
  await until(() => client.latest("stale")?.activity === "idle", 10_000, "idle");
  await sleep(300);
  assert.deepEqual(client.turnStarts("stale"), ["hold"], "no stale follow-up starts");
  assert.ok(!harness.stats.runs.some((run) => run.prompt.includes("The compile of stale succeeded")), "no stale success text reaches the agent");

  // A success owing its follow-up, then its record replaced beside the
  // core — a sync bringing another device's compile — before the turn
  // ends: the follow-up is owed no more, and the queued message goes
  // without it.
  await make("replaced");
  await client.expectOk("draft.send", { projectId, draftId: "replaced", text: "hold" });
  await until(() => client.latest("replaced")?.activity === "turn", 10_000, "the turn");
  const owed = client.command("draft.compile", { projectId, draftId: "replaced" });
  await held("replaced");
  release("replaced");
  assert.ok((await owed).ok);
  await until(() => client.latest("replaced")?.compile?.outcome === "ok", 10_000, "the success recorded");
  const replacedFile = authoringFiles(clone, "replaced").record;
  const elsewhere = JSON.parse(readFileSync(replacedFile, "utf8")) as Record<string, unknown>;
  elsewhere.compile = { at: 9_999_999_999_999, by: "boss", outcome: "running", device: "00000000-0000-4000-8000-0000000000ee" };
  writeFileSync(replacedFile, JSON.stringify(elsewhere));
  assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "replaced", text: "queued after" }), { accepted: true, queued: true });
  await client.expectOk("draft.abort", { projectId, draftId: "replaced" });
  await until(() => client.turnStarts("replaced").includes("queued after"), 10_000, "the queued message");
  await until(() => client.latest("replaced")?.activity === "idle", 20_000, "idle");
  await sleep(300);
  assert.deepEqual(client.turnStarts("replaced"), ["hold", "queued after"], "no stale follow-up turn");
  const after = harness.stats.runs.find((run) => run.prompt.endsWith("Boss: queued after"));
  assert.ok(after && !after.prompt.includes("The compile of replaced succeeded"), "no stale preface");

  // Resume: only over a transcript this run alone wrote.
  await make("resume");
  const records = authoringFiles(clone, "resume").records;
  const runOf = (text: string) => harness.stats.runs.find((run) => run.prompt.endsWith(`Boss: ${text}`))!;
  const turn = async (text: string) => {
    const before = client.turnStarts("resume").length;
    await client.expectOk("draft.send", { projectId, draftId: "resume", text });
    await until(() => client.latest("resume")?.activity === "idle" && client.turnStarts("resume").length > before, 20_000, text);
  };
  const foreign = () => {
    const last = readFileSync(records, "utf8").trimEnd().split("\n").length;
    appendFileSync(records, `${JSON.stringify({ seq: last + 1, record: { type: "captain_status", turnId: null, timestamp: 1, message: "◇ elsewhere" } })}\n`);
  };
  // Change the transcript once the provider has streamed and before it
  // returns its token.
  const midway = async (text: string, change: () => void) => {
    const from = client.records("resume").length;
    await client.expectOk("draft.send", { projectId, draftId: "resume", text });
    await until(() => client.records("resume").slice(from).some((m) => m.record.type === "player_event" && JSON.stringify(m.record).includes("thinking")), 10_000, `${text} under way`);
    change();
    await until(() => client.latest("resume")?.activity === "idle", 20_000, `${text} done`);
  };
  await turn("hello");
  await turn("own");
  assert.match(runOf("own").resume ?? "", /^fake-resume-/, "a transcript only this run wrote resumes");
  // Another writer's record after the provider's input, while it ran.
  await midway("slow", foreign);
  await turn("after suffix");
  assert.equal(runOf("after suffix").resume, undefined, "a foreign suffix during the call reseeds");
  assert.match(runOf("after suffix").prompt, /Conversation so far:/);
  await turn("again");
  assert.match(runOf("again").resume ?? "", /^fake-resume-/);
  // Another writer's record between turns.
  foreign();
  await turn("after between");
  assert.equal(runOf("after between").resume, undefined, "history added between turns reseeds");
  // The history replaced while the provider ran.
  await midway("slow", () => writeFileSync(records, readFileSync(records, "utf8").replaceAll('"prompt":"hello"', '"prompt":"rewritten"')));
  await turn("after replacement");
  assert.equal(runOf("after replacement").resume, undefined, "a replaced history during the call reseeds");
  assert.match(runOf("after replacement").prompt, /Boss: rewritten/);

  client.close();
  await harness.service.stop();
});
