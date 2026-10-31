<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-132: Team Servers

## Status

Accepted (2026-10-21) on the owner's direction: a group shares a Linux server that runs Spex for its members, each in an OS account of their own, admitted by the group's live membership through the instance (spex.pub DR-029 [[1]]), with the administrator's agent sign-ins shared across the server; one desktop controls projects there and here at once ([DR-133](133-one-desktop-over-several-cores.md)); execution is owned per runtime ([DR-134](134-execution-ownership.md)); a seat whose lease lapsed while no hub ran is stopped by the service manager's sweep by [DR-148](148-a-lapsed-seat-is-stopped-by-a-sweep.md).
Amended by [DR-156](156-an-untouched-seed-follows-the-credentials.md): a seat reads the shared file and the member's own credentials before it seeds its config, and an untouched seed follows them.
Amended by [DR-159](159-projects-in-groups-opened-where-you-work.md) in "A client presents a ticket": every admission mints a bearer of its own, those of the person's earlier admissions standing while the lease lasts; and in "The helper creates the account on first admission": the account is made without the host's login skeleton, and one bound covers the whole admission — the account, the unit and the seat's socket — which the client's wait exceeds.
Amended by [DR-164](164-the-seat-signs-in-on-its-ticket.md) in "A seat signs in to the instance through the device flow": the seat's request carries the ticket its member's client presented beside the server and the person, and the instance may grant it without its page.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-033](033-remote-gui-serving.md) in "a single-user deployment" and "one token, in the URL": a server is N single-user shells, one per member's OS account, behind one hub that admits a bearer in a header and no token in a URL; the single-user shell on a machine of one's own stands.
- [DR-103](103-the-home-and-its-groups.md) in "Spex adds no access control", in your own group's sign-in and in "What lives where": a seat holds one piece of access state, the execution lease the instance granted; a seat's own group is server-local and joins no repository at the instance; a seat's home holds a `projects/` tree.
- [DR-127](127-a-home-signed-in-to-several-instances.md) in "your own group's own repository is created or joined at the first sign-in", and [DR-128](128-a-spex-repository-placed-at-several-instances.md) in placing your own group at every instance: not on a seat.
- [DR-004](004-config-and-persistence.md) in its credentials and readiness, and [DR-036](036-file-state-store.md) in "forge auth stay with their own tools": on a seat the core reads the shared credential file into its environment before each run, readiness recognizes the injected forms, and a code host's token the member places is kept under `local/`.

Amended by [DR-168](168-independent-package-registry.md) for independent registry selection, account authority and credentials; Space collaboration and server admission remain unchanged.

## Context

- The server shell is one home, one core, one handshake token, one user ([DR-033](033-remote-gui-serving.md)); the core admits one lease holder per home ([DR-036](036-file-state-store.md)), and Playbook's machine identity is per OS user and state folder ([DR-108](108-the-root-lease-names-the-machine.md)).
- Every agent adapter inherits the core's process environment at spawn and none takes a per-run environment; readiness checks an API key variable or a home folder's existence, and no adapter probes a credential.
- Each agent keeps its sign-in under its own state folder and refreshes it in place: Claude Code refreshes its sign-in and rewrites `.credentials.json` owner-only [[2]]; Codex rotates its refresh token and its documentation forbids one `auth.json` across concurrent jobs [[3]]; Kimi Code locks refreshes per home and rewrites owner-only [[4]]; OpenCode and Gemini CLI write back in place.
  So a credential file shared or copied between accounts breaks at the first refresh, and a shared state folder mixes every member's transcripts.
- Three agents offer a form of a sign-in that nothing refreshes: Claude Code's long-lived token from `claude setup-token`, read from `CLAUDE_CODE_OAUTH_TOKEN` [[2]]; Codex's access token, read from `CODEX_ACCESS_TOKEN` [[5]]; OpenCode's `OPENCODE_AUTH_CONTENT`, for entries holding no refresh token [[6]].
  Gemini CLI and Kimi Code offer none: Gemini's consumer sign-in no longer serves its CLI and its enterprise sign-in refreshes in place [[7]]; Kimi Code's shareable credential is a membership key, not a sign-in [[8]].
