<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-116: Playbook 17.8.0 and slc 0.16.1 Adoption

## Status

Accepted (2026-10-11).
Amends [DR-111](111-the-core-coordinates-as-git-does.md) in its Playbook floor alone, now `^17.8.0`; everything else DR-111 decided stands.
Amends [DR-102](102-playbook-17-4-1-adoption.md) in its slc floor alone: both shells declare `@sublang/slc` `^0.16.1`; everything else DR-102 decided stands.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule for the compiler and [DR-024](024-app-supplied-agent-runtimes.md)'s app-supplied agent runtimes; nothing either decided changes.
Amended by [DR-121](121-playbook-17-9-0-cligent-0-33-5-adoption.md) in its floors alone: the core requires `@sublang/playbook` `^17.9.0` and `@sublang/cligent` `^0.33.5`; slc `^0.16.1` stands.
Amended by [DR-123](123-playbook-17-10-1-cligent-0-34-0-slc-0-16-9-adoption.md) in its slc floor alone, now `^0.16.9`.

## Context

- A ten-team workshop simulation on 2026-10-11 ended three finished runs as runtime defects: a judge forced into a reply shape the compiled machine refuses, a direct-Captain adjudication reply with an undeclared field thrown as an uncaught error, and a closing reply saying nothing was committed when the receipt showed the commit; two more runs failed because a step committed twice or found its work already committed.
- Playbook 17.8.0 fits judge replies to the compiled machine's own validator, prints each guard's reply shape to the direct-Captain judge, retries one structural error and parks the step on a second, and reports every commit a failed turn's receipts proved; a commit outcome now takes every new commit or the one already at HEAD that the player names [[1]].
- Playbook 17.8.0's text2gears guide says a role is one capitalized word and marks a quoted relay by its parenthesized backticked `>` in any language; slc 0.16.1 refuses a multi-word `Roles:` entry before any agent runs and reads that marker, so a Chinese source no longer needs an English phrase [[1]] [[2]].
- A ledger written by Playbook 17.8.0 may carry a receipt's `commits` list, which an older Playbook rejects, so every host sharing a store upgrades together [[1]].
- A compiled registry bundles the engine it was linked with: a playbook compiled under an earlier Playbook keeps that engine's adjudication until it is compiled again.

## Decision

- **Floors.** The core requires `@sublang/playbook` `^17.8.0`; `@sublang/cligent` stays `^0.33.3`; both shells declare `@sublang/slc` `^0.16.1`.
- **The lock.** The lockfile is regenerated from the public registry, with no links or overrides, and holds one Playbook, 17.8.0, and one slc, 0.16.1, at the tree's root, the compiler's Playbook range resolving to that copy; the agent SDK locks stay where they are.
- **The built-in spec package** follows, at 17.8.0, as the core seeds it at Playbook's version.
- **The failure catalogue** phrases every code Playbook 17.8.0 exports, the new parked-judge cause included, as its test against the exported list requires.
- **Recompiling** stays the reader's act: an authoring session's Compile re-links a playbook against the supplied engine; the app recompiles nothing unasked.

Considered and declined:

- Rewriting every installed registry at the upgrade: a registry is a release's own file; the app writes none it did not compile.

## Consequences

- The three workshop failures no longer end a run whose work is done; a second invalid judge reply parks the step for the Boss instead.
- Homes sharing a store with the Playbook CLI stop every older writer before the first new one runs, as the release notes say.
- Fixtures captured from the runtime are re-captured where the receipts changed.

## References

[1]: https://github.com/sublang-ai/playbook/blob/v17.8.0/CHANGELOG.md "Playbook changelog: 17.8.0"
[2]: https://github.com/sublang-ai/slc/blob/v0.16.1/CHANGELOG.md "slc changelog: 0.16.1"
