// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package's exports (cli-14): the library's modules and the
// scaffold's files resolve by name, as a consumer imports them — the
// scaffold's GEARS definitions are what Playbook reads from this package.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("cli-14: the scaffold's files and the library's modules resolve by name", async () => {
  for (const name of ["@sublang/spex/scaffold/specs/meta.md", "@sublang/spex/scaffold/i18n/zh/specs/meta.md"]) {
    const text = readFileSync(fileURLToPath(import.meta.resolve(name)), "utf8");
    assert.match(text, /^Authoring language: /m, `${name} is the scaffold's spec of specs`);
  }
  for (const name of ["environment", "files", "instance", "git-host", "home-file", "words", "testing"]) {
    const module = (await import(`@sublang/spex/${name}`)) as Record<string, unknown>;
    assert.ok(Object.keys(module).length > 0, `@sublang/spex/${name} exports its module`);
  }
});
