// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Model-level coverage for DR-016 relationship classification: the
// binding clause-side splitter, per-item citation classification,
// the whole-tree relation model (inbound groups and file rollups),
// and the collapsed-hint ranking. No DOM.

import { describe, expect, test } from "vitest";
import type { SpecFileInfo, SpecItemInfo } from "@sublang/spex-core/protocol";

import {
  buildItemIndex,
  buildRelationModel,
  classifyCites,
  collapsedHints,
  recordForHref,
  relationPhrase,
  splitBindingClauses,
  RELATION_LABEL,
  RELATION_ORDER,
} from "./spec-view-model.js";

function item(
  partial: Partial<SpecItemInfo> & { id: string },
): SpecItemInfo {
  return {
    group: "external",
    section: "External Behavior",
    firstLine: partial.id,
    text: "",
    cites: [],
    ...partial,
  };
}

function file(
  partial: Partial<SpecFileInfo> & {
    kind: SpecFileInfo["kind"];
    key: string;
  },
): SpecFileInfo {
  const slash = partial.key.lastIndexOf("/");
  return {
    path: `specs/${partial.kind === "package" ? "packages" : "compositions"}/${partial.key}.md`,
    dir: slash === -1 ? "" : partial.key.slice(0, slash),
    basename: slash === -1 ? partial.key : partial.key.slice(slash + 1),
    items: [],
    notices: [],
    ...partial,
  };
}

describe("recordForHref: directory-qualified record matching", () => {
  const records = [
    { id: "DR-001", title: "Decision", path: "decisions/001-shared.md" },
    { id: "IR-001", title: "Intent", path: "intents/001-shared.md" },
  ];

  test("the directory segment picks the right record kind", () => {
    expect(recordForHref("../intents/001-shared.md", records)?.id).toBe(
      "IR-001",
    );
    expect(recordForHref("../decisions/001-shared.md#goal", records)?.id).toBe(
      "DR-001",
    );
    expect(recordForHref("../packages/001-shared.md", records)).toBeUndefined();
  });

  test("a bare basename still matches when the href has no directory", () => {
    expect(recordForHref("001-shared.md", records)?.id).toBe("DR-001");
    expect(recordForHref("notes.txt", records)).toBeUndefined();
  });
});

