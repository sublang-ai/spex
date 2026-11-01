// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The placed specs' record read at an environment's root (DR-174): the
// record an install writes reads back whole, and anything else — a
// missing or unreadable file, no JSON, another format or an entry of
// another shape — reads as no record.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SPEX_DIR } from "./layout.js";
import { PLACED_RECORD, placedRecordPath, readPlacedRecord, type PlacedRecord } from "./placed-record.js";

const record: PlacedRecord = {
  format: 1,
  specs: {
    "acme/tools": { path: "specs/packages/tools.md", sha256: "ab".repeat(32), waiting: { "acme/other": 2 } },
    "acme/plain": { path: "specs/packages/plain.md", sha256: "cd".repeat(32), waiting: {} },
  },
};

function rootWith(text?: string): string {
  const root = mkdtempSync(join(tmpdir(), "spex-placed-"));
  if (text !== undefined) {
    mkdirSync(join(root, SPEX_DIR), { recursive: true });
    writeFileSync(placedRecordPath(root), text);
  }
  return root;
}

test("placed record: the record an install writes reads back whole at <root>/.spex/placed.json", () => {
  const root = rootWith(JSON.stringify(record));
  assert.equal(PLACED_RECORD, "placed.json");
  assert.equal(placedRecordPath(root), join(root, ".spex", "placed.json"));
  assert.deepEqual(readPlacedRecord(root), record);
  assert.deepEqual(readPlacedRecord(rootWith(JSON.stringify({ format: 1, specs: {} }))), { format: 1, specs: {} });
});

test("placed record: a missing, unreadable, unknown or misshapen record reads as none", () => {
  assert.equal(readPlacedRecord(rootWith()), null, "no .spex/");
  const folder = rootWith();
  mkdirSync(placedRecordPath(folder), { recursive: true });
  assert.equal(readPlacedRecord(folder), null, "a folder where the file stands");
  const tools = record.specs["acme/tools"]!;
  const one = (entry: unknown) => JSON.stringify({ format: 1, specs: { "acme/tools": entry } });
  for (const [why, text] of [
    ["no JSON", "{\"format\":1,"],
    ["no object", "[]"],
    ["another format", JSON.stringify({ ...record, format: 2 })],
    ["no format", JSON.stringify({ specs: record.specs })],
    ["specs no object", JSON.stringify({ format: 1, specs: [] })],
    ["an entry without a path", one({ sha256: tools.sha256, waiting: {} })],
    ["an entry without a hash", one({ path: tools.path, waiting: {} })],
    ["an entry without waiting", one({ path: tools.path, sha256: tools.sha256 })],
    ["a negative count", one({ ...tools, waiting: { "acme/other": -1 } })],
    ["a count as text", one({ ...tools, waiting: { "acme/other": "1" } })],
  ] as const) {
    assert.equal(readPlacedRecord(rootWith(text)), null, why);
  }
});
