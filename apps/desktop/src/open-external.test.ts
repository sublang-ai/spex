// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The open-URL bridge (app-shell-20, app-shell-37, DR-103): the main
// process opens a URL in the system browser only at the Git host the
// home records — `https`, or `http` on this device's loopback as a
// stand-in host is — and the browser sign-in URL a real core composes
// for its recorded host is one it opens.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CoreService } from "@sublang/spex-core";
import { startStandinHost } from "@sublang/spex-core/testing";

import { desktopCoreOptions } from "./core-options.js";
import { resolveHostUrl } from "./open-external.js";

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

test("a URL at the recorded host opens, normalized", () => {
  const signIn = "https://spex.pub/login/app?client_id=spex&state=s&redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback";
  assert.equal(resolveHostUrl("https://spex.pub", signIn), signIn);
  assert.equal(resolveHostUrl("https://spex.pub/", "https://SPEX.pub/login/device"), "https://spex.pub/login/device");
  // A host recorded with a path opens only beneath it.
  assert.equal(resolveHostUrl("https://example.com/spex", "https://example.com/spex/login/app"), "https://example.com/spex/login/app");
  // A stand-in host on this device's loopback, as the journeys run one.
  assert.equal(resolveHostUrl("http://127.0.0.1:4321", "http://127.0.0.1:4321/login/app?x=1"), "http://127.0.0.1:4321/login/app?x=1");
  assert.equal(resolveHostUrl("http://localhost:4321", "http://localhost:4321/login/app"), "http://localhost:4321/login/app");
});

test("anything else is refused", () => {
  const host = "https://spex.pub";
  for (const requested of [
    "https://evil.example/login/app",
    "https://spex.pub.evil.example/login/app",
    "https://spex.pub:8443/login/app",
    "http://spex.pub/login/app",
    "https://user:secret@spex.pub/login/app",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://127.0.0.1:4321/login/app",
    "spex.pub/login/app",
    "",
    42,
    null,
    undefined,
  ]) {
    assert.equal(resolveHostUrl(host, requested), null, String(requested));
  }
  // Beneath a recorded path only: a sibling or a way out is refused.
  assert.equal(resolveHostUrl("https://example.com/spex", "https://example.com/spexy/login"), null);
  assert.equal(resolveHostUrl("https://example.com/spex", "https://example.com/spex/../evil"), null);
  assert.equal(resolveHostUrl("https://example.com/spex", "https://example.com/"), null);
  // A plain-HTTP host off the loopback is no host to open at all.
  assert.equal(resolveHostUrl("http://spex.example", "http://spex.example/login/app"), null);
  // No host recorded, nothing opens.
  assert.equal(resolveHostUrl(undefined, "https://spex.pub/login/app"), null);
  assert.equal(resolveHostUrl("not a url", "https://spex.pub/login/app"), null);
});

test("the main process serves the open channel behind the host rule, and the preload exposes it", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /ipcMain\.handle\("spex:open-external"/);
  assert.match(source, /resolveHostUrl\(service\?\.hostUrl\(\), requested\)/);
  assert.match(source, /shell\.openExternal\(target\)/);
  const preload = readFileSync(new URL("../preload.cjs", import.meta.url), "utf8");
  assert.match(preload, /openExternal: \(url\) => ipcRenderer\.invoke\("spex:open-external", url\)/);
});

test("app-shell-37: the browser sign-in URL the desktop's core composes opens at its recorded host", { timeout: 60_000 }, async (t) => {
  const host = await startStandinHost({ dir: scratchDir("spex-desktop-host-") });
  t.after(() => host.close());
  const scratch = scratchDir("spex-desktop-core-");
  const service = await CoreService.start({
    ...desktopCoreOptions({
      dataDir: join(scratch, "home"),
      userData: join(scratch, "userdata"),
      systemLanguages: ["en-US"],
      execPath: process.execPath,
      moduleUrl: import.meta.url,
    }),
    token: "test",
    env: { SPEX_HOST_URL: host.url },
    home: join(scratch, "user"),
    watchConfig: false,
    adapterRuntime: () => ({ usable: true }),
  });
  t.after(() => service.stop());
  // The home recorded the host it was started against (git-host-1).
  assert.equal(service.hostUrl(), host.url);

  const socket = new WebSocket(`ws://127.0.0.1:${service.port()}/?token=test`);
  t.after(() => socket.close());
  const replies = new Map<string, (reply: { ok: boolean; result?: unknown; error?: { message: string } }) => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; id?: string; ok: boolean };
    if (message.type === "reply" && message.id) replies.get(message.id)?.(message);
  });
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => rejectOpen(new Error("the socket did not open")), { once: true });
  });
  const command = (type: string, id: string) =>
    new Promise<{ ok: boolean; result?: unknown; error?: { message: string } }>((resolveReply) => {
      replies.set(id, resolveReply);
      socket.send(JSON.stringify({ type, id }));
    });

  const started = await command("space.signin.start", "s1");
  assert.ok(started.ok, started.error?.message ?? "space.signin.start was refused");
  const flow = started.result as { flow: string; url: string };
  // The desktop runs the browser flow (app-shell-15, git-host-2).
  assert.equal(flow.flow, "browser");
  assert.equal(new URL(flow.url).pathname, "/login/app");
  assert.equal(resolveHostUrl(service.hostUrl(), flow.url), new URL(flow.url).href);
  // The same page at another origin stays shut.
  const elsewhere = new URL(flow.url);
  elsewhere.port = String(Number(new URL(host.url).port) + 1);
  assert.equal(resolveHostUrl(service.hostUrl(), elsewhere.href), null);
  assert.ok((await command("space.signin.cancel", "s2")).ok);
});
