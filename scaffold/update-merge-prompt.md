<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Review Git diffs under @specs/ and perform a spec update merge:

- If @specs/decisions/000-spec-structure-format.md or @specs/meta.md changed, update existing @specs/ files to conform while preserving local content that still applies.
- Preserve every item ID and normative concern that appeared in a prior release; provisional IDs may be compacted before publication.
- Classify behavior relative to each package: outcomes and guarantees the package's users may rely on belong in `## External Behavior`; implementation hidden from them belongs in `## Internal Behavior`.
- Scope this merge to reconciling the template diff: do not restructure a legacy tree (a `user/`, `dev/`, `test/`, `items/`, `interactions/`, `compositions/`, or `iterations/` directory) into @specs/packages/ yourself — structural migration of a legacy generation belongs to the `spec-structure-migration` skill (`skills/spec-structure-migration/` in the spex repo; guide: `docs/spec-migration.md`).
- Convert every item citation to the enclosed ID-text form, e.g. `[[pack-3](pack.md#pack-3)]`, placed at the exact phrase that relies on, exercises, or checks the cited behavior.
- Remove relationship-metadata lines (`Verifies:`, `Binds:`, `Composes:`, `Clients:`, `Suppliers:`, `Scope:`) and detached `Verifies ...` sentences: weave each citation into the assertion it verifies, then delete the line.
- Keep each package's `## Intent` a self-contained prose statement without citations, and check each file's title still fits.
- Update @specs/map.md where the merge left its layout, tables, or summaries stale.
- Focus only on the update merge; do not refine unrelated spec content.
- Finish by running `spex lint` and resolving remaining errors; never restore removed trace lines to satisfy an older checker.