describe("splitBindingClauses: clause sides around the standalone shall", () => {
  test("citations before shall are clients, after are provisions", () => {
    const split = splitBindingClauses(
      [
        "Where the shell's header carries the entries",
        "([SHELL-1](../packages/site/web-shell.md#shell-1),",
        "[SHELL-2](../packages/site/web-shell.md#shell-2)), the",
        "deployment shall bind the account menu",
        "([AUTH-4](../packages/identity/github-login.md#auth-4)) and",
        "the course list ([CAT-1](../packages/catalog/course-catalog.md#cat-1)).",
      ].join("\n"),
    );
    expect(split).toEqual({
      clients: ["SHELL-1", "SHELL-2"],
      provisions: ["AUTH-4", "CAT-1"],
    });
  });

  test("a link before and a link after shall split on one line", () => {
    const split = splitBindingClauses(
      "Where sign-in holds ([A-1](a.md#a-1)), it shall use the store ([B-2](b.md#b-2)).",
    );
    expect(split).toEqual({ clients: ["A-1"], provisions: ["B-2"] });
  });

  test("a second sentence degrades even inside one paragraph", () => {
    // A client citation in a trailing rider sentence must not be
    // classified as a provision (META-36: one GEARS sentence).
    expect(
      splitBindingClauses(
        [
          "Where sign-in holds ([A-1](a.md#a-1)), it shall use the store ([B-2](b.md#b-2)).",
          "Where audits run ([C-3](c.md#c-3)), logs stay local.",
        ].join("\n"),
      ),
    ).toBeUndefined();
    // The fullwidth terminator counts the same way.
    expect(
      splitBindingClauses(
        "在部署内（[A-1](a.md#a-1)），系统 shall 使用存储（[B-2](b.md#b-2)）。审计另行处理。",
      ),
    ).toBeUndefined();
    // Coordinated shalls in ONE sentence stay classified (PUB-1),
    // and e.g. never ends a sentence.
    expect(
      splitBindingClauses(
        "Where slots delegate ([A-1](a.md#a-1)), e.g. media, the deployment shall use the list ([B-2](b.md#b-2)) and shall embed the player ([B-3](b.md#b-3)).",
      ),
    ).toEqual({ clients: ["A-1"], provisions: ["B-2", "B-3"] });
  });

  test("a shall inside a code fence never splits; the real one does", () => {
    const split = splitBindingClauses(
      [
        "Where the config names the gate ([A-1](a.md#a-1)):",
        "```",
        "gate: shall-open",
        "the deployment shall never read this",
        "```",
        "the deployment shall enforce it ([B-2](b.md#b-2)).",
      ].join("\n"),
    );
    expect(split).toEqual({ clients: ["A-1"], provisions: ["B-2"] });
  });

  test("a body whose only shall is fenced degrades to undefined", () => {
    const text = [
      "Binding prose without the verb ([A-1](a.md#a-1)).",
      "```",
      "the deployment shall never read this",
      "```",
    ].join("\n");
    expect(splitBindingClauses(text)).toBeUndefined();
  });

  test("shall inside inline code or a link href does not count", () => {
    expect(
      splitBindingClauses("Use `shall` carefully ([A-1](a.md#a-1))."),
    ).toBeUndefined();
    expect(
      splitBindingClauses("See ([A-1](notes/shall.md#a-1)) for the verb."),
    ).toBeUndefined();
  });

  test("no standalone shall at all degrades to undefined", () => {
    expect(splitBindingClauses("The Marshall Plan ([A-1](a.md#a-1))."))
      .toBeUndefined();
  });

  test("a citation on both sides classifies by first occurrence", () => {
    const split = splitBindingClauses(
      "Where [A-1](a.md#a-1) holds, it shall reuse [A-1](a.md#a-1) and [B-2](b.md#b-2).",
    );
    expect(split).toEqual({ clients: ["A-1"], provisions: ["B-2"] });
  });

  test("non-citation links never enter either side", () => {
    const split = splitBindingClauses(
      "Where the need holds ([A-1](a.md#a-1)), it shall pick Supabase ([DR-002](../decisions/002-platform.md)).",
    );
    expect(split).toEqual({ clients: ["A-1"], provisions: [] });
  });
});

