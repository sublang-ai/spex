<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-023: Runtime Compatibility from Cligent

## Status

Accepted.
Amended by [DR-024](024-app-supplied-agent-runtimes.md).

## Context

- `packages/core` declared the agent SDKs directly — `@anthropic-ai/claude-agent-sdk` ^0.3.154 and `@openai/codex-sdk` ^0.139.0 — so that npm would place them where the nested cligent copy resolves them at run time.
- A caret on a `0.x` version pins the minor, so `^0.139.0` admitted nothing past 0.139.x. The declaration froze Codex in place, and a current model failed the session with `The 'gpt-5.6-sol' model requires a newer version of Codex`. Every consumer carrying its own SDK range had the same defect.
- The set was also incomplete on its own terms: `opencode` is a valid adapter ([DR-019](019-inline-agent-configuration.md)), yet `@opencode-ai/sdk` was never declared, so an opencode player hit the failure the direct declarations existed to prevent.
- `@sublang/cligent` publishes the agent runtimes it supports — each adapter's runtimes, supported floors, tested versions, and pinned repairs — and enforces those floors inside the loaders its availability probe and its `run()` share.
  `@sublang/playbook` declares no agent SDK and derives its preflight from cligent's descriptor.
- Spex never names an SDK module. `packages/core/src/session.ts` imports only `@sublang/cligent/tmux-play`, and the adapter names in `protocol.ts` are string identifiers. Tests substitute a fake adapter for the whole layer, so the declarations were load-bearing for installation alone, never for compilation.

## Decision

- `packages/core` declares no agent SDK in any dependency field.
- Which SDK versions an adapter supports is cligent's to publish and enforce. Spex states no range of its own: a second copy can only drift, and drifting is exactly what froze Codex. Spex keeps adapter *identifiers*, never module specifiers.

## Consequences

- A cligent upgrade alone moves Spex's compatibility policy, and no Spex change is forced by a vendor SDK release.
- Supplying the SDKs for live and packaged runs is an app-shell concern rather than a core-dependency one: the shells supply them ([DR-024](024-app-supplied-agent-runtimes.md)), and a missing runtime surfaces in readiness and in a live session, where cligent reports it with the exact install command for it.
- No three-way version drift between Spex, Playbook, and cligent: one declaration governs, and it ships with the package that loads the runtime.
