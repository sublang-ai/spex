// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The app's example (DR-015), adapted from slc 0.7.0's two-agent
// change-and-review demo in its `Roles:` grammar: its two limits are
// settled — the first agent's 3rd judgment concludes an argument, and
// findings left after the 2nd loop are reported at the finish — so the
// bundled slc asks no clarification of it (DR-089). Staged through the
// compile pipeline as raw text; the gears and the state machine are
// slc's output, refreshed from the compiled fixture's capture
// (e2e/fixtures/compiled/README.md). Display content owned by the UI —
// it never touches config, protocol, or the library.
//
// Nothing here is a text of the catalog (localization-4): the stages
// are the vendored workflow, the id is the draft the Prefill opens, and
// the title and credit name the example itself. The card's own phrases
// around them — "Example: {title}", "from {credit}" — are the texts,
// and live with the card. Its registration takes the Register tab's
// derived defaults (playbook-library-61), so the example carries none.

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
    /** slc's normalized text (workflow.text.md) — the prefill source,
     * since the compile pipeline skips the normalize phase. */
    normalized: string;
    /** GEARS spec items markdown (workflow.gears.md). */
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
