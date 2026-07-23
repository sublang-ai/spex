// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { lintSpecs, type LintFinding } from "./lint.js";

const META = `# META: Spec Definition

## Intent

The spec of specs.

## Items

### META-1

Items shall have IDs.
`;

const MAP = (body: string) => `# Spec Map

## Packages

${body}
`;

function fixture(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-lint-")));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function rules(findings: LintFinding[]): string[] {
  return findings.map((f) => f.rule);
}

function findingsFor(
  files: Record<string, string>,
  extra: Record<string, string> = {},
): LintFinding[] {
  const base = {
    "specs/meta.md": META,
    "specs/map.md": MAP(""),
    ...files,
    ...extra,
  };
  const dir = fixture(base);
  try {
    return lintSpecs(dir);
  } finally {
    rmSync(dir, { recursive: true });
  }
}

const CLEAN_PACKAGE = `# AUTH: Auth

## Intent

Auth behavior.

## External Behavior

### AUTH-1

When credentials are valid, the system shall log in.

## Verification

### AUTH-2

The suite shall assert a valid login succeeds ([AUTH-1](#auth-1)).
`;

const CLEAN_COMPOSITION = `# LAT: Login Audit Trail

## Intent

Login leaves an audit trail.

## Scenario

### LAT-1

When a login succeeds ([AUTH-1](../packages/auth.md#auth-1)), the
audit log shall record it ([AUD-1](../packages/audit.md#aud-1)).

## Tests

### LAT-2

The acceptance suite shall assert a stub login leaves one audit
record ([LAT-1](#lat-1), [AUTH-1](../packages/auth.md#auth-1),
[AUD-1](../packages/audit.md#aud-1)).
`;

const AUDIT_PACKAGE = `# AUD: Audit

## Intent

Audit behavior.

## Internal Behavior

### AUD-1

Where an event is reported, the audit log shall record it.
`;

const FULL_MAP = MAP(
  [
    "| File | Summary |",
    "| --- | --- |",
    "| [auth.md](packages/auth.md) | Auth |",
    "| [audit.md](packages/audit.md) | Audit |",
    "| [login-audit-trail.md](compositions/login-audit-trail.md) | Trail |",
  ].join("\n"),
);

