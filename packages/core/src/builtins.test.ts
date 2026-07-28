// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadBuiltinCatalog } from "./builtins.js";
import type { LoadModule } from "./config.js";

function entry(id: string, roles: string[]) {
  return {
    id,
    command: id,
    intent: `${id} intent`,
    requiredRoleIds: roles,
    validateOptions: () => ({}),
    createRuntime: () => ({}),
  };
}

const loader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return { default: entry("code", ["coder", "reviewer"]) };
  }
  if (specifier === "@sublang/playbook/discuss/registry") {
    return { default: entry("discuss", ["host", "participant"]) };
  }
  throw new Error(`no module ${specifier}`);
};

test("catalog serves both built-ins with sources from the installed package", async () => {
  // The registry entries come through the (stubbed) loader, but the
  // `from` specifiers are the real ones, so packagedSourcePath
  // resolves each source from the installed @sublang/playbook
  // (playbook 3.1 ships reference/sdlc/code.md and discuss.md; the
  // vendored copies are gone — DR-019).
  const builtins = await loadBuiltinCatalog(new Set(["code"]), loader);
  assert.deepEqual(
    builtins.map((b) => [b.id, b.configured]),
    [
      ["code", true],
      ["discuss", false],
    ],
  );
  const code = builtins.find((b) => b.id === "code");
  assert.ok((code?.source ?? "").startsWith("# Code"));
  const discuss = builtins.find((b) => b.id === "discuss");
  assert.deepEqual(discuss?.roles, ["host", "participant"]);
  assert.equal(discuss?.from, "@sublang/playbook/discuss/registry");
  // Served without their maintainer-facing comment headers (DR-015).
  assert.ok((discuss?.source ?? "").startsWith("# Discuss"));
  assert.doesNotMatch(discuss?.source ?? "", /<!--/);
});

test("a built-in whose registry fails to load is omitted", async () => {
  const flaky: LoadModule = async (specifier) => {
    if (specifier === "@sublang/playbook/code/registry") {
      return { default: entry("code", ["coder", "reviewer"]) };
    }
    throw new Error("package predates discuss");
  };
  const builtins = await loadBuiltinCatalog(new Set(), flaky);
  assert.deepEqual(
    builtins.map((b) => b.id),
    ["code"],
  );
});
