<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI 4.0.0 release preparation

Prepared on 2026-10-02 for `cli-v4.0.0`, governed by [the release rules](../../specs/packages/release.md).
The major version records the already merged Node.js 22 minimum; this release also ships complete Chinese scaffolds, a project-owned copyright holder and a lint command that works without a global installation.
The CLI README, historical release links and all CLI-affecting commits since `v3.0.0` were reviewed against the channel changelog.
The version change alters no dependency resolution.
An independent reviewer found no blocking issue in candidate `d61f3510d18336975340fdcc9e8c81c889c75343`.

## Local release gates

All gates below ran on that committed candidate in an isolated checkout with its exact lockfile.
The subsequent preparation record changes no runtime, test, scaffold, lockfile or release-script input.

| Gate | Evidence |
| --- | --- |
| Clean installation | `npm ci --registry=https://registry.npmjs.org` passed; no local dependency override |
| Canonical smoke | `npm run smoke -- --keep` passed build, spec lint, fresh installation and the installed CLI user journeys |
| Fresh installation | Empty npm cache and committed-tree clone; README server launch and native Electron acceptance launch both passed |
| CLI journeys | Packed 4.0.0, fresh project, upgrading project, Chinese creation/update, and previous-generation migration prompt/refusal behavior passed |
| Live migration | Unmodified `npm run smoke:migration -- --agent claude --keep` passed on a real signed-in Claude CLI, with no waiver or repeated provider run |
| Migration post-gates | Clean spec lint; all 13 legacy item IDs survive under current IDs; intent checkbox states preserved; no `compositions/` remains |
| Tarball hygiene | `npm pack --dry-run --json --workspace=@sublang/spex` lists 42 production files, 58,659 compressed bytes and 197,327 unpacked bytes; no tests or implementation source outside runtime output |

The smoke reported build 17 seconds, lint 2 seconds, fresh install 2 minutes 3 seconds and CLI journeys 14 seconds.
The migration retained four real commits, ending at `19ab34180b625c572e0be82ece1ea34ad7e2b4f6`, with a clean worktree.
Its handover calls out pre-existing fixture verification gaps and ambiguous old map prose for human review; the migration does not claim to complete those legacy requirements.
The official migration gate uses its normal Claude CLI defaults, independently of the workshop teams' explicit model restrictions; it is release evidence, not a team simulation.

Local evidence is retained under the release operator's temporary evidence directory:

| Evidence file | SHA-256 |
| --- | --- |
| `spex-cli4-smoke.log` | `c6bdfea5ad39a03f956f51f752b5c89f1fc9efcffd2a417dc6f6eb629501373a` |
| `spex-cli4-migration.log` | `34e2649a714319b4b97093df5f55dcdb9a2433b9f8f58f049e3f4154387d105d` |
| `spex-cli4-pack.json` | `a1cb5a72eb26260f08860909efe7f7fd62a54a5023664ce272211aaa4d842b3a` |

The inspected tarball's npm SHA-1 is `d3e88256038a173a1a558f47b009cd4bba56ba19`; its integrity is `sha512-Rlst8ropnUAhX/H80C72tMw3TJyyrSIBXaWlQwIyWDv/CsHHKz0RF4UHnpZSDgiUVxZsqYMYzXdmlKPQN/X1JA==`.

## Refresh after workshop fixes

The preparation was rebased onto merged main `31579f1db5063c177cbeeb7e6742dc445ae3b534`.
That base passed all nine CI jobs in [run 37089165882](https://github.com/sublang-ai/spex/actions/runs/37089165882).
The refreshed committed candidate `25927990ba12bbd053fcabb613c027c9af0d7cf8` passed a fresh unmodified `npm run smoke`: build 11 seconds, spec lint 2 seconds, empty-cache installation and both shells 1 minute 47 seconds, and installed CLI journeys 11 seconds.
Its successful smoke removed its temporary installation and stopped the launched shells.
The refreshed smoke log SHA-256 is `8d9f565b5b32d269248b5e4f6847aa599c6cad921e9fb179ed86956ca3afd6dd`.

The CLI tree, migration driver and migration fixtures are byte-identical to the original live-migration candidate.
The new production-file inspection also returns the identical 42-file tarball, SHA-1 and integrity recorded above; its JSON SHA-256 remains `a1cb5a72eb26260f08860909efe7f7fd62a54a5023664ce272211aaa4d842b3a`.
The original successful live-migration result therefore remains evidence for these unchanged inputs; it was not repeated.
The monorepo now resolves Cligent 0.33.3 for the app and adds the browser-cache script test; the fresh smoke verified that combined installation.
This added record changes no executable input.

## Publication gates still pending

- Merge the reviewed preparation change and verify successful CI for the exact resulting `main` commit.
- Tag that commit `cli-v4.0.0` and verify the OIDC publication workflow.
- Verify a fresh public npm consumer and record the published source and package identities.

This record does not claim publication, an app release, or the app live-smoke gate.