describe("lintSpecs", () => {
  it("passes a clean tree with a package and a composition", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/audit.md": AUDIT_PACKAGE,
      "specs/compositions/login-audit-trail.md": CLEAN_COMPOSITION,
      "specs/map.md": FULL_MAP,
    });
    assert.deepEqual(findings, []);
  });

  it("errors on a missing specs directory", () => {
    const dir = fixture({});
    try {
      const findings = lintSpecs(dir);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].severity, "error");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("flags legacy directories, interactions/, and unknown entries", () => {
    const findings = findingsFor({
      "specs/user/auth.md": "# A\n",
      "specs/interactions/login-flow.md": "# LF: Login Flow\n\n## Intent\n\nX.\n",
      "specs/scratch/notes.md": "# N\n",
    });
    const legacy = findings.filter((f) => f.rule === "structure/legacy-layout");
    assert.equal(legacy.length, 2);
    assert.ok(legacy.some((f) => f.path === "specs/interactions"));
    assert.ok(rules(findings).includes("structure/unknown-entry"));
  });

  it("errors on missing meta.md or map.md", () => {
    const dir = fixture({ "specs/packages/auth.md": CLEAN_PACKAGE });
    try {
      const found = rules(lintSpecs(dir));
      assert.ok(found.includes("structure/missing-file"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("enforces kebab-case and record naming", () => {
    const findings = findingsFor({
      "specs/packages/MyAuth.md": CLEAN_PACKAGE,
      "specs/decisions/first.md": "# DR\n\n## Status\n\nAccepted\n\n## Context\n\nC.\n\n## Decision\n\nD.\n\n## Consequences\n\nN.\n",
    });
    assert.ok(rules(findings).includes("naming/kebab"));
    assert.ok(rules(findings).includes("naming/record"));
  });

  it("enforces package sections: presence, order, duplicates, unknown", () => {
    const missing = findingsFor({
      "specs/packages/a.md": "# A: A\n\n## Intent\n\nX.\n",
    });
    assert.ok(rules(missing).includes("package/sections"));

    const outOfOrder = findingsFor({
      "specs/packages/b.md":
        "# B: B\n\n## Internal Behavior\n\n### B-1\n\nX shall Y.\n\n## Intent\n\nX.\n",
    });
    assert.ok(rules(outOfOrder).includes("package/sections"));

    const unknown = findingsFor({
      "specs/packages/c.md":
        "# C: C\n\n## Intent\n\nX.\n\n## External Behavior\n\n### C-1\n\nX shall Y.\n\n## Roadmap\n\nStuff.\n",
    });
    assert.ok(rules(unknown).includes("package/sections"));
  });

  it("enforces composition sections per META-34", () => {
    const noTests = findingsFor({
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Scenario\n\n### FLOW-1\n\nX shall Y.\n",
    });
    assert.ok(rules(noTests).includes("composition/sections"));

    const noBehavior = findingsFor({
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Tests\n\n### FLOW-1\n\nThe suite shall check.\n",
    });
    assert.ok(rules(noBehavior).includes("composition/sections"));

    const outOfOrder = findingsFor({
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Tests\n\n### FLOW-2\n\nThe suite shall assert it ([FLOW-1](#flow-1)).\n\n## Scenario\n\n### FLOW-1\n\nX shall Y.\n",
    });
    assert.ok(rules(outOfOrder).includes("composition/sections"));

    const unknown = findingsFor({
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Flow\n\n### FLOW-1\n\nX shall Y.\n\n## Tests\n\n### FLOW-2\n\nThe suite shall assert it ([FLOW-1](#flow-1)).\n",
    });
    assert.ok(rules(unknown).includes("composition/sections"));
  });

  it("accepts localized zh section names", () => {
    const findings = findingsFor({
      "specs/packages/auth.md":
        "# AUTH: 认证\n\n## 意图\n\n认证行为。\n\n## 外部行为\n\n### AUTH-1\n\n当凭据有效时，系统应登录。\n",
      "specs/map.md": MAP("| 文件 | 摘要 |\n| --- | --- |\n| [auth.md](packages/auth.md) | 认证 |"),
    });
    assert.deepEqual(findings, []);
  });

  it("requires an H1 short form and flags prefix mismatches", () => {
    const findings = findingsFor({
      "specs/packages/auth.md":
        "# AUTH: Auth\n\n## Intent\n\nX.\n\n## External Behavior\n\n### LOGIN-1\n\nX shall Y.\n",
    });
    assert.ok(rules(findings).includes("id/prefix"));

    const noH1 = findingsFor({
      "specs/packages/x.md": "## Intent\n\nX.\n\n## External Behavior\n\nY.\n",
    });
    assert.ok(rules(noH1).includes("package/heading"));
  });

  it("flags duplicate item IDs and short-form collisions", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/auth-two.md": CLEAN_PACKAGE,
    });
    assert.ok(rules(findings).includes("id/duplicate"));
    assert.ok(rules(findings).includes("id/short-form-collision"));
  });

  it("errors on relationship-metadata lines (META-20)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\nVerifies: [A-1](#a-1)\n\nChecks A-1 ([A-1](#a-1)).\n",
    });
    assert.ok(rules(findings).includes("meta/metadata-line"));

    const binds = findingsFor({
      "specs/packages/b.md":
        "# B: B\n\n## Intent\n\nX.\n\n## External Behavior\n\n### B-1\nBinds: something\n\nX shall Y.\n",
    });
    assert.ok(rules(binds).includes("meta/metadata-line"));
  });

  it("errors on an uncited package Verification item", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\n\nNo citation at all.\n",
    });
    assert.ok(rules(findings).includes("verify/uncited"));
  });

  it("warns on cross-package citations in package Verification", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\n\nChecks A ([A-1](#a-1)) and B ([B-1](b.md#b-1)).\n",
      "specs/packages/b.md":
        "# B: B\n\n## Intent\n\nX.\n\n## External Behavior\n\n### B-1\n\nX shall Y.\n",
    });
    assert.ok(rules(findings).includes("verify/cross-package"));
  });

  it("does not flag external URLs in Verification citations", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        '# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\n\nChecks A ([A-1](#a-1)) against [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110).\n',
    });
    assert.ok(!rules(findings).includes("verify/cross-package"));
  });

  it("errors on an uncited Tests item and uncovered behavior items", () => {
    const findings = findingsFor({
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Scenario\n\n### FLOW-1\n\nX shall Y.\n\n## Tests\n\n### FLOW-2\n\nThe suite shall check something uncited.\n",
    });
    assert.ok(rules(findings).includes("tests/uncited"));
    assert.ok(rules(findings).includes("tests/uncovered"));
  });

  it("warns when a scenario test cites fewer than two packages", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Scenario\n\n### FLOW-1\n\nWhen a login succeeds ([AUTH-1](../packages/auth.md#auth-1)), the system shall proceed.\n\n## Tests\n\n### FLOW-2\n\nThe suite shall assert the flow ([FLOW-1](#flow-1), [AUTH-1](../packages/auth.md#auth-1)).\n",
    });
    assert.ok(rules(findings).includes("tests/scenario-two-packages"));
  });

  it("allows a binding inspection citing one package and its service", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/compositions/platform.md":
        "# PLAT: Platform\n\n## Intent\n\nX.\n\n## Binding\n\n### PLAT-1\n\nWhere logins are verified ([AUTH-1](../packages/auth.md#auth-1)), the deployment shall verify them with Example Auth.\n\n## Tests\n\n### PLAT-2\n\nThe audit suite shall inspect the deployed configuration ([PLAT-1](#plat-1), [AUTH-1](../packages/auth.md#auth-1)).\n",
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |\n| [platform.md](compositions/platform.md) | Platform |",
      ),
    });
    assert.deepEqual(findings, []);
  });

  it("errors on a When/While clause in a Binding item (META-36)", () => {
    const findings = findingsFor({
      "specs/compositions/platform.md":
        "# PLAT: Platform\n\n## Intent\n\nX.\n\n## Binding\n\n### PLAT-1\n\nWhen a login occurs, the deployment shall use Example Auth.\n\n## Tests\n\n### PLAT-2\n\nThe suite shall inspect it ([PLAT-1](#plat-1)).\n",
    });
    assert.ok(rules(findings).includes("binding/trigger"));
  });

  it("warns on composed composition file names", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/run-view.md":
        "# RUN: Run View\n\n## Intent\n\nX.\n\n## External Behavior\n\n### RUN-1\n\nX shall Y.\n",
      "specs/compositions/auth-run-view.md":
        "# ARV: Auth Run View\n\n## Intent\n\nX.\n\n## Scenario\n\n### ARV-1\n\nX shall Y ([AUTH-1](../packages/auth.md#auth-1), [RUN-1](../packages/run-view.md#run-1)).\n\n## Tests\n\n### ARV-2\n\nThe suite shall assert it ([ARV-1](#arv-1), [AUTH-1](../packages/auth.md#auth-1), [RUN-1](../packages/run-view.md#run-1)).\n",
    });
    assert.ok(rules(findings).includes("composition/name-composition"));
  });

  it("flags broken links, broken anchors, and legacy paths", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nSee [gone](missing.md), [bad](a.md#nope), and [old](../interactions/a.md#a-1).\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n",
    });
    const found = rules(findings);
    assert.ok(found.includes("cite/broken-link"));
    assert.ok(found.includes("cite/broken-anchor"));
    assert.ok(found.includes("cite/legacy-path"));
  });

  it("checks reference markers per META-19", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        '# A: A\n\n## Intent\n\nSee [[1]] and [[9]].\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## References\n\n[1]: https://one.example "One"\n[2]: https://two.example "Two"\n',
    });
    const found = rules(findings);
    assert.ok(found.includes("refs/undefined"));
    assert.ok(found.includes("refs/unused"));
  });

  it("warns on records missing required sections", () => {
    const findings = findingsFor({
      "specs/decisions/001-a.md": "# DR-001: A\n\n## Status\n\nAccepted\n",
      "specs/iterations/001-b.md": "# IR-001: B\n\n## Goal\n\nShip.\n",
    });
    const records = findings.filter((f) => f.rule === "record/sections");
    assert.ok(records.length >= 4, JSON.stringify(records));
    assert.ok(records.every((f) => f.severity === "warning"));
  });

  it("warns when a package or composition file is missing from the map", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/audit.md": AUDIT_PACKAGE,
      "specs/compositions/login-audit-trail.md": CLEAN_COMPOSITION,
    });
    const unlisted = findings.filter((f) => f.rule === "map/unlisted");
    assert.equal(unlisted.length, 3);
  });

  it("warns on duplicate heading anchors without item-ID false positives", () => {
    const dup = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### Topic\n\n#### A-1\n\nX shall Y.\n\n## Internal Behavior\n\n### Topic\n\n#### A-2\n\nZ shall W.\n",
    });
    assert.ok(rules(dup).includes("anchors/duplicate"));

    const clean = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/map.md": MAP("| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |"),
    });
    assert.ok(!rules(clean).includes("anchors/duplicate"));
  });

  it("skips metadata and trigger detection inside fenced code", () => {
    const findings = findingsFor({
      "specs/compositions/platform.md":
        "# PLAT: Platform\n\n## Intent\n\nX.\n\n## Binding\n\n### PLAT-1\n\nWhere logins are verified ([AUTH-1](../packages/auth.md#auth-1)), the deployment shall use Example Auth per:\n\n```text\nWhen in doubt\nVerifies: nothing\n```\n\n## Tests\n\n### PLAT-2\n\nThe suite shall inspect it ([PLAT-1](#plat-1)).\n",
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |\n| [platform.md](compositions/platform.md) | Platform |",
      ),
    });
    assert.ok(!rules(findings).includes("binding/trigger"));
    assert.ok(!rules(findings).includes("meta/metadata-line"));
  });
});