- The vendors' terms bound sharing: Anthropic's say an account may not be shared and that third parties may not intermediate claude.ai credentials, allowing an API key in a machine image for a customer's own users [[9]]; Codex access tokens exist on Business and Enterprise workspaces and name their creator [[5]].
- Under Claude Code's precedence the environment token outranks a sign-in made in the agent's own folder [[2]].
- A service manager starts a unit as a named account from a template, reads its environment from a file, refuses an all-numeric account name, and at stop signals the unit's main process and then kills what remains of its control group at a timeout [[10]].
- App releases are source-only ([DR-040](040-source-only-app-releases.md)).
- The owner's requirements: OS accounts per member; shared agent sign-ins, not keys substituted for them, with members' processes allowed to read them; the desktop as the client, the browser deferred; groups governing admission, record visibility and session sharing with no server member list; code anywhere, its access the member's own, set up through the IDE; existing Git signing honored; a lease renewed while work runs and a bounded stop at expiry; a trusted administrator, said in the contract of spex.pub DR-029 [[1]].

## Decision

### A server and its seats

- A **server** runs one **hub** and one **seat** per admitted member.
  A seat is an OS account named from the member's permanent Git host id, holding its own Spex home, Playbook state folder, agent state folders and project clones; one server shell per seat, started by the service manager as that account, with its handshake token read from a file the hub and the account alone can read, listening where the hub alone reaches it.
- The hub is the server's one public process, unprivileged: it terminates TLS, holds the server token and id of spex.pub DR-029 [[1]], redeems tickets, starts and stops seats through a helper the service manager's policy confines to fixed arguments, keeps each seat's lease across its own restarts, and forwards HTTP and WebSocket frames to the seat.
  The helper creates the account on first admission, starts and stops its unit, and nothing else.
- A client presents a ticket to the hub in a request body and receives the seat's endpoint, a bearer and the lease expiry; the bearer is valid while the lease lasts and void when the seat stops; it is presented in the `Authorization` header by a core relaying for a desktop ([DR-133](133-one-desktop-over-several-cores.md)), with no `Origin`; the hub admits no other client until the browser client is decided.
- Members choose no server path, log in to no shell on the server and administer nothing; the administrator installs, attaches by pasting the server's id and token once, as a group Owner registered them at the instance, and runs `status`, `evict` and `retire` on the server.

### The seat's home

- A seat signs in to the instance through the device flow, naming the server and the person the hub admitted, as spex.pub DR-029 has it [[1]]; a device approved as another account is refused and stores nothing.
  Its own group is server-local: it joins no `<login>-spex` at the instance and syncs none, and its settings hold what each player runs on, which is a fact of the server, while a project's settings still name its playbooks and players.
  The member's own records never land on the server.
- Opening a group project on the seat allocates `projects/@<host>/<group path>/<repository>/` under the seat's home, `<repository>` being the spex repository's own path name with its `-spex` kept — so that no project's folder can lie inside another's, as `acme/alpha-spex` and `acme/alpha/x-spex` would with the suffix dropped — clones the records, and clones the code from the remote the records name.
- A code remote at the instance clones with the brokered credential; a public remote with none; any other with a credential the member placed in the seat's Settings, shown for its place, a token for that host kept under the seat's `local/` with owner-only permissions and used for every transport to that host.
  A clone that fails leaves the project and its synced records visible, says why, and names the credential needed; the administrator's credentials are never used for a member's code.
- Commits a seat makes to a project's code follow the seat account's Git configuration, signing included, as on any device; Spex sets no signing key and disables no signing, and a member places a signing setup in their seat as any credential.

### Shared agent sign-ins