describe("classifyCites: edge kinds from the citing item alone", () => {
  const packages = [
    file({
      kind: "package",
      key: "identity/auth",
      shortForm: "AUTH",
      items: [
        item({ id: "AUTH-1" }),
        item({ id: "AUTH-2" }),
        item({ id: "AUTH-9", group: "test", section: "Verification" }),
      ],
    }),
    file({
      kind: "package",
      key: "catalog/courses",
      shortForm: "CAT",
      items: [item({ id: "CAT-1" })],
    }),
  ];
  const composition = file({
    kind: "composition",
    key: "guard",
    shortForm: "GUARD",
    items: [
      item({ id: "GUARD-5", group: "internal", section: "Binding" }),
      item({ id: "GUARD-1", group: "external", section: "Scenario" }),
      item({ id: "GUARD-3", group: "test", section: "Tests" }),
    ],
  });
  const index = buildItemIndex([...packages, composition]);
  const auth = packages[0];

  test("package behavior: peer targets are uses, same-file unlabeled", () => {
    const cites = classifyCites(
      item({ id: "AUTH-2", cites: ["CAT-1", "AUTH-1"] }),
      auth,
      index,
    );
    expect(cites.rows).toEqual([{ kind: "uses", targets: ["CAT-1"] }]);
    expect(cites.internal).toEqual(["AUTH-1"]);
  });

  test("dead targets classify by prefix: own stays internal, foreign uses", () => {
    const cites = classifyCites(
      item({ id: "AUTH-2", cites: ["AUTH-99", "GONE-1"] }),
      auth,
      index,
    );
    expect(cites.rows).toEqual([{ kind: "uses", targets: ["GONE-1"] }]);
    expect(cites.internal).toEqual(["AUTH-99"]);
  });

  test("package Verification: every edge verifies, dead ones included", () => {
    const cites = classifyCites(
      item({
        id: "AUTH-9",
        group: "test",
        section: "Verification",
        cites: ["AUTH-1", "AUTH-99"],
      }),
      auth,
      index,
    );
    expect(cites.rows).toEqual([
      { kind: "verifies", targets: ["AUTH-1", "AUTH-99"] },
    ]);
  });

  test("binding: clause sides become serves and provides", () => {
    const cites = classifyCites(
      item({
        id: "GUARD-5",
        group: "internal",
        section: "Binding",
        text: "Where courses list ([CAT-1](../packages/catalog/courses.md#cat-1)), the deployment shall gate them ([AUTH-1](../packages/identity/auth.md#auth-1)).",
        cites: ["CAT-1", "AUTH-1"],
      }),
      composition,
      index,
    );
    expect(cites.rows).toEqual([
      { kind: "serves", targets: ["CAT-1"] },
      { kind: "provides", targets: ["AUTH-1"] },
    ]);
  });

  test("binding without the grammar degrades to a plain cites row", () => {
    const cites = classifyCites(
      item({
        id: "GUARD-5",
        group: "internal",
        section: "Binding",
        text: "Eligibility remains the answer ([AUTH-1](../packages/identity/auth.md#auth-1)).",
        cites: ["AUTH-1"],
      }),
      composition,
      index,
    );
    expect(cites.rows).toEqual([{ kind: "cites", targets: ["AUTH-1"] }]);
  });

  test("scenario: package targets compose, same-file bindings are via", () => {
    const cites = classifyCites(
      item({
        id: "GUARD-1",
        group: "external",
        section: "Scenario",
        cites: ["AUTH-1", "GUARD-5", "GUARD-3", "GUARD-99"],
      }),
      composition,
      index,
    );
    // GUARD-3 resolves to a same-file test item and GUARD-99 is a dead
    // own-prefix ID: neither carve-out applies, so both stay unlabeled.
    expect(cites.rows).toEqual([
      { kind: "composes", targets: ["AUTH-1"] },
      { kind: "via", targets: ["GUARD-5"] },
    ]);
    expect(cites.internal).toEqual(["GUARD-3", "GUARD-99"]);
  });

  test("composition test: same-file scenario and binding targets execute", () => {
    const cites = classifyCites(
      item({
        id: "GUARD-3",
        group: "test",
        section: "Tests",
        cites: ["GUARD-1", "GUARD-5", "CAT-1", "GUARD-99"],
      }),
      composition,
      index,
    );
    expect(cites.rows).toEqual([
      { kind: "verifies", targets: ["CAT-1", "GUARD-99"] },
      { kind: "executes", targets: ["GUARD-1", "GUARD-5"] },
    ]);
  });

  test("unknown sections keep today's behavior, never an invented edge", () => {
    const surprise = classifyCites(
      item({ id: "AUTH-2", section: "Notes", cites: ["CAT-1"] }),
      auth,
      index,
    );
    expect(surprise.rows).toEqual([]);
    expect(surprise.internal).toEqual(["CAT-1"]);
    const testish = classifyCites(
      item({ id: "AUTH-9", group: "test", section: "Checks", cites: ["AUTH-1"] }),
      auth,
      index,
    );
    expect(testish.rows).toEqual([{ kind: "cites", targets: ["AUTH-1"] }]);
  });
});

