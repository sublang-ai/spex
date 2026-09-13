// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A stub `slc` for compile coverage (playbook-library-17): a CommonJS
// script that emits the `<id>.playbook/` layout and the registry
// entry module beside it, the way slc >= 0.2 does, with the role ids
// verbatim from the gears — capitalized on purpose, which the entry
// preserves and the compile flow re-keys onto case-insensitively.
// Its progress lines follow slc's own format, and scripted variants
// fail a phase, ask for clarification, or block until killed, so the
// authoring relay is covered without an agent (DR-058).

import { ARTIFACT_SCHEMAS } from "../config.js";

/** slc's pipeline phases, in order. */
export const SLC_PHASES = ["normalize", "text2gears", "optimize", "gears2fsm", "link"] as const;

/** One scripted run's behavior: pass, fail at a phase, ask for
 * clarification, or stay in flight until killed. */
export type StubSlcStep = "ok" | `fail:${string}` | "clarify" | "block";

const STUB_RUNTIME = `
const fs = require("node:fs");
const path = require("node:path");
const src = process.argv[3];
const base = path.basename(src, ".md");
const srcDir = path.dirname(src);
function progress(line) { process.stderr.write(line + "\\n"); }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function phaseLines(upTo) {
  for (const phase of PHASES) {
    if (phase === upTo) return;
    progress("→ " + phase + " (writing " + base + ".playbook/" + base + "." + phase + ")");
    await wait(PHASE_DELAY_MS);
    progress("✓ " + phase + " wrote " + base + ".playbook/" + base + "." + phase + " (1s)");
  }
}
function emitArtifacts() {
  const dir = path.join(srcDir, base + ".playbook");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, base + ".fsm.ts"),
    [
      'import { setup } from "xstate";',
      "export const demoMachine = setup({}).createMachine({",
      '  id: "demo",',
      '  initial: "ready",',
      "  states: {",
      "    ready: {},",
      "    working: {},",
      "    awaitBossReply: {},",
      "    failed: {},",
      '    done: { type: "final" },',
      "  },",
      "});",
    ].join("\\n"),
  );
  fs.writeFileSync(
    path.join(dir, base + ".gears.md"),
    [
      "# " + base + ": Stub Gears",
      "",
      "## Intent",
      "",
      "A stub compile of " + base + ".",
      "",
      "## External Behavior",
      "",
      "### " + base + "-1",
      "",
      "When the workflow starts, Captain shall prompt " + REQUIRED_ROLE_IDS[0] + ".",
      "",
    ].join("\\n"),
  );
  fs.writeFileSync(
    path.join(dir, base + ".playbook.ts"),
    [
      "export default function createDemoRuntime(options: unknown) {",
      "  return {",
      "    options,",
      "    async init(session: any) { this.session = session; },",
      "    async handleBossInput() {},",
      "    async dispose() {},",
      "  } as Record<string, unknown>;",
      "}",
    ].join("\\n"),
  );
  // The slc entry module: emitted beside the artifact dir, role ids
  // verbatim from the gears (capitalized here on purpose, which schema 2
  // preserves), an options allowlist with cwd, and the schema the shared
  // runtime factory checks.
  fs.writeFileSync(
    path.join(srcDir, base + ".ts"),
    [
      "import createPlaybookRuntime from './" + base + ".playbook/" + base + ".playbook.ts';",
      "const REQUIRED_ROLE_IDS = " + JSON.stringify(REQUIRED_ROLE_IDS) + ";",
      "const entry = {",
      "  id: '" + base + "',",
      "  command: '" + base + "',",
      "  intent: 'Stub Demo - a one-player workflow.',",
      "  artifactSchema: " + ARTIFACT_SCHEMA + ",",
      "  requiredRoleIds: [...REQUIRED_ROLE_IDS],",
      "  validateOptions(value) {",
      "    if (value === undefined) return {};",
      "    if (typeof value !== 'object' || value === null || Array.isArray(value)) {",
      "      throw new Error('playbook options must be an object');",
      "    }",
      "    for (const key of Object.keys(value)) {",
      "      if (key !== 'cwd') throw new Error('unknown option \\"' + key + '\\"');",
      "    }",
      "    return value;",
      "  },",
      "  createRuntime(options) {",
      "    const validated = entry.validateOptions(options.captainOptions);",
      "    return createPlaybookRuntime({ ...validated });",
      "  },",
      "};",
      "export default entry;",
    ].join("\\n"),
  );
}
async function runStep(step) {
  if (step === "ok") {
    await phaseLines(undefined);
    emitArtifacts();
    console.log("stub slc: compiled " + base);
    process.exit(0);
  }
  if (step.startsWith("fail:")) {
    const phase = step.slice(5);
    await phaseLines(phase);
    progress("→ " + phase + " (writing " + base + ".playbook/" + base + "." + phase + ")");
    await wait(PHASE_DELAY_MS);
    progress("✗ " + phase + " failed at " + base + ".playbook/" + base + "." + phase + " (2s)");
    progress("slc: phase \\"" + phase + "\\" failed at \\"" + base + ".playbook/" + base + "." + phase + "\\"");
    progress("error: result 'labeled' declared twice in " + base.toUpperCase() + "-2");
    process.exit(1);
  }
  if (step === "clarify") {
    await phaseLines("text2gears");
    progress("→ text2gears (writing " + base + ".playbook/" + base + ".gears.md)");
    await wait(PHASE_DELAY_MS);
    const report = {
      schema: "sublang.slc.clarification.v1",
      phase: "text2gears",
      target: base + ".playbook/" + base + ".gears.md",
      sources: [src],
      questions: [
        {
          id: "q1",
          question: "Who applies the label when the reviewer disagrees?",
          reason: "The ending changes with the answer.",
          evidence: "Roles: lists Triager and Verifier; no behavior names the tie-break.",
          choices: ["Triager applies", "The Boss decides"],
        },
      ],
    };
    progress("slc: clarification required in phase \\"text2gears\\" at \\"" + report.target + "\\"");
    progress("  [q1] " + report.questions[0].question);
    progress("SLC_CLARIFICATION: " + JSON.stringify(report));
    process.exit(2);
  }
  if (step === "block") {
    await phaseLines("gears2fsm");
    progress("→ gears2fsm (writing " + base + ".playbook/" + base + ".fsm.ts)");
    setInterval(() => {}, 1000);
    return;
  }
  throw new Error("unknown stub step " + step);
}
`;

