// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { authoringDocuments } from "./authoring.js";
import { scratchDir } from "./testing/scratch.js";

test("authoring references are readable by an external process beside an asar (playbook-library-65)", () => {
  const root = join(scratchDir("spex-authoring-documents-"), "中文 app");
  const archived = join(root, "app.asar", "node_modules", "@sublang", "playbook");
  const physical = join(root, "app.asar.unpacked", "node_modules", "@sublang", "playbook");
  for (const [index, document] of authoringDocuments(physical).entries()) {
    mkdirSync(dirname(document.path), { recursive: true });
    writeFileSync(document.path, `physical reference ${index}`);
  }
  const documents = authoringDocuments(archived);
  assert.ok(documents.every(document => document.path.startsWith(physical)));
  const read = spawnSync(process.execPath, ["-e", `
    const fs = require("node:fs");
    console.log(JSON.stringify(process.argv.slice(1).map(file => fs.readFileSync(file, "utf8"))));
  `, ...documents.map(document => document.path)], { encoding: "utf8" });
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout), [0, 1, 2, 3].map(index => `physical reference ${index}`));
  assert.deepEqual(authoringDocuments(physical), documents, "physical and source paths stay unchanged");
  const absent = join(root, "missing.asar", "node_modules", "@sublang", "playbook");
  assert.ok(authoringDocuments(absent).every(document => document.path.startsWith(absent)), "no invented unpacked path");
});
