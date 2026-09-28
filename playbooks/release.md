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

`release` prepares one app release of the repository in the current directory, which must be the Spex repository on the branch to release: it reconciles the changelog with the commits, bumps the shell manifests, runs every gate the release rules require for that kind, records their outcomes, and stops before the tag.
It never pushes and never tags: the Boss pushes the prepared commits and tags once CI is green, as the release rules say.

When the caller gives the request, Captain shall relay the complete caller input in quotes (`>`) to Releaser, along with the following instruction:

> Original request: <caller-input>

```markdown
Prepare the release described above; read `specs/packages/release.md` and `docs/release-smoke.md` first and follow them exactly.
Step 1 — the changelog and the versions. List every commit since the last `app-v*` tag (`git log --reverse app-v<last>..HEAD`), read `CHANGELOG.md`'s `[Unreleased]` section, and add every notable change that is missing, in the file's own voice and under its headings. Set `version` in `apps/desktop/package.json` and `apps/server/package.json` to the requested version. For a regular release, move `[Unreleased]` into a dated version section and update the comparison links; for a beta, leave `[Unreleased]` in place. Commit as `chore(release): Prepare app <version>`.
Step 2 — the gates, in this order, each run to completion and its outcome recorded as you go in `docs/releases/<version>-preparation.md`, shaped like the existing files there: `npm run smoke`; `npm run smoke:desktop`; for a regular release also `npm run regression`. A failure on the provider's side may be retried once and, if it recurs, waived with the reason written beside the gate; a failure on the app's side is not waived: record it and stop. Record the commit each gate ran against, the stage timings, and every deviation. Commit the record as `docs(release): Record the <version> gates`.
Report the prepared version, the commits you made, each gate's outcome with any waiver and its reason, and the exact `git tag` command the Boss would run — or, when a gate blocked, which gate, its evidence, and what would unblock it.
```

The result has two semantic outcomes: prepared and blocked.
Each outcome requires affirmative support in Releaser's result: prepared requires every required gate recorded green or waived on a provider-side reason, and blocked names the gate and its evidence; no outcome depends on a fixed presentation format of Releaser's reply.

After Releaser reports prepared, Captain shall give Reviewer the following instruction, appending Releaser's complete result and the original request in quotes (`>`):

```markdown
Review the release preparation for the request below against `specs/packages/release.md`.
Check the changelog against the commits since the last app tag: every notable change recorded, nothing recorded that did not land, the version section dated for a regular release and `[Unreleased]` kept for a beta.
Check both shell manifests carry the requested version verbatim.
Check the preparation record names every gate the release kind requires, that each is green or waived with a provider-side reason, and that no app-side failure was waived.
Raise only findings that would make the tag wrong; number them; approve when there are none.
```

> Original request: <caller-input>
> Releaser result: <releaser-result>

When Reviewer raises findings, Captain shall hand them to Releaser in quotes (`>`) with the instruction to address each finding, explain any it rejects, commit the changes, and report again; then Reviewer reviews again.
Releaser and Reviewer argue no more than 2 rounds.

For prepared with Reviewer's approval, `release` is complete and returns the prepared version, the commits, the gate outcomes, and the tag command to its caller.
For blocked, `release` fails and reports the blocking gate with its evidence to its caller; the prepared commits stay in the branch for the Boss to inspect.
