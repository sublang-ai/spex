// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Endpoint coverage (CORE-38): the core attached to a shell-supplied
// HTTP server (CORE-1, DR-033), and the handshake admissions and
// rejections of CORE-24 — token always required, browser origins
// admitted only when local or naming the host the request addressed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
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
    dbPath: join(dir, "spex.db"),
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
  }
});

test("an empty token option cannot disable the handshake (CORE-24)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-endpoint-empty-"));
  const service = await CoreService.start({
    configPath: join(dir, "playbook.config.yaml"),
    dbPath: join(dir, "spex.db"),
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
  }
});
