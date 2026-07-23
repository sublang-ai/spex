<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DESK: Desktop Session Flow

## Intent

This composition covers the flow that makes Spex a product: a
Boss runs a live playbook session inside the packaged desktop app.
The scenario spans the shell (process topology and packaging), the
core service (session lifecycle and record streaming), and the run
view (rendering and composition) — no single package owns it.

## Scenario

### DESK-1

Where the packaged desktop app is installed with a valid shared
config, when the Boss starts a session for a registered project and
completes a turn, every non-hidden record the embedded runtime emits
shall reach the run view through the same WebSocket protocol a
browser client would use
([SHELL-11](../packages/app-shell.md#shell-11),
[CORE-7](../packages/core-service.md#core-7)), shall render there
in emission order ([RUN-14](../packages/run-view.md#run-14)), and
no record marked hidden shall appear in the view
([CORE-8](../packages/core-service.md#core-8),
[RUN-13](../packages/run-view.md#run-13)).

### DESK-2

Where the shared config enables the awaiting-reply notification
kind, while a session awaits a Boss reply, when the app window is
not focused, the attention shall surface at every layer the Boss
can see: an OS notification and dock badge from the shell, and the
composer's awaiting state in the run view, all derived from the
same record stream.

## Tests

### DESK-3

Where a packaged build is installed with a profile backed by a fake
adapter and the shared config enables the awaiting-reply
notification kind, when the acceptance suite launches the app,
starts a session, and completes a Boss turn, the suite shall assert
the whole chain end to end ([DESK-1](#desk-1)): the core runs inside
the app process
([SHELL-10](../packages/app-shell.md#shell-10)), the session is
created with the project directory as its working directory
([CORE-4](../packages/core-service.md#core-4)), the turn's records
stream over the WebSocket protocol
([CORE-7](../packages/core-service.md#core-7)), and the Captain
pane renders them in arrival order with their glyphs
([RUN-1](../packages/run-view.md#run-1)); and while the session
awaits the Boss's reply with the window unfocused, the OS
notification ([SHELL-3](../packages/app-shell.md#shell-3)), dock
badge ([SHELL-4](../packages/app-shell.md#shell-4)), and composer
awaiting state ([RUN-9](../packages/run-view.md#run-9)) all
surface from the same record stream ([DESK-2](#desk-2)).

### DESK-4

Where a fixture session emits records marked hidden, when the
acceptance suite drives the packaged app through that session, the
suite shall assert that hidden records appear nowhere in the run
view ([DESK-1](#desk-1)): the core's visibility boundary
([CORE-8](../packages/core-service.md#core-8)) and the view's
protocol-only rendering
([RUN-13](../packages/run-view.md#run-13)) compose to keep judge
and router traffic invisible.
