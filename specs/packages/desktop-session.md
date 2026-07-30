<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# desktop-session: Desktop Session Flow

## Intent

This package covers the flow that makes Spex a product: a Boss runs a live playbook session inside the packaged desktop app.
The flow spans the shell (process topology and packaging), the core service (session lifecycle and record streaming), and the run view (rendering) — no single package owns it; the behavior emerges only when the three work together.

## External Behavior

### desktop-session-1

Where the packaged desktop app is installed with a valid shared config, when the Boss starts a session for a registered project and completes a turn, the app shall present the session in the run view from the record stream delivered over the same WebSocket protocol a browser client would use [[app-shell-10](app-shell.md#app-shell-10)] [[core-service-7](core-service.md#core-service-7)].

- Every non-hidden record the embedded runtime emits reaches the run view through that protocol.
- The view presents the session from that received stream alone.
- No record marked hidden appears in the view [[core-service-8](core-service.md#core-service-8)].

### desktop-session-2

Where the shared config enables the awaiting-reply notification kind, while the app window is not focused, when a session begins awaiting a Boss reply, the attention shall surface at every layer the Boss can see: an OS notification and dock badge from the shell, and the composer's awaiting state in the run view.

## Verification

### desktop-session-3

Where a packaged build is installed with an agent backed by a fake adapter and the shared config enables the awaiting-reply notification kind, when the acceptance suite launches the app, starts a session, and completes a Boss turn, the suite shall assert the whole chain end to end [[desktop-session-1](#desktop-session-1)]: the core runs inside the app process [[app-shell-10](app-shell.md#app-shell-10)], the session is created with the project directory as its working directory [[core-service-4](core-service.md#core-service-4)], the turn's records stream over the WebSocket protocol [[core-service-7](core-service.md#core-service-7)], and the Captain pane renders its status lines in arrival order with their glyphs [[run-view-1](run-view.md#run-view-1)]; and while the session awaits the Boss's reply with the window unfocused, the OS notification [[app-shell-3](app-shell.md#app-shell-3)], dock badge [[app-shell-4](app-shell.md#app-shell-4)], and composer awaiting state [[run-view-9](run-view.md#run-view-9)] all surface [[desktop-session-2](#desktop-session-2)].

### desktop-session-4

Where a fixture session emits records marked hidden, when the acceptance suite drives the packaged app through that session, the suite shall assert that hidden records appear nowhere in the run view [[desktop-session-1](#desktop-session-1)]: the core's visibility boundary [[core-service-8](core-service.md#core-service-8)] and the view's protocol-only rendering [[run-view-13](run-view.md#run-view-13)] combine to keep judge and router traffic invisible.
