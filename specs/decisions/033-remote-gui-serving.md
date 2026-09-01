<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-033: Remote GUI Serving

## Status

Accepted; amends [DR-024](024-app-supplied-agent-runtimes.md) (the SDK-supply duty extends to the server shell) and the endpoint items of [core-service](../packages/core-service.md).
Amended by [DR-036](036-file-state-store.md): the each-shell-one-store rule gives way to one shared state root with a single core admitted at a time.

## Context

- [DR-002](002-desktop-app-architecture.md) built the seam this decision cashes in: the core is a headless service behind one WebSocket protocol, the UI is a static bundle that knows nothing but that protocol, and "the cloud port is the same core behind a server socket and the same UI served as static assets; only the shell layer is replaced".
  Multi-tenant auth was left out of scope there and stays out of scope here.
- The product owner wants to run Spex on a machine they own (for example a rented server) and browse its GUI from elsewhere over a public address, with simple but safe auth — a single-user deployment, not a hosted service.
- The core already gates its WebSocket behind a per-launch token and an Origin check [[core-service-24](../packages/core-service.md#core-service-24)], but binds loopback only, admits only local page origins, and serves no HTML; the UI resolves its core URL only from a `?core=` query, a build-time variable, or a localhost fallback, and its CSP names only localhost connect targets.
- Everything a session does — spawning agents, reading projects, editing config — is core behavior on the serving machine; the browser is a pure protocol client, so remote access changes trust at exactly one place: who can reach the WebSocket.

## Decision

### A third shell

- `apps/server` is a headless Node CLI — the **server shell** — that serves the built UI bundle and the core's WebSocket endpoint from one TCP port, so one origin and one printed URL carry the whole app.
- The core accepts a shell-supplied HTTP server to attach its WebSocket endpoint to, in place of the loopback socket it binds itself by default; binding, TLS, and static serving belong to the shell.
  This amends the loopback-only endpoint of [[core-service-1](../packages/core-service.md#core-service-1)].
- The desktop app is untouched; the server shell replaces only the shell layer, per [DR-002](002-desktop-app-architecture.md).

### Auth: one token, in the URL

- Auth is the core's existing handshake token, surfaced Jupyter-style [[1]]: the shell prints one access URL with `?token=<secret>`, and holding that URL is being the user.
- The served page adopts the token on load: it connects to its own origin (`ws:` under `http:`, `wss:` under `https:`), keeps the token for the page session, and scrubs it from the address bar.
- The origin admission of [[core-service-24](../packages/core-service.md#core-service-24)] extends to the origin the handshake itself addressed, so the served page passes while foreign web origins stay rejected; the token is required in every case.
- Static assets are served without auth: the bundle is public code, and all data flows over the token-gated WebSocket.

### Transport security

- TLS is built in and optional: `--tls-cert`/`--tls-key` serve HTTPS and `wss:` on the same port.
- A non-loopback bind without TLS is refused unless `--insecure` is passed, so a plaintext token on a public interface is an explicit choice, never a default.
- The default bind stays loopback: the zero-configuration remote path is an SSH tunnel, which needs no certificate and no opened port.

### What the shell owns

- The server shell declares the `claude`, `codex`, and `opencode` SDKs as its own dependencies, extending the app-supply duty of [DR-024](024-app-supplied-agent-runtimes.md) to this shell.
- It owns its app-local store default under the XDG data directory, separate from the desktop's Electron store — each shell one instance, one store, per [DR-004](004-config-and-persistence.md).
- To reduce remote transfer size without another dependency or option, it uses Node's built-in compression to negotiate Brotli, then gzip, for text-based bundle responses while leaving already-compressed formats unchanged.
- It serves `index.html` with the CSP `connect-src` retargeted to the serving origin; after removal of any negotiated HTTP content coding, the bundle otherwise matches the build, keeping the desktop's `file://` copy byte-identical.
- Launched from a terminal it inherits the shell environment, so the desktop's login-shell capture has no server counterpart; daemon supervisors supply environment their own way.
- OS notifications and badges have no remote surface; the Dashboard attention queue ([DR-029](029-session-history-home.md)) is the attention surface.

## Consequences

- The remote experience is one command and one URL; token rotation is a restart, revocation is stopping the process.
- Anyone holding the URL is the user: confidentiality of the token rests entirely on TLS or the tunnel, which is why the plaintext public bind is refuse-by-default.
- The core's endpoint contract gains a second mode and its origin table gains one row; every other core and UI behavior is reused unchanged, and multiple browser tabs already work because the core broadcasts to all clients.
- Packaging and distributing the server shell (beyond running from the repo) is deferred, as is any multi-user story.

## References

[1]: https://jupyter-server.readthedocs.io/en/latest/operators/security.html "Jupyter Server security model"
