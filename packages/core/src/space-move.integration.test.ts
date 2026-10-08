// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The host's moves of clones followed on a sync (space-60): your own
// group's spex repository followed by the key `home.yaml` records, one
// moved out of your own group not followed, and every clone a move
// carries held quiet first (space-37) — against the stand-in Git host
// (git-host-12), hermetic, on loopback alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { clonePath, createSpaceHarness, repositoryOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import type { RepositoryState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, sleep, startHome, startHost, signIn, runTurn, hangingCompileSpawner, COMPILE_INPUT, peerClone, peerPush } = fixture;
test.after(() => fixture.dispose());

type SpaceHome = Awaited<ReturnType<typeof startHome>>;

const HOST_NAME = "Stand-in Git host";

/** Whether this filesystem reads two spellings differing only by case
 * as one entry: a folder renamed in place then carries the clones
 * beneath it (space-60). */
const caseInsensitive = ((): boolean => {
  const dir = mkdtempSync(join(scratch, "case-"));
  mkdirSync(join(dir, "probe"));
  return existsSync(join(dir, "PROBE"));
})();

/** `home.yaml` as written (storage-2). */
function homeFile(dataDir: string): { own: string; folders: { path: string; repository: string }[] } {
  return parseYaml(readFileSync(join(dataDir, "home.yaml"), "utf8")) as { own: string; folders: { path: string; repository: string }[] };
}

/** The stand-in's bare repository holding a key's records. */
function bareOf(host: StandinHost, key: string): string {
  const parts = key.split("/");
  return join(host.dir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.git`);
}

/** The stand-in renames the person's namespace: the login, the person's
 * own group, and every repository in it, which the host moves with its
 * namespace. */
function respellPerson(host: StandinHost, login: string): void {
  host.script.person.login = login;
  host.script.groups[0].fullPath = login;
  host.script.groups[0].name = login;
  for (const repository of host.script.repositories) {
    if (repository.group === host.script.groups[0]) host.script.rename(repository.id, { group: login });
  }
}

/** Sync `from`, with the picks `choices` names, and read its row once
 * that sync ends, under `to` where the clone moved, else under `from`.
 * A reading that is not running ends it only after one of its own
 * running readings, or where a read made after the reply agrees it no
 * longer runs. */
async function syncEnd(home: SpaceHome, from: string, to: string, choices?: Record<string, "mine" | "remote">): Promise<RepositoryState> {
  const rowOf = (rows: RepositoryState[]): RepositoryState | undefined => rows.find((row) => row.key === to) ?? rows.find((row) => row.key === from);
  const mark = home.client.mark();
  const sent = Date.now();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: from, ...(choices ? { choices } : {}) }), { accepted: true });
  let ran = false;
  for (let next = mark, start = Date.now(); ;) {
    for (; next < home.client.messages.length; next += 1) {
      const message = home.client.messages[next];
      if (message.type !== "space.state") continue;
      const row = rowOf(message.state.groups.flatMap((group) => group.repositories));
      if (!row) continue;
      if (row.sync.phase === "running") { ran ||= row.sync.since >= sent; continue; }
      if (ran) return row;
      const fresh = rowOf((await home.client.expectOk("space.get", {})).groups.flatMap((group) => group.repositories));
      if (fresh && fresh.sync.phase !== "running") return fresh;
    }
    if (Date.now() - start > 30_000) throw new Error(`timeout waiting for the sync of ${from} to end`);
    await sleep(10);
  }
}

/** Every project names a clone the Groups state lists (space-60). */
async function assertProjectsNameClones(home: SpaceHome): Promise<void> {
  const listed = (await home.client.expectOk("space.get", {})).groups.flatMap((group) => group.repositories.map((repository) => repository.key));
  for (const project of await home.client.expectOk("project.list", {})) {
    assert.ok(listed.includes(project.id) && existsSync(join(clonePath(home.dataDir, project.id), ".git")), `${project.id} names its clone`);
  }
}

/** A `git` on the core's PATH that holds the command whose arguments
 * hold `args` while the test holds it, then runs the real Git: a
 * command caught in flight. */
function holdingGit(args: string): { path: string; hold(): void; held(): Promise<void>; release(): void } {
  const dir = mkdtempSync(join(scratch, "holding-git-"));
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const hold = join(dir, "hold");
  const held = join(dir, "held");
  writeFileSync(join(dir, "git"), [
    "#!/bin/sh",
    'case " $* " in',
    `  *" ${args} "*)`,
    `    if [ -e "${hold}" ]; then : > "${held}"; while [ -e "${hold}" ]; do sleep 0.05; done; fi ;;`,
    "esac",
    `exec "${real}" "$@"`,
    "",
  ].join("\n"));
  chmodSync(join(dir, "git"), 0o755);
  return {
    path: `${dir}:${process.env.PATH ?? ""}`,
    hold: () => writeFileSync(hold, ""),
    held: async () => {
      for (let i = 0; i < 400 && !existsSync(held); i += 1) await sleep(25);
      assert.ok(existsSync(held), "the command reached Git");
    },
    release: () => rmSync(hold, { force: true }),
  };
}

/** A project's own settings: the player each role uses (core-service-2). */
const projectConfig = (side: string): string => `# Settings from ${side}\nplaybooks:\n  code:\n    roles:\n      coder: dev.coder\n`;

/** Nothing the core logged failed. */
function failures(errors: { mock: { calls: { arguments: unknown[] }[] } }): string[] {
  return errors.mock.calls.map((call) => String(call.arguments[0])).filter((line) => /failed/.test(line));
}

/** A home signed in at the stand-in, your own group's spex repository
 * pushed as `ada/ada-spex`. */
async function signedIn(t: { after: (fn: () => Promise<void>) => void }, name: string, extra: { env?: Record<string, string>; compile?: boolean; dataDir?: string } = {}): Promise<{ host: StandinHost; home: SpaceHome }> {
  const host = await startHost();
  const home = await startHome(name, {
    host, project: false,
    ...(extra.env ? { env: extra.env } : {}),
    ...(extra.dataDir ? { dataDir: extra.dataDir } : {}),
    extra: { signIn: "browser", ...(extra.compile ? { compileSpawner: hangingCompileSpawner() } : {}) },
  });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  const own = await home.client.waitRepository(from, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  assert.equal(own.own, true);
  return { host, home };
}

/** A project whose spex repository is created in a group of the
 * stand-in's and pushed; its folder, key and host id. */
async function hostedProject(home: SpaceHome, name: string, groupId: string, group: string): Promise<{ folder: string; key: string; id: string }> {
  const folder = gitFolder(name);
  const { key: local } = await addFolder(home, folder);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId, name }, noticed: true });
  const key = `${group}/${name}-spex`;
  const pushed = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  return { folder, key, id: pushed.id ?? "" };
}