describe("buildRelationModel: inbound groups and file rollups", () => {
  const files: SpecFileInfo[] = [
    file({
      kind: "package",
      key: "identity/auth",
      shortForm: "AUTH",
      items: [
        item({ id: "AUTH-1" }),
        item({
          id: "AUTH-9",
          group: "test",
          section: "Verification",
          cites: ["AUTH-1"],
        }),
      ],
    }),
    file({
      kind: "package",
      key: "catalog/courses",
      shortForm: "CAT",
      items: [item({ id: "CAT-1", cites: ["AUTH-1"] })],
    }),
    file({
      kind: "composition",
      key: "guard",
      shortForm: "GUARD",
      items: [
        item({
          id: "GUARD-5",
          group: "internal",
          section: "Binding",
          text: "Where the list shows ([CAT-1](../packages/catalog/courses.md#cat-1)), the deployment shall gate it ([AUTH-1](../packages/identity/auth.md#auth-1)).",
          cites: ["CAT-1", "AUTH-1"],
        }),
        item({
          id: "GUARD-1",
          group: "external",
          section: "Scenario",
          cites: ["AUTH-1", "GUARD-5"],
        }),
        item({
          id: "GUARD-3",
          group: "test",
          section: "Tests",
          cites: ["GUARD-1", "AUTH-1"],
        }),
      ],
    }),
  ];
  const model = buildRelationModel(files, buildItemIndex(files));

  test("inbound groups are per-kind, canonical order, encounter order", () => {
    expect(model.inbound.get("AUTH-1")).toEqual([
      { kind: "uses", sources: ["CAT-1"] },
      { kind: "provides", sources: ["GUARD-5"] },
      { kind: "composes", sources: ["GUARD-1"] },
      { kind: "verifies", sources: ["AUTH-9", "GUARD-3"] },
    ]);
    expect(model.inbound.get("GUARD-5")).toEqual([
      { kind: "via", sources: ["GUARD-1"] },
    ]);
    expect(model.inbound.get("GUARD-1")).toEqual([
      { kind: "executes", sources: ["GUARD-3"] },
    ]);
  });

  test("rollups count both directions per kind, zero kinds omitted", () => {
    expect(model.rollups.get("package:identity/auth")).toEqual([
      { kind: "uses", direction: "in", count: 1 },
      { kind: "provides", direction: "in", count: 1 },
      { kind: "composes", direction: "in", count: 1 },
      { kind: "verifies", direction: "out", count: 1 },
      { kind: "verifies", direction: "in", count: 2 },
    ]);
    expect(model.rollups.get("composition:guard")).toEqual([
      { kind: "serves", direction: "out", count: 1 },
      { kind: "provides", direction: "out", count: 1 },
      { kind: "composes", direction: "out", count: 1 },
      { kind: "via", direction: "out", count: 1 },
      { kind: "via", direction: "in", count: 1 },
      { kind: "verifies", direction: "out", count: 1 },
      { kind: "executes", direction: "out", count: 1 },
      { kind: "executes", direction: "in", count: 1 },
    ]);
  });

  test("outgoing classification is indexed by citing item", () => {
    expect(model.outgoing.get("CAT-1")?.rows).toEqual([
      { kind: "uses", targets: ["AUTH-1"] },
    ]);
  });
});

describe("collapsedHints: at most two, outgoing first, then verified-by", () => {
  test("outgoing kinds lead in canonical order", () => {
    const hints = collapsedHints(
      {
        rows: [
          { kind: "serves", targets: ["A-1"] },
          { kind: "provides", targets: ["B-1", "B-2"] },
        ],
        internal: [],
      },
      [{ kind: "verifies", sources: ["T-1"] }],
    );
    expect(hints).toEqual([
      { kind: "serves", direction: "out", count: 1 },
      { kind: "provides", direction: "out", count: 2 },
    ]);
  });

  test("verified-by outranks other inbound kinds", () => {
    const hints = collapsedHints(undefined, [
      { kind: "uses", sources: ["A-1"] },
      { kind: "composes", sources: ["S-1"] },
      { kind: "verifies", sources: ["T-1", "T-2"] },
    ]);
    expect(hints).toEqual([
      { kind: "verifies", direction: "in", count: 2 },
      { kind: "uses", direction: "in", count: 1 },
    ]);
  });

  test("no edges, no hints", () => {
    expect(collapsedHints(undefined, undefined)).toEqual([]);
  });
});

