<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DESK: Desktop Session Flow

## Intent

This interaction spec covers the flow that makes Spex a product: a
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
browser client would use, and shall render there in emission order —
the shell adds no second data path
([SHELL-11](../packages/app-shell.md#shell-11),
[CORE-7](../packages/core-service.md#core-7),
[RUN-13](../packages/run-view.md#run-13)).

### DESK-2

While a session awaits a Boss reply, when the app window is not
focused, the attention shall surface at every layer the Boss can
see: an OS notification and dock badge from the shell, and the
composer's awaiting state in the run view, all derived from the same
record stream.

## Tests

### DESK-3
Verifies: [SHELL-10](../packages/app-shell.md#shell-10), [CORE-4](../packages/core-service.md#core-4), [CORE-7](../packages/core-service.md#core-7), [RUN-1](../packages/run-view.md#run-1)

Where a packaged build is installed with a profile backed by a fake
adapter, when the acceptance suite launches the app, starts a
session, and completes a Boss turn, the suite shall assert the whole
chain end to end: the core runs inside the app process, the session
is created with the project directory as its working directory, the
turn's records stream over the WebSocket protocol, and the Captain
pane renders them in arrival order with their glyphs.

### DESK-4
Verifies: [CORE-8](../packages/core-service.md#core-8), [RUN-13](../packages/run-view.md#run-13)

Where a fixture session emits records marked hidden, when the
acceptance suite drives the packaged app through that session, the
suite shall assert that hidden records appear nowhere in the run
view, proving the core's visibility boundary and the view's
protocol-only rendering compose to keep judge and router traffic
invisible.
