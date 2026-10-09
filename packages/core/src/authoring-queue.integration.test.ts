// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Authoring queue coverage (playbook-library-103, core-service-97): a
// Boss message the core accepted as queued while an activity held the
// session — its turn, its compile, an enabling, or a `compile.run` of
// its id — starts as the session's next turn once that activity ends,
// driven over the WebSocket protocol against the scripted fake adapter
// and a stub slc (DR-058).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { fakeAdapterImports, type FakeAdapterStats, type FakeScript } from "./testing/fake-adapter.js";
import { AUTHORING_SOURCE, authoringScript } from "./testing/authoring.js";
import { STUB_SLC_RELEASE_FILE, stubSlcBlockingSource, stubSlcScriptedSource, stubSlcSource } from "./testing/stub-slc.js";
import { DraftAddresses, type DraftFields } from "./testing/draft-address.js";
import type {
  Command,
  CommandResults,
  DraftInfo,
  DraftRecordMessage,
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
`;

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  /** The instance held under each id, as the interface holds it: a
   * command sent without one names it (core-service-96). */
  readonly addresses = new DraftAddresses();
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(message);
      this.addresses.observe(message);
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

  /** Send a command and await no reply: for one the core's stop cuts. */
  sendOnly<T extends Command["type"]>(type: T, fields: DraftFields<T>): void {
    this.socket.send(JSON.stringify({ type, id: `c${(this.nextId += 1)}`, ...this.addresses.address(type, fields as Record<string, unknown>) }));
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: DraftFields<T>,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...this.addresses.address(type, fields as Record<string, unknown>) }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id, 120_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    if (reply.ok) this.addresses.learn(type, reply.result);
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: DraftFields<T>,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
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

  states(id: string, from = 0): DraftInfo[] {
    return this.messages
      .slice(from)
      .filter((m): m is DraftStateMessage => m.type === "draft.state" && m.draft.id === id)
      .map((m) => m.draft);
  }

  latest(id: string): DraftInfo | undefined {
    return this.states(id).at(-1);
  }

  turnStarts(id: string): string[] {
    return this.messages
      .filter((m): m is DraftRecordMessage => m.type === "draft.record" && m.draftId === id && m.record.type === "turn_started")
      .map((m) => (m.record as { turn: { prompt: string } }).turn.prompt);
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
}

/** The toolchain probe wants a system Node; every other spawn — the
 * stub slc — is real. */
function probeSpawner(): LineSpawner {
  return (command, args, cwd, onLine, signal, env) => {
    if (args.length === 1 && args[0] === "--version" && command !== process.execPath) {
      onLine("v24.1.0");
      return Promise.resolve(0);
    }
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
  const dir = options.dir ?? scratchDir("spex-authoring-queue-it-");
  const configPath = join(dir, "playbook.config.yaml");
  if (!existsSync(configPath)) writeFileSync(configPath, CONFIG);
  const stubPath = join(dir, "stub-slc.cjs");
  writeFileSync(stubPath, options.slc);
  const dataDir = join(dir, "state");
  const { imports, stats } = fakeAdapterImports(options.script);
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
    compileSpawner: probeSpawner(),
  });
  const projectId = await pairedProject(service.port(), workingFolder(join(dir, "project")));
  const clone = join(dataDir, "workspace", ...projectId.split("/"));
  return { service, stats, dir, dataDir, configPath, projectId, clone };
}

/** An authoring session's files in its project's spex repository
 * (storage-23). */
function authoringFiles(clone: string, id: string): { record: string; records: string } {
  return {
    record: join(clone, "authoring", `${id}.json`),
    records: join(clone, "authoring", `${id}.records.jsonl`),
  };
}

/** The playbook artifact's folder of a session's spec package in the
 * harness's working folder (environments-10). */
function artifactDir(harness: Harness, id: string): string {
  return join(harness.dir, "project", "spex-packages", id, "playbooks", "en", id);
}

/** The prompts of the turns a transcript on disk started, in order. */
function turnsOnDisk(records: string): string[] {
  if (!existsSync(records)) return [];
  return readFileSync(records, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as { record: { type: string; turn?: { prompt: string } } })
    .filter((line) => line.record.type === "turn_started")
    .map((line) => line.record.turn!.prompt);
}

const QUEUED = "queued during the activity";
const LATER = "sent after the release";

/** Author, compile and propose `triage`: the agent writes the source,
 * asks for the compile and, after it succeeded, proposes the enabling. */
async function compiled(client: Client, projectId: string): Promise<void> {
  await client.expectOk("draft.send", { projectId, draftId: "triage", text: "I want a playbook that triages new issues into labels." });
  await until(() => {
    const draft = client.latest("triage");
    return draft?.activity === "idle" && draft.proposal !== undefined && draft.queued.length === 0;
  }, 120_000, "the proposal");
}

/** Hold the enabling's re-package where it loads the entry the
 * compiler emitted: the entry waits, at its import, for the test's
 * release (the playbook-library-100 technique). */
function holdRepackage(harness: Harness): { reached: string; release: string } {
  const reached = join(harness.dir, "repackage-reached");
  const release = join(harness.dir, "repackage-release");
  const entry = join(artifactDir(harness, "triage"), "triage.ts");
  writeFileSync(entry, [
    'import { existsSync as heldExists, writeFileSync as heldWrite } from "node:fs";',
    `heldWrite(${JSON.stringify(reached)}, "");`,
    `while (!heldExists(${JSON.stringify(release)})) await new Promise((resolve) => setTimeout(resolve, 25));`,
    readFileSync(entry, "utf8"),
  ].join("\n"));
  return { reached, release };
}

/** The follow-up text a compile settle composes, as it would ride a
 * queued message's prompt (playbook-library-65). */
function carriesFollowUp(prompt: string, id: string): boolean {
  return prompt.includes(`The compile of ${id} succeeded`) || prompt.includes(`Fix ${id}.md and explain the cause`);
}

/**
 * After the activity's release, with no further command: the queued
 * message is the session's next turn, ahead of one sent after it, its
 * prompt carrying no follow-up text, and the session ends idle with an
 * empty queue (playbook-library-102).
 */
async function dispatchesInOrder(
  harness: Harness,
  client: Client,
  session: { projectId: string; id: string; turns: () => string[]; before: number },
): Promise<void> {
  const { projectId, id, turns, before } = session;
  await until(() => turns().length > before, 15_000, `"${QUEUED}" to start with no further command`);
  assert.equal(turns()[before], QUEUED, "the queued message is the next turn");
  await client.expectOk("draft.send", { projectId, draftId: id, text: LATER });
  await until(() => turns().length >= before + 2, 30_000, `"${LATER}" to start`);
  assert.deepEqual(turns().slice(before), [QUEUED, LATER], "the queued message runs ahead of one sent after it, and nothing else starts");
  const run = harness.stats.runs.find((entry) => entry.prompt.endsWith(`Boss: ${QUEUED}`));
  assert.ok(run, "the agent read the queued message");
  assert.ok(!carriesFollowUp(run.prompt, id), "the queued message's prompt carries no follow-up text");
  const start = Date.now();
  for (;;) {
    const opened = await client.expectOk("draft.open", { projectId, draftId: id });
    const finished = opened.records.filter((entry) => entry.record.type === "turn_finished" || entry.record.type === "turn_aborted").length;
    const started = opened.records.filter((entry) => entry.record.type === "turn_started").length;
    if (opened.draft.activity === "idle" && finished === started) {
      assert.deepEqual(opened.draft.queued, [], "the queue is empty");
      break;
    }
    if (Date.now() - start > 30_000) throw new Error(`timeout waiting for ${id} to end idle`);
    await sleep(25);
  }
}

// ---------------------------------------------------------------------------
// playbook-library-103: every activity's end dispatches the queue
// ---------------------------------------------------------------------------

test("playbook-library-103: a message queued during any activity starts as the next turn once the activity ends", async (t) => {
  // An enabling, held at its re-package, ends in each outcome.
  for (const outcome of ["succeeds", "refused", "aborted"] as const) {
    await t.test(`an enabling that ${outcome === "succeeds" ? "succeeds" : outcome === "refused" ? "is refused invalid_config" : "is ended by compile.abort"}`, async () => {
      const harness = await startHarness({ script: authoringScript(), slc: stubSlcSource("['Triager', 'Verifier']") });
      const { projectId } = harness;
      const client = new Client(harness.service.port());
      try {
        await client.open();
        await client.expectOk("draft.create", { projectId, draftId: "triage" });
        await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
        await compiled(client, projectId);
        const { reached, release } = holdRepackage(harness);
        const registering = client.command("draft.register", {
          projectId,
          draftId: "triage",
          command: "triage",
          intent: "Label new issues",
          // The refusal: a binding naming a player no roster holds.
          ...(outcome === "refused"
            ? { bindings: { Triager: "dev.nobody", Verifier: "dev.coder" } }
            : { bindings: { Triager: "dev.triager", Verifier: "dev.coder" }, newPlayers: { "dev.triager": { adapter: "claude" as const } } }),
        });
        await until(() => existsSync(reached), 60_000, "the held re-package");
        // The enabling holds the session's spex repository too: a sync
        // of it waits for it as for a compile (space-11).
        const sync = await client.command("space.sync", { repository: projectId });
        assert.equal(sync.ok ? "ok" : `${sync.error.code}: ${sync.error.message}`, "busy: triage is compiling", "a sync of the session's spex repository is refused while the enabling holds it");
        const before = client.turnStarts("triage").length;
        assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "triage", text: QUEUED }), { accepted: true, queued: true });
        if (outcome === "aborted") await client.expectOk("compile.abort", { playbookId: "triage" });
        writeFileSync(release, "");
        const reply = await registering;
        if (outcome === "succeeds") assert.ok(reply.ok, "the enabling succeeds");
        else if (outcome === "refused") assert.equal(reply.ok ? "ok" : reply.error.code, "invalid_config");
        else assert.ok(!reply.ok, "the aborted enabling is refused");
        await dispatchesInOrder(harness, client, { projectId, id: "triage", turns: () => client.turnStarts("triage"), before });
      } finally {
        client.close();
        await harness.service.stop();
      }
    });
  }

  await t.test("a compile.run of the session's id", async () => {
    const harness = await startHarness({ script: authoringScript(), slc: stubSlcScriptedSource(["ok"], "['Helper']", { hold: true }) });
    const { projectId, dir } = harness;
    const client = new Client(harness.service.port());
    try {
      await client.open();
      await client.expectOk("draft.create", { projectId, draftId: "helper" });
      await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "helper" } });
      // The compile.run names another project, whose working folder
      // takes the spec package (environments-10).
      const other = (await client.expectOk("project.register", { path: workingFolder(join(dir, "zeta")) })).id;
      const running = client.command("compile.run", {
        playbookId: "helper",
        sourceText: "# Helper\n\nRoles:\n\n- Helper\n",
        roles: ["Helper"],
        command: "helper",
        intent: "Help",
        bindings: { Helper: "dev.coder" },
        projectId: other,
      });
      await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "helper" && m.line.startsWith("→ normalize"), 60_000);
      // It holds the session's spex repository too: a sync of it waits
      // for the compile of its authoring session (space-11).
      const sync = await client.command("space.sync", { repository: projectId });
      assert.equal(sync.ok ? "ok" : `${sync.error.code}: ${sync.error.message}`, "busy: helper is compiling", "a sync of the session's spex repository is refused while the compile.run holds it");
      const before = client.turnStarts("helper").length;
      assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "helper", text: QUEUED }), { accepted: true, queued: true });
      writeFileSync(join(dir, "zeta", "spex-packages", "helper", "playbooks", "en", "helper", STUB_SLC_RELEASE_FILE), "");
      const reply = await running;
      assert.ok(reply.ok, "the compile.run succeeds");
      await dispatchesInOrder(harness, client, { projectId, id: "helper", turns: () => client.turnStarts("helper"), before });
    } finally {
      client.close();
      await harness.service.stop();
    }
  });

  await t.test("an enabling whose id a rescan gives another project's session", async () => {
    const harness = await startHarness({ script: authoringScript(), slc: stubSlcSource("['Triager', 'Verifier']") });
    const { projectId, clone, dir, dataDir } = harness;
    const kept = authoringFiles(clone, "triage");
    const client = new Client(harness.service.port());
    try {
      await client.open();
      await client.expectOk("draft.create", { projectId, draftId: "triage" });
      await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
      // Another project holds a session of the id, shadowed while this one stands.
      const other = (await client.expectOk("project.register", { path: workingFolder(join(dir, "zeta")) })).id;
      const promoted = authoringFiles(join(dataDir, "workspace", ...other.split("/")), "triage");
      mkdirSync(dirname(promoted.record), { recursive: true });
      writeFileSync(promoted.record, JSON.stringify({ format: 1, id: "triage", createdAt: 1, touchedAt: 1, package: "spex-packages/triage", queued: [], failures: 0 }));
      writeFileSync(promoted.records, `${JSON.stringify({ seq: 1, record: { type: "captain_status", turnId: null, timestamp: 1, message: "◇ Made on another device" } })}\n`);
      await compiled(client, projectId);
      const { reached, release } = holdRepackage(harness);
      const registering = client.command("draft.register", {
        projectId,
        draftId: "triage",
        command: "triage",
        intent: "Label new issues",
        bindings: { Triager: "dev.triager", Verifier: "dev.coder" },
        newPlayers: { "dev.triager": { adapter: "claude" } },
      });
      await until(() => existsSync(reached), 60_000, "the held re-package");

      // The kept session's file goes, and a rescan gives the id to the
      // other project's session: the enabling is canceled and the id
      // freed at once (playbook-library-70), so the session the id
      // names reads idle and a message sent to it runs as its turn.
      rmSync(kept.record);
      await client.expectOk("project.register", { path: workingFolder(join(dir, "omega")) });
      const keptTranscript = readFileSync(kept.records, "utf8");
      const named = await client.expectOk("draft.open", { projectId: other, draftId: "triage" });
      assert.equal(named.draft.activity, "idle", "the id is free once the enabling of the session it no longer names is canceled");
      assert.deepEqual(await client.expectOk("draft.send", { projectId: other, draftId: "triage", text: QUEUED }), { accepted: true, queued: false });
      await until(() => turnsOnDisk(promoted.records).length > 0, 15_000, `"${QUEUED}" to start at once`);
      assert.deepEqual(turnsOnDisk(promoted.records), [QUEUED]);
      writeFileSync(release, "");
      const reply = await registering;
      assert.equal(reply.ok ? "ok" : reply.error.message, "triage now names another authoring session");

      // The release changes nothing for the session the id names: its
      // turn ends and it stands idle with an empty queue, not enabled.
      const start = Date.now();
      for (;;) {
        const opened = await client.expectOk("draft.open", { projectId: other, draftId: "triage" });
        const finished = opened.records.filter((entry) => entry.record.type === "turn_finished" || entry.record.type === "turn_aborted").length;
        if (opened.draft.activity === "idle" && finished === 1) {
          assert.deepEqual(opened.draft.queued, []);
          assert.equal(opened.draft.enabled, false);
          break;
        }
        if (Date.now() - start > 30_000) throw new Error("timeout waiting for the named session's turn to end");
        await sleep(25);
      }
      assert.deepEqual(turnsOnDisk(promoted.records), [QUEUED], "nothing else started");
      // The session the id no longer names gains no record.
      assert.equal(readFileSync(kept.records, "utf8"), keptTranscript, "the session the id no longer names records nothing more");
    } finally {
      client.close();
      await harness.service.stop();
    }
  });

  await t.test("a compile cut by a core stop with a message queued", async () => {
    const script: FakeScript = { fallback: { deltas: ["Noted."], result: "Noted." } };
    const first = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']") });
    const { dir, projectId, clone } = first;
    const files = authoringFiles(clone, "persist");
    const client = new Client(first.service.port());
    await client.open();
    try {
      await client.expectOk("draft.create", { projectId, draftId: "persist" });
      await client.expectOk("draft.source.write", { projectId, draftId: "persist", content: "# Persist\n\nRoles:\n\n- Helper\n" });
      // The compile's reply never comes: the core stops under it.
      client.sendOnly("draft.compile", { projectId, draftId: "persist" });
      await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "persist" && m.line.startsWith("→ gears2fsm"), 20_000);
      assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "persist", text: QUEUED }), { accepted: true, queued: true });
    } finally {
      client.close();
      await first.service.stop();
    }

    const second = await startHarness({ script, slc: stubSlcBlockingSource("['Helper']"), dir });
    const client2 = new Client(second.service.port());
    try {
      await client2.open();
      // The start launches no agent work: the message waits, the compile reads interrupted.
      await sleep(500);
      const opened = await client2.expectOk("draft.open", { projectId, draftId: "persist" });
      assert.equal(opened.draft.compile?.outcome, "interrupted");
      assert.equal(opened.draft.activity, "idle");
      assert.deepEqual(opened.draft.queued, [{ text: QUEUED }], "the message is still queued");
      assert.equal(second.stats.runs.length, 0, "nothing started");
      assert.deepEqual(turnsOnDisk(files.records), []);

      // The session's next act — a send — queues behind it, and the oldest starts.
      assert.deepEqual(await client2.expectOk("draft.send", { projectId, draftId: "persist", text: LATER }), { accepted: true, queued: true });
      await until(() => turnsOnDisk(files.records).length >= 2, 30_000, "both turns");
      assert.deepEqual(turnsOnDisk(files.records), [QUEUED, LATER], "the queued message runs first, then the new one");
      const start = Date.now();
      for (;;) {
        const now = await client2.expectOk("draft.open", { projectId, draftId: "persist" });
        if (now.draft.activity === "idle" && now.records.filter((entry) => entry.record.type === "turn_finished").length === 2) {
          assert.deepEqual(now.draft.queued, []);
          break;
        }
        if (Date.now() - start > 30_000) throw new Error("timeout waiting for persist to end idle");
        await sleep(25);
      }
      const run = second.stats.runs.find((entry) => entry.prompt.endsWith(`Boss: ${QUEUED}`));
      assert.ok(run && !carriesFollowUp(run.prompt, "persist"), "the queued message's prompt carries no follow-up text");
    } finally {
      client2.close();
      await second.service.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// core-service-97: an enabling and a compile.run of the id hold the session
// ---------------------------------------------------------------------------

test("core-service-97: a compile.run of a session's id and an enabling hold the session, and draft.state follows them", async () => {
  const harness = await startHarness({ script: authoringScript(), slc: stubSlcScriptedSource(["ok"], "['Triager', 'Verifier']", { hold: true }) });
  const { projectId } = harness;
  const client = new Client(harness.service.port());
  try {
    await client.open();

    // A compile.run of the session's id: compiling from the take to the release.
    await client.expectOk("draft.create", { projectId, draftId: "helper" });
    const beforeTake = client.messages.length;
    const running = client.command("compile.run", {
      playbookId: "helper",
      sourceText: AUTHORING_SOURCE.replaceAll("<id>", "helper"),
      roles: ["Triager", "Verifier"],
      command: "helper",
      intent: "Help",
      bindings: { Triager: "dev.coder", Verifier: "dev.reviewer" },
      projectId,
    });
    await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "helper" && m.line.startsWith("→ normalize"), 60_000);
    await until(() => client.states("helper", beforeTake).some((draft) => draft.activity === "compiling"), 10_000, "a draft.state reading compiling after the take");
    writeFileSync(join(artifactDir(harness, "helper"), STUB_SLC_RELEASE_FILE), "");
    const reply = await running;
    assert.ok(reply.ok, "the compile.run succeeds");
    assert.equal(client.latest("helper")?.activity, "idle", "the state held when the reply arrives reads idle");

    // An enabling: draft.send queues while it holds the session.
    await client.expectOk("draft.create", { projectId, draftId: "triage" });
    await client.expectOk("subscribe", { channel: { kind: "draft", draftId: "triage" } });
    await client.expectOk("draft.send", { projectId, draftId: "triage", text: "I want a playbook that triages new issues into labels." });
    await client.waitFor((m) => m.type === "compile.progress" && m.playbookId === "triage" && m.line.startsWith("→ normalize"), 60_000);
    writeFileSync(join(artifactDir(harness, "triage"), STUB_SLC_RELEASE_FILE), "");
    await until(() => {
      const draft = client.latest("triage");
      return draft?.activity === "idle" && draft.proposal !== undefined;
    }, 120_000, "the proposal");
    const { reached, release } = holdRepackage(harness);
    const registering = client.command("draft.register", {
      projectId,
      draftId: "triage",
      command: "triage",
      intent: "Label new issues",
      bindings: { Triager: "dev.triager", Verifier: "dev.coder" },
      newPlayers: { "dev.triager": { adapter: "claude" } },
    });
    await until(() => existsSync(reached), 60_000, "the held re-package");
    assert.equal(client.latest("triage")?.activity, "compiling");
    assert.deepEqual(await client.expectOk("draft.send", { projectId, draftId: "triage", text: QUEUED }), { accepted: true, queued: true });
    writeFileSync(release, "");
    assert.ok((await registering).ok, "the enabling succeeds");
    await until(() => client.turnStarts("triage").includes(QUEUED) && client.latest("triage")?.activity === "idle", 30_000, "the queued turn and idle");
  } finally {
    client.close();
    await harness.service.stop();
  }
});
