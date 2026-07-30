<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-002: Course Catalog

## Status

In progress

## Intent

Admins shape and publish courses; everyone browses them.
Lands the course-catalog package and the admin-bootstrap composition on the skeleton the first iteration built.

## Deliverables

- [ ] Course, section, and lesson storage with explicit ordering and slugs (course-catalog)
- [ ] Public course list, course pages, and lesson views (course-catalog)
- [ ] Admin course manager: create, structure, publish (course-catalog)
- [ ] Draft isolation at the data-access layer (course-catalog)
- [ ] Admin-bootstrap acceptance green (admin-bootstrap)

## Tasks

1. Add the schema migration for courses, sections, and lessons with explicit positions and slugs.
2. Implement the public course list and course pages over published data only.
3. Implement lesson views with the media area delegated to the deployment's media provider, presenting as no media until the video pipeline lands.
4. Implement the course manager: creation as empty-state primary action, course details, syllabus editing, confirmations on section removal and course deletion.
5. Implement publish and unpublish, wired to list visibility and not-found masking.
6. Enforce draft isolation in the data-access layer for non-admin reads.
7. Stand up the course-catalog verification suite and the admin-bootstrap acceptance tests.

## Verification

- [[course-catalog-13](../packages/catalog/course-catalog.md#course-catalog-13)] through [[course-catalog-16](../packages/catalog/course-catalog.md#course-catalog-16)] pass.
- [[admin-bootstrap-3](../packages/admin-bootstrap.md#admin-bootstrap-3)] and [[admin-bootstrap-4](../packages/admin-bootstrap.md#admin-bootstrap-4)] pass against a fresh preview deployment.
