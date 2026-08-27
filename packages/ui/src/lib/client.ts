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
    options?: { timeoutMs?: number },
  ): Promise<CommandResults[T]> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new SpexCommandError("closed", "not connected");
    }
    const id = `ui-${(this.nextId += 1)}`;
    // Timeouts are sized per command class (DR-010 §5): a lost reply
    // must surface as an error, but a long-running command (compile)
    // must never falsely fail — 0 disables the timer, and the close
    // handler still rejects every pending call if the socket drops.
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new SpexCommandError("timeout", `${type} timed out`));
          }
        }, timeoutMs);
      }
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

const TOKEN_STORAGE_KEY = "spex.core.token";

// Adopt a served page's access token (DR-033): keep it for the page
// session so a reload reconnects, and scrub it from the address bar
// so the secret is not left on display or in shared links.
function adoptServedToken(params: URLSearchParams): string | null {
  const storage = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return undefined; // storage can be blocked; the URL copy still works
    }
  })();
  const fromUrl = params.get("token");
  if (fromUrl) {
    try {
      storage?.setItem(TOKEN_STORAGE_KEY, fromUrl);
    } catch {
      // Not stored: a reload needs the URL again, but this load works.
    }
    params.delete("token");
    const query = params.toString();
    try {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    } catch {
      // The address bar keeps the token; the connection still works.
    }
    return fromUrl;
  }
  try {
    return storage?.getItem(TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function defaultCoreUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("core");
  if (fromQuery) return fromQuery;
  // A served page (DR-033): the shell that delivered this page also
  // carries the core endpoint, so the page's own origin is the core —
  // ws: under http:, wss: under https:.
  if (/^https?:$/.test(window.location.protocol)) {
    const token = adoptServedToken(params);
    if (token) {
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      return `${scheme}://${window.location.host}/?token=${encodeURIComponent(token)}`;
    }
  }
  const fromEnv = import.meta.env?.VITE_SPEX_CORE_URL as string | undefined;
  return fromEnv ?? "ws://127.0.0.1:8137/?token=dev";
}
