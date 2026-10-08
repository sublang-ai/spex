// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one-time migration from the former home (storage-9, storage-15):
// a home written exactly as the former layout's writers wrote it — the
// registry, this device's path map, one act log per project, one
// sessions folder, the config and the preferences at the root, the home
// itself a Git repository — becomes a home of spex repositories.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAssetStore } from "@sublang/playbook/session-assets";
import { parse as parseYaml } from "yaml";
import { WebSocket } from "ws";

import { foldFormerIntentActs, parseFormerIntentLog, parsePrefs } from "./app-storage.js";
import { defaultOwnName } from "./home.js";
import { CoreService } from "./service.js";
import { Store } from "./store.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { seedHistorySession } from "./testing/demo.js";
import { scratchDir } from "./testing/scratch.js";
import type { Command, CommandResults, MediaAsset, ServerMessage } from "./protocol.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const line = (act: object): string => `${JSON.stringify({ v: 1, ...act })}\n`;

// ---------------------------------------------------------------------------
// The former layout's writers, kept here as fixtures: what the core wrote
// before DR-103, byte for byte (ApplicationRegistry.save, appendIntentAct,
// savePrefs, saveForgeCache, the Space's Initialize).
// ---------------------------------------------------------------------------

interface FormerProject { id: string; name: string; registeredAt: number; path: string; aliases: string[] }

function writeFormerRegistry(home: string, projects: FormerProject[]): void {
  mkdirSync(join(home, "local"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "local", "project-paths.json"), JSON.stringify({ v: 1, bindings: projects.map((p) => ({ id: p.id, path: p.path, aliases: p.aliases })) }));
  writeFileSync(join(home, "projects.json"), JSON.stringify({ v: 2, projects: projects.map((p) => ({ id: p.id, name: p.name, registeredAt: p.registeredAt })) }));
}

function appendFormerAct(home: string, projectId: string, act: object): void {
  mkdirSync(join(home, "intents"), { recursive: true });
  appendFileSync(join(home, "intents", `${projectId}.jsonl`), line(act));
}

function writeFormerPrefs(home: string, prefs: Record<string, unknown>): void {
  writeFileSync(join(home, "prefs.json"), JSON.stringify({ v: 1, prefs }));
}

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Former", GIT_AUTHOR_EMAIL: "former@example.test", GIT_COMMITTER_NAME: "Former", GIT_COMMITTER_EMAIL: "former@example.test" };
const git = (cwd: string, ...args: string[]): string => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The former Space's Initialize: the home itself a repository on main. */
function initializeFormerHome(home: string): void {
  writeFileSync(join(home, ".gitignore"), "/local/\n/prefs.json\n/meta.json\n/forge-cache.json\n/.lock*\n*.hints.json\n");
  git(home, "init", "-q", "-b", "main");
  git(home, "add", "-A", "--", ".");
  git(home, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Initialize Spex space");
}

const FORMER_CONFIG = `# The former home's config — comments stay.
captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => { this.messages.push(JSON.parse(String(data)) as ServerMessage); });
  }
  open(): Promise<void> { return new Promise((resolveOpen, reject) => { this.socket.once("open", () => resolveOpen()); this.socket.once("error", reject); }); }
  close(): void { this.socket.close(); }
  async ok<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    for (let i = 0; i < 2000; i += 1) {
      const reply = this.messages.find((m) => m.type === "reply" && m.id === id);
      if (reply?.type === "reply") {
        if (!reply.ok) throw new Error(`${type}: ${reply.error.code} ${reply.error.message}`);
        return reply.result as CommandResults[T];
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${type}: no reply`);
  }
}

