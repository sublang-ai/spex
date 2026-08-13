// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { lintSpecs, type LintFinding } from "./lint.js";

const META = `# meta: Spec Definition

## Intent

The spec of specs.

## Overall

### meta-1

Items shall have IDs.
`;

const MAP = (body: string, decisions = "") => `# Spec Map

## Decisions

${decisions}

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

const CLEAN_AUTH = `# auth: Auth

## Intent

Auth behavior.

## External Behavior

### auth-1

When credentials are valid, the system shall log in.

## Verification

### auth-2

The suite shall assert a valid login succeeds [[auth-1](#auth-1)].
`;

const CLEAN_AUDIT = `# audit: Audit

## Intent

Audit behavior.

## External Behavior

### audit-1

Where an event is reported, the audit log shall record it.

## Internal Behavior

### audit-2

Where a record is written, \`appendEvent()\` shall flush the log.

## Verification

### audit-3

The suite shall assert an event is recorded [[audit-1](#audit-1)].
`;

const DR = (id: string, title: string) =>
  `# DR-${id}: ${title}\n\n## Status\n\nAccepted\n\n## Context\n\nC.\n\n## Decision\n\nD.\n\n## Consequences\n\nN.\n`;

const IR = (id: string, title: string) =>
  `# IR-${id}: ${title}\n\n## Status\n\nOpen\n\n## Intent\n\nShip.\n\n## Deliverables\n\n- [ ] X\n\n## Tasks\n\n1. X\n\n## Verification\n\nDone when shipped.\n`;

const FULL_MAP = MAP(
  [
    "| File | Summary |",
    "| --- | --- |",
    "| [auth.md](packages/auth.md) | Auth |",
    "| [audit.md](packages/audit.md) | Audit |",
  ].join("\n"),
  [
    "| ID | File |",
    "| --- | --- |",
    "| [DR-001](decisions/001-a.md) | 001-a.md |",
  ].join("\n"),
);

describe("lintSpecs", () => {
  // lint-11: the clean fixture.
  it("passes a clean tree with packages, records, and a map", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH,
      "specs/packages/audit.md": CLEAN_AUDIT,
      "specs/decisions/001-a.md": DR("001", "A"),
      "specs/intents/001-b.md": IR("001", "B"),
      "specs/map.md": FULL_MAP,
    });
    assert.deepEqual(findings, []);
  });

  // lint-2: a missing specs tree is a single error finding.
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

  // lint-4: legacy directories point at --update's migration prompt.
  it("flags legacy directories, pointing at the migration prompt", () => {
    const findings = findingsFor({
      "specs/user/auth.md": "# a\n",
      "specs/compositions/login-flow.md": "# login-flow: Login Flow\n",
      "specs/scratch/notes.md": "# n\n",
    });
    const legacy = findings.filter((f) => f.rule === "structure/legacy-layout");
    assert.equal(legacy.length, 2, JSON.stringify(legacy));
    assert.ok(legacy.every((f) => f.severity === "error"));
    const compositions = legacy.find((f) => f.path === "specs/compositions");
    assert.ok(compositions, "expected a specs/compositions finding");
    assert.match(compositions.message, /spex scaffold --update/);
    assert.match(compositions.message, /migration prompt/);
    const unknown = findings.filter(
      (f) => f.rule === "structure/unknown-entry",
    );
    assert.equal(unknown.length, 1, JSON.stringify(unknown));
    assert.equal(unknown[0].severity, "warning");
    assert.equal(unknown[0].path, "specs/scratch");
  });

  it("errors on missing meta.md or map.md", () => {
    const dir = fixture({ "specs/packages/auth.md": CLEAN_AUTH });
    try {
      const missing = lintSpecs(dir).filter(
        (f) => f.rule === "structure/missing-file",
      );
      assert.equal(missing.length, 2, JSON.stringify(missing));
      assert.ok(missing.every((f) => f.severity === "error"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("warns when legacy iterations/ coexists with intents/", () => {
    const both = findingsFor({
      "specs/intents/001-a.md": IR("001", "A"),
      "specs/iterations/002-b.md": IR("002", "B"),
    });
    const coexist = both.filter((f) => f.rule === "structure/legacy-records");
    assert.equal(coexist.length, 1, JSON.stringify(coexist));
    assert.equal(coexist[0].severity, "warning");

    const onlyLegacy = findingsFor({
      "specs/iterations/002-b.md": IR("002", "B"),
    });
    assert.ok(!rules(onlyLegacy).includes("structure/legacy-records"));
    assert.ok(!rules(onlyLegacy).includes("structure/unknown-entry"));
  });

  it("enforces kebab-case and record naming", () => {
    const findings = findingsFor({
      "specs/packages/MyAuth.md": CLEAN_AUTH,
      "specs/packages/Sub Dir/auth.md": CLEAN_AUTH,
      "specs/decisions/first.md": DR("001", "A"),
    });
    const kebab = findings.filter((f) => f.rule === "naming/kebab");
    assert.equal(kebab.length, 2, JSON.stringify(kebab));
    assert.ok(rules(findings).includes("naming/record"));
  });

  // lint-4: duplicate record numbers, DRs and IRs each one kind.
  it("errors on duplicate record numbers (meta-22)", () => {
    const findings = findingsFor({
      "specs/decisions/001-a.md": DR("001", "A"),
      "specs/decisions/001-b.md": DR("001", "B"),
      "specs/intents/002-a.md": IR("002", "A"),
      "specs/iterations/002-b.md": IR("002", "B"),
    });
    const duplicates = findings.filter((f) => f.rule === "record/duplicate-id");
    assert.equal(duplicates.length, 2, JSON.stringify(duplicates));
    assert.ok(duplicates.every((f) => f.severity === "error"));
    assert.ok(duplicates.some((f) => f.path === "specs/decisions/001-b.md"));
    assert.ok(duplicates.some((f) => f.path === "specs/iterations/002-b.md"));
  });

  // lint-5: package layout of meta-30.
  it("enforces package sections: presence, order, duplicates, unknown", () => {
    const missing = findingsFor({
      "specs/packages/a.md": "# a: A\n\n## Intent\n\nX.\n",
    });
    assert.ok(rules(missing).includes("package/sections"));

    const outOfOrder = findingsFor({
      "specs/packages/b.md":
        "# b: B\n\n## Internal Behavior\n\n### b-1\n\nX shall Y.\n\n## Intent\n\nX.\n\n## External Behavior\n\n### b-2\n\nX shall Z.\n",
    });
    assert.ok(rules(outOfOrder).includes("package/sections"));

    const unknown = findingsFor({
      "specs/packages/c.md":
        "# c: C\n\n## Intent\n\nX.\n\n## External Behavior\n\n### c-1\n\nX shall Y.\n\n## Roadmap\n\nStuff.\n",
    });
    assert.ok(rules(unknown).includes("package/sections"));

    const duplicate = findingsFor({
      "specs/packages/d.md":
        "# d: D\n\n## Intent\n\nX.\n\n## External Behavior\n\n### d-1\n\nX shall Y.\n\n## External Behavior\n\n### d-2\n\nX shall Z.\n",
    });
    assert.ok(rules(duplicate).includes("package/sections"));
  });

  it("errors on a missing required Verification section (meta-30)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n",
    });
    const warned = findings.filter((f) => f.rule === "package/verification");
    assert.equal(warned.length, 1, JSON.stringify(warned));
    assert.equal(warned[0].severity, "error");
  });

  // lint-5, lint-11: the H1 carries the file's basename.
  it("requires a `# <pack>: <Title>` H1 matching the basename", () => {
    const mismatch = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace(
        "# auth: Auth",
        "# login: Auth",
      ),
    });
    const heading = mismatch.filter((f) => f.rule === "package/heading");
    assert.equal(heading.length, 1, JSON.stringify(heading));
    assert.equal(heading[0].severity, "error");

    const malformed = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace("# auth: Auth", "# Auth"),
    });
    assert.ok(rules(malformed).includes("package/heading"));

    const noH1 = findingsFor({
      "specs/packages/x.md": "## Intent\n\nX.\n\n## External Behavior\n\nY.\n",
    });
    assert.ok(rules(noH1).includes("package/heading"));
  });

  // lint-5, lint-11: localized zh section names are accepted.
  it("accepts localized zh package and record sections", () => {
    const findings = findingsFor({
      "specs/packages/auth.md":
        "# auth: 认证\n\n## 意图\n\n认证行为。\n\n## 外部行为\n\n### auth-1\n\n当凭据有效时，系统应登录。\n\n## 验证\n\n### auth-2\n\n测试套件应断言有效登录成功 [[auth-1](#auth-1)]。\n",
      "specs/decisions/001-a.md":
        "# DR-001: 决策\n\n## 状态\n\n已接受\n\n## 背景\n\n背景。\n\n## 决策\n\n决定。\n\n## 影响\n\n影响。\n",
      "specs/intents/001-b.md":
        "# IR-001: 意向\n\n## 状态\n\n进行中\n\n## 意图\n\n交付。\n\n## 交付项\n\n- [ ] X\n\n## 任务\n\n1. X\n\n## 验证\n\n完成即验收。\n",
      "specs/map.md": MAP(
        "| 文件 | 摘要 |\n| --- | --- |\n| [auth.md](packages/auth.md) | 认证 |",
        "| 编号 | 文件 |\n| --- | --- |\n| [DR-001](decisions/001-a.md) | 001-a.md |",
      ),
    });
    assert.deepEqual(findings, []);
  });

  // lint-6: item-ID form, prefix, duplicates, and placement.
  it("errors on an uppercase item heading (meta-11)", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace("### auth-1", "### AUTH-1"),
    });
    const form = findings.filter((f) => f.rule === "id/form");
    assert.equal(form.length, 1, JSON.stringify(form));
    assert.equal(form[0].severity, "error");
    // Case alone is the form error, not a prefix mismatch too.
    assert.ok(!rules(findings).includes("id/prefix"));
  });

  it("errors on an item prefix that is not the file's basename", () => {
    const findings = findingsFor({
      "specs/packages/auth.md":
        "# auth: Auth\n\n## Intent\n\nX.\n\n## External Behavior\n\n### login-1\n\nX shall Y.\n\n## Verification\n\n### auth-2\n\nThe suite shall assert Y [[login-1](#login-1)].\n",
    });
    const prefix = findings.filter((f) => f.rule === "id/prefix");
    assert.equal(prefix.length, 1, JSON.stringify(prefix));
    assert.equal(prefix[0].severity, "error");
  });

  it("flags duplicate item IDs and non-unique item-file basenames", () => {
    const duplicateId = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH,
      "specs/packages/auth-two.md": CLEAN_AUTH.replace(
        "# auth: Auth",
        "# auth-two: Auth Two",
      ),
    });
    assert.ok(rules(duplicateId).includes("id/duplicate"));

    const duplicateBasename = findingsFor({
      "specs/packages/a/auth.md": CLEAN_AUTH,
      "specs/packages/b/auth.md": CLEAN_AUTH,
    });
    const basename = duplicateBasename.filter((f) => f.rule === "id/basename");
    assert.equal(basename.length, 2, JSON.stringify(basename));
    assert.ok(basename.every((f) => f.severity === "error"));

    const rootCollision = findingsFor({
      "specs/packages/map.md": CLEAN_AUTH.replaceAll("auth", "map"),
    });
    assert.ok(rules(rootCollision).includes("id/basename"));
  });

  it("warns on items inside Intent or References sections", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        '# a: A\n\n## Intent\n\n### a-1\n\nX shall Y.\n\n## External Behavior\n\n### a-2\n\nX shall Z per [[1]].\n\n## References\n\n### a-3\n\nStray item.\n\n[1]: https://one.example "One"\n',
    });
    const misplaced = findings.filter((f) => f.rule === "id/misplaced");
    assert.equal(misplaced.length, 2, JSON.stringify(misplaced));
    assert.ok(misplaced.every((f) => f.severity === "warning"));
  });

  // lint-7: relationship metadata is prohibited.
  it("errors on relationship-metadata lines (meta-14)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\nVerifies: [a-1](#a-1)\n\nChecks it [[a-1](#a-1)].\n",
    });
    assert.ok(rules(findings).includes("item/metadata-line"));

    const binds = findingsFor({
      "specs/packages/b.md":
        "# b: B\n\n## Intent\n\nX.\n\n## External Behavior\n\n### b-1\nBinds: something\n\nX shall Y.\n",
    });
    assert.ok(rules(binds).includes("item/metadata-line"));
  });

  // lint-7: a Verification item cites a same-file behavior item.
  it("errors on an uncited Verification item (meta-20)", () => {
    const uncited = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nNo citation at all.\n",
    });
    const finding = uncited.find((f) => f.rule === "verify/uncited");
    assert.ok(finding, "expected a verify/uncited finding");
    assert.equal(finding.severity, "error");

    // Citing only a sibling Verification item does not count.
    const siblingOnly = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n\n### a-3\n\nThe suite shall extend the check [[a-2](#a-2)].\n",
    });
    assert.ok(rules(siblingOnly).includes("verify/uncited"));
  });

  // lint-7: a behavior item relies on peer External Behavior alone.
  it("errors on a behavior citation into a peer's Internal Behavior", () => {
    const internal = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nWhere the log is flushed [[audit-2](audit.md#audit-2)], X shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    const finding = internal.find((f) => f.rule === "cite/internal");
    assert.ok(finding, "expected a cite/internal finding");
    assert.equal(finding.severity, "error");

    // A peer Verification item is no better a target.
    const verification = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nWhere recording is verified [[audit-3](audit.md#audit-3)], X shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    assert.ok(rules(verification).includes("cite/internal"));

    // Citing the peer's External Behavior is the legal form.
    const external = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nWhere events are recorded [[audit-1](audit.md#audit-1)], X shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [a.md](packages/a.md) | A |\n| [audit.md](packages/audit.md) | Audit |",
      ),
    });
    assert.deepEqual(external, []);
  });

  // lint-8: broken links, anchors, and legacy paths.
  it("flags broken links, broken anchors, and legacy paths", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y per [gone](missing.md), [bad](a.md#nope), and [old](../compositions/a.md#a-1).\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
    });
    const found = rules(findings);
    assert.ok(found.includes("cite/broken-link"));
    assert.ok(found.includes("cite/broken-anchor"));
    assert.ok(found.includes("cite/legacy-path"));
  });

  // lint-8: item citations are enclosed inline links whose text is
  // the target item ID.
  it("errors on unenclosed or mislabeled item citations (meta-16)", () => {
    const unenclosed = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace(
        "[[auth-1](#auth-1)]",
        "([auth-1](#auth-1))",
      ),
    });
    const plain = unenclosed.filter((f) => f.rule === "cite/item-link");
    assert.equal(plain.length, 1, JSON.stringify(plain));
    assert.equal(plain[0].severity, "error");

    const mislabeled = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace(
        "[[auth-1](#auth-1)]",
        "[[the login rule](#auth-1)]",
      ),
    });
    assert.ok(rules(mislabeled).includes("cite/item-link"));

    // Cross-file citations are held to the same form.
    const crossFile = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nWhere events are recorded ([audit](audit.md#audit-1)), X shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    const cross = crossFile.filter((f) => f.rule === "cite/item-link");
    assert.equal(cross.length, 2, JSON.stringify(cross));

    // A non-item anchor is no item citation: any label works.
    const sectionLink = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## External Behavior\n\n### a-1\n\nX shall Y per [the layout](../meta.md#overall).\n\n## Intent\n\nX.\n",
    });
    assert.ok(!rules(sectionLink).includes("cite/item-link"));
  });

  it("errors on malformed record citations (meta-16)", () => {
    const malformed = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nBuilt per [the decision](../decisions/001-a.md).\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/decisions/001-a.md": DR("001", "A"),
    });
    assert.ok(rules(malformed).includes("cite/record-link"));

    const enclosed = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nBuilt per [[DR-001](../decisions/001-a.md)].\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/decisions/001-a.md": DR("001", "A"),
    });
    assert.ok(rules(enclosed).includes("cite/record-link"));

    const valid = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nBuilt per [DR-001](../decisions/001-a.md).\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/decisions/001-a.md": DR("001", "A"),
    });
    assert.ok(!rules(valid).includes("cite/record-link"));
  });

  // lint-8: no spec but the intent record itself cites an IR or
  // names it in prose (meta-18) — the map and one IR naming another
  // are caught; a record naming its own id is not.
  it("errors on IR references in every spec but that record", () => {
    const linked = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y (see [the plan](../intents/001-b.md)).\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/intents/001-b.md": IR("001", "B"),
    });
    const link = linked.find((f) => f.rule === "cite/intent");
    assert.ok(link, "expected a linked cite/intent finding");
    assert.equal(link.severity, "error");

    const textual = findingsFor({
      "specs/decisions/001-a.md": DR("001", "A").replace(
        "N.\n",
        "N.\n- IR-015 materializes this decision.\n",
      ),
    });
    const named = textual.find((f) => f.rule === "cite/intent");
    assert.ok(named, "expected a textual cite/intent finding");
    assert.equal(named.severity, "error");

    // A package file naming an IR in prose errors the same way.
    const packageProse = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y as IR-015 planned.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
    });
    const inPackage = packageProse.find((f) => f.rule === "cite/intent");
    assert.ok(inPackage, "expected a package cite/intent finding");
    assert.equal(inPackage.severity, "error");

    // One intent record naming another is a citation like any other:
    // it would make a disposable record something else depends on.
    const crossRecord = findingsFor({
      "specs/intents/002-b.md": IR("002", "B").replace(
        "Ship.",
        "Build on the IR-001 groundwork.",
      ),
    });
    const peerNamed = crossRecord.find((f) => f.rule === "cite/intent");
    assert.ok(peerNamed, JSON.stringify(crossRecord));
    assert.equal(peerNamed.severity, "error");

    // A record naming its own id — as every IR does in its H1 — is
    // the one exemption.
    const ownId = findingsFor({ "specs/intents/002-b.md": IR("002", "B") });
    assert.ok(!rules(ownId).includes("cite/intent"), JSON.stringify(ownId));

    // The map is a spec too, so it cites no intent record.
    const mapOnly = findingsFor({
      "specs/map.md": `${MAP("")}\n## Intents\n\n| ID | File |\n| --- | --- |\n| IR-001 | [001-b.md](intents/001-b.md) |\n`,
      "specs/intents/001-b.md": IR("001", "B"),
    });
    const mapNamed = mapOnly.find((f) => f.rule === "cite/intent");
    assert.ok(mapNamed, JSON.stringify(mapOnly));
    assert.equal(mapNamed.severity, "error");

    // A record's link to its own file is the one meta-18 permits, and
    // meta-16 states no form for it, so neither rule fires (lint-8).
    const selfLink = findingsFor({
      "specs/intents/002-b.md": IR("002", "B").replace(
        "Ship.",
        "Ship, per [this record](002-b.md).",
      ),
    });
    assert.ok(!rules(selfLink).includes("cite/intent"), JSON.stringify(selfLink));
    assert.ok(
      !rules(selfLink).includes("cite/record-link"),
      JSON.stringify(selfLink),
    );

    // Inline code never names an IR (lint-10).
    const inCode = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nThe commit message shall reference the record as `IR-015`.\n\n## Verification\n\n### a-2\n\nThe suite shall assert it [[a-1](#a-1)].\n",
    });
    assert.ok(!rules(inCode).includes("cite/intent"));
  });

  // lint-8: reference-style links in package files.
  it("pins package files to inline citations and [[N]] markers", () => {
    // A bare [1] and a collapsed [2][] are reference-style
    // citations, not markers, numeric labels notwithstanding.
    const shortcutForms = findingsFor({
      "specs/packages/a.md":
        '# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall follow [1] and [2][].\n\n## References\n\n[1]: https://one.example "One"\n[2]: https://two.example "Two"\n',
    });
    assert.equal(
      shortcutForms.filter((f) => f.rule === "cite/reference-style").length,
      2,
      JSON.stringify(shortcutForms),
    );

    const fullForm = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall match [the peer][aud].\n\n[aud]: audit.md#audit-1\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    assert.ok(rules(fullForm).includes("cite/reference-style"));

    // Literal [[N]] markers are not reference-style citations.
    const marker = findingsFor({
      "specs/packages/a.md":
        '# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y per [[1]].\n\n## References\n\n[1]: https://one.example "One"\n',
    });
    assert.ok(!rules(marker).includes("cite/reference-style"));
    assert.ok(!rules(marker).includes("refs/definition"));
  });

  // lint-8: duplicate anchors warn without item-ID false positives.
  it("warns on duplicate heading anchors", () => {
    const dup = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### Topic\n\n#### a-1\n\nX shall Y.\n\n## Internal Behavior\n\n### Topic\n\n#### a-2\n\nZ shall W.\n",
    });
    assert.ok(rules(dup).includes("anchors/duplicate"));

    const clean = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH,
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |",
      ),
    });
    assert.ok(!rules(clean).includes("anchors/duplicate"));
  });

  // lint-9: reference markers and their definitions.
  it("checks reference markers per meta-19", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        '# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y per [[1]] and [[9]].\n\n## References\n\n[1]: https://one.example "One"\n[2]: https://two.example "Two"\n',
    });
    const found = rules(findings);
    assert.ok(found.includes("refs/undefined"));
    assert.ok(found.includes("refs/unused"));
    assert.ok(!found.includes("refs/definition"));

    // A numbered definition lives under ## References only.
    const strayDefinition = findingsFor({
      "specs/packages/a.md":
        '# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y per [[1]].\n\n[1]: https://one.example "One"\n',
    });
    const stray = strayDefinition.find((f) => f.rule === "refs/definition");
    assert.ok(stray, "expected a refs/definition finding");
    assert.equal(stray.severity, "error");

    // ...and points outward, never at a spec file, so a marker
    // cannot smuggle an item citation.
    const specTarget = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nThe system shall record logins per [[1]].\n\n## References\n\n[1]: audit.md#audit-1\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    assert.ok(rules(specTarget).includes("refs/definition"));
  });

  // lint-9: record sections per meta-4 and meta-5.
  it("warns on records missing required sections", () => {
    const findings = findingsFor({
      "specs/decisions/001-a.md": "# DR-001: A\n\n## Status\n\nAccepted\n",
      "specs/intents/001-b.md": "# IR-001: B\n\n## Intent\n\nShip.\n",
    });
    const records = findings.filter((f) => f.rule === "record/sections");
    // DR misses Context/Decision/Consequences; IR misses
    // Status/Deliverables/Tasks/Verification.
    assert.equal(records.length, 7, JSON.stringify(records));
    assert.ok(records.every((f) => f.severity === "warning"));

    // A record kept under legacy iterations/ stays checked.
    const legacy = findingsFor({
      "specs/iterations/002-c.md": "# IR-002: C\n\n## Intent\n\nShip.\n",
    });
    assert.ok(
      legacy.some(
        (f) =>
          f.rule === "record/sections" &&
          f.path === "specs/iterations/002-c.md",
      ),
      JSON.stringify(legacy),
    );
  });

  // lint-9: the map indexes decisions and packages (DR-000), so an
  // unlisted file of either kind warns.
  it("warns when a package or decision is missing from the map", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH,
      "specs/packages/audit.md": CLEAN_AUDIT,
      "specs/decisions/001-a.md": DR("001", "A"),
    });
    const unlisted = findings.filter((f) => f.rule === "map/unlisted");
    assert.deepEqual(
      unlisted.map((f) => f.path).sort(),
      [
        "specs/decisions/001-a.md",
        "specs/packages/audit.md",
        "specs/packages/auth.md",
      ],
      JSON.stringify(unlisted),
    );
    assert.ok(unlisted.every((f) => f.severity === "warning"));

    // Listing the decision clears its finding.
    const listed = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH,
      "specs/decisions/001-a.md": DR("001", "A"),
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |",
        "| ID | File |\n| --- | --- |\n| [DR-001](decisions/001-a.md) | 001-a.md |",
      ),
    });
    assert.ok(!rules(listed).includes("map/unlisted"), JSON.stringify(listed));
  });

  // lint-13: citation discipline.
  it("allows supporting citations and markers in a package Intent", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        '# a: A\n\n## Intent\n\nBuilt per [DR-001](../decisions/001-a.md), [the audit context](audit.md#intent), and [[1]].\n\n## External Behavior\n\n### a-1\n\nX shall Y per [[1]].\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n\n## References\n\n[1]: https://one.example "One"\n',
      "specs/packages/audit.md": CLEAN_AUDIT,
      "specs/decisions/001-a.md": DR("001", "A"),
    });
    assert.ok(!rules(findings).includes("intent/cited"));
    assert.ok(!rules(findings).includes("cite/prose"));
  });

  it("errors on peer citations in section prose (lint-13)", () => {
    const prose = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\nThis package builds on the audit log ([audit](audit.md)).\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    const finding = prose.find((f) => f.rule === "cite/prose");
    assert.ok(finding, "expected a cite/prose finding");
    assert.equal(finding.severity, "error");

    // A record link in section prose names no package dependency.
    const nonPeer = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\nShaped by [DR-001](../decisions/001-a.md).\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
      "specs/decisions/001-a.md": DR("001", "A"),
    });
    assert.ok(!rules(nonPeer).includes("cite/prose"));
  });

  it("errors on a detached Verifies sentence (meta-16)", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nVerifies [a-1](#a-1).\n\nThe suite shall assert Y [[a-1](#a-1)].\n",
    });
    const detached = findings.find((f) => f.rule === "cite/detached");
    assert.ok(detached, "expected a cite/detached finding");
    assert.equal(detached.severity, "error");
    assert.ok(!rules(findings).includes("item/metadata-line"));
    assert.ok(!rules(findings).includes("verify/uncited"));
  });

  // lint-13: Verification behavior citations stay in the package.
  it("errors on Verification citing peer behavior items", () => {
    const internal = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)] flushes the log [[audit-2](audit.md#audit-2)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [a.md](packages/a.md) | A |\n| [audit.md](packages/audit.md) | Audit |",
      ),
    });
    const internalFinding = internal.find((f) => f.rule === "verify/peer");
    assert.ok(internalFinding, "expected a verify/peer finding");
    assert.equal(internalFinding.severity, "error");

    const external = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)] and peer recording [[audit-1](audit.md#audit-1)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    assert.ok(rules(external).includes("verify/peer"));

    const ownInternal = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Internal Behavior\n\n### a-2\n\nX shall record Y.\n\n## Verification\n\n### a-3\n\nThe suite shall assert Y [[a-1](#a-1)] and its record [[a-2](#a-2)].\n",
    });
    assert.ok(!rules(ownInternal).includes("verify/peer"));

    // META-20 confines behavior citations, not every supporting link.
    const verification = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)] like the peer suite [[audit-3](audit.md#audit-3)].\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    assert.ok(!rules(verification).includes("verify/peer"));

    const sectionAnchor = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nThe suite shall assert Y [[a-1](#a-1)] against [the audit intent](audit.md#intent).\n",
      "specs/packages/audit.md": CLEAN_AUDIT,
    });
    assert.ok(!rules(sectionAnchor).includes("verify/peer"));
  });

  // lint-14: the multi-sentence advisory.
  it("warns on a multi-sentence item; structure stays exempt", () => {
    const findings = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace(
        "the system shall log in.",
        "the system shall log in. Sessions last a day.",
      ),
    });
    const warned = findings.filter((f) => f.rule === "item/sentence");
    assert.equal(warned.length, 1, JSON.stringify(warned));
    assert.equal(warned[0].severity, "warning");
    assert.match(warned[0].message, /second requirement/);

    // One sentence governing an attached algorithm and fence is
    // clean, and e.g./inline code never end a sentence.
    const structured = findingsFor({
      "specs/packages/auth.md": CLEAN_AUTH.replace(
        "When credentials are valid, the system shall log in.",
        "When credentials are valid, e.g. via `login.sh`, the system shall log in per the following steps:\n\n1. Verify the token.\n2. Open the session.\n\n```text\ntoken -> session\n```",
      ),
    });
    assert.ok(!rules(structured).includes("item/sentence"));

    // The fullwidth 。 counts anywhere.
    const zh = findingsFor({
      "specs/packages/auth.md":
        "# auth: 认证\n\n## 意图\n\n认证行为。\n\n## 外部行为\n\n### auth-1\n\n当凭据有效时，系统应登录。会话另行处理。\n\n## 验证\n\n### auth-2\n\n测试套件应断言登录成功 [[auth-1](#auth-1)]。\n",
    });
    assert.ok(rules(zh).includes("item/sentence"));
  });

  // lint-10: only root-level headings carry structure.
  it("counts only root-level headings as structure", () => {
    // A package quoted wholesale carries no structure at all.
    const quoted = findingsFor({
      "specs/packages/a.md":
        "> # a: Quoted\n>\n> ## Intent\n>\n> X.\n>\n> ## External Behavior\n>\n> ### a-1\n>\n> X shall Y.\n",
    });
    assert.ok(rules(quoted).includes("package/heading"));
    assert.ok(rules(quoted).includes("package/sections"));

    // Quoted lookalikes inside a real package are content: no
    // unexpected section, no foreign item, no truncated body.
    const decoys = findingsFor({
      "specs/packages/auth.md":
        "# auth: Auth\n\n## Intent\n\nX.\n\n## External Behavior\n\n### auth-1\n\nAn example under discussion:\n\n> ## Layout\n>\n> ### quoted-9\n>\n> A quoted example.\n\nWhen credentials are valid, the system shall log the user in.\n\n## Verification\n\n### auth-2\n\nThe suite shall assert login [[auth-1](#auth-1)].\n",
      "specs/map.md": MAP(
        "| File | Summary |\n| --- | --- |\n| [auth.md](packages/auth.md) | Auth |",
      ),
    });
    assert.deepEqual(decoys, []);
  });

  // lint-10: an item body spans nested subheadings, so citations
  // under them count for the item.
  it("spans an item body to nested subheadings", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall Y.\n\n## Verification\n\n### a-2\n\nCoverage notes.\n\n#### Evidence\n\nThe suite shall assert Y [[a-1](#a-1)].\n\nBinds: leftover metadata\n",
    });
    assert.ok(!rules(findings).includes("verify/uncited"));
    assert.ok(rules(findings).includes("item/metadata-line"));
  });

  // lint-10: a literal fence inside a longer fence stays code.
  it("keeps a literal fence inside a longer fence out of detection", () => {
    const findings = findingsFor({
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\n\nX shall echo the transcript below:\n\n````text\n```\nVerifies: nothing. Second sentence. IR-015.\n```\n````\n\n## Verification\n\n### a-2\n\nThe suite shall assert the echo [[a-1](#a-1)].\n",
    });
    assert.ok(!rules(findings).includes("item/metadata-line"));
    assert.ok(!rules(findings).includes("item/sentence"));
    assert.ok(!rules(findings).includes("cite/intent"));
  });

  // lint-3: finding shape and ordering feed the printed report.
  it("returns findings sorted by path then line, fully populated", () => {
    const findings = findingsFor({
      "specs/packages/b.md":
        "# b: B\n\n## Intent\n\nX.\n\n## External Behavior\n\n### b-1\n\nX shall Y. Second sentence.\n",
      "specs/packages/a.md":
        "# a: A\n\n## Intent\n\nX.\n\n## External Behavior\n\n### a-1\nVerifies: [b-1](b.md#b-1)\n\nX shall Y.\n",
    });
    assert.ok(findings.length >= 2);
    for (const finding of findings) {
      assert.equal(typeof finding.path, "string");
      assert.ok(Number.isInteger(finding.line) && finding.line >= 1);
      assert.ok(["error", "warning"].includes(finding.severity));
      assert.ok(finding.rule.length > 0);
      assert.ok(finding.message.length > 0);
    }
    const keys = findings.map((f) => `${f.path} ${String(f.line).padStart(8, "0")}`);
    assert.deepEqual(keys, [...keys].sort());
  });
});
