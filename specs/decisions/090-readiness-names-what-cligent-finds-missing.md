<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-090: Readiness Names What Cligent Finds Missing

## Status

Accepted (2026-09-28).
Extends [DR-024](024-app-supplied-agent-runtimes.md): the runtime half's diagnosis gains cligent's executable lookup; the probe, the targets and the repairs per install tree stand.
Amends [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md) in its Cligent floor alone: the core requires `^0.27.1`; everything else DR-088 decided stands.

## Context

- The Claude Agent SDK and the Codex SDK spawn a native executable that npm installs from an optional platform package, and npm drops such a package without failing the install.
- The SDK module still loads without it, so readiness read the adapter ready and its first run failed with the executable not found.
- Which package holds the executable for a host is each SDK's own layout rule; a copy of it in Spex drifts with every SDK release and answers readiness apart from the load a session start performs, which [DR-024](024-app-supplied-agent-runtimes.md) forbids.
- Cligent 0.27.1 confirms that executable in the `claude` and `codex` adapters' availability, and exports a lookup that reports it present, its platform package missing, the host unsupported, or the SDK absent.

## Decision

- The runtime half stays cligent's availability probe, which now confirms the executable a bundled SDK spawns; Spex holds no SDK layout rule.
- When the probe fails and no published target is at fault, readiness for `claude` or `codex` phrases cligent's lookup:
  - a missing platform package is named with its platform and architecture and the repair of running `npm ci` in the checkout or reinstalling the app;
  - an unsupported host is named with no repair, since no install supplies what the SDK does not publish;
  - an absent SDK or a present executable adds nothing, leaving the runtime's failure to load.
- The core requires `@sublang/cligent` `^0.27.1`.

Considered and declined:

- resolving each SDK's platform package in the core: the layout rule would be a second copy, stale on the first SDK release that moves it.

## Consequences

- An install npm left without the executable reads not ready before the first turn, naming what to restore.
- A future SDK layout change reaches readiness through a Cligent release alone.
