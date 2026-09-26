// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The compile band's fold (playbook-library-57): slc's lines become
// human-named phases, heartbeats keep the running phase alive, an
// unknown phase is appended, and a failed phase carries its output.

import { describe, expect, test } from "vitest";

import { foldCompileLog, phaseLabel } from "./compile-log.js";

const t = 1_700_000_000_000;

describe("foldCompileLog", () => {
  test("slc's lines fold into the pipeline's phases in human words", () => {
    const lines = [
      "running: npx @sublang/slc playbook triage.md",
      "→ normalize (writing triage.playbook/triage.text.md)",
      "✓ normalize wrote triage.playbook/triage.text.md (2s)",
      "→ text2gears (writing triage.playbook/triage.gears.md)",
    ];
    const fold = foldCompileLog(lines, [t, t + 1000, t + 3000, t + 3500]);
    // The fold holds ids only; the row names each as it renders.
    expect(fold.phases.map((phase) => phaseLabel(phase.id))).toEqual([
      "Normalize",
      "Spec items",
      "Optimize",
      "Machine",
      "Link",
      "Package",
    ]);
    // The compiler's ids ride along for the tooltips (DR-010 §2).
    expect(fold.phases.map((phase) => phase.id)).toEqual([
      "normalize",
      "text2gears",
      "optimize",
      "gears2fsm",
      "link",
      "spex",
    ]);
    expect(fold.phases[0]).toMatchObject({ status: "done", elapsed: "2s" });
    expect(fold.phases[1]).toMatchObject({ status: "running", startedAt: t + 3500 });
    expect(fold.phases[2].status).toBe("waiting");
    expect(fold.status).toEqual(["running: npx @sublang/slc playbook triage.md"]);
    expect(fold.lastOutputAt).toBe(t + 3500);
    expect(fold.complete).toBe(false);
    expect(fold.canceled).toBe(false);
  });

  test("a heartbeat keeps the phase running and moves the last-output clock", () => {
    const fold = foldCompileLog(
      ["→ text2gears (writing x)", "… text2gears still running (30s)", "… text2gears still running (1m00s)"],
      [t, t + 30_000, t + 60_000],
    );
    expect(fold.phases[1]).toMatchObject({ status: "running", elapsed: "1m00s", startedAt: t });
    expect(fold.lastOutputAt).toBe(t + 60_000);
  });

  test("a failed phase is marked and keeps the lines printed under it", () => {
    const fold = foldCompileLog([
      "→ gears2fsm (writing triage.playbook/triage.fsm.ts)",
      "✗ gears2fsm failed at triage.playbook/triage.fsm.ts (6m40s)",
      "result 'labeled' declared twice in TRIAGE-2",
      "  at Results: bullet 3",
    ]);
    expect(fold.failed?.id).toBe("gears2fsm");
    expect(phaseLabel(fold.failed!.id)).toBe("Machine");
    expect(fold.failed).toMatchObject({ status: "failed", elapsed: "6m40s" });
    expect(fold.failed?.output).toEqual([
      "result 'labeled' declared twice in TRIAGE-2",
      "  at Results: bullet 3",
    ]);
  });

  test("Spex's own lines fold into the Package phase and report the roles", () => {
    const fold = foldCompileLog([
      "✓ link wrote triage.playbook/triage.registry.mjs (1s)",
      "packaging: bundling the FSM for introspection",
      "introspected states: idle=ready final=done park=[awaitBossReply]",
      "packaging: wrapping and bundling the slc registry entry",
      "derived roles: Triager, Verifier",
      "compile complete",
    ]);
    const pkg = fold.phases[fold.phases.length - 1];
    expect(pkg.id).toBe("spex");
    expect(pkg.status).toBe("done");
    expect(pkg.output).toHaveLength(4);
    expect(fold.roles).toEqual(["Triager", "Verifier"]);
    expect(fold.complete).toBe(true);
  });

  test("a phase the row lacks is appended before Package, in the compiler's order", () => {
    const fold = foldCompileLog([
      "→ normalize (writing a)",
      "✓ normalize wrote a (1s)",
      "→ lint (writing b)",
      "✓ lint wrote b (3s)",
    ]);
    // Appended after the compiler's known phases, before Spex's own
    // packaging step, which stays last.
    expect(fold.phases.map((phase) => phase.id)).toEqual([
      "normalize",
      "text2gears",
      "optimize",
      "gears2fsm",
      "link",
      "lint",
      "spex",
    ]);
    // An unknown id reads as itself rather than a made-up word.
    const lint = fold.phases.find((phase) => phase.id === "lint")!;
    expect(phaseLabel(lint.id)).toBe("lint");
    expect(lint).toMatchObject({ status: "done", elapsed: "3s" });
    expect(fold.phases[fold.phases.length - 1].id).toBe("spex");
  });

  test("the cancel line marks the fold canceled and stays status, never output", () => {
    const fold = foldCompileLog(["→ optimize (writing a)", "◇ compile canceled"]);
    expect(fold.canceled).toBe(true);
    expect(fold.status).toEqual(["◇ compile canceled"]);
    expect(fold.phases[2].output).toEqual([]);
  });

  test("phaseLabel names the compiler's ids and Spex's packaging failure", () => {
    expect(phaseLabel("text2gears")).toBe("Spec items");
    expect(phaseLabel("gears2fsm")).toBe("Machine");
    expect(phaseLabel("packaging")).toBe("Package");
    expect(phaseLabel("spex")).toBe("Package");
    expect(phaseLabel("toolchain")).toBe("toolchain");
  });
});
