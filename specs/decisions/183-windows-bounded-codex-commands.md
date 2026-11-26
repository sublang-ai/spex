<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-183: Bounded Codex commands on native Windows

## Status

Accepted (2026-10-31); revised (2026-11-26).
Amended by [DR-167](167-the-compiler-shares-the-apps-engine.md).

## Context

- A real native Windows workflow reached the configured Codex role, but its read of package.json was rejected by the execution policy.
- A successful model reply did not establish a successful tool call.

## Decision

- On native Windows, Codex calls keep their declared file, shell, network and approval values; Spex neither disables sandboxing nor changes system policy, accounts, environment or credentials.
- Other platforms keep their existing configuration.
- Unavailable sandbox capability remains a refusal or setup prerequisite, never an unsandboxed fallback supplied by Spex.
- Configuration follows the official Windows sandbox [[1]] and permission profile [[2]] contracts.

## Consequences

- A Windows host still needs a usable native Codex sandbox.
- Unsupported capability remains visible; no configuration grants broader file or network access.
- Fresh installation and workflow evidence must establish support on the actual host: real Node and packaged Electron SDK calls, and a complete selected-scene execution and independent review on both platforms, for which a runtime smoke does not substitute.

## References

[1]: https://learn.chatgpt.com/docs/windows/windows-sandbox "Windows sandbox"
[2]: https://learn.chatgpt.com/docs/permissions "Permission profiles"
