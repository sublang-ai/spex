// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, expect, test } from "vitest";

// The list is the runtime's own (DR-076), reaching the test through the
// boundary that reads it — never through the catalogue, which would
// then be checked against itself.
import { PLAYBOOK_FAILURE_CODES } from "@sublang/spex-core/protocol";

import {
  FAILURE_CATALOGUE,
  causePhrase,
  causeStep,
  readRecordFailure,
  standingLine,
  standingReason,
} from "./failure-catalogue.js";

/** One evidence object carrying every member any code reads, so a row
 * is exercised with the shape its own code brings (Playbook DR-063
 * §1) without a per-code fixture. */
const SAMPLE = {
  required: "one-commit",
  observed: "worktree-only-change",
  baselineHead: "a1b2c3d4e5f6",
  afterHead: "f6e5d4c3b2a1",
  commitOid: "0123456789ab",
  paths: {
    uncommitted: ["src/a.ts", "src/b.ts"],
    altered: ["src/c.ts"],
    lost: ["src/lost.ts"],
    changed: ["src/changed.ts"],
    truncated: 3,
  },
  reason: "the candidate stayed invalid",
  roleId: "coder",
  playerId: "dev.coder",
  error: "HTTP 429 rate limit exceeded",
  errorCode: "rate_limited",
  playbookId: "review",
  cause: { code: "receipt-missing", evidence: { baselineHead: "a1b2c3" } },
};

describe("run-view-148: every Playbook failure code is phrased", () => {
  test("each code has a row, and every phrase says something", () => {
    for (const code of PLAYBOOK_FAILURE_CODES) {
      const row = FAILURE_CATALOGUE[code];
      expect(row, `no catalogue row for "${code}"`).toBeTruthy();
      // The sample evidence and an absent one both have to read: a
      // record from an older runtime carries no evidence at all.
      for (const evidence of [SAMPLE, undefined]) {
        const phrase = row.phrase(evidence);
        expect(typeof phrase, code).toBe("string");
        expect(phrase.trim(), `"${code}" phrased empty`).not.toBe("");
        // A phrase is a phrase, not a sentence (DR-069).
        expect(phrase.endsWith("."), `"${code}" ended in a full stop`).toBe(
          false,
        );
        const step = row.bossStep?.(evidence);
        if (step !== undefined) expect(step.trim()).not.toBe("");
      }
    }
  });

  test("the catalogue holds no code Playbook does not export", () => {
    expect(Object.keys(FAILURE_CATALOGUE).sort()).toEqual(
      [...PLAYBOOK_FAILURE_CODES].sort(),
    );
  });
});

