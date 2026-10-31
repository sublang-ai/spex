<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-127: A Home Signed In to Several Instances

## Status

Amended by [DR-150](150-spex-space-product-and-destination.md) in the default origin for new homes: `https://spex.sublang.ai`; saved origins are unchanged.

Accepted (2026-10-20) on the owner's direction: a person may belong to groups at more than one spex.pub instance — the internal and the production instance today, an instance at JiHu GitLab [[1]] tomorrow — and must not need a home per instance.
Extended by [DR-128](128-a-spex-repository-placed-at-several-instances.md), which places one spex repository at several of a home's instances, and amended by it in your own group's sign-in, in one remote per clone and in Forget: your own group is placed at every instance the home signs in to, a clone holds a remote per placement, a code clone uses the broker of any signed-in placement's instance at the code's origin, and Forget refuses while a placement at the instance follows no signed-in instance, your own group's file rewritten or left.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-103](103-the-home-and-its-groups.md) in its tree, its concepts and its sign-in: the tree under `workspace/` holds every spex repository at an instance in a folder of that instance's own, your own group's own repository and the local-only clones staying in your own group's folder; `home.yaml` records every instance the home has signed in to and its default instance, and Spex consults each; your own group's repository is created or joined at the first sign-in and named after your login there, while its folder is named once.
- [DR-057](057-space-surface.md), as [DR-103](103-the-home-and-its-groups.md) amended it, in its remote's name: a clone's one remote is named by its instance's folder.
- [DR-120](120-the-instance-is-the-space.md) in its keys, its entries and rows, the list's head, its collisions and its Org-default consequence: a key and a folder name the instance before the path in it; a host repository is one by its Git origin and id, whichever instances list it, its clone keyed under one of them and following another that lists it while that one is signed out; the Groups state keys its entries by instance and id, your namespace at an instance by instance and login; each instance's heading carries what the list's head carried; a group collides with a login only within its instance, the collision with your own group's folder name dropped; the Org default matches the key without its instance segment against the orgs of the project's instance.
- [DR-114](114-groups-and-sharing-from-spex.md) in "New group" at the head of the groups list: at the head of each instance's groups, a root group made at that instance.
- [DR-106](106-groups-after-a-restart-and-a-host-sign-out.md) in the read at a signed-in start: once per signed-in instance, each standing or failing on its own.
- [DR-104](104-spec-package-format-and-client-environments.md) in requests from the registry, in Git sources and in publishing: a resolution asks the registry of the environment's instance, the home's default instance where the environment has none; an install fetches from the environment's instance or from the registry its lock records, whichever serves the locked checksum; a Git source at a signed-in instance's Git origin uses that instance's broker; a publish goes to the project's instance, or the default instance, as that instance's account.
Amended by [DR-132](132-team-servers.md) in your own group's creation or join at the first sign-in: not on a seat.
Amended by [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in an environment's instance: the one its `spex.yaml` names as `space`, else the home's default instance.

Amended by [DR-168](168-independent-package-registry.md) for independent registry selection, account authority and credentials; Space collaboration and server admission remain unchanged.

## Context

- A home records one instance when it is created and uses it alone thereafter; the credential store already keeps one app token per instance URL.
- Keys and folders are paths in the instance ([DR-120](120-the-instance-is-the-space.md)). Two instances may both hold a group at `acme`, and two instances may wrap one Git system and share its Git origin, as the internal and the production instance do, so that both list the repositories of a person's namespace there under one id, while two Git systems mint ids that collide.
- The Groups state keys its entries by the host's group id, an id at one Git system; a clone records one remote, `origin`, and one id, and only a clone the host created or joined records an id.
- A key segment is spelled as the host spells a path — letters, digits, `.`, `_` and `-` — so `@` begins no segment of a path the host answers; at GitLab it is in no path, name or login either [[2]].
- A DNS host name holds no `_`.
- The core learns an instance's Git origin from a read of it and holds it for the run alone.
- The person moving from the internal to the production instance holds projects at both while the move lasts.

## Decision

### Instances by their origin

- An instance is recorded by its origin: the scheme, the host in lowercase, and the port where it is not the scheme's default. A URL with a path, a query or a user, `http` on a host that is not loopback, a host holding `_` or a character outside a key segment's, or an origin whose folder equals a listed instance's, is refused. One entry stands per origin.
- `home.yaml` lists every instance the home has signed in to, each with its client, its account, its display name as last read, and its sign-out mark, and records the origin the home was created with, from the URL the core's environment names or `https://spex.pub`.
  The home's **default instance** is the first entry in its list, or the recorded origin while the list is empty.
  An entry is added when a sign-in stores its token; the sign-in card takes the origin, prefilled with the default instance; a sign-in to a listed instance signs its entry in again, and as another account is refused.
  Sign out is per instance and keeps its entry; "Forget" removes a signed-out entry while no clone is keyed under it, your own group's remote there renamed to a signed-in instance that lists the same host repository, else dropped; a home with no entry is as it was before any sign-in.
- The core keeps one client per instance; at most one sign-in runs at a time across them.
- At sign-in, on Refresh and once at a signed-in start, each signed-in instance is read, each read standing or failing on its own, so one instance's failure leaves the others' views.
- Your own group's own repository is created or joined at the first sign-in, as `<login there>-spex` in your namespace there, and stays at that instance; a later sign-in creates nothing for it; after its remote is dropped, the next sign-in creates or joins it there.

### Keys name the instance

- An instance's folder is `@<host>`: its host in lowercase, with `_<port>` after it where the origin names a port or its scheme is `http`.
  Every spex repository at an instance lies under its folder: a group's at `workspace/@<host>/<group path>/<name>-spex`, one in your namespace there at `workspace/@<host>/<login>/<name>-spex`, and one in another account's namespace likewise under that login; its key is its path under `workspace/`.
- Your own group's folder, `workspace/<own>/`, holds your own group's own repository, `<own>-spex`, and the local-only clones, which have never been at an instance: it is the home's, outside every instance folder.
  Its name is this device's user name before the first sign-in and that instance's login after, and no later instance renames it.
- A clone's instance is the one whose folder its key lies in, and your own group's own repository's the one its remote names; a clone's remote is named by its instance's folder, with the host's id beside it, and a clone keyed under an instance keeps its key while it has no remote there — a group's repository before the host creates it, or one whose remote the reader removed or replaced.
  A pick or a join of a clone under your own group's folder moves it under `@<host>/` at its path there in one rename at that moment; where a session lease beneath refuses the rename, the pick stands and the clone takes its instance from its remote until the next sync moves it.
  A transport for the clone, the sign-out a refused credential causes, and the clone's commit identity follow its instance, never the Git origin alone; a remote the reader named uses the device's own Git, as today; a project's code clone uses the broker of its project's instance, only where the code's origin is that instance's Git origin.
- A host repository is one by its Git origin and id, as each instance reports them to the core.
  Where two signed-in instances share a Git origin and both list one repository, it is one clone and one row, keyed under the instance through which it was first joined or created; while that instance is signed in, its answer alone governs the clone's path and moves, its read-only state, its unlisting, its members, its abilities and Share, and the other instance's listing only suppresses Join.
  Where no clone exists yet, the Join row stands under the earliest of those instances in the home's list, and Join keys it there.
  While the clone's instance is signed out and another signed-in instance lists the same host repository, the clone follows that instance: a Sync or a Forget re-keys it under that instance's folder with its remote renamed, as a host's rename moves a clone, and proceeds with that instance; your own group's own repository renames its remote and keeps its folder.
- The Groups state keys a group's entry by instance and id, your own group by `own`, your namespace at an instance and another account's by instance and login; a colliding row's key names its instance and stays apart from every clone's key.
  A listed group collides where its path equals, ignoring case, your login at that instance or another login that instance lists, or lies beneath one; the collision with your own group's folder name goes.
- A project's instance is its spex repository's; the Org default of New playbook matches the key without its instance segment against the orgs the registry lists for the project's instance; an intent's author is the account at its project's instance, and none for a project with no instance.
- An environment's instance is its spex repository's, your own group's the one its own repository's remote names; a local-only project's has none.
  A resolution asks the registry of the environment's instance, or the default instance's where it has none, with that instance's token where the home is signed in to it and none otherwise, and keeps a package's recorded registry where it reproduces the same version and checksum; the built-in lock records the registry it was resolved at; an install fetches each package from the environment's instance with its token, else from the registry its lock records with that instance's token where the home is signed in to it, else from any signed-in instance, accepting whichever serves the locked checksum; a search from the library names the environment it adds to; a Git source at a signed-in instance's Git origin uses that instance's broker, the environment's own instance preferred; a publish goes to the project's instance, or the default instance where the project has none, as that instance's account, "Sign in to publish" naming it.
  The registry refusing an instance's token signs out that instance alone.

### The surface

- Your own group first; then each signed-in instance under its display name, its heading carrying "Signed in as @<login>" and Sign out, "New group" or "Groups are made by the people who run <display name>" as that instance's read says, the read's time and Refresh's outcome, and beneath it its groups, read as the list reads them today, and your namespace there headed by your login, holding its rows other than your own group's own repository.
  An instance signed out keeps its heading with "Sign in again" and Forget, its rows unreachable unless another signed-in instance lists them; "Add instance…" at the list's foot, bearing "Another instance" as its title and accessible name, opens the sign-in card.
- Pick a group offers every signed-in instance's groups and your namespace there, each under its instance; a repository created in one is created at that instance.
  Move offers only the groups at the row's instance and your namespace there.
- A member is added, and a group made, renamed or deleted, at the instance that lists it; a root group is made at the instance whose heading carries "New group".

### Migration

- The instances migration runs once, as the groups migration does: under the root lease, leaving a receipt, each step verified, a restart finishing what remains without overwriting a divergent destination.
  `home.yaml` takes format 2, its host canonicalized to its origin, its credential re-keyed in the same step, kept as the recorded origin, and becoming the one entry where it holds an account; a host URL the origin rule refuses stops the migration naming it.
  Every clone that records a host id moves under `@<host>/` at its path there with its remote renamed to the folder and the id beside it, your own group's own repository renaming its remote and keeping its folder; every other clone outside your own group's folder moves under `@<host>/` at its key, keeping its remote; a clone under your own group's folder with no host id stays; each moved clone's pairs, session locations, sync preferences and exports are rewritten as a host's rename moves them.
  Each move is one rename, refused while a session lease beneath names a live writer; such a clone keeps its key and remote, is named in the receipt as the instance's, is listed under that instance's heading by its old path, and syncs only after its move, which the next sync or the next start makes, whichever comes first.
- Nothing at any instance changes, so each device migrates on its own at its next start; an older Spex refuses a format-2 home, and there is no way back.

### Considered and declined

- A home per instance: the person's sessions and own group split by instance, and a project with people at both sides would be two projects.
- Keys without the instance, the path alone: `acme` at two instances would share one folder and one key.
- The instance in the key only where a home holds more than one: a key that changes at the second sign-in.
- The URL as typed as an instance's identity: one instance twice, under two spellings.
- Your namespace's repositories under your own group's folder: a second instance's namespace would collide with the first's.
- A Spex-minted stable id in place of path keys: [DR-103](103-the-home-and-its-groups.md) declined a second identity beside the host's, and the tree stays browsable by group.
- Your own group per instance: one home has one own group, what you add for yourself ([DR-103](103-the-home-and-its-groups.md)); it reaches each instance as a placement ([DR-128](128-a-spex-repository-placed-at-several-instances.md)).
- A clone's instance read from its remote: a clone may have no remote at its instance for a while, and its folder is where the reader finds it.
- A folder prefix a path may hold: it would collide with a group of that name; `@` begins no segment of a path the host answers.
- Sorting the migration's clones by the instance's Git origin: the core does not hold it at a start, while every clone the host created or joined records an id.
- An install bound to the registry its lock records: a member signed in to another instance of the same registry could not install a private package, and a retired instance would fail every install.

## Consequences

- A home may be signed in to the internal and the production instance at once, which is how a person moves between them: sign in to the second, place each project there ([DR-128](128-a-spex-repository-placed-at-several-instances.md)) or let a repository both list follow it, remove the first's placements, forget the first.
- These specs change: `storage` for the tree, `home.yaml` format 2 with its default instance, the key form, the clone's instance and the migration; `git-host` for a client per instance, sign-in by origin, reads per instance, the credential by the clone's instance, the follow and the stand-in run as several instances, two of them over one Git backend; `space` for the header, the headings, the entries, your namespace per instance, the pick, the move, the collision rule, the rows a signed-out instance keeps reachable and the instance each command names; `projects` for pairing and the code clone's broker; `environments` for the registry by instance, the default instance, the install's two registries, the Git source's broker and publishing; `playbook-library` for the Org default and "Sign in to publish"; `core-service` for an intent's author; `app-shell` for opening the browser at any instance being signed in to; the storage Git tool's documented command-line steps for the remote's name.
- Acceptance checks: two stand-in instances with a group `acme` at each, their repositories under distinct keys and folders; two stand-in instances over one Git backend listing one repository in a namespace as one row, keyed under the first, following the second once the first is signed out, and your own group's own repository syncing with the second once the first is forgotten, its environment resolving and publishing there; a local-only project picked into a group at the second instance pushing through that instance; a clone outside your own group's folder with a remote the reader named migrated under its instance's folder; sign-out of one instance leaving the other's rows reachable, and a refused credential signing out its instance alone; a signed-in start reading both with one failing; a one-instance home migrated with its clones moved and their pairs and preferences following, a project in your namespace and a group's not-yet-created repository among them, your own group's own repository keeping its folder with its remote renamed, the local-only clones untouched, and a clone under a live session lease synced by its old path and moved at a later start; a private package locked at one stand-in instance installed by a home signed in only to another instance of the same registry; a group named like a login colliding at its instance alone; Pick a group creating at the chosen instance; Forget refused while a clone is keyed under the instance.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/028-a-second-instance-at-jihu-gitlab.md "spex.pub DR-028 (proposed): A Second Instance at JiHu GitLab"
[2]: https://docs.gitlab.com/user/reserved_names/ "GitLab: reserved project and group names — the characters a name, a path and a username may hold"
