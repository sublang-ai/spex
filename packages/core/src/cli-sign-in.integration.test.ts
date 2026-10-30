// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The command line's sign-in at a Space (cli-17, cli-18): the packed
// `@sublang/spex`, installed into a scratch prefix from `npm pack`, runs
// `login`, `whoami` and `logout` as a child process on a scratch home
// against two instances of the core's stand-in host, with no core
// running. It lives in the core because the stand-in host does; the
// CLI's own suite stays free of the core (DR-165).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { startStandinHost, type StandinHost } from "./testing/standin-host.js";

const CORE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI_PACKAGE = resolve(CORE, "../cli");
const SCRATCH = realpathSync(mkdtempSync(join(tmpdir(), "spex-cli-sign-in-")));
const HOME = join(SCRATCH, "home");
const WORK = join(SCRATCH, "work");
const BOB = { id: "1002", login: "bob", displayName: "Bob" };

let CLI = "";
let first: StandinHost;
let second: StandinHost;
/** Everything every run printed, checked for secrets at the end. */
const printed: string[] = [];

function npm(args: string[], cwd: string): string {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

interface Run {
  proc: ReturnType<typeof spawn>;
  stdout(): string;
  stderr(): string;
  /** Resolves once standard output matches, with the match. */
  waitFor(pattern: RegExp): Promise<RegExpMatchArray>;
  done: Promise<{ code: number | null; stdout: string; stderr: string }>;
}

/** The packed CLI on the scratch home, the first instance its default
 * where the home names none yet. */
function spex(args: string[]): Run {
  const env: NodeJS.ProcessEnv = { ...process.env, SPEX_HOME: HOME, SPEX_HOST_URL: first.url };
  delete env.SPEX_SERVER_URL;
  const proc = spawn(process.execPath, [CLI, ...args], { cwd: WORK, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const waiters: { pattern: RegExp; resolve: (match: RegExpMatchArray) => void; reject: (error: Error) => void }[] = [];
  const check = (): void => {
    for (const waiter of [...waiters]) {
      const match = stdout.match(waiter.pattern);
      if (match) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(match);
      }
    }
  };
  proc.stdout!.on("data", (data) => { stdout += String(data); check(); });
  proc.stderr!.on("data", (data) => { stderr += String(data); });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveDone, rejectDone) => {
    proc.on("error", rejectDone);
    proc.on("close", (code) => {
      printed.push(stdout, stderr);
      for (const waiter of waiters.splice(0)) waiter.reject(new Error(`exited ${code} before ${waiter.pattern}: ${stdout}${stderr}`));
      resolveDone({ code, stdout, stderr });
    });
  });
  return {
    proc,
    stdout: () => stdout,
    stderr: () => stderr,
    waitFor: (pattern) => new Promise((resolveWait, rejectWait) => {
      waiters.push({ pattern, resolve: resolveWait, reject: rejectWait });
      check();
    }),
    done,
  };
}

/** The device flow's URL and code as `login` printed them. */
async function printedCode(run: Run, host: StandinHost): Promise<string> {
  const [, url, code] = await run.waitFor(/URL: +(\S+)\n +Code: +(\S+)\nWaiting for .+ to confirm/);
  assert.ok(url.startsWith(`${host.url}/login/device`), url);
  assert.ok(host.script.pendingDevices().includes(code), `the code ${code} is pending at the instance`);
  return code;
}

const homeFile = (): string => join(HOME, "home.yaml");
const credentialsFile = (): string => join(HOME, "local", "credentials.yaml");
const readHome = (): any => parseYaml(readFileSync(homeFile(), "utf8"));
/** Every request both instances took so far. */
const hostRequests = (): number => first.script.requests.length + second.script.requests.length;
const readCredentials = (): any => existsSync(credentialsFile()) ? parseYaml(readFileSync(credentialsFile(), "utf8")) : null;
const bytesOr = (file: string): string | null => existsSync(file) ? readFileSync(file, "utf8") : null;

