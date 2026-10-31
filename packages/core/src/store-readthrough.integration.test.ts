// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core reads files for its picture (DR-111): what an editor, a sync
// or another clone wrote under a running store is what its next query
// reads, with no reload, and a read makes no folder (storage-29). The
// home file, clones and project files (storage-2, storage-3), intents
// (storage-4), their damage (storage-12), and one open intent per source
// artifact held at the write (core-service-42, core-service-55).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { Store } from "./store.js";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { scratchDir } from "./testing/scratch.js";
import { stubSlcSource } from "./testing/stub-slc.js";
import type { Command, ServerMessage } from "./protocol.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const SESSION = "71000000-0000-4000-8000-000000000001";

function openStore(): { store: Store; dir: string; scratch: string } {
  const scratch = scratchDir("spex-readthrough-");
  const dir = join(scratch, "state");
  return { store: new Store({ machineIdentity, dir, own: "tester" }), dir, scratch };
}

function folderIn(scratch: string, name: string): string {
  const folder = join(scratch, name);
  mkdirSync(folder, { recursive: true });
  return folder;
}

const intentFile = (fields: Record<string, unknown> & { id: string }): string =>
  JSON.stringify({ format: 1, text: fields.id, createdAt: 1, ...fields });

test("storage-29: home pairs, project names and clones changed outside the core read through on the next query, which makes no folder", (t) => {
  const { store, dir, scratch } = openStore();
  t.after(() => store.close());
  const folder = folderIn(scratch, "work");
  const project = store.registerProject(folder, "work");
  const clone = join(dir, "workspace", "tester", "work-spex");
  const homeFile = join(dir, "home.yaml");
  const edit = (change: (home: { folders: { path: string; repository: string }[] }) => void): void => {
    const home = parseYaml(readFileSync(homeFile, "utf8"));
    change(home);
    writeFileSync(homeFile, stringifyYaml(home));
  };

  // An editor renames the project and moves its working folder.
  writeFileSync(join(clone, "project.json"), JSON.stringify({ format: 1, name: "Renamed", remote: null }));
  const moved = folderIn(scratch, "moved");
  edit((home) => { home.folders[0].path = moved; });
  assert.equal(store.getProject(project.id)?.name, "Renamed");
  assert.equal(store.getProject(project.id)?.path, moved);
  assert.equal(store.getProjectByPath(moved)?.id, project.id);
  assert.equal(store.getProjectByPath(folder), undefined);
  assert.equal(store.home.folderOf(project.id)?.path, moved);

  // A clone another process put under workspace/, paired by an editor.
  const added = join(dir, "workspace", "acme", "tool-spex");
  mkdirSync(added, { recursive: true });
  writeFileSync(join(added, "project.json"), JSON.stringify({ format: 1, name: "Tool", remote: null }));
  const toolFolder = folderIn(scratch, "tool");
  edit((home) => { home.folders.push({ path: toolFolder, repository: "acme/tool-spex" }); });
  assert.deepEqual(store.listProjects().map((entry) => [entry.id, entry.name]).sort(), [["acme/tool-spex", "Tool"], [project.id, "Renamed"]]);
  assert.ok(store.listRepositories().some((repository) => repository.key === "acme/tool-spex"));
  assert.equal(existsSync(join(added, "sessions")), false, "a query makes no folder in the clone it found");

  // A damaged project file is reported with its bytes kept, and its
  // repair clears the report (storage-12, core-service-86).
  const projectFile = join(added, "project.json");
  writeFileSync(projectFile, "{ not json");
  assert.ok(store.storageDiagnostics().some((report) => report.file === projectFile && !report.blocking));
  assert.equal(readFileSync(projectFile, "utf8"), "{ not json");
  writeFileSync(projectFile, JSON.stringify({ format: 1, name: "Tool again", remote: null }));
  assert.ok(!store.storageDiagnostics().some((report) => report.file === projectFile));
  assert.equal(store.getProject("acme/tool-spex")?.name, "Tool again");

  // The clone removed from outside: absent from every read, its pair a
  // repair (projects-10), and no read recreates it or answers with
  // another clone's sessions.
  rmSync(clone, { recursive: true, force: true });
  assert.equal(store.getProject(project.id), undefined);
  assert.equal(store.repository(project.id), undefined);
  assert.deepEqual(store.listProjects().map((entry) => entry.id), ["acme/tool-spex"]);
  assert.ok(store.storageDiagnostics().some((report) => report.repair?.kind === "folder" && report.repair.repository === project.id));
  assert.throws(() => store.sessionStore(project.id), /no records /);
  assert.equal(existsSync(clone), false);

  // Your own group's clone, made only at the open, is refused once gone.
  const own = join(dir, "workspace", "tester", "tester-spex");
  rmSync(own, { recursive: true, force: true });
  assert.throws(() => store.ownRepository(), /no records /);
  assert.throws(() => store.sessionStore(), /no records /);
  assert.equal(existsSync(own), false);
});

