<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-035: The Intent Ledger

## Status

Accepted (2026-08-28); revised (2026-09-02).
Amends [DR-009](009-at-hand-interaction.md), [DR-011](011-project-workspace.md).
Amended by [DR-036](036-file-state-store.md), [DR-038](038-history-is-done-work.md), [DR-051](051-runtime-held-for-a-turn.md), [DR-059](059-issue-delivery-through-dev.md), [DR-062](062-ending-a-failed-workflow.md), [DR-066](066-every-summons-has-a-door.md), [DR-077](077-up-next-is-a-committed-queue.md), [DR-085](085-boss-talks-through-captain.md), [DR-103](103-the-home-and-its-groups.md), [DR-119](119-an-answer-continues-its-intent.md), [DR-134](134-execution-ownership.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- Two owner reviews shaped it: the first named the outcomes interrupted / finished / confirmed, merged confirmation into the attention queue, allowed several intents per session, made history per-project, and deferred usage to a future Insights surface; the second added finished-entry run stats, the tabbed paged Sources band, and visible forge labels.
  A third (2026-09-02) gave running sessions their own band again and decided removal of a closed intent.
- The owner's direction (2026-08-28): managing multiple agents across several projects loses the thread — what are the agents working on and in which sessions, what is recently done or awaits confirmation, what is blocked, and what comes next, without rediscovering the answer after every finish.
  Intents are fine-grained, far finer than tracker tickets, so managing one must cost less than the work it names.
  Issues and PRs are sources of intents but not the only ones; one gesture should turn either into an intent to address now or later, and the moving pieces should stay visibly connected.
- The diagnosis, in order of harm:
  - the unit mismatch: the Boss thinks in intents, but the app tracks sessions — work is scattered across attention entries, running-session rows, forge lists, and record lists with no thread from want to verdict;
  - nothing holds "what's next": every confirmation ends in rediscovery, and the only queue is the per-session composer queue, whose contents die with their session [[run-view-8](../packages/run-view.md#run-view-8)];
  - "awaiting confirmation" has no durable home: a glance clears the turn-awaiting-review summons, and then nothing remembers a verdict is owed — while the evidence on agent fleets says verification, not generation, is the bottleneck [[1]];
  - issue and PR rows dead-end in the external browser [[projects-6](../packages/projects.md#projects-6)], so capture is retyping by hand;
  - the intents-to-finish list [[dashboard-24](../packages/dashboard.md#dashboard-24)] reads no record status, so long-done records list as work forever;
  - attention is derived three times over — the Dashboard selector, the sidebar row marks, the desktop dock tracker — by separate client code that can disagree, while the core-side derivation the law demands [[dashboard-10](../packages/dashboard.md#dashboard-10)] remains unbuilt.
- The vocabulary already names the unit ([DR-017](017-intent-records.md)): the Boss intent is the episodic want.
  What is missing is a row for it between the moment of wanting and the moment of confirming.
- Grounding: shipped agent fleets converge on session lists and triage inboxes, never boards [[2]] [[3]] [[4]]; an inbox is driven to empty, not watched [[5]]; kanban's durable content is the pull system and the WIP limit [[6]] [[7]], and the product already has the limit structurally — one live session per project [[core-service-4](../packages/core-service.md#core-service-4)], serialized turns [[core-service-5](../packages/core-service.md#core-service-5)]; a next action is decided in advance, once [[8]]; delegation to an agent leaves the human the accountable assignee [[9]]; context switches leave residue, so re-entry must be answerable at a glance [[10]] [[11]].

## Decision

- Amends [DR-009](009-at-hand-interaction.md) in what its Dashboard badge counts, the attention queue; extends [DR-029](029-session-history-home.md); amends [DR-011](011-project-workspace.md)'s Dashboard content row and the attention queue's kind table; evolves the Dashboard's work lists, [DR-027](027-linked-views-contract.md)'s routing of work to work surfaces standing.

**An intent is a staged Boss turn.**
The one new entity is the intent: the text of a Boss turn not yet sent, plus where it came from.
The stored intent is the Boss intent itself — the episodic want of [DR-017](017-intent-records.md), captured before its turn instead of only inside one — so no fourth referent joins the vocabulary.
Its fields are acts and provenance only: project, text (the first line is the display title), source (issue, PR, intent record, chat, or none), and timestamps for capture, dispatch (session and turn, re-written by a later dispatch), and close (done or dropped); it is one file in its project's records, its acts appended ([DR-036](036-file-state-store.md), [DR-103](103-the-home-and-its-groups.md)).
There is no stored state column.
Every visible state folds deterministically from intents, the record stream, and review state — arrival-order-independent and restart-identical, the attention law extended [[dashboard-10](../packages/dashboard.md#dashboard-10)] [[dashboard-11](../packages/dashboard.md#dashboard-11)]:

| Derived state | Holds while | Tone |
| --- | --- | --- |
| Queued | not closed and not bound to a dispatch | neutral; the next row's standing says what precedes it ([DR-077](077-up-next-is-a-committed-queue.md)) |
| Working | its latest attributed turn is active | the session's own tone, never recomputed |
| Interrupted | its execution stands stopped on the Boss — a pending question or an unresolved failure among its turns | amber; red for the failure |
| Finished | its last attributed turn completed and no verdict yet | amber, waiting on the human |
| Done / Dropped | closed, by the verdict acts alone | quiet history |

A session serves several intents over its life: an intent's turns run from its dispatch until the next intent's dispatch in that session, so the newest open intent owns the conversation — a follow-up turn returns it to Working — while its elders keep their own outcomes and await their verdicts.
A Boss turn sent while a question waits continues the work that asked ([DR-119](119-an-answer-continues-its-intent.md)); a question clears only when the runtime reports it gone ([DR-085](085-boss-talks-through-captain.md)); a failure that parked a run stands until that run leaves its failure state ([DR-062](062-ending-a-failed-workflow.md)); the fold re-derives as each resolves.
An aborted dispatch releases the intent: the binding clears, the text is editable again, and the row reappears in the queue — a session dying mid-turn releases the same way, so restart re-derives the same answer.
Issues and PRs are provenance, never mirrored state: the intent keeps number, title, and URL, and the agents in the session reach the rest themselves with `gh` in the project cwd.
Intent records stay legally untouched: the app never depends on a record's content, a record-sourced intent's text is just text if the record is deleted, and no spec cites an IR [[meta-18](../meta.md#meta-18)].

**Capture is one gesture from every source.**

- Issue rows and PR rows — on the Dashboard and the project's Overview alike, one representation [[forge-work-lists-1](../packages/forge-work-lists.md#forge-work-lists-1)] — carry a Queue control seeding editable text — an issue's dispatches `/dev` with it ([DR-059](059-issue-delivery-through-dev.md)), a PR's reads `Review PR #45: <title>`, URL included; the title keeps opening the canonical page.
- Open intent-record rows carry the same control (`Resume IR-<N>: <title>`); the records listing reads each record's Status line so only unfinished records count as work.
- In a session, the composer offers one secondary action — Add to Up next — capturing the typed text as a queued intent: the mid-run "we should also fix that later," shelved without derailing the run.
- Each project's queue ends in an inline add row.
- No capture action offers Start beside it, and capture itself sends no turn ([DR-077](077-up-next-is-a-committed-queue.md)).
- At most one open intent per source artifact — issue, PR, or record, per project — so nothing sourced is captured twice; chat and unsourced intents are unconstrained.
  A captured source row shows its open intent's state in place of the control, and regains the control once that intent closes; provenance reads in both directions.
- Queueing shows the shelf: the new row is revealed and briefly highlighted where it landed.

**The queue is the plan.**
One queue per project — the project is the execution lane, so only its order has dispatch meaning — and the next to run is the oldest intent waiting ([DR-103](103-the-home-and-its-groups.md)).
There is no priority field to groom and no link between intents.

**Dispatch is sending, into the lane that exists.**
Start on the next intent, or on any queued intent from its row's menu ([DR-103](103-the-home-and-its-groups.md)), stages its text into the composer of the project's current conversation, focused, or of the start tab where none exists, where sending creates the session in the same motion [[run-view-26](../packages/run-view.md#run-view-26)] ([DR-051](051-runtime-held-for-a-turn.md)).
Reusing the current conversation is the default policy: the lane's accumulated Captain and player context is the point of a session, and a fine-grained intent must not pay a cold start; a fresh lane is the start tab.
The Boss reads, appends context, and presses Enter: the submission carries the intent's id, keeping the Boss the sender of every turn and Spex free of orchestration semantics ([DR-003](003-runtime-reuse.md)).
The staged text wears the intent's chip; emptying the composer or dismissing the chip detaches the id, and sending then stamps nothing — the intent simply stays queued.
The dispatch binds when the turn starts, not when Enter falls: a submission waiting in the composer queue [[run-view-8](../packages/run-view.md#run-view-8)] leaves the intent queued with its chip on the pending bubble, so a discarded queue discards no intent.
Text is editable while queued; from binding on it is history.
Settled work advances the queue on its own ([DR-077](077-up-next-is-a-committed-queue.md)).

**Execution has three outcomes, and attention lists two of them.**
A dispatched intent works, then either stands interrupted on the Boss or finishes; only a verdict — Confirm or Drop — closes it, because a finish is a claim and the Boss rules on claims.
The attention queue lists interrupted intents first, then finished ones, longest waiting first within each band; it and the verdicts count only this runtime's own records ([DR-134](134-execution-ownership.md)).
This amends the four-kind table [[dashboard-1](../packages/dashboard.md#dashboard-1)] [[dashboard-2](../packages/dashboard.md#dashboard-2)]: the old kinds survive as the interruption reasons — question and failure, a permission request raising no entry ([DR-066](066-every-summons-has-a-door.md)) — and the finished band absorbs turn-awaiting-review.
A session running outside the ledger still summons: its question, failure, or finished turn enters the same bands as a session entry, a finished chat turn cleared by viewing [[dashboard-4](../packages/dashboard.md#dashboard-4)], while an intent entry clears only with its state: resolution for interrupted, verdict for finished.
The badge counts the queue [[dashboard-9](../packages/dashboard.md#dashboard-9)], so a finished intent is attention until ruled on; red still means chase this ([DR-029](029-session-history-home.md)).
Activating an entry opens the session at the intent's place — the pending question, the failure, or the end of its final turn.
A finished entry carries the run's basic stats, folded from the same records as everything else — the review rounds its turns held foremost — so the verdict is informed before the click.
A turn that finishes reporting an engagement failure interrupts rather than finishes: the Boss rules on it or continues with a follow-up turn.
Drop is a verdict on a worked intent; Done requires a finish, because confirming work that never ran would falsify the ledger; an intent dropped before it was worked leaves the ledger without a trace ([DR-038](038-history-is-done-work.md)).

**A verdict shows the next.**
Each finished intent's delivery card sits at its own turn's end in the thread — the intent's title, its provenance chip, Confirm foremost, Drop beside — and on either verdict it resolves in place into the project's next intent, its standing and Start as Up next shows them ([DR-077](077-up-next-is-a-committed-queue.md)).
The two doorways name the next as well: the Captain home names the queue head, and the attention queue's all-clear state names the globally next head, first by sidebar order, with plain all-clear copy when nothing waits [[dashboard-8](../packages/dashboard.md#dashboard-8)].

**The Dashboard reads as one question, top to bottom.**
"What needs me — interrupted, then finished — what is working, and where is each project."

| Section | Content |
| --- | --- |
| Attention queue | interrupted intents, then finished ones, longest waiting first within each; entries lead with the intent's title, session entries standing in where no intent is bound; activating one opens the session at the intent's place |
| Running | every live session whose turn is in flight and which no attention entry summons — the queue answers "what needs me", the band "what is working"; the badge counts the attention queue alone |
| Projects | one group per project in fixed sidebar order, four bands: **History** — done work newest first in a compact scroll that fetches older pages as the reader goes ([DR-038](038-history-is-done-work.md)); **Now** — the session's mark, playbook, human state, and elapsed with the open intent the lane serves, or the latest Boss turn for plain chat, which stays un-ledgered and free; **Up next** — the queue; **Sources** — a collapsed issues · PRs · open-records line with data age [[dashboard-14](../packages/dashboard.md#dashboard-14)], expanding in place to three tabs — issues, PRs, open records — each paginated, rows carrying their forge labels and Queue controls |

Usage leaves the Dashboard; its rollups stay in the core read model for the planned Insights surface.
A list, not a board: every state here is the consequence of a real act — send, finish, verdict — so a card dragged between columns could only lie or duplicate the act.
The project filter stays visibility-only with the ghost grammar ([DR-027](027-linked-views-contract.md)); empty sections keep instructive guidance [[dashboard-8](../packages/dashboard.md#dashboard-8)].
In the session, the bound turn's bubble wears the intent's source chip, and while an intent is open a slim line above the composer names what the lane is working on — re-entry answered where the eye lands.

**One derivation, one law.**
The intent fold and the attention fold are one core-side read model — the derivation the law always demanded [[dashboard-10](../packages/dashboard.md#dashboard-10)] — and every consumer reads it.
An intent's only writers are Boss commands — queue, edit, close, remove — plus the dispatch binding on the existing submit; one per-project broadcast announces ledger changes.
A remove act retires a closed intent from every band behind the inline confirm ([DR-010](010-interface-craft.md) §4), its acts kept, so a row the Boss no longer wants on the record leaves History and no state column returns.

**Considered and declined**, so the alternatives cannot re-enter piecemeal:

- a kanban board: the columns exist only as derived bands, WIP is already limited structurally, and fine-grained intents churn faster than card ceremony tolerates — a board would be state grooming wearing the costume of control [[6]];
- auto-capturing engagements or turns as intents: the ledger means something because entering it is a Boss act; auto-minted rows would demand verdicts nobody asked for, flood a fine-grained ledger, and turn the record fold into a second writer of stored state;
- a session per intent, the cloud-fleet shape: every fine-grained intent would pay a cold Captain start, against the lane law of one working turn per project; the current conversation is reused by default and a fresh lane is the start tab;
- a priority field: a stale P1 is grooming debt, and the status palette has no hue to give it ([DR-026](026-data-graphics-craft.md) §2);
- dependencies between intents: a graph the Boss maintains instead of a list;
- the first draft's summons-and-ledger split — view-cleared attention entries beside a separate To-confirm section: two places answering "what needs me"; the owner merged them, so finished work is attention until ruled on and the queue's two bands carry it;
- a global done-recently section: history is read per project, where re-entry happens, and the attention queue is already the one cross-project ranking;
- a fifth navigation surface: the Dashboard is deliberately the one cross-project surface ([DR-011](011-project-workspace.md));
- a work-item entity unifying issues, PRs, and IRs: a sync engine against two systems of record, and app law depending on records no spec may cite [[meta-18](../meta.md#meta-18)];
- capturing from selected thread text: prefills what the composer's Add to Up next already captures; it earns its place if dogfooding shows mid-run capture losing to retyping;
- ledger text search: bounded queues plus the project filter suffice at today's volumes; search earns a decision when volume demands it, as with sessions ([DR-029](029-session-history-home.md)).

## Consequences

- The dashboard package is built around these sections: the intent read model and its derived states land as items, the attention items become the two-band intent-titled queue with its clearing rules, the History band's paging lands as read-model items, and the usage section retires from the Dashboard while the usage rollup read model stays core-side for the planned Insights surface; [[dashboard-24](../packages/dashboard.md#dashboard-24)] evolves into the Sources contract with capture controls and the record-status read.
- [DR-011](011-project-workspace.md)'s Dashboard content row reads attention queue and project groups, so no record still describes the retired sections.
- The core-service package carries the intents, the intent commands, the dispatch binding on submit, the per-project broadcast, the turn-attribution rule, the one-open-source-artifact invariant, the history paging read, and fixture-stream coverage of every derived state in the dashboard package's style.
- The run-view package carries the delivery card at each intent's final turn, attention activation focusing the session at the intent's place, the composer's Add to Up next and staged-intent chip, the working line, and the Captain home next card.
- The projects and forge-work-lists packages share the Queue control and representation between project and Dashboard source rows; the forge adapter itself is untouched.
- [[spec-view-14](../packages/spec-view.md#spec-view-14)]'s records listing carries the Status read; the records reader is otherwise unchanged.
- The Dashboard attention selector, the sidebar row marks, and the desktop dock tracker read the one core fold, ending the three-derivations drift named in Context; the ledger lives in the core, so remote serving carries it unchanged ([DR-033](033-remote-gui-serving.md)).
- Delivery binds to the [DR-026](026-data-graphics-craft.md) §9 design check: both themes, realistic multi-project data, contrast composites pinned by tests.

## References

[1]: https://addyo.substack.com/p/the-80-problem-in-agentic-coding "A. Osmani, The 80% Problem in Agentic Coding"
[2]: https://github.blog/news-insights/company-news/welcome-home-agents/ "GitHub, Introducing Agent HQ: mission control for agent tasks"
[3]: https://cursor.com/docs/cloud-agent "Cursor, Cloud Agents documentation"
[4]: https://developers.openai.com/codex/cloud "OpenAI, Codex cloud task list"
[5]: https://github.blog/changelog/2019-11-12-notifications-beta/ "GitHub Changelog, Notifications inbox beta: triage, respond, clear"
[6]: https://djaa.com/revisiting-the-principles-and-general-practices-of-the-kanban-method/ "D. J. Anderson, Revisiting the Principles and General Practices of the Kanban Method"
[7]: https://businessmap.io/continuous-flow/littles-law "Businessmap, What Is Little's Law?"
[8]: https://gettingthingsdone.com/2011/02/how-is-a-next-action-list-different-from-a-to-do-list/ "David Allen Co., How is a Next Action List Different from a To Do List?"
[9]: https://linear.app/now/our-approach-to-building-the-agent-interaction-sdk "Linear, Our approach to building the Agent Interaction SDK (assignment vs delegation)"
[10]: https://ics.uci.edu/~gmark/chi08-mark.pdf "G. Mark, D. Gudith, U. Klocke, The Cost of Interrupted Work, CHI 2008"
[11]: https://ideas.repec.org/a/eee/jobhdp/v109y2009i2p168-181.html "S. Leroy, Why is it so hard to do my work? Attention residue in task switching, OBHDP 109(2), 2009"