before(async () => {
  mkdirSync(WORK);
  first = await startStandinHost({ dir: join(SCRATCH, "first"), displayName: "First" });
  second = await startStandinHost({ dir: join(SCRATCH, "second"), displayName: "Second", person: BOB });
  // The published artifact: packed once, installed into a scratch prefix,
  // its dependencies from the npm cache where it holds them.
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", SCRATCH], CLI_PACKAGE))[0];
  assert.ok(packed.files.some((file: { path: string }) => file.path === "dist/commands/login.js"));
  const prefix = join(SCRATCH, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline", join(SCRATCH, packed.filename)], SCRATCH);
  CLI = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@sublang/spex/dist/cli.js");
  assert.ok(existsSync(CLI), CLI);
});

after(async () => {
  await first?.close();
  await second?.close();
  rmSync(SCRATCH, { recursive: true, force: true });
});

test("cli-17, cli-18: login, whoami and logout at two stand-in instances, with no core running", async () => {
  // --help names the three commands.
  const help = await spex(["--help"]).done;
  assert.equal(help.code, 0);
  for (const command of ["login", "logout", "whoami"]) assert.match(help.stdout, new RegExp(`^  ${command} \\[--space <origin>\\]`, "m"));

  // A fresh home lists no instance: whoami prints none and writes
  // nothing (cli-12).
  const fresh = await spex(["whoami"]).done;
  assert.equal(fresh.code, 0, fresh.stderr);
  assert.equal(fresh.stdout, "");
  assert.equal(existsSync(HOME), false, "whoami writes no home");

  // A refused origin exits 1 with the cause on standard error, nothing
  // written (cli-10, cli-18).
  const refused = await spex(["login", "--space", "http://example.com"]).done;
  assert.equal(refused.code, 1);
  assert.equal(refused.stdout, "");
  assert.match(refused.stderr, /^spex login: --space: http:\/\/example\.com is not an instance's origin: origin refused: http on a host that is not loopback\n$/);
  assert.equal(existsSync(HOME), false, "a refused login writes no home");

  // The first login at the default instance: the URL and the code
  // printed, the instance recorded as the default with its account once
  // the stand-in confirms, its token kept owner-only (cli-10).
  const signingIn = spex(["login"]);
  first.script.approveDevice(await printedCode(signingIn, first));
  const signedIn = await signingIn.done;
  assert.equal(signedIn.code, 0, signedIn.stderr);
  assert.match(signedIn.stdout, /Signed in at First as ada\. First is this device's default Space\.\n$/);
  let home = readHome();
  assert.deepEqual(home.instances, [{ origin: first.url, clientId: "spex", account: { id: "1001", login: "ada", displayName: "Ada Lovelace" }, displayName: "First" }]);
  assert.equal(home.origin, first.url);
  assert.equal(existsSync(join(HOME, "workspace")), false, "the CLI makes no workspace");
  let credentials = readCredentials();
  assert.equal(credentials.format, 1);
  assert.deepEqual(Object.keys(credentials.hosts), [first.url]);
  assert.match(credentials.hosts[first.url].access, /^spexa_/);
  assert.match(credentials.hosts[first.url].refresh, /^spexr_/);
  if (process.platform !== "win32") {
    assert.equal(statSync(credentialsFile()).mode & 0o777, 0o600, "the credential file is owner-only");
    assert.equal(statSync(join(HOME, "local")).mode & 0o777, 0o700, "local/ is owner-only");
  }
  assert.equal(first.script.liveDevices(), 1);

  // A denied code at the second records nothing (cli-10).
  const homeBefore = bytesOr(homeFile());
  const credentialsBefore = bytesOr(credentialsFile());
  const denying = spex(["login", "--space", second.url]);
  second.script.denyDevice(await printedCode(denying, second));
  const denied = await denying.done;
  assert.equal(denied.code, 1);
  assert.match(denied.stderr, /^spex login: not signed in: the code was denied at 127\.0\.0\.1:\d+; nothing recorded\n$/);
  assert.equal(bytesOr(homeFile()), homeBefore, "a denied code leaves home.yaml as it stood");
  assert.equal(bytesOr(credentialsFile()), credentialsBefore, "a denied code keeps no credential");

  // login --space at the second records it after the first, not as the
  // default (cli-10).
  const secondIn = spex(["login", "--space", second.url]);
  second.script.approveDevice(await printedCode(secondIn, second));
  const secondDone = await secondIn.done;
  assert.equal(secondDone.code, 0, secondDone.stderr);
  assert.match(secondDone.stdout, /Signed in at Second as bob\.\n$/);
  home = readHome();
  assert.deepEqual(home.instances.map((entry: any) => [entry.origin, entry.account.login, entry.displayName]), [[first.url, "ada", "First"], [second.url, "bob", "Second"]]);
  assert.deepEqual(Object.keys(readCredentials().hosts).sort(), [first.url, second.url].sort());

  // A second login at a signed-in instance reports it, asking nothing
  // of the instance (cli-10).
  const requests = first.script.deviceRequests.length;
  const again = await spex(["login"]).done;
  assert.equal(again.code, 0, again.stderr);
  assert.equal(again.stdout, "Signed in at First as ada; spex login --force signs in again.\n");
  assert.equal(first.script.deviceRequests.length, requests, "no device request made");

  // --force signs in again: a new token in place of the former, whose
  // device the instance no longer lists (cli-10).
  const former = readCredentials().hosts[first.url];
  const forcing = spex(["login", "--force"]);
  first.script.approveDevice(await printedCode(forcing, first));
  const forced = await forcing.done;
  assert.equal(forced.code, 0, forced.stderr);
  assert.match(forced.stdout, /Signed in at First as ada\./);
  const renewed = readCredentials().hosts[first.url];
  assert.notEqual(renewed.access, former.access);
  assert.notEqual(renewed.refresh, former.refresh);
  assert.equal(first.script.liveDevices(), 1, "the former device is revoked");
  assert.equal(readHome().instances[0].origin, first.url, "the default stays");

  // whoami names both, the default marked, no secret, asking no
  // instance (cli-12).
  const asked = hostRequests();
  const both = await spex(["whoami"]).done;
  assert.equal(both.code, 0, both.stderr);
  const lines = both.stdout.trimEnd().split("\n");
  assert.equal(lines.length, 2, both.stdout);
  assert.match(lines[0], /^127\.0\.0\.1:\d+ +First +ada +\(default\)$/);
  assert.match(lines[1], /^127\.0\.0\.1:\d+ +Second +bob$/);
  assert.ok(lines[0].startsWith(new URL(first.url).host) && lines[1].startsWith(new URL(second.url).host));
  const one = await spex(["whoami", "--space", second.url]).done;
  assert.equal(one.code, 0, one.stderr);
  assert.match(one.stdout, /^127\.0\.0\.1:\d+ +Second +bob\n$/);
  // One the home does not list is printed signed out.
  const unlistedWho = await spex(["whoami", "--space", "http://127.0.0.1:9"]).done;
  assert.equal(unlistedWho.code, 0, unlistedWho.stderr);
  assert.equal(unlistedWho.stdout, "127.0.0.1:9  signed out\n");
  assert.equal(hostRequests(), asked, "whoami asks no instance");

  // logout --space at the second revokes the device there and marks the
  // instance signed out, keeping its entry and the first's (cli-11).
  assert.equal(second.script.liveDevices(), 1);
  const out = await spex(["logout", "--space", second.url]).done;
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout, "Signed out at Second; bob is no longer signed in on this device.\n");
  assert.equal(second.script.liveDevices(), 0, "the second instance no longer lists the device");
  assert.equal(first.script.liveDevices(), 1, "the first instance's device stands");
  home = readHome();
  assert.deepEqual(home.instances[1], { origin: second.url, clientId: "spex", account: { id: BOB.id, login: "bob", displayName: "Bob" }, displayName: "Second", signedOut: true });
  assert.equal(home.instances[0].signedOut, undefined);
  assert.deepEqual(Object.keys(readCredentials().hosts), [first.url]);
  const afterOut = await spex(["whoami"]).done;
  assert.match(afterOut.stdout, /^127\.0\.0\.1:\d+ +Second +signed out$/m);
  const outAgain = await spex(["logout", "--space", second.url]).done;
  assert.equal(outAgain.code, 0, outAgain.stderr);
  assert.equal(outAgain.stdout, "Already signed out at Second.\n");

  // An instance the home does not list is refused, naming spex whoami
  // (cli-11).
  const unlisted = await spex(["logout", "--space", "http://127.0.0.1:9"]).done;
  assert.equal(unlisted.code, 1);
  assert.equal(unlisted.stderr, "spex logout: 127.0.0.1:9 is not among this device's Spaces; spex whoami lists them\n");

  // An interrupt while a login waits on a pending code exits 130 with
  // the cause on standard error, nothing recorded (cli-13, cli-18).
  const homeHeld = bytesOr(homeFile());
  const waiting = spex(["login", "--space", second.url]);
  await printedCode(waiting, second);
  waiting.proc.kill("SIGINT");
  const interrupted = await waiting.done;
  assert.equal(interrupted.code, 130);
  assert.equal(interrupted.stderr, "spex login: interrupted; nothing recorded\n");
  assert.equal(bytesOr(homeFile()), homeHeld, "an interrupted login records nothing");
  assert.deepEqual(Object.keys(readCredentials().hosts), [first.url]);

  // A forced login whose home file stops reading while it waits records
  // nothing: the home as it stood, the former token kept (cli-10).
  const homeStood = bytesOr(homeFile())!;
  const pairStood = readCredentials().hosts[first.url];
  const unrecorded = spex(["login", "--force"]);
  const unrecordedCode = await printedCode(unrecorded, first);
  writeFileSync(homeFile(), "format: 99\n");
  first.script.approveDevice(unrecordedCode);
  const unrecordedDone = await unrecorded.done;
  writeFileSync(homeFile(), homeStood);
  assert.equal(unrecordedDone.code, 1);
  assert.match(unrecordedDone.stderr, /^spex login: not signed in: .*home\.yaml.*; nothing recorded\n$/);
  assert.deepEqual(readCredentials().hosts[first.url], pairStood, "the former token is kept");

  // No access or refresh secret anywhere in any output (cli-13).
  const all = printed.join("\n");
  assert.doesNotMatch(all, /spex[ar]_/, "no secret printed");
  const stored = readCredentials().hosts[first.url];
  for (const secret of [stored.access, stored.refresh, former.access, former.refresh]) assert.ok(!all.includes(secret));
});
