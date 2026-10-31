<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CLI 5.0.0 source preparation

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
