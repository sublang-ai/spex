<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-102: Playbook 17.4.1 Adoption

## Status

Accepted (2026-10-03).
Amends [DR-095](095-a-subagents-effort-and-the-agents-own-model.md) in its floors alone: the core requires `@sublang/playbook` `^17.4.1` and `@sublang/cligent` `^0.33.3`, and both shells declare `@sublang/slc` `^0.15.1`; everything else DR-095 decided stands.
Amends [DR-097](097-media-and-browser-tools-across-hosts.md) in its dependency closure alone: the floors its rollout adopted — Playbook `^17.4.0`, Cligent `^0.33.3` and slc `^0.15.1` — had no adoption record of their own and are recorded here, with the Playbook floor now `^17.4.1`; everything else DR-097 decided stands.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule for the compiler and [DR-024](024-app-supplied-agent-runtimes.md)'s app-supplied agent runtimes; nothing either decided changes.
Amended by [DR-105](105-playbook-17-5-0-adoption.md) in its Playbook floor alone, now `^17.5.0`; the lock holds Playbook 17.5.0.

## Context

- DR-097's rollout raised the core to Playbook `^17.4.0` and Cligent `^0.33.1`, then `^0.33.3`, and both shells to slc `^0.15.1`, beyond DR-095's floors, with no record of the step.
- Playbook 17.4.1 refuses a fresh engagement of the packaged `code` or `decide` registry while `review` is disabled, before any coding or replacement and with a command-specific explanation, leaving unrelated workflows, custom registries and existing recovery available [[1]] [[2]].
- Before 17.4.1 such an engagement ran and committed work before its nested review failed for want of `review` [[2]]; the Library's hint for packaged `code` and `decide` without `review` presumes the refusal.
- Playbook 17.4.1 prepares a session asset directory without changing the mode or status of entries already private, so a repeated preparation by another store sharing the home no longer invalidates open verified readers [[1]].
- It ignores foreign files such as `.DS_Store` in a session asset directory and removes regular ones on session deletion, which succeeds even when a subdirectory keeps the directory in place [[1]].
- It gives a nested call only its parent engagement's attachments, so references the Captain did not select never reach a child worker [[1]].
- Playbook 17.4.1 requires Cligent `^0.33.2`, which the core's `^0.33.3` already meets, and slc 0.15.1's Playbook `^17.4.0` admits it [[1]].

## Decision

- **Floors.** The core requires `@sublang/playbook` `^17.4.1`; `@sublang/cligent` stays `^0.33.3`, and both shells keep `@sublang/slc` `^0.15.1`.
- **The lock.** The lockfile is regenerated from the public registry, with no links or overrides, and holds one Playbook, 17.4.1, and one Cligent, both at the tree's root, the compiler's Playbook range resolving to that copy; the agent SDK locks stay where they are.

Considered and declined:

- refusing packaged `code` or `decide` without `review` in Spex's core: the runtime that admits the engagement owns that rule for every host, and the Library's hint names it before a run meets it.

## Consequences

- A packaged `/code` or `/decide` run with `review` disabled stops at its start with Playbook's command-specific explanation instead of committing work its review cannot check, and the Library's hint [[playbook-library-89](../packages/playbook-library.md#playbook-library-89)] names that refusal ahead of it.
- Asset-bearing sessions in a home that another store also prepares, or where a file manager leaves `.DS_Store` files, stay readable and deletable.
- A child worker receives only the attachments its parent engagement holds.
- The floor history from DR-095 to the installed closure is complete: every floor the manifests declare has an adoption record.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/CHANGELOG.md "Playbook changelog: 17.4.1"
[2]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/080-packaged-review-admission.md "Playbook DR-080: Packaged workflow review admission"