test("space-37: a namespace the host respells by case moves your own group's spex repository on its sync, home.yaml recording its new key", async (t) => {
  const errors = t.mock.method(console, "error");
  const { host, home } = await signedIn(t, "own-respelled");
  const folder = gitFolder("mine");
  const { key: local } = await addFolder(home, folder);
  assert.equal(local, "ada/mine-spex");
  respellPerson(host, "Ada");
  const synced = await syncEnd(home, "ada/ada-spex", "Ada/ada-spex");
  assert.equal(synced.key, "Ada/ada-spex");
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  // Your own group's spex repository is read as your own under the
  // host's spelling, and `home.yaml` records that key (space-60).
  assert.equal(synced.own, true, "your own group's row reads as your own");
  const file = homeFile(home.dataDir);
  assert.equal(file.own, "Ada/ada-spex");
  // The project's clone went with your own group's spex repository:
  // the folder renamed in place carried it where the filesystem reads
  // both spellings as one, and the move carried it elsewhere (space-60).
  const project = "Ada/mine-spex";
  assert.deepEqual(file.folders.map((entry) => [entry.path, entry.repository]), [[folder, project]]);
  assert.equal((await home.client.expectOk("config.get", {})).status, "valid");
  assert.deepEqual(failures(errors), []);
  await assertProjectsNameClones(home);
  // A Refresh renames nothing back after the login it stored at sign-in
  // (space-59): your own group's spex repository is on the host.
  const before = (await home.client.expectOk("space.get", {})).readAt ?? 0;
  const fromRefresh = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(fromRefresh, (state) => (state.readAt ?? 0) > before);
  const refreshed = homeFile(home.dataDir);
  assert.equal(refreshed.own, "Ada/ada-spex");
  assert.deepEqual(refreshed.folders.map((entry) => [entry.path, entry.repository]), [[folder, project]]);
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), "Ada/ada-spex").own, true);
  assert.deepEqual(failures(errors), []);
  // A restarted core starts on the home and reads the same.
  await home.stop();
  const again = await startHome("own-respelled-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  assert.equal((await again.client.expectOk("config.get", {})).status, "valid");
  assert.deepEqual((await again.client.expectOk("project.list", {})).map((entry) => [entry.id, entry.path]), [[project, folder]]);
});

