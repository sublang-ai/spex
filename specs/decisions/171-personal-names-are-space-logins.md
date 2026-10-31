<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-171: Personal Names Are Space Logins

## Status

Accepted (2026-10-31) on the owner's direction to use the Space username consistently.
Amends [DR-120](120-the-instance-is-the-space.md) in member presentation: a member's personal name is their Space login alone.
Extends [DR-127](127-a-home-signed-in-to-several-instances.md) in personal attribution: the selected account's login supplies every new commit and intent author name.

## Context

The client presents member display names and prefers a saved personal display name for commits and newly captured intents.
An older home or a Space response may still hold such a name after the username becomes the person's only name in Space.
Historical attribution belongs to the captured record.

## Decision

- Members show their Space login as their personal name.
- New commits under a signed-in Space account use its login as the author and committer name, keeping the existing no-reply email rule and account selection.
- Newly captured intents use that account's login in both author fields, retaining the existing account selection and absence rules.
- Historical commit identities and captured intent author snapshots are preserved.
- Existing personal display-name fields remain compatible in API and stored data; no migration or purge is introduced.
- Space and package-registry service display names keep naming those services.

## Consequences

An older saved personal name cannot override the Space login for new attribution or member labels.
An offline edit or close of a historical queued intent preserves the author it captured.
