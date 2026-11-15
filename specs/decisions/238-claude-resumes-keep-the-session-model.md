<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-238: Claude Resumes Keep the Session Model

## Status

Accepted (2026-11-14) on the owner's direction.
Amends [DR-217](217-cligent-0-38-0-adoption-and-models-on-re-check.md) in Claude model selection on resume and the packaging acceptance contract.

## Context

A resumed conversation has already used a model.
Changing the provider default must not silently change that conversation's model.
An explicit model choice remains a request to switch it.

## Decision

- A Claude call with an omitted model resumes using the model the session used; an explicit model switches the session to that model.
- A fresh Claude call with an omitted model uses the current default.
- The native packaging gate verifies these cases against the installed runtime and SDK, including a changed settings default and an omitted selection after an explicit switch, while requiring every resume to preserve the session token.

A role’s provider-default primary selection clears the configured pin for its call.
Roles bound to the same player share its Claude conversation and therefore its recorded primary model.

## Consequences

Changing a default affects fresh conversations.
Continuing an existing conversation retains its model until an explicit selection changes it.
A runtime or SDK that violates either rule blocks native packaging.
