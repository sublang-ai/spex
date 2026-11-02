<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-186: Unavailable Group Operations

## Status

Accepted (2026-11-02) on the owner's report that checking a group for deletion displayed an unrelated package-management error.
Amends [DR-064](064-honest-remote-failure.md) in the relay of a recognized missing-operation response and [DR-181](181-group-deletion-follows-the-space-policy.md) in the explanation of an unavailable deletion or restoration operation.

## Context

A newer app can request a group operation that the running Space does not yet provide.
An older Space routes that unknown request through its package-management fallback, so relaying its words suggests an unrelated action and misidentifies the missing operation as a missing group.

## Decision

- A recognized missing-operation response to a deletion check, deletion request or restoration states that the operation is unavailable at the named Space and directs the reader to its administrator.
- This classification preserves the group and offers no alternative destructive request.
- A genuine missing-group response or permission refusal retains its own explanation; a general HTTP failure alone does not prove that an operation is unsupported.

## Consequences

The app explains supported compatibility failures without sending the reader to package management or claiming the group is missing.
Integration coverage includes both older and explicitly classified missing-route responses, ordinary refusals, localization and unchanged group state.
