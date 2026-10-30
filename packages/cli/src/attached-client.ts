// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "./generated-protocol.js";

export class CliFailure extends Error {
  constructor(readonly exitCode: number, message: string) { super(message); }
}
type Message = Record<string, any>;
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

const EXPLICIT_GUIDANCE = "Use --server <loopback access-url> or SPEX_SERVER_URL from a running Spex server.";

/** The access URL an invocation connects to: `--server`, else
 * `SPEX_SERVER_URL`, each held to the loopback rule before any socket
 * opens. No running app announces itself (DR-165): with neither, the
 * command is refused naming both. */
export function selectEndpoint(server: string | undefined, env: NodeJS.ProcessEnv): { url: string; token: string } {
  if (server !== undefined) return accessEndpoint(server);
  const named = env.SPEX_SERVER_URL;
  if (named !== undefined && named !== "") return accessEndpoint(named);
  throw new CliFailure(1, `No server is named. ${EXPLICIT_GUIDANCE}`);
}

/** Validate before opening a socket; WHATWG normalization must not admit
 * numeric aliases, wildcard addresses or DNS names other than localhost. */
export function accessEndpoint(input: string | undefined): { url: string; token: string } {
  if (!input) throw new CliFailure(1, EXPLICIT_GUIDANCE);
  try {
    const rawHost = /^[a-z]+:\/\/(\[[^\]]+\]|[^/:?#]+)(?::[0-9]+)?(?:[/?#]|$)/i.exec(input)?.[1]?.toLowerCase();
    const url = new URL(input);
    if (!rawHost || !["localhost", "127.0.0.1", "[::1]"].includes(rawHost) ||
        !["http:", "https:", "ws:", "wss:"].includes(url.protocol) || url.username || url.password ||
        input.includes("#") || url.pathname !== "/" || [...url.searchParams.keys()].some((k) => k !== "token") ||
        url.searchParams.getAll("token").length !== 1 || !url.searchParams.get("token")) throw new Error();
    const token = url.searchParams.get("token")!;
    url.protocol = url.protocol === "http:" ? "ws:" : url.protocol === "https:" ? "wss:" : url.protocol;
    return { url: url.href, token };
  } catch { throw new CliFailure(1, `Invalid server access URL. ${EXPLICIT_GUIDANCE}`); }
}

/** One invocation, one connection. Core owns validation and operation state. */
export class AttachedClient {
  private socket?: WebSocket;
  private ready?: Pending;
  private pending = new Map<string, Pending>();
  private completion = new Map<string, Pending>();
  private earlyCompletion = new Map<string, Message>();
  private sent = false;
  private opened = false;
  private stopped = false;
  private failure?: CliFailure;
  private timer?: ReturnType<typeof setTimeout>;
  signInId?: string;

  /** `unreachable` replaces the failure of a connection that never
   * opened. */
  constructor(private readonly endpoint: string, private readonly timeoutMs: number, private readonly unreachable?: string) {}

  async connect(): Promise<void> {
    if (typeof globalThis.WebSocket !== "function") throw new CliFailure(1, "This Node.js runtime needs WebSocket support. Use Node.js 22 or later without disabling WebSocket.");
    this.timer = setTimeout(() => this.fail(this.observationFailure("Observation timed out")), this.timeoutMs);
    await new Promise<void>((resolve, reject) => {
      this.ready = { resolve, reject };
      const lost = (reason: string) => this.fail(!this.opened && this.unreachable ? new CliFailure(1, this.unreachable) : this.observationFailure(reason));
      try { this.socket = new WebSocket(this.endpoint); }
      catch { this.fail(new CliFailure(1, this.unreachable ?? "Could not connect. Check the running server and its access URL.")); return; }
      this.socket.addEventListener("open", () => { this.opened = true; });
      this.socket.addEventListener("message", (event) => this.message(event.data));
      this.socket.addEventListener("error", () => lost("Connection failed; check the running server and its access URL"));
      this.socket.addEventListener("close", () => {
        if (!this.stopped) lost("Connection closed");
      });
    });
  }

  private observationFailure(reason: string): CliFailure {
    return new CliFailure(this.sent ? 2 : 1, this.sent
      ? `${reason}. The result is unknown; the operation may still complete. Inspect its state before retrying; nothing was resent.`
      : `${reason}. No command was sent.`);
  }

  private message(data: unknown): void {
    if (this.stopped) return;
    let message: Message;
    try {
      message = JSON.parse(String(data));
      if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error();
    } catch { this.fail(this.observationFailure("Invalid server message")); return; }
    if (this.ready) {
      // The hello carries the protocol version alone (core-service-1).
      if (message.type !== "hello" || message.protocolVersion !== PROTOCOL_VERSION) {
        this.fail(new CliFailure(1, "Incompatible server. Update the CLI and running Spex server together; no command was sent.")); return;
      }
      const ready = this.ready; this.ready = undefined; ready.resolve(undefined); return;
    }
    if (message.type === "reply" && typeof message.id === "string") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok === true && Object.hasOwn(message, "result")) pending.resolve(message.result);
      else if (message.ok === false && typeof message.error?.code === "string" && typeof message.error?.message === "string")
        pending.reject(new CliFailure(1, `${message.error.code}: ${message.error.message}${message.error.details ? `\n${JSON.stringify(message.error.details)}` : ""}`));
      else pending.reject(this.observationFailure("Invalid terminal reply"));
    } else if (message.type === "space.signin.completed" && typeof message.id === "string" && message.id === this.signInId) {
      const pending = this.completion.get(message.id);
      if (pending) { this.completion.delete(message.id); pending.resolve(message); }
      else this.earlyCompletion.set(message.id, message);
    }
    // Aggregate state is deliberately ignored: it cannot complete a request.
  }

  command(type: string, fields: Message = {}, id = randomUUID()): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.ready)
      return Promise.reject(this.observationFailure("Server is not connected"));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.socket!.send(JSON.stringify({ type, id, ...fields })); this.sent = true; }
      catch { this.fail(this.observationFailure("Could not send command")); }
    });
  }

  async signIn(instance: string, instructions: (result: any) => void): Promise<Message> {
    const id = randomUUID(); this.signInId = id;
    const result = await this.command("space.signin.start", { url: instance, reportCompletion: true }, id);
    instructions(result);
    if (this.failure) throw this.failure;
    const early = this.earlyCompletion.get(id);
    const terminal = early ?? await new Promise<Message>((resolve, reject) => this.completion.set(id, { resolve, reject }));
    this.signInId = undefined;
    if (terminal.instance !== instance) throw this.observationFailure("Sign-in completion named another instance");
    if (terminal.ok === true && typeof terminal.account?.login === "string") return terminal;
    if (terminal.ok === false && typeof terminal.error?.code === "string" && typeof terminal.error?.message === "string")
      throw new CliFailure(1, `${terminal.error.code}: ${terminal.error.message}`);
    throw this.observationFailure("Invalid sign-in completion");
  }

  interrupt(): void {
    const signingIn = this.signInId;
    if (signingIn && this.socket?.readyState === WebSocket.OPEN) {
      // Ordered before close on the same connection; never cancels another start.
      try { this.socket.send(JSON.stringify({ type: "space.signin.cancel", id: randomUUID(), startId: signingIn })); } catch { /* connection already lost */ }
    }
    this.fail(new CliFailure(130, signingIn
      ? "Interrupted. Requested cancellation of this sign-in where connected; no rollback is promised."
      : "Interrupted observation. Work may still complete; inspect its state before retrying. No rollback is promised."));
  }

  private fail(error: CliFailure): void {
    if (this.stopped) return;
    this.failure = error;
    this.ready?.reject(error); this.ready = undefined;
    for (const waiter of [...this.pending.values(), ...this.completion.values()]) waiter.reject(error);
    this.pending.clear(); this.completion.clear();
    this.close();
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }
}
