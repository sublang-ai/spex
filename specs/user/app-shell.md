<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SHELL: User-Facing Desktop Shell Behavior

## Intent

This spec defines user-visible behavior of the Spex desktop shell: the Electron window, OS notifications, the dock/taskbar badge, native dialogs, and app lifecycle, per [DR-002](../decisions/002-desktop-app-architecture.md).
The notified event kinds (`turn_finished`, `awaitBossReply` questions, failures) and the attention count originate in the embedded runtime's record stream ([DR-003](../decisions/003-runtime-reuse.md)).
Per-event notification preferences live in the shared config file ([DR-004](../decisions/004-config-and-persistence.md)).

## Launch

### SHELL-1

When the user launches Spex, the app shall open a single main window whose UI is connected to the in-app core service, without requiring the user to start any separate server or open a browser.

### SHELL-2

While a Spex instance is running, when the user launches Spex again, the app shall focus the running instance's main window and exit the second launch without opening another window or starting a second core service.

## Notifications and Attention

### SHELL-3

Where the shared config file's notification preferences enable an event kind, when a project session emits an event of that kind — a finished turn (`turn_finished`), a question awaiting the Boss's reply (`awaitBossReply`), or a failure — the app shall post a native desktop notification naming the project and the event.
Where the preferences disable an event kind, the app shall post no notification for events of that kind.

### SHELL-4

While the attention count published by the Dashboard ([DASH-9](dashboard.md#dash-9)) is non-zero, the app shall display that count as the dock or taskbar badge.
When the attention count becomes zero, the app shall remove the badge.

### SHELL-5

When the user clicks a desktop notification posted by the app, the app shall focus the main window and bring the project session that produced the notified event into view.

## Native Dialogs

### SHELL-6

When a UI flow requests a file or directory selection (for example, choosing a project directory or a playbook source), the app shall present the operating system's native file dialog and deliver the selected path to the requesting flow.
When the user cancels the dialog, the app shall deliver no path and change no state.

## Quit

### SHELL-7

While at least one project session has an active turn, when the user initiates quit, the app shall show a confirmation naming the projects with active turns and shall quit only after explicit confirmation.
When the user cancels that confirmation, the app shall keep running with those sessions unaffected.
When the app quits, the app shall dispose every live session's runtime before the process exits, leaving no orphan agent processes.

## Offline Operation

### SHELL-8

The app shall require network access only for agent turns and forge operations ([DR-006](../decisions/006-projects-and-forge.md)).
While the machine has no network connectivity, the app shall launch, open projects, browse session history, and edit settings, and shall surface agent-turn and forge-operation failures as errors without blocking other functionality.

## About

### SHELL-9

When the user opens the About dialog, the app shall display the application name Spex and the installed build's version (the `MAJOR.MINOR.PATCH` of its `app-v*` release tag; see [SHELL-14](../dev/app-shell.md#shell-14)).
