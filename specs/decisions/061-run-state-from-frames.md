<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-061: A Run's State Comes From Its Own Frames

## Status

Accepted (2026-09-13) on evidence captured against a real core in the hermetic browser harness, where a workflow parked in its failure state read a neutral "idle" the moment the turn settled.
Extends [DR-060](060-failed-workflow-control.md) from the failed-workflow notice to the state chip and the interface's own attention derivation; the notice, which already reads the frames, is unchanged.
Failure attention amended by [DR-062](062-ending-a-failed-workflow.md): the divergence scoped as a consequence here closes, the core's ledger holding a parked failure on the same terms the frames do; reading a leaf's state from its own frames stands.

## Context

- One telemetry topic carries more than one machine.
  The leaf run's park and the Captain shell's own controller states arrive on `playbook.fsm.state` alike, in this order:

  ```text
  playbook.fsm.state  {from:"runFirstPhase", to:"failed",   event:"CODE_FAILED"}
  playbook.fsm.state  {from:"hub",           to:"deciding", event:{type:"BOSS_TURN"}}
  playbook.fsm.state  {from:"deciding",      to:"hub",      event:{type:"xstate.error.actor.0.deciding"}}
  ```

- The interface keeps one scalar for that topic and overwrites it on every report, so once a turn settles the scalar holds the shell's rest state `hub`, which the label table reads as "idle".
  A workflow parked in `failed` therefore reads neutral "idle" at rest, and the interface's failure attention — derived from the same scalar — is dead at rest, leaving only its fallback on the current turn's last error.
  A later ordinary turn that succeeds then drops that fallback while the run view still stands its failed-workflow notice: one parked workflow, two surfaces, opposite answers.
- The pending question never drifted, because it is not read from the scalar: the interface latches the question and lets only the parked machine's own departure clear it, the Captain's reports after the park passing it by.
- The core's fold is already right on both counts and this decision leaves it untouched: it reads the question from telemetry under the rule that another machine's state report, the Captain's own included, leaves the question standing, and it reads failure from `runtime_error` records rather than from any state scalar.
- The frames already hold the answer the scalar cannot give.
  They separate each run, and the deepest frame standing in the failure state is the leaf that failed — which is why the notice reads true today while the chip beside it does not.

## Decision

- The interface reads a leaf run's state from that run's own machine frames, never from the session's last reported state.
  That scalar keeps exactly the meaning it has — the last state the record stream reported, whichever machine reported it — and answers no question about the leaf.
- The chip's failure tone comes from the run's frames, as its waiting tone already comes from the derived pending question.
  At rest, a run standing parked in its failure state makes the chip read the failure label in red and carry that run's own state in its tooltip, a reply owed the Boss still speaking first as it does today.
  Every other label stands, the during-turn "working" and "deciding" voices included, and the tooltip carries a raw id and never a phrase.
- The interface's own attention derivation reads those same frames, so a parked failure keeps summoning until the run leaves that state — the answer the notice already gives.
  The last turn's error keeps covering failures that parked no machine, and the quieter historical mark for a failure that no longer summons is untouched.

## Consequences

- The chip, the notice and the run view's own attention derivation answer from one source, so those surfaces cannot disagree about a parked workflow.
- The ledger's published count keeps its own acknowledgment rule ([DR-035](035-intent-ledger.md)), under which the Boss's next turn settles a failure: the Dashboard badge, the sidebar mark and the tab dot therefore still stand down on a workflow the notice, the chip and the palette's count go on reporting as parked.
- In the interface's own derivation a failure that parks summons until it is recovered rather than until the next turn succeeds, so asking the Captain a question in between costs neither that summons nor the way back.
- Whatever else the interface wants to know about a leaf run has one place to ask, and the scalar's remaining duty is the chip's during-turn voice.
- The rule costs one derivation over frames the fold already keeps; no record, protocol, or core behavior changes.
