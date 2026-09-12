<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# space: The Space Surface

## Intent

This package defines the Space surface under [DR-057](../decisions/057-space-surface.md): where the Spex home is shown at a glance, set up as a Git repository on one shared branch `main`, shared through one remote, synchronized by the core between Boss turns, and read as an annotated tree.
A **unit** is one whole-unit selection subject — a session bundle, a `playbooks/<id>/` directory, or one other tracked file; a **choice** takes a unit whole from this device or from the remote; a **local** unit is one this device changed and an **incoming** unit one the remote changed, each against their common ancestor.
The core performs every Git operation; the surface renders the core's state and runs no Git itself.

## External Behavior

### At a Glance

#### space-1

While the app is connected, the Space surface — reached from the sidebar's Space entry [[run-view-67](run-view.md#run-view-67)] — shall present the home in one header with these fields:

| Field | Content |
| --- | --- |
| path | the home's absolute path, `~`-shortened under the user's home directory, the full path in its title |
| repository | "Not a repository yet", or the current branch — marked unsupported when it is not `main` |
| remote | the `origin` URL with any embedded user removed, or "No remote" |
| ahead / behind | commits on `main` not on the remote's `main` and the reverse, with the time of the last check; absent until a check has run |
| last sync | the last completed sync's relative time with the absolute time in its title, or "Never synced" |
| local changes | the count of local units [[space-7](#space-7)] |
| issues | the count of storage diagnostics [[core-service-86](core-service.md#core-service-86)] plus a pending Git merge left by a terminal, opening the issues list in place |
| outside | each of the configuration file and the sessions directory lying outside the home [[storage-1](storage.md#storage-1)], named "outside the space; not shared" |
| Git | "Git is not installed" with install guidance, replacing every other field, where no `git` runs |

- the header ends with the primary control for the state — Initialize, Join, or Sync — and the Sync and Explore tabs stand beneath it.

#### space-2

The Space surface shall re-read the core's state only on an event, never on a timer: when the surface opens, when the window regains focus, when the core announces a Space operation's end or a session, ledger or configuration change, and when the reader activates Refresh, whose caption prints the time of the last read.

### Setting Up

#### space-3

While the home is not the top level of a Git work tree, the Space surface shall offer Initialize for a new space and Join a space for an existing remote, one line of guidance each and a remote URL field between them, and shall show no changes list:

- a home lying inside another repository's work tree still reads "Not a repository yet"; only the home's own top level counts;
- the guidance names what will sync — sessions, queues, projects, Settings, playbook sources — and what stays on this device [[space-25](#space-25)].

#### space-4

When the user activates Initialize, the core shall make the home a repository on `main` and record its first commit only from validated, token-free files [[storage-9](storage.md#storage-9)]:

1. validate the complete home [[storage-12](storage.md#storage-12)]; a blocking diagnostic or an incomplete migration receipt refuses, naming the file and reason, and creates nothing;
2. `git init` on `main`, then write the managed rules [[storage-17](storage.md#storage-17)] with every unsupported session path ignored;
3. stage the home and, where any staged path belongs to an ignored family of the catalog [[storage-1](storage.md#storage-1)], remove the new repository and refuse naming the path;
4. commit, as "Spex" at the machine's host name where Git has no committer identity, saying so in the header.

- a turn in flight refuses Initialize as it refuses Sync [[space-11](#space-11)];
- the control reads "Initializing…" in flight, and the header then reads `main`, "No remote" and "Never synced";
- a remote URL entered beside the control is set as `origin` after the commit [[space-5](#space-5)] with no transport.

#### space-5

When the user saves a remote URL, or clears it, the core shall set or remove `origin` without any transport and never store a credential:

| URL | Outcome |
| --- | --- |
| `ssh://…`, `git@host:path`, `https://…`, `http://…`, an absolute local path | set as `origin`, replacing any earlier one |
| blank, or containing whitespace or control characters | refused as malformed |
| embedding a password or token (`scheme://user:secret@host`) | refused naming the rule that the app stores no credential, pointing to SSH keys or the machine's credential helper |

- a changed remote clears the last check, so ahead and behind read as unknown until the next check;
- the row edits in place with Save and Cancel, Escape cancelling, and the header's remote field follows the save ([DR-010](../decisions/010-interface-craft.md) §3).

#### space-6

When the user activates Join a space with a remote URL, the surface shall initialize the home [[space-4](#space-4)], set the remote [[space-5](#space-5)], and start a sync that joins unrelated histories [[space-13](#space-13)], the control reading "Joining…" until that sync ends:

- an empty URL field takes a required mark and focus instead;
- a remote holding no `main` completes as a first push.

### Changes

#### space-7

While the home is a repository, the Sync tab shall list the local units — those whose working-tree bytes differ from the common ancestor with the remote's `main` while the remote's do not, or from the last commit where no remote has been checked [[space-33](#space-33)] — grouped by kind in this order with these labels, never a raw diff of a session:

| Kind | Unit | Label | Detail |
| --- | --- | --- | --- |
| Sessions | `sessions/<id>` bundle | the session's title, or "untitled session" | project name; new, updated or deleted; turn count |
| Queues | `intents/<projectId>.jsonl` | "N changes in <project>'s queue" | N acts appended since the ancestor; "queue replaced" where earlier lines are gone |
| Projects | `projects.json` | one line per difference: registered, renamed, removed, naming the project | — |
| Settings | `playbook/playbook.config.yaml` | "Settings changed" | a View diff control [[space-10](#space-10)] |
| Playbooks | `playbooks/<id>/` | "Playbook <id>" | the changed files; a View diff control [[space-10](#space-10)] |
| Sync rules | `.gitignore`, `.gitattributes` | "Sync rules updated" | a View diff control [[space-10](#space-10)] |
| Other | any other tracked path | the path | new, updated or deleted |

- a session's project resolves through local bindings [[storage-6](storage.md#storage-6)]; an unresolved one prints the recorded working directory;
- a session row carries Open session, which opens the session as a tab [[run-view-68](run-view.md#run-view-68)];
- with no local unit the list reads "Nothing to send from this device".

#### space-8

When the user activates Check remote, the core shall fetch the remote's `main` without merging, and the Sync tab shall list the incoming units [[space-33](#space-33)] with the labels of [[space-7](#space-7)], each marked new, updated or deleted against the common ancestor and marked as a choice to make where this device changed it too:

- the control reads "Checking…" in flight and offers Stop [[space-16](#space-16)];
- ahead, behind and the check time update in the header;
- a remote holding no `main` reads "The remote is empty; Sync will send this space";
- unrelated histories read "Unrelated history" with Join in place of Sync [[space-13](#space-13)] and list nothing;
- a failed transport reports per [[space-15](#space-15)].

#### space-9

While a sync has ended in choices needed, the Sync tab shall show the incoming list above the conflict picker [[space-17](#space-17)] with the step line reading "Needs your choice" and the caption "Your changes are saved; nothing is pushed yet".

#### space-10

When the user activates View diff on a Settings, Playbook, Sync rules or Other row, the surface shall show that unit's line diff in place — this device's version against the common ancestor for a local row, the remote's version against it for an incoming row, either side on a conflict row — additions and removals marked in text as well as color, and Hide diff removing it; a session or queue row offers no diff.

### Syncing

#### space-11

When the user activates Sync, the core shall admit it only while every condition below holds, otherwise refusing before the first step with the surface showing the reason beside the disabled control:

| Condition | Refusal shown |
| --- | --- |
| the home is a Git work tree root | "Initialize the repository first" |
| `origin` is set | "Add a remote first", the remote row focused |
| the current branch is `main` | "On <branch>; check out main in a terminal" |
| no Git merge is pending from a terminal | "Finish or abort the merge in your terminal" |
| no session of any project has a turn in flight [[core-service-4](core-service.md#core-service-4)] | "Wait for <session title> in <project>" |
| no session is held, or unprovably held, by another host [[core-service-32](core-service.md#core-service-32)] | "<session title> is in use elsewhere" |
| no compile is running | "<playbook> is compiling" |
| no Space operation is running | "Space is busy" |
| no blocking storage diagnostic stands [[core-service-86](core-service.md#core-service-86)] | the file and reason |
| `git` runs | the install guidance |

#### space-12

When a sync is admitted, the core shall run these steps in order, the Sync control reading "Syncing…" and a step line naming the step in flight, and end in one of the outcomes below:

| Step | The core | The line reads |
| --- | --- | --- |
| 1 Save | refresh the managed rules [[storage-17](storage.md#storage-17)], stage the catalog files, refuse a staged ignored-family path, validate [[storage-12](storage.md#storage-12)], commit when anything is staged | "Saving changes…" |
| 2 Check | fetch the remote's `main` | "Checking remote…" |
| 3 Compare | plan every unit against the common ancestor [[storage-11](storage.md#storage-11)] [[space-33](#space-33)]; nothing incoming skips to Push | "Comparing…" |
| 4 Apply | write the selection and one merge commit, or fast-forward [[space-19](#space-19)] | "Applying…" |
| 5 Refresh | re-validate and re-index [[space-20](#space-20)] | "Refreshing…" |
| 6 Push | push `main` to `origin`, setting the upstream once | "Pushing…" |

| Outcome | State afterwards |
| --- | --- |
| synced | `main` equals the remote's `main`; the line reads "Synced just now · N sent · M received", or "Everything is in sync" when nothing moved |
| choices needed | the Save commit stands, nothing merged, no operation running [[space-14](#space-14)] |
| stopped | the step, cause and way forward shown [[space-15](#space-15)] |

#### space-13

Where `main` and the remote's `main` share no common ancestor, when a sync compares, the core shall stop with "Unrelated history" unless the sync was started as a join, whereupon it shall compare against the empty tree [[storage-11](storage.md#storage-11)] — a unit present on one side only taken, a unit present on both sides with different bytes a choice [[space-17](#space-17)]:

- Join confirms inline, naming that both histories become one space and that a unit present on both sides differently will ask for a choice ([DR-010](../decisions/010-interface-craft.md) §4);
- without the join, the surface offers Join in place of Sync with the guidance that a wrong remote URL is the other explanation.

#### space-14

When the Compare step finds a unit changed differently on both sides without a choice for it [[storage-11](storage.md#storage-11)], the sync shall end in choices needed — the Save commit kept, nothing merged, no lease or gate held — and the surface shall show the picker [[space-9](#space-9)] [[space-17](#space-17)].

#### space-15

When a sync or check step fails, the core shall stop leaving the home in the state below, and the surface shall show the step, the cause in plain words and its guidance, offering Retry where retrying can help:

| Step | Cause | State left | Surface |
| --- | --- | --- | --- |
| Save | a staged path of an ignored family, or validation refusing a file | index reset, no commit, files untouched | the path or file and reason; "Nothing was saved" |
| Check, Push | host unreachable | commits stand | "Could not reach <host>"; check the network or the URL; Retry |
| Check, Push | not authorized, or host key unknown | commits stand | "<host> did not accept this machine's key"; set up an SSH key or credential helper for this machine and accept the host key once in a terminal; the app never asks for a password; Retry |
| Check, Push | repository not found | commits stand | "No repository at <URL>"; check the URL or create the repository |
| Check, Push | no answer within the transport limit, or Stop | commits stand | "No answer from <host>"; Git runs without prompts, so a helper that prompts fails instead of hanging; Retry |
| Compare | unrelated history | unchanged | Join [[space-13](#space-13)] |
| Apply | a chosen unit refused by validation, a session lease held elsewhere, or a writer changing the tree twice | nothing written; the Save commit stands | the unit or session and reason; the picker stays with the unit marked; Retry |
| Refresh | a diagnostic | the merge stands committed | the file and reason under issues |
| Push | rejected as not fast-forward | merge committed, ahead shown | one automatic cycle from Check; a second rejection reads "The remote changed again"; Retry |
| any | Git's own error otherwise | that step's row | Git's last lines; Retry |

- the report stands until the next operation or Dismiss.

#### space-16

While a sync or check runs a transport step — Check or Push — the surface shall offer Stop, which ends the Git child and leaves that step's stopped state [[space-15](#space-15)]; Save, Compare, Apply and Refresh are bounded local steps and offer no Stop.

### Choices

#### space-17

While conflicting units stand, the picker shall present each as one row — its label [[space-7](#space-7)] and two exclusive choices, "Keep mine" and "Take remote", each carrying its side's summary — with nothing preselected and Apply disabled with "N of M chosen" until every row has a choice:

| Unit | Side summary |
| --- | --- |
| session | updated or deleted; last activity; turn count |
| queue | acts since the ancestor, or deleted |
| projects | the registrations that differ from the ancestor |
| Settings, Playbook, Sync rules, Other | changed at; a View diff control per side [[space-10](#space-10)] |

- "All mine" and "All remote" fill every row at once;
- a deletion on one side against a change on the other reads "deleted" on the deleting side; taking it deletes the whole unit;
- each row is a radio group named by the unit's label, arrow keys moving within it ([DR-010](../decisions/010-interface-craft.md) §6).

#### space-18

When every conflict has a choice and the user activates Apply, the surface shall ask one inline confirm — naming how many units the remote's version replaces, that the other version stays in Git history [[storage-11](storage.md#storage-11)], and that a replaced session loses its local resume hints and viewed position — with Cancel focused and Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §4), and on confirmation shall start a sync carrying the choices [[space-12](#space-12)]:

- Cancel keeps the choices made;
- a sync whose Compare finds conflicts that no longer match the choices — the remote moved — ends again in choices needed with the new set [[space-14](#space-14)].

#### space-19

When a sync's Apply step runs, the core shall write the selected tree by the rules `select` applies [[storage-20](storage.md#storage-20)] — the complete candidate validated before any file is written [[storage-12](storage.md#storage-12)], replay before manifest, hints and viewed markers cleared for every session bundle whose bytes change [[storage-5](storage.md#storage-5)], every selected path staged — with no Git merge pending: the merge commit is composed from the staged selection with `main` and the remote's `main` as parents, or `main` moves to the remote's commit where the selection equals its tree:

- the working tree never holds Git's own merge output — no conflict marker, no `MERGE_HEAD`;
- a working tree that no longer matches the last commit when Apply begins — a writer slipped in — restarts the sync once from Save, and stops on the second time [[space-15](#space-15)];
- an apply interrupted before its commit lands is repaired from its recorded selection before the core reopens the home [[space-31](#space-31)].

#### space-20

When a sync's Apply step has changed the working tree — by merge or fast-forward — the core shall re-validate [[storage-12](storage.md#storage-12)] and re-index the home before pushing, so every view reflects the selected state without a restart:

- a session whose bundle changed is announced with its history replaced [[core-service-87](core-service.md#core-service-87)], a new one served and a deleted one forgotten as the shared store's arrivals and departures are [[core-service-60](core-service.md#core-service-60)] [[core-service-76](core-service.md#core-service-76)], and every project's ledger is announced changed [[core-service-51](core-service.md#core-service-51)];
- the registry, intent logs and preferences are re-read, and the configuration reloads through its ordinary reload [[core-service-2](core-service.md#core-service-2)];
- a diagnostic found here is reported under issues; the merge stands.

#### space-21

While a sync, check, initialize or join is running, the core shall refuse `busy`, naming the operation, every command that writes under the home — turn submission, session creation, retry, discard, deletion and viewed markers, project registration, creation, rebinding and removal, every intent command, configuration edits, and compiles — and a second Space operation, so the sole-writer rule [[storage-14](storage.md#storage-14)] holds through the operation:

- the gate is set before the admission checks [[space-11](#space-11)], so a turn admitted after it is refused and one admitted before it fails the check;
- choices needed and stopped are not running states: nothing is refused while the picker waits.

#### space-22

When a sync completes through Push, the core shall record its time and its counts of units sent and received in the preference store [[storage-5](storage.md#storage-5)] under `space:lastSync`, never in a tracked file.

### Explorer and Privacy

#### space-23

While the Explore tab is shown, the Space surface shall present the home as a read-only tree with a preview pane beside it, every entry annotated from the catalog [[storage-1](storage.md#storage-1)]:

| Annotation | Content |
| --- | --- |
| what it is | the catalog family's description — session manifest, session records, provider hints, project queue, project registry, local project paths, preferences, forge cache, migration receipts, config backup, playbook sources, playbook output, sync rules, lease, Git data — or "Not a Spex file" |
| sharing | "Shared" (tracked and committed), "Not yet shared" (a tracked kind, uncommitted), "Stays here" (ignored), "Git data" |
| size | the file size, or a directory's entry count |
| owner | the session's title and project, or the project's name, where the family belongs to one |

- `.git` is one closed entry that never opens; a session's files group under one node titled by the session, which offers Open session [[run-view-68](run-view.md#run-view-68)];
- the tree offers no rename, edit, move or delete;
- the tree is one ARIA tree with a single focus stop, arrow keys moving and disclosing ([DR-010](../decisions/010-interface-craft.md) §6).

#### space-24

When an entry is selected in the tree, the preview pane shall show it by type:

| Type | Preview |
| --- | --- |
| JSON, YAML | the text, JSON pretty-printed, in a monospace box scrolling inside itself |
| Markdown | rendered as the transcript renders Markdown, horizontal overflow contained |
| JSONL | one record per line with the record count; a session's records add "reads better as a conversation" with Open session |
| provider hints, migration inputs, config backups | withheld: "May hold provider tokens — not shown" [[storage-9](storage.md#storage-9)] |
| other text over 256 KB | the first 2,000 lines, saying so |
| binary | "binary file" with its size |
| directory | its annotation and counts |

#### space-25

While the Explore tab is shown, the Space surface shall present a "Stays on this device" panel listing every ignored family of the catalog [[storage-1](storage.md#storage-1)] with one plain reason each:

| Family | Reason |
| --- | --- |
| provider hints | resume tokens for this machine's agent conversations; they work nowhere else |
| leases and locks | which process is writing right now |
| local project paths | where your projects live on this machine |
| preferences | where you last stopped reading in each session |
| forge cache | GitHub lists the app fetches again |
| migration receipts and inputs | original files kept from an upgrade, some holding old tokens |
| config backups and temporary files | copies made while writing |

- the panel collapses and remembers its state as chrome preference ([DR-030](../decisions/030-workspace-chrome.md)).

#### space-26

When the user activates a reveal control — beside the header's path, or in the preview pane for its entry — the surface shall reveal that path in the OS file manager through the native bridge where it exists [[app-shell-28](app-shell.md#app-shell-28)], and where the bridge is absent shall offer Copy path instead, acknowledging the copy in words ([DR-010](../decisions/010-interface-craft.md) §3):

- the reveal control reads "Show in Finder" on macOS and "Show in folder" elsewhere;
- where the page has no clipboard access, Copy path falls back to a selectable read-only field holding the path.

### Copy and Fit

#### space-27

User-facing copy on the surface shall say "mine" and "remote", or "this device" and "the remote", for a sync's sides and plain step names, never `ours`, `theirs`, `HEAD`, `origin/main`, `MERGE_HEAD` or a Git command as primary copy — the raw term surviving in a tooltip ([DR-010](../decisions/010-interface-craft.md) §2).

#### space-28

The Space surface shall fit its pane at every width down to the 320-pixel floor ([DR-041](../decisions/041-chrome-that-fits.md)):

- below 42rem the header's at-a-glance words yield — the check and sync times, then the ahead and behind words, the numbers riding each field's accessible name and title — and below 20rem the header's fields stack with the primary control last and full-width;
- in each change row the label owns the slack and truncates with its title, the project chip and detail hiding below 28rem, the row's control keeping its accessible name;
- the tree and preview stand side by side from 42rem and stack below it, the preview under the tree; the preview's box scrolls inside itself and the diff box scrolls sideways as a canvas;
- every control reads at most 14 characters, its busy form included: Sync, Syncing…, Check remote, Checking…, Stop, Initialize, Initializing…, Join a space, Join, Joining…, Apply, Applying…, Cancel, Save, Add remote, Change remote, View diff, Hide diff, Keep mine, Take remote, All mine, All remote, Open session, Open palette, Show in Finder, Show in folder, Copy path, Refresh, Retry, Dismiss;
- the surface scrolls inside its own box and the page never scrolls.

## Internal Behavior

### Protocol

#### space-29

The core shall expose Space through these commands and one message, each reply validated against the command schema:

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `space.get` | — | `SpaceState` [[space-30](#space-30)] | — |
| `space.init` | `{ remote?: string }` | `SpaceState` | `invalid_request` (already a repository; blocking diagnostic or incomplete migration, with file and reason; staged ignored path; malformed URL), `busy` (turn in flight; an operation running) |
| `space.remote.set` | `{ url: string \| null }` | `SpaceState` | `invalid_request` (not a repository; malformed; embedded credential), `busy` |
| `space.fetch` | — | `{ accepted: true }` | `invalid_request` (not a repository; no remote; not on `main`), `busy` |
| `space.sync` | `{ choices?: Record<unit, "mine" \| "remote">, join?: boolean }` | `{ accepted: true }` | `busy` naming the blocker [[space-11](#space-11)], `invalid_request` (not a repository, no remote, not on `main`, merge pending, blocking diagnostic; unknown unit; a choice for a unit that is not a conflict) |
| `space.cancel` | — | `{ stopped: boolean }` | — |
| `space.diff` | `{ unit: string, path: string, side: "mine" \| "remote" }` | `{ patch: string, truncated: boolean }` | `invalid_request` (session or queue unit; unknown unit or path; no check yet for a remote side) |
| `space.tree` | `{ path?: string }` | `{ path: string, entries: SpaceEntry[] }` | `invalid_request` (path escaping the home), `not_found` |
| `space.read` | `{ path: string }` | `{ kind: "text", text, lines, truncated } \| { kind: "withheld", reason } \| { kind: "binary", size }` | `invalid_request` (outside the home, a symlink, `.git`, not a file), `not_found` |

- `space.state { state: SpaceState }` is broadcast to every client on each transition of the machine [[space-31](#space-31)] and after `space.init`, `space.remote.set` and the Refresh step; long commands reply `accepted` at once and their outcome is state, never a hung reply ([DR-010](../decisions/010-interface-craft.md) §5);
- the interface re-pulls `space.get` when the surface mounts, on window focus, and — debounced — on `session.state`, `session.removed`, `intents.changed` and `config.state` while the surface is shown.

#### space-30

The core shall shape `SpaceState` as:

```ts
interface SpaceState {
  home: string;
  outside: { what: "config" | "sessions"; path: string }[];
  git: { ok: true; version: string } | { ok: false; guidance: string };
  repository: null | {
    branch: string | null; remote: string | null; upstream: boolean;
    ahead: number | null; behind: number | null; checkedAt: number | null;
    remoteEmpty: boolean; unrelated: boolean; mergePending: boolean; identityFallback: boolean;
  };
  local: SpaceUnit[]; incoming: SpaceUnit[]; conflicts: SpaceConflict[];
  lastSync: { at: number; sent: number; received: number } | null;
  diagnostics: { file: string; reason: string; blocking: boolean }[];
  sync:
    | { phase: "idle" }
    | { phase: "running"; op: "sync" | "check" | "init"; step: SyncStep; since: number; cancelable: boolean }
    | { phase: "choices"; savedCommit: string | null }
    | { phase: "unrelated" }
    | { phase: "stopped"; op: "sync" | "check" | "init"; step: SyncStep; cause: SyncCause; message: string; guidance: string; retry: boolean }
    | { phase: "done"; at: number; sent: number; received: number; pushed: boolean };
}
type SyncStep = "save" | "check" | "compare" | "apply" | "refresh" | "push";
type SyncCause = "unreachable" | "unauthorized" | "not-found" | "timeout" | "stopped" | "rejected"
  | "validation" | "lease" | "writer" | "unrelated" | "identity" | "git";
interface SpaceUnit {
  unit: string;   // "sessions/<id>" | "intents/<pid>.jsonl" | "projects.json" | "playbook/playbook.config.yaml" | "playbooks/<id>" | ".gitignore" | path
  kind: "session" | "queue" | "projects" | "settings" | "playbook" | "rules" | "other";
  label: string; detail?: string; change: "new" | "updated" | "deleted";
  project?: { id: string; name?: string }; sessionId?: string; paths: string[]; diff: boolean;
}
interface SpaceConflict { unit: SpaceUnit; mine: SpaceSide; remote: SpaceSide }
interface SpaceSide { change: "new" | "updated" | "deleted"; at?: number; detail?: string; diff: boolean }
interface SpaceEntry {
  name: string; path: string; kind: "file" | "dir" | "git"; family: string;
  sync: "shared" | "pending" | "local" | "git"; size?: number; count?: number; mtime?: number;
  owner?: { sessionId?: string; title?: string; projectId?: string; name?: string };
  preview: "text" | "withheld" | "binary" | "none";
}
```

### Sync Machine

#### space-31

The core shall run every Space operation on one state machine, at most one operation at a time:

```text
idle ─sync/init+join→ save ─→ check ─→ compare ─→ apply ─→ refresh ─→ push ─→ done ─→ idle
idle ─fetch→ check ─→ idle
save: ignored path staged | validation | commit error → stopped
check: transport | timeout | Stop → stopped;  remote empty → push
compare: conflict without choice → choices;  no ancestor and not a join → unrelated;  nothing incoming → push
apply: working tree ≠ HEAD (first) → save;  validation | lease | writer twice → stopped
push: rejected (first) → check;  rejected twice | transport | timeout | Stop → stopped
choices ─sync with choices→ save;  unrelated ─sync with join→ save;  stopped ─Dismiss or next→ idle
```

- the write gate [[space-21](#space-21)] is set on entering `save` or `check` and lifted on `choices`, `unrelated`, `stopped`, `done` and `idle`;
- every session's management lease is taken through Playbook's shared store at the start of `apply` and released when `refresh` ends or `apply` stops, so a terminal writer is refused for exactly the writing steps and a held lease stops the sync naming its session;
- the sessions-directory and configuration watchers are paused from `apply` through `refresh`, and one full rescan runs as `refresh`;
- before the first file is replaced, `apply` records the plan's revisions, ancestor and choices in an ignored `local/space-apply.json` and removes it after the ref update lands; a marker found at startup or admission is re-applied — same blobs, same tree, same parents — before any other operation;
- `space:lastSync` persists in `prefs.json` [[storage-5](storage.md#storage-5)]; the sync's transient state persists nowhere.

#### space-32

The core shall invoke Git as a child process per step, never through a shell, from the home, with this environment and these commands:

- environment: the core's captured environment plus `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`, and `GIT_SSH_COMMAND=ssh -oBatchMode=yes` only where none is set; `process.umask(0o077)` from `init` and from `apply` through `refresh`, restored after; a 120-second limit on `ls-remote`, `fetch` and `push` after which the child receives `SIGTERM`, then `SIGKILL` after five seconds;
- commit-writing commands carry `-c commit.gpgsign=false -c core.hooksPath=/dev/null`, and `-c user.name=Spex -c user.email=spex@<hostname>` only where `git var GIT_COMMITTER_IDENT` fails;
- state: `--version`, `rev-parse --show-toplevel`, `symbolic-ref -q --short HEAD` (no output on a detached or unborn `HEAD`), `rev-parse -q --verify HEAD^{commit}`, `rev-parse -q --verify MERGE_HEAD`, `remote get-url origin`, `config --get branch.main.remote`, `rev-parse -q --verify refs/remotes/origin/main`, `rev-list --left-right --count main...origin/main`, `status --porcelain=v1 -z -uall`;
- initialize: `init -q -b main`, falling back to `init -q` then `symbolic-ref HEAD refs/heads/main`; `remote add origin <url>`;
- save: the managed-rules writer, `add -A -- .`, `diff --cached --name-only -z`, `diff --cached --quiet`, `commit -q -m <message>`, `reset -q` on refusal;
- check: `ls-remote --exit-code --heads origin refs/heads/main` (exit 2 means no `main`), `fetch -q --no-tags origin +refs/heads/main:refs/remotes/origin/main`, `merge-base HEAD origin/main`;
- plan: `ls-tree -rz --full-tree <rev>` per revision, and for the working tree `add -A -- .` then `write-tree` under a temporary `GIT_INDEX_FILE`;
- apply: `cat-file blob <oid>` per selected file into the staging directory, `add -A -- <unit paths>`, `write-tree`, `merge-base --is-ancestor HEAD origin/main`, `commit-tree <tree> -p HEAD -p origin/main -m <message>` or none on a fast-forward, `update-ref refs/heads/main <commit> <old HEAD>`;
- push: `push -q origin main`, `push -q -u origin main` where no upstream is set;
- stderr classification under `LC_ALL=C`: "Could not resolve host", "Connection refused", "Network is unreachable" → unreachable; "Permission denied", "Authentication failed", "could not read Username", "terminal prompts disabled", "Host key verification failed" → unauthorized; "Repository not found", "does not appear to be a git repository" → not found; "[rejected]" with "fetch first" or "non-fast-forward" → rejected; a killed child → timeout or stopped; anything else → `git` with the last lines.

#### space-33

The core shall compute one three-way plan per read or sync — this device's tree, the remote's `main`, and their common ancestor — over every tracked path, grouping paths into units and classifying each unit by complete bytes and existence under the selection rule [[storage-11](storage.md#storage-11)]:

| Side | Tree |
| --- | --- |
| mine | the working tree for the lists of [[space-7](#space-7)] and [[space-8](#space-8)]; `HEAD` inside a sync |
| remote | `origin/main`; `HEAD` itself before any check, and the empty tree where the remote holds no `main` |
| ancestor | `merge-base(HEAD, origin/main)`; `HEAD` before any check; the empty tree for a join; the plan withheld for unrelated histories without one |

- units: `sessions/<uuid>.json` with `sessions/<uuid>.records.jsonl`, every file under one `playbooks/<id>/`, and each other tracked path alone; a session unit taken from a side needs both files on that side or neither;
- a unit is local where mine differs from the ancestor and remote does not, incoming where remote differs and mine does not, a conflict where both differ from the ancestor and from each other, and agreed otherwise;
- unknown units, duplicate choices, and choices contrary to a decided unit are refused before any write; the command-line tool keeps its contract [[storage-10](storage.md#storage-10)], sharing this plan, the validator and the application code behind a seam that takes the running core's held lease and a caller-supplied ancestor.

#### space-34

The core shall derive a unit's label and side summaries from the bytes of the side described, never from the live index alone:

- a session's title is the first `turn_started` prompt of that side's replay, read through the stream fold until it is found; its turn count and last activity come from that side's records; its project is the manifest's `cwd` resolved through local bindings [[storage-6](storage.md#storage-6)], else the recorded path;
- a queue's count is the number of newline-terminated acts beyond the ancestor's line count where the ancestor's lines are a prefix, else "queue replaced";
- registry lines compare parsed entries by id: registered, renamed, removed;
- a playbook unit lists its changed file names; Settings, Sync rules and Other carry no detail beyond the change and time.

### Explorer

#### space-35

The core shall build each `space.tree` level by reading one directory of the home without following symlinks, confined to the home's real path, reporting `.git` as one closed entry never read, mapping each path to its family and sharing mark by `ls-files`, `check-ignore` and `status`:

| Path | Family |
| --- | --- |
| `sessions/<uuid>.json` / `.records.jsonl` / `.hints.json` / `.spex.json` | session manifest / session records / provider hints / legacy session sidecar |
| `.lock*`, `sessions/.<uuid>.lock*`, `*.lock`, `*.lock.*` | lease |
| `intents/<uuid>.jsonl` | project queue |
| `projects.json` | project registry |
| `playbook/playbook.config.yaml`; `*.bak*`, `*.backup*` | Settings; config backup |
| `playbooks/<id>/<id>.md`, `.ts`, `.playbook/` | playbook sources |
| `playbooks/<id>/<id>.registry.ts`, `.registry.mjs`, `.fsm.bundle.mjs` | playbook output |
| `local/project-paths.json`; `local/migrations/`; `local/space-apply.json` | local project paths; migration receipts; sync repair marker |
| `prefs.json`; `forge-cache.json`; `meta.json` | preferences; forge cache; migration record |
| `.gitignore`, `.gitattributes` | sync rules |
| `*.tmp` | temporary write |
| other | Not a Spex file |

- `space.read` refuses a path resolving outside the home or through a symlink, withholds provider hints, migration inputs and config backups, and caps text at 256 KB or 2,000 lines on complete lines.

### Native Bridge

#### space-36

The desktop preload shall expose `revealPath(path)` beside `pickDirectory()` on `window.spexNative` over one invoke channel `spex:reveal-path`, and the main process shall reveal the path in the OS file manager only when it resolves inside the state root the core was started with, returning `false` otherwise.

## Verification

### Core Coverage

#### space-37

When an integration suite starts a real core with substitute agents on a scratch home whose configuration lies inside it, with a bare Git repository standing in for `origin` and an isolated Git configuration, it shall drive setup and the first sync over the protocol and assert:

- `space.get` reads no repository, and reads the `git` guidance on a `PATH` without `git` [[space-1](#space-1)];
- `space.init` on a home with a blocking diagnostic or an incomplete migration receipt refuses naming the file and leaves no `.git` [[space-4](#space-4)];
- a clean `space.init` yields `main` with one commit tracking no hint, lease, binding, preference or migration file and the managed rules present, the committer reading the fallback identity where none is configured [[space-4](#space-4)];
- `space.remote.set` accepts the bare path, refuses a blank URL, whitespace and an embedded credential leaving `origin` unchanged, and clears the check time [[space-5](#space-5)];
- `space.sync` against the empty bare repository pushes `main`, sets the upstream, and ends `done` with `pushed` and `space:lastSync` recorded [[space-12](#space-12)] [[space-22](#space-22)];
- a session with a turn in flight, a session under a management lease taken out of band, and a running compile each make `space.sync` and `space.init` refuse `busy` by name [[space-11](#space-11)] [[space-4](#space-4)];
- while a check runs against a remote whose `GIT_SSH_COMMAND` sleeps, `turn.submit`, `intent.queue`, `config.edit`, `project.register` and `compile.run` are refused `busy` naming the sync, `space.cancel` returns the machine to `stopped` with the Save commit kept, and the sleeping child is gone [[space-21](#space-21)] [[space-16](#space-16)] [[space-32](#space-32)];
- a `MERGE_HEAD` planted before start reads as a pending merge and refuses the sync [[space-1](#space-1)] [[space-11](#space-11)].

#### space-38

When an integration suite runs two real cores on two scratch homes sharing one bare remote, the second home initialized with its own configuration and session, it shall assert the sync loop:

- the second home's first sync ends `unrelated`, a join ends in choices with the Settings unit as the one conflict and both sides summarized, "Keep mine" leaves this home's file while "Take remote" replaces it, and both homes' sessions are present afterwards [[space-13](#space-13)] [[space-14](#space-14)] [[space-17](#space-17)];
- a session run on home A lists on home B after B syncs, its history served, the ledger announced, and B's issues naming its unresolved working directory until B binds the project [[space-20](#space-20)] [[space-1](#space-1)];
- both homes changing the same session yields one conflict whose remote choice replaces both bundle files, clears the planted hints file and the `viewed:` marker, and publishes history-replaced before the summary; a delete-versus-modify row deletes both files when the deleting side is chosen [[space-17](#space-17)] [[space-19](#space-19)] [[space-20](#space-20)];
- a playbook source changed differently on both sides is one whole-directory conflict and no conflict marker or `MERGE_HEAD` ever appears in either home [[space-19](#space-19)] [[space-33](#space-33)];
- a chosen unit that fails validation stops at Apply naming the file with every home file byte-identical to before [[space-15](#space-15)];
- a records file appended between Save and Apply restarts the sync once from Save, and a second append stops it [[space-19](#space-19)];
- a push rejected because the peer advanced after the check re-checks once and succeeds; advanced again, it stops "changed again" with the merge kept and `ahead` reported [[space-15](#space-15)];
- a fast-forward sync leaves `main` equal to the remote's with no merge commit, clears the hints of its changed session, and, under process umask `022`, leaves no `sessions/` entry wider than `0600` [[space-19](#space-19)] [[space-20](#space-20)] [[space-32](#space-32)];
- a marker planted with a half-written selection is repaired at startup into the recorded commit before `space.get` answers [[space-31](#space-31)];
- a remote at a path with no repository stops "not found", an `ssh://127.0.0.1:1/x` remote stops "unreachable", a sleeping `GIT_SSH_COMMAND` stops "timeout" within a test-shortened limit, each carrying its guidance [[space-15](#space-15)] [[space-32](#space-32)].

#### space-39

When an integration suite writes local changes of every unit kind into a repository home, it shall assert the listings and the explorer:

- the local list carries a titled session as new, "3 changes in <project>'s queue", a registration line, "Settings changed" with a diff, "Playbook <id>" and "Sync rules updated", in the kinds' order [[space-7](#space-7)] [[space-34](#space-34)];
- after a peer pushes, `space.fetch` lists the incoming units the same way with conflicts marked and ahead and behind counted, an empty remote reads empty, and `space.diff` returns a patch for Settings on each side and refuses a session unit [[space-8](#space-8)] [[space-10](#space-10)];
- `space.tree` maps every catalog path to its family and sharing mark with session and project owners, reports `.git` closed and a stray file as not a Spex file, and neither follows nor lists through a planted symlink; `space.read` pretty-prints JSON, returns YAML, Markdown and JSONL text, cuts a long log on a line, withholds a hints file and a migration input, and refuses `../` [[space-23](#space-23)] [[space-24](#space-24)] [[space-35](#space-35)].

### Browser Journeys

#### space-40

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on an empty home with its configuration inside it and a bare repository in the scratch root, the test suite shall assert the first-time setup through the page alone:

- Space reads "Not a repository yet" with Initialize and Join a space; Initialize reads "Initializing…", then the header reads `main`, "No remote" and "Never synced" [[space-3](#space-3)] [[space-4](#space-4)];
- Add remote, the bare path and Save show the remote; Sync reads "Syncing…", the step line names each step, and the line ends "Everything is in sync" with a sync time [[space-5](#space-5)] [[space-12](#space-12)];
- a session then run from the Captain home appears under local changes by its title and project, its Open session control opens its tab, and Sync sends it, the bare `main` holding its bundle [[space-7](#space-7)] [[space-12](#space-12)].

#### space-41

Where the harness boots the served shell on a home whose remote a peer home has pushed to — the peer holding a differing configuration and the same session changed — the test suite shall assert the daily sync with conflicts through the page:

- Check remote lists the peer's session and Settings as incoming with the conflict marked and the header reading behind [[space-8](#space-8)];
- Sync ends "Needs your choice" with Apply disabled reading "0 of 2 chosen"; "Take remote" for the session and "Keep mine" for Settings by keyboard enable Apply; Apply's confirm names one replaced unit with Cancel focused, Escape keeps the choices, and confirming ends synced [[space-9](#space-9)] [[space-14](#space-14)] [[space-17](#space-17)] [[space-18](#space-18)];
- the session's tab shows the remote's turns and Settings shows this device's configuration [[space-20](#space-20)];
- with the peer's `main` moved after the check, Sync ends "changed again" with the ahead count in the header, and a second Sync pushes [[space-15](#space-15)];
- Stop during a check against a sleeping transport ends the check with its stopped state and Retry [[space-16](#space-16)];
- no visible text on the surface contains `ours`, `theirs`, `HEAD` or `origin/main` [[space-27](#space-27)].

#### space-42

Where the harness boots the served shell with the demo project registered and a finished session, the test suite shall assert the exploring journey through the page:

- the Explore tab lists the session's node titled by its first turn with its manifest "Shared", its hints file "Stays here" and its records offering Open session; selecting the manifest previews pretty-printed JSON and selecting the hints file reads withheld [[space-23](#space-23)] [[space-24](#space-24)];
- "Stays on this device" names the seven families with their reasons [[space-25](#space-25)];
- the served page offers Copy path and no reveal control, and acknowledges the copy [[space-26](#space-26)].

#### space-43

Where the harness boots the served shell with a repository home carrying local changes of every kind and a check ended in choices, when the journey shows Space's Sync tab and Explore tab at the widths 320, 480, 640, 800, 1024 and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element: the page scrolls in neither direction, no element outside the diff canvas is wider than its box, within every header, list row and picker row no two visible siblings overlap and every child lies inside its parent, every control keeps its accessible name at every width, and the ahead and behind numbers ride their field's accessible name where its words hide [[space-28](#space-28)].

#### space-44

Where the harness boots the served shell with a repository home whose check ended in choices, when the Space surface is scanned by axe-core at WCAG 2.1 AA in the light and the dark theme, the test suite shall assert no serious or critical violation, with the picker's radio groups, the tree and the tabs named for assistive technology [[space-17](#space-17)] [[space-23](#space-23)].