- The administrator signs in each agent once, on the server, and places the sign-in's unrefreshed form in a file owned by root and readable by the seats' group: `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code, `CODEX_ACCESS_TOKEN` for Codex, `OPENCODE_AUTH_CONTENT` for OpenCode with entries holding no refresh token.
  An agent whose sign-in has no such form, Gemini CLI and Kimi Code today, is set by each member in their own seat's Settings; a key the administrator may offer for them is a later exception, not this record's.
- A seat's core reads that file into its process environment at start and before each agent run, so a replaced form reaches the next run without a restart; a running agent process keeps the form it started with.
- No credential file or state folder is shared or linked between accounts; each member's transcripts and resume ids stay in their own account; nothing refreshes a shared form, so no rotation races.
- Where a member has set a credential of their own for an agent in their seat, the core leaves the shared form for that agent out of the run's environment, so the member's own wins whatever the agent's precedence.
- Readiness on a seat recognizes the injected forms, runs the agent's own status command with the run's environment where one exists, and reports a shared form unreadable or expired apart from "not signed in".
- Spex carries the shared forms into members' runs; the vendors' terms on that are the administrator's to hold a plan for, and the contract of spex.pub DR-029 tells the member that agents run on the administrator's sign-ins [[1]].

### Boundaries

- The group governs: admission by spex.pub DR-029 [[1]]; who sees a project's records and sessions by the members of its records, as [DR-103](103-the-home-and-its-groups.md) has it; no member list of the server's own.
- Each seat is a runtime of [DR-134](134-execution-ownership.md): a session created or an intent captured there runs there.

### Lifecycle

- The hub renews each seat's lease at the instance with the server token every 30 minutes while a client is connected to the seat or a turn runs on it, the desktop connected or not, the seat telling the hub only whether a turn runs; a refusal ends the lease at once, and 60 minutes without a successful read ends it.
- At the lease's end, on `evict`, on `retire` and on the server's shutdown, the hub stops the seat's unit: the service manager signals the core, whose graceful stop of [DR-134](134-execution-ownership.md) runs within the unit's stop timeout, and then kills what remains of the seat's control group; the seat's files stand.
- A member removed from the group loses the seat at its next renewal; their account and files stand until the administrator removes them.
- `retire` stops every seat, deletes the app token and the code-host tokens under each seat's `local/`, and forgets the server token; the server's record and its seat devices are revoked by an Owner of its group with Retire at the instance [[1]]; homes stand otherwise.
- A seat's Playbook machine identity lives under its own state folder, so a seat stopped mid-turn restores its own session at its next start.

### Considered and declined

- Containers, or a second spawner: outside the initial scope; the service manager's accounts and control groups give the isolation and the bounded kill.
- One OS account for every member: a member's agent could read every other member's files and credentials.
- Sharing or linking an agent's credentials file or state folder: broken by rotation and by owner-only rewrites, and transcripts mixed.
- A per-run environment in the adapters: the core rewrites its own environment before a run instead, and the adapters need no change.
- A key substituted where a sign-in has an unrefreshed form, or for Gemini CLI and Kimi Code: the owner's direction keeps the sign-in.
- The seat renewing its own lease: its processes are the member's, so its word cannot end the member's own access.
- A browser client, single consent, signing infrastructure, a server identity for records, a credential-hiding proxy and a relay: later records.

## Consequences

- The server shell gains seat mode, a token file and a device label; a hub program joins the server shell; both are installed from a source release by one script, as [DR-040](040-source-only-app-releases.md) keeps releases source-only; the core gains seat mode, the environment re-read, the readiness forms, the code-host tokens and the clone-failure reading.
- These specs change: `server-shell` for seat mode and the token file; `core-service` for seat sign-in, the environment re-read and the readiness forms; `settings` for the readiness rules and the member's credentials; `git-host` for the device request naming the server and the person; `space`, `storage` and `projects` for the projects tree on a seat and a code host's credential; a new `hub` package for the hub, the helper and the unit.
- Acceptance checks, on a real Linux server with two members: two seats run the same agent at once on the shared sign-in, each in its own account with its own transcripts, past the form's own access lifetime, with no write to the shared file and neither run signed out; the administrator replaces the form and each seat's next run uses it while a running process finishes on the old one; an expired form is reported as expired, apart from "not signed in"; a member's own credential in their seat wins; a seat whose lease the instance refuses stops within the bound with its files intact and its uncertain session restorable at its next start; a member removed from the group loses the seat at the next renewal; a project whose code clone fails shows its records with the cause and the credential needed; a commit on a seat carries the account's configured signature; the bearer appears in no URL.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/029-team-servers.md "spex.pub DR-029 (proposed): Team Servers"
[2]: https://code.claude.com/docs/en/authentication "Claude Code authentication: credential storage, precedence, and the long-lived token from setup-token"
[3]: https://learn.chatgpt.com/docs/auth/ci-cd-auth "Codex CI/CD authentication: auth.json refresh and one file per runner"
[4]: https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/env-vars.html "Kimi Code: KIMI_CODE_HOME, shared credential files and model variables"
[5]: https://learn.chatgpt.com/docs/enterprise/access-tokens "Codex access tokens: workspace plans, validity and CODEX_ACCESS_TOKEN"
[6]: https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/auth/index.ts "OpenCode auth: OPENCODE_AUTH_CONTENT replacing the credentials file for reads"
[7]: https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals "Gemini Code Assist for individuals: Login with Google no longer serves Gemini CLI"
[8]: https://www.kimi.com/help/kimi-code/third-party-agents "Kimi Code: membership API keys for third-party agents"
[9]: https://code.claude.com/docs/en/legal-and-compliance "Claude Code legal and compliance: account sharing and machine-image API keys"
[10]: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html "systemd.service: template units, User=, EnvironmentFile=, KillMode= and TimeoutStopSec="
