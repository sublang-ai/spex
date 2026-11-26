<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-240: A Script Step Shows What It Ran

## Status

Accepted (2026-11-15).
Amends [DR-031](031-machine-call-tree.md).

## Context

- In packaged-app sessions one check step exited 1 in three runs for two different causes, and nothing in the app showed its command or what it printed [[1]].
- A workflow may hold script steps: commands the runtime runs itself, whose exit status alone picks the next state.
  A nonzero exit often ends the run in a failure terminal, whose reason ([DR-231](231-a-failure-terminal-reads-failed.md)) was authored before the run and names one assumed cause.
- The runtime records each completed script step in the session's records: its state and exit status and, from Playbook 19.0.0 on [[2]] [[3]], the command as run, how long it took, and a bounded tail of what it printed.
- The run view read none of it.
  While a run is underway its progress lines fold into its card, the script's status line among them, so a reader saw neither the step nor its exit status.
- The runtime gives the printed text to no agent, the Captain included: it is untrusted text for people.
  The Captain is told the step, its command and its exit status, so the output is readable only where the host shows it.
- Considered and declined:
  - a thread line per script step: a run's progress is drawn on its card, and a looping workflow's check would fill the thread;
  - every run of a step: a loop runs its check once per round, and the step's latest run is the one the run's standing rests on;
  - a nonzero exit in the failure colour: it is a branch the workflow authored — a failed check may lead to a fix — and "failed" is a run's word ([DR-160](160-the-captain-dispatches-in-plain-sight.md));
  - dropping or redacting the output at the core: an agent's tool output is stored unredacted already, and a shared session could not be diagnosed without what its gate printed;
  - handing the output to the Captain or a player: it is text a command printed, which could instruct an agent.

## Decision

- Amends [DR-031](031-machine-call-tree.md): a run's card additionally lists the script steps the run ran; the card's drawing, strip and settlement stand.
- A run's card lists each script step the run has run: the step's name, its exit status and how long it took, read from the step's latest record.
- A record belongs to the open run standing in the record's state when it arrives, the innermost where several do.
- A step's row unfolds to the command as run and to what it printed, each as inert preformatted text: nothing in it becomes Markdown, a link or media.
  The row says where earlier output was not kept and where the command printed nothing.
- A step whose latest exit was nonzero is listed on the card in either form, the strip or the drawing, and starts unfolded.
  A step that exited zero is listed only while the card shows its drawing, and starts folded.
- The reader's fold is arrangement only: it changes no folded state.
- A record that carries only the exit status, from an engine before that release, lists the step with its status and unfolds nothing.
- The record stays in the session's records as the runtime wrote it and syncs and is shared with the session.
  Spex redacts nothing and hands the text to no agent.
- The card's status, the attention count, the ledger and queue advancement read what they read before.

## Consequences

- A reader sees why a gate failed, in the command's own words, beside the reason the workflow authored.
- A replay renders the same rows: the records are part of the stored session.
- What a command printed — a path, a token — goes wherever its session is synced or shared.
- A session recorded by an earlier engine shows each script step's exit status alone.
- An earlier run of a step run again is not shown; its record stays in the session.

## References

[1]: https://github.com/sublang-ai/spex/issues/380 "Spex issue 380 — a failed playbook run reads done, and the app cannot show why it failed"
[2]: https://github.com/sublang-ai/playbook/issues/104 "Playbook issue 104 — a script step records only its exit status"
[3]: https://github.com/sublang-ai/playbook/releases/tag/v19.0.0 "Playbook 19.0.0 — a script step records its output and its command"
