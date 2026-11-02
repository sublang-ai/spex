// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Citations across a release's boundary (environments-41,
// environments-42): a project's spec built into a release with its
// same-file citations kept, its citations of a package's spec written
// as addresses, its citations of a spec of no package or of a file two
// packages claim removed and its decision records' links reduced to
// their text, each warned with the citing item; a release's spec placed
// in a tree with each address of a placed spec written as a relative
// link and the rest removed, counted per package; a citation of the
// specs root's meta.md kept in both directions; every other byte as it
// was, and the two directions composing back to the project's own links.

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatAddress, isCitationUrl, parseAddress, rewriteForRelease, rewriteForTree } from "./citations.js";

const packages: Record<string, string> = {
  "packages/other.md": "acme/other",
  "packages/third.md": "acme/third",
};
const release = { selfPath: "packages/tools.md", packageOf: (path: string) => packages[path] ?? null };
const placed: Record<string, string> = { "acme/other": "packages/other.md", "acme/third": "packages/third.md" };
const tree = { selfPath: "packages/tools.md", placedPathOf: (name: string) => placed[name] ?? null };

test("citations: an address names a package and an anchor, and a citation's url is one of three forms", () => {
  assert.deepEqual(parseAddress("spex:acme/other#other-3"), { name: "acme/other", anchor: "other-3" });
  assert.equal(formatAddress("acme/other", "other-3"), "spex:acme/other#other-3");
  for (const url of ["spex:acme/other", "spex:acme/other#", "spex:acme#x-1", "spex:Acme/other#x-1", "spex:a/b/c#x-1", "other.md#other-3"]) {
    assert.equal(parseAddress(url), null, url);
  }
  for (const url of ["#tools-1", "other.md#other-3", "../meta.md#meta-15", "spex:acme/other#other-3"]) {
    assert.equal(isCitationUrl(url), true, url);
  }
  for (const url of ["other.md", "#", "other.md#", "https://example.com/a.md#x", "/specs/a.md#x", "spex:acme/other"]) {
    assert.equal(isCitationUrl(url), false, url);
  }
});

test("citations: a release keeps same-file citations, writes a package's spec as its address and drops the rest, warned", () => {
  const source = [
    "# tools: Tools",
    "",
    "## Intent",
    "",
    "Tools for agents, after [[local-1](local.md#local-1)] and [DR-174](../decisions/174-what-a-package-provides-is-placed.md).",
    "",
    "## External Behavior",
    "",
    "### tools-1",
    "",
    "The tool shall run [[other-3](other.md#other-3)] in place [[tools-2](tools.md#tools-2)].",
    "",
    "#### Cases",
    "",
    "> ### quoted-9",
    ">",
    "> A quote citing [[local-2](./local.md#local-2)].",
    "",
    "### tools-2",
    "",
    "The tool shall stop [[tools-1](#tools-1)] as [[third-1](../packages/third.md#third-1)] says, [[ext-1](spex:acme/ext#ext-1)] kept.",
    "",
    "See [the guide](../README.md), [[note](notes.md)], ![logo](logo.png#x) and [site](https://example.com/a.md#b).",
    "",
    "```md",
    "[[local-3](local.md#local-3)] in code",
    "```",
    "",
  ].join("\n");
  const asked: string[] = [];
  const { text, warnings } = rewriteForRelease(source, {
    ...release,
    packageOf: (path) => {
      asked.push(path);
      return release.packageOf(path);
    },
  });
  const expected = source
    .replace(" [[local-1](local.md#local-1)]", "")
    .replace("[DR-174](../decisions/174-what-a-package-provides-is-placed.md)", "DR-174")
    .replace("(other.md#other-3)", "(spex:acme/other#other-3)")
    .replace("(tools.md#tools-2)", "(#tools-2)")
    .replace(" [[local-2](./local.md#local-2)]", "")
    .replace("(../packages/third.md#third-1)", "(spex:acme/third#third-1)");
  assert.equal(text, expected);
  assert.deepEqual(warnings, [
    { kind: "citation", item: "intent", target: "packages/local.md#local-1" },
    { kind: "record", item: "intent", target: "DR-174" },
    { kind: "citation", item: "tools-1", target: "packages/local.md#local-2" },
  ], "a heading quoted in a blockquote and a topic heading inside an item name no item");
  assert.deepEqual(asked, ["packages/local.md", "packages/other.md", "packages/local.md", "packages/third.md"],
    "the package is asked of the cited file's path from the specs root, normalized");
});

