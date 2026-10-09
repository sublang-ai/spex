// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { defaultRunCommand, type RunCommand } from "./forge.js";
import type { SpaceGit } from "./space-git.js";
import { clonePath, createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
test.after(() => fixture.dispose());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const run: RunCommand = (command, args, cwd, env) => defaultRunCommand(command, args, cwd, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test",
  GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test",
  ...env,
});

for (const action of ["project.register", "project.create"] as const) {
  test(`storage-28: ${action} cannot allocate a destination held by an unstarted Join`, async (t) => {
    const host = await fixture.startHost();
    const home = await fixture.startHome(`allocation-${action}`, { host, project: false, extra: { signIn: "browser", runCommand: run } });
    const cloneEntered = deferred();
    const cloneReleased = deferred();
    t.after(async () => { cloneReleased.resolve(); await home.stop(); });
    const signed = home.client.mark();
    await fixture.signIn(home, host);
    await home.client.waitRepository(signed, "ada/ada-spex", (row) => row.sync.phase === "done");
    const listed = host.script.addRepository({ group: "ada", name: "reserved-spex", project: { format: 1, name: "Host project", remote: null } });
    await home.client.settle("space.sync", { repository: "ada/ada-spex" });
    const key = "ada/reserved-spex";
    const destination = clonePath(home.dataDir, key);
    // Hold only scheduling; the real Git clone runs once released.
    const probe = (home.service as unknown as { space: { probe: SpaceGit } }).space.probe;
    const gitRun = probe.run.bind(probe);
    let paused = false;
    probe.run = async (args, options) => {
      if (!paused && args[0] === "clone" && args.at(-1) === destination) {
        paused = true;
        cloneEntered.resolve();
        await cloneReleased.promise;
      }
      return gitRun(args, options);
    };
    const from = home.client.mark();
    await home.client.expectOk("space.join", { hostId: listed.id });
    await cloneEntered.promise;
    assert.equal(existsSync(destination), false);
    const path = action === "project.register" ? fixture.gitFolder("reserved") : join(fixture.scratch, `new-${action}`, "reserved");
    const project = await home.client.expectOk(action, { path });
    assert.equal(project.id, "ada/reserved-2-spex");
    const allocated = clonePath(home.dataDir, project.id);
    const records = readFileSync(join(allocated, "project.json"), "utf8");
    cloneReleased.resolve();
    await home.client.waitRepository(from, key, (row) => row.state === "reachable" && row.sync.phase !== "running");
    assert.equal(readFileSync(join(allocated, "project.json"), "utf8"), records);
    assert.equal(JSON.parse(readFileSync(join(destination, "project.json"), "utf8")).name, "Host project");
    assert.equal((await home.client.expectOk("project.list", {})).find((entry) => entry.id === project.id)?.path, path);
  });
}

test("space-37: Rebind rechecks the clone gate after its working-folder lookup", async (t) => {
  const lookupEntered = deferred();
  const lookupReleased = deferred();
  const saveEntered = deferred();
  const saveReleased = deferred();
  let holdPath: string | undefined;
  const controlledRun: RunCommand = async (command, args, cwd, env) => {
    const result = await run(command, args, cwd, env);
    if (holdPath === cwd && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      holdPath = undefined;
      lookupEntered.resolve();
      await lookupReleased.promise;
    }
    return result;
  };
  const home = await fixture.startHome("allocation-rebind", { extra: { runCommand: controlledRun } });
  t.after(async () => { lookupReleased.resolve(); saveReleased.resolve(); await home.stop(); });
  const { key } = await fixture.addFolder(home, home.projectDir);
  await home.client.expectOk("space.remote.set", { repository: key, url: fixture.bareRepo() });
  const replacement = fixture.gitFolder("replacement");
  holdPath = replacement;
  const rebinding = home.client.command("project.rebind", { projectId: key, path: replacement });
  await lookupEntered.promise;
  home.hooks.beforeStep = async (event) => {
    if (event.repository === key && event.op === "sync" && event.step === "save") {
      saveEntered.resolve();
      await saveReleased.promise;
    }
  };
  const syncing = home.client.settle("space.sync", { repository: key });
  await saveEntered.promise;
  lookupReleased.resolve();
  const reply = await rebinding;
  assert.ok(!reply.ok);
  assert.equal(reply.error.code, "busy");
  assert.equal((await home.client.expectOk("project.list", {})).find((entry) => entry.id === key)?.path, home.projectDir);
  saveReleased.resolve();
  assert.equal((await syncing).sync.phase, "done");
  assert.equal((await home.client.expectOk("project.rebind", { projectId: key, path: replacement })).path, replacement);
});
