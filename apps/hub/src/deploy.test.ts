// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The deploy files as far as an unprivileged host checks them (hub-4,
// hub-5, hub-6, hub-7, hub-8, server-shell-25): the scripts parse; the
// helper and the install script refuse each mistake by name before
// touching anything, run as the current user with HOME and PATH scoped;
// the sudoers fragment names the helper alone; the units and the
// administrator's command carry the flags and paths the hub, the sweep
// and the server shell expect. What needs root, systemd and sudo is the
// privileged lane's (hub-10). The refusal of an /etc/sudoers that does
// not read /etc/sudoers.d is not run here: it reads the fixed
// /etc/sudoers, which only root may read, past the root refusal and the
// fixed /run/systemd/system check, and no seam points the script at
// another file (none is wanted in a script run as root); its place
// before the first change and its pattern, under the real grep, are
// checked instead.

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
const REAPER_UNIT = join(DEPLOY, "spex-seat-reaper.service");
const REAPER_TIMER = join(DEPLOY, "spex-seat-reaper.timer");
const INSTALLED_HUB = "/opt/spex/app/apps/hub/";
const HUB_SCRIPT = `${INSTALLED_HUB}dist/main.js`;
const REAPER_SCRIPT = `${INSTALLED_HUB}dist/reaper.js`;
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

test("the install script refuses, before its first change, an /etc/sudoers that does not read /etc/sudoers.d (hub-7)", () => {
  const text = readFileSync(INSTALL, "utf8");
  assert.equal(constant(INSTALL, "SUDOERS"), "/etc/sudoers");
  assert.equal(constant(INSTALL, "SUDOERS_DIR"), "/etc/sudoers.d");
  const check = /^grep -Eq -- "\$SUDOERS_READS_DIR" "\$SUDOERS" \|\|\n\s+refuse 69 "\$SUDOERS does not read \$SUDOERS_DIR, /m.exec(text);
  assert.ok(check, "the check refuses with 69, naming the mistake");
  const firstChange = text.indexOf('install -d -m 0700 -o root -g root "$NPM_CACHE"');
  assert.ok(firstChange > 0, "the build's npm cache is the first thing made");
  assert.ok(check.index < firstChange, "the check comes before the first change");
  assert.ok(check.index < text.indexOf("sudo -n -l -U"), "the check comes before the installed fragment is confirmed");

  const pattern = constant(INSTALL, "SUDOERS_READS_DIR").replace(/^'(.*)'$/, "$1");
  const root = scratch();
  const cases: [string, string, boolean][] = [
    ["@includedir", "Defaults env_reset\nroot ALL=(ALL:ALL) ALL\n@includedir /etc/sudoers.d\n", true],
    ["#includedir", "Defaults env_reset\n#includedir /etc/sudoers.d\n", true],
    ["no includedir", "Defaults env_reset\nroot ALL=(ALL:ALL) ALL\n", false],
    ["a commented includedir", "# includedir /etc/sudoers.d\n", false],
    ["another directory", "@includedir /etc/sudoers.local\n", false],
  ];
  for (const [label, content, reads] of cases) {
    const file = join(root, label.replace(/\W+/g, "-"));
    writeFileSync(file, content);
    const result = spawnSync("grep", ["-Eq", "--", pattern, file], {
      env: { PATH: "/usr/bin:/bin" },
      encoding: "utf8",
    });
    assert.equal(result.status, reads ? 0 : 1, `${label}: ${result.stderr}`);
  }
});

