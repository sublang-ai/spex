<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI 5.0.0 release preparation

Prepared on 2026-10-31 for `cli-v5.0.0`, under [the release rules](../../specs/packages/release.md).
Publication and successful full main CI remain pending.

## Scope

[DR-165](../../specs/decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md) makes the CLI a standalone package manager sharing its exported library with the app.
`add`, `remove`, `install`, `update`, `list`, `search`, `new` and `publish` operate in the current environment without a running app or project registration.
The environment's manifest, lock and ignored `.spex/` installation live at its root; developed packages use `spex-packages/<org>/<pkg>/`.

This is a major release: attached `auth`, `project` and `package` command groups, `--server`, `SPEX_SERVER_URL` and endpoint discovery are removed; `spex new` replaces `spex package init`; the declared exports map no longer permits arbitrary deep imports.
The channel's [changelog](../../packages/cli/CHANGELOG.md) has the dated 5.0.0 section and comparison links, and the [README](../../packages/cli/README.md) documents the shipped verbs and upgrade behavior.

[DR-168](../../specs/decisions/168-independent-package-registry.md) separates registry and Space grants, even at one origin.
`login`, `logout` and `whoami` default to registry purpose; `--registry` and `--space` select independent credentials.
New manifests explicitly select the public registry, while legacy manifests preserve their former source and locks preserve exact origin, version and checksums.
Private installation and publishing require the registry grant on the machine performing them, including a server seat.

## Latest integration status

Incoming main `d1c3ba497` adds the app's working-folder environment runtime and the expanded standalone CLI guide.
The integration adds journaled recovery across partial writes and source retirement, and preserves registry selection from the working root independently of Space placement.
Local CLI tests pass 165/165, focused UI tests pass 166/166, and three bounded Chromium journeys pass.
The focused Core run passed 51 of 53 cases; the two corrected fixture cases then passed their focused rerun, completing all 53 cases.
The final pre-push build, catalogs, type checks and spec lint pass.
The fresh integrated installed smoke, full CI and publication remain pending.

Earlier references to a final candidate at `5bf0b6f2`, `2b8dabc7` or the `c68c5e8a` help revision describe historical evidence, not proof of this new migration runtime.
The scaffold/lint/prompt/legacy-fixture inputs remain byte-identical to `e580f996`, and the previous packed and merged-built CLI print byte-identical migration prompts; this preserves the spec-migration evidence without claiming coverage of project-environment migration.

## Historical completed gates

The package-manager implementation was verified on `0a58d44d02b5eee5469fab40a8d4c1b12f4e165b`.
Its CLI, scaffold, migration driver, legacy fixture, root package manifest and lock are byte-identical through candidate `2b8dabc7f779b29f865dfbb87c9a31897b25a228`.
Later runtime `5bf0b6f2` changes only Core/interface namespace loading; the final candidate adds only one integration-fixture/spec correction to it.
The later CLI help correction changes only the entrypoint's static `USAGE` text: publishing names the registry, authentication names the selected purpose and registry default, and legacy-source compatibility is explicit.
The entrypoint outside that text and the lint/scaffold modules, bundled migration prompt and legacy fixture remain unchanged from the successful real-agent migration.

| Gate | Evidence |
| --- | --- |
| Installed smoke and packed CLI journeys | `npm run smoke -- --live --keep` passed all build, lint, clean-cache committed-clone installation, server, native desktop, packed-CLI fresh-user/upgrade and real-agent live stages on `5bf0b6f2`; no waiver |
| Real migration ([release-24](../../specs/packages/release.md#release-24)) | `npm run smoke:migration -- --keep` packed CLI 5.0.0, installed it into an isolated prefix, printed its bundled migration prompt and drove the signed-in Claude CLI through the legacy fixture within the 30-minute bound; exit 0 |
| Migration post-gates | Lint clean, every fixture item retained under its current ID, intent checkbox states preserved, no `specs/compositions/`, migration commits present and scratch working tree clean |
| Tarball hygiene ([release-17](../../specs/packages/release.md#release-17)) | `npm pack --dry-run --json -w packages/cli` lists 124 production files, with no test files or `src/` implementation sources |
| Live package/account behavior | Real CLI public and private installs and private publication passed; anonymous public access kept no credentials; registry/Space grants at one origin refreshed independently and wrong-purpose access was refused in five checks |
| Final local checks | Required pre-push passed: spec lint zero errors, both catalogs complete, workspace builds and e2e type checks; the existing `core-service-41` advisory remains |

No passing local full Core suite is claimed; the complete suites are CI's responsibility.
The server-seat package-install check ran on `0a58d44d`; final slow-provider namespace RPC and native selection were separately checked on `5bf0b6f2`, as recorded in the [app preparation](0.9.0-beta.19-preparation.md).

Protected receipts retained outside the repository are `spex-release-migration-0a58d44d.log`, `spex-release-pack-0a58d44d.json`, `spex-release-smoke-5bf0b6f2.log`, `spex-release-gates-final-2b8dabc7.json`, `live-client-proof/evidence.json`, `anonymous-proof.json` and `live-acceptance-manifest.json`.

## Publication

Pull request [#297](https://github.com/sublang-ai/spex/pull/297) and the exact release commit's full main CI must conclude successfully before tagging ([release-15](../../specs/packages/release.md#release-15)).
The normal Release workflow must validate the version, tests and tarball, publish through npm OIDC with provenance and public access, and create `Spex CLI v5.0.0` before publication is recorded as complete.
Neither a tag, an npm publication nor a successful final full main CI run is claimed by this preparation record.
