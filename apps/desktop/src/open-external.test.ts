// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The open-URL bridge (app-shell-20, app-shell-37, DR-127): the main
// process opens a URL in the system browser only at the origin of an
// instance the home lists or is signing in to — `https`, or `http` on
// this device's loopback as a stand-in instance is — with no credential
// in it; and the browser sign-in URLs a real core started by the
// shell's own option builder composes are the ones it opens
// (app-shell-38).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoreService, type GroupsState } from "@sublang/spex-core";
import { startStandinHost } from "@sublang/spex-core/testing";

import { desktopCoreOptions } from "./core-options.js";
import { openInstanceUrl, resolveInstanceUrl } from "./open-external.js";

/** Every scratch directory a test here makes, removed once the file's
 * tests end. */
const scratchDirs: string[] = [];
test.after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

test("app-shell-37: a URL at any origin the core names opens, normalized", () => {
  const origins = ["https://spex.pub", "https://internal.spex.example", "http://127.0.0.1:4321"];
  const signIn = "https://spex.pub/login/app?client_id=spex&state=s&redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback";
  assert.equal(resolveInstanceUrl(origins, signIn), signIn);
  assert.equal(resolveInstanceUrl(origins, "https://SPEX.pub/login/device"), "https://spex.pub/login/device");
  // The second instance as well as the first.
  assert.equal(resolveInstanceUrl(origins, " https://internal.spex.example/login/app "), "https://internal.spex.example/login/app");
  // A stand-in instance on this device's loopback, as the journeys run one.
  assert.equal(resolveInstanceUrl(origins, "http://127.0.0.1:4321/login/app?x=1"), "http://127.0.0.1:4321/login/app?x=1");
  assert.equal(resolveInstanceUrl(["http://localhost:4321"], "http://localhost:4321/login/app"), "http://localhost:4321/login/app");
});

test("app-shell-37, app-shell-20: anything else is refused", () => {
  const origins = ["https://spex.pub", "http://127.0.0.1:4321"];
  for (const requested of [
    "https://evil.example/login/app",
    "https://spex.pub.evil.example/login/app",
    // The first's host at another port is another origin.
    "https://spex.pub:8443/login/app",
    "http://127.0.0.1:4322/login/app",
    "http://spex.pub/login/app",
    // A credential is never handed on (DR-064).
    "https://user:secret@spex.pub/login/app",
    "https://user@spex.pub/login/app",
    "http://ada:secret@127.0.0.1:4321/login/app",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "spex.pub/login/app",
    "",
    42,
    null,
    undefined,
  ]) {
    assert.equal(resolveInstanceUrl(origins, requested), null, String(requested));
  }
  // An empty list opens nothing.
  assert.equal(resolveInstanceUrl([], "https://spex.pub/login/app"), null);
  // A plain-HTTP origin off the loopback, or one that is no URL, names
  // nothing to open.
  assert.equal(resolveInstanceUrl(["http://spex.example"], "http://spex.example/login/app"), null);
  assert.equal(resolveInstanceUrl(["not a url"], "https://spex.pub/login/app"), null);
});

test("app-shell-37: the open channel hands only an allowed URL to the browser, and a refusal or the OS's failure answers false", async () => {
  const opened: string[] = [];
  const open = async (url: string): Promise<void> => { opened.push(url); };
  assert.equal(await openInstanceUrl(["https://spex.pub"], "https://SPEX.pub/login/app", open), true);
  assert.deepEqual(opened, ["https://spex.pub/login/app"]);
  assert.equal(await openInstanceUrl(["https://spex.pub"], "https://evil.example/login/app", open), false);
  assert.equal(await openInstanceUrl([], "https://spex.pub/login/app", open), false);
  assert.deepEqual(opened, ["https://spex.pub/login/app"], "a refused URL reaches no browser");
  assert.equal(await openInstanceUrl(["https://spex.pub"], "https://spex.pub/login/app", async () => { throw new Error("no browser"); }), false);
});

test("app-shell-20: the main process serves the open channel behind the instance rule, and the preload exposes it", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /ipcMain\.handle\("spex:open-external"/);
  assert.match(source, /openInstanceUrl\(service\?\.instanceOrigins\(\) \?\? \[\], requested, \(url\) => shell\.openExternal\(url\)\)/);
  assert.doesNotMatch(source, /hostUrl\(\)/);
  const preload = readFileSync(new URL("../preload.cjs", import.meta.url), "utf8");
  assert.match(preload, /openExternal: \(url\) => ipcRenderer\.invoke\("spex:open-external", url\)/);
});

