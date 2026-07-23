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

test("catalog serves both built-ins with vendored sources", async () => {
  const builtins = await loadBuiltinCatalog(new Set(["code"]), loader);
  assert.deepEqual(
    builtins.map((b) => [b.id, b.configured]),
    [
      ["code", true],
      ["discuss", false],
    ],
  );
  const discuss = builtins.find((b) => b.id === "discuss");
  assert.deepEqual(discuss?.roles, ["host", "participant"]);
  assert.equal(discuss?.from, "@sublang/playbook/discuss/registry");
  // Vendored sources ship as core assets (DR-015).
  assert.match(discuss?.source ?? "", /Vendored from sublang-ai\/playbook/);
  assert.match(discuss?.source ?? "", /# Discuss/);
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
