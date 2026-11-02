<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-176: Global Playbooks, and a Placed Playbook Runs

## Status

Accepted (2026-11-02) on the owner's direction, after a design review of the project's Playbooks tab that started from one row: a built-in under "Enabled" wearing "Personal" and offering "Enable for ⟨project⟩" — one fact said three ways, two of them global acts on a project page.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-172](172-surfaces-a-fresh-user-reads.md) in its map, its vocabulary, its Packages and Playbooks tabs and one accepted loss: the rail regains Playbooks as the global page, and a remembered Playbooks surface opens it; "Global" is the word for what applies to every project of yours, "Personal" staying the name of your own group on Space; the Packages tab holds the project's packages alone, the built-in playbooks one package among the rest; a package row's playbook line carries no act; with no project open the global page stands.
- [DR-104](104-spec-package-format-and-client-environments.md) in where a playbook is enabled, and [DR-174](174-what-a-package-provides-is-placed.md) in what an install does for a playbook: a placed playbook runs, its roles bound by default; `enable` and `disable` retire as acts and as words.
- [DR-032](032-session-players.md) in how a player bound by more than one playbook reads: the row groups the roles one player plays and says nothing more; the binding editor names the other playbooks.
- [DR-058](058-chat-assisted-playbook-authoring.md) in the workspace's last tab: "Add" in "Enable"'s place, writing the players and requesting the package from the environment of the page the playbook was created on.
- [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in where a package under development is made: the global page makes one in the global environment's own folder.
- [DR-103](103-the-home-and-its-groups.md) in a player a project names and your roster lacks: the role runs on the Captain's agent until you set the player up, a row in Settings and no longer a config error.
- [DR-105](105-playbook-17-5-0-adoption.md) and [DR-123](123-playbook-17-10-1-cligent-0-34-0-slc-0-18-0-adoption.md) in the core's parity with the launcher: the default bindings and players the core composes for placed playbooks are its third exception, beside `from` and `skills`.
- Extends [DR-069](069-key-phrases-not-sentences.md) with one principle: a page's acts match its scope.

## Context

- The project's Playbooks tab listed every playbook a session there could run, from the project's packages and your own group's, and let the reader enable each in either config.
  A row under "Enabled" wore "Personal", offered "Enable for ⟨project⟩" as its primary act and, once pressed, "in ⟨project⟩" beside "Personal".
  The built-ins are seeded into your own group's config at first run, so this was every built-in's row on every project: the fresh user's view.
- One fact — which config holds the entry — was said three ways; "Personal" has no referent on a project page; the primary act wrote a file nobody needed written; and the rare act, a playbook for the team, outranked the daily one.
- The root was global acts on a project page.
  [DR-172](172-surfaces-a-fresh-user-reads.md) retired the global Playbooks entry so that no two pages competed for one job, and gave the project's tab both jobs.
- An entry does one thing: it binds a player per role.
  The runtime runs a playbook only with an entry, so "enabled" meant "has players somewhere", and Enable asked a question the defaults already answer.
- A playbook meant for every project of yours had to be created inside one of them, and no project was the right one.
- "built in" marked seven rows and the one package the Packages tab would not remove, and every new project's `spex.yaml` requested that package again; the owner asked why the built-ins are not simply global playbooks added at install.
- The owner asked for the fewest concepts, and for the word `npm -g` uses.

## Decision

### A page's acts match its scope

- Settings holds what exists: the agents with their credentials, and your players with their default agent and model.
- Playbooks returns to the rail as the global page: the playbooks of your global packages, which run in every project of yours, on every device you sign in on.
  It adds and removes a package, creates a playbook, and maps roles to players.
- A project's Playbooks tab lists what runs in the project under two headings: ⟨project⟩, its packages' playbooks with their role → player mapping, and Global, the global playbooks as they come, each role overridable for this project.
  Every act on the tab is the project's; every act on the global page is global.
- The project's Packages tab holds the project's packages alone; the global packages are managed on the global page.
- The rail reads Dashboard, Projects, Playbooks, Space, Settings; a remembered Playbooks surface opens the global page; the place selector serves Playbooks as it serves Settings and Space, since a server's seat has a global environment of its own ([DR-132](132-team-servers.md)).

### "Global" is the word

- Global is the word, on every surface, for what applies to every project of yours: the global page, the Global heading, a global package, a global playbook.
  It replaces "Personal", "your own group's" and "every project of yours" wherever a package's or a playbook's reach is named; the specs say the global environment and the global config where they speak of that reach, and your own group's spex repository where they speak of the place.
- Personal stays the name of your own group on Space: a place records go.
  Global names reach, Personal names a place, and the two never stand on one surface.
- The Chinese glossary gains 全局 for Global.
- The command line is unchanged: it reads the folder it runs in and no home, as [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) decided, and its `-g` stays later.

### A placed playbook runs

- A playbook an environment places runs wherever that environment reaches: the project's in that project, the global in every project of yours.
  Enable and Disable retire as acts and as words: the switch is the package — Add gives a playbook, Remove takes it.
- Where no entry binds a playbook's roles, each role is played by the player `dev.⟨role⟩`, read as ⟨role⟩ ([DR-155](155-players-named-delegated-and-recovered.md)) — the rule Enable applied, now applied by default.
  Two playbooks naming one role share one player by default, which is the sharing the id decides ([DR-032](032-session-players.md)).
- The default is composed when a session's config is, from the two files and the two locks, and written nowhere: the command line places packages without the core, the global config syncs between devices, and a rule computed from the files holds on every device and after every removal.
  The launcher receives the default entries and players as it receives `from`: the third exception to the core's parity with it, the files themselves unchanged.
- A player a binding names — by default or in a written entry — and your roster lacks plays on the Captain's agent and model, and Settings lists it as a player to set up; a session is never refused for it.
- A written entry stands above the default: the project's entry in that project, else the global one.
  A written entry whose package is gone stands aside with a note, and blocks no session; it leaves the config when the row is removed.
- A playbook both environments place, by one id, is one playbook: it runs the project's entry where one stands, else the global, and lists once, under Global.
- One command, two playbooks: one runs — the project's over the global, a written entry over a default, else the first package by name — and the other's row reads that it stands aside, naming the package that runs.

### Roles map to players on the page of their scope

- A role line reads "⟨role⟩: ⟨player⟩, its mark, its agent and model, ✎"; roles one player plays are one line, "coder, reviewer: …", and no badge says so.
  That a player also plays in another playbook is said in the editor, where a change to it matters, not on the row.
- On the global page ✎ edits the global entry, writing it where only the default stood: the player per role and its tuning.
- On the project tab, under ⟨project⟩, ✎ edits the project's entry.
  Under Global, ✎ offers "Same as global", the default, or a player for this project; a choice writes the project's entry, the other roles as the global one binds them, and a role set back to "Same as global" takes the global player again, the entry leaving once no role differs; a role whose project player differs from the global one carries a dot.
  A project's entry names players by name alone, as today, so a teammate's player of that name plays; tuning stays yours, in your players.

### The built-ins are a global package added at install

- The built-in spec package is a global package: requested in the global environment once, when the home is made, as the seed writes its entries, and in no project's `spex.yaml` from then on.
  A project that requested it before this change keeps the request, harmlessly: the playbook lists once, under Global.
- From the first run on it is one package among the rest: its rows name it with its version as every row does, it can be removed and added again, and a newer release the app ships reads Update as today.
  Removed, it is not seeded again.
- "built in" retires as a label on a playbook's row and as the Packages tab's one unremovable line; it stays the source's name — the glyph's tooltip, the command line's lock marker — as "From the registry" is a source's name.

### Authoring starts where its playbook will live

- "New playbook" on the project tab makes the package under development in the project's `spex-packages/<org>/<pkg>/`; on the global page, in the global environment's folder, the authoring session kept with the global records.
  No destination is asked.
- The authoring workspace's last tab reads Add: command, intent and a player per derived role, prefilled as today, and one act, "Add", which requests the package by path from the page's environment and writes the players as its entry; the playbook then runs there.
  The agent's proposal card reads "Proposed /⟨command⟩" with "Open Add".
  "Enable for" and "Personal (every project of yours)" retire.

### Words

- Global; Add; Remove; Update; Same as global; a dot for an override.
- Gone from these pages: Enable, Disable, Enabled, Available, Personal, "in ⟨project⟩", "built in" on a row, shared.

## Consequences

- The Playbooks and Packages, environments, command line, core service, run view, settings and localization items are amended in one change with this record: the global page, the project tab's two headings and acts, the Packages tab without its second heading and its exception, the default binding and the roster write before composing, removal and the command clash, the seed's one request, a missing player as a row to set up, the parity's third exception, the Add tab, an authoring session of the global environment, the rail and its shortcuts, the words and their verification; retired item ids are never reused.
- Three implementation changes follow, each merged on green: the core — a placed playbook runs, the default binding, removal, the clash, the seed's request, authoring in the global environment and what the catalog reports; the IDE — the rail, the global page, the project tab, the Packages tab, the catalogs and the journeys; the documentation.
- One accepted loss: a project's playbook has no personal off switch.
  It is the team's; Remove it or leave it.
- DR-172's accepted loss "With no project open there is no package or playbook surface" closes: the global page stands before the first project.
- A home seeded before this change reads the same: its built-ins' entries are written entries, above the default; the one visible change is that a project package's playbook nobody enabled now runs, with its default players.
- A continued session whose playbook's package was removed reports the playbook gone, as it does today.
