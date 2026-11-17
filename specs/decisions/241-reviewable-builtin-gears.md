<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-241: Reviewable Built-In GEARS

## Status

Accepted (2026-11-16) on the owner's direction to release the latest built-in GEARS and select the app's shipped release automatically.
Amends [DR-239](239-playbook-18-3-1-reference-adoption.md) in the Playbook floor and bundled playbook version and [DR-237](237-published-agent-runtime-floors.md) in the slc floor.
Amends [DR-104](104-spec-package-format-and-client-environments.md) and [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md) in the global built-in package's automatic upgrade instead of retaining its lock until Update.
Extends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in the app's selection of its shipped built-in package at startup.

## Context

Playbook 19.0.0 publishes the SDLC references with GEARS organized for human review as requirements, actions and verification items.
SLC 0.22.0 adopts those compiler definitions and requires a compatible Playbook 19 engine.
Spex ships the earlier references and compiler.
Shipping newer files alone leaves an existing global environment selecting the older references, so an app upgrade does not deliver the verified built-ins it ships.

## Decision

All Playbook consumers require `^19.0.0`, and both shells require slc `^0.22.0`.
The built-in playbooks stage as `sublang/playbooks` 19.0.0 from the published Playbook package.
The dependency lock keeps the app and compiler on the same installed engine under [DR-167](167-the-compiler-shares-the-apps-engine.md).
At startup, the app advances an existing registry request for `sublang/playbooks` in the global environment to a caret on the verified release it ships and selects that release, keeping a request or locked release already newer and leaving an equal locked release unchanged.
This selection follows the app's shipped release, not the registry's latest release, and preserves other packages' requests and locked resolutions.
Removal stands; path and Git sources and project environments retain their explicit selections.
The upgrade preserves artifact selections and aliases, requires a compatible retained dependency graph and leaves stale or incompatible inputs to normal resolution under [[environments-11](../packages/environments.md#environments-11)].

## Consequences

An app upgrade delivers its verified built-in GEARS to existing global installations, and new full compilations emit the same reviewable form.
Projects and explicit source overrides keep their selected releases, and an older app does not downgrade a newer global selection.
