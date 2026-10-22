// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The deploy files as far as an unprivileged host checks them (hub-4,
// hub-6, hub-7, hub-8, server-shell-25): the scripts parse; the helper
// and the install script refuse each mistake by name before touching
// anything, run as the current user with HOME and PATH scoped; the
// sudoers fragment names the helper alone; the units and the
// administrator's command carry the flags and paths the hub and the
// server shell expect. What needs root, systemd and sudo is the
// privileged lane's (hub-10).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCommandLine } from "./cli.js";
import { DEFAULT_HELPER } from "./helper.js";
import { DEFAULT_RUN_DIR, seatSocket, seatTokenFile } from "./seat.js";
import { DEFAULT_STATE_DIR, PERSON_ID } from "./state.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(packageDir, "bin", "spex-seatctl");
const DEPLOY = join(packageDir, "deploy");
const INSTALL = join(DEPLOY, "install.sh");
const SEAT_UNIT = join(DEPLOY, "spex-seat@.service");
const HUB_UNIT = join(DEPLOY, "spex-hub.service");
const SUDOERS = join(DEPLOY, "spex-hub.sudoers");
const TMPFILES = join(DEPLOY, "spex-hub.tmpfiles");
const COMMAND = join(DEPLOY, "spex-hub");
const HUB_SCRIPT = "/opt/spex/app/apps/hub/dist/main.js";
const HELPER_USAGE = "usage: spex-seatctl create|start|stop|wipe <id>";
const isRoot = process.getuid?.() === 0;

const roots: string[] = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "spex-hub-deploy-"));
  roots.push(root);
  return root;
}

/** A PATH directory whose every program the scripts might reach first
 * records its name and fails, so a test sees anything run past a
 * refusal. */
function stubPath(root: string): { dir: string; log: string } {
  const dir = join(root, "stubs");
  const log = join(root, "stubs.log");
  mkdirSync(dir);
  for (const name of [
    "npm",
    "node",
    "systemctl",
    "systemd-tmpfiles",
    "sudo",
    "visudo",
    "useradd",
    "groupadd",
    "runuser",
    "install",
    "tar",
    "chown",
  ]) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\necho ${name} "$@" >>"${log}"\nexit 1\n`);
    chmodSync(file, 0o755);
  }
  return { dir, log };
}

function run(
  file: string,
  args: string[],
  home: string,
  path = "/usr/bin:/bin",
  input = "",
  env: Record<string, string> = {},
): SpawnSyncReturns<string> {
  return spawnSync(file, args, {
    env: { ...env, HOME: home, PATH: path },
    input,
    encoding: "utf8",
    timeout: 30_000,
  });
}

/** The `[Service]`-style keys of a unit, each with its values. */
function unitKeys(file: string): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Za-z]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    keys.set(match[1], [...(keys.get(match[1]) ?? []), match[2]]);
  }
  return keys;
}

function one(keys: Map<string, string[]>, key: string): string {
  const values = keys.get(key) ?? [];
  assert.equal(values.length, 1, `${key} is set once`);
  return values[0];
}

interface ExecStart {
  program: string;
  script: string;
  /** The words before the first flag, e.g. a command. */
  words: string[];
  flags: Map<string, string | true>;
}

/** An ExecStart line's program, script, leading words and
 * `--name[=value]` flags. */
function execStart(line: string): ExecStart {
  const [program, script, ...rest] = line.split(/\s+/);
  const words: string[] = [];
  const flags = new Map<string, string | true>();
  for (const word of rest) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(word);
    if (!match) {
      assert.equal(flags.size, 0, `ExecStart word ${word} comes before every flag`);
      words.push(word);
      continue;
    }
    assert.ok(!flags.has(match[1]), `--${match[1]} appears once`);
    flags.set(match[1], match[2] ?? true);
  }
  return { program, script, words, flags };
}

/** A folder under <root> passing the install script's checkout checks,
 * with this package's helper and deploy files, the script among them. */
function fakeCheckout(root: string, name: string): { folder: string; script: string } {
  const folder = join(root, name);
  const hub = join(folder, "apps", "hub");
  mkdirSync(join(hub, "bin"), { recursive: true });
  mkdirSync(join(hub, "deploy"));
  mkdirSync(join(folder, "apps", "server"));
  writeFileSync(join(folder, "package.json"), '{\n  "name": "spex-monorepo",\n  "private": true\n}\n');
  writeFileSync(join(folder, "package-lock.json"), "{}\n");
  writeFileSync(join(folder, "apps", "server", "package.json"), "{}\n");
  writeFileSync(join(hub, "package.json"), "{}\n");
  copyFileSync(HELPER, join(hub, "bin", "spex-seatctl"));
  for (const file of readdirSync(DEPLOY)) copyFileSync(join(DEPLOY, file), join(hub, "deploy", file));
  const script = join(hub, "deploy", "install.sh");
  chmodSync(script, 0o755);
  return { folder, script };
}

/** A shell script's `readonly NAME=value` constant. */
function constant(file: string, name: string): string {
  const match = new RegExp(`^readonly ${name}=(\\S+)$`, "m").exec(readFileSync(file, "utf8"));
  assert.ok(match, `${basename(file)} sets ${name}`);
  return match[1];
}

test("the install script, the helper and the administrator's command parse", () => {
  for (const [shell, file] of [
    ["bash", INSTALL],
    ["bash", HELPER],
    ["sh", COMMAND],
  ]) {
    const result = spawnSync(shell, ["-n", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${shell} -n ${basename(file)}: ${result.stderr}`);
  }
});