test("the attach command the install script prints is one the hub takes, its token read from /etc/spex/server.token (hub-1, hub-7)", () => {
  const text = readFileSync(INSTALL, "utf8");
  const etc = constant(INSTALL, "ETC_DIR");
  const tokenFile = constant(INSTALL, "TOKEN_FILE");
  assert.equal(tokenFile, `${etc}/server.token`);
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("$hub attach "));
  assert.ok(start > 0, "the script prints an attach command");
  let end = start;
  while (lines[end].endsWith("\\\\")) end++;
  const words = lines
    .slice(start, end + 1)
    .join(" ")
    .replaceAll("\\\\", " ")
    .replace(/<[^>]+>/g, "x")
    .replaceAll("$STATE_DIR", constant(INSTALL, "STATE_DIR"))
    .replaceAll("$TOKEN_FILE", tokenFile)
    .trim()
    .split(/\s+/);
  assert.equal(words[0], "$hub");
  const { command, flags } = parseCommandLine(words.slice(1));
  assert.equal(command, "attach");
  assert.deepEqual(
    [...flags.keys()].sort(),
    ["address", "instance", "server-id", "state-dir", "tls-cert", "tls-key", "token-file"],
  );
  assert.equal(flags.get("token-file"), "/etc/spex/server.token");
  assert.equal(flags.get("state-dir"), DEFAULT_STATE_DIR);
  assert.ok(
    text.includes('$TOKEN_FILE ($(written "$TOKEN_FILE")), root:$HUB_GROUP 0640'),
    "the token file is listed with the others, marked present or not",
  );
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

test("sudoers validation retries only unsupported requiretty and validates the complete unchanged allowlist (hub-7)", () => {
  const original = readFileSync(SUDOERS, "utf8").replaceAll("/opt/spex/", "/srv/acceptance/");
  for (const mode of ["supported", "sudo-rs", "malformed", "malformed-after-retry"]) {
    const root = scratch();
    const fragment = join(root, "fragment");
    const path = join(root, "bin");
    mkdirSync(path);
    writeFileSync(fragment, original);
    // visudo is the host boundary: record every complete candidate, emulate
    // sudo-rs's diagnostic, and reject malformed policy independently.
    const visudo = join(path, "visudo");
    writeFileSync(visudo, `#!/bin/bash
set -eu
[ "$1" = -cf ]
count=1
[ ! -f "$EVIDENCE/1" ] || count=2
cp "$2" "$EVIDENCE/$count"
if [ "$MODE" = supported ]; then exit 0; fi
if [ "$MODE" = malformed ]; then
  echo "$2:11:1: syntax error: invalid command" >&2
  exit 1
fi
if grep -qFx 'Defaults:spex-hub !requiretty' "$2"; then
  line=$(grep -nFx 'Defaults:spex-hub !requiretty' "$2")
  echo "$2:\${line%%:*}:20: syntax error: unknown setting: 'requiretty'" >&2
  exit 1
fi
if [ "$MODE" = malformed-after-retry ]; then
  echo "$2:10:1: syntax error: invalid command" >&2
  exit 1
fi
`);
    chmodSync(visudo, 0o755);
    const result = run("bash", [join(DEPLOY, "validate-sudoers.sh"), fragment], root, `${path}:/usr/bin:/bin`, "", {
      MODE: mode, EVIDENCE: root,
    });
    assert.equal(result.status, mode.startsWith("malformed") ? 1 : 0, `${mode}: ${result.stderr}`);
    assert.equal(readFileSync(join(root, "1"), "utf8"), original, "the first check sees the complete rendered policy");
    const retry = mode === "sudo-rs" || mode === "malformed-after-retry";
    assert.equal(existsSync(join(root, "2")), retry, `${mode}: retries only the exact optional setting diagnostic`);
    const compatible = original.replace(/^Defaults:spex-hub !requiretty\n/m, "");
    if (retry) assert.equal(readFileSync(join(root, "2"), "utf8"), compatible, "the second check sees every allowlisted command unchanged");
    assert.equal(readFileSync(fragment, "utf8"), mode === "sudo-rs" ? compatible : original, "a failed complete validation never replaces the policy");
  }
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

test("the sweep's service runs the built sweep as root on the hub's state and helper, its timer every minute, and the install script installs both and enables the timer (hub-5, hub-7, hub-8)", () => {
  const keys = unitKeys(REAPER_UNIT);
  const { program, script, words, flags } = execStart(one(keys, "ExecStart"));
  assert.equal(program, "/usr/bin/node");
  assert.equal(script, REAPER_SCRIPT);
  assert.ok(
    existsSync(join(packageDir, REAPER_SCRIPT.slice(INSTALLED_HUB.length))),
    "the unit runs the sweep this package builds",
  );
  assert.deepEqual(words, []);
  assert.deepEqual([...flags.keys()].sort(), ["helper", "state-dir"]);
  assert.equal(flags.get("state-dir"), DEFAULT_STATE_DIR);
  assert.equal(flags.get("helper"), DEFAULT_HELPER);
  assert.equal(one(keys, "Type"), "oneshot");
  // hub-5: a oneshot has no start timeout by default; the unit bounds a
  // sweep's time, so one that hangs holds off no later one.
  assert.equal(one(keys, "TimeoutStartSec"), "5min");
  assert.equal(keys.has("User"), false, "the sweep runs as root, the helper with no sudo");
  assert.equal(keys.has("Group"), false);
  assert.equal(one(keys, "UMask"), "0077");
  // hub-5: root writes the hub's state and the seats' runtime base alone,
  // the rest of the system read-only to it.
  assert.equal(one(keys, "ProtectSystem"), "strict");
  assert.deepEqual(one(keys, "ReadWritePaths").split(/\s+/), [DEFAULT_STATE_DIR, dirname(DEFAULT_RUN_DIR)]);
  assert.equal(one(keys, "NoNewPrivileges"), "yes");
  assert.equal(one(keys, "PrivateTmp"), "yes");
  // The sweep takes the unit's flags: run with them over an empty state
  // directory of its own, it finds nothing due and exits 0.
  const state = join(scratch(), "state");
  const swept = spawnSync(
    process.execPath,
    [join(packageDir, "dist", "reaper.js"), `--state-dir=${state}`, `--helper=${flags.get("helper")}`],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(swept.status, 0, swept.stderr);
  assert.equal(swept.stdout + swept.stderr, "");

  const timer = unitKeys(REAPER_TIMER);
  assert.equal(one(timer, "OnBootSec"), "1min");
  assert.equal(one(timer, "OnUnitActiveSec"), "1min");
  assert.equal(one(timer, "AccuracySec"), "5s");
  assert.equal(one(timer, "WantedBy"), "timers.target");
  assert.equal(timer.has("Unit"), false, "the timer starts the service of its own name");
  assert.equal(basename(REAPER_TIMER, ".timer"), basename(REAPER_UNIT, ".service"));

  const text = readFileSync(INSTALL, "utf8");
  const loop = /^for unit in (.+); do$/m.exec(text);
  assert.ok(loop, "the install script installs the units in one loop");
  const units = ["spex-hub.service", "spex-seat@.service", "spex-seat-reaper.service", "spex-seat-reaper.timer"];
  assert.deepEqual(loop[1].split(/\s+/).sort(), [...units].sort());
  for (const unit of units) assert.ok(existsSync(join(DEPLOY, unit)), `deploy/${unit} exists`);
  // A checkout lacking them is refused before the first change.
  const firstChange = text.indexOf('install -d -m 0700 -o root -g root "$NPM_CACHE"');
  for (const file of ["apps/hub/deploy/spex-seat-reaper.service", "apps/hub/deploy/spex-seat-reaper.timer"]) {
    const checked = text.indexOf(file);
    assert.ok(checked > 0 && checked < firstChange, `${file} is checked before the first change`);
  }
  assert.match(text, /^for built in .*\bapps\/hub\/dist\/reaper\.js\b.*; do$/m);
  const reload = text.indexOf("\nsystemctl daemon-reload\n");
  const enable = text.indexOf("\nsystemctl enable --now spex-seat-reaper.timer\n");
  assert.ok(reload > 0 && enable > reload, "the timer is enabled and started once systemd has read its units");
  // hub-7: the sweep run once on the host, the install refused where it
  // fails, after the units are in place; the locks' directory made as
  // the hub's own with the state directory (hub-8).
  const check = text.indexOf("\nif ! systemctl start spex-seat-reaper.service; then\n");
  assert.ok(check > enable, "the sweep is started once after its timer is enabled");
  assert.match(text.slice(check), /^  refuse 70 "the sweep did not run on this host/m);
  assert.match(text, /^install -d -m 0700 -o "\$HUB_USER" -g "\$HUB_GROUP" "\$STATE_DIR\/locks"$/m);
});
