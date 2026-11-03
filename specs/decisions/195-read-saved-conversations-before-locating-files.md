<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-195: Read Saved Conversations Before Locating Files

## Status

Accepted (2026-11-02) on the owner's request to explain where conversations are saved, distinguish them visually, group them by project and explain why a folder is needed.
Amends [DR-194](194-saved-work-is-a-choice-not-setup-debt.md) in recovery identity, source explanation and the distinction between reading history and locating project files.

Amended by [DR-196](196-a-review-count-and-a-way-back.md) in shared explanation and postponed-task navigation.

Amended by [DR-214](214-project-navigation-and-contextual-recovery.md) in the saved reader's return: Back to Space opens its own place's review and reveals dismissed folder tasks.

## Context

Conversation records are held by the selected Spex core, separately from project files.
The repair does not establish whether those records were synced with a Space, and sign-in does not establish their source.
Saved history is already readable without a paired project folder; requiring a folder choice before offering it obscures that useful action.
A known project owns its conversations, but imported personal history can have no project name and several recorded working directories.
Locating files restores the project relationship; choosing a different folder does not make a relocated checkpoint continuable.

## Decision

- Explain once that conversation history is saved in Spex on this computer, or on the named server, separately from project files; make no claim of exclusive local storage or successful sync.
- Present each known project as its own named group, with a folder icon and conversation count; keep unnamed records as Earlier conversations, never inventing a project from storage names or paths.
- Render previews as conversation rows with a chat-bubble icon, recognizable title and a known saved date; an identified conversation opens its history directly without asking for a folder or starting work.
- Keep different saved-record groups independent even when their project names match; display every recorded folder so unnamed history does not appear to belong to an invented single project.
- Explain that reading is available now while work involving project files needs those files, and name the separate action Locate folder… rather than Choose project….
- The editor asks for the existing folder used for this work, says that it creates or downloads no project, and makes clear that its choice applies only to all conversations in that group.
- Files unavailable here do not prevent reading history or postponing the folder task.
- A folder choice promises neither checkpoint relocation nor successful continuation; the existing continuation checks remain authoritative.

## Consequences

The screen answers where the history is, what can be read now and why locating files is a separate task.
Several projects without local folders each keep their own history and folder action.
Conversation previews carry their real session identity; older responses without an identity remain noninteractive text.
The existing preservation, validation, retry, focus and pending-state behavior remains unchanged.
