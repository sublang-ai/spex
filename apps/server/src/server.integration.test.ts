// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Serving, TLS, bind-safety, and shutdown coverage
// (SERVER-SHELL-9..12, 17, 19): the real shell over real HTTP(S) and
// WebSocket connections, and a real child process for the signal
// path. The staged bundle is the real UI build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
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

test(
  "bundle realpaths stay contained (SERVER-SHELL-9, SERVER-SHELL-19)",
  { skip: process.platform === "win32" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "spex-server-path-"));
    const bundleDir = join(dir, "bundle");
    const outside = join(dir, "outside.txt");
    mkdirSync(bundleDir);
    writeFileSync(join(bundleDir, "leak.txt"), "initial bundle bytes");
    writeFileSync(outside, "not in the bundle");
    const running = await startServer(tempOptions({ uiDist: bundleDir }));
    try {
      const base = `http://127.0.0.1:${running.port}`;
      const url = `${base}/leak.txt`;
      const initial = await rawRequest(url, {
        headers: { "accept-encoding": "br" },
      });
      assert.equal(initial.status, 200);
      unlinkSync(join(bundleDir, "leak.txt"));
      symlinkSync(outside, join(bundleDir, "leak.txt"));
      const response = await rawRequest(url, {
        headers: { "accept-encoding": "br" },
      });
      assert.equal(response.status, 404);
      assert.equal(response.body.byteLength, 0);
    } finally {
      await running.close();
    }
  },
);

test(
  "index semantics follow requested and real paths (SERVER-SHELL-9)",
  { skip: process.platform === "win32" },
  async () => {
    const requestBundle = async (
      bundleDir: string,
      path: string,
      headers: Record<string, string>,
    ): Promise<RawResponse> => {
      const running = await startServer(tempOptions({ uiDist: bundleDir }));
      try {
        return await rawRequest(
          `http://127.0.0.1:${running.port}${path}`,
          { headers },
        );
      } finally {
        await running.close();
      }
    };

    const requestedBundle = mkdtempSync(join(tmpdir(), "spex-index-request-"));
    writeFileSync(
      join(requestedBundle, "page.html"),
      '<meta content="connect-src http://localhost:8137"><p>requested</p>',
    );
    symlinkSync("page.html", join(requestedBundle, "index.html"));
    const requested = await requestBundle(requestedBundle, "/", {
      "accept-encoding": "br",
      host: "requested.example",
    });
    assert.equal(requested.status, 200);
    assert.equal(requested.headers["cache-control"], "no-store");
    assert.equal(requested.headers["content-encoding"], "br");
    assert.ok(
      brotliDecompressSync(requested.body).includes(
        Buffer.from("ws://requested.example"),
      ),
    );

    const resolvedBundle = mkdtempSync(join(tmpdir(), "spex-index-real-"));
    writeFileSync(
      join(resolvedBundle, "index.html"),
      '<meta content="connect-src http://localhost:8137"><p>resolved</p>',
    );
    symlinkSync("index.html", join(resolvedBundle, "alias.html"));
    const resolved = await requestBundle(resolvedBundle, "/alias.html", {
      "accept-encoding": "br",
      host: "resolved.example",
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.headers["cache-control"], "no-store");
    assert.equal(resolved.headers["content-encoding"], "br");
    assert.ok(
      brotliDecompressSync(resolved.body).includes(
        Buffer.from("ws://resolved.example"),
      ),
    );

    const binaryBundle = mkdtempSync(join(tmpdir(), "spex-index-binary-"));
    const binaryBody = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0xfd,
    ]);
    writeFileSync(join(binaryBundle, "image.png"), binaryBody);
    symlinkSync("image.png", join(binaryBundle, "index.html"));
    const binary = await requestBundle(binaryBundle, "/", {
      "accept-encoding": "br",
    });
    assert.equal(binary.status, 200);
    assert.equal(binary.headers["cache-control"], "no-store");
    assert.equal(binary.headers["content-type"], "image/png");
    assert.equal(binary.headers["content-encoding"], undefined);
    assert.deepEqual(binary.body, binaryBody);
  },
);

