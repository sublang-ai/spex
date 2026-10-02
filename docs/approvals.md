<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Approvals and human decisions

Spex uses different mechanisms for a tool waiting inside a running agent and a workflow waiting between turns:

| Request | How to answer | What the answer means |
| --- | --- | --- |
| A native tool permission, including an access-consent tool | **Tool approvals** → **Approve once** or **Deny** | One decision for the exact pending operation; its later result establishes execution. |
| A workflow choice, authorization, or request to perform a prerequisite | Reply to the Captain's question in the ordinary composer | The answer returns to the waiting workflow. The question survives reopening; asking Captain to explain it does not answer it. |
| A question in playbook authoring | Reply in the draft conversation | An ordinary conversational reply, not a typed workflow suspension or an answer to a running SDK form. |
| An operating-system or controlling application's own consent prompt | Answer in that operating system or application | A grant owned by that system; Spex cannot create or inherit it. |

Workflow questions can ask you to perform an external action and return when ready. Saying “done” is your acknowledgement; the working agent still needs to check the prerequisite before claiming access or completion. A workflow must actually emit its supported question outcome to wait: prose that resembles a question does not create a new permission, stop queued work, or replace the workflow's declared behavior. Inspect currently reports unavailable tools or evidence as an unavailable inspection; repair the prerequisite and request another inspection.

## Live tool approvals

When a supported agent asks for permission during a working call, Spex shows **Tool approvals** at the top of the app and a notice in the owning conversation or authoring draft. Review the named project or draft, actor, tool, action input, and native permission details. **Approve once** answers that one operation; **Deny** declines it. The normal conversation may remain busy while the request waits.

Approval does not guarantee that the agent executes the tool successfully. Its later tool result reports that outcome. Existing agent policy grants and denials apply before a request reaches Spex, so enabling browser tools does not mean every browser action asks again. Capability information in the agent editor describes the installed transport; an unsupported transport keeps its existing headless behavior.

Requests expire after at most ten minutes. Closing a browser page leaves its live core's requests available to other authenticated clients, and reopening that page recovers the pending list. Aborting the call, stopping the core, or finishing the invocation removes its authority. Historical transcript entries and restarting the core never recreate an approval. An answer retried before the request deadline plus thirty seconds is idempotent while it remains among the latest 2,048 answers; an older retry is refused, never executed again.

The mechanism is independent of application and tool names. For example, Claude MCP servers can expose a consent or access-grant tool with [`anthropic/requiresUserInteraction`](https://code.claude.com/docs/en/mcp#require-approval-for-a-specific-tool); Claude sends that request through its SDK permission callback even when ordinary tools are already admitted. Cligent forwards the native ask and Spex displays its actual scope. That is distinct from a consent prompt belonging to the application controlling Spex itself.

## Native input limits

The live inbox is a tool-permission interface, not a universal renderer for SDK dialogs. Native structured questions, selection forms, MCP elicitation, and URL authentication requests require their own typed responses. This release does not provide that typed answer transport; **Approve once** is not a form answer. Kimi may expose a question through a fallback permission request whose ambiguous choices admit only **Deny**. A native callback waiting inside a running call cannot be answered through a later Captain turn; cancelling it does not convert it into a durable workflow question. Authoring's queued text likewise cannot answer a waiting native form.

## Permissions owned elsewhere

The inbox answers agent tool requests. Other permission systems have different owners:

- A **Codex request to allow access to Spex** belongs to Codex's computer-use app access controls. Answer it in Codex. Spex cannot grant or reuse that consent.
- macOS **Accessibility, Automation, and Screen & System Audio Recording** apply to the application or helper that actually controls or captures the desktop. Follow that application's diagnostic and the named System Settings permission. A fresh Spex home or browser cache does not reset those grants, and Spex does not reset them.
- Spex's managed browser launches an isolated headless Chromium on the execution host. Its page screenshots do not grant access to unrelated desktop applications or require screen recording of the user's desktop. Browser setup errors name missing host prerequisites separately from tool approval.

For an external desktop tool, confirm its target application and requested operation in the tool's native details. A denied or unavailable OS or app-access grant remains a tool failure until that controlling application obtains the relevant grant; approving a Spex request cannot override it.
