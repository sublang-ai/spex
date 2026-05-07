<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

I just ran `spex scaffold --update`. The command printed file indicators above.
Any framework file marked `(updated)` now has the bundled version in my working
tree, with its prior version in HEAD.

Review the diffs. If section headings or requirement IDs changed in updated
framework files, update citations across specs/ (DRs, IRs, items, map.md) to
match. If I had local extensions in DR-000, reapply them on top of the new
content. Stop and ask if framework intent is ambiguous; don't guess.
