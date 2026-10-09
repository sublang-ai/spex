// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createModuleLoader, type LoadModule } from "./config.js";
import { clonePath, createSpaceHarness, OWN_KEY } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
test.after(() => fixture.dispose());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Only the next module load waits; another command can finish normally. */
function controlledLoader() {
  const load = createModuleLoader();
  let next: { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | undefined;
  const loadModule: LoadModule = async (specifier) => {
    const pause = next;
    next = undefined;
    const loaded = await load(specifier);
    if (pause) {
      pause.entered.resolve();
      await pause.released.promise;
    }
    return loaded;
  };
  return {
    loadModule,
    pause() {
      const pause = { entered: deferred(), released: deferred() };
      next = pause;
      return { entered: pause.entered.promise, release: pause.released.resolve };
    },
  };
}

const captainEdit = (instruction: string) => ({ op: { kind: "captain.set" as const, patch: { instruction } } });
const projectEdit = (repository: string) => ({
  repository,
  op: { kind: "playbook.add" as const, playbookId: "code", roles: { coder: "dev.coder" } },
});

test("shared-config-roundtrip-7: a prepared own-group edit preserves a competing accepted edit", async (t) => {
  const loader = controlledLoader();
  const home = await fixture.startHome("config-concurrent", { extra: { loadModule: loader.loadModule } });
  t.after(() => home.stop());
  const pause = loader.pause();
  t.after(pause.release);
  const editing = home.client.command("config.edit", captainEdit("obsolete instruction"));
  await pause.entered;
  await home.client.expectOk("config.edit", captainEdit("accepted instruction"));
  const accepted = readFileSync(home.configPath, "utf8");
  pause.release();
  const reply = await editing;
  assert.ok(!reply.ok);
  assert.equal(reply.error.code, "conflict");
  assert.equal(readFileSync(home.configPath, "utf8"), accepted);
  await home.client.expectOk("config.edit", captainEdit("retried instruction"));
  assert.match(readFileSync(home.configPath, "utf8"), /retried instruction/);
});

for (const target of ["own", "project"] as const) {
  test(`shared-config-roundtrip-7: a prepared ${target} edit refuses a Sync holding its destination`, async (t) => {
    const loader = controlledLoader();
    const home = await fixture.startHome(`config-sync-${target}`, { extra: { loadModule: loader.loadModule } });
    t.after(() => home.stop());
    const added = target === "project" ? await fixture.addFolder(home, home.projectDir) : undefined;
    const key = added?.key ?? OWN_KEY;
    const config = added ? join(added.clone, "config", "playbook.config.yaml") : home.configPath;
    const before = existsSync(config) ? readFileSync(config, "utf8") : null;
    await home.client.expectOk("space.remote.set", { repository: key, url: fixture.bareRepo() });
    const pause = loader.pause();
    const saveEntered = deferred();
    const saveReleased = deferred();
    t.after(() => { pause.release(); saveReleased.resolve(); });
    home.hooks.beforeStep = async (event) => {
      if (event.repository === key && event.op === "sync" && event.step === "save") {
        saveEntered.resolve();
        await saveReleased.promise;
      }
    };
    const editing = home.client.command("config.edit", added ? projectEdit(key) : captainEdit("late instruction"));
    await pause.entered;
    const syncing = home.client.settle("space.sync", { repository: key });
    await saveEntered.promise;
    pause.release();
    const reply = await editing;
    assert.ok(!reply.ok);
    assert.equal(reply.error.code, "busy");
    assert.equal(existsSync(config) ? readFileSync(config, "utf8") : null, before);
    saveReleased.resolve();
    assert.equal((await syncing).sync.phase, "done");
    await home.client.expectOk("config.edit", added ? projectEdit(key) : captainEdit("retried instruction"));
  });
}

for (const input of ["own", "project"] as const) {
  test(`shared-config-roundtrip-7: a prepared project edit checks its ${input} config input`, async (t) => {
    const loader = controlledLoader();
    const home = await fixture.startHome(`config-project-${input}`, { extra: { loadModule: loader.loadModule } });
    t.after(() => home.stop());
    const { key, clone } = await fixture.addFolder(home, home.projectDir);
    const config = join(clone, "config", "playbook.config.yaml");
    assert.equal(existsSync(config), false);
    const pause = loader.pause();
    t.after(pause.release);
    const editing = home.client.command("config.edit", projectEdit(key));
    await pause.entered;
    await home.client.expectOk("config.edit", input === "own" ? captainEdit("new own input") : projectEdit(key));
    const ownBefore = readFileSync(home.configPath, "utf8");
    const projectBefore = existsSync(config) ? readFileSync(config, "utf8") : null;
    pause.release();
    const reply = await editing;
    assert.ok(!reply.ok);
    assert.equal(reply.error.code, "conflict");
    assert.equal(readFileSync(home.configPath, "utf8"), ownBefore);
    assert.equal(existsSync(config) ? readFileSync(config, "utf8") : null, projectBefore);
  });
}

test("shared-config-roundtrip-7: removal while a project edit is prepared leaves its clone absent", async (t) => {
  const loader = controlledLoader();
  const home = await fixture.startHome("config-removed", { extra: { loadModule: loader.loadModule } });
  t.after(() => home.stop());
  const { key, clone } = await fixture.addFolder(home, home.projectDir);
  const pause = loader.pause();
  t.after(pause.release);
  const editing = home.client.command("config.edit", projectEdit(key));
  await pause.entered;
  await home.client.expectOk("project.remove", { projectId: key, confirm: true });
  assert.equal(existsSync(clone), false);
  pause.release();
  const reply = await editing;
  assert.ok(!reply.ok);
  assert.equal(reply.error.code, "not_found");
  assert.equal(existsSync(clone), false);
});

test("shared-config-roundtrip-7: sign-in movement invalidates a prepared own-group edit", async (t) => {
  const loader = controlledLoader();
  const host = await fixture.startHost();
  const home = await fixture.startHome("config-moved", { host, extra: { signIn: "browser", loadModule: loader.loadModule } });
  t.after(() => home.stop());
  const pause = loader.pause();
  t.after(pause.release);
  const editing = home.client.command("config.edit", captainEdit("old destination"));
  await pause.entered;
  const from = home.client.mark();
  await fixture.signIn(home, host);
  await home.client.waitRepository(from, "ada/ada-spex", (row) => row.sync.phase === "done");
  const config = join(clonePath(home.dataDir, "ada/ada-spex"), "config", "playbook.config.yaml");
  const moved = readFileSync(config, "utf8");
  pause.release();
  const reply = await editing;
  assert.ok(!reply.ok);
  assert.equal(reply.error.code, "not_found");
  assert.equal(existsSync(home.configPath), false);
  assert.equal(readFileSync(config, "utf8"), moved);
  await home.client.expectOk("config.edit", captainEdit("current destination"));
  assert.match(readFileSync(config, "utf8"), /current destination/);
});
