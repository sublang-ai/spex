// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renameInteractionsHeading, restructureMap } from "./restructure-map.js";

const EN_MAP = `# Spec Map

Index.

## Layout

\`\`\`text
decisions/  Decision records (DRs)
iterations/ Iteration records (IRs)
user/       User-visible item files
dev/        Implementation item files
test/       Acceptance test item files
map.md      This index
meta.md     The spec of specs
\`\`\`

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-001 | [001-x.md](decisions/001-x.md) | A decision |

## Packages

### AUTH

| Group | File | Summary |
| --- | --- | --- |
| user | [auth.md](packages/auth.md) | Login and logout behavior |
| dev | [auth.md](packages/auth.md) | Session store internals |
| test | [auth.md](packages/auth.md) | Login coverage |

### GIT

| Group | File | Summary |
| --- | --- | --- |
| dev | [git.md](packages/git.md) | Commit rules |
`;

describe("restructureMap", () => {
  it("rewrites the layout block, reshapes group tables, appends Compositions", () => {
    const result = restructureMap(EN_MAP, "en");
    assert.ok(result !== null);
    // Layout block: group lines replaced once, others kept.
    assert.match(result, /packages\/ {5}Spec packages \(one file per package\)/);
    assert.match(
      result,
      /compositions\/ Cross-package compositions: scenarios, bindings, tests/,
    );
    assert.doesNotMatch(result, /^user\/ {7}User-visible/m);
    assert.match(result, /decisions\/ {2}Decision records/);
    // AUTH table: one row, first summary wins, others joined.
    assert.match(
      result,
      /### AUTH\n\n\| File \| Summary \|\n\| --- \| --- \|\n\| \[auth\.md\]\(packages\/auth\.md\) \| Login and logout behavior; Session store internals; Login coverage \|/,
    );
    // GIT table: dev-only row survives.
    assert.match(
      result,
      /### GIT\n\n\| File \| Summary \|\n\| --- \| --- \|\n\| \[git\.md\]\(packages\/git\.md\) \| Commit rules \|/,
    );
    // Decisions table untouched.
    assert.match(result, /\| DR-001 \| \[001-x\.md\]\(decisions\/001-x\.md\) \| A decision \|/);
    // Interactions section appended.
    assert.match(result, /\n## Compositions\n\nNone yet\./);
  });

  it("keeps localized headers when reshaping zh-style tables", () => {
    const zhMap = `# 规约地图

## 包

### GIT

| 分组 | 文件 | 摘要 |
| --- | --- | --- |
| dev | [git.md](packages/git.md) | 提交规则 |
`;
    const result = restructureMap(zhMap, "zh");
    assert.ok(result !== null);
    assert.match(
      result,
      /\| 文件 \| 摘要 \|\n\| --- \| --- \|\n\| \[git\.md\]\(packages\/git\.md\) \| 提交规则 \|/,
    );
    assert.match(result, /\n## 组合\n\n暂无。/);
  });

  it("leaves non-group tables and prose verbatim, still adding Compositions", () => {
    const custom = `# Map

## Notes

Some prose.

| Feature | Owner |
| --- | --- |
| login | alice |
`;
    const result = restructureMap(custom, "en");
    assert.ok(result !== null);
    // Everything is preserved; only the Interactions section is added.
    assert.ok(result.startsWith(custom.trimEnd()));
    assert.match(result, /\n## Compositions\n\nNone yet\./);
  });

  it("does not append Compositions when one exists", () => {
    const withCompositions = `${EN_MAP}\n## Compositions\n\n| File | Summary |\n| --- | --- |\n| [login-flow.md](compositions/login-flow.md) | End-to-end login |\n`;
    const result = restructureMap(withCompositions, "en");
    assert.ok(result !== null);
    assert.equal(result.match(/^## Compositions$/gm)?.length, 1);
  });

  it("renames a legacy Interactions heading in place", () => {
    const withLegacy = `${EN_MAP}\n## Interactions\n\n| File | Summary |\n| --- | --- |\n| [login-flow.md](compositions/login-flow.md) | End-to-end login |\n`;
    const result = restructureMap(withLegacy, "en");
    assert.ok(result !== null);
    assert.doesNotMatch(result, /^## Interactions$/m);
    assert.equal(result.match(/^## Compositions$/gm)?.length, 1);

    const renamed = renameInteractionsHeading("# Map\n\n## Interactions\n\nBody.\n", "en");
    assert.ok(renamed !== null);
    assert.match(renamed, /^## Compositions$/m);
    assert.equal(renameInteractionsHeading("# Map\n\n## Compositions\n", "en"), null);
    const zh = renameInteractionsHeading("# 地图\n\n## 交互\n\n正文。\n", "zh");
    assert.ok(zh !== null);
    assert.match(zh, /^## 组合$/m);
  });

  it("rewrites an interactions/ layout-block line alongside the heading", () => {
    const renamed = renameInteractionsHeading(
      [
        "# Map",
        "",
        "## Layout",
        "",
        "```text",
        "packages/     Spec packages (one file per package)",
        "interactions/ Cross-package behaviors and tests",
        "```",
        "",
        "## Interactions",
        "",
        "Body.",
        "",
      ].join("\n"),
      "en",
    );
    assert.ok(renamed !== null);
    assert.match(
      renamed,
      /^compositions\/ Cross-package compositions: scenarios, bindings, tests$/m,
    );
    assert.doesNotMatch(renamed, /^interactions\//m);
    assert.match(renamed, /^## Compositions$/m);
  });
});
