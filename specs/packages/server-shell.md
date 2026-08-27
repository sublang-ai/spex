<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# server-shell: Server Shell

## Intent

This spec covers the Spex server shell — the headless CLI in `apps/server` that serves the Spex GUI to a remote browser: one TCP port carrying both the built UI bundle and the core service's WebSocket endpoint, guarded by the core's handshake token, with optional TLS ([DR-033](../decisions/033-remote-gui-serving.md)).
It is a single-user deployment of the same core and UI the desktop app embeds ([DR-002](../decisions/002-desktop-app-architecture.md)), not a hosted multi-tenant service.

## External Behavior

### Startup

#### server-shell-1

When the server shell starts, it shall boot one core service attached to the shell's own HTTP server — so the shell's port carries both the UI pages and the core's WebSocket endpoint [[core-service-1](core-service.md#core-service-1)] — and print one access URL naming the scheme, bound host, port, and handshake token [[core-service-24](core-service.md#core-service-24)]:

| Option | Default |
| --- | --- |
| `--host` | `127.0.0.1` |
| `--port` | `8137` |
| `--token` | the `SPEX_TOKEN` environment variable, else a random value per launch |
| `--config` | unset: the core resolves its own shared config path |
| `--db` | `${XDG_DATA_HOME:-~/.local/share}/spex/server.db`, created as needed |
| `--tls-cert`, `--tls-key` | unset: plain HTTP |

- A loopback bind is reached remotely over an SSH tunnel; the startup printout names that command.
- An empty token is refused at startup, naming the mistake: a blank secret would disable the handshake.
- An IPv6 bind host appears bracketed in the URL.

#### server-shell-2

Where the requested bind host is not a loopback address and no TLS material is configured, when the server shell starts, it shall refuse to start with an error naming both remedies — `--tls-cert`/`--tls-key`, or `--insecure` to accept a plaintext public bind:

- With `--insecure`, the shell binds plain HTTP anyway; the token then travels unencrypted.
- A loopback bind needs neither TLS nor the override.

#### server-shell-3

Where TLS certificate and key files are both configured, the server shell shall serve HTTPS on its port and accept `wss:` WebSocket handshakes on the same port:

- Exactly one of the pair configured is refused at startup, naming the missing half.

### Serving

#### server-shell-4

When an HTTP request arrives, the server shell shall serve only the staged UI bundle, read-only:

- `/` serves the bundle's `index.html`; another path serves the named bundle file with a content type derived from its extension;
- a path resolving outside the bundle directory, a missing file, and a method other than GET or HEAD each yield an error status and serve nothing;
- `index.html` is served with its `connect-src` policy retargeted to the serving origin, so the page may open WebSockets to this origin and to no other host; every other byte of the bundle is served as built.

#### server-shell-5

When the served page resolves its core endpoint, the UI shall connect to the page's own origin — `ws:` under `http:`, `wss:` under `https:` — presenting the handshake token [[core-service-24](core-service.md#core-service-24)]:

| Case | Outcome |
| --- | --- |
| `?token=` in the page URL | the token is adopted for the page session, removed from the address bar, and presented on the connection |
| no URL token, a page-session copy held | the held token is presented, so a reload reconnects without re-showing the secret |
| an explicit `?core=` URL | it wins unchanged, preserving the desktop and dev flows |
| neither token nor `?core=` | resolution falls back to the build-time or localhost default unchanged |

- The address bar is scrubbed only once the page session verifiably holds the copy; a storage-blocked browser keeps the URL token so a reload still connects.
- The rows compose: a URL carrying both `?core=` and `?token=` connects per the `?core=` row while the token is still adopted and scrubbed.

### Shutdown

#### server-shell-6

When the server shell receives SIGINT or SIGTERM, it shall stop the core service — disposing every live session runtime [[core-service-39](core-service.md#core-service-39)] — and exit only after the stop completes, leaving no orphan agent process.

## Internal Behavior

### Package Layout

#### server-shell-7

The `apps/server` workspace package shall declare the `claude`, `codex`, and `opencode` agent SDKs as its own dependencies at the unconstrained range — extending the app-supply duty of [DR-024](../decisions/024-app-supplied-agent-runtimes.md) to this shell — so SDK-backed adapters resolve when its embedded core loads them.

#### server-shell-8

The server shell build shall stage the built UI bundle into the shell package, so serving depends on no sibling workspace at run time.

## Verification

### Serving Coverage

#### server-shell-9

Where the server shell runs on a loopback port with a temporary config and store, the test suite shall assert over real HTTP and WebSocket connections that:

- `GET /` serves the UI page with its `connect-src` policy naming the serving origin, an asset path serves with its content type, and a path escaping the bundle yields an error status [[server-shell-4](#server-shell-4)];
- a WebSocket handshake presenting the access URL's token from the page's own origin reaches the core's hello, on the same port that served the page [[server-shell-1](#server-shell-1)].

#### server-shell-10

Where the server shell runs with fixture TLS material, the test suite shall assert that an HTTPS page fetch and a token-bearing `wss:` handshake succeed on the one port [[server-shell-3](#server-shell-3)] and that the access URL's scheme is `https` [[server-shell-1](#server-shell-1)].

### Startup Refusal Coverage

#### server-shell-11

Where a startup precondition is violated, the test suite shall assert each refusal: a plaintext public bind refused naming both remedies with `--insecure` lifting it [[server-shell-2](#server-shell-2)], a lone half of the TLS pair refused naming the missing half [[server-shell-3](#server-shell-3)], and an empty token refused [[server-shell-1](#server-shell-1)].

### Shutdown Coverage

#### server-shell-12

Where the server shell runs as a real child process, the test suite shall assert that the access URL it prints matches its bound endpoint [[server-shell-1](#server-shell-1)] and that on SIGTERM the process exits cleanly with its port closed [[server-shell-6](#server-shell-6)].

### Page Connection Coverage

#### server-shell-13

Where a browser-document environment stands at a served page URL, the test suite shall drive the UI's endpoint resolution through the page-connection cases and assert each outcome of [[server-shell-5](#server-shell-5)]: the same-origin `ws:`/`wss:` endpoint carrying the token, the address bar scrubbed with the page-session copy surviving a reload, the URL token kept unscrubbed where storage is blocked, `?core=` precedence with the token still adopted, and the unchanged fallback.
