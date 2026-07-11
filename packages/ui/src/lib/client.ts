// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Protocol client: one WebSocket to the core, promise-based commands,
// and a message fan-out. Renders nothing; owns no view state.

import {
  PROTOCOL_VERSION,
  type Channel,
  type Command,
  type CommandResults,
  type ServerMessage,
} from "@sublang/spex-core/protocol";

export type ConnectionStatus = "connecting" | "open" | "closed" | "mismatch";

export interface SpexClientOptions {
  url: string;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** Reconnect backoff in ms; 0 disables reconnect (tests). */
  reconnectMs?: number;
  webSocketFactory?: (url: string) => WebSocket;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class SpexCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpexCommandError";
  }
}

export class SpexClient {
  private readonly options: SpexClientOptions;
  private socket?: WebSocket;
  private nextId = 0;
  private readonly pending = new Map<string, Pending>();
  private closedByUser = false;
  private mismatched = false;

  constructor(options: SpexClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.closedByUser = false;
    this.options.onStatus("connecting");
    const factory =
      this.options.webSocketFactory ?? ((url: string) => new WebSocket(url));
    const socket = factory(this.options.url);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "hello") {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          // A version skew never heals by retrying; halt reconnection
          // so the UI can show an actionable mismatch state.
          this.closedByUser = true;
          this.mismatched = true;
          this.options.onStatus("mismatch");
          socket.close();
          return;
        }
        this.options.onStatus("open");
      }
      if (message.type === "reply") {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.ok) pending.resolve(message.result);
          else
            pending.reject(
              new SpexCommandError(message.error.code, message.error.message),
            );
        }
      }
      this.options.onMessage(message);
    });
    socket.addEventListener("close", () => {
      for (const [, pending] of this.pending) {
        pending.reject(new SpexCommandError("closed", "connection closed"));
      }
      this.pending.clear();
      if (!this.mismatched) this.options.onStatus("closed");
      const backoff = this.options.reconnectMs ?? 1000;
      if (!this.closedByUser && backoff > 0) {
        setTimeout(() => this.connect(), backoff);
      }
    });
    socket.addEventListener("error", () => {
      // close follows; status handled there.
    });
  }

  close(): void {
    this.closedByUser = true;
    this.socket?.close();
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new SpexCommandError("closed", "not connected");
    }
    const id = `ui-${(this.nextId += 1)}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // A lost reply must surface as an error, not an eternal spinner.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new SpexCommandError("timeout", `${type} timed out`));
        }
      }, 30_000);
    });
    socket.send(JSON.stringify({ type, id, ...fields }));
    return promise as Promise<CommandResults[T]>;
  }

  subscribe(channel: Channel): Promise<null> {
    return this.command("subscribe", { channel });
  }

  unsubscribe(channel: Channel): Promise<null> {
    return this.command("unsubscribe", { channel });
  }
}

export function defaultCoreUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("core");
  if (fromQuery) return fromQuery;
  const fromEnv = import.meta.env?.VITE_SPEX_CORE_URL as string | undefined;
  return fromEnv ?? "ws://127.0.0.1:8137/?token=dev";
}
