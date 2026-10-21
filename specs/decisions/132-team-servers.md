<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-132: Team Servers

## Status

Proposed (2026-10-21) on the owner's direction: a group shares a Linux server that runs Spex for its members, each in an OS account of their own, admitted by the group's live membership through the instance (spex.pub DR-029 [[1]]), with the administrator's agent sign-ins shared across the server; one desktop controls projects there and here at once ([DR-133](133-one-desktop-over-several-cores.md)); execution is owned per runtime ([DR-131](131-execution-ownership.md)).
Proposes to amend, under [DR-046](046-decision-record-evolution.md):

- [DR-033](033-remote-gui-serving.md) in "a single-user deployment" and "one token, in the URL": a server is N single-user shells, one per member's OS account, behind one hub that admits a bearer in a header and no token in a URL; the single-user shell on a machine of one's own stands.
- [DR-103](103-the-home-and-its-groups.md) in "Spex adds no access control" and in your own group's sign-in: a seat holds one piece of access state, the execution lease the instance granted; a seat's own group is server-local and joins no repository at the instance.
- [DR-127](127-a-home-signed-in-to-several-instances.md) in "your own group's own repository is created or joined at the first sign-in": not on a seat.
- [DR-024](024-app-supplied-agent-runtimes.md) in readiness: a seat's readiness recognizes a credential the server injects.

## Context

- The server shell is one home, one core, one handshake token, one user ([DR-033](033-remote-gui-serving.md)); the core admits one lease holder per home ([DR-036](036-file-state-store.md)), and Playbook's machine identity is per OS user and state folder ([DR-108](108-the-root-lease-names-the-machine.md)).
- Every agent adapter inherits the core's process environment at spawn and none takes a per-run environment; readiness checks an API key variable or a home folder's existence, and no adapter probes a credential.
- Each agent keeps its sign-in under its own state folder and refreshes it in place: Claude Code rotates its refresh token under a per-folder lock and rewrites `.credentials.json` owner-only [[2]] [[3]]; Codex's refresh tokens are single-use and its documentation forbids one `auth.json` across concurrent jobs [[4]]; Kimi Code locks refreshes per home and rewrites owner-only [[5]]; OpenCode and Gemini CLI write back in place.
  So a credential file shared or copied between accounts breaks at the first refresh, and a shared state folder mixes every member's transcripts.
- Each agent offers a form of a sign-in or credential that nothing refreshes: Claude Code's long-lived token from `claude setup-token`, read from `CLAUDE_CODE_OAUTH_TOKEN` [[2]]; Codex's access token, read from `CODEX_ACCESS_TOKEN` [[6]]; OpenCode's `OPENCODE_AUTH_CONTENT` [[7]]; Gemini CLI's `GEMINI_API_KEY` or a service-account key [[8]]; Kimi Code's membership key read from `KIMI_MODEL_*` [[9]].
- The vendors' terms bound sharing: Anthropic's say an account may not be shared and that third parties may not intermediate claude.ai credentials, allowing an API key in a machine image for a customer's own users [[10]]; Codex access tokens exist on Business and Enterprise workspaces and name their creator [[6]].
- A service manager starts a unit as a named account from a template, reads its environment from a file, and kills the unit's whole control group at stop [[11]].
- The owner's requirements: OS accounts per member; shared agent sign-ins, not keys substituted for them, with members' processes allowed to read them; the desktop as the client, the browser deferred; groups governing admission, record visibility and session sharing with no server member list; code anywhere, its access the member's own; a lease renewed while work runs and a bounded stop at expiry; a trusted administrator, said in the contract of DR-029 [[1]].

## Decision

### A server and its seats

- A **server** runs one **hub** and one **seat** per admitted member.
  A seat is an OS account named by the member's permanent Git host id, holding its own Spex home, Playbook state folder, agent state folders and project clones; one server shell per seat, started by the service manager as that account from a template unit, with its handshake token read from a file the hub and the account alone can read, listening on loopback or a Unix socket.
- The hub is the server's one public process, unprivileged: it terminates TLS, holds the server token of DR-029 [[1]], redeems tickets, starts and stops seats through a helper the service manager's policy confines to fixed arguments, keeps each seat's lease, and forwards HTTP and WebSocket frames to the seat.
  The helper creates the account on first admission, starts and stops its unit, and nothing else.
- A client presents a ticket to the hub and receives the seat's endpoint, a bearer and the lease expiry; the bearer is presented in the `Authorization` header by a core relaying for a desktop ([DR-133](133-one-desktop-over-several-cores.md)), with no `Origin`; the hub admits no other client until the browser client is decided.
- Members choose no server path, use no shell on the server and administer nothing; the administrator installs, attaches by pasting the server token once, and runs `status`, `evict` and `retire` on the server.

### The seat's home

- A seat signs in to the instance through the device flow, naming the server, as DR-029 has it [[1]]; its own group is server-local: it joins no `<login>-spex` at the instance and syncs none, and its settings hold what each player runs on, which is a fact of the server, while a project's settings still name its playbooks and players.
  The member's own records never land on the server.
- Opening a group project on the seat allocates `projects/<group path>/<name>/` under the seat's home, clones the records, and clones the code from the remote the records name.
- A code remote at the instance clones with the brokered credential; a public remote with none; any other with a credential the member placed in the seat through the IDE, a token for that host kept under the seat's `local/` with owner-only permissions.
  A clone that fails leaves the project and its synced records visible, says why, and names the credential needed; the administrator's credentials are never used for a member's code.

