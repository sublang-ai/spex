// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Model-level coverage for the plain citation model (SPECV-19;
// META-14: the citation is the only relationship): the complete
// inverted backlink index, cross-file-only per-file rollups, the
// shared count wording, the outline shaping, and inline-link
// resolution. No DOM.

import { describe, expect, test } from "vitest";
import type { SpecFileInfo, SpecItemInfo } from "@sublang/spex-core/protocol";

import {
  ancestorKeys,
  buildCitationModel,
  buildDirTree,
  buildItemIndex,
  citationSummary,
  groupOf,
  linkItemTargets,
  recordForHref,
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
  partial: Partial<SpecFileInfo> & { key: string },
): SpecFileInfo {
  const slash = partial.key.lastIndexOf("/");
  return {
    path: `specs/packages/${partial.key}.md`,
    dir: slash === -1 ? "" : partial.key.slice(0, slash),
    basename: slash === -1 ? partial.key : partial.key.slice(slash + 1),
    items: [],
    notices: [],
    ...partial,
  };
}

describe("recordForHref: resolved-path record matching", () => {
  const records = [
    { id: "DR-001", title: "Decision", path: "decisions/001-shared.md" },
    { id: "IR-001", title: "Intent", path: "intents/001-shared.md" },
  ];

  test("resolution against the citing file picks the exact record", () => {
    expect(
      recordForHref("packages/auth.md", "../intents/001-shared.md", records)
        ?.id,
    ).toBe("IR-001");
    expect(
      recordForHref(
        "packages/catalog/course.md",
        "../../decisions/001-shared.md#goal",
        records,
      )?.id,
    ).toBe("DR-001");
  });

  test("lookalike paths that resolve elsewhere stay inert", () => {
    // A collection subdirectory (META-32) is not a record.
    expect(
      recordForHref(
        "packages/auth.md",
        "../packages/decisions/001-shared.md",
        records,
      ),
    ).toBeUndefined();
    // A bare sibling basename in a non-record directory.
    expect(
      recordForHref("packages/auth.md", "001-shared.md", records),
    ).toBeUndefined();
    // Escaping specs/ never matches.
    expect(
      recordForHref("packages/auth.md", "../../../intents/001-shared.md", records),
    ).toBeUndefined();
    expect(recordForHref("packages/auth.md", "notes.txt", records)).toBeUndefined();
  });

  test("a record's own sibling links resolve inside its directory", () => {
    expect(
      recordForHref("decisions/002-other.md", "001-shared.md", records)?.id,
    ).toBe("DR-001");
  });
});

describe("buildDirTree and ancestorKeys: packages-collection outline", () => {
  test("directories sort by name and files by basename within them", () => {
    const root = buildDirTree([
      file({ key: "zeta" }),
      file({ key: "identity/auth" }),
      file({ key: "catalog/deep/units" }),
      file({ key: "alpha" }),
      file({ key: "catalog/courses" }),
    ]);
    expect(root.name).toBe("Packages");
    expect(root.path).toBe("packages");
    expect(root.files.map((f) => f.basename)).toEqual(["alpha", "zeta"]);
    expect(root.dirs.map((d) => d.name)).toEqual(["catalog", "identity"]);
    const catalog = root.dirs[0];
    expect(catalog.path).toBe("packages/catalog");
    expect(catalog.files.map((f) => f.basename)).toEqual(["courses"]);
    expect(catalog.dirs.map((d) => d.path)).toEqual(["packages/catalog/deep"]);
  });

  test("collapse keys run outermost first from the collection root", () => {
    expect(ancestorKeys("")).toEqual(["packages"]);
    expect(ancestorKeys("a/b")).toEqual([
      "packages",
      "packages/a",
      "packages/a/b",
    ]);
  });
});

