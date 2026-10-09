<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# An authoring session's lifetime: audit and design

Four review rounds (commits 218b9aa1, 724955c4, a03807d8, 002940f4) kept finding one defect class: state keyed by a bare authoring session id outlived the session the id named.
A rescan or a sync gave the id to another project's session, a listing left the id out, a reply or a component callback landed late, a transcript was replaced, and some site read or wrote the newcomer's state as the former's.
Each round added a guard where the defect showed.
This document lists every such site as of 002940f4, says what becomes of it under the instance-token design, and states the design's rules once.
The specs are the law (`playbook-library-70/98/99/101/102`, `core-service-96/97`, `storage-12/23`); this file is the audit behind their change, not a second statement of them.

## The design in one paragraph

Every live authoring session has one owner in the core, the `AuthorManager`'s live entry for its id, which carries an **instance token** minted when the session is created or when a rescan promotes another session under the id, and never when a sync replaces its transcript or a clone moves.
The token travels in every draft message, reply and command: a command addressed to an existing session names the instance it expects and is refused at admission on a mismatch; an operation's asynchronous writes re-check their owner across their awaits; the owner's departure cancels the session's turn, compile and enabling, frees the id, and announces `draft.removed` with the departed token.
The interface adopts a token only from the bootstrap (`draft.create`, `draft.list`, the `draft.open` of an open) and from a `draft.state` for an id it holds nothing under; every other event or completion is matched against the held token at one boundary and dropped when it does not match.
The id stays unique across the home and the keeper rule of storage-12 stands: the token names a lifetime, the id names the playbook, and a composite key would express neither.

## Why the per-site guards could not close the class

| Scenario | 002940f4 behavior | Root cause |
| --- | --- | --- |
| Delete a session, recreate it in the same project under the same id, a reply to a command of the former lands after | the reply applies: `stillNames` compares the project, which is the same | the project is an address, not a lifetime |
| A command of the former instance reaches the core after the recreation | admitted: `requireDraft` checks id and project | same |
| A rescan gives the id another project's session while an enabling re-packages; the newcomer starts its own compile; the enabling's `finally` runs | `activeCompiles.delete(id)` removes the newcomer's marker; its compile stops blocking sends and its state reads idle | cleanup by id, not by owner |
| A clone moves (your own group renamed, a transfer followed) | no `draft.state` is published; the next listing names the id under another project and `retireReassignedDraft` forgets the open workspace, composer text and edits | a project change was read as a lifetime change |

## Audit

Dispositions:

- **redundant**: the token makes the site unnecessary; it goes.
- **lifetime rule**: cancellation on departure, history replacement, ordered queue settlement, ownership-specific cleanup; it stays, now phrased by instance where it compared ids or projects.
- **stays**: kept for a reason other than stale-session protection (a product rule, damage handling, an activity rule); untouched unless noted.

### `packages/core/src/drafts.ts` (the store)

| Site | What it guards | Disposition |
| --- | --- | --- |
| `refresh()`: the kept holder stays kept while its file stands, else the first by key; `onKeptChanged(id, former)` per id whose holder changed or vanished | the home-wide id rule (storage-12) | stays; it is the detection point where an instance ends |
| `moved()`: a kept session is re-keyed to its clone's new key before the rescan | a move is the same session | lifetime rule (a move never ends a lifetime) |
| `create()`: refuses an id another project's session holds; never replaces a file standing in this clone; removes a transcript left without its record | the id rule; a stranger's records never precede a new session's | stays (product rule) |
| `diagnostics()`: one nonblocking diagnostic per shadowed file | the id rule | stays |

### `packages/core/src/authoring.ts` (the manager, the lifetime owner)