test("bundle type and coding matrix preserves bytes (SERVER-SHELL-9, SERVER-SHELL-17)", async () => {
  const bundleDir = mkdtempSync(join(tmpdir(), "spex-server-types-"));
  const cases = [
    ["index.html", "text/html; charset=utf-8", true],
    ["script.js", "text/javascript; charset=utf-8", true],
    ["style.css", "text/css; charset=utf-8", true],
    ["data.json", "application/json", true],
    ["source.map", "application/json", true],
    ["image.png", "image/png", false],
    ["vector.svg", "image/svg+xml", true],
    ["favicon.ico", "image/x-icon", false],
    ["notes.txt", "text/plain; charset=utf-8", true],
    ["font.woff2", "font/woff2", false],
    ["fallback.bin", "application/octet-stream", false],
  ] as const;
  for (const [name] of cases) {
    writeFileSync(join(bundleDir, name), `fixture bytes: ${name}`);
  }
  const running = await startServer(tempOptions({ uiDist: bundleDir }));
  try {
    const base = `http://127.0.0.1:${running.port}`;
    for (const [name, contentType, compressible] of cases) {
      const response = await rawRequest(`${base}/${name}`);
      assert.equal(response.status, 200, name);
      assert.equal(response.headers["content-type"], contentType, name);
      assert.deepEqual(
        response.body,
        readFileSync(join(bundleDir, name)),
        name,
      );
      const encoded = await rawRequest(`${base}/${name}`, {
        headers: { "accept-encoding": "br" },
      });
      assert.equal(encoded.headers["content-type"], contentType, name);
      if (compressible) {
        assert.equal(encoded.headers["content-encoding"], "br", name);
        assert.equal(encoded.headers.vary, "Accept-Encoding", name);
        assert.deepEqual(brotliDecompressSync(encoded.body), response.body, name);
      } else {
        assert.equal(encoded.headers["content-encoding"], undefined, name);
        assert.equal(encoded.headers.vary, undefined, name);
        assert.deepEqual(encoded.body, response.body, name);
      }
    }
    const get = await rawRequest(`${base}/image.png`);
    const head = await rawRequest(`${base}/image.png`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-type"], "image/png");
    if (head.headers["content-length"] !== undefined) {
      assert.equal(head.headers["content-length"], String(get.body.byteLength));
    }
    assert.equal(head.body.byteLength, 0);
  } finally {
    await running.close();
  }
});

test("bundle responses negotiate compression (SERVER-SHELL-9, SERVER-SHELL-17)", async () => {
  const options = tempOptions();
  const running = await startServer(options);
  try {
    const base = `http://127.0.0.1:${running.port}`;
    const identityPage = await rawRequest(`${base}/`);
    assert.equal(identityPage.status, 200);
    assert.equal(identityPage.headers["content-encoding"], undefined);
    assert.equal(identityPage.headers.vary, "Accept-Encoding");
    assert.equal(identityPage.headers["cache-control"], "no-store");
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
      "cache-control",
    ] as const) {
      assert.equal(head.headers[header], brotliAsset.headers[header]);
    }
    if (head.headers["content-length"] !== undefined) {
      assert.equal(
        head.headers["content-length"],
        String(brotliAsset.body.byteLength),
      );
    }
    assert.equal(head.body.byteLength, 0);
  } finally {
    await running.close();
  }
});

