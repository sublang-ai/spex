// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A seat as the hub reaches it (hub-3, hub-5): its socket and handshake
// token under the seat's runtime directory, which the helper makes
// (server-shell-25), a connection presenting that token, and the one
// thing the hub reads from a seat itself — whether a turn runs, from
// the session list any client reads (core-service-32).

import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

import WebSocket from "ws";

export const DEFAULT_RUN_DIR = "/run/spex/seats";

export function seatSocket(runDir: string, id: string): string {
  return join(runDir, id, "core.sock");
}

export function seatTokenFile(runDir: string, id: string): string {
  return join(runDir, id, "token");
}

/** The seat's handshake token, or undefined while there is none. */
export function readSeatToken(runDir: string, id: string): string | undefined {
  try {
    const token = readFileSync(seatTokenFile(runDir, id), "utf8").trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

/** Whether the seat's socket accepts a connection: its unit runs. */
export function probeSeat(runDir: string, id: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = connect(seatSocket(runDir, id));
    const done = (up: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolveProbe(up);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** Wait until the seat's socket accepts a connection, up to the bound. */
export async function waitForSeat(runDir: string, id: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probeSeat(runDir, id)) return true;
    const left = deadline - Date.now();
    if (left <= 0) return false;
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(200, left)));
  }
}

/** Open a connection to the seat presenting its handshake token; no
 * Origin is sent, as from any non-browser client. */
export function connectSeat(runDir: string, id: string, token: string): WebSocket {
  return new WebSocket(
    `ws+unix:${seatSocket(runDir, id)}:/?token=${encodeURIComponent(token)}`,
    { perMessageDeflate: false },
  );
}

/** Whether the seat reports a turn active in any session, over the
 * hub's own connection to it; a seat that cannot be read reports none. */
export function readTurnActive(runDir: string, id: string, timeoutMs = 10_000): Promise<boolean> {
  const token = readSeatToken(runDir, id);
  if (!token) return Promise.resolve(false);
  return new Promise((resolveRead) => {
    const requestId = "spex-hub-turns";
    const socket = connectSeat(runDir, id, token);
    let settled = false;
    const done = (active: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners("message");
      socket.on("error", () => {});
      if (socket.readyState === WebSocket.OPEN) socket.close(1000);
      else socket.terminate();
      resolveRead(active);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.on("error", () => done(false));
    socket.on("close", () => done(false));
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "session.list", id: requestId }));
    });
    socket.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (
        typeof message !== "object" ||
        message === null ||
        (message as { type?: unknown }).type !== "reply" ||
        (message as { id?: unknown }).id !== requestId
      ) {
        return;
      }
      const reply = message as { ok?: unknown; result?: unknown };
      done(
        reply.ok === true &&
          Array.isArray(reply.result) &&
          reply.result.some(
            (session) =>
              typeof session === "object" &&
              session !== null &&
              (session as { turnActive?: unknown }).turnActive === true,
          ),
      );
    });
  });
}