test("space-37: a namespace the host renames moves your own group's spex repository on its sync, carrying the local-only clones of its folder", async (t) => {
  const errors = t.mock.method(console, "error");
  const { host, home } = await signedIn(t, "own-renamed");
  const folder = gitFolder("mine");
  const { key: local } = await addFolder(home, folder);
  assert.equal(local, "ada/mine-spex");
  respellPerson(host, "ada2");
  const synced = await syncEnd(home, "ada/ada-spex", "ada2/ada-spex");
  assert.equal(synced.key, "ada2/ada-spex");
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.equal(synced.own, true, "your own group's row reads as your own");
  // What you add for yourself stays in your own group's folder: the
  // local-only project went with your own group's spex repository
  // (space-60).
  const file = homeFile(home.dataDir);
  assert.equal(file.own, "ada2/ada-spex");
  assert.deepEqual(file.folders.map((entry) => [entry.path, entry.repository]), [[folder, "ada2/mine-spex"]]);
  assert.ok(!existsSync(join(home.dataDir, "workspace", "ada")), "the former folder left with its clones");
  assert.equal((await home.client.expectOk("config.get", {})).status, "valid");
  assert.deepEqual(failures(errors), []);
  await assertProjectsNameClones(home);
});

test("space-37: a project of your own group synced first after its namespace is respelled leaves home.yaml recording your own group's new key", async (t) => {
  const errors = t.mock.method(console, "error");
  const { host, home } = await signedIn(t, "own-carried");
  const proj = await hostedProject(home, "proj", "2001", "ada");
  respellPerson(host, "Ada");
  const moved = await syncEnd(home, proj.key, "Ada/proj-spex");
  assert.equal(moved.key, "Ada/proj-spex");
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  // Where the folder was renamed in place it carried your own group's
  // clone; elsewhere its own sync moves it (space-60).
  if (!caseInsensitive) {
    const own = await syncEnd(home, "ada/ada-spex", "Ada/ada-spex");
    assert.equal(own.sync.phase, "done", JSON.stringify(own.sync));
  }
  assert.equal(homeFile(home.dataDir).own, "Ada/ada-spex");
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), "Ada/ada-spex").own, true);
  assert.equal((await home.client.expectOk("config.get", {})).status, "valid");
  assert.deepEqual(failures(errors), []);
  await assertProjectsNameClones(home);
});

test("space-37: your own group's spex repository the host lists in another group is not followed, its sync and its check stopping at Check", async (t) => {
  const { host, home } = await signedIn(t, "own-transferred");
  // A change of your own group's to send.
  const config = join(clonePath(home.dataDir, "ada/ada-spex"), "config", "playbook.config.yaml");
  writeFileSync(config, `${readFileSync(config, "utf8")}# changed here\n`);
  const ownId = host.script.repositories.find((repository) => repository.group === host.script.groups[0])?.id ?? "";
  host.script.rename(ownId, { group: "acme" });
  const sent = git(bareOf(host, "acme/ada-spex"), "rev-parse", "spex");
  const origin = (): string => git(clonePath(home.dataDir, "ada/ada-spex"), "remote", "get-url", "origin");
  const remote = origin();
  const stopped = await syncEnd(home, "ada/ada-spex", "acme/ada-spex");
  assert.equal(stopped.key, "ada/ada-spex", "the clone stays where it lies");
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "git", JSON.stringify(stopped.sync));
  const message = `ada-spex is no longer in your own group on ${HOST_NAME}`;
  assert.equal(stopped.sync.message, message);
  assert.match(stopped.sync.guidance, /back/);
  assert.equal(stopped.sync.retry, true);
  assert.ok(existsSync(join(clonePath(home.dataDir, "ada/ada-spex"), ".git")));
  assert.ok(!existsSync(clonePath(home.dataDir, "acme/ada-spex")));
  assert.equal(origin(), remote, "its remote is unchanged");
  assert.equal(homeFile(home.dataDir).own, "ada/ada-spex");
  assert.equal(git(bareOf(host, "acme/ada-spex"), "rev-parse", "spex"), sent, "nothing was pushed");
  // Its check stops there too, taking no URL of the other group's
  // (space-60, space-15).
  const checked = await home.client.settle("space.fetch", { repository: "ada/ada-spex" });
  assert.ok(checked.sync.phase === "stopped" && checked.sync.op === "check" && checked.sync.step === "check" && checked.sync.cause === "git", JSON.stringify(checked.sync));
  assert.equal(checked.sync.message, message);
  assert.equal(origin(), remote, "its remote is unchanged");
  assert.equal(homeFile(home.dataDir).own, "ada/ada-spex");
});

