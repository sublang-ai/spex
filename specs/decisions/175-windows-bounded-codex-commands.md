# DR-175: Bounded Codex commands on native Windows

## Status

Accepted (2026-10-31). Extends [DR-177]\1 in the supplied Agent runtime, without adding application business rules.

## Context

A real native Windows workflow reached the configured Codex role, but its read of package.json was rejected by the execution policy. A successful model reply did not establish a successful tool call. On the tested Windows 11 build, native MXC allowed reads and rejected writes; Windows PowerShell 5.1 failed to initialize inside that boundary, while cmd.exe read the same fixture successfully.

## Decision

- The pinned Cligent snapshot uses the Codex SDK's native configuration to prefer a compatible MXC backend for bounded Windows calls, subject to host capabilities and managed requirements.
- Its native developer instructions describe the available Windows command shell and require preserving the declared permissions and failed-command evidence. No application-specific workflow instruction is added to Spex.
- File, shell, network and approval values remain unchanged. The adapter neither disables sandboxing nor changes system policy, accounts, environment or credentials.
- Other platforms keep their existing configuration. Unavailable sandbox capability remains a refusal or setup prerequisite, never an unsandboxed fallback supplied by Spex.
- The published dependency is unchanged until an upstream release contains and verifies the fix; the validation snapshot records the base archive, compiled replacement and hashes.

## Consequences

A Windows host still needs a usable native Codex sandbox. Unsupported capability remains visible; no configuration grants broader file or network access. Fresh installation and workflow evidence must establish support on the actual host.

## Verification

The validation uses real Node and packaged Electron SDK calls, unpredictable file-read output, and a native read-only write rejection. Workflow acceptance additionally requires GitHub installation and a complete selected-scene execution and independent review on both platforms; a runtime smoke does not substitute for it.

Configuration follows the [official Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox) and [permission profile](https://learn.chatgpt.com/docs/permissions) contracts.
