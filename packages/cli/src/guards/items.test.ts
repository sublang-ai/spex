// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-2, guards-37), DR-252: the spec items a
 * guard reads, through the linter's own parser, and the cases of a
 * guard item.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { guardItems, readCases, readItems, type Item } from "./items.js";
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

When \`spex verify\` checks uses, it shall find that each use by a user
who holds a grant succeeds [[entitlements-1](#entitlements-1)], in these cases:

- permitted \u2014 a granted user uses: ann is granted, then uses,
  and the use succeeds [[meta-1](../meta.md#meta-1)];
* forbidden \u2014 a granted use fails: ann is granted, then uses: the use fails.
- a note that is no case;
  - an indented note under it is no case either;
+ permitted \u2014 a revoked user is refused: ann is granted and revoked; her use is refused

A second paragraph cites [[entitlements-1](#entitlements-1)] again.

#### Notes

A nested heading stays inside the item.


### entitlements-4

When ann is granted and then uses, the use shall succeed [[entitlements-1](#entitlements-1)].

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
          "entitlements-1", "entitlements-2", "entitlements-3", "entitlements-4", "entitlements-7",
          "entitlements-8", "meta-1", "other-1", "other-2",
        ],
      );
      const [item] = index.byId.get("entitlements-3") ?? [];
      assert.equal(item.id, "entitlements-3");
      assert.equal(item.file, "specs/packages/entitlements.md");
      assert.equal(item.line, 19);
      assert.equal(item.section, "Verification");
      assert.equal(item.text.split("\n")[0], "### entitlements-3");
      assert.equal(
        item.text.split("\n").at(-1),
        "A nested heading stays inside the item.",
        "the text runs to the next heading of the same depth, trailing blank lines dropped",
      );
      assert.equal(
        item.statement,
        "When `spex verify` checks uses, it shall find that each use by a user who holds a grant succeeds [entitlements-1], in these cases:",
        "the first paragraph on one line, each link replaced by its text",
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

  it("ends a statement before a list item that follows it with no blank line", () => {
    const tight = ENTITLEMENTS.replace("in these cases:\n\n- permitted", "in these cases:\n- permitted");
    withTree({ ...TREE, "specs/packages/entitlements.md": tight }, (root) => {
      const [item] = readItems(root).byId.get("entitlements-3") ?? [];
      assert.ok(item.statement.endsWith("in these cases:"), item.statement);
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
  it("finds the guard item, the behavior item it cites and what the two cite, one step", () => {
    withTree(TREE, (root) => {
      const items = guardItems(readItems(root), "entitlements-3");
      assert.equal(items.guard.id, "entitlements-3");
      assert.equal(items.behavior.id, "entitlements-1");
      assert.deepEqual(
        items.cited.map((item) => item.id),
        ["entitlements-2", "meta-1"],
        "one step only: other-1, cited by entitlements-2, is not among them",
      );
    });
  });

  const refused: [string, string, string][] = [
    ["an ID no item has", "entitlements-99", "entitlements-99: no spec item has this ID"],
    [
      "a guard item outside Verification",
      "entitlements-1",
      "entitlements-1: not in a Verification section, so it cannot be a guard item",
    ],
    [
      "a guard item citing no behavior item of its file",
      "entitlements-8",
      "entitlements-8: cites no behavior item of its own file; a guard checks one",
    ],
    [
      "a guard item citing several behavior items",
      "entitlements-7",
      "entitlements-7: cites several behavior items (entitlements-1, entitlements-2); a guard checks one",
    ],
  ];
  for (const [name, guard, expected] of refused) {
    it(`refuses ${name}`, () => {
      withTree(TREE, (root) => {
        assert.equal(message(() => guardItems(readItems(root), guard)), expected);
      });
    });
  }

  it("refuses an ID two items have", () => {
    const twice = { ...TREE, "specs/packages/other.md": `${OTHER}\n### entitlements-3\n\nA copy [[other-1](#other-1)].\n` };
    withTree(twice, (root) => {
      assert.equal(
        message(() => guardItems(readItems(root), "entitlements-3")),
        "entitlements-3: several spec items have this ID (specs/packages/entitlements.md:19, specs/packages/other.md:19)",
      );
    });
  });
});

/** An item holding `body` under its heading. */
function itemOf(body: string): Item {
  return {
    id: "pack-9",
    file: "specs/packages/pack.md",
    line: 1,
    section: "Verification",
    text: `#### pack-9\n\n${body}`,
    statement: "",
    cites: [],
  };
}

