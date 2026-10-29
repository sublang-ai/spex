// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Endpoint coverage (CORE-38): the core attached to a shell-supplied
// HTTP server (CORE-1, DR-033), and the handshake admissions and
// rejections of CORE-24 — token always required, browser origins
// admitted only when local or naming the host the request addressed —
// and the home's endpoint file the CLI finds the app by
// (core-service-143, DR-163).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { PROTOCOL_VERSION, type ServerMessage } from "./protocol.js";

interface HandshakeHeaders {
  origin?: string;
  host?: string;
}

function handshake(
  url: string,
  headers: HandshakeHeaders = {},
): Promise<{ outcome: "open"; hello: ServerMessage } | { outcome: "rejected" }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, {
      ...(headers.origin ? { origin: headers.origin } : {}),
      ...(headers.host ? { headers: { host: headers.host } } : {}),
    });
    socket.once("message", (data) => {
      const hello = JSON.parse(String(data)) as ServerMessage;
      socket.close();
      resolve({ outcome: "open", hello });
    });
    socket.once("error", () => resolve({ outcome: "rejected" }));
  });
}

test("attached endpoint admits the served page and rejects foreigners (CORE-38)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-endpoint-"));
  const httpServer = createServer();
  const service = await CoreService.start({
    configPath: join(dir, "playbook.config.yaml"),
    dataDir: join(dir, "state"),
    watchConfig: false,
    env: {},
    home: dir,
    token: "secret",
    httpServer,
  });
  try {
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    const port = (httpServer.address() as AddressInfo).port;
    assert.equal(service.port(), port);

    const url = `ws://127.0.0.1:${port}/?token=secret`;

    // A page served by the shell: Origin names the host the request
    // itself addressed — deliberately not a localhost name, so this
    // passes only through the same-host rule.
    const served = await handshake(url, {
      origin: "http://spex.example:8137",
      host: "spex.example:8137",
    });
    assert.equal(served.outcome, "open");
    assert.deepEqual(
      served.outcome === "open" && {
        type: served.hello.type,
        protocolVersion:
          served.hello.type === "hello" ? served.hello.protocolVersion : null,
      },
      { type: "hello", protocolVersion: PROTOCOL_VERSION },
    );

    // Non-browser client (no Origin) and the packaged renderer.
    assert.equal((await handshake(url)).outcome, "open");
    assert.equal((await handshake(url, { origin: "file://" })).outcome, "open");

    // A token-bearing handshake from a foreign web origin.
    assert.equal(
      (await handshake(url, { origin: "https://evil.example" })).outcome,
      "rejected",
    );

    // Wrong and missing tokens, even from an admissible origin.
    const base = `ws://127.0.0.1:${port}/`;
    assert.equal((await handshake(`${base}?token=wrong`)).outcome, "rejected");
    assert.equal((await handshake(base)).outcome, "rejected");
  } finally {
    await service.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The home's endpoint file as it stands: its parsed content and mode,
 * or null where none stands (core-service-143). */
function endpointFile(home: string): { content: unknown; mode: number } | null {
  const file = join(home, "local", "endpoint.json");
  if (!existsSync(file)) return null;
  return {
    content: JSON.parse(readFileSync(file, "utf8")),
    mode: statSync(file).mode & 0o777,
  };
}

test("the core keeps the endpoint file of the loopback socket it binds and removes it at stop (core-service-143)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-endpoint-file-"));
  const dataDir = join(dir, "state");
  // A file a process that died left is replaced by the next start.
  mkdirSync(join(dataDir, "local"), { recursive: true });
  writeFileSync(
    join(dataDir, "local", "endpoint.json"),
    JSON.stringify({ format: 1, url: "ws://127.0.0.1:9/?token=stale", pid: 2 ** 22 }),
  );
  const service = await CoreService.start({
    configPath: join(dir, "playbook.config.yaml"),
    dataDir,
    watchConfig: false,
    env: {},
    home: dir,
    token: "endpoint secret",
  });
  try {
    const url = `ws://127.0.0.1:${service.port()}/?token=endpoint%20secret`;
    assert.deepEqual(endpointFile(dataDir), {
      content: { format: 1, url, pid: process.pid },
      mode: 0o600,
    });
    // The URL the file names is the endpoint itself.
    assert.equal((await handshake(url)).outcome, "open");
  } finally {
    await service.stop();
  }
  assert.equal(endpointFile(dataDir), null, "the stop removes the file");
  rmSync(dir, { recursive: true, force: true });
});

test("an attached core writes the endpoint file only as its shell announces it (core-service-143)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-endpoint-attached-"));
  const dataDir = join(dir, "state");
  const httpServer = createServer();
  const service = await CoreService.start({
    configPath: join(dir, "playbook.config.yaml"),
    dataDir,
    watchConfig: false,
    env: {},
    home: dir,
    token: "secret",
    httpServer,
  });
  try {
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    // The shell owns the bind: until it names its URL, there is none.
    assert.equal(endpointFile(dataDir), null);
    const url = `http://127.0.0.1:${service.port()}/?token=secret`;
    service.announceEndpoint(url);
    assert.deepEqual(endpointFile(dataDir), {
      content: { format: 1, url, pid: process.pid },
      mode: 0o600,
    });
  } finally {
    await service.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
  assert.equal(endpointFile(dataDir), null, "the stop removes the file");
  rmSync(dir, { recursive: true, force: true });
});

test("an empty token option cannot disable the handshake (CORE-24)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-endpoint-empty-"));
  const service = await CoreService.start({
    configPath: join(dir, "playbook.config.yaml"),
    dataDir: join(dir, "state"),
    watchConfig: false,
    env: {},
    home: dir,
    token: "",
  });
  try {
    // The blank secret is replaced, so a bare ?token= does not match.
    assert.notEqual(service.token(), "");
    const base = `ws://127.0.0.1:${service.port()}/`;
    assert.equal((await handshake(`${base}?token=`)).outcome, "rejected");
    assert.equal(
      (await handshake(`${base}?token=${service.token()}`)).outcome,
      "open",
    );
  } finally {
    await service.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
