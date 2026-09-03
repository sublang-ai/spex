<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-064: Frames the Reader Can Resize

## Status

Queued.

## Intent

A capped frame — a scroll box holding content of unbounded length that a reader pages through in place — takes the house divider idiom turned horizontal ([DR-030](../decisions/030-workspace-chrome.md)): its bottom edge drags to resize it within bounds, arrow keys adjust it from the keyboard, a double-click resets it, the height is remembered per frame as chrome preference, and the grip hides while the content fits; one shared component carries the idiom so the History frame and the pipeline stage box get it today and any later frame gets it for free.

## Deliverables

- [ ] One shared resizable-frame component: a scroll box with a bottom grip that drags within a minimum and maximum, a focusable grip with an accessible name that arrow keys move by one step, double-click resetting to the default, the height remembered per frame id as chrome preference, the grip hidden while the content fits (DR-030).
- [ ] The Dashboard's History frame is that component: eight rows by default, four to twenty-four rows by drag, remembered per project group (dashboard-27).
- [ ] The Playbooks stage box is that component: its default height kept, resizable, remembered per playbook (playbook-library-22).
- [ ] Unit coverage of the component and one browser journey dragging the History frame and reloading to find it remembered; the fit journey stays green.

## Tasks

1. The component and its decision note in DR-030; spec items amended.
2. History frame and stage box on the component; tests and the journey.

## Verification

Recorded on completion.
