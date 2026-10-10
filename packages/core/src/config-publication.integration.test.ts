// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { createModuleLoader, type LoadModule } from "./config.js";
import type { EnvironmentManager } from "./environments.js";
import { clonePath, createSpaceHarness, OWN_KEY } from "./testing/space-harness.js";
import { stubSlcSource } from "./testing/stub-slc.js";

const fixture = createSpaceHarness();
test.after(() => fixture.dispose());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** A wait on something the test started, bounded and naming what it waited for. */
async function within<T>(promise: Promise<T>, what: string, ms = 30_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms waiting for ${what}`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

/** Only the next module load a `config.edit` command makes waits: a load
 * of startup, of an environment settling or of a reload runs as it would.
 * The command's own context, not the load's caller, marks the load. */
function controlledLoader() {
  const load = createModuleLoader();
  const editing = new AsyncLocalStorage<true>();
  let next: { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | undefined;
  const loadModule: LoadModule = async (specifier) => {
    const pause = next && editing.getStore() ? next : undefined;
    if (pause) next = undefined;
    const loaded = await load(specifier);
    if (pause) {
      pause.entered.resolve();
      await pause.released.promise;
    }
    return loaded;
  };
  return {
    loadModule,
    /** Run this core's `config.edit` commands inside the edit's context. */
    attach(home: { service: object }) {
      type Execute = (client: unknown, command: { type: string }) => Promise<unknown>;
      const execute = (Reflect.get(home.service, "execute") as Execute).bind(home.service);
      Reflect.set(home.service, "execute", ((client, command) =>
        command.type === "config.edit" ? editing.run(true, () => execute(client, command)) : execute(client, command)) as Execute);
    },
    pause() {
      const pause = { entered: deferred(), released: deferred() };
      next = pause;
      return {
        get entered() {
          return within(pause.entered.promise, "the config edit's module load");
        },
        release: pause.released.resolve,
      };
    },
  };
}

type Home = Awaited<ReturnType<typeof fixture.startHome>>;

/** The test's one cleanup: every hold it parked released before its core stops. */
function cleanup(t: { after: (fn: () => Promise<void>) => void }, home: Home, ...releases: (() => void)[]): void {
  t.after(async () => {
    for (const release of releases) release();
    await home.stop();
  });
}

const captainEdit = (instruction: string) => ({ op: { kind: "captain.set" as const, patch: { instruction } } });
const projectEdit = (repository: string) => ({
  repository,
  op: { kind: "playbook.add" as const, playbookId: "code", roles: { coder: "dev.coder" } },
});

test("shared-config-roundtrip-7: a prepared own-group edit preserves a competing accepted edit", async (t) => {
  const loader = controlledLoader();
  const home = await fixture.startHome("config-concurrent", { extra: { loadModule: loader.loadModule } });
  loader.attach(home);
  const pause = loader.pause();
  cleanup(t, home, pause.release);
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
    loader.attach(home);
    const saveEntered = deferred();
    const saveReleased = deferred();
    const pause = loader.pause();
    cleanup(t, home, pause.release, saveReleased.resolve);
    const added = target === "project" ? await fixture.addFolder(home, home.projectDir) : undefined;
    const key = added?.key ?? OWN_KEY;
    const config = added ? join(added.clone, "config", "playbook.config.yaml") : home.configPath;
    const before = existsSync(config) ? readFileSync(config, "utf8") : null;
    await home.client.expectOk("space.remote.set", { repository: key, url: fixture.bareRepo() });
    home.hooks.beforeStep = async (event) => {
      if (event.repository === key && event.op === "sync" && event.step === "save") {
        saveEntered.resolve();
        await saveReleased.promise;
      }
    };
    const editing = home.client.command("config.edit", added ? projectEdit(key) : captainEdit("late instruction"));
    await pause.entered;
    const syncing = home.client.settle("space.sync", { repository: key });
    await within(saveEntered.promise, "the sync's Save step");
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
    loader.attach(home);
    const pause = loader.pause();
    cleanup(t, home, pause.release);
    const { key, clone } = await fixture.addFolder(home, home.projectDir);
    const config = join(clone, "config", "playbook.config.yaml");
    assert.equal(existsSync(config), false);
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
  loader.attach(home);
  const pause = loader.pause();
  cleanup(t, home, pause.release);
  const { key, clone } = await fixture.addFolder(home, home.projectDir);
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
  loader.attach(home);
  const pause = loader.pause();
  cleanup(t, home, pause.release);
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

// ---------------------------------------------------------------------------
// draft.register over the protocol: the enabling's prepared config is held
// through the real environment transaction's fifth argument, and each
// competing act lands before the synchronous publication checks it.
// ---------------------------------------------------------------------------

const STUB_SLC = join(fixture.scratch, "config-publication-stub-slc.cjs");
writeFileSync(STUB_SLC, stubSlcSource("['Helper']"));

/** The toolchain probe wants a system Node; the stub slc itself runs. */
const compileSpawner: LineSpawner = (command, args, cwd, onLine, signal, env) => {
  if (args.length === 1 && args[0] === "--version" && command !== process.execPath) {
    onLine("v24.1.0");
    return Promise.resolve(0);
  }
  return defaultSpawner(command, args, cwd, onLine, signal, env);
};

const compiling = { env: { SPEX_SLC: `${process.execPath} ${STUB_SLC}` }, compileSpawner };

/** A compiled authoring session `triage` of a project, idle, and its instance. */
async function compiledDraft(home: Home, projectId: string): Promise<string> {
  const created = await home.client.expectOk("draft.create", { projectId, draftId: "triage" });
  const address = { projectId, draftId: "triage", instance: created.instance };
  await home.client.expectOk("draft.source.write", { ...address, content: "# Triage\n\nRoles:\n\n- Helper\n" });
  assert.deepEqual(await home.client.expectOk("draft.compile", address), { ok: true, roles: ["Helper"] });
  const start = Date.now();
  for (;;) {
    const opened = await home.client.expectOk("draft.open", address);
    if (opened.draft.activity === "idle" && opened.draft.state === "compiled") return created.instance;
    if (Date.now() - start > 60_000) throw new Error(`the compiled draft stayed ${opened.draft.activity}/${opened.draft.state}`);
    await fixture.sleep(25);
  }
}

/** Each next enabling's prepared config waits for the test's release. */
function heldEnablings(home: Home) {
  const environments = Reflect.get(home.service, "environments") as EnvironmentManager;
  const requestAndInstall = environments.requestAndInstall.bind(environments);
  const parked = new Set<() => void>();
  let next: { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | undefined;
  environments.requestAndInstall = (...args: Parameters<EnvironmentManager["requestAndInstall"]>) => {
    const gate = next;
    next = undefined;
    const prepare = args[4];
    if (gate && prepare) {
      args[4] = async (modules) => {
        const prepared = await prepare(modules);
        gate.entered.resolve();
        await gate.released.promise;
        return prepared;
      };
    }
    return requestAndInstall(...args);
  };
  return {
    hold() {
      const gate = { entered: deferred(), released: deferred() };
      next = gate;
      parked.add(gate.released.resolve);
      return {
        get entered() {
          return within(gate.entered.promise, "the enabling's prepared config");
        },
        release: gate.released.resolve,
      };
    },
    release() {
      for (const release of parked) release();
      environments.requestAndInstall = requestAndInstall;
    },
  };
}

const read = (path: string): string | null => (existsSync(path) ? readFileSync(path, "utf8") : null);

/** A folder's files with their bytes, or none where it does not stand. */
const tree = (dir: string): [string, string][] =>
  existsSync(dir) ? [...fixture.snapshot(dir)].map(([path, bytes]): [string, string] => [path, bytes.toString("base64")]).sort() : [];

test("environments-27: a held draft.register publishes nothing whose commit-time inputs changed, and keeps an environment request submitted meanwhile", async (t) => {
  const home = await fixture.startHome("register-matrix", { env: compiling.env, extra: { compileSpawner } });
  const enablings = heldEnablings(home);
  const stepReleases = new Set<() => void>();
  cleanup(t, home, enablings.release, () => { for (const release of stepReleases) release(); });
  const { key, clone } = await fixture.addFolder(home, home.projectDir);
  const projectConfig = join(clone, "config", "playbook.config.yaml");
  const requestsPath = join(clone, "spex.yaml");
  const lockPath = join(clone, "spex.lock");
  await home.client.expectOk("space.remote.set", { repository: OWN_KEY, url: fixture.bareRepo() });
  await home.client.expectOk("space.remote.set", { repository: key, url: fixture.bareRepo() });
  const instance = await compiledDraft(home, key);

  // A Space operation parked at its first step owns its clone (space-21):
  // a Check consults no blocker, so it starts on either clone while the
  // enabling holds the project's environment; a Sync admits only where
  // the clone is free of that environment and of the compile, so here it
  // holds your own group's clone.
  const first = { check: "check", sync: "save" } as const;
  const held: Map<string, { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> }> = new Map();
  home.hooks.beforeStep = async (event) => {
    const gate = held.get(`${event.op} ${event.repository}`);
    if (gate && (event.op === "check" || event.op === "sync") && event.step === first[event.op]) {
      held.delete(`${event.op} ${event.repository}`);
      gate.entered.resolve();
      await gate.released.promise;
    }
  };
  const operationHeld = async (op: keyof typeof first, repository: string): Promise<() => Promise<void>> => {
    const gate = { entered: deferred(), released: deferred() };
    held.set(`${op} ${repository}`, gate);
    stepReleases.add(gate.released.resolve);
    assert.deepEqual(await home.client.expectOk(op === "check" ? "space.fetch" : "space.sync", { repository }), { accepted: true });
    await within(gate.entered.promise, `the ${op} of ${repository}`);
    return async () => {
      gate.released.resolve();
      const start = Date.now();
      while ((await home.client.repository(repository)).sync.phase === "running") {
        if (Date.now() - start > 30_000) throw new Error(`the ${op} of ${repository} never ended`);
        await fixture.sleep(25);
      }
    };
  };

  const registration = (newPlayer: boolean) => ({
    projectId: key, draftId: "triage", instance, command: "triage", intent: "Triage new issues",
    bindings: { Helper: newPlayer ? "dev.helper" : "dev.coder" },
    ...(newPlayer ? { newPlayers: { "dev.helper": { adapter: "claude" as const } } } : {}),
  });
  /** What an enabling would publish, byte for byte: requests, lock,
   * installed files, the clone's and the working folder's exports with
   * the working folder's exclude block, and both configs. */
  const published = () => ({
    own: read(home.configPath),
    project: read(projectConfig),
    requests: read(requestsPath),
    lock: read(lockPath),
    packages: tree(join(clone, "packages")),
    skills: tree(join(clone, "skills")),
    working: tree(home.projectDir),
    exclude: read(join(home.projectDir, ".git", "info", "exclude")),
  });

  /** One case: the enabling held with its config prepared, `during`
   * lands, and the release meets the commit's check. */
  const attempt = async (name: string, newPlayer: boolean, during: () => Promise<void>, code: string): Promise<void> => {
    const gate = enablings.hold();
    const replying = home.client.command("draft.register", registration(newPlayer));
    await gate.entered;
    await during();
    const accepted = published();
    gate.release();
    const reply = await replying;
    assert.equal(reply.ok ? "ok" : reply.error.code, code, `${name}: ${reply.ok ? "published" : reply.error.message}`);
    assert.deepEqual(published(), accepted, `${name}: the refused enabling published nothing and kept what was accepted meanwhile`);
  };

  // Each case below is the sole change the commit can see.
  for (const [op, repository] of [["check", OWN_KEY], ["check", key], ["sync", OWN_KEY]] as const) {
    let finish: () => Promise<void> = async () => {};
    await attempt(`a ${op} holding ${repository}`, true, async () => { finish = await operationHeld(op, repository); }, "busy");
    await finish();
  }
  await attempt("your own config edited, used as input only", false, async () => {
    await home.client.expectOk("config.edit", captainEdit("accepted while enabling, input"));
  }, "conflict");
  assert.match(read(home.configPath)!, /accepted while enabling, input/);
  await attempt("your own config edited, also a destination", true, async () => {
    await home.client.expectOk("config.edit", captainEdit("accepted while enabling, destination"));
  }, "conflict");
  assert.doesNotMatch(read(home.configPath)!, /dev\.helper/);
  await attempt("the project's config edited", true, async () => {
    await home.client.expectOk("config.edit", projectEdit(key));
  }, "conflict");
  assert.match(read(projectConfig)!, /code:/);
  assert.doesNotMatch(read(projectConfig)!, /triage/);
  const elsewhere = fixture.gitFolder("rebound");
  await attempt("the project's working folder rebound", true, async () => {
    await home.client.expectOk("project.rebind", { projectId: key, path: elsewhere });
  }, "not_found");
  assert.equal(existsSync(join(elsewhere, "spex-packages")), false);
  await home.client.expectOk("project.rebind", { projectId: key, path: home.projectDir });
  for (const [what, path] of [["spex.yaml", requestsPath], ["spex.lock", lockPath]] as const) {
    const before = readFileSync(path, "utf8");
    // A writer outside the core: an editor, or Git run by hand.
    await attempt(`${what} changed outside the core`, true, async () => { appendFileSync(path, "\n"); }, "conflict");
    assert.equal(readFileSync(path, "utf8"), `${before}\n`);
    writeFileSync(path, before);
  }
  const manifest = join(home.projectDir, "spex-packages", "triage", "meta.yaml");
  const manifestBefore = readFileSync(manifest, "utf8");
  assert.match(manifestBefore, /^version: /m);
  await attempt("the draft's manifest changed outside the core", true, async () => {
    writeFileSync(manifest, manifestBefore.replace(/^version: .*$/m, "version: 9.9.9"));
  }, "conflict");
  writeFileSync(manifest, manifestBefore);
  const aside = join(fixture.scratch, "register-matrix-clone-aside");
  await attempt("the clone moved away outside the core", true, async () => { renameSync(clone, aside); }, "not_found");
  assert.equal(existsSync(clone), false, "the clone is not made again");
  renameSync(aside, clone);

  // playbook-library-7: an environment request submitted while the
  // enabling holds the queue is accepted once it is released, and keeps
  // its change when the enabling is refused.
  const extra = join(home.projectDir, "spex-packages", "extra");
  mkdirSync(join(extra, "skills", "en", "extra"), { recursive: true });
  writeFileSync(join(extra, "meta.yaml"), "format: 2\norg: local\nname: extra\nversion: 0.1.0\ndescription: Extra\nartifacts:\n  extra:\n    kind: skill\n    language: en\n");
  writeFileSync(join(extra, "skills", "en", "extra", "SKILL.md"), "---\nname: extra\ndescription: The extra skill\n---\n\nUse extra.\n");
  const gate = enablings.hold();
  const replying = home.client.command("draft.register", registration(true));
  await gate.entered;
  const requesting = home.client.command("environment.request", { repository: key, name: "local/extra", request: { kind: "path", path: "spex-packages/extra" } });
  await home.client.expectOk("config.edit", captainEdit("accepted beside the request"));
  gate.release();
  const refused = await replying;
  assert.equal(refused.ok ? "ok" : refused.error.code, "conflict");
  assert.equal((await requesting).ok, true, "the request is accepted on the release");
  const start = Date.now();
  for (;;) {
    const state = await home.client.expectOk("environment.get", { repository: key });
    if (state.busy === null && state.packages.some((entry) => entry.name === "local/extra" && entry.installed)) {
      assert.ok(!("local/triage" in state.requests), "the refused enabling's request stays out");
      break;
    }
    if (Date.now() - start > 30_000) throw new Error(`the accepted request never installed: ${JSON.stringify(state)}`);
    await fixture.sleep(25);
  }
  assert.match(read(requestsPath)!, /local\/extra/);

  // With nothing changing, the same session's enabling publishes, every
  // edit accepted meanwhile kept.
  await home.client.expectOk("draft.register", registration(true));
  const requests = read(requestsPath)!;
  assert.match(requests, /local\/extra/);
  assert.match(requests, /spex-packages\/triage/);
  assert.match(read(projectConfig)!, /code:/);
  assert.match(read(projectConfig)!, /triage:/);
  assert.match(read(home.configPath)!, /dev\.helper/);
  assert.match(read(home.configPath)!, /accepted beside the request/);
});

test("environments-27: a held draft.register refuses once your own group's spex repository has moved", async (t) => {
  const host = await fixture.startHost();
  const home = await fixture.startHome("register-own-moved", { host, project: false, env: compiling.env, extra: { signIn: "browser", compileSpawner } });
  const enablings = heldEnablings(home);
  cleanup(t, home, enablings.release);
  const from = home.client.mark();
  await fixture.signIn(home, host);
  const own = await home.client.waitRepository(from, "ada/ada-spex", (row) => row.sync.phase === "done");
  const { key, clone } = await fixture.addFolder(home, fixture.gitFolder("mine"));
  const instance = await compiledDraft(home, key);
  const oldOwn = clonePath(home.dataDir, "ada/ada-spex");
  const newOwn = clonePath(home.dataDir, "ada/ada-moved-spex");
  const ownBefore = readFileSync(join(oldOwn, "config", "playbook.config.yaml"), "utf8");
  const gate = enablings.hold();
  const replying = home.client.command("draft.register", {
    projectId: key, draftId: "triage", instance, command: "triage", intent: "Triage new issues",
    bindings: { Helper: "dev.helper" }, newPlayers: { "dev.helper": { adapter: "claude" } },
  });
  await gate.entered;
  // The host renames your own group's spex repository; its sync follows
  // while the project's enabling holds only the project's environment.
  host.script.rename(own.id!, { name: "ada-moved-spex" });
  const moved = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: "ada/ada-spex" }), { accepted: true });
  await home.client.waitRepository(moved, "ada/ada-moved-spex", (row) => row.sync.phase === "done", 30_000);
  assert.equal(existsSync(oldOwn), false);
  gate.release();
  const reply = await replying;
  assert.equal(reply.ok ? "ok" : reply.error.code, "not_found", reply.ok ? "published" : reply.error.message);
  assert.equal(existsSync(oldOwn), false, "the departed destination is not made again");
  assert.equal(readFileSync(join(newOwn, "config", "playbook.config.yaml"), "utf8"), ownBefore);
  assert.equal(existsSync(join(clone, "config", "playbook.config.yaml")), false);
  assert.doesNotMatch(read(join(clone, "spex.yaml")) ?? "", /triage/);
});
