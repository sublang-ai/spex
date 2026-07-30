<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# app-shell: Desktop Shell

## Intent

This spec covers the Spex desktop shell (`apps/desktop`) — the single-window Electron app with OS notifications, dock badge, native dialogs, and app lifecycle — its implementation requirements (process topology over the core's WebSocket protocol, login-shell environment capture, packaging that keeps spawned agent binaries executable), and its packaged-app verification coverage.

## External Behavior

### Launch

#### app-shell-1

When the user launches Spex, the app shall open a single main window whose UI is connected to the in-app core service, without requiring the user to start any separate server or open a browser.

#### app-shell-2

While a Spex instance is running, when the user launches Spex again, the app shall focus the running instance's main window and exit the second launch without opening another window or starting a second core service.

### Notifications and Attention

#### app-shell-3

Where the shared config file's notification preferences enable an event kind, when a project session emits an event of that kind — a finished turn (`turn_finished`), a question awaiting the Boss's reply (`awaitBossReply`), or a failure — the app shall post a native desktop notification naming the project and the event.

- Where the preferences disable an event kind, the app posts no notification for events of that kind.

#### app-shell-4

While the attention count published by the Dashboard [[dashboard-9](dashboard.md#dashboard-9)] is non-zero, the app shall display that count as the dock or taskbar badge.

- When the attention count becomes zero, the app removes the badge.

#### app-shell-5

When the user clicks a desktop notification posted by the app, the app shall focus the main window and bring the project session that produced the notified event into view.

### Native Dialogs

#### app-shell-6

When a UI flow requests a file or directory selection (for example, choosing a project directory or a playbook source), the app shall present the operating system's native file dialog and deliver the selected path to the requesting flow.

- When the user cancels the dialog, the app delivers no path and changes no state.

### Quit

#### app-shell-7

While at least one project session has an active turn, when the user initiates quit, the app shall show a confirmation naming the projects with active turns and shall quit only after explicit confirmation.

- When the user cancels that confirmation, the app keeps running with those sessions unaffected.
- When the app quits, the app disposes every live session's runtime before the process exits, leaving no orphan agent processes.

### Offline Operation

#### app-shell-8

The app shall require network access only for agent turns and forge operations ([DR-006](../decisions/006-projects-and-forge.md)).

- While the machine has no network connectivity, the app launches, opens projects, browses session history, and edits settings, and surfaces agent-turn and forge-operation failures as errors without blocking other functionality.

### About

#### app-shell-9

When the user opens the About dialog, the app shall display the application name Spex and the installed build's version (the `MAJOR.MINOR.PATCH` of its `app-v*` release tag; see [[app-shell-14](#app-shell-14)]).

#### app-shell-21

When the user activates an external link anywhere in the app, the shell shall open it in the system browser and keep the app window on the app — the window shall never navigate to a remote page or open one in a child window.

### App Icon

#### app-shell-23

Where the app is built for distribution, the packaged app shall carry the Spex product logo ([DR-013](../decisions/013-sublang-brand.md)) as its application icon, so the dock, app switcher, and installer show the brand mark.

### Process Topology

#### app-shell-10

The shell shall run the core service in the Electron main process or an Electron utility process, load the built UI in a renderer window, and connect the renderer to the core over the core's WebSocket protocol exactly as a browser client connects.

- The shell carries no application features — commands, state, records, config — over Electron IPC; Electron-specific channels are limited to the shell's own OS integrations (native dialogs, notifications, badge, quit handling), so the UI bundle runs unmodified in a browser against the same core.

## Internal Behavior

### Renderer Isolation

#### app-shell-11

The shell shall create renderer windows with the Chromium sandbox enabled, Node integration disabled, and context isolation enabled [[1]].

- The renderer has no direct Node or Electron API access; its data and effects flow only through the WebSocket protocol and the shell's OS-integration channels.

### Environment Capture

#### app-shell-12

When the app starts, the shell shall capture the user's login-shell environment once and pass it to the core before the core runs any adapter readiness check or spawns any agent process, so credentials exported in shell profiles are visible to the GUI-launched app.

- The shell persists no captured environment values and does not refresh the snapshot while running, so shell-profile changes take effect on the next launch.

### Packaging

#### app-shell-13

Where the app is packaged, the packaged app shall ship agent-SDK native binaries — and any executable the runtime spawns as a child process — outside the asar archive as asar-unpacked files [[2]], so that spawning them from the installed app succeeds without a repo checkout or external `node_modules`.

### Release

#### app-shell-14

When a tag matching `app-v*` is pushed, the desktop release workflow shall build the macOS arm64 app with electron-builder [[3]] and attach the unsigned build artifacts to a GitHub release for that tag.

- The desktop release workflow does not publish to npm and does not run for `v*` tags, keeping the app and CLI release channels disjoint ([DR-002](../decisions/002-desktop-app-architecture.md)).

### App Data

#### app-shell-15

The shell shall place all app-local state, including the SQLite store, under the platform app-data directory (Electron `userData` [[4]]).

- The shell writes no app-only state to the shared config file or into project working trees ([DR-004](../decisions/004-config-and-persistence.md)).

### Native Bridge

#### app-shell-20

The desktop package shall expose the native bridge of [DR-008](../decisions/008-native-shell-bridge.md) as a `contextBridge` API from a sandboxed preload, limited to OS affordances impossible from a sandboxed web page (v1: directory picking over one invoke channel), carrying no application feature, and absent by design in non-Electron deployments so the UI's feature detection selects the manual fallback.

#### app-shell-22

The renderer shall enforce a content security policy that denies remote script, connection, and image loading (data: images excepted), and transcript markdown shall not fetch remote images, so untrusted agent output cannot beacon out of the app.

#### app-shell-24

Where the live-smoke handshake variable names a file ([DR-020](../decisions/020-desktop-live-smoke.md)), when the desktop app starts, the desktop package shall redirect its user-data directory to the smoke-provided location before opening any store, start the core as usual, and write the core's socket address to the named file only after the core is listening; where the acceptance variable is also set, the app shall refuse to launch naming the conflict, and where neither variable is set the behavior shall be unchanged.

## Verification

### Packaged App Coverage

#### app-shell-16

Where a packaged macOS arm64 build is installed with a profile backed by a fake adapter that spawns a child process, when the test suite launches the packaged app, the test suite shall assert that a single main window opens with the UI connected to the in-app core [[app-shell-1](#app-shell-1)] over WebSocket [[app-shell-10](#app-shell-10)], and that a Boss turn through the fake adapter's spawned child completes [[app-shell-13](#app-shell-13)] with its records rendered in the session's run view, so packaged spawning and the protocol seam are proven together.

#### app-shell-17

While a packaged app instance is running, when the test suite launches a second instance, the test suite shall assert that the second launch exits without opening a window, that the first instance's main window gains focus [[app-shell-2](#app-shell-2)], and that exactly one core WebSocket endpoint remains listening.

### Notification Coverage

#### app-shell-18

Where a fixture playbook that raises an `awaitBossReply` question is enabled and the shared config enables that notification kind, when the test suite runs a session until the question is raised, the test suite shall assert that a native desktop notification is posted identifying the project session [[app-shell-3](#app-shell-3)].

- Where the shared config disables that notification kind, the test suite asserts that the same fixture run posts no notification [[app-shell-3](#app-shell-3)].

### Environment Coverage

#### app-shell-19

Where an environment variable consulted by an adapter readiness check (for example, `ANTHROPIC_API_KEY`) is exported only in the user's login-shell profile and absent from the app's launch environment, when the test suite starts the app and queries adapter readiness, the test suite shall assert that the check reports the adapter ready, proving the captured login-shell environment reached the core before readiness checks ran [[app-shell-12](#app-shell-12)].

## References

[1]: https://www.electronjs.org/docs/latest/tutorial/security "Electron security tutorial"
[2]: https://www.electronjs.org/docs/latest/tutorial/asar-archives "Electron ASAR archives"
[3]: https://www.electron.build/ "electron-builder documentation"
[4]: https://www.electronjs.org/docs/latest/api/app "Electron app API"
