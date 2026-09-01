// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Serving, TLS, bind-safety, and shutdown coverage
// (SERVER-SHELL-9..12, 17): the real shell over real HTTP(S) and
// WebSocket connections, and a real child process for the signal
// path. The staged bundle is the real UI build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  request as httpRequest,
  type IncomingHttpHeaders,
} from "node:http";
import { get as httpsGet } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { WebSocket } from "ws";

import {
  parseArgs,
  retargetCsp,
  startServer,
  type ServerShellOptions,
} from "./server.js";

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
      `--data-dir=${join(dir, "state")}`,
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

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

function rawRequest(
  url: string,
  options: {
    method?: "GET" | "HEAD";
    headers?: Record<string, string>;
  } = {},
): Promise<RawResponse> {
  return new Promise((resolveResponse, rejectResponse) => {
    const request = httpRequest(url, options, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.once("end", () => {
        resolveResponse({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
      response.once("error", rejectResponse);
    });
    request.once("error", rejectResponse);
    request.end();
  });
}

test("one port serves the bundle and the core endpoint (SERVER-SHELL-9)", async () => {
  const running = await startServer(tempOptions());
  try {
    const base = `http://127.0.0.1:${running.port}`;

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
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
    assert.equal((await escape.arrayBuffer()).byteLength, 0);
    const missing = await fetch(`${base}/missing.txt`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.arrayBuffer()).byteLength, 0);
    const malformed = await rawRequest(`${base}/bad%`);
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.byteLength, 0);
    const posted = await fetch(`${base}/`, { method: "POST" });
    assert.equal(posted.status, 405);
    assert.equal((await posted.arrayBuffer()).byteLength, 0);

    const hello = await wsHello(`${base.replace("http", "ws")}/?token=secret`, base);
    assert.equal(hello.type, "hello");
  } finally {
    await running.close();
  }
});

test("bundle realpaths stay contained (SERVER-SHELL-9)", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-server-path-"));
  const bundleDir = join(dir, "bundle");
  const outside = join(dir, "outside.txt");
  mkdirSync(bundleDir);
  writeFileSync(outside, "not in the bundle");
  symlinkSync(outside, join(bundleDir, "leak.txt"));
  const running = await startServer(tempOptions({ uiDist: bundleDir }));
  try {
    const response = await rawRequest(
      `http://127.0.0.1:${running.port}/leak.txt`,
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.byteLength, 0);
  } finally {
    await running.close();
  }
});