for (const blocker of ["compile", "turn"] as const) {
  test(`space-37: a move waits for every clone it carries — a ${blocker} beneath one defers it to a later sync`, async (t) => {
    const { host, home } = await signedIn(t, `carried-${blocker}`, blocker === "compile" ? { env: { SPEX_SLC: "fake-slc" }, compile: true } : {});
    const alpha = await hostedProject(home, "alpha", "2002", "acme");
    const beta = await hostedProject(home, "beta", "2002", "acme");
    // The group's path changes only by case on the host.
    host.script.groups.push({ id: "2004", fullPath: "Acme", name: "Acme", kind: "group" });
    host.script.rename(alpha.id, { group: "Acme" });
    host.script.rename(beta.id, { group: "Acme" });
    let ended: () => Promise<void>;
    let refusal: RegExp;
    if (blocker === "compile") {
      const compile = home.client.command("compile.run", { ...COMPILE_INPUT, projectId: beta.key });
      await home.client.waitFor((m) => m.type === "compile.progress" && m.line === "slc: working");
      refusal = /demo is compiling/;
      ended = async () => { await home.client.expectOk("compile.abort", { playbookId: "demo" }); await compile; };
    } else {
      const sessionId = await runTurn(home, beta.key, "first");
      await home.client.expectOk("turn.submit", { sessionId, text: "slow: keep going" });
      await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && m.session.turnActive === true);
      refusal = /Wait for “first” in/;
      ended = async () => { await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && !m.session.live && (m.session.turns ?? 0) >= 2, 20_000); };
    }
    // Alpha's sync ends done; where its folder would be renamed in place,
    // carrying beta, nothing moves (space-60, space-11, space-21).
    const first = await syncEnd(home, alpha.key, "Acme/alpha-spex");
    assert.equal(first.sync.phase, "done", JSON.stringify(first.sync));
    const pairs = (): string[] => {
      const folders = homeFile(home.dataDir).folders;
      return [alpha.folder, beta.folder].map((folder) => folders.find((entry) => entry.path === folder)?.repository ?? "");
    };
    assert.deepEqual(pairs(), caseInsensitive ? [alpha.key, beta.key] : ["Acme/alpha-spex", beta.key]);
    await home.client.expectError("space.sync", { repository: beta.key }, "busy", refusal);
    await assertProjectsNameClones(home);
    await ended();
    // Once beta is quiet, the next syncs leave both under the host's
    // spelling, every project naming a clone.
    if (caseInsensitive) {
      const second = await syncEnd(home, alpha.key, "Acme/alpha-spex");
      assert.equal(second.key, "Acme/alpha-spex");
      assert.equal(second.sync.phase, "done", JSON.stringify(second.sync));
    }
    const betaKey = pairs()[1];
    if (betaKey !== "Acme/beta-spex") {
      const moved = await syncEnd(home, betaKey, "Acme/beta-spex");
      assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
    }
    assert.deepEqual(pairs(), ["Acme/alpha-spex", "Acme/beta-spex"]);
    await assertProjectsNameClones(home);
    await home.stop();
  });
}

