<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-039: Browser Acceptance Journeys

## Status

Accepted (2026-09-02) on the owner's ask for automated acceptance that simulates real users in typical scenarios.
Extends [DR-020](020-desktop-live-smoke.md): the live desktop smoke keeps the Electron topology; the journeys take the interface.

## Context

- Automated coverage stops at two boundaries: the core's contract tests drive the WebSocket protocol with a fake adapter and a scripted Captain, and the interface's tests render components in a simulated document over a mocked client and seeded state.
  Nothing automated runs the built interface's code in a browser against a core.
- Every journey a user actually takes — a first launch on an empty machine, seeding the example, capturing an intent and seeing it through to History, running and ending a session, editing Settings, enabling a playbook, opening the remote token URL — rests on the manual release checklist and two local, credential-bound smokes.
- The suites specified for the packaged app (desktop notifications, single instance, the packaged import) need a packaged build and operating-system assertions; they are unimplemented and would not cover the interface either.
- The server shell serves the same interface bundle the desktop loads, from one origin, over the same protocol; a browser at its token URL is a real user, and it starts in one call with no native module flip.
- The core already exposes the seams a hermetic run needs — adapter imports, the adapter runtime check, the Captain factory, environment, and home — and the fake dev core narrates a realistic run through them.

## Decision

### One browser suite over the served interface

- A browser acceptance suite (Playwright [[1]] on Chromium) drives the served interface bundle against a real core: the harness starts the real server shell programmatically on a loopback port, on a scratch state root and a scratch config, with the core's agent seams substituted — the fake adapter, an adapter runtime that reports ready, and the scripted Captain that narrates the real code machine's traces — and opens the shell's token URL in the browser.
- The server shell gains one programmatic seam for this: core service overrides on its options, reachable from code only, never from the command line; absent, nothing changes.
- The scripted Captain and fake adapter script move from the dev core's binary into the core's testing module, so the dev core and the harness share one narration.

### Journeys as test items

- A journey is one typical user session, written as a test item in the package whose behaviors it verifies, asserting through the page alone — visible text, roles, accessible names, the address bar — plus the files a journey should leave on disk where the behavior is about persistence.
- One journey may verify several packages; its assertions then split into one item per package, each citing its own package's behaviors, implemented by the same browser flow.
- Accessibility is a journey: each surface is scanned by axe-core [[2]] at WCAG 2.1 AA, and the suite fails on serious or critical violations.

### Two lanes

- Hermetic lane, the default: the substituted agents, deterministic and fast, run in CI on every push and pull request and as a stage of the smoke suite.
- Live lane, opt-in by environment: the same harness with the real adapters and the real Captain on the machine's sign-in, running only the journeys tagged live — a minimal no-change `/code` task observed to a player's live output, then aborted — under the wait budget and the retry-or-waive rule of [DR-020](020-desktop-live-smoke.md).

### What stays

- The packaged-app suites keep their specification; the journeys cover what a browser can see and do not stand in for a packaged launch, notifications, or the dock.
- The core contract tests and the interface's component tests keep their place: the journeys assert outcomes a user sees, not the shapes the lower suites already pin.

## Consequences

- Playwright, axe-core, and a Chromium download join the development dependencies in a new `e2e` workspace; CI gains one job; the smoke suite gains a stage; the tagging gate now includes the journeys.
- Journeys run at the scripted Captain's pace — seconds, not an LLM's minutes — so the suite stays a per-commit gate; only the live lane pays for real agents.
- Defects the journeys reveal are fixed in the packages they belong to; the suite itself carries no product rule.

## References

[1]: https://playwright.dev/docs/intro "Playwright: Installation and first test"
[2]: https://playwright.dev/docs/accessibility-testing "Playwright: Accessibility testing with axe-core"
