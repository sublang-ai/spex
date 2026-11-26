<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-020: Desktop Live Smoke

## Status

Accepted.
Amended by [DR-036](036-file-state-store.md), [DR-039](039-browser-acceptance-journeys.md), [DR-086](086-tests-in-tiers.md), [DR-089](089-every-fresh-user-scenario-walked-for-real.md).

## Context

- The automated smoke suite proves the core round-trip headlessly and renders the desktop shell once, but nothing automated exercises the packaged critical path — a real Electron process, the real shared config seeding, a real project, and a real agent turn — before a release.
- The desktop's acceptance mode screenshots the rendered shell and exits within seconds by design; it cannot host a turn.
- A real agent turn depends on local sign-in and a provider round-trip; hermetic gates must not depend on it.

## Decision

- The desktop gains one env-guarded smoke handshake: when the smoke variable names a handshake file, the main process redirects its user-data directory and the Spex home to smoke-provided locations ([DR-036](036-file-state-store.md)), starts the core as usual, and writes the core's socket address to the handshake file; the acceptance and smoke variables are mutually exclusive and refuse to combine.
- A driver script launches the real desktop app under that handshake and walks the critical path over the app's own socket: seeded config composes valid, the Academy example seeds and parses, a session starts, a minimal no-change `/code` turn dispatches, the driver waits for the coder's dispatch prompt and then first live output as agent evidence, aborts the turn, asserts the clean abort, and terminates the app.
  The wait budget tolerates real routing and first-token latency; the prompt asks for a reply with no repository changes.
- The driver owns the native-module ABI flip to Electron and its restore on every exit path, skipping the flip when its caller already performed it.
- Gates split by dependency: the hermetic suite — including the render-only desktop pass — never depends on a live agent; the live desktop smoke is the live smoke every app release runs, beta included ([DR-086](086-tests-in-tiers.md)), also inside the fresh install's clone ([DR-089](089-every-fresh-user-scenario-walked-for-real.md)), with its outcome recorded and a documented retry-or-waive rule for provider flakes.
- The browser journeys take the interface, while this smoke keeps the Electron topology ([DR-039](039-browser-acceptance-journeys.md)).

## Consequences

- A release candidate is exercised end to end on the real app with real agents before shipping, at the cost of a local, signed-in, non-hermetic run — bounded to minutes by the abort.
- The handshake is a test seam in the shell; it changes nothing when the variable is absent, and the mutual exclusion keeps the acceptance path deterministic.
- The app-shell package gains the handshake behavior; the release package records the split gates; the release checklist keeps the manual residue automation cannot see (notification and badge visuals, packaged-app launch, themes).
