// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: the spec items a guard reads, through the
 * linter's own parser.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { guardItems, readItems } from "./items.js";
import { GuardError } from "./types.js";

const META = `# meta: Spec Definition

## Intent

The spec of specs.

## Overall

### meta-1

Items shall have IDs.
`;

const OTHER = `# other

## Intent

Another package.

## External Behavior

### other-1

The other thing shall hold.

## Verification

### other-2

The other thing shall be checked [[other-1](#other-1)].
`;

const ENTITLEMENTS = `# entitlements

## Intent

Who may use what.

## External Behavior

### entitlements-1

While a grant stands, a use shall succeed [[entitlements-2](#entitlements-2)].

### entitlements-2

A grant shall last until it is revoked, per [DR-001](../decisions/001-first.md) and [[other-1](other.md#other-1)].

## Verification

### entitlements-3

While a user holds a grant, each use by that user
shall succeed [[entitlements-1](#entitlements-1)].

A second paragraph cites [[meta-1](../meta.md#meta-1)] and [[entitlements-1](#entitlements-1)] again.

#### Notes

A nested heading stays inside the item.


### entitlements-4

When ann is granted and then uses, the use shall succeed [[entitlements-1](#entitlements-1)].

### entitlements-5

When ann is granted and then uses, the use shall never fail [[entitlements-1](#entitlements-1)].

### entitlements-6

A revoked grant shall be gone [[entitlements-2](#entitlements-2)].

### entitlements-7

Both shall hold [[entitlements-1](#entitlements-1)] [[entitlements-2](#entitlements-2)].

### entitlements-8

The other package's thing shall hold [[other-1](other.md#other-1)].
`;

