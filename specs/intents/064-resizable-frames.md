<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-064: Frames the Reader Can Resize

## Status

Done (2026-09-02).

## Intent

A capped frame — a scroll box holding content of unbounded length that a reader pages through in place — takes the house divider idiom turned horizontal ([DR-030](../decisions/030-workspace-chrome.md)): its bottom edge drags to resize it within bounds, arrow keys adjust it from the keyboard, a double-click resets it, the height is remembered per frame as chrome preference, and the grip hides while the content fits; one shared component carries the idiom so the History frame and the pipeline stage box get it today and any later frame gets it for free.

## Deliverables

- [x] One shared resizable-frame component: a scroll box with a bottom grip that drags within a minimum and maximum, a focusable grip with an accessible name that arrow keys move by one step, double-click resetting to the default, the height remembered per frame id as chrome preference, the grip hidden while the content fits (DR-030).
- [x] The Dashboard's History frame is that component: eight rows by default, four to twenty-four rows by drag, remembered per project group (dashboard-27).
- [x] The Playbooks stage box is that component: its default height kept, resizable, remembered per playbook (playbook-library-22).
- [x] Unit coverage of the component and one browser journey dragging the History frame and reloading to find it remembered; the fit journey stays green.

## Tasks

1. The component and its decision note in DR-030; spec items amended.
2. History frame and stage box on the component; tests and the journey.

## Verification

- `packages/ui`: `npx vitest run` — 23 files, 393 tests, all passing.
  New coverage: the History frame's grip (`dashboard-surface.test.tsx`) — its role, orientation, name, and rows reported as `aria-valuenow`; a pointer drag of two rows; arrow keys held at four and twenty-four rows; a double-click back to eight; the height surviving a remount; and no grip while eight rows hold everything.
  The stage box's grip (`library-surface.test.tsx`) — the same gestures in rem steps, one height serving the card's stages, and the grip naming the open stage.
- `npx tsc --noEmit -p packages/ui`: clean.
- `npm test` (workspaces): 5 node suites, 0 failures.
- `e2e`: `npx playwright test` — 28 journeys passing, including the fit journey (`run-view-105`) at six widths and two heights, `dashboard-44`, the new `dashboard-48` (a real two-row drag, then a reload that finds the frame ten rows tall), and `playbook-library-41` (a four-rem drag of the stage box, remembered across a reload).
- `node packages/cli/dist/cli.js lint`: no problems found.