| Site | What it guards | Disposition |
| --- | --- | --- |
| constructor: `drafts.onKeptChanged = forget` | the rescan ends the former's state | lifetime rule; the one departure path |
| `forget(id, former)`: aborts the turn and compile controllers and `activeCompiles.get(id)`; deletes the live entry and diagnostics; skips the announcement while `deleting === id`; announces `draft.removed`; publishes the successor | cancellation on departure; the announcement | lifetime rule; changes: ends the instance and clears only the former's own compile or enabling marker (never a `compile.run`'s), announces with the departed token; the `deleting` flag is redundant once `delete()` relies on this path |
| `reread(repository)`: re-reads each transcript, drops the resume token when the transcript changed, announces a replacement when what was served differs | history replacement | lifetime rule; the instance is stable across it |
| `turning(repository)` | a sync waits for a turn (space-11) | stays |
| `start()`: closes a dangling turn, rewrites a running compile as interrupted | a restart | stays |
| `read(id)` → `not_found` | admission | stays, folded into `admit()` |
| `recordsOf` / `assertReadable` / damaged diagnostics | a damaged transcript blocks its session alone | stays |
| `append(id, live, record)`: throws when `live.get(id) !== live` | an asynchronous write of a departed instance | lifetime rule; the one owner check every write and settle uses |
| `create()`: `drafts.exists(id)` → conflict "open it"; reserved ids → `invalid_request` | the id rule | stays; mints a fresh instance; the "another project's session" case moves here from the service (one site for one rule) |
| `send` / `abort` / `writeSource` / `setPlayer` / `assertIdle` / `beginCompile`: busy and damaged refusals | one activity per session (core-service-96) | stays |
| `register()`: `holder = projectOf(id)` captured before the re-package, `projectOf(id) !== holder` → refused after it | a departed instance committing | redundant: the owner check (`live.get(id) !== live`) says it; the enabling's controller is held on the live entry so departure cancels it |
| `register()` `finally`: `activeCompiles.delete(id)` | frees the id | lifetime rule, made ownership-specific: deletes the marker only while it is this enabling's |
| `register()` `finally`: `released(id)` | ordered queue settlement | lifetime rule |
| `delete()`: `deleting` flag, `live.delete`, `problems.delete`, `onRemoved`, publish the successor | the announcement | redundant: `drafts.delete` rescans, and the rescan's `forget` announces and publishes; `delete()` keeps the preference removal and the store call |
| `runTurn()`: `if (live.turn?.controller === controller) live.turn = undefined` | the successor's turn | lifetime rule (ownership-specific cleanup) |
| `runTurn()` `finally`: `refreshSource(id, live)` and the closing record on a departed instance | — | the closing record already throws by `append`; the source re-read now checks the owner first so a departed turn never reads the successor's file |
| `runAgent()`: `cancelApprovals(id, invocationId)` | approvals | stays (per invocation, owned by the approvals package) |
| `released(id)`: publish and `afterSettle(id)` | queue settlement after an act of the id ends | lifetime rule |
| `afterSettle()`: `settled.live === live` for the preface | a preface rides only on its own session's settle (playbook-library-102) | lifetime rule, an instance check already |
| `runCompile()` `onProgress`: ignores lines after abort | cancellation | stays |
| `runCompile()` `finally`: `activeCompiles.delete(id)` | frees the id | lifetime rule, made ownership-specific |
| `runCompile()` `finally`: `if (live.compile?.controller === controller) live.compile = undefined` | the successor's compile | lifetime rule |
| `runCompile()`: `if (live.get(id) !== live) { released(id); return }` | a departed instance settling | lifetime rule (owner check, then the queue duty) |

### `packages/core/src/service.ts`

