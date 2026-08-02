// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function extractMetaItems(text: string): Map<string, string> {
  const items = new Map<string, string>();
  let id: string | undefined;
  let lines: string[] = [];

  function flush(): void {
    if (id !== undefined) {
      items.set(id, lines.join("\n").trimEnd());
    }
  }

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = line.match(/^### (meta-\d+)$/);
    if (heading !== null) {
      flush();
      id = heading[1];
      lines = [line];
      continue;
    }
    if (id !== undefined && line.startsWith("## ")) {
      flush();
      id = undefined;
      lines = [];
      continue;
    }
    if (id !== undefined && !line.startsWith("<!-- spex-i18n-source:")) {
      lines.push(line);
    }
  }
  flush();
  return items;
}

// The scaffold's meta.md is the law; the repo's own tree and the demo
// carry the same items (demo/README.md promises as much). Non-item
// content — Intent, References numbering — may differ per tree, so
// parity is checked at item granularity, byte for byte.
describe("english meta item parity across trees", () => {
  it("keeps scaffold, root, and demo meta items identical", () => {
    let gitRoot: string;
    try {
      gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return; // packed install: sibling trees are not shipped
    }

    const lawPath = join(gitRoot, "scaffold", "specs", "meta.md");
    if (!existsSync(lawPath)) return;
    const law = extractMetaItems(readFileSync(lawPath, "utf-8"));

    for (const tree of ["specs", join("demo", "specs")]) {
      const metaPath = join(gitRoot, tree, "meta.md");
      if (!existsSync(metaPath)) continue;
      const items = extractMetaItems(readFileSync(metaPath, "utf-8"));

      assert.deepEqual(
        [...items.keys()].sort(),
        [...law.keys()].sort(),
        `${tree}/meta.md item set diverges from the scaffold law`,
      );
      for (const [id, body] of law) {
        assert.equal(
          items.get(id),
          body,
          `${tree}/meta.md ${id} diverges from the scaffold law`,
        );
      }
    }
  });
});