test("storage-29: intent files added, edited, damaged, repaired and removed outside the core read through on the next query, damaged bytes untouched", (t) => {
  const { store, dir, scratch } = openStore();
  t.after(() => store.close());
  const project = store.registerProject(folderIn(scratch, "work"), "work");
  const intents = join(dir, "workspace", "tester", "work-spex", "intents");
  const a = randomUUID(); const b = randomUUID();
  store.addIntent({ id: a, projectId: project.id, text: "A", createdAt: 1 });

  // Added by a sync: listed, found by its source and by its assets.
  writeFileSync(join(intents, `${b}.json`), intentFile({ id: b, createdAt: 2, source: { kind: "issue", ref: "7" } }));
  assert.deepEqual(store.listOpenIntents().map((intent) => intent.id), [a, b]);
  assert.equal(store.openIntentBySource(project.id, "issue", "7")?.id, b);
  assert.equal(store.intentAssetsDir(b), join(intents, `${b}.assets`));

  // Edited: closed, and dispatched; a write applies to the file as it stands.
  writeFileSync(join(intents, `${b}.json`), intentFile({ id: b, createdAt: 2, source: { kind: "issue", ref: "7" }, closed: { as: "done", at: 5 } }));
  writeFileSync(join(intents, `${a}.json`), intentFile({ id: a, text: "A", dispatched: { sessionId: SESSION, turnId: 1, at: 3 } }));
  assert.deepEqual(store.listOpenIntents().map((intent) => intent.id), [a]);
  assert.deepEqual(store.listClosedIntents(project.id, 10).map((intent) => intent.id), [b]);
  assert.equal(store.openIntentBySource(project.id, "issue", "7"), undefined);
  assert.deepEqual(store.listSessionDispatches(SESSION), [{ intentId: a, turnId: 1, open: true }]);
  store.editIntent(a, "A edited");
  assert.deepEqual(store.getIntent(a)?.dispatched, { sessionId: SESSION, turnId: 1, at: 3 });

  // Damaged: listed nowhere, reported without blocking, refused with its
  // cause, and never replaced — not by an edit, not by a new intent of
  // its id (storage-4, storage-12).
  const damaged = join(intents, `${a}.json`);
  writeFileSync(damaged, "{ broken");
  assert.equal(store.getIntent(a), undefined);
  assert.deepEqual(store.listOpenIntents(), []);
  assert.deepEqual(store.listSessionDispatches(SESSION), []);
  assert.ok(store.storageDiagnostics().some((report) => report.file === damaged && !report.blocking));
  assert.throws(() => store.editIntent(a, "lost"), (error: Error & { file?: string }) => error.file === damaged);
  assert.throws(() => store.addIntent({ id: a, projectId: project.id, text: "again", createdAt: 9 }), /duplicate queue/);
  assert.equal(readFileSync(damaged, "utf8"), "{ broken");

  // Repaired: listed again, its report gone.
  writeFileSync(damaged, intentFile({ id: a, text: "A repaired" }));
  assert.equal(store.getIntent(a)?.text, "A repaired");
  assert.ok(!store.storageDiagnostics().some((report) => report.file === damaged));

  // Removed: gone from History, and no write names it.
  rmSync(join(intents, `${b}.json`));
  assert.deepEqual(store.listClosedIntents(project.id, 10), []);
  assert.throws(() => store.removeIntent(b), /no intent/);

  // An id another clone's intent holds is refused, and nothing is written.
  const elsewhere = randomUUID();
  const other = join(dir, "workspace", "acme", "tool-spex", "intents");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, `${elsewhere}.json`), intentFile({ id: elsewhere }));
  assert.throws(() => store.addIntent({ id: elsewhere, projectId: project.id, text: "twin", createdAt: 9 }), /duplicate queue/);
  assert.equal(existsSync(join(intents, `${elsewhere}.json`)), false);
});