test("app-shell-38: the desktop's real core opens the sign-in pages of the instances it lists and signs in to, and nothing else", { timeout: 120_000 }, async (t) => {
  const first = await startStandinHost({ dir: scratchDir("spex-desktop-first-") });
  t.after(() => first.close());
  const second = await startStandinHost({ dir: scratchDir("spex-desktop-second-"), displayName: "Second stand-in" });
  t.after(() => second.close());
  const scratch = scratchDir("spex-desktop-core-");
  // This test's own Node stands in for the Electron binary the shell
  // runs as Node: Git's helper runs on it as on Electron.
  const electron = process.execPath;
  const options = desktopCoreOptions({
    dataDir: join(scratch, "home"),
    userData: join(scratch, "userdata"),
    systemLanguages: ["en-US"],
    execPath: electron,
    moduleUrl: import.meta.url,
  });
  // app-shell-15: the core starts with the browser flow and the Electron
  // binary as the helper's runtime.
  assert.equal(options.signIn, "browser");
  assert.deepEqual(options.hostRuntime, { execPath: electron, electron: true });
  const service = await CoreService.start({
    ...options,
    token: "test",
    // A home created against the first instance (git-host-1), with Git
    // configured only here.
    env: {
      PATH: process.env.PATH ?? "",
      HOME: join(scratch, "user"),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      SPEX_HOST_URL: first.url,
    },
    home: join(scratch, "user"),
    watchConfig: false,
    adapterRuntime: () => ({ usable: true }),
  });
  t.after(() => service.stop());

  const socket = new WebSocket(`ws://127.0.0.1:${service.port()}/?token=test`);
  t.after(() => socket.close());
  type Reply = { ok: boolean; result?: unknown; error?: { message: string } };
  const replies = new Map<string, (reply: Reply) => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; id?: string } & Reply;
    if (message.type === "reply" && message.id) replies.get(message.id)?.(message);
  });
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => rejectOpen(new Error("the socket did not open")), { once: true });
  });
  let nextId = 0;
  const command = async (type: string, fields: Record<string, unknown> = {}): Promise<unknown> => {
    const id = `c${(nextId += 1)}`;
    const reply = await new Promise<Reply>((resolveReply) => {
      replies.set(id, resolveReply);
      socket.send(JSON.stringify({ type, id, ...fields }));
    });
    assert.ok(reply.ok, `${type}: ${reply.error?.message ?? "refused"}`);
    return reply.result;
  };

  // The channel exactly as main.ts serves it, the browser a spy.
  const opened: string[] = [];
  const channel = (requested: unknown) =>
    openInstanceUrl(service.instanceOrigins(), requested, async (url) => { opened.push(url); });

  // A home that lists no instance opens nothing until a sign-in names one.
  assert.deepEqual(service.instanceOrigins(), []);
  assert.equal(await channel(`${first.url}/login/app`), false);
  const atFirst = (await command("space.signin.start", { url: first.url })) as { flow: string; url: string };
  // The desktop runs the browser flow (app-shell-15, git-host-2).
  assert.equal(atFirst.flow, "browser");
  assert.equal(new URL(atFirst.url).origin, first.url);
  assert.equal(new URL(atFirst.url).pathname, "/login/app");
  assert.equal(await channel(atFirst.url), true);
  // The browser approves and returns to the core, which lists the first.
  const answer = await fetch(atFirst.url, { redirect: "manual" });
  const location = answer.headers.get("location");
  assert.ok(location, `the stand-in answered ${answer.status}`);
  await (await fetch(location)).text();
  const deadline = Date.now() + 30_000;
  for (;;) {
    const state = (await command("space.get")) as GroupsState;
    if (state.signIn.phase === "idle" && state.instances.some((entry) => entry.origin === first.url && entry.signedIn)) break;
    assert.ok(Date.now() < deadline, `the first never read signed in: ${JSON.stringify(state.signIn)}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.deepEqual(service.instanceOrigins(), [first.url]);

  // While a sign-in to the second runs, its page opens, and so does one
  // at the first the home lists.
  const atSecond = (await command("space.signin.start", { url: second.url })) as { flow: string; url: string };
  assert.equal(atSecond.flow, "browser");
  assert.equal(new URL(atSecond.url).origin, second.url);
  assert.equal(new URL(atSecond.url).pathname, "/login/app");
  assert.deepEqual(service.instanceOrigins(), [first.url, second.url]);
  assert.equal(await channel(atSecond.url), true);
  assert.equal(await channel(`${first.url}/login/app`), true);
  const allowed = [new URL(atFirst.url).href, new URL(atSecond.url).href, `${first.url}/login/app`];
  assert.deepEqual(opened, allowed);

  // An origin the home neither lists nor signs in to — the first's host
  // at a port neither instance holds — and a URL carrying a credential
  // open nothing.
  const listedPorts = new Set([new URL(first.url).port, new URL(second.url).port]);
  const elsewhere = new URL(`${first.url}/login/app`);
  let port = Number(elsewhere.port) + 1;
  while (listedPorts.has(String(port))) port += 1;
  elsewhere.port = String(port);
  assert.equal(await channel(elsewhere.href), false);
  const credential = new URL(atSecond.url);
  credential.username = "ada";
  credential.password = "secret";
  assert.equal(await channel(credential.href), false);
  assert.deepEqual(opened, allowed);

  // Once that sign-in is cancelled, the second is no instance to open.
  await command("space.signin.cancel");
  assert.deepEqual(service.instanceOrigins(), [first.url]);
  assert.equal(await channel(atSecond.url), false);
  assert.deepEqual(opened, allowed);
});
