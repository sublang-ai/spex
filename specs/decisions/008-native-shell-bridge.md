<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-008: Native Shell Bridge for Local Pickers

## Status

Accepted

## Context

- [SHELL-5](../user/app-shell.md#shell-5) mandates native file/directory pickers, but the SHELL dev items keep every app feature on the WebSocket protocol with no Electron IPC — and a sandboxed web page cannot open a native directory dialog or learn an absolute path from a browser picker.
- v1 shipped manual path entry as the only way to add a project, which the product owner rejected as a critical UX gap.

## Decision

- The desktop shell exposes a minimal, feature-detected bridge at `window.spexNative` via `contextBridge` from a sandboxed preload.
- Scope discipline: the bridge carries **only OS affordances that are impossible from a sandboxed web page**, never app features; v1 has exactly one capability:

| Capability | Contract |
| --- | --- |
| `pickDirectory()` | Opens the native directory dialog; resolves to the absolute path or `null` when cancelled |

- Every app feature (registration, sessions, config, forge) stays on the WebSocket protocol; the bridge result feeds back into ordinary protocol commands.
- The UI feature-detects the bridge; without it (browser dev, future cloud deployment) it falls back to manual path entry, so the web build keeps working unchanged.

## Consequences

- The renderer stays sandboxed with context isolation; the preload adds one `ipcRenderer.invoke` channel (`spex:pick-directory`) handled by `dialog.showOpenDialog` in the main process.
- The "no Electron coupling of app features" rule of the SHELL package is preserved in spirit and amended in letter; [SHELL-20](../dev/app-shell.md#shell-20) records the constraint.
- Future OS affordances (e.g. drag-and-drop of folders, file reveal) must clear the same bar: impossible from the web platform, feature-detected, no app logic.