function fixture(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-items-")));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function withTree<T>(files: Record<string, string>, work: (root: string) => T): T {
  const root = fixture(files);
  try {
    return work(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const TREE = {
  "specs/meta.md": META,
  "specs/packages/entitlements.md": ENTITLEMENTS,
  "specs/packages/other.md": OTHER,
  "specs/decisions/001-first.md": "# DR-001: First\n\n## Status\n\nAccepted\n",
};

function message(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

describe("guards-2: items: reading the tree", () => {
  it("reads each item's place, text, statement and citations", () => {
    withTree(TREE, (root) => {
      const index = readItems(root);
      assert.deepEqual(
        [...index.byId.keys()].sort(),
        [
          "entitlements-1", "entitlements-2", "entitlements-3", "entitlements-4", "entitlements-5",
          "entitlements-6", "entitlements-7", "entitlements-8", "meta-1", "other-1", "other-2",
        ],
      );
      const [item] = index.byId.get("entitlements-3") ?? [];
      assert.equal(item.id, "entitlements-3");
      assert.equal(item.file, "specs/packages/entitlements.md");
      assert.equal(item.line, 19);
      assert.equal(item.section, "Verification");
      assert.equal(
        item.text,
        [
          "### entitlements-3",
          "",
          "While a user holds a grant, each use by that user",
          "shall succeed [[entitlements-1](#entitlements-1)].",
          "",
          "A second paragraph cites [[meta-1](../meta.md#meta-1)] and [[entitlements-1](#entitlements-1)] again.",
          "",
          "#### Notes",
          "",
          "A nested heading stays inside the item.",
        ].join("\n"),
      );
      assert.equal(
        item.statement,
        "While a user holds a grant, each use by that user shall succeed [entitlements-1].",
        "each link is replaced by its text",
      );
      assert.deepEqual(item.cites, ["entitlements-1", "meta-1"]);

      const [behavior] = index.byId.get("entitlements-2") ?? [];
      assert.equal(behavior.section, "External Behavior");
      assert.deepEqual(behavior.cites, ["other-1"], "a link to a decision record is not an item");
      assert.equal(
        behavior.statement,
        "A grant shall last until it is revoked, per DR-001 and [other-1].",
        "a decision record's link reads as its ID, a citation as its ID in brackets",
      );
      const [last] = index.byId.get("entitlements-8") ?? [];
      assert.equal(
        last.text,
        "### entitlements-8\n\nThe other package's thing shall hold [[other-1](other.md#other-1)].",
      );
    });
  });

  it("reads a CRLF checkout to the same text", () => {
    const crlf = { ...TREE, "specs/packages/entitlements.md": ENTITLEMENTS.replace(/\n/g, "\r\n") };
    const lf = withTree(TREE, (root) => readItems(root).byId.get("entitlements-3")?.[0]);
    const other = withTree(crlf, (root) => readItems(root).byId.get("entitlements-3")?.[0]);
    assert.ok(lf !== undefined && other !== undefined);
    assert.equal(other.text, lf.text);
    assert.equal(other.statement, lf.statement);
    assert.deepEqual(other.cites, lf.cites);
  });

  it("reads a tree with no specs as no items", () => {
    withTree({ "README.md": "hello\n" }, (root) => {
      assert.equal(readItems(root).byId.size, 0);
    });
  });
});

describe("guards-2: items: the items of one guard", () => {
  it("finds the assertion, its behavior item, the examples and what they cite directly", () => {
    withTree(TREE, (root) => {
      const items = guardItems(readItems(root), "entitlements-3", ["entitlements-5", "entitlements-4"]);
      assert.equal(items.assertion.id, "entitlements-3");
      assert.equal(items.behavior.id, "entitlements-1");
      assert.deepEqual(items.examples.map((item) => item.id), ["entitlements-5", "entitlements-4"]);
      assert.deepEqual(
        items.cited.map((item) => item.id),
        ["entitlements-2", "meta-1"],
        "one step only: other-1, cited by entitlements-2, is not among them",
      );
    });
  });

  const cases: [string, string, string[], string][] = [
    ["an ID no item has", "entitlements-99", [], "entitlements-99: no spec item has this ID"],
    [
      "an assertion outside Verification",
      "entitlements-1",
      [],
      "entitlements-1: not in a Verification section, so it cannot be a guard's assertion",
    ],
    [
      "an assertion citing no behavior item of its file",
      "entitlements-8",
      [],
      "entitlements-8: cites no behavior item of its own file; a guard protects one",
    ],
    [
      "an assertion citing several behavior items",
      "entitlements-7",
      [],
      "entitlements-7: cites several behavior items (entitlements-1, entitlements-2); a guard protects one",
    ],
    ["an example no item has", "entitlements-3", ["entitlements-99"], "entitlements-99: no spec item has this ID"],
    [
      "an example in another file",
      "entitlements-3",
      ["other-2"],
      "other-2: not a Verification item of specs/packages/entitlements.md",
    ],
    [
      "an example that is a behavior item",
      "entitlements-3",
      ["entitlements-2"],
      "entitlements-2: not a Verification item of specs/packages/entitlements.md",
    ],
    [
      "an example that does not cite the behavior item",
      "entitlements-3",
      ["entitlements-4", "entitlements-6"],
      "entitlements-6: does not cite entitlements-1, the behavior item the guard protects",
    ],
    [
      "the assertion as its own example",
      "entitlements-3",
      ["entitlements-3"],
      "entitlements-3: the assertion item cannot also be an example",
    ],
  ];
  for (const [name, assertion, examples, expected] of cases) {
    it(`refuses ${name}`, () => {
      withTree(TREE, (root) => {
        assert.equal(message(() => guardItems(readItems(root), assertion, examples)), expected);
      });
    });
  }

  it("refuses an ID two items have", () => {
    const twice = { ...TREE, "specs/packages/other.md": `${OTHER}\n### entitlements-4\n\nA copy [[other-1](#other-1)].\n` };
    withTree(twice, (root) => {
      assert.equal(
        message(() => guardItems(readItems(root), "entitlements-3", ["entitlements-4"])),
        "entitlements-4: several spec items have this ID (specs/packages/entitlements.md:31, specs/packages/other.md:19)",
      );
    });
  });
});
