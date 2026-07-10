<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SHELL: Desktop Shell Acceptance Tests

## Intent

This spec defines required integration coverage for the desktop shell, exercising the packaged Electron app end to end per [DR-002](../decisions/002-desktop-app-architecture.md).
Fake adapters and fixture playbooks stand in for real agents ([DR-003](../decisions/003-runtime-reuse.md)); notification preferences and adapter readiness follow the shared config and environment-capture rules ([DR-004](../decisions/004-config-and-persistence.md)).

## Packaged App Coverage

### SHELL-16
Verifies: [SHELL-1](../user/app-shell.md#shell-1), [SHELL-10](../dev/app-shell.md#shell-10), [SHELL-13](../dev/app-shell.md#shell-13)

Where a packaged macOS arm64 build is installed with a profile backed by a fake adapter that spawns a child process, when the test suite launches the packaged app, the test suite shall assert that a single main window opens with the UI connected to the in-app core over WebSocket, and that a Boss turn through the fake adapter completes with its records rendered in the session's run view, so packaged spawning and the protocol seam are proven together.

### SHELL-17
Verifies: [SHELL-2](../user/app-shell.md#shell-2)

While a packaged app instance is running, when the test suite launches a second instance, the test suite shall assert that the second launch exits without opening a window, that the first instance's main window gains focus, and that exactly one core WebSocket endpoint remains listening.

## Notification Coverage

### SHELL-18
Verifies: [SHELL-3](../user/app-shell.md#shell-3)

Where a fixture playbook that raises an `awaitBossReply` question is enabled and the shared config enables that notification kind, when the test suite runs a session until the question is raised, the test suite shall assert that a native desktop notification is posted identifying the project session.
Where the shared config disables that notification kind, the test suite shall assert that the same fixture run posts no notification.

## Environment Coverage

### SHELL-19
Verifies: [SHELL-12](../dev/app-shell.md#shell-12)

Where an environment variable consulted by an adapter readiness check (for example, `ANTHROPIC_API_KEY`) is exported only in the user's login-shell profile and absent from the app's launch environment, when the test suite starts the app and queries adapter readiness, the test suite shall assert that the check reports the adapter ready, proving the captured login-shell environment reached the core before readiness checks ran.
