<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spex

*Run playbooks from your desktop.*

This monorepo hosts **Spex**, the desktop app for compiling,
configuring, running, and monitoring
[playbooks](https://github.com/sublang-ai/playbook) — and the
`@sublang/spex` scaffold CLI for spec-driven development.

## Layout

| Path | What | Distribution |
| --- | --- | --- |
| [`packages/cli`](packages/cli) | `@sublang/spex` — specs scaffold CLI | [npm](https://www.npmjs.com/package/@sublang/spex) |
| `packages/core` | Spex core service (headless host, WebSocket API) | with the app |
| `packages/ui` | Spex web UI (React) | with the app |
| `apps/desktop` | Spex desktop shell (Electron) | GitHub Releases |
| [`specs/`](specs) | Specifications for everything above | — |

The architecture is recorded in
[DR-002](specs/decisions/002-desktop-app-architecture.md); start at
the [spec map](specs/map.md) for the full picture.

## Develop

```sh
npm ci
npm run build
npm test
```

## License

[Apache-2.0](LICENSE)