test("citations: a citation of meta.md at the specs root is kept in both directions, written as the link from specs/packages/; a meta.md elsewhere is a spec of no package", () => {
  const source = [
    "### tools-1",
    "",
    "One sentence per line [[meta-25](../meta.md#meta-25)], one requirement [[meta-29](<.././meta.md#meta-29> \"Meta\")], as [[meta-2](meta.md#meta-2)] says.",
    "",
  ].join("\n");
  const asked: string[] = [];
  const built = rewriteForRelease(source, {
    ...release,
    packageOf: (path) => {
      asked.push(path);
      return release.packageOf(path);
    },
  });
  assert.equal(built.text, source.replace(" [[meta-2](meta.md#meta-2)]", ""), "the specs root's meta.md kept byte for byte");
  assert.deepEqual(built.warnings, [{ kind: "citation", item: "tools-1", target: "packages/meta.md#meta-2" }],
    "only the meta.md beside the file warned");
  assert.deepEqual(asked, ["packages/meta.md"], "no package is asked of the specs root's meta.md");
  // A package `meta` claiming every meta.md by its basename: the specs
  // root's stays the scaffold's all the same.
  const claimed = rewriteForRelease(source, { ...release, packageOf: () => "acme/meta" });
  assert.equal(claimed.text, source.replace("(meta.md#meta-2)", "(spex:acme/meta#meta-2)"), "no claim reaches the specs root's meta.md");

  // A source nested below specs/packages/: its link rebased to the one
  // a placed spec carries from specs/packages/.
  const deep = "### deep-1\n\nIt shall hold [[meta-15](../../meta.md#meta-15)] and [[meta-1](<../../meta.md#meta-1> \"Meta\")].\n";
  const rebased = deep.replace("../../meta.md#meta-15", "../meta.md#meta-15").replace("<../../meta.md#meta-1>", "../meta.md#meta-1");
  assert.deepEqual(rewriteForRelease(deep, { ...release, selfPath: "packages/lib/deep.md" }), { text: rebased, warnings: [] }, "a nested source's meta.md link written from specs/packages/");
  for (const [text, selfPath] of [[built.text, "packages/tools.md"], [rebased, "packages/deep.md"]] as const) {
    assert.deepEqual(rewriteForTree(text, { ...tree, selfPath }), { text, waiting: {} }, "a placed spec keeps its meta.md citations byte for byte");
  }
});

test("citations: a file two packages claim is a spec of no package, its warning naming every claim", () => {
  const source = [
    "### tools-1",
    "",
    "It shall run [[twice-1](twice.md#twice-1)] and [[other-3](other.md#other-3)].",
    "",
  ].join("\n");
  const { text, warnings } = rewriteForRelease(source, {
    ...release,
    packageOf: (path) => (path === "packages/twice.md" ? { claims: ["acme/twice", "other/twice"] } : release.packageOf(path)),
  });
  assert.equal(text, "### tools-1\n\nIt shall run and [[other-3](spex:acme/other#other-3)].\n", "removed with its brackets, the phrase kept");
  assert.deepEqual(warnings, [
    { kind: "citation", item: "tools-1", target: "packages/twice.md#twice-1", claims: ["acme/twice", "other/twice"] },
  ]);
});

test("citations: a removal takes its brackets and one space beside them, the phrase keeping its own spacing wherever the citation stands", () => {
  const source = [
    "### tools-1",
    "",
    "[[local-1](local.md#local-1)] opens the line.",
    "",
    "One phrase [[local-2](local.md#local-2)] [[local-3](local.md#local-3)].",
    "",
    "A mixed phrase [[other-1](other.md#other-1)] [[local-4](local.md#local-4)].",
    "",
    "Run together [[local-5](local.md#local-5)][[other-2](other.md#other-2)].",
    "",
    "| Case | Outcome |",
    "| --- | --- |",
    "| empty | refused [[local-6](local.md#local-6)] |",
    "| full | kept [[other-3](other.md#other-3)] |",
    "",
    "- a list item [[local-7](local.md#local-7)]",
    "  continued [[other-4](other.md#other-4)].",
    "",
  ].join("\n");
  const { text, warnings } = rewriteForRelease(source, release);
  assert.equal(text, [
    "### tools-1",
    "",
    "opens the line.",
    "",
    "One phrase.",
    "",
    "A mixed phrase [[other-1](spex:acme/other#other-1)].",
    "",
    "Run together [[other-2](spex:acme/other#other-2)].",
    "",
    "| Case | Outcome |",
    "| --- | --- |",
    "| empty | refused |",
    "| full | kept [[other-3](spex:acme/other#other-3)] |",
    "",
    "- a list item",
    "  continued [[other-4](spex:acme/other#other-4)].",
    "",
  ].join("\n"));
  assert.deepEqual(warnings.map((warning) => warning.target),
    [1, 2, 3, 4, 5, 6, 7].map((n) => `packages/local.md#local-${n}`));
  assert.ok(warnings.every((warning) => warning.item === "tools-1" && warning.kind === "citation"));
});