test("space-37: a clone a move carries keeps waiting in choices, its picks applying where it then lies", async (t) => {
  const { host, home } = await signedIn(t, "carried-choices");
  const alpha = await hostedProject(home, "alpha", "2002", "acme");
  const beta = await hostedProject(home, "beta", "2002", "acme");
  // Beta's settings changed differently here and on the host: one
  // Settings conflict waits for the reader's pick.
  const settings = (dir: string, side: string): void => {
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "playbook.config.yaml"), projectConfig(side));
  };
  await peerPush(peerClone(bareOf(host, beta.key)), (dir) => settings(dir, "the host"));
  settings(clonePath(home.dataDir, beta.key), "here");
  const unit = "config/playbook.config.yaml";
  const waiting = await home.client.settle("space.sync", { repository: beta.key });
  assert.equal(waiting.sync.phase, "choices", JSON.stringify(waiting.sync));
  assert.deepEqual(waiting.conflicts.map((conflict) => conflict.unit.unit), [unit]);
  // The group's path changes only by case on the host.
  host.script.groups.push({ id: "2004", fullPath: "Acme", name: "Acme", kind: "group" });
  host.script.rename(alpha.id, { group: "Acme" });
  host.script.rename(beta.id, { group: "Acme" });
  const moved = await syncEnd(home, alpha.key, "Acme/alpha-spex");
  assert.equal(moved.key, "Acme/alpha-spex");
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  // Where the folder was renamed in place the move carried beta, its
  // hold giving the waiting picker back; elsewhere beta waits where it
  // lies (space-60, space-21).
  const betaKey = caseInsensitive ? "Acme/beta-spex" : beta.key;
  const still = await home.client.repository(betaKey);
  assert.equal(still.sync.phase, "choices", JSON.stringify(still.sync));
  assert.deepEqual(still.conflicts.map((conflict) => conflict.unit.unit), [unit]);
  const applied = await syncEnd(home, betaKey, "Acme/beta-spex", { [unit]: "mine" });
  assert.equal(applied.key, "Acme/beta-spex");
  assert.equal(applied.sync.phase, "done", JSON.stringify(applied.sync));
  assert.equal(readFileSync(join(clonePath(home.dataDir, "Acme/beta-spex"), unit), "utf8"), projectConfig("here"));
  await assertProjectsNameClones(home);
});

test("space-37: a pick in flight on a clone a move would carry defers the move to a later sync", async (t) => {
  const dataDir = mkdtempSync(join(scratch, "carried-pick-"));
  const beta = "ada/beta-spex";
  // The pick's Git gives the clone the remote the stand-in handed over.
  const shim = holdingGit(`${clonePath(dataDir, beta)} remote add origin`);
  t.after(() => shim.release());
  const { host, home } = await signedIn(t, "carried-pick", { dataDir, env: { PATH: shim.path } });
  const folder = gitFolder("beta");
  assert.equal((await addFolder(home, folder)).key, beta);
  shim.hold();
  const picking = home.client.command("space.pick", { repository: beta, choice: { kind: "create", groupId: "2002", name: "beta" }, noticed: true });
  await shim.held();
  // The person's namespace is respelled meanwhile: your own group's
  // spex repository would carry beta, whose pick is in flight, so its
  // sync ends done where every clone lies (space-60).
  respellPerson(host, "Ada");
  const synced = await syncEnd(home, "ada/ada-spex", "Ada/ada-spex");
  assert.equal(synced.key, "ada/ada-spex");
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.equal(homeFile(home.dataDir).own, "ada/ada-spex");
  assert.deepEqual(homeFile(home.dataDir).folders.map((entry) => [entry.path, entry.repository]), [[folder, beta]]);
  // The pick lands and beta follows the host; a later sync then moves
  // your own group's spex repository.
  const from = home.client.mark();
  shim.release();
  const picked = await picking;
  assert.ok(picked.ok, JSON.stringify(picked));
  await home.client.waitRepository(from, "acme/beta-spex", (repository) => repository.sync.phase === "done", 30_000);
  const later = await syncEnd(home, "ada/ada-spex", "Ada/ada-spex");
  assert.equal(later.key, "Ada/ada-spex");
  assert.equal(later.sync.phase, "done", JSON.stringify(later.sync));
  assert.equal(homeFile(home.dataDir).own, "Ada/ada-spex");
  await assertProjectsNameClones(home);
});
