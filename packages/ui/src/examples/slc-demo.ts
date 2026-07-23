// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The slc demo example (DR-015): the two-agent task workflow staged
// through the compile pipeline, vendored as raw text. Display content
// owned by the UI — it never touches config, protocol, or the library.

import source from "./slc-demo/workflow.txt?raw";
import normalized from "./slc-demo/workflow.text.md.txt?raw";
import gears from "./slc-demo/workflow.gears.md.txt?raw";
import fsm from "./slc-demo/workflow.fsm.ts.txt?raw";

export interface SlcDemoExample {
  title: string;
  /** Credit line naming where the example comes from. */
  credit: string;
  /** Compile-form prefill suggestions (DR-015). */
  playbookId: string;
  command: string;
  intent: string;
  /** Comma-separated role suggestions matching the roles input. */
  roles: string;
  stages: {
    /** Raw prose the demo starts from (workflow.txt). */
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
  title: "Two-Agent Task Workflow",
  credit: "the slc demo",
  playbookId: "workflow",
  command: "workflow",
  intent:
    "Two-Agent Task Workflow — Use two agents to carry out the input task.",
  roles: "Coder, Reviewer",
  stages: { source, normalized, gears, fsm },
};