describe("run-view-147: the phrases and their evidence", () => {
  test("paths print as a list with the omitted count", () => {
    expect(
      causePhrase({
        code: "pre-existing-lost",
        evidence: { paths: { lost: ["a.ts", "b.ts"], truncated: 3 } },
      }),
    ).toBe("Uncommitted changes you had were lost: a.ts, b.ts, … and 3 more");
  });

  test("a commit with residue names the commit and what it left", () => {
    expect(
      causePhrase({
        code: "commit-residual",
        evidence: {
          commitOid: "0123456789abcdef",
          paths: { uncommitted: ["a.ts"], altered: ["b.ts"] },
        },
      }),
    ).toBe("Committed 01234567 but left changes uncommitted: a.ts, b.ts");
  });

  test("a missing commit says whether anything changed", () => {
    expect(causePhrase({ code: "commit-missing" })).toBe("Committed nothing");
    expect(causeStep({ code: "commit-missing" })).toBeUndefined();
    expect(
      causePhrase({
        code: "commit-missing",
        evidence: { paths: { uncommitted: ["a.ts", "b.ts"] } },
      }),
    ).toBe("Changed 2 files without committing: a.ts, b.ts");
  });

  test("a player failure reads in the adapter's own plain phrase, with its step", () => {
    const cause = {
      code: "player-failed",
      evidence: {
        roleId: "coder",
        playerId: "dev.coder",
        error: "Error: OAuth session expired",
      },
    };
    expect(causePhrase(cause)).toBe(
      "dev.coder failed: The agent's sign-in has expired — in a terminal, sign in again with that agent's CLI",
    );
    expect(causeStep(cause)).toBe("Sign in to dev.coder again");
  });

  test("an adapter message no pattern knows prints as itself, with no step", () => {
    // The runtime attaches the adapter's error as `{ name, message }`
    // (Playbook DR-063 §1). A message the mapping has not met is the
    // only account of the failure there is, so the line carries it
    // rather than saying nothing but who failed (run-view-147).
    const cause = {
      code: "player-failed",
      evidence: {
        roleId: "coder",
        playerId: "dev.coder",
        error: {
          name: "Error",
          message:
            "Selected model is at capacity. Please try a different model.",
        },
      },
    };
    expect(causePhrase(cause)).toBe(
      "dev.coder failed: Selected model is at capacity. Please try a different model.",
    );
    // Nothing outside Spex answers a message nothing recognized.
    expect(causeStep(cause)).toBeUndefined();
  });

  test("a message longer than the line takes is bounded with an ellipsis", () => {
    const phrase = causePhrase({
      code: "player-failed",
      evidence: {
        roleId: "coder",
        error: { name: "Error", message: "A".repeat(400) },
      },
    });
    const said = phrase!.slice("coder failed: ".length);
    expect(said).toHaveLength(120);
    expect(said).toBe(`${"A".repeat(119)}…`);
  });

  test("the judge's failure carries what the adapter said beside its reason", () => {
    // The reason names the step that failed; the adapter's message is
    // why it did, under the same bound (run-view-147).
    expect(
      causePhrase({
        code: "judge-failed",
        evidence: {
          reason: "judge transport failed",
          error: {
            name: "Error",
            message: "Selected model is at capacity.",
          },
        },
      }),
    ).toBe(
      "Couldn't judge the result: judge transport failed — Selected model is at capacity.",
    );
    // A known message still reads in its plain phrase, and an evidence
    // carrying no error leaves the reason standing alone.
    expect(
      causePhrase({
        code: "judge-failed",
        evidence: { reason: "judge transport failed", error: "HTTP 429" },
      }),
    ).toBe(
      "Couldn't judge the result: judge transport failed — The provider rate-limited the call — it can be retried",
    );
    expect(
      causePhrase({
        code: "judge-failed",
        evidence: { reason: "judge transport failed" },
      }),
    ).toBe("Couldn't judge the result: judge transport failed");
  });

  test("a child's failure is phrased by the child's own cause", () => {
    expect(
      causePhrase({
        code: "child-failed",
        evidence: {
          playbookId: "review",
          cause: { code: "aborted" },
        },
      }),
    ).toBe("/review failed: Stopped before it finished");
  });

  test("a runtime defect names itself and asks to be reported", () => {
    const cause = { code: "runtime-defect", evidence: { reason: "no fence" } };
    expect(causePhrase(cause)).toBe("A Playbook defect: no fence");
    expect(causeStep(cause)).toBe("Report it");
  });

  test("a code the catalogue has not met still reads", () => {
    expect(causePhrase({ code: "some-new-code" })).toBe("some new code");
    expect(causeStep({ code: "some-new-code" })).toBeUndefined();
  });
});

describe("run-view-147: reading a failure off a record", () => {
  test("the cause and the runtime's message ride the record's lastError", () => {
    expect(
      readRecordFailure({
        lastError: {
          name: "Error",
          message: "CODE governed outcome remains unresolved",
          cause: { code: "commit-residual", evidence: { commitOid: "abc" } },
        },
      }),
    ).toEqual({
      cause: { code: "commit-residual", evidence: { commitOid: "abc" } },
      message: "CODE governed outcome remains unresolved",
    });
  });

  test("a record from before the cause existed still reports its failure", () => {
    expect(readRecordFailure({ lastError: { message: "boom" } })).toEqual({
      message: "boom",
    });
  });

  test("a shape that is not a failure is dropped, never half-read", () => {
    expect(readRecordFailure(undefined)).toBeUndefined();
    expect(readRecordFailure({ turnId: 3 })).toBeUndefined();
    expect(readRecordFailure({ cause: { code: 7 } })).toBeUndefined();
    expect(readRecordFailure({ cause: { code: "" } })).toBeUndefined();
    expect(
      readRecordFailure({ cause: { code: "aborted", evidence: 5 } }),
    ).toEqual({ cause: { code: "aborted" } });
  });
});

describe("run-view-147: a control's standing", () => {
  test("a no-op says why it would do nothing", () => {
    expect(
      standingLine({
        label: "Retry unresolved effect reconciliation",
        standing: "no-op",
        reason: "receipt-complete",
      }),
    ).toBe(
      "Retry unresolved effect reconciliation: nothing has changed since it failed",
    );
  });

  test("a ready control says nothing, and an unmet reason still reads", () => {
    expect(standingLine({ label: "Abandon", standing: "ready" })).toBeUndefined();
    expect(standingLine({ label: "Abandon" })).toBeUndefined();
    expect(standingReason("some-new-reason")).toBe("some new reason");
    expect(standingLine({ label: "Jump", standing: "blocked" })).toBe(
      "Jump: it can't run now",
    );
  });
});