test("citations: a destination is replaced alone, its label markup and title kept and every other byte as it was", () => {
  const source = "\n\n#### tools-4  \n\nA  [[**other-3**](<other.md#other-3> \"Other\")]\t[DR-012](decisions/012-spec-package-files.md)  \n\n\n|x|[[third-2](  third.md#third-2  )]|\n|-|-|\nno newline at the end";
  const { text, warnings } = rewriteForRelease(source, { ...release, selfPath: "packages/tools.md" });
  assert.equal(text, "\n\n#### tools-4  \n\nA  [[**other-3**](spex:acme/other#other-3 \"Other\")]\tDR-012  \n\n\n|x|[[third-2](  spex:acme/third#third-2  )]|\n|-|-|\nno newline at the end");
  assert.deepEqual(warnings, [{ kind: "record", item: "tools-4", target: "DR-012" }],
    "a record's link from the specs root is reduced too");
  const plain = "# none\n\nNo [link](https://example.com) and no citation here.\r\n";
  assert.equal(rewriteForRelease(plain, release).text, plain);
  assert.deepEqual(rewriteForRelease(plain, release).warnings, []);
  assert.deepEqual(rewriteForTree(plain, tree), { text: plain, waiting: {} });
});

test("citations: a placed spec links each placed package's spec relatively and drops the addresses that wait, counted", () => {
  const source = [
    "### tools-1",
    "",
    "Run [[other-3](spex:acme/other#other-3)] [[absent-1](spex:acme/absent#absent-1)], then [[tools-2](#tools-2)].",
    "",
    "| a | [[absent-2](spex:acme/absent#absent-2)] |",
    "| --- | --- |",
    "",
    "- [[deep-1](spex:acme/deep#deep-1)] and [[gone-1](spex:acme/gone#gone-1)] [[self-1](spex:acme/tools#tools-1)]",
    "",
    "Left as written: [[local-1](local.md#local-1)] and [site](https://example.com).",
    "",
    "A malformed [[bad](spex:acme#x)] and [plain bad](spex:Bad_Org/kit) go.",
    "",
    "A plain [link](spex:acme/other#other-1) and [one waiting](spex:acme/absent#absent-3).",
    "",
  ].join("\n");
  const { text, waiting } = rewriteForTree(source, {
    selfPath: "packages/tools.md",
    placedPathOf: (name) => ({ ...placed, "acme/deep": "packages/lib/deep.md", "acme/tools": "packages/tools.md" })[name] ?? null,
  });
  assert.equal(text, [
    "### tools-1",
    "",
    "Run [[other-3](other.md#other-3)], then [[tools-2](#tools-2)].",
    "",
    "| a | |",
    "| --- | --- |",
    "",
    "- [[deep-1](lib/deep.md#deep-1)] and [[self-1](#tools-1)]",
    "",
    "Left as written: [[local-1](local.md#local-1)] and [site](https://example.com).",
    "",
    "A malformed and plain bad go.",
    "",
    "A plain [link](other.md#other-1) and one waiting.",
    "",
  ].join("\n"));
  assert.deepEqual(waiting, { "acme/absent": 3, "acme/gone": 1 }, "specs/ holds no address, a plain link's included, and no spex: link that is none, counted under no package");
});

test("citations: a release placed back with every package placed gives the project's own links again", () => {
  const source = [
    "# tools: Tools",
    "",
    "## External Behavior",
    "",
    "### tools-1",
    "",
    "The tool shall run [[other-3](other.md#other-3)] [[third-1](third.md#third-1)] after [[tools-2](#tools-2)].",
    "",
    "| Case | Outcome |",
    "| --- | --- |",
    "| one | [[other-4](other.md#other-4 \"x\")] |",
    "",
    "- [[third-2](third.md#third-2)] first.",
    "",
    "### tools-2",
    "",
    "It shall stop.",
    "",
  ].join("\n");
  const built = rewriteForRelease(source, release);
  assert.deepEqual(built.warnings, []);
  assert.ok(!built.text.includes(".md#"), "the release holds no relative citation");
  const back = rewriteForTree(built.text, tree);
  assert.deepEqual(back.waiting, {});
  assert.equal(back.text, source, "every byte as it was, the titled destination's title kept");
});
