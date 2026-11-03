<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Release

Roles:

- Releaser
- Reviewer

The caller supplies:

- the release kind: `beta` or `regular`;
- the version to prepare, as `MAJOR.MINOR.PATCH` for a regular release or `MAJOR.MINOR.PATCH-beta.N` for a beta;
- optional notes on what this release is for.

`release` prepares one app release of the repository in the current directory, which must be the Spex repository on the branch to release: it reviews the changes since the previous published app release, runs every gate the release rules require for that kind, records their outcomes, and stops before the tag.
It never pushes and never tags: the Boss selects the intended pushed source revision and pushes its tag after preparation passes; the tag workflow then requires full app validation of that exact tagged tree before publication, as the release rules say.

When the caller gives the request, Captain shall relay the complete caller input in quotes (`>`) to Releaser, along with the following instruction:

> Original request: <caller-input>

```markdown
Prepare the release described above; read `specs/packages/release.md` and `docs/release-smoke.md` first and follow them exactly.
Step 1 — source and version selection. Select the intended committed source revision and an unused `app-v<version>` tag. Review notable changes since the previous published app release. Do not bump shell manifests, move `[Unreleased]`, or create a version-only commit: CI derives both shell versions and lockfile entries from the tag before installation and validation. An exact-version changelog section may supply curated notes if already present; otherwise CI generates the commit range since the previous published same-channel ancestor. Validate the requested tag with `node scripts/release-version.mjs check --tag=app-v<version>`.

Step 2 — the gates, in this order, each run to completion and its outcome recorded as you go in `docs/releases/<version>-preparation.md`, shaped like the existing files there: `npm run smoke -- --live`, the smoke with the live smoke as its last stage; for a regular release also `npm run regression`. Judge each failure by its class in `docs/release-smoke.md`: a failure on the provider's side may be retried once and, if it recurs, waived with the reason written beside the gate; the compiler refusing the chat-authored source after the bounded relay may be waived with the compiler's output attached and an issue filed against `slc`; any other failure — the compiler refusing the app's own example on its first compile among them — is the app's, is not waived: record it and stop. Record the commit each gate ran against, the stage timings, and every deviation. Commit the record as `docs(release): Record the <version> gates`.
Report the prepared version, the commits you made, each gate's outcome with any waiver and its reason, and the exact `git tag` command the Boss would run — or, when a gate blocked, which gate, its evidence, and what would unblock it.
```

The result has two semantic outcomes: prepared and blocked.
Each outcome requires affirmative support in Releaser's result: prepared requires every required gate recorded green or waived as its failure class allows, and blocked names the gate and its evidence; no outcome depends on a fixed presentation format of Releaser's reply.

After Releaser reports prepared, Captain shall give Reviewer the following instruction, appending Releaser's complete result and the original request in quotes (`>`):

```markdown
Review the release preparation for the request below against `specs/packages/release.md`.
Check the selected source revision and unused tag identify the intended release; any curated exact-version notes must describe only landed changes.
Check the tag parser accepts the requested app version; source manifests need no bump because CI prepares the versions consistently before validation and packaging.
Check the preparation record names every gate the release kind requires, that each is green or waived as its failure class in `docs/release-smoke.md` allows, and that no app-side failure was waived.
Raise only findings that would make the tag wrong; number them; approve when there are none.
```

> Original request: <caller-input>
> Releaser result: <releaser-result>

When Reviewer raises findings, Captain shall hand them to Releaser in quotes (`>`) with the instruction to address each finding, explain any it rejects, commit the changes, and report again; then Reviewer reviews again.
Releaser and Reviewer argue no more than 2 rounds.

For prepared with Reviewer's approval, `release` is complete and returns the prepared version, the commits, the gate outcomes, and the tag command to its caller.
For blocked, `release` fails and reports the blocking gate with its evidence to its caller; the prepared commits stay in the branch for the Boss to inspect.
