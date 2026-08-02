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

function extractSourcePins(text: string): Map<string, string> {
  const pins = new Map<string, string>();
  const pinPattern =
    /^<!-- spex-i18n-source: (meta-\d+) (sha256-[a-f0-9]{64}) -->$/gm;
  for (const match of text.matchAll(pinPattern)) {
    pins.set(match[1], match[2]);
  }
  return pins;
}

function hashItem(item: string): string {
  return canonicalContentHash(Buffer.from(item));
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
    if (line.startsWith("<!-- spex-i18n-source:")) continue;
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

describe("localized spec overlays", () => {
  it("allows only source-pinned meta translations and localized file titles", () => {
    const baseText = readFileSync(join(SCAFFOLD_ROOT, "specs", "meta.md"), "utf-8");
    const baseItems = extractMetaItems(baseText);

    for (const language of listOverlayLanguages()) {
      const overlayPath = join(I18N_ROOT, language, "specs", "meta.md");
      if (!existsSync(overlayPath)) continue;

      const overlayText = readFileSync(overlayPath, "utf-8");
      const overlayItems = extractMetaItems(overlayText);
      const pins = extractSourcePins(overlayText);
      const fileMarkers = [
        ...overlayText.matchAll(
          /^<!-- spex-i18n-source: meta\.md (sha256-[a-f0-9]{64}) -->$/gm,
        ),
      ];
      const changedIds = [...baseItems]
        .filter(([id, item]) => overlayItems.get(id) !== item)
        .map(([id]) => id)
        .sort();

      const shellDiffers =
        extractMetaShell(overlayText) !== extractMetaShell(baseText);
      assert.equal(
        fileMarkers.length,
        shellDiffers ? 1 : 0,
        `${language} meta.md should carry one file pin exactly when non-item content is translated`,
      );
      if (shellDiffers) {
        assert.equal(
          fileMarkers[0][1],
          canonicalContentHash(Buffer.from(baseText)),
          `${language} meta.md file hash is stale`,
        );
      }

      assert.deepEqual(
        [...overlayItems.keys()].sort(),
        [...baseItems.keys()].sort(),
        `${language} meta.md should contain every base META item`,
      );
      assert.deepEqual(
        [...pins.keys()].sort(),
        changedIds,
        `${language} source pins should match its differing META items`,
      );

      for (const [id, baseItem] of baseItems) {
        const overlayItem = overlayItems.get(id);
        assert.ok(overlayItem !== undefined, `${language} missing ${id}`);
        if (overlayItem !== baseItem) {
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

  it("keeps localized map overlays source-pinned and link-equivalent", () => {
    const baseText = readFileSync(join(SCAFFOLD_ROOT, "specs", "map.md"), "utf-8");
    for (const language of listOverlayLanguages()) {
      const overlayPath = join(I18N_ROOT, language, "specs", "map.md");
      if (!existsSync(overlayPath)) continue;

      const overlayText = readFileSync(overlayPath, "utf-8");
      const markers = [
        ...overlayText.matchAll(
          /^<!-- spex-i18n-source: map\.md (sha256-[a-f0-9]{64}) -->$/gm,
        ),
      ];
      const withoutMarker = overlayText.replace(
        /^<!-- spex-i18n-source: map\.md sha256-[a-f0-9]{64} -->\n/gm,
        "",
      );
      const bodyDiffers =
        normalizeFileTitle(withoutMarker) !== normalizeFileTitle(baseText);

      assert.equal(
        markers.length,
        bodyDiffers ? 1 : 0,
        `${language} map.md should carry one source pin exactly when its body is translated`,
      );
      if (bodyDiffers) {
        assert.equal(
          markers[0][1],
          canonicalContentHash(Buffer.from(baseText)),
          `${language} map.md source hash is stale`,
        );
      }
      assert.deepEqual(
        markdownLinkTargets(overlayText),
        markdownLinkTargets(baseText),
        `${language} map.md should preserve the English index targets`,
      );
    }
  });
});
