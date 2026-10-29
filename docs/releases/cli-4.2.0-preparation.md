<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI 4.2.0 release preparation

Prepared on 2026-10-29 for `cli-v4.2.0`, governed by [the release rules](../../specs/packages/release.md).
The minor version adds two behaviors without changing an existing command's contract.
The CLI README and all four CLI-affecting commits since `cli-v4.1.0` were reviewed against the channel changelog.
The version change alters no dependency resolution: npm's own lockfile pass over the bumped manifest changed nothing beyond the two version fields.

## What the release ships

- `spex package init <org>/<name>` makes `spex-packages/<name>/` from `--skill` folders and/or a `--spec` file, with a format 2 manifest, a README and the project's LICENSE, and needs no running app ([DR-162](../../specs/decisions/162-a-package-folder-from-what-you-already-have.md)).
- Every rule is checked before anything is written, including the refusal of a `SKILL.md` behind a byte order mark, which the release readers would not read.
- Attached commands find the running app — desktop or server shell — through the `local/endpoint.json` file its core keeps under `SPEX_HOME` or `~/.spex`, after `--server` and `SPEX_SERVER_URL` ([DR-163](../../specs/decisions/163-the-cli-finds-the-running-app.md)).
- No released app keeps that file yet: against app 0.9.0-beta.18, the latest app tag, the CLI still needs `--server` or `SPEX_SERVER_URL`, as the CLI README and the getting-started guide say.
- The package-init suite asserts the executable bit only where the platform keeps one, so the Windows CI job passes; this is a test change, ships nothing in the tarball and carries no changelog entry.

`package-init.js` and its declaration are the only new runtime files since `cli-v4.1.0`.

## Candidate

