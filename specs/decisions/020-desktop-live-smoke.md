<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-020: Desktop Live Smoke

## Status

Accepted

## Context

- The automated smoke suite ([DR-016](016-relationship-presentation.md) era) proves the core round-trip headlessly and renders the desktop shell once, but nothing automated exercises the packaged critical path — a real Electron process, the real shared config seeding, a real project, and a real agent turn — before a release.
- The desktop's acceptance mode screenshots the rendered shell and exits within seconds by design; it cannot host a turn.
- A real agent turn depends on local sign-in and a provider round-trip; hermetic gates must not depend on it.

## Decision

- The desktop gains one env-guarded smoke handshake: when the smoke variable names a handshake file, the main process redirects its user-data directory to the smoke-provided location, starts the core as usual, and writes the core's socket address to the handshake file; the acceptance and smoke variables are mutually exclusive and refuse to combine.
- A driver script launches the real desktop app under that handshake and walks the critical path over the app's own socket: seeded config composes valid, the Academy example seeds and parses, a session starts, a minimal no-change `/code` turn dispatches, the driver waits for the coder's dispatch prompt and then first live output as agent evidence, aborts the turn, asserts the clean abort, and terminates the app.
  The wait budget tolerates real routing and first-token latency; the prompt asks for a reply with no repository changes.
- The driver owns the native-module ABI flip to Electron and its restore on every exit path, skipping the flip when its caller already performed it.
- Gates split by dependency: the hermetic suite — including the render-only desktop pass — remains the tagging gate; the live desktop smoke is a separate named gate, run locally before app releases, with its outcome recorded and a documented retry-or-waive rule for provider flakes.

## Consequences

- A release candidate is exercised end to end on the real app with real agents before shipping, at the cost of a local, signed-in, non-hermetic run — bounded to minutes by the abort.
- The handshake is a test seam in the shell; it changes nothing when the variable is absent, and the mutual exclusion keeps the acceptance path deterministic.
- SHELL gains the handshake behavior; RELEASE records the split gates; the release checklist keeps the manual residue automation cannot see (notification and badge visuals, packaged-app launch, themes).
