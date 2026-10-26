<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-156: An Untouched Seed Follows the Credentials

## Status

Accepted (2026-10-26) on the owner's direction for P0-2 on team servers.
Amends [DR-154](154-the-seed-follows-playbooks-rule.md) in "nothing rewrites a seeded file afterwards": a seeded file no one has changed is rewritten when the credentials it was chosen from change; a file changed in any byte is never rewritten again.
Amends [DR-132](132-team-servers.md) in "a seat's core reads that file into its process environment at start": the read, with the member's own credentials, comes before the seat seeds its config.
The exclusive first create, the seed's text and its agreement with the `playbook` CLI under the same credentials and home stand.

## Context

- A seat seeds your own group's config as its home opens, while the shared credential file and the member's own credentials are read into the environment only afterwards, so the seed sees neither.
- Playbook's rule now counts the token forms a team server hands out (`CODEX_ACCESS_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`) as credentials (Playbook DR-097), so a seed that sees them chooses from them.
- Teams commonly buy Codex alone; a seat seeded on Claude then fails its first run until the member re-points every agent by hand.
- A member who signs in with their own credential places it in their seat's Settings, which they can reach only after the seat has started and seeded; a machine of one's own likewise often signs in to a second agent after Spex's first start.
- A config the user has changed is theirs: rewriting it would undo their choice.

## Decision

- A seat reads its shared credential file and the member's own credentials into its environment before it seeds, so its first seed chooses from them.
- When the core seeds a config, it records on this device, outside every tracked file, the config's path and the version of the bytes it wrote.
- While the file stands at exactly the recorded version, the core reseeds it when the credentials may have changed — at its start, and on a seat when the member sets or removes an agent credential — writing Playbook's seed for the environment and home then, where that text differs, as a versioned write, and recording the new version.
- When a check finds the file differs from the recorded version — edited in Settings, by hand, or by a sync — the record is dropped and the core never rewrites that file again, even once its bytes are back; a change undone between two checks goes unseen.
- The core reports a reseed as an update of the starter config for the current sign-ins, never as its creation.
- A config with no record — every config standing before this decision, and one another device seeded — is never rewritten.
- A shared file the administrator replaces while a seat runs reaches the seat's runs at once, and its seed at the seat's next start.
  An administrator who switches the team's agent restarts the seats, so their untouched configs follow before they call the agent no longer signed in.

## Consequences

- A Codex-only team's seat starts on Codex; a member who places their own Codex credential in Settings finds their untouched config on Codex at once.
- Signing in to a second agent and restarting Spex changes an untouched seed, so the Reviewer of a machine that gains Codex moves to Codex; a session already running keeps the agents it started with.
- An edit a check finds ends reseeding for that file, even if it is later undone.
- Upgrading Playbook can change the seed's text; an untouched seed then follows the new text at the next start, as a fresh install would write it.
