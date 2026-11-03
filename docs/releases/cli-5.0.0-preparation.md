<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI 5.0.0 release preparation

## Publication receipt — 2026-11-03

CLI 5.0.0 is published on npm as `@sublang/spex`, with `latest` selecting 5.0.0.
The immutable `cli-v5.0.0` tag names release candidate `a78876405978b4b0ac5116de66adfe6b3125aaeb`, merged through PR349 before publication.
The publication date is November 3; the November 2 changelog date records preparation.

| Evidence | Outcome |
| --- | --- |
| Exact-tag full CLI validation | [Release run 41600218767](https://github.com/sublang-ai/spex/actions/runs/41600218767) succeeded on the tagged commit: Linux and macOS on Node 22 and 24, Windows on Node 22, and the final `checks` gate all passed; app-only journeys, native browser acceptance and the hub lane were skipped as the CLI validation plan requires |
| npm publication | The same run built and inspected the tagged package, matched its version, then published publicly using OIDC trusted publishing and provenance; no static npm token or validation waiver was used |
| Release page | [Spex CLI v5.0.0](https://github.com/sublang-ai/spex/releases/tag/cli-v5.0.0) was published at `2026-11-03T08:08:09Z` |
| Registry identity | npm reports version and `latest` as 5.0.0, with tarball integrity `sha512-+kw9Lhg9c2R7k4F+6wB/xJSXrtnS0xcJKUg/4E5OiHHxW16Wyyyz3QzJBM5Ut3xG1pu7eD3GbxEC3d0joJUg6g==` |
| Published consumer | An unversioned `npm install -g @sublang/spex` using an empty cache and an isolated prefix installed 5.0.0; its executable passed version, export help, scaffold, lint, export, add-by-path and list, and placed the test skill under `.agents/skills/` |

The first immediate consumer install received 4.2.0 while npm was still processing the publication; it is retained as an initial observation, not the successful consumer result.
The subsequent empty-cache install and executable journeys passed against 5.0.0.
Consumer evidence: `/tmp/spex-npm-5.0.0-consumer-verified.log`; the initial observation is `/tmp/spex-npm-5.0.0-consumer.log`.
The isolated successful installation is `/tmp/spex-npm-consumer.N2GCwR`.
This receipt changes no release product, changelog, package, tag or published artifact; preparation and source evidence remain below.

## Publication preparation — 2026-11-02

The owner requested the first npm publication of CLI 5.0.0.
The registry check found `latest` at 4.2.0 and no 5.0.0 publication or tag.
The following source-preparation evidence is historical; the release gates below are run again for this publication.
The first 5.0.0 changelog includes the standalone package manager and every later CLI change on main, including `spex export`, provided spec placement and portable Git line endings.
The CLI and getting-started documentation now use `npm install -g @sublang/spex`.

| Gate | Publication result |
| --- | --- |
| Full working-tree build | Passed on base `5ebabf229008d1591ce04d724dee3cf80a292a9c`; release documentation was being updated |
| Automated smoke | Passed on committed candidate `ddcf16d099b03dec6255703149ef881fef610977`: build 19s, lint 3s, fresh install 2m40s, packed CLI user journeys 8s; desktop/server startup and native-module restoration passed |
| Live migration smoke | Passed with packed CLI 5.0.0 and signed-in Claude: lint clean, every fixture item and checkbox state retained, compositions removed and migration committed |
| Tarball inspection | Passed: 130 runtime files, no tests or unnecessary implementation source; every declared export and scaffold law present |
| CLI suite | Passed: 220 tests in 17 suites, no failures or skips, Node 25.5.0; supported Node/platform validation remains the tag workflow's gate |
| Prepush | Passed; spec lint has zero errors and the existing `core-service-41` sentence warning |
| Full tagged CLI validation | Required by the tag workflow before npm publication |

The migration packed the unchanged product code from base `5ebabf22` while release documentation was being prepared; candidate `ddcf16d0` changes only the README, getting-started, changelog and this record.
The smoke used a fresh clone and empty npm cache, launching both shells against an isolated home.
No gate is waived.
An initial restricted CLI test run encountered npm-cache and local-listener permission failures; a later run raced a build removing `dist`.
The stable unrestricted rerun passed all 220 tests after the build finished.
Local evidence: `/tmp/spex-cli-5.0.0-smoke.log`, `/tmp/spex-cli-5.0.0-migration.log`, `/tmp/spex-cli-5.0.0-independent-tests-stable.log`, `/tmp/spex-cli-5.0.0-independent-pack.json` and `/tmp/spex-cli-5.0.0-prepush.log`.

## Historical source preparation

The standalone CLI and independent registry architecture are delivered as merged, verified source. No version was released in this architecture task: no CLI tag, npm publication or post-publication consumer run was performed. The package version remains release preparation; publication belongs to a separate release task.

## Scope

[DR-165](../../specs/decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md) makes the CLI the standalone package manager and supplies the shared library. Environments keep their manifest, lock and ignored `.spex/` installation at the working root; developed packages live at `spex-packages/<org>/<pkg>/`. The prepared major version removes attached `auth`, `project` and `package` groups, `--server`, `SPEX_SERVER_URL`, endpoint discovery and arbitrary deep imports; `spex new` replaces `spex package init`.

[DR-168](../../specs/decisions/168-independent-package-registry.md) separates registry and Space configuration and grants, including same-origin refresh/logout. New manifests select the public registry; legacy private sources and locked versions, checksums and provenance are preserved. Private installation and publishing require the performing machine's registry grant. See the [CLI changelog](../../packages/cli/CHANGELOG.md) and [README](../../packages/cli/README.md).

## Verification

| Evidence | Outcome |
| --- | --- |
| Merged source | PR297 merged as `b60aad125a2e08c1c84557e96760b3443ad3a2c5` |
| Required PR CI | All six checks passed on final PR head `b79a77657cb18917520aa7a722ae51241ec4a556`: [run 41185921075](https://github.com/sublang-ai/spex/actions/runs/41185921075) |
| Installed live smoke | Exact b79 clean-cache clone passed build, lint, native desktop/server, packed CLI fresh-user and upgrade journeys, and real Claude dispatch/output/abort/cleanup |
| Merge equivalence | b60 product/build/lock/README/smoke/live/migration inputs match smoked b79; only six CI/audit/spec files differ; changed workflow audit passed 10/10 and spec lint passed |
| Working-folder migration | All 53 targeted Core cases verified as 51 initial passes and two corrected-fixture passes; three integrated browser journeys passed. These cover working-root configuration and recoverable migration journals; no clean full local Core rerun is claimed |
| Seat sign-in copy | [PR300](https://github.com/sublang-ai/spex/pull/300) merged as `61463a48dd9a1ade2ff8639ec217de85332a272c`; the card now states registry access is separate from Space sign-in. Existing bilingual UI tests passed 18/18, required prepush passed, and [required CI](https://github.com/sublang-ai/spex/actions/runs/41189986306) passed before normal merge |
| Main CI | The linked [run 41189131805](https://github.com/sublang-ai/spex/actions/runs/41189131805) records the full platform matrix for the merged revision |
| Real migration | Signed-in Claude migrated the legacy fixture with packed CLI 5.0.0 and its printed prompt on `0a58d44d`: exit 0, lint clean, every fixture item and checkbox state retained, compositions removed and a clean committed scratch tree |
| Migration equivalence | 42 operative migration inputs are byte-identical through b60; the static help correction does not change the operative entrypoint. Old packed and new built CLI printed byte-identical migration prompts |
| Package inspection | Final b79 dry pack contains 124 production files, no tests or unnecessary implementation source; local SHA-1 `1eaf444a3137b869249e3ce360381846480c4fe7` identifies that inspection, not a published package |

Real CLI public/private installation, private publishing, anonymous public access and purpose-separated refresh/refusal checks passed against the deployed services. The seat walk used `0a58d44d`; native namespace/directory acceptance used `5bf0b6f2`; final installed and journal checks used b79. Older live evidence is not claimed as later migration coverage.

Historical package states, checksums and user records were preserved. Temporary credentials, seats and browser sessions were cleaned up with version-attributed protected receipts. Completed owned smoke clones were removed only after retaining hashed logs and screenshots; recovery evidence is retained.

Protected evidence basenames: `spex-release-merge-target-b60aad12.json`, `spex-release-migration-0a58d44d.log`, `prompt-equivalence.json`, `spex-release-pack-b79a7765.json`, `spex-release-smoke-b79a7765.log`, `live-acceptance-manifest.json`, and `cleanup-receipt.json`. Future publication follows the applicable release rules.
