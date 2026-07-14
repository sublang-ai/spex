// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { humanizeBasename, mergePackageSources } from "./merge-package.js";

const SPDX = `<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Test -->`;

describe("mergePackageSources", () => {
  it("merges three sources into the section skeleton", () => {
    const result = mergePackageSources("auth", {
      user: {
        text: `${SPDX}\n\n# AUTH: User-Facing Auth Behavior\n\n## Intent\n\nUser side.\n\n## Login\n\n### AUTH-1\n\nWhen credentials are valid, the system shall log in.\n`,
      },
      dev: {
        text: `${SPDX}\n\n# AUTH: Auth Implementation Requirements\n\n## Intent\n\nDev side.\n\n## Store\n\n### AUTH-2\n\nThe store shall persist sessions.\n`,
      },
      test: {
        text: `${SPDX}\n\n# AUTH: Auth Acceptance Tests\n\n## Intent\n\nTest side.\n\n## Coverage\n\n### AUTH-3\nVerifies: [AUTH-1](../user/auth.md#auth-1)\n\nThe suite shall cover login.\n`,
      },
    });

    assert.equal(result.shortForm, "AUTH");
    // Differing role titles: the user title minus its role qualifiers.
    assert.equal(result.title, "Auth");
    const content = result.content;
    assert.ok(content.startsWith(`${SPDX}\n\n# AUTH: Auth\n`));
    const sections = [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(sections, [
      "Intent",
      "External Behavior",
      "Internal Behavior",
      "Verification",
    ]);
    // Topic headings demoted below the group sections; items one deeper.
    assert.match(content, /\n### Login\n/);
    assert.match(content, /\n#### AUTH-1\n/);
    assert.match(content, /\n### Coverage\n/);
    assert.match(content, /\n#### AUTH-3\nVerifies:/);
    // All intents kept (deduped later by an agent).
    assert.match(content, /User side\.\n\nDev side\.\n\nTest side\./);
    // No stray demotion markers leak into section boundaries.
    assert.doesNotMatch(content, /^#\s*$/m);
  });

  it("keeps a single source almost verbatim with its title", () => {
    const result = mergePackageSources("git", {
      dev: {
        text: `# GIT: Git Workflow\n\n## Intent\n\nGit rules.\n\n## Commits\n\n### GIT-1\n\nCommits shall be tidy.\n`,
      },
    });
    assert.equal(result.title, "Git Workflow");
    assert.equal(
      result.content,
      `# GIT: Git Workflow\n\n## Intent\n\nGit rules.\n\n## Internal Behavior\n\n### Commits\n\n#### GIT-1\n\nCommits shall be tidy.\n`,
    );
  });

  it("dedupes identical intents and SPDX blocks", () => {
    const text = (group: string) =>
      `${SPDX}\n\n# X: Thing\n\n## Intent\n\nShared intent.\n\n## ${group}\n\n### X-${group.length}\n\nBehavior.\n`;
    const result = mergePackageSources("x", {
      user: { text: text("Alpha") },
      dev: { text: text("Beta") },
    });
    assert.equal(
      result.content.match(/Shared intent\./g)?.length,
      1,
      "identical intents merge to one",
    );
    assert.equal(
      result.content.match(/SPDX-License-Identifier/g)?.length,
      1,
      "identical SPDX blocks merge to one",
    );
  });

  it("renumbers reference definitions and markers across sources", () => {
    const result = mergePackageSources("refs", {
      user: {
        text: `# R: Refs\n\n## Intent\n\nSee [[1]] and [[2]].\n\n## A\n\n### R-1\n\nUses [[2]].\n\n## References\n\n[1]: https://one.example "One"\n[2]: https://two.example "Two"\n`,
      },
      dev: {
        text: `# R: Refs\n\n## Intent\n\nSee [[1]].\n\n## B\n\n### R-2\n\nUses [[1]] and [[2]].\n\n## References\n\n[1]: https://three.example "Three"\n[2]: https://one.example "One"\n`,
      },
    });
    const content = result.content;
    // Merged definitions: one/two from user, three new from dev; the
    // dev [2] (same URL+title as user [1]) dedupes to 1.
    assert.match(content, /\[1\]: https:\/\/one\.example "One"/);
    assert.match(content, /\[2\]: https:\/\/two\.example "Two"/);
    assert.match(content, /\[3\]: https:\/\/three\.example "Three"/);
    assert.equal(content.match(/\[1\]: /g)?.length, 1);
    // Dev body markers renumbered: [[1]]→[[3]], [[2]]→[[1]].
    assert.match(content, /Uses \[\[3\]\] and \[\[1\]\]\./);
    // User body markers unchanged.
    assert.match(content, /Uses \[\[2\]\]\./);
    // Exactly one References section, at the end.
    assert.equal(content.match(/^## References$/gm)?.length, 1);
  });

  it("keeps unused definitions and mid-file References sections", () => {
    const result = mergePackageSources("shell", {
      dev: {
        text: `# S: Shell\n\n## Intent\n\nShell.\n\n## References\n\n[1]: https://used.example "Used"\n[2]: https://unused.example "Unused"\n\n## Bridge\n\n### S-1\n\nUses [[1]].\n`,
      },
    });
    const content = result.content;
    assert.match(content, /\[2\]: https:\/\/unused\.example "Unused"/);
    // Body section after the References section is still captured.
    assert.match(content, /## Internal Behavior\n\n### Bridge\n\n#### S-1/);
    // References hoisted to the end.
    assert.ok(
      content.indexOf("## References") > content.indexOf("### Bridge"),
    );
  });

  it("handles a missing H1 by falling back to item IDs", () => {
    const result = mergePackageSources("thing", {
      user: { text: `## Intent\n\nBare.\n\n## Ops\n\n### THING-1\n\nWorks.\n` },
    });
    assert.equal(result.shortForm, "THING");
    assert.match(result.content, /^# THING: Thing$/m);
  });

  it("rewrites setext headings as demoted ATX", () => {
    const result = mergePackageSources("s", {
      dev: {
        text: `# S: S\n\n## Intent\n\nX.\n\nTopic\n-----\n\n### S-1\n\nY.\n`,
      },
    });
    assert.match(result.content, /\n### Topic\n/);
    assert.doesNotMatch(result.content, /-----/);
  });

  it("normalizes CRLF sources to LF", () => {
    const result = mergePackageSources("c", {
      dev: {
        text: "# C: C\r\n\r\n## Intent\r\n\r\nX.\r\n\r\n## T\r\n\r\n### C-1\r\n\r\nY.\r\n",
      },
    });
    assert.ok(!result.content.includes("\r"));
    assert.match(result.content, /\n### T\n/);
  });

  it("keeps multibyte content byte-faithful", () => {
    const result = mergePackageSources("zh-pkg", {
      user: {
        text: `# ZH: 认证\n\n## 意图\n\n中文意图说明。\n\n## 登录\n\n### ZH-1\n\n当凭据有效时，系统应创建会话。\n`,
      },
    });
    assert.match(result.content, /^# ZH: 认证$/m);
    assert.match(result.content, /中文意图说明。/);
    assert.match(result.content, /\n### 登录\n\n#### ZH-1\n/);
  });
});

describe("humanizeBasename", () => {
  it("title-cases kebab names", () => {
    assert.equal(humanizeBasename("core-service"), "Core Service");
    assert.equal(humanizeBasename("scaffold"), "Scaffold");
  });
});