| Site | What it guards | Disposition |
| --- | --- | --- |
| `rescanSessions`: `drafts.refresh()` then `authors.reread(repository)` | a sync ends, promotes or replaces | stays |
| media `assertOwner` for `{kind: "draft", projectId, id}` | an upload for a session the id no longer names in that project | stays: the media package addresses owners by project, and an upload is not a session command |
| `spaceBlocker`: `authors.turning`, compile holders | space-11 | stays |
| `subscribe` to a draft channel: `authors.has(draftId)` | an unknown session | changes: the channel names the instance and is refused when it is not the current one, so a subscription of a former instance delivers nothing of the successor |
| `compile.run` `finally`: `activeCompiles.delete`, `compileHolders.delete`, `released` | frees the id | lifetime rule, made ownership-specific (its own controller only) |
| `draft.create`: `drafts.exists && projectOf !== project.id` → "another project's session" | the id rule | redundant with the manager's `create()`, which now tells the two cases apart itself |
| `requireDraft(projectId, draftId)` on every session command | an unknown session or another project's | becomes `admit(id, projectId, instance)`: `not_found` for an unknown id or another project's, `not_found` naming the id as another session's for a token the live entry does not hold |
| `draft.delete`: `assertDeletable` before and after the media drain | the idle rule | stays |
| `repositoriesMoved`: `drafts.moved(moves)` | a move | stays; the moved sessions' states are published after it, same token, new project |
| `afterRepositoriesChanged`: `drafts.refresh()` | a clone came or went | stays |
| browser preparation with a draft context: `authors.has` | a read of the package folder | stays |

### `packages/ui/src/state/store.ts`

| Site | What it guards | Disposition |
| --- | --- | --- |
| `draftBackfilling` and `if (draftBackfilling.get(id) !== pending) return` in `ensureDraftSubscribed` | an older open completing after a newer one | lifetime rule on the client: an open's completion applies only while it is the latest open |
| `foldDraftRecord`: no view, or seq at or before the view's last → fold nothing | a replay | stays; records of another instance are dropped at the message boundary before this |
| `draftProject(id)` → "no longer listed" | a command for an id not held | becomes the address `{projectId, instance}` the bootstrap handed the store |
| `stillNames(id, projectId)` | a reply for a former session | redundant as a project comparison; replaced by `holds(id, instance)`, the one boundary |
| `assertStillNames` → code `retired` | a completion for a former session | replaced by `assertHeld(id, instance)` |
| `retireReassignedDraft(draft)`: another project under a held id → forget | a reassignment | redundant and wrong under tokens: a move keeps the token with a new project; `draft.state` adopts, updates or drops by token |
| `forgetDraft(id)` | — | stays, the one forget |
| `draft.record` handler: buffer or fold | — | gains the token boundary |
| `draft.state` handler: `retireReassignedDraft` then set | a reassignment | token rules: nothing held → adopt; the held token → update (a new project is a move); another token → drop |
| `draft.history-replaced` handler: `projectId !==` or no view → break | a replacement for another session | the project check is redundant; the token boundary stands |
| `draft.removed` handler: `!known \|\| known.projectId === message.projectId` → forget | a removal of another project's session of the id | by token: forget only the held instance |
| `draft.source` handler | — | gains the token boundary |
| `refresh()` (reconnect): `listDrafts`, `ensureDraftSubscribed(id, true)` per held view | a transcript changed while disconnected | lifetime rule (the reconnect rule below) |
| `listDrafts()`: ids left out are forgotten; `retireReassignedDraft` per listed | a listing | the listing rule below |
| `sendDraft`, `abortDraft`, `writeDraftSource`, `refreshDraftSource`, `compileDraft`, `registerDraft`, `setDraftPlayer`, `loadDraftArtifacts`: `assertStillNames` or `stillNames` | a late reply or refusal | by token, one helper; `setDraftPlayer`'s and `refreshDraftSource`'s replies update the held state and never adopt |
| `abortDraftCompile`: no guard | — | gains the same completion check for symmetry |
| `deleteDraft`: `if (!drafts[id] \|\| stillNames) forgetDraft`; `unsubscribe` by id | the successor's state and subscription | by token; the unsubscribe names the deleted instance, never the successor's subscription |

### `packages/ui/src/components`

| Site | What it guards | Disposition |
| --- | --- | --- |
| `AuthoringWorkspace` `pickFile`: captures the project before the pick, compares after | a file picked for a former session written as the successor's source | lifetime rule on the client: an act holds its owner instance; compares the token |
| `AuthoringWorkspace` `onUseSkill`: `code === "retired"` → nothing placed or reported | a retired completion | stays |
| `LibrarySurface`: the workspace mounts only while `drafts[openDraftId]` stands | a forgotten id | stays |
| `DraftSourceTab`, `DraftRegisterTab`, `DraftConversation`, `SpecEditor` `catch` → component-local error | — | stays; these hold no stale-id logic, and a retired act's component is unmounted by then |

