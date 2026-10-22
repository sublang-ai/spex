// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createSessionStore } from "@sublang/playbook/session-store";
import { createAssetStore } from "@sublang/playbook/session-assets";
import { Store } from "./store.js";
import { Home } from "./home.js";
import { finishBoundedHomeSessions, stageBoundedHomeSessions } from "./migrate-bounded-sessions.js";
import { reserveStorageHome } from "./storage-git.js";
import { sha256 } from "./files.js";
import { seedHistorySession } from "./testing/demo.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Import Fixture", GIT_AUTHOR_EMAIL: "import@example.test", GIT_COMMITTER_NAME: "Import Fixture", GIT_COMMITTER_EMAIL: "import@example.test" };
function fixture() {
  const root = scratchDir("spex-bounded-import-"); const home = join(root, "home"); const cwd = join(root, "project");
  mkdirSync(home); mkdirSync(cwd); execFileSync("git", ["init", "-q", cwd], { env });
  return { root, home, cwd };
}
async function source(home: string, cwd: string) {
  const sessionsDir = join(home, "sessions");
  const id = await seedHistorySession(sessionsDir, cwd, [
    { type: "turn_started", turnId: 1, timestamp: 1000, turn: { id: 1, prompt: "Bounded CLI history" } },
    { type: "turn_finished", turnId: 1, timestamp: 1001 },
  ]);
  const assets = createAssetStore({ directory: join(sessionsDir, `${id}.assets`) }); await assets.prepare();
  const bytes = Buffer.from("synthetic session-owned asset\n");
  const asset = await assets.importAsset({ bytes, name: "fixture.bin", mimeType: "application/octet-stream" });
  const path = join(sessionsDir, `${id}.json`); const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.assets = { version: 1, entries: [asset] }; writeFileSync(path, JSON.stringify(manifest), { mode: 0o600 });
  const shared = createSessionStore({ sessionsDir }); await shared.prepare(); await shared.migrate(id);
  const hints = "synthetic local continuation hint\n";
  writeFileSync(join(sessionsDir, `${id}.hints.json`), hints, { mode: 0o600 });
  const semantic = await shared.readManifest(id); const physical = readFileSync(path);
  assert.equal(JSON.parse(physical.toString()).schemaVersion, 8);
  return { id, sessionsDir, shared, semantic, physical, asset, bytes, hints };
}
function receipt(home: string) {
  const migrations = join(home, "local", "migrations");
  for (const id of readdirSync(migrations)) {
    const dir = join(migrations, id); const file = join(dir, "receipt.json");
    if (!existsSync(file)) continue;
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (value.kind === "bounded-sessions") return { dir, value };
  }
  throw new Error("bounded import receipt missing");
}
function established(home: string, cwd: string): string {
  const store = new Store({ dir: home, own: "tester", machineIdentity, env });
  try { return store.registerProject(cwd, "Project").id; } finally { store.close(); }
}

test("storage-37: a bounded family is retained before the released former-home migration, then imported whole", async (t) => {
  const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const project = randomUUID(); const alias = join(f.root, "former-project");
  mkdirSync(join(f.home, "local"), { mode: 0o700 });
  writeFileSync(join(f.home, "projects.json"), JSON.stringify({ v: 2, projects: [{ id: project, name: "Project", registeredAt: 1 }] }));
  writeFileSync(join(f.home, "local", "project-paths.json"), JSON.stringify({ v: 1, bindings: [{ id: project, path: f.cwd, aliases: [alias] }] }));
  const seeded = await source(f.home, alias);
  const store = await Store.open({ dir: f.home, own: "tester", machineIdentity, env });
  t.after(() => store.close()); await store.initializeSessions();
  const key = store.home.keyForFolder(f.cwd)!;
  assert.equal(store.sessionRepository(seeded.id), key, "the recorded alias selects its project's clone");
  const destination = store.sessionStore(key);
  assert.deepEqual(await destination.readManifest(seeded.id), seeded.semantic);
  assert.deepEqual(readFileSync(join(destination.sessionsDir, `${seeded.id}.json`)), seeded.physical);
  assert.deepEqual(Buffer.from(await destination.readAsset(seeded.id, seeded.asset)), seeded.bytes);
  assert.equal(readFileSync(join(destination.sessionsDir, `${seeded.id}.hints.json`), "utf8"), seeded.hints);
  assert.equal(existsSync(join(seeded.sessionsDir, `${seeded.id}.json`)), false);
  assert.equal(existsSync(join(seeded.sessionsDir, `${seeded.id}.chunks`)), false);
  const imported = receipt(f.home);
  assert.equal(imported.value.complete, true);
  assert.ok(readdirSync(join(f.home, "local", "migrations")).some((id) => {
    const path = join(f.home, "local", "migrations", id, "receipt.json");
    return existsSync(path) && JSON.parse(readFileSync(path, "utf8")).kind === "groups";
  }), "the released groups migration has its separate receipt");
  for (const file of imported.value.sessions[0].files) assert.equal(sha256(readFileSync(join(imported.dir, "inputs", seeded.id, file.path))), file.sha256);
  assert.equal(execFileSync("git", ["-C", dirname(destination.sessionsDir), "check-ignore", `${`sessions/${seeded.id}.hints.json`}`], { env, encoding: "utf8" }).trim(), `sessions/${seeded.id}.hints.json`);
});

