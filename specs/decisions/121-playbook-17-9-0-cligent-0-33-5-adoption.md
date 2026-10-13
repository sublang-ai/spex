<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-121: Playbook 17.9.0 and Cligent 0.33.5 Adoption

## Status

Accepted (2026-10-12).
Amends [DR-116](116-playbook-17-8-0-slc-0-16-1-adoption.md) in its floors alone: the core requires `@sublang/playbook` `^17.9.0` and `@sublang/cligent` `^0.33.5`; slc `^0.16.1` and everything else DR-116 decided stand.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule for the compiler and [DR-024](024-app-supplied-agent-runtimes.md)'s app-supplied agent runtimes; nothing either decided changes.

## Context

- A walk of ten workshop teams through the build on Playbook 17.8.1 and Cligent 0.33.4, on 2026-10-12, found players' commits carrying Claude Code's own attribution beside the trailer the project asks for, a trailer naming the wrong model, a reviewing role that never saw the Boss's answers, English framing in a Chinese run, a closing reply without its commit's hash or branch, and a step failed after its commit stood because the runtime forced a string the machine refuses.
- Cligent 0.33.5 runs Claude Code with its own commit and pull-request attribution off, so an agent's commits carry only the trailers it writes [[1]].
- Playbook 17.9.0 gives every player call after a Boss reply the run's Boss exchanges — each question as asked and each reply verbatim, in order — whatever its role and whatever its Source retains, and keeps them across a restore [[2]] [[3]].
- It marks a question by a `? ⟶` line and a reply by a `Boss ⟶` line with no English sentence, and the commit, failure and control lines the Captain shell appends to a reply carry marks and identifiers while the closing reply's facts keep their words [[2]] [[3]].
- It records the branch HEAD names in each repository observation, and a step's one new commit joins the closing reply's facts with its hash and branch [[2]] [[3]].
- It opens every player prompt with `Role: <role> · Model: <model>`, the model as the host's binding configures it [[2]] [[3]].
- It leaves a semantic field whose shape the construction probe does not reveal to the machine's own guard, while a recorded shape stays enforced [[2]] [[4]].
- An earlier Playbook rejects a runtime snapshot carrying the exchanges and a ledger whose observations carry a branch, so every host sharing a store upgrades together [[3]].
- Playbook 17.9.0 exports the same failure codes as 17.8.0 and keeps Cligent `^0.33.2`, which `^0.33.5` meets; slc 0.16.1's Playbook `^17.4.0` and Cligent `^0.33.1` admit both [[2]] [[5]].

## Decision

- **Floors.** The core requires `@sublang/playbook` `^17.9.0` and `@sublang/cligent` `^0.33.5`; both shells keep `@sublang/slc` `^0.16.1`.
- **The lock.** The lockfile is regenerated from the public registry, with no links or overrides, and holds one Playbook, 17.9.0, and one Cligent, 0.33.5, at the tree's root, the compiler's ranges resolving to those copies; slc and the agent SDK locks stay where they are.
- **The built-in spec package** follows, at 17.9.0, as the core seeds it at Playbook's version.
- **The authoring preamble follows.** It says the runtime relays every Boss exchange to every later role of the run, and has a behavior name a later role as receiving the exchange only where that role's step must carry the answer in its own data, the source-kept guarantee Playbook keeps [[3]].
- **The runtime's words stay the runtime's.** Spex composes none of the lines this release changes — the exchange and continuation markers, the role line, the shell's appended lines and the closing reply's facts — and shows them as the runtime gives them.

Considered and declined:

- Writing an attribution rule into Spex's agent configuration: the harness's own trailer is the adapter's to turn off, for every host Cligent serves.

## Consequences

- A player's commits carry only the trailers its project asks for, and the role line lets such a trailer name the player's role and model.
- A reviewing role judges with the Boss's answers in hand, and a run in any language reads no English framing around a question or a reply.
- The closing reply names each commit's hash and branch, and a judge's reply the machine admits is delivered where the probe could not read the machine.
- Homes sharing a store with the Playbook CLI stop every older writer before the first new one runs, as the release notes say.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.33.5/CHANGELOG.md "Cligent changelog: 0.33.5"
[2]: https://github.com/sublang-ai/playbook/blob/v17.9.0/CHANGELOG.md "Playbook changelog: 17.9.0"
[3]: https://github.com/sublang-ai/playbook/blob/v17.9.0/specs/decisions/090-every-role-hears-the-boss.md "Playbook DR-090: Every role hears the Boss"
[4]: https://github.com/sublang-ai/playbook/blob/v17.9.0/specs/decisions/091-an-unrevealed-shape-is-the-machines-to-judge.md "Playbook DR-091: An unrevealed shape is the machine's to judge"
[5]: https://github.com/sublang-ai/slc/blob/v0.16.1/package.json "slc 0.16.1 package manifest: its Playbook and Cligent ranges"
