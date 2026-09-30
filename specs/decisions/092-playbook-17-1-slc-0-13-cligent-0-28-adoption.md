<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-092: Playbook 17.1, slc 0.13 and Cligent 0.28 Adoption

## Status

Accepted (2026-09-29).
Amends [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md) in its floors alone: the core requires `@sublang/playbook` `^17.1.0` and `@sublang/cligent` `^0.28.0`, and both shells declare `@sublang/slc` `^0.13.0`; everything else DR-088 decided stands.
Amends [DR-090](090-readiness-names-what-cligent-finds-missing.md) in its Cligent floor alone, now `^0.28.0`; the readiness it decided stands.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule for the compiler and [DR-024](024-app-supplied-agent-runtimes.md)'s app-supplied agent runtimes; nothing either decided changes.
Completes [DR-091](091-models-named-by-the-runtime.md), whose model descriptions, default model and reported model this Cligent release reports.
Amended by [DR-093](093-a-players-subagent-model.md) in its floors alone: Cligent `^0.29.0` and Playbook `^17.2.0`.

## Context

- Cligent 0.28 reports each Claude and Codex model's `description`, the available catalog's `defaultModel`, and `init`'s `reportedModel`, each where the runtime reports it [[1]], which [DR-091](091-models-named-by-the-runtime.md)'s surfaces now receive.
- Cligent 0.28's supported runtime floors are the oldest releases serving the latest models its providers offer [[2]]: Claude Agent SDK `>=0.3.284`, the first carrying Claude Sonnet 5.5; Codex `>=0.156.1`; OpenCode `>=1.18.29`; Gemini CLI `>=0.61.0`.
- Cligent 0.28 refuses an older runtime at load and in its availability probe, naming the installed and required versions [[1]].
- Cligent 0.28's tested targets are Claude Agent SDK 0.3.284, Codex 0.159.0, Gemini CLI 0.61.0, Kimi Code 2.1.1 and OpenCode 1.18.33 [[1]].
- The shells declare the agent SDKs at `*`, so the lockfile alone decides the release an install runs, and it held Codex 0.153.4 and OpenCode 1.18.23.
- Playbook 17.1 seeds `claude-opus-5-5` and `gpt-6-sol`, its starter template names `claude-opus-5-5`, and it requires Cligent `^0.28.0` [[3]].
- slc 0.13 adopts Playbook 17.1 and Cligent 0.28, so a compile links the app's own engine and the compiler nests no engine or Cligent of its own [[4]].
- slc 0.13 changes no vendored definition relative to what Playbook 17 shipped.

## Decision

- **Floors.** The core requires `@sublang/cligent` `^0.28.0` and `@sublang/playbook` `^17.1.0`; both shells declare `@sublang/slc` `^0.13.0`.
- **The lock.** The lockfile is regenerated from the public registry, with no links or overrides, and holds one Playbook, 17.1.0, and one Cligent, 0.28.0, both at the tree's root.
- **Agent SDKs.** The SDKs both shells declare at `*` are locked at the releases Cligent 0.28 tests: `@anthropic-ai/claude-agent-sdk` 0.3.284, `@openai/codex-sdk` 0.159.0 with the `@openai/codex` 0.159.0 it pins, and `@opencode-ai/sdk` 1.18.33.

Considered and declined:

- keeping the SDKs where the lockfile held them: Cligent 0.28 refuses Codex 0.153.4 and OpenCode 1.18.23 at load, so every Codex and OpenCode run would fail before it starts;
- declaring SDK ranges narrower than `*`: Cligent owns the supported floors and enforces them at load ([DR-024](024-app-supplied-agent-runtimes.md)), so the lock pins the tested release without a second copy of the floors.

## Consequences

- Where the runtime reports them, a fresh install lists each Claude and Codex model with its own description, names the model the provider default runs, and reads each chip's reported model ([DR-091](091-models-named-by-the-runtime.md)).
- A fresh Spex home's starter configuration names `claude-opus-5-5`, as the app's own seeds do.
- An install holding an agent SDK older than Cligent's floor reads that adapter not ready, with Cligent's verdict and the repair for its install tree ([DR-090](090-readiness-names-what-cligent-finds-missing.md)); the app's own lock never supplies one.
- The compiler's nested engine, which DR-088 recorded trailing the app's, is gone: a compile links the app's engine, and the engine check has one engine to agree with.

## References

[1]: https://github.com/sublang-ai/cligent/blob/main/CHANGELOG.md "Cligent changelog: 0.28.0"
[2]: https://github.com/sublang-ai/cligent/blob/main/specs/decisions/027-latest-models-oldest-serving-runtime.md "Cligent DR-027: Latest models on the oldest serving runtime"
[3]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/074-seeds-name-the-latest-models.md "Playbook DR-074: Seeds name the latest models"
[4]: https://github.com/sublang-ai/slc/blob/main/CHANGELOG.md "slc changelog: 0.13.0"
