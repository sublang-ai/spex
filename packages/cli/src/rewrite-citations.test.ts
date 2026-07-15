// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  remapLegacyUrl,
  rewriteLegacyCitations,
  type CitationRewriteOptions,
} from "./rewrite-citations.js";

function options(overrides: Partial<CitationRewriteOptions> = {}): CitationRewriteOptions {
  return {
    legacyTargetExists: () => false,
    newTargetExists: () => true,
    ...overrides,
  };
}

describe("remapLegacyUrl", () => {
  it("remaps group paths from decisions and iterations", () => {
    assert.equal(
      remapLegacyUrl("specs/decisions/001-x.md", "../user/auth.md#auth-1", options()),
      "../packages/auth.md#auth-1",
    );
    assert.equal(
      remapLegacyUrl("specs/iterations/003-y.md", "../dev/flows/checkout.md", options()),
      "../packages/flows/checkout.md",
    );
  });

  it("remaps map-relative and items paths", () => {
    assert.equal(
      remapLegacyUrl("specs/map.md", "test/auth.md#auth-3", options()),
      "packages/auth.md#auth-3",
    );
    assert.equal(
      remapLegacyUrl("specs/map.md", "items/dev/git.md", options()),
      "packages/git.md",
    );
  });

  it("collapses self-links to anchors", () => {
    assert.equal(
      remapLegacyUrl("specs/packages/auth.md", "../user/auth.md#auth-1", options()),
      "#auth-1",
    );
    assert.equal(
      remapLegacyUrl("specs/packages/auth.md", "../dev/auth.md", options()),
      "auth.md",
    );
  });

  it("leaves conflict-kept and unmigrated targets alone", () => {
    assert.equal(
      remapLegacyUrl(
        "specs/map.md",
        "user/auth.md",
        options({ legacyTargetExists: () => true }),
      ),
      null,
    );
    assert.equal(
      remapLegacyUrl(
        "specs/map.md",
        "user/auth.md",
        options({ newTargetExists: () => false }),
      ),
      null,
    );
  });

  it("ignores non-spec and non-relative URLs", () => {
    for (const url of [
      "https://example.com/user/auth.md",
      "mailto:x@y.z",
      "/user/auth.md",
      "#anchor",
      "../README.md",
      "../../src/user/auth.md",
    ]) {
      assert.equal(remapLegacyUrl("specs/map.md", url, options()), null, url);
    }
  });
});

describe("rewriteLegacyCitations", () => {
  it("rewrites links, images, and definitions byte-precisely", () => {
    const text = `# X\n\nSee [AUTH-1](../user/auth.md#auth-1) and ![pic](../test/shots/a.png).\n\n[ref]: ../dev/auth.md#auth-2 "Title"\n`;
    const result = rewriteLegacyCitations("specs/decisions/001-x.md", text, options());
    assert.equal(
      result,
      `# X\n\nSee [AUTH-1](../packages/auth.md#auth-1) and ![pic](../packages/shots/a.png).\n\n[ref]: ../packages/auth.md#auth-2 "Title"\n`,
    );
  });

  it("returns null when nothing needs rewriting", () => {
    const text = `# X\n\nSee [META-1](../meta.md#meta-1).\n`;
    assert.equal(
      rewriteLegacyCitations("specs/decisions/001-x.md", text, options()),
      null,
    );
  });

  it("does not touch link text that repeats the URL", () => {
    const text = `[user/auth.md](user/auth.md)\n`;
    const result = rewriteLegacyCitations("specs/map.md", text, options());
    assert.equal(result, `[user/auth.md](packages/auth.md)\n`);
  });

  it("rewrites the URL, not a quoted title that repeats it", () => {
    const text = `See [the spec](user/foo.md "user/foo.md") for details.\n`;
    const result = rewriteLegacyCitations("specs/map.md", text, options());
    assert.equal(
      result,
      `See [the spec](packages/foo.md "user/foo.md") for details.\n`,
    );
  });

  it("skips fenced code blocks", () => {
    const text = "# X\n\n```md\n[a](../user/auth.md)\n```\n";
    assert.equal(
      rewriteLegacyCitations("specs/decisions/001-x.md", text, options()),
      null,
    );
  });
});