describe("buildCitationModel: backlinks and rollups (SPECV-19)", () => {
  const files: SpecFileInfo[] = [
    file({
      key: "identity/auth",
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
      key: "catalog/courses",
      // GONE-1 is a dead target: the citation still exists.
      items: [item({ id: "CAT-1", cites: ["AUTH-1", "GONE-1"] })],
    }),
    file({
      key: "guard",
      items: [item({ id: "GUARD-1", cites: ["AUTH-1", "CAT-1"] })],
    }),
  ];
  const model = buildCitationModel(files);

  test("backlinks group on the cited target in encounter order", () => {
    // Complete both ways: the intra-file citer AUTH-9 stays listed
    // even though rollups skip it.
    expect(model.inbound.get("AUTH-1")).toEqual([
      "AUTH-9",
      "CAT-1",
      "GUARD-1",
    ]);
    expect(model.inbound.get("CAT-1")).toEqual(["GUARD-1"]);
    expect(model.inbound.get("GUARD-1")).toBeUndefined();
  });

  test("rollups count only citations that cross files", () => {
    // AUTH-9 → AUTH-1 is intra-file, so identity/auth cites nothing
    // outward; its cross-file citers are CAT-1 and GUARD-1.
    expect(model.rollups.get("identity/auth")).toEqual({ out: 0, in: 2 });
    // The dead outbound target GONE-1 counts (the citation exists);
    // a dead inbound target has no item to carry it.
    expect(model.rollups.get("catalog/courses")).toEqual({ out: 2, in: 1 });
    expect(model.rollups.get("guard")).toEqual({ out: 2, in: 0 });
  });

  test("purely internal test→behavior wiring leaves the rollup absent", () => {
    const internal = buildCitationModel([
      file({
        key: "solo",
        items: [
          item({ id: "SOLO-1" }),
          item({
            id: "SOLO-9",
            group: "test",
            section: "Verification",
            cites: ["SOLO-1"],
          }),
        ],
      }),
      file({ key: "bystander", items: [item({ id: "BY-1" })] }),
    ]);
    expect(internal.rollups.size).toBe(0);
    // The backlink index still records the intra-file citer.
    expect(internal.inbound.get("SOLO-1")).toEqual(["SOLO-9"]);
  });

  test("a citation-free file carries no rollup", () => {
    const quiet = buildCitationModel([
      file({ key: "solo", items: [item({ id: "SOLO-1" })] }),
    ]);
    expect(quiet.rollups.size).toBe(0);
    expect(quiet.inbound.size).toBe(0);
  });
});

describe("buildItemIndex: jump locations", () => {
  test("locations carry the file key and specs/-relative source path", () => {
    const index = buildItemIndex([
      file({ key: "identity/auth", items: [item({ id: "AUTH-1" })] }),
    ]);
    expect(index.get("AUTH-1")).toMatchObject({
      fileKey: "identity/auth",
      sourcePath: "packages/identity/auth.md",
      dir: "identity",
      group: "external",
    });
  });

  test("groupOf reads the indexed group; dead targets stay undefined", () => {
    const index = buildItemIndex([
      file({
        key: "identity/auth",
        items: [item({ id: "AUTH-9", group: "test", section: "Verification" })],
      }),
    ]);
    expect(groupOf(index, "AUTH-9")).toBe("test");
    expect(groupOf(index, "GONE-1")).toBeUndefined();
  });
});

describe("citationSummary: shared hint and rollup wording", () => {
  test("counts read as cites/cited by; zero sides drop", () => {
    expect(citationSummary(2, 3)).toBe("cites 2 · cited by 3");
    expect(citationSummary(1, 0)).toBe("cites 1");
    expect(citationSummary(0, 4)).toBe("cited by 4");
    expect(citationSummary(0, 0)).toBeUndefined();
  });
});

describe("linkItemTargets", () => {
  test("bare-ID link text wins in either generation", () => {
    expect(linkItemTargets("AUTH-3", "auth.md#auth-3")).toEqual(["AUTH-3"]);
    expect(
      linkItemTargets("github-login-3", "github-login.md#github-login-3"),
    ).toEqual(["github-login-3"]);
  });

  test("a single-word anchor offers both generation spellings", () => {
    expect(linkItemTargets("the sign-in rule", "auth.md#auth-3")).toEqual([
      "auth-3",
      "AUTH-3",
    ]);
  });

  test("a kebab anchor is current-generation only", () => {
    expect(
      linkItemTargets("the sign-in rule", "identity/github-login.md#github-login-3"),
    ).toEqual(["github-login-3"]);
  });

  test("non-citation links are inert", () => {
    expect(linkItemTargets("docs", "https://example.com")).toEqual([]);
    expect(linkItemTargets("readme", "README.md")).toEqual([]);
    expect(linkItemTargets("section", "auth.md#sign-in")).toEqual([]);
  });
});
