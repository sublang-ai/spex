<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-005: Desktop Shell

## Goal

Implement `apps/desktop` — the Spex Electron shell — per the SHELL
spec package: core in the main process, the built UI in a sandboxed
renderer over the same WebSocket protocol, OS integration, and
macOS arm64 packaging.

## Deliverables

- [ ] `apps/desktop` workspace package: Electron main booting the
  in-process core and loading the built UI with the core URL
- [ ] Login-shell environment capture before adapter readiness
- [ ] Native notifications (turn finished, boss question, failure)
  honoring config notification preferences
- [ ] Dock badge from pending-attention count
- [ ] Single-instance enforcement and clean quit with active-turn
  warning
- [ ] electron-builder config for unsigned macOS arm64 artifacts
  with agent-SDK binaries asar-unpacked
- [ ] CI keeps building without downloading Electron binaries

## Tasks

1. **Package scaffolding** — `apps/desktop` with Electron + builder
   devDeps, tsc build for the main process, UI dist staging script
   ([SHELL-10](../dev/app-shell.md#shell-10)).

2. **Main process** — env capture
   ([SHELL-12](../dev/app-shell.md#shell-12)), core boot with
   userData store path, sandboxed window loading the UI with the
   core URL, single instance
   ([SHELL-1](../user/app-shell.md#shell-1)), quit safety
   ([SHELL-6](../user/app-shell.md#shell-6)).

3. **Notifications and badge** — record-driven notifications per
   config preferences and attention badge
   ([SHELL-2..4](../user/app-shell.md#shell-2)); core exposes a
   local event hook for the embedding shell.

4. **Packaging** — electron-builder macOS arm64 unsigned target,
   asar-unpacked agent SDK binaries
   ([SHELL-13](../dev/app-shell.md#shell-13)); CI env skips
   Electron binary download.

5. **Unit tests** — env-output parsing and notification mapping.

## Acceptance criteria

- `npm run build` green from the root including the desktop
  workspace; CI unaffected by Electron binary downloads.
- `npm start -w apps/desktop` opens the app connected to the
  in-process core (manual check).
- Packaged-app end-to-end verification is deferred to the final
  hardening iteration and tracked there.