## Rules

### Core

1. **Mint.** The live entry for an id is created with a fresh instance token: at `draft.create`, at the first description of a session found on disk (core start, a sync or a clone bringing a new id), and when a rescan promotes another session under the id. A history replacement (`reread`) and a clone move (`moved`) keep the entry and its token.
2. **Departure.** `forget(id, former)` is the one departure path: a deletion, a project's removal, a sync removing the session, a rescan promoting another. It aborts the turn, compile and enabling controllers of the former entry, deletes the former's compile or enabling marker from `activeCompiles` (never a `compile.run`'s), deletes the entry, announces `draft.removed {projectId, draftId, instance}`, and publishes the session now holding the id with its new token.
3. **Admission.** Every session command but the bootstrap carries `instance`; `admit(id, projectId, instance)` refuses `not_found` when the id is unknown or another project's, and `not_found` naming the id as another session's when the token is not the live entry's. The bootstrap is `draft.create`, `draft.list` and `draft.open`. A draft channel names its instance and is refused when it is not the current one.
4. **Writes.** Every record append and every settle re-checks `live.get(id) === live`; a departed instance records nothing and settles into nothing. Its completion clears only its own marker and controller, then calls `released(id)` so the session the id names dispatches its queue if idle.
5. **Messages.** `draft.state` carries the token in `DraftInfo.instance`; `draft.record`, `draft.source`, `draft.history-replaced` and `draft.removed` carry `instance`. `compile.progress` stays keyed by playbook id, shared with `compile.run`.

### Interface

1. **Adopt.** The store adopts a token from a `draft.create` reply, from each session a `draft.list` reply names, from the `draft.open` reply of an open, and from a `draft.state` for an id it holds nothing under (the state that follows a `draft.removed`, or a session another client created).
2. **Boundary.** A `draft.record`, `draft.source`, `draft.history-replaced` or `draft.removed` whose token the store does not hold for the id is dropped; a `draft.state` with another token while one is held is dropped (the removal that precedes it is what frees the id). A completion (a reply or a refusal, a file pick) of an act started for an instance the store no longer holds is told it retired and writes nothing.
3. **Start-up.** The store holds nothing; the listing adopts every session; a state for an unknown id adopts.
4. **Reconnect.** The listing adopts every session it names. A session named under the project the store holds it in is the held session continued: its transcript is reopened from the first record and its composer text, Source edits and Enable form stay (tokens change across a core restart, so same project means continuation here). A session named under another project with another token, or left out, is forgotten first.
5. **Move.** A `draft.state` with the held token and another project is the same session at a new address: the project updates, everything else stays.
6. **Delete.** The act names the held instance; the reply forgets only that instance and unsubscribes only that instance's channel.

## Tests

The transitions are covered in `packages/core/src/authoring.integration.test.ts` and `packages/ui/src/components/authoring-workspace.test.tsx`: deletion and recreation under the same repository and id yield distinct tokens; a delayed command from the former instance is refused at admission; a history replacement keeps the token, the composer text and the Source edit; a retired enabling's late cleanup leaves the replacement's compile marker standing; a reconnect and a repository move keep the held state (the move in `space-move.integration.test.ts`, where a namespace rename carries the clone).
The queue test's rescan case (`authoring-queue.integration.test.ts`, playbook-library-103) changes with the behavior: the id is freed at the rescan, so the newcomer reads idle and a message sent to it runs at once.
The instance tests the audit shows subsumed are the per-site project comparisons in the former `playbook-library-99` matrix, now one token matrix.
Test clients fill in the instance they hold the way the interface does (`packages/core/src/testing/draft-address.ts`), so a test names an instance only where it tests a mismatch.