describe("relationship vocabulary", () => {
  test("every kind carries a glyph and word in both directions", () => {
    for (const kind of RELATION_ORDER) {
      const label = RELATION_LABEL[kind];
      expect(label.glyph.length).toBeGreaterThan(0);
      expect(relationPhrase(kind, "out")).toBe(label.out);
      expect(relationPhrase(kind, "in")).toBe(label.in);
    }
    // The chosen inbound wording, pinned: it must read naturally from
    // the target's side and stay stable for users.
    expect(relationPhrase("uses", "in")).toBe("used by");
    expect(relationPhrase("serves", "in")).toBe("served by");
    expect(relationPhrase("provides", "in")).toBe("supplies");
    expect(relationPhrase("composes", "in")).toBe("composed in");
    expect(relationPhrase("via", "in")).toBe("composed via");
    expect(relationPhrase("verifies", "in")).toBe("verified by");
    expect(relationPhrase("executes", "in")).toBe("executed by");
    expect(relationPhrase("cites", "in")).toBe("cited by");
  });
});

describe("review round: grammar conformance and localized specs", () => {
  test("coordinated shall clauses keep first-shall placement", () => {
    // META-36 allows several provision mappings in the one sentence
    // (Academy's PUB-1 carries four shalls); the first shall is the
    // clause boundary, so later shalls never reclassify a citation.
    const split = splitBindingClauses(
      [
        "Where the need ([A-1](#a-1)), the deployment shall serve it",
        "([B-2](#b-2)), and the stored value shall be the identifier",
        "([C-3](#c-3)).",
      ].join("\n"),
    );
    expect(split).toEqual({ clients: ["A-1"], provisions: ["B-2", "C-3"] });
  });

  test("a second prose paragraph degrades the binding", () => {
    const split = splitBindingClauses(
      [
        "Where the need ([A-1](#a-1)), the deployment shall serve it",
        "([B-2](#b-2)).",
        "",
        "This trailing rationale paragraph is out of grammar.",
      ].join("\n"),
    );
    expect(split).toBeUndefined();
  });

  test("one paragraph, one shall — internal punctuation still splits", () => {
    // The accepted conformance boundary: a single-paragraph body with
    // exactly one shall places every citation unambiguously, however
    // much internal punctuation the provision list carries; full
    // grammar enforcement stays with lint (DR-016).
    const split = splitBindingClauses(
      [
        'Where the header carries entries ([A-1](#a-1)), the deployment',
        'shall bind them: the name reads "Academy"; the menu is',
        "([B-2](#b-2)); and the list is ([C-3](#c-3)).",
      ].join("\n"),
    );
    expect(split).toEqual({ clients: ["A-1"], provisions: ["B-2", "C-3"] });
  });

  test("zh binding splits at 应 and compounds never count as shall", () => {
    const split = splitBindingClauses(
      "在门户需要目录时（[CAT-1](#cat-1)），本应用部署应绑定课程列表（[NAV-2](#nav-2)）。",
    );
    expect(split).toEqual({ clients: ["CAT-1"], provisions: ["NAV-2"] });
    // 应用 (application) and 反应 (reaction) are not shall markers: no
    // standalone 应 means the body degrades rather than mis-splitting.
    expect(
      splitBindingClauses(
        "该应用的反应（[A-1](#a-1)）绑定到（[B-2](#b-2)）。",
      ),
    ).toBeUndefined();
  });

  test("zh section names classify like their English counterparts", () => {
    const file = {
      kind: "composition" as const,
      key: "site-navigation",
      shortForm: "NAV",
    };
    const index = new Map();
    const binding = classifyCites(
      {
        id: "NAV-1",
        group: "internal" as const,
        section: "绑定",
        firstLine: "",
        text: "在门户需要目录时（[CAT-1](#cat-1)），部署应提供列表（[SHELL-2](#shell-2)）。",
        cites: ["CAT-1", "SHELL-2"],
      },
      file,
      index,
    );
    expect(binding.rows).toEqual([
      { kind: "serves", targets: ["CAT-1"] },
      { kind: "provides", targets: ["SHELL-2"] },
    ]);
    const test_ = classifyCites(
      {
        id: "NAV-9",
        group: "test" as const,
        section: "测试",
        firstLine: "",
        text: "验证 [CAT-1](#cat-1)。",
        cites: ["CAT-1"],
      },
      file,
      index,
    );
    expect(test_.rows).toEqual([{ kind: "verifies", targets: ["CAT-1"] }]);
  });
});