test("the helper refuses every other form with 64 and its usage line, touching nothing (hub-4)", () => {
  const home = scratch();
  const forms: string[][] = [
    [],
    ["start"],
    ["start", "1", "2"],
    ["create", "1", "--force"],
    ["destroy", "1"],
    ["START", "1"],
    ["start", ""],
    ["start", "12a"],
    ["start", "-1"],
    ["stop", "123456789012345678901"],
    ["wipe", "1 2"],
    ["wipe", "1\n2"],
    ["start", "1; reboot"],
    ["start", "../1"],
    ["stop", "١٢"],
  ];
  for (const args of forms) {
    const result = run(HELPER, args, home, "/usr/bin:/bin", "A".repeat(43));
    const shown = JSON.stringify(args);
    assert.equal(result.status, 64, `spex-seatctl ${shown}: ${result.stderr}`);
    assert.match(result.stderr, /^spex-seatctl: .+\n/, `spex-seatctl ${shown} names the mistake`);
    assert.ok(result.stderr.includes(`${HELPER_USAGE}\n`), `spex-seatctl ${shown} prints the usage line`);
    assert.equal(result.stdout, "");
  }
  assert.deepEqual(readdirSync(home), [], "the helper wrote nothing in HOME");
});

test("the helper admits a seat id by the hub's own rule, refusing a caller that is not root (hub-4)", { skip: isRoot && "runs as root" }, () => {
  const home = scratch();
  const ids = ["0", "1", "42", "12345678901234567890", "123456789012345678901", "", "1a", "+1", " 1", "1 ", "0x1", "١"];
  for (const id of ids) {
    for (const command of ["create", "start", "stop", "wipe"]) {
      const result = run(HELPER, [command, id], home);
      const admitted = PERSON_ID.test(id);
      assert.equal(
        result.status,
        admitted ? 77 : 64,
        `spex-seatctl ${command} ${JSON.stringify(id)} ${admitted ? "passes the id check" : "is refused"}: ${result.stderr}`,
      );
      if (admitted) assert.equal(result.stderr, "spex-seatctl: run as root, through sudo\n");
    }
  }
  assert.deepEqual(readdirSync(home), []);
});

test("the install script refuses a user other than root before running anything (hub-7)", { skip: isRoot && "runs as root" }, () => {
  const root = scratch();
  const home = join(root, "home");
  mkdirSync(home);
  const stubs = stubPath(root);
  const result = run(INSTALL, [], home, `${stubs.dir}:/usr/bin:/bin`);
  assert.equal(result.status, 77, result.stderr);
  assert.match(result.stderr, /^install\.sh: run as root \(sudo .+\): it creates accounts/);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(stubs.log), false, "no program ran past the refusal");
  assert.deepEqual(readdirSync(home), []);
});