test("storage-29: a damaged home file refuses its writes until repaired, a deleted one stays refused, and damage found at the open recovers on repair", (t) => {
  const { store, dir, scratch } = openStore();
  let open: Store = store;
  t.after(() => open.close());
  const first = store.registerProject(folderIn(scratch, "work"), "work");
  const homeFile = join(dir, "home.yaml");
  const blocked = (reader: Store): boolean => reader.storageDiagnostics().some((report) => report.blocking && report.file.endsWith("home.yaml"));

  // Damaged under the running store: reported, every write needing it
  // refused, its bytes kept, and no pair answered from an earlier
  // reading; unrelated preferences stay available.
  const good = readFileSync(homeFile);
  const paired = (reader: Store): string[] => reader.listProjects().map((project) => project.id).sort();
  assert.deepEqual(paired(store), [first.id]);
  const device = (parseYaml(good.toString("utf8")) as { device: string }).device;
  assert.equal(store.home.device, device);
  writeFileSync(homeFile, "format: 2\n");
  assert.ok(blocked(store));
  assert.deepEqual(paired(store), []);
  assert.equal(store.getProject(first.id), undefined);
  assert.equal(store.getProjectByPath(first.path), undefined);
  // One unsaved home stands for the whole damaged period, keeping the
  // device read before the damage.
  assert.equal(store.home.device, device);
  assert.equal(store.home.device, device);
  assert.throws(() => store.registerProject(folderIn(scratch, "second"), "second"), /home\.yaml/);
  assert.equal(readFileSync(homeFile, "utf8"), "format: 2\n");
  store.setPref("unrelated", 1);
  assert.equal(store.getPref("unrelated"), 1);

  // Repaired by hand: the report leaves, its pairs read again, and the
  // next write proceeds.
  writeFileSync(homeFile, good);
  assert.ok(!blocked(store));
  assert.deepEqual(paired(store), [first.id]);
  assert.equal(store.getProjectByPath(first.path)?.id, first.id);
  assert.equal(store.home.device, device);
  const second = store.registerProject(folderIn(scratch, "second"), "second");

  // Deleted once read: no pairs, refused, never written again.
  const latest = readFileSync(homeFile);
  rmSync(homeFile);
  assert.ok(blocked(store));
  assert.deepEqual(paired(store), []);
  assert.equal(store.home.device, device);
  assert.equal(store.getProject(second.id), undefined);
  assert.throws(() => store.registerProject(folderIn(scratch, "third"), "third"), /home\.yaml changed meanwhile; retry/);
  assert.equal(existsSync(homeFile), false);
  assert.equal(store.getPref("unrelated"), 1);
  store.close();

  // Damaged at the open: the store starts, refuses, and recovers once the
  // file is repaired, its pairs read from it.
  writeFileSync(homeFile, "format: 2\n");
  // No device was read yet, so the open's placeholder has its own.
  open = new Store({ machineIdentity, dir, own: "tester" });
  assert.ok(blocked(open));
  assert.deepEqual(open.listProjects(), []);
  assert.notEqual(open.home.device, device);
  writeFileSync(homeFile, latest);
  assert.ok(!blocked(open));
  assert.equal(open.home.device, device);
  assert.deepEqual(open.listProjects().map((project) => project.id).sort(), [first.id, second.id].sort());
  open.registerProject(folderIn(scratch, "third"), "third");
});

