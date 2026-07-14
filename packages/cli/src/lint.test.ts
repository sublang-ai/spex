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
Verifies: [AUTH-1](#auth-1)

The suite shall cover login.
`;

describe("lintSpecs", () => {
  it("passes a clean tree", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/map.md": MAP("| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |"),
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

  it("flags legacy layout directories and unknown entries", () => {
    const findings = findingsFor({
      "specs/user/auth.md": "# A\n",
      "specs/scratch/notes.md": "# N\n",
    });
    assert.ok(rules(findings).includes("structure/legacy-layout"));
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

  it("requires Verifies on Verification items and flags cross-package Verifies", () => {
    const missing = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\n\nNo verifies line.\n",
    });
    assert.ok(rules(missing).includes("verify/missing"));

    const cross = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\nVerifies: [B-1](b.md#b-1)\n\nChecks B.\n",
      "specs/packages/b.md":
        "# B: B\n\n## Intent\n\nX.\n\n## External Behavior\n\n### B-1\n\nX shall Y.\n",
    });
    assert.ok(rules(cross).includes("verify/cross-package"));
  });

  it("warns on single-package interaction tests and composed names", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/run-view.md":
        "# RUN: Run View\n\n## Intent\n\nX.\n\n## External Behavior\n\n### RUN-1\n\nX shall Y.\n",
      "specs/interactions/auth-run-view.md":
        "# ARV: Auth Run View\n\n## Intent\n\nX.\n\n## Flow\n\n### ARV-1\nVerifies: [AUTH-1](../packages/auth.md#auth-1)\n\nChecks one package only.\n",
    });
    assert.ok(rules(findings).includes("interaction/name-composition"));
    assert.ok(rules(findings).includes("interaction/single-package"));
  });

  it("accepts a proper interaction file", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/audit.md":
        "# AUD: Audit\n\n## Intent\n\nX.\n\n## Internal Behavior\n\n### AUD-1\n\nX shall Y.\n",
      "specs/interactions/login-audit-trail.md":
        "# LAT: Login Audit Trail\n\n## Intent\n\nLogin leaves an audit trail.\n\n## Scenario\n\n### LAT-1\nVerifies: [AUTH-1](../packages/auth.md#auth-1), [AUD-1](../packages/audit.md#aud-1)\n\nWhen a login succeeds, the audit log shall record it.\n",
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |\n| [audit.md](packages/audit.md) | Audit |\n| [login-audit-trail.md](interactions/login-audit-trail.md) | Trail |",
      ),
    });
    assert.deepEqual(findings, []);
  });

  it("flags broken links, broken anchors, and legacy paths", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nSee [gone](missing.md), [bad](a.md#nope), and [old](../user/a.md#a-1).\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n",
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

  it("warns when a package file is missing from the map", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
    });
    assert.ok(rules(findings).includes("map/unlisted"));
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
});
