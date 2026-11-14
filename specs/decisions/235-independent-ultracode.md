<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-235: Independent Ultracode

## Status

Accepted (2026-11-14).
Amends [DR-019](019-inline-agent-configuration.md), [DR-052](052-runtime-model-options.md) and [DR-067](067-tuning-for-one-conversation.md) in the treatment of Claude's workflow setting in agent, role and conversation tuning.
Amends [DR-084](084-the-block-is-the-whole-compiler-agent.md) to compiler agent selection.

## Context

Claude Code can request dynamic workflows at any reasoning effort supported by the selected model [[1]].
An existing Claude configuration can request the older combined choice with `effort: ultracode`.
Codex has a separate reasoning effort named `ultra`.

## Decision

- An explicit boolean `ultracode` selects the workflow setting independently of effort at the Captain, player, role and conversation scopes, under the existing tuning precedence.
- Omission inherits the lower scope and ultimately the SDK default. The existing Claude shorthand still requests xhigh with workflows on, with an explicit boolean taking precedence for workflows.
- Offer the independent control only where the installed runtime and launcher carry it, with a standing incompatible choice available for correction. A catalog identifying a model without xhigh precludes enabling it there. Missing model metadata leaves the SDK to decide availability.
- Where the independent control is available, fresh effort choices contain only reasoning levels. Older installations retain their existing choices and reject an explicit Claude switch they cannot apply.
- The compiler receives the resolved setting when the app supplies its agent.

## Consequences

Existing configurations run without conversion.
A reader can change the workflow setting without pinning reasoning effort, including when resuming a conversation.
Claude Code applies model and workflow policy to the request [[1]].

## References

[1]: https://code.claude.com/docs/en/model-config#adjust-effort-level "Claude Code model configuration"
