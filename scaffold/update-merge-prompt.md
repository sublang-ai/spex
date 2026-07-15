<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Review Git diffs under @specs/ and perform a spec update merge:

- If @specs/decisions/000-spec-structure-format.md or @specs/meta.md changed, update existing @specs/ files to conform while preserving local content that still applies.
- Mechanical migration already merged legacy user/dev/test files into @specs/packages and rewrote citations it could resolve; fix only what it reports or `spex lint` flags: leftover legacy-path citations, duplicate section anchors, out-of-place sections.
- In each merged package file, rewrite the concatenated ## Intent paragraphs into one statement, and check the file's title still fits.
- Update @specs/map.md summaries where the merge left them stale.
- Focus only on the update merge; do not refine unrelated spec content.
- Finish by running `spex lint` and resolving remaining errors.
