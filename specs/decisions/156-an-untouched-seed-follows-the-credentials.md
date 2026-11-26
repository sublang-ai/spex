<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-156: An Untouched Seed Follows the Credentials

## Status

Accepted (2026-10-26).
Amends [DR-154](154-the-seed-follows-playbooks-rule.md).
Amended by [DR-206](206-the-workshop-points-to-its-guide.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- A person often signs in to a second agent after Spex's first start, so a seed written once keeps agents chosen before that sign-in.
- A config the user has changed is theirs: rewriting it would undo their choice.

## Decision

- Amends [DR-154](154-the-seed-follows-playbooks-rule.md) in "nothing rewrites a seeded file afterwards": a seeded file no one has changed is rewritten when the credentials it was chosen from may have changed; a file changed in any byte is never rewritten again.
  The exclusive first create, the seed's text and its agreement with the `playbook` CLI under the same credentials and home stand.
- When the core seeds a config, it records on this device, outside every tracked file, the config's path and the version of the bytes it wrote.
- While the file stands at exactly the recorded version, the core reseeds it when the credentials may have changed — at its start and on each readiness request ([DR-206](206-the-workshop-points-to-its-guide.md)) — writing Playbook's seed for the environment and home then, where that text differs, as a versioned write, and recording the new version.
- When a check finds the file differs from the recorded version — edited in Settings, by hand, or by a sync — the record is dropped and the core never rewrites that file again, even once its bytes are back; a change undone between two checks goes unseen.
- The core reports a reseed as an update of the starter config for the current sign-ins, never as its creation.
- A config with no record — every config standing before this decision, and one another device seeded — is never rewritten.

## Consequences

- Signing in to a second agent and then re-checking or restarting Spex changes an untouched seed, so the Reviewer of a machine that gains Codex moves to Codex; a session already running keeps the agents it started with.
- An edit a check finds ends reseeding for that file, even if it is later undone.
- Upgrading Playbook can change the seed's text; an untouched seed then follows the new text at the next start, as a fresh install would write it.