test("the install script refuses a folder that is no release checkout and a usage mistake, by name (hub-7)", () => {
  const root = scratch();
  const home = join(root, "home");
  mkdirSync(home);
  const stubs = stubPath(root);
  const path = `${stubs.dir}:/usr/bin:/bin`;
  const folder = join(root, "folder");
  const script = join(folder, "apps", "hub", "deploy", "install.sh");
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(INSTALL, script);
  chmodSync(script, 0o755);

  const refusals: [string, () => void, RegExp][] = [
    ["no package.json", () => {}, /no release checkout of Spex: it has no package\.json/],
    [
      "another package",
      () => writeFileSync(join(folder, "package.json"), '{\n  "name": "not-spex",\n  "private": true\n}\n'),
      /no release checkout of Spex: its package\.json does not name spex-monorepo/,
    ],
    [
      "no hub",
      () => {
        writeFileSync(join(folder, "package.json"), '{\n  "name": "spex-monorepo",\n  "private": true\n}\n');
        writeFileSync(join(folder, "package-lock.json"), "{}\n");
        mkdirSync(join(folder, "apps", "server"), { recursive: true });
        writeFileSync(join(folder, "apps", "server", "package.json"), "{}\n");
      },
      /no release checkout of Spex: apps\/hub\/package\.json is missing/,
    ],
  ];
  for (const [label, arrange, mistake] of refusals) {
    arrange();
    const result = run(script, [], home, path);
    assert.equal(result.status, 66, `${label}: ${result.stderr}`);
    assert.match(result.stderr, mistake, label);
    assert.ok(result.stderr.includes(folder), `${label}: the refusal names the folder`);
  }

  for (const args of [["--prefix=opt/spex"], ["--prefix=/"], ["--prefix=/opt/../etc"], ["--prefix"], ["--force"]]) {
    const result = run(INSTALL, args, home, path);
    assert.equal(result.status, 64, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stderr, /^install\.sh: .+\nusage: sudo apps\/hub\/deploy\/install\.sh/);
  }
  assert.equal(existsSync(stubs.log), false, "no program ran past a refusal");
  assert.deepEqual(readdirSync(home), []);
});

test("the install script refuses a prefix that is, holds or lies inside its checkout, by name, before running anything (hub-7)", () => {
  const root = scratch();
  const home = join(root, "home");
  mkdirSync(home);
  const stubs = stubPath(root);
  const path = `${stubs.dir}:/usr/bin:/bin`;
  const { folder, script } = fakeCheckout(root, "checkout");
  const checkout = realpathSync(folder);
  symlinkSync(folder, join(root, "link"));
  symlinkSync(join(root, "nowhere"), join(root, "dangling"));

  const refusals: [string, string[], Record<string, string>, RegExp][] = [
    ["the checkout", [`--prefix=${folder}`], {}, /is the checkout/],
    ["the checkout, with a trailing slash", ["--prefix", `${folder}/`], {}, /is the checkout/],
    ["the checkout, by SPEX_PREFIX", [], { SPEX_PREFIX: folder }, /is the checkout/],
    ["the checkout, through a link", [`--prefix=${join(root, "link")}`], {}, /is the checkout/],
    ["a folder in the checkout", [`--prefix=${join(folder, "opt", "spex")}`], {}, /lies inside the checkout/],
    ["the checkout's app", [`--prefix=${join(root, "link", "app")}`], {}, /lies inside the checkout/],
    ["a folder holding the checkout", [`--prefix=${root}`], {}, /holds the checkout/],
  ];
  for (const [label, args, env, overlap] of refusals) {
    const result = run(script, args, home, path, "", env);
    assert.equal(result.status, 78, `${label}: ${result.stderr}`);
    assert.match(result.stderr, /^install\.sh: the prefix /, label);
    assert.match(result.stderr, overlap, label);
    assert.ok(result.stderr.includes(checkout), `${label}: the refusal names the checkout`);
    assert.match(result.stderr, /keep the release checkout outside the prefix/, label);
    assert.equal(result.stdout, "", label);
  }
  // A checkout placed as the prefix's app, which a swap would delete.
  mkdirSync(join(root, "opt"));
  const placed = fakeCheckout(join(root, "opt"), "app");
  const swapped = run(placed.script, [], home, path, "", { SPEX_PREFIX: join(root, "opt") });
  assert.equal(swapped.status, 78, swapped.stderr);
  assert.match(swapped.stderr, /^install\.sh: the prefix .+ holds the checkout .+\/opt\/app,/);
  assert.deepEqual(readdirSync(placed.folder).sort(), ["apps", "package-lock.json", "package.json"]);

  const dangling = run(script, [`--prefix=${join(root, "dangling", "spex")}`], home, path);
  assert.equal(dangling.status, 78, dangling.stderr);
  assert.match(dangling.stderr, /^install\.sh: the prefix .+ passes a link that leads nowhere/);

  if (!isRoot) {
    // A sibling whose name extends the checkout's is no overlap: the
    // script goes on to its next refusal.
    const sibling = run(script, [`--prefix=${folder}2`], home, path);
    assert.equal(sibling.status, 77, sibling.stderr);
    assert.match(sibling.stderr, /^install\.sh: run as root/);
  }
  assert.equal(existsSync(stubs.log), false, "no program ran past a refusal");
  assert.deepEqual(readdirSync(home), []);
  assert.deepEqual(readdirSync(folder).sort(), ["apps", "package-lock.json", "package.json"], "the checkout is as it was");
  assert.deepEqual(readdirSync(join(folder, "apps", "hub")).sort(), ["bin", "deploy", "package.json"]);
});