The candidate is `f1145e766d43da318d4ce4ffb85009e47db006a4` (`chore(release): Prepare CLI 4.2.0`), on main `189165145f305d89a16e4cbdb8057b99f7d9c14c`, the merge of pull request #281.
It changes only the CLI manifest's version, the lockfile's workspace version, and the changelog's new `[4.2.0] - 2026-10-29` section with its comparison link.
The release workflow's own notes extraction, run locally over that changelog for `4.2.0`, yields exactly the two Added entries.
Pull request #281's head `a3439ab7b724c16b470bdda6fcf514ccf302fcb4` passed all six pull-request CI jobs.
The full-matrix CI run for that main commit, [run 40887226801](https://github.com/sublang-ai/spex/actions/runs/40887226801), had seven of nine jobs successful, `test (macos-latest, 22)` still running and `test (macos-latest, 24)` failed when this record was written.
That job's one failing test is the desktop suite's `compiler-runtime.test.js`, which loads Electron, whose binary download on the runner ended in `fetch failed`; the same job's CLI suites, `package init` and endpoint-file discovery among them, passed.
That run is not the tag's evidence: the merged preparation change's own `main` run is.

## Local release gates

All gates below ran on that committed candidate in an isolated Git worktree with its exact lockfile, on macOS (arm64) with Node v25.2.1 and npm 11.19.1.
The subsequent preparation record changes no runtime, test, scaffold, lockfile or release-script input.

| Gate | Evidence |
| --- | --- |
| Clean installation | `npm ci` against `https://registry.npmjs.org/` passed from the committed lockfile, with no `.npmrc` or dependency override |
| Build | `npm run build` passed in 11 seconds across every workspace, with both message catalogs whole |
| Canonical smoke | The second run of `npm run smoke -- --keep` passed build, spec lint, fresh installation and the installed CLI journeys in 251 seconds; the first run failed, as described below |
| Fresh installation | Committed-tree clone of the candidate and `npm ci` on an empty npm cache (737 packages); README server launch and native Electron acceptance launch both passed |
| Server walk | Page served; protocol 28 hello; config seeded and valid with `/code`, `/review`, `/decide`, `/dev`, `/branch`, `/pr` and `/inspect`; catalog and `/code` artifacts complete; Claude and Codex readiness reported; the clone's own compiler named; the Academy example seeded with 12 packages parsed clean; scaffold run with the registry unreachable; SIGTERM exit 0 with no process left |
| Desktop launch | Acceptance render populated after Playbooks, Settings and Dashboard with no console errors; native module restored for Node |
| CLI journeys | Packed `sublang-spex-4.2.0.tgz` installed into an isolated prefix; all 19 stages passed, covering fresh scaffold, lint clean and broken, idempotent rescaffold, agent selection, update, Chinese creation and update, and previous-generation lint, refusal and update prompt |
| Live migration | Unmodified `node scripts/migration-smoke.mjs --agent codex --keep` (the script behind `npm run smoke:migration`) passed on the signed-in Codex CLI through pack, scratch repository seeding, packed-CLI installation, spec-law refresh by `spex scaffold --update --lang en`, the old-generation pre-gate, the migration within its 30-minute budget and the post-gates, reporting "all requested agents passed" with exit 0 and no waiver |
| Migration post-gates | Clean spec lint; all 13 legacy item IDs survive under current IDs; intent checkbox states preserved; no `specs/compositions/` remains |
| Spec lint | The smoke's lint stage, run by the candidate's own CLI, and the globally installed `spex lint` (CLI 3.0.0) each report 0 errors and one advisory meta-29 warning on `core-service-41` |
| Tarball hygiene | `npm pack --dry-run --json --workspace=@sublang/spex` lists 50 production files — `LICENSE`, `README.md`, `package.json`, 14 `dist` modules with their 14 declarations, and 19 `scaffold` files — at 76,780 compressed bytes and 257,446 unpacked bytes; no tests, source maps or implementation source outside runtime output |

The passing smoke reported build 8 seconds, lint 1 second, fresh install 3 minutes 51 seconds (installation 3 minutes 3 seconds, server 14 seconds, desktop 33 seconds) and CLI journeys 11 seconds.
The tarball inspection, repeated after that smoke's rebuild, returned the identical file list and identities.
The inspected tarball's npm SHA-1 is `44a7cd635834aec97c4440e950bfd71881cd05ce`; its integrity is `sha512-jxb9tQjw+uPxBzsVJ2iDM7BZZLbVJZKzUN3gT0s3sIhQU1zGEbDVx3R54lPWDHbs/bkq9Jg7pZBvmMmtdPdGew==`.
A real `npm pack` of the same tree produced a tarball with that SHA-1.

### The live migration

The machine's Claude CLI is signed out, so Codex was the migrating agent; the rule asks for a real coding agent, not a particular one.
Codex CLI 0.165.0 ran on its own configured defaults, `gpt-6.1-sol` at reasoning effort `ultra`, since the migration smoke names no model; it used 100,773 tokens.
The run was made from this worktree on the candidate's tree, the record commit adding only this document, and it packed the same 50-file tarball with SHA-1 `44a7cd635834aec97c4440e950bfd71881cd05ce`.
The agent finished in three commits on the scratch repository's `main`, `fb6a57d`, `1fb1ff7` and `4a738e3`, with `spex lint` clean, a clean worktree, the target law and SPDX headers unchanged, and `specs/compositions/` removed.
Its handoff, `migration-review.json`, leaves human review for the fixture's unspecified overdue marking and for missing evidence behind inherited completed deliverables.
That is a handoff note for review, not a gate failure; the migration does not claim to complete those legacy requirements.
The migration gate uses the agent CLI's own defaults; it is release evidence, not a team simulation.

### The first smoke run

The first unmodified `npm run smoke -- --keep` failed at its fresh installation's desktop stage: `npm start did not return within 10m 00s; its last output: Downloading Electron binary...`.
Its build, spec lint, clone, empty-cache installation and server walk had all passed.
The machine held no Electron download cache, and GitHub's release host served each connection at about 20 to 27 KB/s, too slow for the 129,743,965-byte Electron 44.0.0 archive to arrive within the stage's budget.
That archive was then fetched in parallel byte ranges from the same release URL, its SHA-256 `076d79742986e1b100b69ebecc691cb07368045e54c9087cef631b8622b76a80` checked equal to the value `electron@44.0.0` pins in its `checksums.json`, and placed through `@electron/get`'s own cache.
That user cache is the one the fresh installation names as serving a first launch's binary; the npm cache stayed empty.
The second run then passed on the same candidate with no change to the tree or the smoke.

### This release's features through the packed CLI

The smoke's CLI journeys do not reach `package init` or app discovery, so both were walked through the packed tarball installed into a scratch prefix:

- `spex package init walk-org/hello --skill .claude/skills/hello --move` made `meta.yaml` (format 2, version `0.1.0`, the skill's description, `Apache-2.0` without a project LICENSE), `README.md` and `skills/en/hello/SKILL.md`, moved the skill folder, printed the app and CLI next steps, and exited 0.
- Repeating it against the existing folder refused with "already exists; nothing was written" and exit 1.
- `spex package status` with an empty scratch `SPEX_HOME` and no server named reported that no running Spex app was found and exited 1.

A running shell's file being found was not walked locally; CI's CLI suite verifies the CLI's reading of the file, and the core and server-shell suites verify the file each one keeps.

Local evidence is retained under the release operator's temporary evidence directory `cli-4.2.0/`:

| Evidence file | SHA-256 |
| --- | --- |
| `build.log` | `a28375230d769d65dd961139db00a25dd1da9b69b0f4510f49d4f6111d178d02` |
| `smoke-run1-failed.log` | `2ae20d40a8b7e2913b959835f857377055a25a9806b0ef8bb874c71aa80b3ba6` |
| `smoke.log` | `be7bcd2b096c4a8251dbb682f7bb4c95f2a74f22d38e88bcdf1155e2ddf414aa` |
| `electron-fetch.log` | `0b1f3f854de798c433682a391d028bbdae12583aa57abff3f7eea24cd0f1b677` |
| `migration-codex.log` | `ad70a8e42cbcda1b0f7c17803ba6229e7907213d690e1a3f6b069cfc77288a04` |
| `lint.log` | `9e8ac44b9c492ef7c57d8c031f601cd6f2a3bc2d5b560e3c5c6055f1bfaa6639` |
| `pack.json` | `2f0115d096acb38286df741319961de0f7bcc2833ec754bd8810b804c58889b9` |

## Publication gates still pending

- Merge the reviewed preparation change and verify successful CI for the exact resulting `main` commit [[release-15](../../specs/packages/release.md#release-15)], every job of its full matrix included, since the base's macOS Electron download failure can recur there.
- Tag that commit `cli-v4.2.0` and verify the OIDC publication workflow.
- Verify a fresh public npm consumer and record the published source and package identities.

This record does not claim publication, an app release, or an independent review of the candidate.
