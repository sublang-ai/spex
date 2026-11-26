<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-008: Native Shell Bridge for Local Pickers

## Status

Accepted.
Amended by [DR-057](057-space-surface.md), [DR-127](127-a-home-signed-in-to-several-instances.md), [DR-188](188-registry-sign-in-opens-the-browser.md).

## Context

- [[app-shell-6](../packages/app-shell.md#app-shell-6)] mandates native file/directory pickers, but the app-shell dev items keep every app feature on the WebSocket protocol with no Electron IPC — and a sandboxed web page cannot open a native directory dialog or learn an absolute path from a browser picker.
- v1 shipped manual path entry as the only way to add a project, which the product owner rejected as a critical UX gap.

## Decision

- The desktop shell exposes a minimal, feature-detected bridge at `window.spexNative` via `contextBridge` from a sandboxed preload.
- Scope discipline: the bridge carries **only OS affordances that are impossible from a sandboxed web page**, never app features; it has exactly three capabilities, path reveal added by [DR-057](057-space-surface.md) and sign-in opening by [DR-127](127-a-home-signed-in-to-several-instances.md) and [DR-188](188-registry-sign-in-opens-the-browser.md):

| Capability | Contract |
| --- | --- |
| `pickDirectory()` | Opens the native directory dialog; resolves to the absolute path or `null` when cancelled |
| `revealPath(path)` | Reveals a state-root path in the OS file manager; resolves `true`, or `false` outside the root |
| `openExternal(url)` | Opens a sign-in URL in the system browser only at an origin a listed Space or a running sign-in permits; resolves `false` for a refused URL |

- Every app feature (registration, sessions, config, forge) stays on the WebSocket protocol; the bridge result feeds back into ordinary protocol commands.
- The UI feature-detects the bridge; without it (browser dev, future cloud deployment) it falls back to manual path entry, so the web build keeps working unchanged.

## Consequences

- The renderer stays sandboxed with context isolation; the preload adds one `ipcRenderer.invoke` channel per capability, handled in the main process (`spex:pick-directory` by `dialog.showOpenDialog`).
- The "no Electron coupling of app features" rule of the app-shell package is preserved in spirit and amended in letter; [[app-shell-20](../packages/app-shell.md#app-shell-20)] records the constraint.
- Future OS affordances (e.g. drag-and-drop of folders) must clear the same bar: impossible from the web platform, feature-detected, no app logic.
