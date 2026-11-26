<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-241: Reviewable Built-In GEARS and the Runtime Floors

## Status

Accepted (2026-11-16) on the owner's direction to release the latest built-in GEARS and select the app's shipped release automatically; revised (2026-11-26).
Amends [DR-075](075-a-failure-says-what-and-what-now.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md), [DR-223](223-windows-storage-checks-what-macos-checks.md).

## Context

- Spex embeds Playbook's engine and runs slc's compiler, both on Cligent; each runtime release Spex adopts changes what an install runs, and earlier adoptions repeated the same steps.
- Playbook 19.0.0 publishes the SDLC references with GEARS organized for human review as requirements, actions and verification items.
  SLC 0.22.0 adopts those compiler definitions and requires a compatible Playbook 19 engine.
- Shipping newer built-in files alone leaves an existing global environment selecting the older references, so an app upgrade does not deliver the verified built-ins it ships.
- The runtime keeps closed vocabularies a client must phrase — its failure-code list among them — and composes the lines it writes to the Boss; a copy Spex kept would drift.
- A session or ledger written by a newer Playbook may carry fields an older one rejects, so every host sharing a store upgrades together.
- Rules the runtime enforces for every host — such as Playbook refusing a fresh engagement of the packaged `code` or `decide` while `review` is disabled, and Windows private storage admitting another principal's read grant as [DR-223](223-windows-storage-checks-what-macos-checks.md)'s does — need no second copy in Spex.

## Decision

### Floors

- All Playbook consumers — the core, both shells and root acceptance tooling — require `@sublang/playbook` `^19.0.0`, and both shells require `@sublang/slc` `^0.22.0`; the core's Cligent floor is [DR-237](237-published-agent-runtime-floors.md)'s.
- The dependency lock keeps the app and compiler on the same installed engine under [DR-167](167-the-compiler-shares-the-apps-engine.md).

### Adopting a runtime release

- Spex adopts a release only once it is published and verified on the public registry, in order from Cligent to Playbook to slc to Spex, regenerating its lock through npm from those artifacts; the agent SDKs the shells declare at `*` stay locked at releases the adopted Cligent accepts.
- A fault or rule the runtime owns is fixed or enforced there: Spex adds no output sanitizer, alternate transport or second copy of a runtime rule, and the Library's hint names Playbook's review refusal ahead of a run.
- The failure-code list comes from the runtime's export, re-exported unchanged by the core's protocol, and the failure catalogue's coverage test reads that export, so a new code fails a test until it is phrased.
- Spex composes none of the lines the runtime writes for the Boss — exchange and continuation markers, the role line, the shell's appended commit, failure and control lines, the closing reply's facts — and shows them as the runtime gives them.
- The authoring preamble follows the installed compiler: it says the runtime relays every Boss exchange to every later role of the run, and has a behavior name a later role as receiving the exchange only where that role's step must carry the answer in its own data.
- Runtime-derived fixtures — machine graphs, parked failures, and a browser journey whose scripted failure parks a run advertising real actions — are re-captured from the installed release and a real core with substitute agents.
- A release that changes the shared session or ledger format is a coordinated upgrade: every older writer sharing the home stops, and the home is snapshotted, before the first new writer saves.
- An adoption recompiles no user artifact and rewrites no installed registry, environment lock or saved session; an authoring session's Compile re-links a playbook against the supplied engine.

### The shipped built-ins

- The built-in playbooks stage as `sublang/playbooks` at the installed Playbook's version, 19.0.0, from the published Playbook package.
- At startup, the app advances an existing registry request for `sublang/playbooks` in the global environment to a caret on the verified release it ships and selects that release, keeping a request or locked release already newer and leaving an equal locked release unchanged.
- This selection follows the app's shipped release, not the registry's latest release, and preserves other packages' requests and locked resolutions.
- Removal stands; path and Git sources and project environments retain their explicit selections.
- The upgrade preserves artifact selections and aliases, requires a compatible retained dependency graph and leaves stale or incompatible inputs to normal resolution under [[environments-11](../packages/environments.md#environments-11)].

Considered and declined:

- rewriting every installed registry at an upgrade: a registry is a release's own file, and the app writes none it did not compile;
- refusing packaged `code` or `decide` without `review` in Spex's core: the runtime that admits the engagement owns that rule for every host.

## Consequences

- An app upgrade delivers its verified built-in GEARS to existing global installations, and new full compilations emit the same reviewable form.
- Projects and explicit source overrides keep their selected releases, and an older app does not downgrade a newer global selection.
- A runtime fix reaches Spex by raising a floor, and a new runtime failure code or Boss-facing line needs no Spex copy to stay in step.
- Homes sharing a store with the Playbook CLI stop every older writer before the first new one runs.