test("storage-29: a damaged session file's and forge cache's reports follow their files: gone once the file is, another standing, damage found again reported", async (t) => {
  const { store, dir, scratch } = openStore();
  t.after(() => store.close());
  const project = store.registerProject(folderIn(scratch, "work"), "work");
  await store.initializeSessions();
  const sessions = join(dir, "workspace", "tester", "work-spex", "sessions");
  const gone = "72000000-0000-4000-8000-000000000001";
  const kept = "72000000-0000-4000-8000-000000000002";
  for (const id of [gone, kept]) writeFileSync(join(sessions, `${id}.json`), "{ damaged");
  await store.adoptForeignSessions(project.id);
  const reported = (id: string) => store.sessionDiagnostics().find((report) => report.file === join(sessions, `${id}.json`));
  const untracked = (): string[] => store.untrackedSessionPaths(project.id);
  assert.ok(reported(gone)?.blocking && reported(kept)?.blocking, "both damaged sessions are reported as blocking");
  assert.throws(() => store.assertWritable({ sessionId: gone }), (error: Error & { file?: string }) => error.file === join(sessions, `${gone}.json`));
  assert.ok(untracked().includes(join("sessions", `${gone}.json`)));

  // Removed from outside, with no reload: its report and its untracked
  // mark leave; the other, still damaged, stays reported and refused.
  rmSync(join(sessions, `${gone}.json`));
  assert.equal(reported(gone), undefined);
  assert.doesNotThrow(() => store.assertWritable({ sessionId: gone }));
  assert.ok(!untracked().some((path) => path.includes(gone)));
  assert.ok(reported(kept)?.blocking);
  assert.throws(() => store.assertWritable({ sessionId: kept }), (error: Error & { file?: string }) => error.file === join(sessions, `${kept}.json`));
  assert.ok(untracked().includes(join("sessions", `${kept}.json`)));

  // The forge cache, read again where its file changed.
  const cache = join(dir, "local", "forge-cache.json");
  const cacheReport = () => store.storageDiagnostics().find((report) => report.file === cache);
  writeFileSync(cache, "{ damaged");
  assert.equal(cacheReport()?.blocking, false);
  rmSync(cache);
  assert.equal(cacheReport(), undefined, "a removed cache is no longer reported");
  writeFileSync(cache, "{ damaged again");
  assert.equal(cacheReport()?.blocking, false, "a cache damaged again is reported again");
  writeFileSync(cache, JSON.stringify({ format: 1, entries: {} }));
  assert.equal(cacheReport(), undefined, "a repaired cache is no longer reported");
});

