// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Serving, TLS, bind-safety, and shutdown coverage
// (SERVER-SHELL-9..12): the real shell over real HTTP(S) and
// WebSocket connections, and a real child process for the signal
// path. The staged bundle is the real UI build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { get as httpsGet } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

import { parseArgs, startServer, type ServerShellOptions } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
const tlsFixtures = resolve(here, "..", "test", "fixtures", "tls");

function tempOptions(
  overrides: Partial<ServerShellOptions> = {},
): ServerShellOptions {
  const dir = mkdtempSync(join(tmpdir(), "spex-server-"));
  const options = parseArgs(
    [
      "--port=0",
      "--token=secret",
      `--config=${join(dir, "playbook.config.yaml")}`,
      `--db=${join(dir, "server.db")}`,
    ],
    {},
  );
  return { ...options, ...overrides };
}

function wsHello(
  url: string,
  origin: string,
): Promise<{ type: string }> {
  return new Promise((resolveHello, rejectHello) => {
    const socket = new WebSocket(url, { origin, rejectUnauthorized: false });
    socket.once("message", (data) => {
      socket.close();
      resolveHello(JSON.parse(String(data)) as { type: string });
    });
    socket.once("error", rejectHello);
  });
}

test("one port serves the bundle and the core endpoint (SERVER-SHELL-9)", async () => {
  const running = await startServer(tempOptions());
  try {
    const base = `http://127.0.0.1:${running.port}`;

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<div id="root">/);
    assert.ok(
      html.includes(
        `connect-src 'self' ws://127.0.0.1:${running.port} wss://127.0.0.1:${running.port}`,
      ),
      "CSP names the serving origin",
    );

    const assetPath = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
    assert.ok(assetPath, "index references a script asset");
    const asset = await fetch(`${base}/${assetPath}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);

    const escape = await fetch(`${base}/..%2f..%2fpackage.json`);
    assert.equal(escape.status, 404);
    const posted = await fetch(`${base}/`, { method: "POST" });
    assert.equal(posted.status, 405);

    const hello = await wsHello(`${base.replace("http", "ws")}/?token=secret`, base);
    assert.equal(hello.type, "hello");
  } finally {
    await running.close();
  }
});

test("TLS serves https and wss on the one port (SERVER-SHELL-10)", async () => {
  const running = await startServer(
    tempOptions({
      tlsCert: join(tlsFixtures, "cert.pem"),
      tlsKey: join(tlsFixtures, "key.pem"),
    }),
  );
  try {
    assert.ok(running.url.startsWith("https://"), "access URL scheme is https");
    const status = await new Promise<number>((resolveGet, rejectGet) => {
      httpsGet(
        {
          host: "127.0.0.1",
          port: running.port,
          path: "/",
          rejectUnauthorized: false,
        },
        (res) => {
          res.resume();
          resolveGet(res.statusCode ?? 0);
        },
      ).on("error", rejectGet);
    });
    assert.equal(status, 200);

    const hello = await wsHello(
      `wss://127.0.0.1:${running.port}/?token=secret`,
      `https://127.0.0.1:${running.port}`,
    );
    assert.equal(hello.type, "hello");
  } finally {
    await running.close();
  }
});

test("a plaintext public bind is refused, --insecure lifts it (SERVER-SHELL-11)", async () => {
  await assert.rejects(
    startServer(tempOptions({ host: "0.0.0.0" })),
    /--tls-cert\/--tls-key.*--insecure/,
  );

  await assert.rejects(
    startServer(tempOptions({ tlsCert: join(tlsFixtures, "cert.pem") })),
    /--tls-key is missing/,
  );
  await assert.rejects(
    startServer(tempOptions({ tlsKey: join(tlsFixtures, "key.pem") })),
    /--tls-cert is missing/,
  );

  const running = await startServer(
    tempOptions({ host: "0.0.0.0", insecure: true }),
  );
  try {
    const page = await fetch(`http://127.0.0.1:${running.port}/`);
    assert.equal(page.status, 200);
  } finally {
    await running.close();
  }
});

test("the printed URL matches the endpoint and SIGTERM stops it (SERVER-SHELL-12)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-server-cli-"));
  const child = spawn(
    process.execPath,
    [
      resolve(here, "main.js"),
      "--port=0",
      "--token=t12",
      `--config=${join(dir, "playbook.config.yaml")}`,
      `--db=${join(dir, "server.db")}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "";
  let err = "";
  child.stdout.on("data", (data) => (out += data));
  child.stderr.on("data", (data) => (err += data));
  try {
    const url = await new Promise<string>((resolveUrl, rejectUrl) => {
      const deadline = setTimeout(
        () => rejectUrl(new Error(`no access URL printed; stderr: ${err}`)),
        15_000,
      );
      const poll = setInterval(() => {
        const found = /serving at (\S+)/.exec(out)?.[1];
        if (found) {
          clearTimeout(deadline);
          clearInterval(poll);
          resolveUrl(found);
        }
      }, 50);
    });
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.searchParams.get("token"), "t12");

    const page = await fetch(`http://127.0.0.1:${parsed.port}/`);
    assert.equal(page.status, 200);

    const exited = new Promise<number | null>((resolveExit) =>
      child.once("exit", (code) => resolveExit(code)),
    );
    child.kill("SIGTERM");
    assert.equal(await exited, 0);
    await assert.rejects(fetch(`http://127.0.0.1:${parsed.port}/`));
  } finally {
    child.kill("SIGKILL");
  }
});
