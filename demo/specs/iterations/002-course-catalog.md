<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-002: Course Catalog

## Goal

Admins shape and publish courses; everyone browses them.
Lands the CAT package and the admin-bootstrap composition on the
skeleton of IR-001.

## Deliverables

- [ ] Course, section, and lesson storage with explicit ordering and slugs (CAT)
- [ ] Public course list, course pages, and lesson views (CAT)
- [ ] Admin course manager: create, structure, publish (CAT)
- [ ] Draft isolation at the data-access layer (CAT)
- [ ] Admin-bootstrap acceptance green (BOOT)

## Tasks

1. Add the schema migration for courses, sections, and lessons with explicit positions and slugs.
2. Implement the public course list and course pages over published data only.
3. Implement lesson views with the media area left as an unbound slot.
4. Implement the course manager: creation as empty-state primary action, syllabus editing, confirmation on section removal.
5. Implement publish and unpublish, wired to list visibility and not-found masking.
6. Enforce draft isolation in the data-access layer for non-admin reads.
7. Stand up the CAT verification suite and the BOOT acceptance tests.

## Acceptance criteria

- CAT-13 through CAT-16 pass.
- BOOT-3 and BOOT-4 pass against a fresh preview deployment.
