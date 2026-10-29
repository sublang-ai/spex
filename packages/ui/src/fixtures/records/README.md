<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Session records of a real `/dev` run on substitute agents, so the run
view's call matching (run-view-190, run-view-191) is checked against
the trace the runtime actually emits — parallel proposals, nested runs,
the order of a transition's records — and not only against streams
posed by hand.

- `develop-run.json`: `/dev Add a 404 page` deciding before it codes,
  the reviewer's proposal ending after the coder's.
- `develop-abort.json`: the same request, the Boss aborting while the
  reviewer's proposal runs and after the coder's came back.

Both come from the browser harness's `develop` option
(`developRunScript`, `@sublang/spex-core/testing`): the real Captain
shell and built-in playbooks, only provider replies substituted. Each
session's `history.get` records are kept with the Captain's own prompt
and event records dropped, strings past 240 characters cut, and the
scratch root's path read as `/scratch`.
