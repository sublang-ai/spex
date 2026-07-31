<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-026: Spec Structure Alignment

## Status

Done

## Intent

Align every spec tree — `specs/`, `demo/specs/`, and the scaffold's non-normative files — with the accepted rewrite of [DR-000](../decisions/000-spec-structure-format.md) and `meta.md`: packages-only layout, basename item IDs, bracket-enclosed citations, and the new record formats.

## Deliverables

- [x] `specs/meta.md` and `specs/decisions/000-spec-structure-format.md` carry the scaffold rewrite
- [x] Scaffold packages, map, the seeded sample intent record, and prompt assets conform; `compositions/` is gone
- [x] `specs/packages/` uses basename IDs and enclosed citations, with the three composition files folded in
- [x] `specs/` DRs and IRs follow the new record formats; `map.md` reflects the new layout
- [x] `demo/` specs, records, map, and guides migrated the same way
- [x] zh overlay resynced to the rewritten `meta.md` with refreshed source pins

## Tasks

1. Record this intent and sync `specs/meta.md` plus DR-000 from the scaffold.
2. Align scaffold packages, map, the seeded sample intent record, and prompt assets.
3. Migrate `specs/packages/` files and fold the three composition files in.
4. Restructure `specs/` DRs and IRs; rewrite `specs/map.md`.
5. Migrate the `demo/` tree.
6. Resync the zh overlay and its drift check.
7. Sweep every tree for dangling anchors and leftover old-law forms.

## Verification

- No link under `specs/`, `demo/specs/`, or `scaffold/specs/` resolves to a missing file or anchor.
- No ALLCAPS item ID and no `compositions/` path remains outside historical commit references.
- Every package file carries the sections of [[meta-15](../meta.md#meta-15)] in order; every record carries the sections of [[meta-4](../meta.md#meta-4)] or [[meta-5](../meta.md#meta-5)].
