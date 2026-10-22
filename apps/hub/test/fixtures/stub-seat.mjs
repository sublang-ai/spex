// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The tests' stub seat (hub-9): a WebSocket endpoint on the seat's Unix
// socket admitting a handshake whose `?token=` is the token its file
// held at start (server-shell-25). It greets as a core does, answers
// `session.list` with the scripted `turnActive` and `project.list` with
// one project, closes with a requested code on `test.close`, and echoes
// every other frame, text or binary. Each connection's opening and
// closing is appended to FAKE_SEAT_EVENTS.
//
// Usage: stub-seat.mjs <id> <socket> <token file>

import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";

import { WebSocketServer } from "ws";

const [id, socketPath, tokenFile] = process.argv.slice(2);
const token = readFileSync(tokenFile, "utf8").trim();

function event(entry) {
  appendFileSync(process.env.FAKE_SEAT_EVENTS, `${JSON.stringify({ seat: id, ...entry })}\n`);
}

function turnActive() {
  try {
    const script = JSON.parse(readFileSync(process.env.FAKE_SEAT_SCRIPT, "utf8"));
    return script.turnActive?.[id] === true;
  } catch {
    return false;
  }
}

rmSync(socketPath, { force: true });
const server = createServer((_req, res) => res.writeHead(404).end());
const wss = new WebSocketServer({
  server,
  verifyClient: (info) => {
    const presented = new URL(info.req.url ?? "/", "ws://seat").searchParams.get("token");
    if (presented !== token) event({ event: "refused" });
    return presented === token;
  },
});

wss.on("connection", (socket, req) => {
  event({ event: "open", origin: req.headers.origin ?? null, authorization: req.headers.authorization !== undefined });
  socket.send(JSON.stringify({ type: "hello", protocolVersion: 1, coreVersion: "stub" }));
  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      socket.send(data, { binary: true });
      return;
    }
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      socket.send(String(data));
      return;
    }
    if (message.type === "session.list") {
      socket.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: [{ id: "s1", live: turnActive(), turnActive: turnActive() }] }));
    } else if (message.type === "project.list") {
      socket.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: [{ id: "p1", name: `seat ${id}` }] }));
    } else if (message.type === "test.close") {
      socket.close(message.code, "seat closed");
    } else {
      socket.send(String(data));
    }
  });
  socket.on("close", (code) => event({ event: "close", code }));
});

server.listen(socketPath);

const stop = () => {
  for (const client of wss.clients) client.terminate();
  server.close(() => {
    rmSync(socketPath, { force: true });
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