test("the administrator's command hands the hub the installed helper, a later --helper winning (hub-6)", () => {
  const root = scratch();
  const node = join(root, "node");
  writeFileSync(node, '#!/bin/sh\nfor arg in "$@"; do printf \'%s\\n\' "$arg"; done\n');
  chmodSync(node, 0o755);
  // Written as install.sh's render() writes it, for a prefix and a node.
  const command = join(root, "spex-hub");
  writeFileSync(
    command,
    readFileSync(COMMAND, "utf8").replaceAll("/opt/spex/", "/srv/spex/").replaceAll("/usr/bin/node ", `${node} `),
  );
  chmodSync(command, 0o755);
  const script = "/srv/spex/app/apps/hub/dist/main.js";
  const helper = "--helper=/srv/spex/libexec/spex-seatctl";
  const forms: [string[], string[], string | undefined][] = [
    [["status"], ["status", helper], "/srv/spex/libexec/spex-seatctl"],
    [["evict", "42", "--state-dir=/s"], ["evict", helper, "42", "--state-dir=/s"], "/srv/spex/libexec/spex-seatctl"],
    [["retire"], ["retire", helper], "/srv/spex/libexec/spex-seatctl"],
    [["serve", "--port", "8443"], ["serve", helper, "--port", "8443"], "/srv/spex/libexec/spex-seatctl"],
    [["attach", "--helper=/x/seatctl"], ["attach", helper, "--helper=/x/seatctl"], "/x/seatctl"],
    [[], [], undefined],
    [["help"], ["help"], undefined],
    [["--help"], ["--help"], undefined],
  ];
  for (const [args, forwarded, seen] of forms) {
    const result = run(command, args, root);
    const shown = JSON.stringify(args);
    assert.equal(result.status, 0, `spex-hub ${shown}: ${result.stderr}`);
    assert.deepEqual(result.stdout.split("\n").slice(0, -1), [script, ...forwarded], `spex-hub ${shown}`);
    if (forwarded.length && forwarded[0] !== "help" && forwarded[0] !== "--help") {
      assert.equal(parseCommandLine(forwarded).flags.get("helper"), seen, `spex-hub ${shown}: the hub reads that helper`);
    }
  }
});