test("storage-15: a former home of two projects and one unmatched session migrates once, then opens through the core and the CLI", async () => {
  const scratch = scratchDir("spex-groups-migration-");
  const home = join(scratch, "home");
  mkdirSync(home, { recursive: true });
  const folderA = join(scratch, "alpha");
  const folderB = join(scratch, "beta");
  for (const folder of [folderA, folderB]) { mkdirSync(folder); git(folder, "init", "-q"); }
  // The remote the code reports, a credential before its host never written.
  git(folderA, "remote", "add", "origin", "https://token@example.test/acme/alpha.git");
  const formerB = join(scratch, "old", "beta");
  const projectA: FormerProject = { id: randomUUID(), name: "alpha", registeredAt: 1, path: folderA, aliases: [] };
  const projectB: FormerProject = { id: randomUUID(), name: "beta", registeredAt: 2, path: folderB, aliases: [formerB] };
  writeFormerRegistry(home, [projectA, projectB]);

  // Sessions in the one former folder: one ran in A, one ran in B's
  // former folder, one in a folder no project holds.
  const sessions = join(home, "sessions");
  mkdirSync(sessions, { recursive: true, mode: 0o700 });
  const t = 1_700_000_000_000;
  const sA = await seedHistorySession(sessions, folderA, [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt: "Ship alpha" }, timestamp: t },
    { type: "turn_finished", turnId: 1, timestamp: t + 1 },
  ]);
  const sB = await seedHistorySession(sessions, formerB, [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt: "Beta work" }, timestamp: t + 2 },
    { type: "turn_finished", turnId: 1, timestamp: t + 3 },
  ]);
  const unmatched = join(scratch, "elsewhere");
  const sU = await seedHistorySession(sessions, unmatched, [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt: "Loose work" }, timestamp: t + 4 },
    { type: "turn_finished", turnId: 1, timestamp: t + 5 },
  ]);
  // A provider token in a hints file never reaches any history.
  writeFileSync(join(sessions, `${sA}.hints.json`), JSON.stringify({ token: "sk-never-in-git" }));

  // A's act log: an open intent with an attachment, a worked and done
  // one, a dropped one never worked, a removed one, and one linked
  // after the first. B's: one open intent. Ranks and links everywhere.
  const assets = createAssetStore({ directory: join(home, "intents", `${projectA.id}.assets`) });
  mkdirSync(join(home, "intents"), { recursive: true });
  const picture = join(scratch, "picture.txt"); writeFileSync(picture, "attached bytes");
  const asset = await assets.importAsset({ path: picture, mimeType: "text/plain", name: "picture.txt" }) as MediaAsset;
  const [open, worked, dropped, removed, linked, other] = Array.from({ length: 6 }, () => randomUUID());
  appendFormerAct(home, projectA.id, { act: "queue", intent: { id: open, projectId: projectA.id, text: "Open work", attachments: [asset], rank: "m", createdAt: t + 10 } });
  appendFormerAct(home, projectA.id, { act: "queue", intent: { id: worked, projectId: projectA.id, text: "Worked", source: { kind: "issue", ref: "4", url: "https://example.test/4" }, rank: "c", createdAt: t - 10 } });
  appendFormerAct(home, projectA.id, { act: "dispatch", id: worked, sessionId: sA, turnId: 1, at: t });
  appendFormerAct(home, projectA.id, { act: "close", id: worked, as: "done", at: t + 20 });
  appendFormerAct(home, projectA.id, { act: "queue", intent: { id: dropped, projectId: projectA.id, text: "Never ran", rank: "d", createdAt: t + 11 } });
  appendFormerAct(home, projectA.id, { act: "close", id: dropped, as: "dropped", at: t + 21 });
  appendFormerAct(home, projectA.id, { act: "queue", intent: { id: removed, projectId: projectA.id, text: "Removed", rank: "e", createdAt: t + 12 } });
  appendFormerAct(home, projectA.id, { act: "dispatch", id: removed, sessionId: sA, turnId: 1, at: t });
  appendFormerAct(home, projectA.id, { act: "close", id: removed, as: "done", at: t + 22 });
  appendFormerAct(home, projectA.id, { act: "remove", id: removed, at: t + 23 });
  appendFormerAct(home, projectA.id, { act: "queue", intent: { id: linked, projectId: projectA.id, text: "After open", rank: "n", afterId: open, createdAt: t + 13 } });
  appendFormerAct(home, projectA.id, { act: "move", id: linked, rank: "a" });
  appendFormerAct(home, projectB.id, { act: "queue", intent: { id: other, projectId: projectB.id, text: "Beta queued", rank: "i", createdAt: t + 14 } });

  mkdirSync(join(home, "config"), { recursive: true });
  writeFileSync(join(home, "config", "playbook.config.yaml"), FORMER_CONFIG);
  writeFormerPrefs(home, {
    [`viewed:${sA}`]: 1,
    [`session:${sA}:agents`]: { captain: { model: "claude-pinned" } },
    "space:lastSync": { at: t, sent: 1, received: 0 },
    "draft:triage:player": "dev.coder",
    language: "en",
  });
  writeFileSync(join(home, "forge-cache.json"), JSON.stringify({ v: 1, entries: {} }));
  mkdirSync(join(home, "playbooks", "triage"), { recursive: true });
  writeFileSync(join(home, "playbooks", "triage", "triage.md"), "# Triage\n");
  mkdirSync(join(home, "local", "drafts", "triage"), { recursive: true });
  writeFileSync(join(home, "local", "drafts", "triage", "draft.json"), JSON.stringify({ v: 2, id: "triage", createdAt: 1, touchedAt: 1, queued: [], failures: 0 }));
  initializeFormerHome(home);
  const formerHead = git(home, "rev-parse", "HEAD");

  // A divergent destination stops the first run before it is complete;
  // nothing it found is overwritten, and the retry finishes the work.
  mkdirSync(join(home, "local"), { recursive: true });
  writeFileSync(join(home, "local", "prefs.json"), '{"format":1,"prefs":{"stray":true}}');
  await assert.rejects(Store.open({ machineIdentity, dir: home }), /destination diverged/);
  assert.equal(readFileSync(join(home, "local", "prefs.json"), "utf8"), '{"format":1,"prefs":{"stray":true}}');
  const receipts = readdirSync(join(home, "local", "migrations"));
  assert.equal(receipts.length, 1);
  assert.equal(JSON.parse(readFileSync(join(home, "local", "migrations", receipts[0], "receipt.json"), "utf8")).complete, false);
  rmSync(join(home, "local", "prefs.json"));
  const store = await Store.open({ machineIdentity, dir: home });
  store.close();

  // 1 — the receipt kept every rewritten input's bytes and records the steps.
  const receipt = JSON.parse(readFileSync(join(home, "local", "migrations", receipts[0], "receipt.json"), "utf8")) as {
    format: number; id: string; kind: string; inputs: { path: string; sha256: string }[]; steps: Record<string, unknown>[]; complete: boolean;
  };
  assert.deepEqual(Object.keys(receipt), ["format", "id", "kind", "inputs", "steps", "complete"]);
  assert.equal(receipt.kind, "groups");
  assert.equal(receipt.complete, true);
  const kept = receipt.inputs.map((entry) => entry.path).sort();
  for (const path of ["projects.json", "local/project-paths.json", "prefs.json", "config/playbook.config.yaml", `intents/${projectA.id}.jsonl`, `intents/${projectB.id}.jsonl`]) assert.ok(kept.includes(path), path);
  const configIndex = receipt.inputs.findIndex((entry) => entry.path === "config/playbook.config.yaml");
  assert.equal(readFileSync(join(home, "local", "migrations", receipts[0], "inputs", String(configIndex)), "utf8"), FORMER_CONFIG);
  assert.deepEqual(receipt.steps.find((entry) => entry.step === "config")?.dropped, [{ id: "code", from: "@sublang/playbook/code/registry" }]);

  // 2 — home.yaml: this device's user name, both folders, B's alias.
  const own = defaultOwnName();
  const file = parseYaml(readFileSync(join(home, "home.yaml"), "utf8")) as { format: number; own: string; folders: { path: string; repository: string; aliases?: string[] }[] };
  assert.equal(file.format, 1);
  assert.equal(file.own, own);
  const keyA = `${own}/alpha-spex`; const keyB = `${own}/beta-spex`;
  assert.deepEqual(file.folders, [{ path: folderA, repository: keyA }, { path: folderB, repository: keyB, aliases: [formerB] }]);

  // 3 — each project's clone: one commit on spex, project.json, intents
  // as files with ranks and links dropped, attachments beside them, sessions.
  const cloneA = join(home, "workspace", own, "alpha-spex");
  const cloneB = join(home, "workspace", own, "beta-spex");
  for (const clone of [cloneA, cloneB]) {
    assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "spex");
    assert.equal(git(clone, "rev-list", "--count", "HEAD"), "1");
    assert.equal(git(clone, "status", "--porcelain"), "", "everything the migration wrote is committed or ignored");
    assert.ok(!git(clone, "log", "-p", "--all").includes("sk-never-in-git"), "no provider token in any history");
    assert.match(readFileSync(join(clone, ".gitignore"), "utf8"), /# BEGIN Spex managed storage rules/);
  }
  assert.deepEqual(JSON.parse(readFileSync(join(cloneA, "project.json"), "utf8")), { format: 1, name: "alpha", remote: "https://example.test/acme/alpha.git" });
  assert.deepEqual(JSON.parse(readFileSync(join(cloneB, "project.json"), "utf8")), { format: 1, name: "beta", remote: null });
  const intentFiles = (clone: string) => readdirSync(join(clone, "intents")).filter((name) => name.endsWith(".json")).sort();
  assert.deepEqual(intentFiles(cloneA), [`${open}.json`, `${worked}.json`, `${linked}.json`].sort());
  assert.deepEqual(intentFiles(cloneB), [`${other}.json`]);
  assert.deepEqual(JSON.parse(readFileSync(join(cloneA, "intents", `${linked}.json`), "utf8")), { format: 1, id: linked, text: "After open", createdAt: t + 13 });
  assert.deepEqual(JSON.parse(readFileSync(join(cloneA, "intents", `${worked}.json`), "utf8")), {
    format: 1, id: worked, text: "Worked", source: { kind: "issue", ref: "4", url: "https://example.test/4" }, createdAt: t - 10,
    dispatched: { sessionId: sA, turnId: 1, at: t }, closed: { as: "done", at: t + 20 },
  });
  const attached = createAssetStore({ directory: join(cloneA, "intents", `${open}.assets`) });
  assert.equal(Buffer.from(await attached.readAsset(asset)).toString("utf8"), "attached bytes");
  assert.ok(existsSync(join(cloneA, "sessions", `${sA}.json`)) && existsSync(join(cloneA, "sessions", `${sA}.records.jsonl`)));
  assert.ok(existsSync(join(cloneA, "sessions", `${sA}.hints.json`)), "hints travel with their session, ignored");
  assert.ok(existsSync(join(cloneB, "sessions", `${sB}.json`)), "a session in a recorded alias is the project's");

  // 4 — your own group's clone: the config with every from dropped, the
  // unmatched session.
  const ownClone = join(home, "workspace", own, `${own}-spex`);
  const config = readFileSync(join(ownClone, "config", "playbook.config.yaml"), "utf8");
  assert.ok(!config.includes("from:"), config);
  assert.match(config, /# The former home's config — comments stay\./);
  assert.ok(existsSync(join(ownClone, "sessions", `${sU}.json`)));
  assert.equal(git(ownClone, "rev-list", "--count", "HEAD"), "1");

  // 5 — preferences under local/, the former history aside, the library in place.
  const prefs = parsePrefs(JSON.parse(readFileSync(join(home, "local", "prefs.json"), "utf8")));
  assert.equal(prefs[`viewed:${sA}`], 1);
  assert.deepEqual(prefs[`session:${sA}:agents`], { captain: { model: "claude-pinned" } });
  assert.equal(prefs["authoring:triage:player"], "dev.coder");
  assert.ok(!("space:lastSync" in prefs) && !("draft:triage:player" in prefs));
  assert.equal(execFileSync("git", ["--git-dir", join(home, "local", "former-home.git"), "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), formerHead);
  assert.ok(existsSync(join(home, "playbooks", "triage", "triage.md")) && existsSync(join(home, "local", "drafts", "triage", "draft.json")));
  assert.deepEqual(receipt.steps.find((entry) => entry.step === "local")?.retired, ["playbooks/triage", "local/drafts"]);
  for (const gone of ["projects.json", "prefs.json", "forge-cache.json", "intents", "sessions", "config", ".git", "local/project-paths.json"]) {
    assert.ok(!existsSync(join(home, gone)), `${gone} is gone from the root`);
  }
  // Nothing outside workspace/ is a Git work tree.
  assert.notEqual(spawnSync("git", ["-C", home, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim(), home);

  // A restart migrates nothing again.
  (await Store.open({ machineIdentity, dir: home })).close();
  assert.equal(readdirSync(join(home, "local", "migrations")).length, 1);

  // Opened through the core (the desktop and server shells' path)...
  const { imports } = fakeAdapterImports({ fallback: { result: "ok" } });
  const env = { PATH: process.env.PATH ?? "", HOME: join(scratch, "user"), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const service = await CoreService.start({ token: "test", dataDir: home, env, home: env.HOME, adapterImports: imports, adapterRuntime: () => ({ usable: true }), watchConfig: false });
  const client = new Client(service.port());
  try {
    await client.open();
    const projects = await client.ok("project.list", {});
    assert.deepEqual(projects.map((p) => [p.id, p.path, p.name]), [[keyA, folderA, "alpha"], [keyB, folderB, "beta"]]);
    // Sessions list by the clone that holds them (storage-6).
    const listed = await client.ok("session.list", {});
    assert.deepEqual(listed.map((s) => [s.id, s.projectId]).sort(), [[sA, keyA], [sB, keyB]].sort());
    const ledger = await client.ok("ledger.get", {});
    assert.deepEqual(ledger.intents.map((entry) => [entry.intent.id, entry.intent.projectId, !!entry.next]),
      [[open, keyA, true], [linked, keyA, false], [other, keyB, true]]);
    assert.ok(ledger.intents.every((entry) => !("rank" in entry.intent) && !("afterId" in entry.intent)));
    // The config composes with the built-in in place of the dropped from.
    assert.equal((await client.ok("config.get", {})).status, "valid");
    // The unmatched session waits in your own group's spex repository.
    const diagnostics = await client.ok("storage.diagnostics", {});
    const repair = diagnostics.find((entry) => entry.repair?.kind === "repository")?.repair;
    assert.deepEqual(repair && { repository: repair.repository, directories: repair.directories, sessions: repair.sessions }, { repository: `${own}/${own}-spex`, directories: [unmatched], sessions: 1 });
    // A working folder added afterwards pairs with a local spex repository.
    const later = join(scratch, "gamma"); mkdirSync(later); git(later, "init", "-q");
    const gamma = await client.ok("project.register", { path: later });
    assert.equal(gamma.id, `${own}/gamma-spex`);
    assert.equal(git(join(home, "workspace", own, "gamma-spex"), "symbolic-ref", "--short", "HEAD"), "spex");
  } finally {
    client.close();
    await service.stop();
  }

  // ...and through the storage Git tool, the home selected explicitly.
  const cli = spawnSync(process.execPath, [join(ROOT, "scripts", "storage-git.mjs"), "--home", home, "--repository", keyA, "validate"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(Array.isArray(JSON.parse(cli.stdout)));
  const viaEnv = spawnSync(process.execPath, [join(ROOT, "scripts", "storage-git.mjs"), "--repository", keyB, "validate"], { encoding: "utf8", env: { ...process.env, SPEX_HOME: home } });
  assert.equal(viaEnv.status, 0, viaEnv.stderr);
  rmSync(scratch, { recursive: true, force: true });
});

test("storage-9: the former act log replays once — ranks, links and removals folded, damage refused", () => {
  const project = randomUUID(); const id = randomUUID(); const next = randomUUID(); const sessionId = randomUUID();
  const intent = { id, projectId: project, text: "first", rank: "a", createdAt: 1 };
  const contents = line({ act: "queue", intent }) + line({ act: "edit", id, text: "edited" }) + line({ act: "move", id, rank: "b" }) + line({ act: "link", id, afterId: next }) + line({ act: "link", id, afterId: null }) + line({ act: "dispatch", id, sessionId, turnId: 1, at: 2 }) + line({ act: "close", id, as: "done", at: 3 }) + '{"v":1';
  const folded = foldFormerIntentActs(parseFormerIntentLog(contents, project), "fixture");
  assert.deepEqual(folded.intents.get(id), { ...intent, text: "edited", rank: "b", dispatched: { sessionId, turnId: 1, at: 2 }, closedAt: 3, closedAs: "done" });
  assert.throws(() => parseFormerIntentLog(`${contents}\n`, project), /invalid completed/);
  assert.throws(() => parseFormerIntentLog(line({ act: "queue", intent, extra: true }), project), /expected fields/);
  assert.throws(() => foldFormerIntentActs(parseFormerIntentLog(line({ act: "queue", intent }) + line({ act: "queue", intent }), project), "fixture"), /duplicate queue/);
  assert.throws(() => foldFormerIntentActs([{ act: "edit", id, text: "missing" }], "fixture"), /unknown intent/);
});

test("storage-9: an unknown registry version is preserved and refuses the migration", async () => {
  const home = scratchDir("spex-groups-unknown-");
  const original = '{"v":55,"projects":[]}';
  writeFileSync(join(home, "projects.json"), original);
  await assert.rejects(Store.open({ machineIdentity, dir: home }), /unsupported registry version/);
  assert.equal(readFileSync(join(home, "projects.json"), "utf8"), original);
  assert.ok(!existsSync(join(home, "home.yaml")));
  rmSync(home, { recursive: true, force: true });
});

test("storage-9: a home holding the former layout refuses a synchronous open", () => {
  const home = scratchDir("spex-groups-sync-");
  writeFileSync(join(home, "prefs.json"), JSON.stringify({ v: 1, prefs: {} }));
  assert.throws(() => new Store({ machineIdentity, dir: home }), /Store\.open/);
  assert.ok(!existsSync(join(home, ".lease")), "the refused open leaves no lease");
  rmSync(home, { recursive: true, force: true });
  void tmpdir;
});