### Shared agent sign-ins

- The administrator signs in each agent once, on the server, and places the sign-in's unrefreshed form in a file owned by root and readable by the seats' group: `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code, `CODEX_ACCESS_TOKEN` for Codex, `OPENCODE_AUTH_CONTENT` for OpenCode, `GEMINI_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` for Gemini CLI, `KIMI_MODEL_*` for Kimi Code.
  An agent whose plan offers no such form is set by each member in their own seat.
- A seat's core reads that file into its process environment at start and before each agent run, so a replaced token reaches the next run without a restart; a running turn keeps the token it started with.
- No credential file or state folder is shared or linked between accounts; each member's transcripts and resume ids stay in their own account; nothing refreshes a shared credential, so no rotation races.
- A credential a member sets in their own seat outranks the shared one where the agent's precedence says so.
- Readiness on a seat recognizes the injected forms, runs the agent's own status command with the run's environment where one exists, and reports a shared credential unreadable or expired apart from "not signed in".
- The vendors' terms on sharing a sign-in are the administrator's: Spex checks nothing of them and the contract of DR-029 says whose authority a seat runs under [[1]].

### Boundaries

- The group governs: admission by DR-029 [[1]]; who sees a project's records and sessions by the members of its records, as [DR-103](103-the-home-and-its-groups.md) has it; no member list of the server's own.
- Each seat is a runtime of [DR-131](131-execution-ownership.md): a session or intent captured there runs there.

### Lifecycle

- The seat's core renews the lease at the instance every 30 minutes while a client is connected or a turn runs, the desktop connected or not; a refusal, or 60 minutes without a successful read, ends the lease.
- At the lease's end, on `evict`, on `retire` and on the server's shutdown, the hub stops the seat's unit: the core's graceful stop of [DR-131](131-execution-ownership.md) runs within the unit's stop timeout, then the service manager kills the control group; the seat's files stand.
- A member removed from the group loses the seat at the next renewal; their account and files stand until the administrator removes them.
- `retire` revokes at the instance, stops every seat and shreds each seat's credentials file; homes stand.
- A seat's Playbook machine identity lives under its own state folder, so a seat stopped mid-turn restores its own session at its next start.

### Considered and declined

- Containers, or a second spawner: outside the initial scope; the service manager's accounts and control groups give the isolation and the bounded kill.
- One OS account for every member: a member's agent could read every other member's files and credentials.
- Sharing or linking an agent's credentials file or state folder: broken by rotation and by owner-only rewrites, and transcripts mixed.
- A per-run environment in the adapters: the core rewrites its own environment before a run instead, and the adapters need no change.
- A key substituted where a sign-in has an unrefreshed form: the owner's direction keeps the sign-in.
- A browser client, single consent, signing infrastructure, a server identity for records, a credential-hiding proxy and a relay: later records.

## Consequences

- The server shell becomes installable, with seat mode, a token file and a device label; a `spex-hub` package joins `apps/`; the core gains seat mode, the environment re-read, the readiness forms and the clone-failure reading.
- These specs change: `server-shell` for seat mode and the token file; `core-service` for seat sign-in, the environment re-read and the readiness forms; `settings` for the readiness rules; `git-host` for the device request naming the server and the lease renewal; `space` and `storage` for the projects root on a seat and a code host's credential; a new `hub` package for the hub, the helper and the unit.
- Acceptance checks, on a real Linux server with two members: two seats run the same agent at once on the shared sign-in, each in its own account with its own transcripts; the administrator replaces the token and each seat's next run uses it while a running turn finishes on the old one; a member's own credential in their seat wins; a seat whose lease the instance refuses stops within the bound with its files intact and its uncertain session restorable at its next start; a member removed from the group loses the seat at the next renewal; a project whose code clone fails shows its records with the cause and the credential needed; the bearer appears in no URL.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/029-team-servers.md "spex.pub DR-029 (proposed): Team Servers"
[2]: https://code.claude.com/docs/en/authentication "Claude Code authentication: credential storage, precedence, and the long-lived token from setup-token"
[3]: https://github.com/anthropics/claude-code/issues/54443 "Claude Code: concurrent sessions racing on a rotating refresh token"
[4]: https://learn.chatgpt.com/docs/auth/ci-cd-auth "Codex CI/CD authentication: auth.json refresh and one file per runner"
[5]: https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/env-vars.html "Kimi Code: KIMI_CODE_HOME, shared credential files and model variables"
[6]: https://learn.chatgpt.com/docs/enterprise/access-tokens "Codex access tokens: workspace plans, validity and CODEX_ACCESS_TOKEN"
[7]: https://opencode.ai/docs/config/ "OpenCode configuration: credentials from the environment and a managed config"
[8]: https://geminicli.com/docs/get-started/authentication/ "Gemini CLI authentication: API key and service-account credentials"
[9]: https://www.kimi.com/help/kimi-code/third-party-agents "Kimi Code: membership API keys for third-party agents"
[10]: https://code.claude.com/docs/en/legal-and-compliance "Claude Code legal and compliance: account sharing and machine-image API keys"
[11]: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html "systemd.service: template units, User=, EnvironmentFile= and KillMode=control-group"
