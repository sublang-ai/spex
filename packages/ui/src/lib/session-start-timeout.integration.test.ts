// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { once } from "node:events";
import { setImmediate as nextTick } from "node:timers/promises";
import { WebSocket as PeerSocket, WebSocketServer } from "ws";
import { expect, test, vi } from "vitest";
import { PROTOCOL_VERSION } from "@sublang/spex-core/protocol";
import { SpexClient, type ConnectionStatus } from "./client.js";

type Request = { type: string; id: string };

async function wire() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("No loopback address");
  const requests: Request[] = [];
  let peer!: PeerSocket;
  server.on("connection", socket => {
    peer = socket;
    socket.on("message", bytes => requests.push(JSON.parse(String(bytes)) as Request));
    socket.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, coreVersion: "fixture", attachedCliVersion: "fixture" }));
  });
  let opened!: () => void;
  const ready = new Promise<void>(resolve => { opened = resolve; });
  const client = new SpexClient({
    url: `ws://127.0.0.1:${address.port}`,
    reconnectMs: 0,
    webSocketFactory: url => new PeerSocket(url) as unknown as WebSocket,
    onMessage: () => {},
    onStatus: (status: ConnectionStatus) => { if (status === "open") opened(); },
  });
  client.connect();
  await ready;
  const flush = async () => { for (let i = 0; i < 8; i++) await nextTick(); };
  const close = async () => {
    vi.useRealTimers();
    client.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  return { client, requests, peer, flush, close };
}

function observe(promise: Promise<unknown>) {
  const result: { state: string; value?: unknown } = { state: "pending" };
  promise.then(value => { result.state = "answered"; result.value = value; },
    (error: { code: string }) => { result.state = error.code; });
  return result;
}

test("a delayed real-wire session creation is sent once and can finish after the ordinary reply bound", async () => {
  const w = await wire();
  try {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const start = observe(w.client.command("session.create", { projectId: "person/project-spex" }));
    const ordinary = observe(w.client.command("config.get", {}));
    await w.flush();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(ordinary.state).toBe("timeout");
    expect(start.state).toBe("pending");
    const calls = w.requests.filter(r => r.type === "session.create");
    expect(calls).toHaveLength(1);
    w.peer.send(JSON.stringify({ type: "reply", id: calls[0]!.id, ok: true, result: { id: "00000000-0000-4000-8000-000000000001", projectId: "person/project-spex" } }));
    await w.flush();
    expect(start).toEqual({ state: "answered", value: { id: "00000000-0000-4000-8000-000000000001", projectId: "person/project-spex" } });
    expect(w.requests.filter(r => r.type === "session.create")).toHaveLength(1);
  } finally { await w.close(); }
});

test("an explicit observation bound still works and an owned creation rejects on disconnect without resending", async () => {
  const w = await wire();
  try {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = observe(w.client.command("session.create", { projectId: "person/project-spex" }, { timeoutMs: 120_000 }));
    await w.flush();
    await vi.advanceTimersByTimeAsync(119_000);
    expect(first.state).toBe("pending");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(first.state).toBe("timeout");
    const second = observe(w.client.command("session.create", { projectId: "person/project-spex" }));
    await w.flush();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(second.state).toBe("pending");
    expect(w.requests.filter(r => r.type === "session.create")).toHaveLength(2);
    w.peer.close();
    await w.flush();
    expect(second.state).toBe("closed");
    expect(w.requests.filter(r => r.type === "session.create")).toHaveLength(2);
  } finally { await w.close(); }
});