test("bundle responses negotiate compression (SERVER-SHELL-17)", async () => {
  const options = tempOptions();
  const running = await startServer(options);
  try {
    const base = `http://127.0.0.1:${running.port}`;
    const identityPage = await rawRequest(`${base}/`);
    assert.equal(identityPage.status, 200);
    assert.equal(identityPage.headers["content-encoding"], undefined);
    assert.equal(identityPage.headers.vary, "Accept-Encoding");
    assert.equal(identityPage.headers["cache-control"], "no-store");
    assert.equal(
      identityPage.headers["content-length"],
      String(identityPage.body.byteLength),
    );
    assert.deepEqual(
      identityPage.body,
      Buffer.from(
        retargetCsp(
          readFileSync(join(options.uiDist, "index.html"), "utf8"),
          `127.0.0.1:${running.port}`,
        ),
      ),
    );
    assert.ok(
      identityPage.body.includes(
        Buffer.from(
          `connect-src 'self' ws://127.0.0.1:${running.port} wss://127.0.0.1:${running.port}`,
        ),
      ),
      "identity page contains the retargeted CSP",
    );

    const brotliPage = await rawRequest(`${base}/`, {
      headers: { "accept-encoding": "gzip, br" },
    });
    assert.equal(brotliPage.headers["content-encoding"], "br");
    assert.equal(brotliPage.headers.vary, "Accept-Encoding");
    assert.equal(brotliPage.headers["cache-control"], "no-store");
    assert.deepEqual(brotliDecompressSync(brotliPage.body), identityPage.body);

    const assetPath = /src="\.\/(assets\/[^"]+\.js)"/.exec(
      identityPage.body.toString("utf8"),
    )?.[1];
    assert.ok(assetPath, "index references a script asset");
    const identityAsset = await rawRequest(`${base}/${assetPath}`);
    assert.equal(identityAsset.headers["content-encoding"], undefined);
    assert.equal(identityAsset.headers.vary, "Accept-Encoding");
    assert.deepEqual(
      identityAsset.body,
      readFileSync(join(options.uiDist, assetPath)),
    );

    const brotliAsset = await rawRequest(`${base}/${assetPath}`, {
      headers: { "accept-encoding": "gzip;q=1, br;q=0.5" },
    });
    assert.equal(brotliAsset.headers["content-encoding"], "br");
    assert.equal(brotliAsset.headers.vary, "Accept-Encoding");
    assert.equal(
      brotliAsset.headers["content-length"],
      String(brotliAsset.body.byteLength),
    );
    assert.ok(brotliAsset.body.byteLength < identityAsset.body.byteLength);
    assert.deepEqual(
      brotliDecompressSync(brotliAsset.body),
      identityAsset.body,
    );

    const gzipAsset = await rawRequest(`${base}/${assetPath}`, {
      headers: { "accept-encoding": "br;q=0, gzip" },
    });
    assert.equal(gzipAsset.headers["content-encoding"], "gzip");
    assert.equal(gzipAsset.headers.vary, "Accept-Encoding");
    assert.deepEqual(gunzipSync(gzipAsset.body), identityAsset.body);

    const wildcardAsset = await rawRequest(`${base}/${assetPath}`, {
      headers: { "accept-encoding": "br;q=0, *;q=1" },
    });
    assert.equal(wildcardAsset.headers["content-encoding"], "gzip");
    assert.deepEqual(gunzipSync(wildcardAsset.body), identityAsset.body);

    const png = await rawRequest(`${base}/favicon.png`, {
      headers: { "accept-encoding": "br, gzip" },
    });
    const identityPng = await rawRequest(`${base}/favicon.png`);
    assert.equal(png.status, 200);
    assert.equal(identityPng.status, 200);
    assert.equal(png.headers["content-type"], "image/png");
    assert.equal(png.headers["content-encoding"], undefined);
    assert.equal(png.headers.vary, undefined);
    assert.deepEqual(png.body, identityPng.body);
    assert.deepEqual(
      identityPng.body,
      readFileSync(join(options.uiDist, "favicon.png")),
    );

    const head = await rawRequest(`${base}/${assetPath}`, {
      method: "HEAD",
      headers: { "accept-encoding": "gzip, br" },
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-encoding"], "br");
    assert.equal(head.headers.vary, "Accept-Encoding");
    for (const header of [
      "content-type",
      "content-encoding",
      "vary",
      "content-length",
      "cache-control",
    ] as const) {
      assert.equal(head.headers[header], brotliAsset.headers[header]);
    }
    assert.equal(head.body.byteLength, 0);
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

test("startup refusals: public plaintext, lone TLS half, empty token (SERVER-SHELL-11)", async () => {
  await assert.rejects(
    startServer(tempOptions({ host: "0.0.0.0" })),
    /--tls-cert\/--tls-key.*--insecure/,
  );

  await assert.rejects(
    startServer(tempOptions({ token: "" })),
    /token must not be empty/,
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
      `--data-dir=${join(dir, "state")}`,
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
    const exitCode = await exited;
    // Windows cannot deliver SIGTERM — kill() force-terminates before
    // any handler runs — so the clean exit code is observable only on
    // POSIX; the port closing is asserted everywhere.
    if (process.platform !== "win32") assert.equal(exitCode, 0);
    await assert.rejects(fetch(`http://127.0.0.1:${parsed.port}/`));
  } finally {
    child.kill("SIGKILL");
  }
});