test("encoded asset cache reuses and refreshes bodies (SERVER-SHELL-19)", async () => {
  const bundleDir = mkdtempSync(join(tmpdir(), "spex-server-cache-"));
  const assetPath = join(bundleDir, "cached.js");
  const otherPath = join(bundleDir, "other.js");
  const indexPath = join(bundleDir, "index.html");
  const stamp = new Date("2026-01-01T00:00:00.000Z");
  const laterStamp = new Date("2026-01-01T00:00:02.000Z");
  const bodies = {
    beforeHead: Buffer.from("A".repeat(4096)),
    afterHead: Buffer.from("B".repeat(4096)),
    sameMetadata: Buffer.from("C".repeat(4096)),
    newSize: Buffer.from("D".repeat(4097)),
    newMtime: Buffer.from("E".repeat(4097)),
    freshLaunch: Buffer.from("G".repeat(4097)),
  };
  const otherBody = Buffer.from("F".repeat(4096));
  const indexBodies = {
    before: '<meta content="connect-src http://localhost:8137"><p>A</p>',
    after: '<meta content="connect-src http://localhost:8137"><p>B</p>',
  };
  assert.equal(
    Buffer.byteLength(indexBodies.before),
    Buffer.byteLength(indexBodies.after),
  );
  writeFileSync(assetPath, bodies.beforeHead);
  writeFileSync(otherPath, otherBody);
  writeFileSync(indexPath, indexBodies.before);
  utimesSync(assetPath, stamp, stamp);
  utimesSync(otherPath, stamp, stamp);
  utimesSync(indexPath, stamp, stamp);
  const running = await startServer(tempOptions({ uiDist: bundleDir }));
  const url = `http://127.0.0.1:${running.port}/cached.js`;
  const base = `http://127.0.0.1:${running.port}`;
  const requestBrotli = () =>
    rawRequest(url, { headers: { "accept-encoding": "br" } });
  try {
    const head = await rawRequest(url, {
      method: "HEAD",
      headers: { "accept-encoding": "br" },
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-encoding"], "br");
    assert.equal(head.body.byteLength, 0);

    writeFileSync(assetPath, bodies.afterHead);
    utimesSync(assetPath, stamp, stamp);
    const first = await requestBrotli();
    assert.equal(first.headers["content-encoding"], "br");
    assert.deepEqual(brotliDecompressSync(first.body), bodies.afterHead);

    const gzip = await rawRequest(url, {
      headers: { "accept-encoding": "gzip" },
    });
    assert.equal(gzip.headers["content-encoding"], "gzip");
    assert.deepEqual(gunzipSync(gzip.body), bodies.afterHead);

    const other = await rawRequest(`${base}/other.js`, {
      headers: { "accept-encoding": "br" },
    });
    assert.equal(other.headers["content-encoding"], "br");
    assert.deepEqual(brotliDecompressSync(other.body), otherBody);

    writeFileSync(assetPath, bodies.sameMetadata);
    utimesSync(assetPath, stamp, stamp);
    const cached = await requestBrotli();
    assert.deepEqual(cached.body, first.body);
    assert.deepEqual(brotliDecompressSync(cached.body), bodies.afterHead);

    writeFileSync(assetPath, bodies.newSize);
    utimesSync(assetPath, stamp, stamp);
    const sizeRefresh = await requestBrotli();
    assert.deepEqual(brotliDecompressSync(sizeRefresh.body), bodies.newSize);

    writeFileSync(assetPath, bodies.newMtime);
    utimesSync(assetPath, laterStamp, laterStamp);
    const mtimeRefresh = await requestBrotli();
    assert.deepEqual(brotliDecompressSync(mtimeRefresh.body), bodies.newMtime);

    const firstPage = await rawRequest(`${base}/`, {
      headers: { "accept-encoding": "br", host: "first.example" },
    });
    const firstPageBody = brotliDecompressSync(firstPage.body);
    assert.equal(firstPage.headers["cache-control"], "no-store");
    assert.ok(firstPageBody.includes(Buffer.from("ws://first.example")));
    assert.ok(firstPageBody.includes(Buffer.from("<p>A</p>")));

    writeFileSync(indexPath, indexBodies.after);
    utimesSync(indexPath, stamp, stamp);
    const changedPage = await rawRequest(`${base}/`, {
      headers: { "accept-encoding": "br", host: "first.example" },
    });
    const changedPageBody = brotliDecompressSync(changedPage.body);
    assert.ok(changedPageBody.includes(Buffer.from("ws://first.example")));
    assert.ok(changedPageBody.includes(Buffer.from("<p>B</p>")));

    const secondHostPage = await rawRequest(`${base}/`, {
      headers: { "accept-encoding": "br", host: "second.example" },
    });
    assert.ok(
      brotliDecompressSync(secondHostPage.body).includes(
        Buffer.from("ws://second.example"),
      ),
    );
  } finally {
    await running.close();
  }

  writeFileSync(assetPath, bodies.freshLaunch);
  utimesSync(assetPath, laterStamp, laterStamp);
  const restarted = await startServer(tempOptions({ uiDist: bundleDir }));
  try {
    const response = await rawRequest(
      `http://127.0.0.1:${restarted.port}/cached.js`,
      { headers: { "accept-encoding": "br" } },
    );
    assert.deepEqual(
      brotliDecompressSync(response.body),
      bodies.freshLaunch,
    );
  } finally {
    await restarted.close();
  }
});

test(
  "bundle materialization failures stay local (SERVER-SHELL-9, SERVER-SHELL-19)",
  { skip: process.platform === "win32" },
  async (t) => {
    const bundleDir = mkdtempSync(join(tmpdir(), "spex-server-head-"));
    const encodedPath = join(bundleDir, "unreadable.js");
    const identityPath = join(bundleDir, "unreadable.png");
    const indexPath = join(bundleDir, "index.html");
    const encodedBody = Buffer.from("recoverable body".repeat(256));
    writeFileSync(encodedPath, encodedBody);
    writeFileSync(identityPath, "unreadable identity body");
    writeFileSync(
      indexPath,
      '<meta content="connect-src http://localhost:8137">',
    );
    const unreadablePaths = [encodedPath, identityPath, indexPath];
    for (const path of unreadablePaths) chmodSync(path, 0o000);
    const running = await startServer(tempOptions({ uiDist: bundleDir }));
    try {
      const base = `http://127.0.0.1:${running.port}`;
      const resolvedUnreadablePaths = unreadablePaths.map((path) =>
        realpathSync(path),
      );
      const diagnostics: string[] = [];
      t.mock.method(console, "error", (...values: unknown[]) => {
        diagnostics.push(values.map(String).join(" "));
      });
      const materializationDiagnostics = () =>
        diagnostics.filter((diagnostic) =>
          resolvedUnreadablePaths.some((path) => diagnostic.includes(path)),
        );

      const response = await rawRequest(
        `${base}/unreadable.js`,
        {
          method: "HEAD",
          headers: { "accept-encoding": "br" },
        },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers["content-encoding"], "br");
      assert.equal(response.headers.vary, "Accept-Encoding");
      assert.equal(response.body.byteLength, 0);
      assert.equal(materializationDiagnostics().length, 0);

      const failures: Array<[string, string, Record<string, string>]> = [
        ["/", indexPath, {}],
        ["/unreadable.png", identityPath, {}],
        ["/unreadable.js", encodedPath, { "accept-encoding": "br" }],
      ];
      for (const [path, , headers] of failures) {
        const failed = await rawRequest(`${base}${path}`, { headers });
        assert.equal(failed.status, 500, path);
        assert.equal(failed.body.byteLength, 0, path);
      }
      const failureDiagnostics = materializationDiagnostics();
      assert.equal(failureDiagnostics.length, failures.length);
      for (const [, expectedPath] of failures) {
        const resolvedPath = realpathSync(expectedPath);
        const matchingDiagnostics = failureDiagnostics.filter((diagnostic) =>
          diagnostic.includes(resolvedPath),
        );
        assert.equal(matchingDiagnostics.length, 1, resolvedPath);
        assert.match(
          matchingDiagnostics[0] ?? "",
          /EACCES|permission denied/i,
        );
      }

      const hello = await wsHello(
        `${base.replace("http", "ws")}/?token=secret`,
        base,
      );
      assert.equal(hello.type, "hello");

      chmodSync(encodedPath, 0o600);
      const recovered = await rawRequest(`${base}/unreadable.js`, {
        headers: { "accept-encoding": "br" },
      });
      assert.equal(recovered.status, 200);
      assert.equal(recovered.headers["content-encoding"], "br");
      assert.deepEqual(brotliDecompressSync(recovered.body), encodedBody);
      assert.equal(materializationDiagnostics().length, failures.length);
    } finally {
      for (const path of unreadablePaths) chmodSync(path, 0o600);
      await running.close();
    }
  },
);

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
