// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: approval labels and digests, comparing a
 * guard's inputs with its record, and the record's file.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  approvalPath,
  approvalText,
  compareApproval,
  digest,
  fileLabel,
  itemLabel,
  parseApproval,
  readApproval,
  sortInputs,
  writeApproval,
} from "./approval.js";
import { GuardError } from "./types.js";

const sha = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function message(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

describe("guards-14: approval: labels and digests", () => {
  it("labels an item by its ID and a file by its path from the root", () => {
    assert.equal(itemLabel("environments-55"), "item environments-55");
    assert.equal(fileLabel("guards/environments-55/guard.yaml"), "file guards/environments-55/guard.yaml");
    assert.equal(approvalPath("environments-55"), "guards/environments-55/approval.json");
  });

  it("digests text as SHA-256 of its LF form", () => {
    assert.equal(digest("format: 1\nbinding: x\n"), sha("format: 1\nbinding: x\n"));
    assert.equal(digest(Buffer.from("format: 1\nbinding: x\n")), sha("format: 1\nbinding: x\n"));
  });

  it("digests a CRLF checkout the same as an LF one", () => {
    const lf = "### e-1\n\nThe thing shall hold.\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    assert.equal(digest(Buffer.from(crlf)), digest(Buffer.from(lf)));
    assert.equal(digest(crlf), digest(lf));
    assert.notEqual(digest(Buffer.from(lf)), digest(Buffer.from(lf.replace("hold", "held"))));
    assert.notEqual(digest("a\rb"), digest("a\nb"), "a CR alone is not a line ending");
  });

  it("digests bytes that are not UTF-8 text as they are", () => {
    const bytes = Buffer.from([0xff, 0xfe, 0x0d, 0x0a, 0x00]);
    assert.equal(digest(bytes), sha(bytes));
  });
});

describe("guards-19: approval: comparing with the record", () => {
  const inputs = { "item e-1": A, "file guards/e-1/guard.yaml": B, "file guards/e-1/readings/a.yaml": C };

  it("is approved when every input has its recorded digest", () => {
    assert.deepEqual(compareApproval(inputs, { ...inputs }), {
      approved: true,
      recorded: true,
      changed: [],
      added: [],
      gone: [],
    });
  });

  it("has no record", () => {
    assert.deepEqual(compareApproval(inputs, null), {
      approved: false,
      recorded: false,
      changed: [],
      added: ["file guards/e-1/guard.yaml", "file guards/e-1/readings/a.yaml", "item e-1"],
      gone: [],
    });
  });

  it("names what changed, was added and is gone, in order", () => {
    const record = {
      "item e-1": B,
      "file guards/e-1/guard.yaml": B,
      "item e-0": A,
      "file guards/e-1/faults/x.patch": C,
    };
    assert.deepEqual(compareApproval(inputs, record), {
      approved: false,
      recorded: true,
      changed: ["item e-1"],
      added: ["file guards/e-1/readings/a.yaml"],
      gone: ["file guards/e-1/faults/x.patch", "item e-0"],
    });
  });

  it("is not approved by an empty record", () => {
    const state = compareApproval(inputs, {});
    assert.equal(state.approved, false);
    assert.equal(state.recorded, true);
    assert.equal(state.added.length, 3);
  });

  it("follows an edit that only changes line endings", () => {
    const lf = { "item e-1": digest("### e-1\n\nIt shall hold.") };
    const crlf = { "item e-1": digest(Buffer.from("### e-1\r\n\r\nIt shall hold.")) };
    assert.equal(compareApproval(crlf, lf).approved, true);
  });
});

describe("guards-15: approval: the record's file", () => {
  const inputs = { "item e-1": A, "file guards/e-1/guard.yaml": B };

  it("writes keys in order, two-space indent and a final newline", () => {
    assert.equal(
      approvalText(inputs),
      `{\n  "format": 1,\n  "inputs": {\n    "file guards/e-1/guard.yaml": "${B}",\n    "item e-1": "${A}"\n  }\n}\n`,
    );
    assert.deepEqual(Object.keys(sortInputs(inputs)), ["file guards/e-1/guard.yaml", "item e-1"]);
    assert.deepEqual(parseApproval(approvalText(inputs)), inputs);
  });

  const cases: [string, string, string][] = [
    ["text that is not JSON", "{", "not readable as JSON"],
    ["a list", "[]", "expected a mapping, found []"],
    ["another format", `{"format":2,"inputs":{}}`, "format must be 1"],
    ["an unknown key", `{"format":1,"inputs":{},"by":"me"}`, "unknown key 'by'"],
    ["no inputs", `{"format":1}`, "expected a mapping, found nothing"],
    ["a digest that is none", `{"format":1,"inputs":{"item e-1":"abc"}}`, `'item e-1' holds "abc", not a SHA-256 digest`],
    ["a label that is none", `{"format":1,"inputs":{"e-1":"${A}"}}`, "'e-1' is not an input's label"],
  ];
  for (const [name, text, expected] of cases) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => parseApproval(text)), expected);
    });
  }

  it("reads back what it wrote, and null where there is no record", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-approval-")));
    try {
      mkdirSync(join(root, "guards", "e-1"), { recursive: true });
      assert.equal(readApproval(root, "e-1"), null);
      assert.equal(writeApproval(root, "e-1", inputs), "guards/e-1/approval.json");
      assert.equal(readFileSync(join(root, "guards", "e-1", "approval.json"), "utf8"), approvalText(inputs));
      assert.deepEqual(readApproval(root, "e-1"), inputs);
      assert.equal(compareApproval(inputs, readApproval(root, "e-1")).approved, true);

      writeFileSync(join(root, "guards", "e-1", "approval.json"), "not json");
      assert.equal(message(() => readApproval(root, "e-1")), "guards/e-1/approval.json: not readable as JSON");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
