<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-238: Claude Resumes Keep the Session Model

## Status

Accepted (2026-11-14) on the owner's direction; native selection boundary clarified 2026-11-15.
Amends [DR-217](217-cligent-0-38-0-adoption-and-models-on-re-check.md) in Claude model selection on resume and the packaging acceptance contract.
Amends [DR-032](032-session-players.md), [DR-051](051-runtime-held-for-a-turn.md), [DR-067](067-tuning-for-one-conversation.md) and [DR-068](068-an-agents-settings-where-the-agent-is.md) in the meaning of an omitted Claude primary model.
Amends [DR-091](091-models-named-by-the-runtime.md) in how Claude's unpinned primary reads in conversation and binding editors.

## Context

A provider's response can name a model differently from the selection sent to it.
A response name is not a lossless record of an alias, routing policy or context-window selection.
Claude Code already owns resumed selection, with documented launch-override and provider exceptions [[1]].

## Decision

- An omitted Claude primary is forwarded without a model override, on fresh and resumed calls; no transcript lookup reconstructs a selection from service response names.
- Under ordinary API routing with no launch override, native resume normally continues the saved model despite a changed user `settings.model`; a fresh call reads that settings default.
- An explicit model requests a switch; `ANTHROPIC_MODEL` also outranks native restoration at launch.
- Native policy remains authoritative: deployment-ID providers including Bedrock, Google Cloud and Foundry resolve through their configured precedence rather than transcript restoration, and retired or disallowed saved models can fall back [[1]].
- The native packaging gate checks settings-default changes, a service reply naming a different model, explicit switches and a launch environment override, requiring resume-token continuity throughout.
- The gate establishes no general guarantee for every alias or context-window variant.

A role’s provider-default primary selection clears the configured pin for its call.
Roles bound to one player continue sharing its provider conversation across nested playbooks.
Clearing official model pins does not reset an existing conversation or select the catalog's fresh-default model for it.
Claude conversation and role-binding editors therefore keep the Provider default wording without appending that catalog model; the repair control describes clearing pins, and agent chips continue reporting the actual runtime model.

## Consequences

The current configuration format and role-tuning precedence remain unchanged.
Continuity is native behavior within the stated boundary, not a Spex guarantee that overrides provider settings.
Only the gate's isolated cases block packaging; a provider exception is not treated as a broken runtime.

## References

[1]: https://code.claude.com/docs/en/model-config#setting-your-model "Claude Code model selection and resume exceptions"
