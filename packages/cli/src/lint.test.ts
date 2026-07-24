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

  it("errors when a scenario test cites fewer than two packages", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Scenario\n\n### FLOW-1\n\nWhen a login succeeds ([AUTH-1](../packages/auth.md#auth-1)), the system shall proceed.\n\n## Tests\n\n### FLOW-2\n\nThe suite shall assert the flow ([FLOW-1](#flow-1), [AUTH-1](../packages/auth.md#auth-1)).\n",
    });
    const floor = findings.find(
      (f) => f.rule === "tests/scenario-two-packages",
    );
    assert.ok(floor, "expected a two-package floor finding");
    assert.equal(floor.severity, "error");
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
        '# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y per [[1]] and [[9]].\n\n## References\n\n[1]: https://one.example "One"\n[2]: https://two.example "Two"\n',
    });
    const found = rules(findings);
    assert.ok(found.includes("refs/undefined"));
    assert.ok(found.includes("refs/unused"));
    // Literal [[N]] markers are not reference-style citations.
    assert.ok(!found.includes("cite/reference-style"));
    assert.ok(!found.includes("refs/definition"));
  });

  it("pins reference markers to the exact [[N]] form (META-19)", () => {
    // A bare [1] and a collapsed [2][] are reference-style
    // citations, not markers, numeric labels notwithstanding.
    const shortcutForms = findingsFor({
      "specs/packages/a.md":
        '# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall follow [1] and [2][].\n\n## References\n\n[1]: https://one.example "One"\n[2]: https://two.example "Two"\n',
    });
    assert.equal(
      shortcutForms.filter((f) => f.rule === "cite/reference-style").length,
      2,
      JSON.stringify(shortcutForms),
    );

    // A numbered definition lives under ## References only.
    const strayDefinition = findingsFor({
      "specs/packages/a.md":
        '# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y per [[1]].\n\n[1]: https://one.example "One"\n',
    });
    const stray = strayDefinition.find((f) => f.rule === "refs/definition");
    assert.ok(stray, "expected a refs/definition finding");
    assert.equal(stray.severity, "error");

    // ...and points outward, never at a spec file, so a marker
    // cannot smuggle a peer item citation past clause discipline.
    const specTarget = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nThe system shall record logins per [[1]].\n\n## References\n\n[1]: audit.md#aud-1\n",
      "specs/packages/audit.md":
        "# AUD: Audit\n\n## Intent\n\nAudit behavior.\n\n## External Behavior\n\n### AUD-1\n\nWhere an event is reported, the audit log shall record it.\n",
    });
    assert.ok(rules(specTarget).includes("refs/definition"));

    // A marker is still a citation inside Intent (META-15).
    const intentMarker = findingsFor({
      "specs/packages/a.md":
        '# A: A\n\n## Intent\n\nShaped by [[1]].\n\n## External Behavior\n\n### A-1\n\nX shall Y per [[1]].\n\n## References\n\n[1]: https://one.example "One"\n',
    });
    assert.ok(rules(intentMarker).includes("intent/cited"));
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

  it("counts only root-level headings as structure (LINT-10)", () => {
    // A package quoted wholesale carries no structure at all.
    const quoted = findingsFor({
      "specs/packages/a.md":
        "> # AAA: Quoted\n>\n> ## Intent\n>\n> X.\n>\n> ## External Behavior\n>\n> ### AAA-1\n>\n> X shall Y.\n",
    });
    assert.ok(rules(quoted).includes("package/heading"));
    assert.ok(rules(quoted).includes("package/sections"));

    // Quoted lookalikes inside a real package are content: no
    // unexpected section, no foreign item, no truncated body.
    const decoys = findingsFor({
      "specs/packages/auth.md":
        "# AUTH: Auth\n\n## Intent\n\nX.\n\n## External Behavior\n\n### AUTH-1\n\nAn example under discussion:\n\n> ## Layout\n>\n> ### AUD-9\n>\n> A quoted example.\n\nWhen credentials are valid, the system shall log the user in.\n\n## Verification\n\n### AUTH-2\n\nThe suite shall assert login ([AUTH-1](#auth-1)).\n",
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |",
      ),
    });
    assert.deepEqual(decoys, []);
  });

  it("spans an item body to nested subheadings (LINT-10)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\n\nCoverage notes.\n\n#### Evidence\n\nThe suite shall assert Y ([A-1](#a-1)).\n\nBinds: leftover metadata\n",
    });
    assert.ok(!rules(findings).includes("verify/uncited"));
    assert.ok(rules(findings).includes("meta/metadata-line"));
  });

  it("does not count anchor-less package links toward the scenario floor", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/packages/audit.md": AUDIT_PACKAGE,
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Scenario\n\n### FLOW-1\n\nWhen a login succeeds ([AUTH-1](../packages/auth.md#auth-1)), the audit log shall record it ([AUD-1](../packages/audit.md#aud-1)).\n\n## Tests\n\n### FLOW-2\n\nThe suite shall assert the flow ([FLOW-1](#flow-1)) across [auth](../packages/auth.md) and [audit](../packages/audit.md).\n",
    });
    assert.ok(rules(findings).includes("tests/scenario-two-packages"));
  });

  it("errors on a Binding no same-file Scenario cites in a mixed file", () => {
    const mixed = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Binding\n\n### FLOW-1\n\nWhere logins are needed ([AUTH-1](../packages/auth.md#auth-1)), the deployment shall use Example Auth.\n\n## Scenario\n\n### FLOW-2\n\nThe composed system shall proceed ([AUTH-1](../packages/auth.md#auth-1)).\n\n## Tests\n\n### FLOW-3\n\nThe suite shall assert both ([FLOW-1](#flow-1), [FLOW-2](#flow-2), [AUTH-1](../packages/auth.md#auth-1)).\n",
    });
    assert.ok(rules(mixed).includes("binding/no-scenario"));

    const woven = findingsFor({
      "specs/packages/auth.md": CLEAN_PACKAGE,
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Binding\n\n### FLOW-1\n\nWhere logins are needed ([AUTH-1](../packages/auth.md#auth-1)), the deployment shall use Example Auth.\n\n## Scenario\n\n### FLOW-2\n\nWhere the login binding holds ([FLOW-1](#flow-1)), the composed system shall proceed ([AUTH-1](../packages/auth.md#auth-1)).\n\n## Tests\n\n### FLOW-3\n\nThe suite shall assert both ([FLOW-1](#flow-1), [FLOW-2](#flow-2), [AUTH-1](../packages/auth.md#auth-1)).\n",
    });
    assert.ok(!rules(woven).includes("binding/no-scenario"));
  });

  it("errors on a detached Verifies sentence (LINT-13)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## Verification\n\n### A-2\n\nVerifies [A-1](#a-1).\n\nThe suite shall assert Y.\n",
    });
    const detached = findings.find((f) => f.rule === "cite/detached");
    assert.ok(detached, "expected a cite/detached finding");
    assert.equal(detached.severity, "error");
    assert.ok(!rules(findings).includes("meta/metadata-line"));
    assert.ok(!rules(findings).includes("verify/uncited"));
  });

  it("errors on package→composition and non-map iteration citations", () => {
    const findings = findingsFor({
      "specs/packages/auth.md":
        "# AUTH: Auth\n\n## Intent\n\nAuth behavior.\n\n## External Behavior\n\n### AUTH-1\n\nWhen credentials are valid, the system shall log in (see [flow](../compositions/flow.md), [IR-001](../iterations/001-a.md)).\n\n## Verification\n\n### AUTH-2\n\nThe suite shall assert a valid login succeeds ([AUTH-1](#auth-1)).\n",
      "specs/compositions/flow.md":
        "# FLOW: Flow\n\n## Intent\n\nX.\n\n## Scenario\n\n### FLOW-1\n\nThe composed system shall proceed ([AUTH-1](../packages/auth.md#auth-1)).\n\n## Tests\n\n### FLOW-2\n\nThe suite shall assert it ([FLOW-1](#flow-1), [AUTH-1](../packages/auth.md#auth-1)).\n",
      "specs/iterations/001-a.md":
        "# IR-001: A\n\n## Goal\n\nShip.\n\n## Deliverables\n\n- [ ] X\n\n## Tasks\n\n1. X\n\n## Acceptance criteria\n\nDone.\n",
    });
    const found = rules(findings);
    assert.ok(found.includes("cite/composition"));
    assert.ok(found.includes("cite/iteration"));

    const mapOnly = findingsFor({
      "specs/map.md": `${MAP("")}\n## Iterations\n\n| ID | File |\n| --- | --- |\n| IR-001 | [001-a.md](iterations/001-a.md) |\n`,
      "specs/iterations/001-a.md":
        "# IR-001: A\n\n## Goal\n\nShip.\n\n## Deliverables\n\n- [ ] X\n\n## Tasks\n\n1. X\n\n## Acceptance criteria\n\nDone.\n",
    });
    assert.ok(!rules(mapOnly).includes("cite/iteration"));
  });

  it("errors on zh trigger keywords in a Binding item", () => {
    const triggered = findingsFor({
      "specs/compositions/platform.md":
        "# PLAT: 平台\n\n## 意图\n\n平台绑定。\n\n## 绑定\n\n### PLAT-1\n\n当用户登录时，部署应使用 Example Auth。\n\n## 测试\n\n### PLAT-2\n\n审计套件应检查部署配置（[PLAT-1](#plat-1)）。\n",
    });
    assert.ok(rules(triggered).includes("binding/trigger"));

    const listWrapped = findingsFor({
      "specs/compositions/platform.md":
        "# PLAT: 平台\n\n## 意图\n\n平台绑定。\n\n## 绑定\n\n### PLAT-1\n\n部署应满足：\n\n- 当用户登录时切换到 Example Auth。\n\n## 测试\n\n### PLAT-2\n\n审计套件应检查部署配置（[PLAT-1](#plat-1)）。\n",
    });
    assert.ok(rules(listWrapped).includes("binding/trigger"));

    const clean = findingsFor({
      "specs/compositions/platform.md":
        "# PLAT: 平台\n\n## 意图\n\n平台绑定。\n\n## 绑定\n\n### PLAT-1\n\n部署当前的认证服务应为 Example Auth。\n\n## 测试\n\n### PLAT-2\n\n审计套件应检查部署配置（[PLAT-1](#plat-1)）。\n",
    });
    assert.ok(!rules(clean).includes("binding/trigger"));
  });

  it("keeps a literal fence inside a longer fence out of detection", () => {
    const findings = findingsFor({
      "specs/compositions/platform.md":
        '# PLAT: Platform\n\n## Intent\n\nX.\n\n## Binding\n\n### PLAT-1\n\nWhere logins are verified ([AUTH-1](../packages/auth.md#auth-1)), the deployment shall use Example Auth per:\n\n````text\n```\nWhen in doubt\nVerifies: nothing\n```\n````\n\n## Tests\n\n### PLAT-2\n\nThe suite shall inspect it ([PLAT-1](#plat-1)).\n',
      "specs/packages/auth.md": CLEAN_PACKAGE,
    });
    assert.ok(!rules(findings).includes("binding/trigger"));
    assert.ok(!rules(findings).includes("meta/metadata-line"));
  });

  it("errors on Intent citations and peer-Internal citations (LINT-13)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nBuilt per [DR-001](../decisions/001-a.md).\n\n## External Behavior\n\n### A-1\n\nWhere audit is reported ([AUD-1](audit.md#aud-1)), X shall Y.\n",
      "specs/packages/audit.md": AUDIT_PACKAGE,
      "specs/decisions/001-a.md":
        "# DR-001: A\n\n## Status\n\nAccepted\n\n## Context\n\nC.\n\n## Decision\n\nD.\n\n## Consequences\n\nN.\n",
    });
    for (const rule of ["intent/cited", "cite/internal"]) {
      const finding = findings.find((f) => f.rule === rule);
      assert.ok(finding, `expected a ${rule} finding`);
      assert.equal(finding.severity, "error");
    }
    assert.ok(!rules(findings).includes("cite/outcome"));

    const composition = findingsFor({
      "specs/packages/audit.md": AUDIT_PACKAGE,
      "specs/compositions/trail.md":
        "# TRAIL: Trail\n\n## Intent\n\nX.\n\n## Scenario\n\n### TRAIL-1\n\nThe composed system shall record ([AUD-1](../packages/audit.md#aud-1)).\n\n## Tests\n\n### TRAIL-2\n\nThe suite shall assert recording ([TRAIL-1](#trail-1), [AUD-1](../packages/audit.md#aud-1)).\n",
    });
    assert.ok(!rules(composition).includes("cite/internal"));
    assert.ok(!rules(composition).includes("intent/cited"));
  });

  it("errors on peer citations outside precondition clauses (LINT-13)", () => {
    const AUDIT_EXTERNAL =
      "# AUD: Audit\n\n## Intent\n\nAudit behavior.\n\n## External Behavior\n\n### AUD-1\n\nWhere an event is reported, the audit log shall record it.\n";

    const outcome = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere credentials are valid, the system shall record the login in the audit log ([AUD-1](audit.md#aud-1)).\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(outcome).includes("cite/outcome"));

    const listOutcome = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhen the user confirms, the system shall:\n\n1. validate the input,\n2. record it in the audit log ([AUD-1](audit.md#aud-1)).\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(listOutcome).includes("cite/outcome"));

    const subjectPosition = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nThe audit log of record ([AUD-1](audit.md#aud-1)) shall receive every login event.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(subjectPosition).includes("cite/outcome"));

    // A subject-position citation after a real precondition: the
    // cite belongs to the clause that carries the shall.
    const subjectAfterPrecondition = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere credentials are valid, the audit log ([AUD-1](audit.md#aud-1)) shall receive every login event.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(subjectAfterPrecondition).includes("cite/outcome"));

    // An appositive comma after the shall-clause subject does not
    // hand the citation to the precondition: keyword and citation
    // must share one separator-free span.
    const appositive = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere credentials are valid, the audit stream ([AUD-1](audit.md#aud-1)), arriving in order, shall be recorded.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(appositive).includes("cite/outcome"));

    // A chained precondition stays legal: the separator introduces
    // a further clause-start keyword that governs the citation.
    const chainedPrecondition = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere the feature is enabled, when the audit log accepts an event ([AUD-1](audit.md#aud-1)), the system shall record it.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(!rules(chainedPrecondition).includes("cite/outcome"));

    // An "and"-joined condition shares the keyword's span.
    const andChain = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere the user is signed in and the audit log accepts events ([AUD-1](audit.md#aud-1)), the system shall record logins.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(!rules(andChain).includes("cite/outcome"));

    // A trailing "…, where …" clause after the shall is not a
    // precondition of it.
    const trailingRelative = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nThe system shall link to the audit surface, where events are recorded ([AUD-1](audit.md#aud-1)).\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(trailingRelative).includes("cite/outcome"));

    // A fresh sentence reopens preconditions after an earlier shall.
    const multiSentence = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nThe system shall accept logins. Where the audit log accepts events ([AUD-1](audit.md#aud-1)), the system shall record them.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(!rules(multiSentence).includes("cite/outcome"));

    // The dot inside a version number ends no sentence, so a
    // trailing where-clause cannot reopen preconditions.
    const versionNumber = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nThe system shall speak protocol 1.2, where events are recorded ([AUD-1](audit.md#aud-1)).\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(versionNumber).includes("cite/outcome"));

    // A directly linked shall-subject cannot ride its introducing
    // comma into the precondition span.
    const linkedSubject = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere credentials are valid, [AUD-1](audit.md#aud-1), arriving in order, shall be recorded.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(linkedSubject).includes("cite/outcome"));

    // Citations grouped in one precondition share one span: the
    // comma between them joins the group, closing no clause.
    const groupedPrecondition = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere the audit endpoints respond ([AUD-1](audit.md#aud-1), [AUD-3](audit.md#aud-3)), the system shall sync.\n",
      "specs/packages/audit.md": `${AUDIT_EXTERNAL}\n### AUD-3\n\nWhere polled, the audit endpoint shall answer.\n`,
    });
    assert.ok(!rules(groupedPrecondition).includes("cite/outcome"));

    // A non-item anchor is no citation of a peer contract.
    const sectionAnchor = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhile audit is available ([intent](audit.md#intent)), the system shall log in.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(sectionAnchor).includes("cite/internal"));

    // Reference-style links dodge the citation rules; prohibited.
    const referenceStyle = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhile audit accepts events ([AUD-1][aud]), the system shall log in.\n\n[aud]: audit.md#aud-1\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(referenceStyle).includes("cite/reference-style"));

    // A numeric label does not make a full reference a [[N]] marker,
    // and the definition's target is still section-checked.
    const numericFullReference = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhile audit holds ([AUD-2][1]), the system shall log in.\n\n[1]: audit.md#aud-2\n",
      "specs/packages/audit.md":
        "# AUD: Audit\n\n## Intent\n\nAudit behavior.\n\n## External Behavior\n\n### AUD-1\n\nWhere an event is reported, the audit log shall record it.\n\n## Verification\n\n### AUD-2\n\nThe suite shall assert recording ([AUD-1](#aud-1)).\n",
    });
    assert.ok(rules(numericFullReference).includes("cite/reference-style"));
    assert.ok(rules(numericFullReference).includes("cite/internal"));

    // Inline-code keywords cannot fake a precondition clause.
    const inlineCodeKeyword = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nThe `Where` handling shall follow the audit contract ([AUD-1](audit.md#aud-1)).\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(inlineCodeKeyword).includes("cite/outcome"));

    // A comma inside a link label is no clause boundary.
    const labelComma = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhere credentials are valid, the log ([AUD-1, audit entry](audit.md#aud-1)) shall receive events.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(labelComma).includes("cite/outcome"));

    const zhOutcome = findingsFor({
      "specs/packages/a.md":
        "# A: 甲\n\n## 意图\n\n甲行为。\n\n## 外部行为\n\n### A-1\n\n系统应使用对等审计（[AUD-1](audit.md#aud-1)）记录登录。\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(zhOutcome).includes("cite/outcome"));

    const zhPrecondition = findingsFor({
      "specs/packages/a.md":
        "# A: 甲\n\n## 意图\n\n甲行为。\n\n## 外部行为\n\n### A-1\n\n给定审计日志已启用（[AUD-1](audit.md#aud-1)），系统应记录登录。\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(!rules(zhPrecondition).includes("cite/outcome"));

    const precondition = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhile the audit log accepts events ([AUD-1](audit.md#aud-1)), the system shall record logins.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(!rules(precondition).includes("cite/outcome"));
    assert.ok(!rules(precondition).includes("cite/internal"));

    const sameFile = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n### A-3\n\nThe system shall reuse the login rule ([A-1](#a-1)).\n",
    });
    assert.ok(!rules(sameFile).includes("cite/outcome"));
  });

  it("errors on peer targets outside External Behavior (LINT-13)", () => {
    const verificationTarget = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhile audit coverage holds ([AUD-2](audit.md#aud-2)), the system shall log in.\n",
      "specs/packages/audit.md":
        "# AUD: Audit\n\n## Intent\n\nAudit behavior.\n\n## External Behavior\n\n### AUD-1\n\nWhere an event is reported, the audit log shall record it.\n\n## Verification\n\n### AUD-2\n\nThe suite shall assert recording ([AUD-1](#aud-1)).\n",
    });
    assert.ok(rules(verificationTarget).includes("cite/internal"));

    const bareLink = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nWhile audit holds (see [audit](audit.md)), the system shall log in.\n",
      "specs/packages/audit.md":
        "# AUD: Audit\n\n## Intent\n\nAudit behavior.\n\n## External Behavior\n\n### AUD-1\n\nWhere an event is reported, the audit log shall record it.\n",
    });
    assert.ok(rules(bareLink).includes("cite/internal"));
  });

  it("errors on peer citations in section prose (LINT-13)", () => {
    const AUDIT_EXTERNAL =
      "# AUD: Audit\n\n## Intent\n\nAudit behavior.\n\n## External Behavior\n\n### AUD-1\n\nWhere an event is reported, the audit log shall record it.\n";

    // Prose between the section heading and the first item cannot
    // declare a package dependency.
    const prose = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\nThis package builds on the audit log ([AUD-1](audit.md#aud-1)).\n\n### A-1\n\nX shall Y.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    const finding = prose.find((f) => f.rule === "cite/prose");
    assert.ok(finding, "expected a cite/prose finding");
    assert.equal(finding.severity, "error");

    // References prose is outside every item too.
    const referencesProse = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### A-1\n\nX shall Y.\n\n## References\n\nSee also [AUD-1](audit.md#aud-1).\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
    });
    assert.ok(rules(referencesProse).includes("cite/prose"));

    // A record link in section prose names no package dependency,
    // and an Intent citation keeps its own rule.
    const nonPeer = findingsFor({
      "specs/packages/a.md":
        "# A: A\n\n## Intent\n\nSee [AUD-1](audit.md#aud-1).\n\n## External Behavior\n\nShaped by [DR-001](../decisions/001-a.md).\n\n### A-1\n\nX shall Y.\n",
      "specs/packages/audit.md": AUDIT_EXTERNAL,
      "specs/decisions/001-a.md":
        "# DR-001: A\n\n## Status\n\nAccepted\n\n## Context\n\nC.\n\n## Decision\n\nD.\n\n## Consequences\n\nN.\n",
    });
    assert.ok(!rules(nonPeer).includes("cite/prose"));
    assert.ok(rules(nonPeer).includes("intent/cited"));
  });

  it("errors on textual IR references outside the map (META-18)", () => {
    const findings = findingsFor({
      "specs/decisions/001-a.md":
        "# DR-001: A\n\n## Status\n\nAccepted\n\n## Context\n\nC.\n\n## Decision\n\nD.\n\n## Consequences\n\n- IR-015 materializes this decision.\n",
    });
    const textual = findings.find((f) => f.rule === "cite/iteration");
    assert.ok(textual, "expected a textual cite/iteration finding");
    assert.equal(textual.severity, "error");

    // An iteration record is exempt only for its own ID.
    const crossIteration = findingsFor({
      "specs/iterations/002-b.md":
        "# IR-002: B\n\n## Goal\n\nBuild on the IR-001 groundwork.\n\n## Deliverables\n\n- [ ] X\n\n## Tasks\n\n1. X\n\n## Acceptance criteria\n\nIR-002 is done.\n",
    });
    const cross = crossIteration.filter((f) => f.rule === "cite/iteration");
    assert.equal(cross.length, 1, JSON.stringify(cross));
    assert.equal(cross[0].line, 5);
  });

  it("accepts localized zh composition sections", () => {
    const findings = findingsFor({
      "specs/packages/auth.md":
        "# AUTH: 认证\n\n## 意图\n\n认证行为。\n\n## 外部行为\n\n### AUTH-1\n\n当凭据有效时，系统应登录。\n\n## 验证\n\n### AUTH-2\n\n测试套件应断言有效登录成功（[AUTH-1](#auth-1)）。\n",
      "specs/packages/audit.md":
        "# AUD: 审计\n\n## 意图\n\n审计行为。\n\n## 外部行为\n\n### AUD-1\n\n当事件上报时，审计日志应记录。\n",
      "specs/compositions/login-audit.md":
        "# LAT: 登录审计\n\n## 意图\n\n登录留痕。\n\n## 场景\n\n### LAT-1\n\n当登录成功（[AUTH-1](../packages/auth.md#auth-1)）时，审计日志应记录（[AUD-1](../packages/audit.md#aud-1)）。\n\n## 测试\n\n### LAT-2\n\n验收套件应断言桩登录留下一条审计记录（[LAT-1](#lat-1)、[AUTH-1](../packages/auth.md#auth-1)、[AUD-1](../packages/audit.md#aud-1)）。\n",
      "specs/map.md": MAP(
        "| 文件 | 摘要 |\n| --- | --- |\n| [auth.md](packages/auth.md) | 认证 |\n| [audit.md](packages/audit.md) | 审计 |\n| [login-audit.md](compositions/login-audit.md) | 登录审计 |",
      ),
    });
    assert.deepEqual(findings, []);
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
