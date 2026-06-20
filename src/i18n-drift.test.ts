// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalContentHash } from "./copy-templates.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAFFOLD_ROOT = join(REPO_ROOT, "scaffold");
const I18N_ROOT = join(SCAFFOLD_ROOT, "i18n");
const TRANSLATED_META_ITEMS = new Set([
  "META-3",
  "META-4",
  "META-5",
  "META-6",
  "META-7",
  "META-19",
  "META-27",
]);

function listOverlayLanguages(): string[] {
  if (!existsSync(I18N_ROOT)) return [];
  return readdirSync(I18N_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

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
    const heading = line.match(/^### (META-\d+)$/);
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

function extractSourcePins(text: string): Map<string, string> {
  const pins = new Map<string, string>();
  const pinPattern =
    /^<!-- spex-i18n-source: (META-\d+) (sha256-[a-f0-9]{64}) -->$/gm;
  for (const match of text.matchAll(pinPattern)) {
    pins.set(match[1], match[2]);
  }
  return pins;
}

function hashItem(item: string): string {
  return canonicalContentHash(Buffer.from(item));
}

describe("localized meta.md overlays", () => {
  it("preserve item completeness, untranslated parity, and source pins", () => {
    const baseText = readFileSync(join(SCAFFOLD_ROOT, "specs", "meta.md"), "utf-8");
    const baseItems = extractMetaItems(baseText);

    for (const language of listOverlayLanguages()) {
      const overlayPath = join(I18N_ROOT, language, "specs", "meta.md");
      if (!existsSync(overlayPath)) continue;

      const overlayText = readFileSync(overlayPath, "utf-8");
      const overlayItems = extractMetaItems(overlayText);
      const pins = extractSourcePins(overlayText);

      assert.deepEqual(
        [...overlayItems.keys()].sort(),
        [...baseItems.keys()].sort(),
        `${language} meta.md should contain every base META item`,
      );

      for (const [id, baseItem] of baseItems) {
        const overlayItem = overlayItems.get(id);
        assert.ok(overlayItem !== undefined, `${language} missing ${id}`);
        if (TRANSLATED_META_ITEMS.has(id)) {
          assert.equal(
            pins.get(id),
            hashItem(baseItem),
            `${language} ${id} source hash is stale or missing`,
          );
        } else {
          assert.equal(
            overlayItem,
            baseItem,
            `${language} ${id} should remain byte-identical to English`,
          );
          assert.equal(
            pins.has(id),
            false,
            `${language} ${id} has an unexpected translation source pin`,
          );
        }
      }
    }
  });
});