class Client {
  private readonly socket: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private nextId = 0;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => { this.messages.push(JSON.parse(String(data)) as ServerMessage); });
  }
  open(): Promise<void> { return new Promise((resolveOpen, reject) => { this.socket.once("open", () => resolveOpen()); this.socket.once("error", reject); }); }
  close(): void { this.socket.close(); }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<Extract<ServerMessage, { type: "reply" }>> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    for (let i = 0; i < 2000; i += 1) {
      const reply = this.messages.find((m) => m.type === "reply" && m.id === id);
      if (reply?.type === "reply") return reply;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${type}: no reply`);
  }
}

test("core-service-55: a source an intent took while another queue's attachments were adopted refuses that queue: one file, one conflict", async (t) => {
  const scratch = scratchDir("spex-readthrough-core-");
  const env = { PATH: process.env.PATH ?? "", HOME: join(scratch, "user"), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const folder = folderIn(scratch, "work");
  execFileSync("git", ["init", "-q", folder]);
  const service = await CoreService.start({
    token: "test", dataDir: join(scratch, "state"), env, home: env.HOME, machineIdentity,
    adapterImports: fakeAdapterImports({}).imports, adapterRuntime: () => ({ usable: true }), watchConfig: false,
  });
  const client = new Client(service.port());
  // The adoption seam: the first queue after `hold()` waits there until
  // released, while every other command runs.
  type Adopt = (...args: unknown[]) => Promise<void>;
  const media = (service as unknown as { media: { adopt: Adopt } }).media;
  const adopt = media.adopt.bind(media) as Adopt;
  let release = (): void => {};
  let reached: Promise<void> = Promise.resolve();
  let holding = false;
  const hold = (): void => {
    let arrived = (): void => {};
    reached = new Promise((resolveReached) => { arrived = resolveReached; });
    const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
    holding = true;
    media.adopt = async (...args) => {
      if (holding) { holding = false; arrived(); await held; }
      return adopt(...args);
    };
  };
  t.after(async () => { release(); client.close(); await service.stop(); });
  await client.open();
  const registered = await client.command("project.register", { path: folder });
  assert.ok(registered.ok, JSON.stringify(registered));
  const projectId = (registered.result as { id: string }).id;
  const intents = join(scratch, "state", "workspace", ...projectId.split("/"), "intents");
  const holders = (kind: string, ref: string): string[] => (existsSync(intents) ? readdirSync(intents) : [])
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(intents, name), "utf8")) as { id: string; source?: { kind: string; ref: string }; closed?: unknown })
    .filter((intent) => intent.source?.kind === kind && intent.source.ref === ref && !intent.closed)
    .map((intent) => intent.id);

  // A sync writes an intent holding the issue while the queue adopts.
  hold();
  const queued = client.command("intent.queue", { projectId, text: "Fix issue 7", source: { kind: "issue", ref: "7" } });
  await reached;
  const synced = randomUUID();
  mkdirSync(intents, { recursive: true });
  writeFileSync(join(intents, `${synced}.json`), intentFile({ id: synced, text: "Synced", source: { kind: "issue", ref: "7" } }));
  release();
  const refused = await queued;
  assert.ok(!refused.ok && refused.error.code === "conflict", JSON.stringify(refused));
  assert.deepEqual(holders("issue", "7"), [synced]);

  // Two queues of one pull request: the one adopting while the other
  // stores is refused.
  hold();
  const slow = client.command("intent.queue", { projectId, text: "Review PR 9", source: { kind: "pr", ref: "9" } });
  await reached;
  const fast = await client.command("intent.queue", { projectId, text: "Review PR 9 too", source: { kind: "pr", ref: "9" } });
  assert.ok(fast.ok, JSON.stringify(fast));
  release();
  const late = await slow;
  assert.ok(!late.ok && late.error.code === "conflict", JSON.stringify(late));
  assert.deepEqual(holders("pr", "9"), [(fast.result as { id: string }).id]);
});

test("storage-29: a home file damaged under a running core routes no command into the working folder it paired", async (t) => {
  const scratch = scratchDir("spex-readthrough-home-core-");
  const env = { PATH: process.env.PATH ?? "", HOME: join(scratch, "user"), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const folder = folderIn(scratch, "work");
  execFileSync("git", ["init", "-q", folder]);
  const service = await CoreService.start({
    token: "test", dataDir: join(scratch, "state"), env, home: env.HOME, machineIdentity,
    adapterImports: fakeAdapterImports({}).imports, adapterRuntime: () => ({ usable: true }), watchConfig: false,
  });
  const client = new Client(service.port());
  t.after(async () => { client.close(); await service.stop(); });
  await client.open();
  const registered = await client.command("project.register", { path: folder });
  assert.ok(registered.ok, JSON.stringify(registered));
  const projectId = (registered.result as { id: string }).id;
  const clone = join(scratch, "state", "workspace", ...projectId.split("/"));
  const spec = join(folder, "specs", "map.md");
  mkdirSync(join(folder, "specs"), { recursive: true });
  writeFileSync(spec, "original\n");
  // The write reaches the folder while the pair reads.
  const written = await client.command("specs.write", { projectId, path: "map.md", content: "edited\n" });
  assert.ok(written.ok, JSON.stringify(written));
  assert.equal(readFileSync(spec, "utf8"), "edited\n");

  // Damaged: the pair is no longer read, so no command acts in the folder.
  writeFileSync(join(scratch, "state", "home.yaml"), "format: 2\n");
  const write = await client.command("specs.write", { projectId, path: "map.md", content: "remembered\n" });
  assert.ok(!write.ok && write.error.code === "not_found" && write.error.message === `no project ${projectId}`, JSON.stringify(write));
  assert.equal(readFileSync(spec, "utf8"), "edited\n");
  const draft = await client.command("draft.create", { projectId, draftId: "remembered", org: "acme", license: "MIT" });
  assert.ok(!draft.ok && draft.error.code === "invalid_request" && draft.error.message === `${projectId.slice(projectId.lastIndexOf("/") + 1).replace(/-spex$/, "")} has no project folder on this computer — Open here first`, JSON.stringify(draft));
  assert.equal(existsSync(join(clone, "authoring", "remembered.json")), false);
  const compile = await client.command("compile.run", {
    projectId, playbookId: "remembered", sourceText: "# Remembered\n", roles: ["coder"], command: "remembered", intent: "Remembered",
    bindings: { coder: "dev.coder" },
  });
  assert.ok(!compile.ok && compile.error.code === "not_found" && compile.error.message === `no project ${projectId}`, JSON.stringify(compile));
  assert.equal(existsSync(join(folder, "spex-packages")), false);
});

test("storage-29: a compile admitted before home.yaml is damaged settles as this device's while the file does not read", { timeout: 60_000 }, async (t) => {
  const scratch = scratchDir("spex-readthrough-compile-");
  const stub = join(scratch, "stub-slc.cjs");
  writeFileSync(stub, stubSlcSource("['Helper']"));
  const env = {
    PATH: process.env.PATH ?? "", HOME: join(scratch, "user"), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    SPEX_SLC: `${process.execPath} ${stub}`,
  };
  const folder = folderIn(scratch, "work");
  execFileSync("git", ["init", "-q", folder]);
  // The compiler seam: the toolchain probe answers a system Node, and
  // the stub slc, once admitted, waits until released, then runs.
  let release = (): void => {};
  const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
  let arrived = (): void => {};
  const reached = new Promise<void>((resolveReached) => { arrived = resolveReached; });
  const compileSpawner: LineSpawner = async (command, args, cwd, onLine, signal, spawnEnv) => {
    const probe = args.length === 1 && args[0] === "--version";
    if (probe && command !== process.execPath) { onLine("v24.1.0"); return 0; }
    if (!probe) { arrived(); await held; }
    return defaultSpawner(command, args, cwd, onLine, signal, spawnEnv);
  };
  const service = await CoreService.start({
    token: "test", dataDir: join(scratch, "state"), env, home: env.HOME, machineIdentity,
    adapterImports: fakeAdapterImports({ fallback: { deltas: ["Noted."], result: "Noted." } }).imports,
    adapterRuntime: () => ({ usable: true }), watchConfig: false, compileSpawner,
  });
  const client = new Client(service.port());
  t.after(async () => { release(); client.close(); await service.stop(); });
  await client.open();
  const registered = await client.command("project.register", { path: folder });
  assert.ok(registered.ok, JSON.stringify(registered));
  const projectId = (registered.result as { id: string }).id;
  const clone = join(scratch, "state", "workspace", ...projectId.split("/"));
  const homeFile = join(scratch, "state", "home.yaml");
  const device = (parseYaml(readFileSync(homeFile, "utf8")) as { device: string }).device;
  const created = await client.command("draft.create", { projectId, draftId: "held", org: "acme", license: "MIT" });
  assert.ok(created.ok, JSON.stringify(created));
  const instance = (created.result as { instance: string }).instance;
  const source = await client.command("draft.source.write", { projectId, draftId: "held", instance, content: "# Held\n\nRoles:\n\n- Helper\n" });
  assert.ok(source.ok, JSON.stringify(source));
  const marker = (): { outcome: string; device?: string } | undefined =>
    (JSON.parse(readFileSync(join(clone, "authoring", "held.json"), "utf8")) as { compile?: { outcome: string; device?: string } }).compile;

  // Admitted under the device read: its running marker names it.
  const compiled = client.command("draft.compile", { projectId, draftId: "held", instance });
  await reached;
  const running = marker();
  assert.equal(running?.outcome, "running");
  assert.equal(running?.device, device);

  // Damaged before the compiler finishes: the compile still settles as
  // this device's, its outcome recorded and never left running.
  writeFileSync(homeFile, "format: 2\n");
  release();
  const reply = await compiled;
  assert.ok(reply.ok, JSON.stringify(reply));
  assert.deepEqual((reply.result as { roles: string[] }).roles, ["Helper"]);
  assert.equal(marker()?.outcome, "ok");
  assert.equal(readFileSync(homeFile, "utf8"), "format: 2\n");
});
