// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalContentHash, listFiles } from "./copy-templates.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAFFOLD_ROOT = join(REPO_ROOT, "scaffold");
const I18N_ROOT = join(SCAFFOLD_ROOT, "i18n");

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
      assert.ok(!items.has(id), `meta.md repeats ${id}`);
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
    if (id !== undefined) {
      lines.push(line);
    }
  }
  flush();
  return items;
}

function normalizeFileTitle(text: string): string {
  let found = false;
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      if (!found && line.startsWith("# ")) {
        found = true;
        return "# <file-title>";
      }
      return line;
    })
    .join("\n");
}

function markdownLinkTargets(text: string): string[] {
  return [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
    (match) => match[1],
  );
}

function extractMetaShell(text: string): string {
  const lines: string[] = [];
  let inItem = false;
  for (const line of normalizeFileTitle(text).split("\n")) {
    if (/^### meta-\d+$/.test(line)) {
      inItem = true;
      continue;
    }
    if (inItem && line.startsWith("## ")) {
      inItem = false;
    }
    if (!inItem) lines.push(line);
  }
  return lines.join("\n");
}

function itemIds(text: string): string[] {
  return [...text.matchAll(/^### ([a-z][a-z0-9-]*-\d+)$/gm)].map((match) => match[1]);
}

function codeBlocks(text: string): string[] {
  return [...text.matchAll(/^```[^\n]*\n[\s\S]*?^```$/gm)].map((match) => match[0]);
}

describe("localized spec overlays", () => {
  for (const language of listOverlayLanguages()) {
    it(`checks ${language} against its canonical sources and source-pin manifest`, () => {
      const root = join(I18N_ROOT, language);
      const expectedPins: Record<string, string> = {};
      for (const overlayPath of listFiles(join(root, "specs"))) {
        const path = relative(root, overlayPath).split(sep).join("/");
        const base = readFileSync(join(SCAFFOLD_ROOT, path), "utf-8");
        const overlay = readFileSync(overlayPath, "utf-8");
        assert.doesNotMatch(overlay, /<!--\s*spex-i18n-source:/, `${language} ${path} contains a source pin`);

        if (path === "specs/meta.md") {
          const baseItems = extractMetaItems(base);
          const overlayItems = extractMetaItems(overlay);
          assert.deepEqual([...overlayItems.keys()].sort(), [...baseItems.keys()].sort(), `${path} item set`);
          for (const [id, item] of baseItems) {
            if (overlayItems.get(id) !== item) {
              expectedPins[`${path}#${id}`] = canonicalContentHash(Buffer.from(item));
            }
          }
          if (extractMetaShell(overlay) !== extractMetaShell(base)) {
            expectedPins[path] = canonicalContentHash(Buffer.from(base));
          }
          continue;
        }

        if (normalizeFileTitle(overlay) !== normalizeFileTitle(base)) {
          expectedPins[path] = canonicalContentHash(Buffer.from(base));
        }
        assert.deepEqual(markdownLinkTargets(overlay), markdownLinkTargets(base), `${path} link targets`);
        if (path !== "specs/map.md") {
          assert.deepEqual(itemIds(overlay), itemIds(base), `${path} item IDs`);
          assert.deepEqual(codeBlocks(overlay), codeBlocks(base), `${path} code examples`);
        }
      }

      const pins = JSON.parse(readFileSync(join(root, "source-pins.json"), "utf-8"));
      assert.deepEqual(pins, expectedPins, `${language} source pins must match the English sources of the translations`);
    });
  }
});
