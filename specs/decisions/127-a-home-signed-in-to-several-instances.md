<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-127: A Home Signed In to Several Instances

## Status

Accepted (2026-10-20) on the owner's direction.
Amends [DR-008](008-native-shell-bridge.md), [DR-057](057-space-surface.md), [DR-103](103-the-home-and-its-groups.md), [DR-120](120-the-instance-is-the-space.md).
Amended by [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-150](150-spex-space-product-and-destination.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md), [DR-168](168-independent-package-registry.md), [DR-171](171-personal-names-are-space-logins.md), [DR-188](188-registry-sign-in-opens-the-browser.md), [DR-216](216-registry-and-space-accounts-stay-apart.md), [DR-221](221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner's direction: a person may hold records at more than one Space instance — the internal and the production instance today, an instance at JiHu GitLab [[1]] tomorrow — and must not need a home per instance.
- A home recorded one instance when it was created and used it alone thereafter; the credential store already kept one app token per instance URL.
- Keys and folders are paths in the instance ([DR-120](120-the-instance-is-the-space.md)). Two instances may both hold an account `acme`, and two instances may wrap one Git system and share its Git origin, as the internal and the production instance do, so that both list the repositories of a person's namespace there under one id, while two Git systems mint ids that collide.
- A clone recorded one remote, `origin`, and one id, and only a clone the host created or joined recorded an id.
- A key segment is spelled as the host spells a path — letters, digits, `.`, `_` and `-` — so `@` begins no segment of a path the host answers; at GitLab it is in no path, name or login either [[2]].
- A DNS host name holds no `_`.
- The core learns an instance's Git origin from a read of it and holds it for the run alone.
- Spex read the host only at sign-in, on Refresh and before a sync ([DR-103](103-the-home-and-its-groups.md)), so after a restart on a signed-in home Space read "Not read yet" until the reader pressed Refresh.
- When the host refused the device's token, Spex signed the device out and showed the card of a home never signed in, hiding that the host ended the sign-in and as whom.
- `home.yaml` marks an instance signed out with a boolean that every Spex reading the file validates, so a richer value would make an older Spex refuse the home.

## Decision

- Amends [DR-008](008-native-shell-bridge.md): the desktop's browser opener opens a sign-in URL at any instance being signed in to.

### Instances by their origin

- An instance is recorded by its origin: the scheme, the host in lowercase, and the port where it is not the scheme's default. A URL with a path, a query or a user, `http` on a host that is not loopback, a host holding `_` or a character outside a key segment's, or an origin whose folder equals a listed instance's, is refused. One entry stands per origin.
- `home.yaml` lists every instance the home has signed in to, each with its client, its account, its display name as last read, and its sign-out mark, and records the origin the home was created with, from the URL the core's environment names or the new-home default ([DR-150](150-spex-space-product-and-destination.md)).
  The home's **default instance** is the first entry in its list, or the recorded origin while the list is empty.
  An entry is added when a sign-in stores its token; the sign-in card takes the origin, prefilled with the default instance; a sign-in to a listed instance signs its entry in again, and as another account is refused.
  Sign out is per instance and keeps its entry; "Remove from this list" removes a signed-out entry while no clone is keyed under it, the global records repository's remote there renamed to a signed-in instance that lists the same host repository, else dropped; a home with no entry is as it was before any sign-in.
- The core keeps one client per instance; at most one sign-in runs at a time across them.

### Reading each instance

- Each signed-in instance is read at sign-in, on Refresh and once after a signed-in start, each read standing or failing on its own, so one instance's failure leaves the others' views.
- The read a signed-in start owes begins when a client first asks for the Space state and no read has begun since the start; that ask is answered with the state as it stands, and the read's outcome arrives as any read's does.
- Spex never reads an instance on a timer.
- When an instance signs the device out, Space says so on that instance's heading, naming the instance and the account the device was signed in as, and offers to sign in again.
- That the instance signed the device out is held for the core's run alone, until the next sign-in there; `home.yaml` keeps its boolean mark, so after a restart such an instance reads as any signed-out one.

### Keys name the instance

- An instance's folder is `@<host>`: its host in lowercase, with `_<port>` after it where the origin names a port or its scheme is `http`.
  Every spex repository at an instance lies under its folder, one in your namespace there at `workspace/@<host>/<login>/<name>-spex`; its key is its path under `workspace/`.
- The **personal records folder**, `workspace/<own>/`, holds the global records repository, `<own>-spex`, and the local-only clones, which have never been at an instance: it is the home's, outside every instance folder.
  Its name is this device's user name before the first sign-in and is derived from that instance's login after ([DR-221](221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md)); no later instance renames it.
- A clone's instance is the one whose folder its key lies in, and the global records repository's the one its remote names; a clone's remote is named by its instance's folder, with the host's id beside it, and a clone keyed under an instance keeps its key while it has no remote there.
  Choosing a Space for a clone under the personal records folder moves it under `@<host>/` at its path there in one rename at that moment; where a session lease beneath refuses the rename, the choice stands and the clone takes its instance from its remote until the next sync moves it.
  A transport for the clone, the sign-out a refused credential causes, and the clone's commit identity follow its instance, never the Git origin alone; a remote the reader named uses the device's own Git.
- A host repository is one by its Git origin and id, as each instance reports them to the core.
  Where two signed-in instances share a Git origin and both list one repository, it is one clone and one row, keyed under the instance through which it was first joined or created; while that instance is signed in, its answer alone governs the clone's path and moves, its read-only state and its unlisting, and the other instance's listing only suppresses opening it again.
  Where no clone exists yet, the row stands under the earliest of those instances in the home's list, and opening it keys it there.
  While the clone's instance is signed out and another signed-in instance lists the same host repository, the clone follows that instance: a Sync or a "Remove from this list" re-keys it under that instance's folder with its remote renamed, as a host's rename moves a clone, and proceeds with that instance; the global records repository renames its remote and keeps its folder.
- The Space state keys your namespace at an instance by instance and login.
- A project's instance is its spex repository's; an intent's author is the account at its project's instance ([DR-171](171-personal-names-are-space-logins.md)), and none for a project with no instance.
- Registry selection and credentials are independent of instances ([DR-168](168-independent-package-registry.md), [DR-216](216-registry-and-space-accounts-stay-apart.md)).

### The surface

- Local projects first; then each listed instance under its display name, its heading carrying the signed-in login and Sign out, the read's time and Refresh's outcome, and beneath it the account's personal projects there.
  An instance signed out keeps its heading with "Sign in again" and "Remove from this list", its rows unreachable unless another signed-in instance lists them; "Add a Space…" opens the sign-in card.
- Choosing a Space for a local project offers every signed-in instance; a repository created there is created in the account's namespace at that instance.

### Migration

- The instances migration runs once, as the former-layout migration does ([DR-103](103-the-home-and-its-groups.md)): under the root lease, leaving a receipt, each step verified, a restart finishing what remains without overwriting a divergent destination.
  `home.yaml` takes format 2, its host canonicalized to its origin, its credential re-keyed in the same step, kept as the recorded origin, and becoming the one entry where it holds an account; a host URL the origin rule refuses stops the migration naming it.
  Every clone that records a host id moves under `@<host>/` at its path there with its remote renamed to the folder and the id beside it, the global records repository renaming its remote and keeping its folder; every other clone outside the personal records folder moves under `@<host>/` at its key, keeping its remote; a clone under the personal records folder with no host id stays; each moved clone's pairs, session locations, sync preferences and exports are rewritten as a host's rename moves them.
  Each move is one rename, refused while a session lease beneath names a live writer; such a clone keeps its key and remote, is named in the receipt as the instance's, and syncs only after its move, which the next sync or the next start makes, whichever comes first.
- Nothing at any instance changes, so each device migrates on its own at its next start; an older Spex refuses a format-2 home, and there is no way back.

### Considered and declined

- A home per instance: the person's sessions and global records split by instance, and one project held at both would be two projects.
- Keys without the instance, the path alone: `acme` at two instances would share one folder and one key.
- The instance in the key only where a home holds more than one: a key that changes at the second sign-in.
- The URL as typed as an instance's identity: one instance twice, under two spellings.
- Your namespace's repositories under the personal records folder: a second instance's namespace would collide with the first's.
- A Spex-minted stable id in place of path keys: [DR-103](103-the-home-and-its-groups.md) declined a second identity beside the host's.
- A global records repository per instance: one home has one global records repository; it reaches each instance as a placement ([DR-128](128-a-spex-repository-placed-at-several-instances.md)).
- A clone's instance read from its remote: a clone may have no remote at its instance for a while, and its folder is where the reader finds it.
- A folder prefix a path may hold: it would collide with a path of that name; `@` begins no segment of a path the host answers.
- Sorting the migration's clones by the instance's Git origin: the core does not hold it at a start, while every clone the host created or joined records an id.
- A signed-out-by-host value in `home.yaml`: older Spex would refuse the home.

## Consequences

- A home may be signed in to the internal and the production instance at once, which is how a person moves between them: sign in to the second, place each project there ([DR-128](128-a-spex-repository-placed-at-several-instances.md)) or let a repository both list follow it, remove the first's placements, remove the first from the list.
- A restarted app shows each instance's personal projects without a Refresh, contacting each signed-in instance as soon as any surface first asks for the Space state.
- These specs change: `storage` for the tree, `home.yaml` format 2 with its default instance, the key form, the clone's instance and the migration; `git-host` for a client per instance, sign-in by origin, reads per instance, the credential by the clone's instance, the follow and the stand-in run as several instances, two of them over one Git backend; `space` for the headings, the personal projects per instance, choosing a Space, the rows a signed-out instance keeps reachable and the instance each command names; `projects` for pairing; `core-service` for an intent's author; `app-shell` for opening the browser at any instance being signed in to; the storage Git tool's documented command-line steps for the remote's name.
- Acceptance checks: two stand-in instances over one Git backend listing one repository in a namespace as one row, keyed under the first, following the second once the first is signed out, and the global records repository syncing with the second once the first is removed from the list; a local-only project synced to the second instance pushing through that instance; a clone outside the personal records folder with a remote the reader named migrated under its instance's folder; sign-out of one instance leaving the other's rows reachable, and a refused credential signing out its instance alone, named with its account; a signed-in start reading both on the first ask for the Space state, with one failing; a one-instance home migrated with its clones moved and their pairs and preferences following, the global records repository keeping its folder with its remote renamed, the local-only clones untouched, and a clone under a live session lease synced by its old path and moved at a later start; removal from the list refused while a clone is keyed under the instance.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/028-a-second-instance-at-jihu-gitlab.md "spex.pub DR-028 (proposed): A Second Instance at JiHu GitLab"
[2]: https://docs.gitlab.com/user/reserved_names/ "GitLab: reserved project and group names — the characters a name, a path and a username may hold"