test("storage-37: a later default-location bounded session respects a held source lease and resumes identical partial publication", async (t) => {
  const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const key = established(f.home, f.cwd); const seeded = await source(f.home, f.cwd);
  const held = await seeded.shared.acquireManagement(seeded.id);
  try { await assert.rejects(() => Store.open({ dir: f.home, own: "tester", machineIdentity, env }), /lease|owner|active|held/i); }
  finally { await held.release(); }
  assert.deepEqual(readFileSync(join(seeded.sessionsDir, `${seeded.id}.json`)), seeded.physical);
  const release = reserveStorageHome(f.home, machineIdentity);
  try {
    await stageBoundedHomeSessions(f.home);
    const imported = receipt(f.home); const entry = imported.value.sessions[0];
    const chunk = entry.files.find((file: { path: string }) => file.path.startsWith(`${seeded.id}.chunks/`));
    assert.ok(chunk);
    const sessions = join(Home.load(f.home).clonePath(key), "sessions");
    mkdirSync(dirname(join(sessions, chunk.path)), { recursive: true, mode: 0o700 });
    writeFileSync(join(sessions, chunk.path), readFileSync(join(imported.dir, "inputs", seeded.id, chunk.path)), { mode: 0o600 });
  } finally { release(); }
  const store = await Store.open({ dir: f.home, own: "tester", machineIdentity, env });
  t.after(() => store.close()); await store.initializeSessions();
  assert.equal(store.sessionRepository(seeded.id), key);
  assert.deepEqual(await store.sessionStore(key).readManifest(seeded.id), seeded.semantic);
  assert.equal(receipt(f.home).value.complete, true);
});

test("storage-37: divergent destination bytes and an unsafe destination parent stay unchanged with retained inputs", async (t) => {
  for (const defect of ["diverged", "linked"] as const) await t.test(defect, async () => {
    const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
    const key = established(f.home, f.cwd); const seeded = await source(f.home, f.cwd);
    const release = reserveStorageHome(f.home, machineIdentity);
    try {
      await stageBoundedHomeSessions(f.home);
      const home = Home.load(f.home); const sessions = join(home.clonePath(key), "sessions");
      const outside = join(f.root, "outside"); mkdirSync(outside); writeFileSync(join(outside, "canary"), "synthetic unchanged\n");
      const target = join(sessions, `${seeded.id}.json`);
      if (defect === "diverged") writeFileSync(target, "synthetic divergent root\n", { mode: 0o600 });
      else symlinkSync(outside, join(sessions, `${seeded.id}.chunks`), "dir");
      await assert.rejects(() => finishBoundedHomeSessions(f.home, home), /changed|unsafe|link/i);
      if (defect === "diverged") assert.equal(readFileSync(target, "utf8"), "synthetic divergent root\n");
      assert.equal(readFileSync(join(outside, "canary"), "utf8"), "synthetic unchanged\n");
      const imported = receipt(f.home);
      assert.equal(imported.value.complete, false);
      assert.deepEqual(readFileSync(join(imported.dir, "inputs", seeded.id, `${seeded.id}.json`)), seeded.physical);
    } finally { release(); }
  });
});
