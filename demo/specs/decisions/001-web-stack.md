<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Web Stack

## Status

Accepted

## Context

One small deployable, built and maintained by one developer with
AI assistance.
Gated content must never depend on client-side hiding
([SHELL-6](../packages/site/web-shell.md#shell-6),
[CAT-12](../packages/catalog/course-catalog.md#cat-12)), which
favors a server-rendered stack.

## Decision

- Next.js with the App Router, TypeScript in strict mode.
- Server components by default; mutations via server actions;
  no separate API service.
- Tailwind CSS for styling; shadcn/ui as the owned component
  kit — components are vendored into the repo, one in-repo kit
  and token set.
- Native HTML5 video element for playback; no player framework.

## Consequences

- Session- and role-dependent markup resolves on the server,
  grounding [SHELL-6](../packages/site/web-shell.md#shell-6) and
  [CAT-12](../packages/catalog/course-catalog.md#cat-12).
- One build artifact deploys everywhere
  ([DELIV](../packages/ops/delivery.md)).
- The component kit lives in the repository: design changes are
  commits, not dependency upgrades.
