<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-010: Hardening and Wrap-up

## Goal

Close the v1 build: verify the real Playbook Captain shell through
the Spex pipeline, finish documentation, and record what stays open
for the next cycle.

## Deliverables

- [x] Integration test driving the real `@sublang/playbook`
  Captain shell (registry loading, player binding, visible replies,
  pane visibility) over the protocol with fake adapters
- [x] Root README covering the app, the surfaces, and the dev
  workflows (including the native-ABI flip)
- [x] Deferred-work inventory recorded here

## Tasks

1. **Real-shell integration test** — default captain factory with
   the installed `@sublang/playbook/playbook-captain`; assert the
   bare-command reply and `player_view_changed` roster from the
   real shell reach the session channel.

2. **Docs** — root README: what Spex is, surfaces, quick start
   (desktop dev run, fake-mode UI dev), toolchain notes.

3. **Deferred inventory** — record below.

## Deferred to the next cycle

- Live `slc playbook` compile with a credentialed agent (needs
  network + credentials; pipeline is stub-verified end to end).
- Live CODE playbook turn with real agents, and tmux-play parity
  runs on identical inputs (DR-003 verification strategy).
- Packaged .app end-to-end test and `app-v*` release automation
  (SHELL-15 territory; dev boot is smoke-verified).
- Native directory picker via an approved shell channel (path entry
  works everywhere today).
- Layout-weight editing in Settings (config `layout` passes through
  untouched).
- Windows/Linux packaging and code signing.
- Cloud deployment of core + UI (architecture ready per DR-002).

## Acceptance criteria

- Root build/test green including the real-shell test.
- README accurately describes the current feature set
  ([RELEASE-14](../dev/release.md#release-14) spirit for the app).