/**
 * The passing stub: slc's phase lines, then the artifacts and the
 * registry entry with the given role ids.
 */
export function stubSlcSource(rolesLiteral = "['Helper']"): string {
  return stubSlcScriptedSource(["ok"], rolesLiteral);
}

/**
 * A stub whose runs follow `steps` in order — the last step repeating —
 * counted in a `.stub-slc-runs` file beside the source, so one stub
 * fails twice and then passes without the test restarting it. A
 * `delayMs` keeps each run in flight long enough to be observed, and
 * a `phaseDelayMs` holds every phase open that long, so a running
 * phase can be watched (playbook-library-77).
 */
export function stubSlcScriptedSource(
  steps: readonly StubSlcStep[],
  rolesLiteral = "['Helper']",
  options: { delayMs?: number; phaseDelayMs?: number } = {},
): string {
  return `
const PHASES = ${JSON.stringify(SLC_PHASES)};
const REQUIRED_ROLE_IDS = ${rolesLiteral};
const ARTIFACT_SCHEMA = ${ARTIFACT_SCHEMAS[0]};
const STEPS = ${JSON.stringify(steps)};
const PHASE_DELAY_MS = ${options.phaseDelayMs ?? 0};
${STUB_RUNTIME}
const counter = path.join(srcDir, ".stub-slc-runs");
const run = fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0;
fs.writeFileSync(counter, String(run + 1));
setTimeout(() => { void runStep(STEPS[Math.min(run, STEPS.length - 1)]); }, ${options.delayMs ?? 0});
`;
}

/** Fails at `phase` for the first `failures` runs, then passes. */
export function stubSlcFailingSource(phase: string = "gears2fsm", failures = 1, rolesLiteral = "['Helper']"): string {
  return stubSlcScriptedSource([...Array<StubSlcStep>(failures).fill(`fail:${phase}`), "ok"], rolesLiteral);
}

/** Exits 2 with an `SLC_CLARIFICATION:` report on the first run, then passes. */
export function stubSlcClarifyingSource(rolesLiteral = "['Helper']"): string {
  return stubSlcScriptedSource(["clarify", "ok"], rolesLiteral);
}

/** Prints a running phase and sleeps until killed. */
export function stubSlcBlockingSource(rolesLiteral = "['Helper']"): string {
  return stubSlcScriptedSource(["block"], rolesLiteral);
}
