// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The app's example (DR-015), adapted from slc 0.7.0's two-agent
// change-and-review demo in its `Roles:` grammar, its two limits
// settled for the clarifications slc 0.12 asked of it (DR-089): the
// first agent's judgments count per loop, its last one in a loop the
// conclusion, and the 2nd loop's commit ends the work unreviewed.
// Staged through the compile pipeline as raw text. The normalized text
// is kept by hand beside the source, in slc's normalized form; the
// gears and the state machine are slc's compile, refreshed from the
// compiled fixture's capture (e2e/fixtures/compiled/README.md) — until
// that capture, of the text before its limits were settled. Display
// content owned by the UI — it never touches config, protocol, or the
// library.
//
// Nothing here is a text of the catalog (localization-4): the stages
// are the example's workflow, the id is the draft the Prefill opens,
// and the title and credit name the example itself. The card's own
// phrases around them — "Example: {title}", "from {credit}" — are the
// texts, and live with the card. Its registration takes the Register
// tab's derived defaults (playbook-library-61), so the example carries
// none.

import source from "./slc-demo/workflow.txt?raw";
import normalized from "./slc-demo/workflow.text.md.txt?raw";
import gears from "./slc-demo/workflow.gears.md.txt?raw";
import fsm from "./slc-demo/workflow.fsm.ts.txt?raw";

export interface SlcDemoExample {
  title: string;
  /** Credit line naming where the example comes from. */
  credit: string;
  /** The draft the Prefill opens in paste mode (DR-058). */
  playbookId: string;
  stages: {
    /** Raw prose the example starts from (workflow.txt). */
    source: string;
    /** The example's normalized text (workflow.text.md), kept by hand
     * in slc's normalized form — the prefill source, since the compile
     * pipeline skips the normalize phase. */
    normalized: string;
    /** GEARS spec items markdown slc compiled (workflow.gears.md). */
    gears: string;
    /** Compiled XState FSM module (workflow.fsm.ts). */
    fsm: string;
  };
}

export const SLC_DEMO: SlcDemoExample = {
  title: "Two-Agent Change-and-Review Workflow",
  credit: "the slc demo",
  playbookId: "workflow",
  stages: { source, normalized, gears, fsm },
};