test("the sudoers fragment lets the hub's account run the helper's four forms and nothing else (hub-4)", () => {
  const lines = readFileSync(SUDOERS, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  assert.equal(lines[0], "Defaults:spex-hub !requiretty");
  assert.equal(lines.length, 2, "one Defaults line and one rule");
  const rule = /^spex-hub ALL=\(root\) NOPASSWD: (.+)$/.exec(lines[1]);
  assert.ok(rule, `the rule is the hub's account's, as root: ${lines[1]}`);
  const commands = rule[1].split(/,\s*/);
  assert.deepEqual(
    commands,
    ["create", "start", "stop", "wipe"].map((form) => `${DEFAULT_HELPER} ${form} *`),
  );
  const paths = new Set(lines.join("\n").match(/\/[^\s,]*/g));
  assert.deepEqual([...paths], [DEFAULT_HELPER], "the helper's path is the one path named");
});

test("the seat unit runs the server shell as a seat with exactly its flags (hub-4, server-shell-25)", () => {
  const keys = unitKeys(SEAT_UNIT);
  const { program, script, words, flags } = execStart(one(keys, "ExecStart"));
  assert.equal(program, "/usr/bin/node");
  assert.equal(script, "/opt/spex/app/apps/server/dist/main.js");
  assert.deepEqual(words, []);
  assert.deepEqual(
    [...flags.keys()].sort(),
    ["person-id", "seat", "server-id", "server-name", "shared-env", "socket", "token-file"],
  );
  assert.equal(flags.get("seat"), true);
  assert.equal(flags.get("server-id"), "${SPEX_SERVER_ID}");
  assert.equal(flags.get("server-name"), "${SPEX_SERVER_NAME}");
  assert.equal(flags.get("person-id"), "%i");
  assert.equal(flags.get("socket"), seatSocket(DEFAULT_RUN_DIR, "%i"));
  assert.equal(flags.get("token-file"), seatTokenFile(DEFAULT_RUN_DIR, "%i"));
  assert.equal(flags.get("shared-env"), "/etc/spex/agents.env");
  assert.equal(one(keys, "User"), "spex-%i");
  assert.equal(keys.has("Group"), false, "the seat runs in its own account's groups, never the hub's");
  assert.equal(one(keys, "EnvironmentFile"), "/etc/spex/server.env");
  assert.equal(one(keys, "KillMode"), "mixed");
  assert.equal(one(keys, "UMask"), "0077");
  const stop = Number(one(keys, "TimeoutStopSec"));
  assert.ok(stop > 15, `TimeoutStopSec ${stop} lies above the core's 10 s and 5 s bounds`);
});

test("the hub's unit, the helper, the command, the tmpfiles fragment and the install script share one set of paths (hub-4, hub-7, hub-8)", () => {
  const keys = unitKeys(HUB_UNIT);
  const { program, script, words, flags } = execStart(one(keys, "ExecStart"));
  assert.equal(program, "/usr/bin/node");
  assert.equal(script, HUB_SCRIPT);
  assert.deepEqual(words, ["serve"]);
  assert.deepEqual([...flags.keys()].sort(), ["helper", "run-dir", "state-dir"]);
  assert.equal(flags.get("state-dir"), DEFAULT_STATE_DIR);
  assert.equal(flags.get("run-dir"), DEFAULT_RUN_DIR);
  assert.equal(flags.get("helper"), DEFAULT_HELPER);
  assert.equal(one(keys, "User"), "spex-hub");
  assert.equal(one(keys, "Group"), "spex-hub");
  assert.equal(`/var/lib/${one(keys, "StateDirectory")}`, DEFAULT_STATE_DIR);
  assert.equal(one(keys, "StateDirectoryMode"), "0700");
  assert.equal(one(keys, "UMask"), "0077");

  assert.equal(constant(HELPER, "RUN_DIR"), DEFAULT_RUN_DIR);
  assert.equal(constant(HELPER, "RUN_BASE"), dirname(DEFAULT_RUN_DIR));
  assert.equal(constant(HELPER, "HUB_GROUP"), "spex-hub");
  assert.equal(constant(HELPER, "SEATS_GROUP"), "spex-seats");
  const entries = readFileSync(TMPFILES, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.trim().split(/\s+/));
  assert.deepEqual(entries, [
    ["d", dirname(DEFAULT_RUN_DIR), "0711", "root", "root", "-"],
    ["d", DEFAULT_RUN_DIR, "0711", "root", "root", "-"],
  ]);

  const commandExecs = readFileSync(COMMAND, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("exec "));
  assert.equal(commandExecs.length, 2);
  for (const line of commandExecs) {
    assert.ok(line.startsWith(`exec ${program} ${HUB_SCRIPT} `), `the command runs the hub as its unit does: ${line}`);
  }
  assert.ok(commandExecs[0].includes(` --helper=${DEFAULT_HELPER} `), "the command names the installed helper");

  assert.equal(`${constant(INSTALL, "DEFAULT_PREFIX")}/libexec/spex-seatctl`, DEFAULT_HELPER);
  assert.equal(constant(INSTALL, "UNIT_NODE"), program);
  assert.equal(constant(INSTALL, "STATE_DIR"), DEFAULT_STATE_DIR);
  assert.equal(constant(INSTALL, "HUB_USER"), "spex-hub");
  assert.equal(constant(INSTALL, "HUB_GROUP"), "spex-hub");
  assert.equal(constant(INSTALL, "SEATS_GROUP"), "spex-seats");
});
