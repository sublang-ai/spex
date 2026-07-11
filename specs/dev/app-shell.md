<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SHELL: Desktop Shell Implementation Requirements

## Intent

This spec defines implementation requirements for the Electron shell (`apps/desktop`): process topology over the core's WebSocket protocol ([DR-002](../decisions/002-desktop-app-architecture.md)), login-shell environment capture and app-data placement ([DR-004](../decisions/004-config-and-persistence.md)), and packaging and release of builds that keep the agent binaries spawned by the embedded runtime ([DR-003](../decisions/003-runtime-reuse.md)) executable.

## Process Topology

### SHELL-10

The shell shall run the core service in the Electron main process or an Electron utility process, load the built UI in a renderer window, and connect the renderer to the core over the core's WebSocket protocol exactly as a browser client connects.
The shell shall not carry application features — commands, state, records, config — over Electron IPC; Electron-specific channels shall be limited to the shell's own OS integrations (native dialogs, notifications, badge, quit handling), so the UI bundle runs unmodified in a browser against the same core.

### SHELL-11

The shell shall create renderer windows with the Chromium sandbox enabled, Node integration disabled, and context isolation enabled [[1]].
The renderer shall have no direct Node or Electron API access; its data and effects shall flow only through the WebSocket protocol and the shell's OS-integration channels.

## Environment Capture

### SHELL-12

When the app starts, the shell shall capture the user's login-shell environment once and pass it to the core before the core runs any adapter readiness check or spawns any agent process, so credentials exported in shell profiles are visible to the GUI-launched app.
The shell shall not persist captured environment values and shall not refresh the snapshot while running, so shell-profile changes take effect on the next launch.

## Packaging

### SHELL-13

Where the app is packaged, the packaged app shall ship agent-SDK native binaries — and any executable the runtime spawns as a child process — outside the asar archive as asar-unpacked files [[2]], so that spawning them from the installed app succeeds without a repo checkout or external `node_modules`.

## Release

### SHELL-14

When a tag matching `app-v*` is pushed, the desktop release workflow shall build the macOS arm64 app with electron-builder [[3]] and attach the unsigned build artifacts to a GitHub release for that tag.
The desktop release workflow shall not publish to npm and shall not run for `v*` tags, keeping the app and CLI release channels disjoint ([DR-002](../decisions/002-desktop-app-architecture.md)).

## App Data

### SHELL-15

The shell shall place all app-local state, including the SQLite store, under the platform app-data directory (Electron `userData` [[4]]).
The shell shall write no app-only state to the shared config file or into project working trees ([DR-004](../decisions/004-config-and-persistence.md)).

## References

[1]: https://www.electronjs.org/docs/latest/tutorial/security "Electron security tutorial"
[2]: https://www.electronjs.org/docs/latest/tutorial/asar-archives "Electron ASAR archives"
[3]: https://www.electron.build/ "electron-builder documentation"
[4]: https://www.electronjs.org/docs/latest/api/app "Electron app API"

## Native Bridge

### SHELL-20

The desktop package shall expose the native bridge of
[DR-008](../decisions/008-native-shell-bridge.md) as a
`contextBridge` API from a sandboxed preload, limited to OS
affordances impossible from a sandboxed web page (v1: directory
picking over one invoke channel), carrying no application feature,
and absent by design in non-Electron deployments so the UI's
feature detection selects the manual fallback.