describe("guards-37: items: the cases of a guard item", () => {
  it("reads each case's kind, label and plain words, in the item's order", () => {
    withTree(TREE, (root) => {
      assert.deepEqual(guardItems(readItems(root), "entitlements-3").cases, [
        {
          kind: "permitted",
          label: "a granted user uses",
          words: "ann is granted, then uses, and the use succeeds [meta-1]",
        },
        { kind: "forbidden", label: "a granted use fails", words: "ann is granted, then uses: the use fails" },
        {
          kind: "permitted",
          label: "a revoked user is refused",
          words: "ann is granted and revoked; her use is refused",
        },
      ]);
    });
  });

  it("joins an entry's indented lines, replaces a link by its text and drops one ending mark", () => {
    const cases = readCases(
      itemOf(
        [
          "It shall hold [[pack-1](#pack-1)]:",
          "",
          "- permitted \u2014  spaced label : first line",
          "  second line, see [the guide](https://example.com/guide)..",
          "- forbidden \u2014 other: it fails;",
        ].join("\n"),
      ),
    );
    assert.deepEqual(cases, [
      { kind: "permitted", label: "spaced label", words: "first line second line, see the guide." },
      { kind: "forbidden", label: "other", words: "it fails" },
    ]);
  });

  it("passes over a list item that starts otherwise", () => {
    const cases = readCases(
      itemOf(
        [
          "- permitted \u2014 one: it holds;",
          "- a note that is no case;",
          "- permits nothing: no case either;",
          "1. first, a numbered note;",
          "- forbidden \u2014 two: it fails.",
        ].join("\n"),
      ),
    );
    assert.deepEqual(cases.map((entry) => entry.label), ["one", "two"]);
  });

  it("refuses a list item a reader would take for a case and that is not written as one", () => {
    const like: [string, string, string][] = [
      ["- Permitted \u2014 capital: not a case;", "Permitted", "permitted"],
      ["- permitted - hyphen: not a case;", "permitted", "permitted"],
      ["- forbidden \u2013 en dash: not a case;", "forbidden", "forbidden"],
      ["- permitted \u2014no space: not a case;", "permitted", "permitted"],
      ["1. forbidden \u2014 numbered: not a case;", "forbidden", "forbidden"],
      ["  - forbidden \u2014 indented: not a case;", "forbidden", "forbidden"],
    ];
    for (const [line, word, kind] of like) {
      assert.throws(
        () => readCases(itemOf(["- permitted \u2014 one: it holds;", line, "- forbidden \u2014 two: it fails."].join("\n"))),
        (error: unknown) => {
          assert.ok(error instanceof GuardError);
          assert.equal(
            error.message,
            `pack-9: the list entry '${line.trim()}' starts with ${word} and is not written as a case: a case is a list item with no indent, '- ${kind} \u2014 <label>: <the case in plain words>', the dash being \u2014 with one space either side`,
          );
          return true;
        },
        line,
      );
    }
  });

  const refused: [string, string[], string][] = [
    [
      "a case entry with no colon after its label",
      ["- permitted \u2014 one and no more", "- forbidden \u2014 two: it fails."],
      "pack-9: the case entry 'permitted \u2014 one and no more' has no colon after its label",
    ],
    [
      "an empty label",
      ["- permitted \u2014 : it holds;", "- forbidden \u2014 two: it fails."],
      "pack-9: a permitted case has an empty label",
    ],
    [
      "a case with no plain words",
      ["- permitted \u2014 one: ;", "- forbidden \u2014 two: it fails."],
      "pack-9: case 'one' has no plain words after its label",
    ],
    [
      "a label two cases share",
      ["- permitted \u2014 one: it holds;", "- forbidden \u2014 one: it fails."],
      "pack-9: two cases share the label 'one'",
    ],
    [
      "an item with no permitted case",
      ["- forbidden \u2014 two: it fails."],
      "pack-9: no permitted case; a guard item has at least one, written '- permitted \u2014 <label>: <the case in plain words>'",
    ],
    [
      "an item with no forbidden case",
      ["- permitted \u2014 one: it holds."],
      "pack-9: no forbidden case; a guard item has at least one, written '- forbidden \u2014 <label>: <the case in plain words>'",
    ],
  ];
  for (const [name, lines, expected] of refused) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => readCases(itemOf(lines.join("\n")))), expected);
    });
  }
});
