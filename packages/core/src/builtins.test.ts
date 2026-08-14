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
    return { default: entry("code", ["coder"]) };
  }
  if (specifier === "@sublang/playbook/review/registry") {
    return { default: entry("review", ["coder", "reviewer"]) };
  }
  if (specifier === "@sublang/playbook/decide/registry") {
    return { default: entry("decide", ["coder", "reviewer"]) };
  }
  throw new Error(`no module ${specifier}`);
};

test("catalog serves both built-ins with sources from the installed package", async () => {
  // The registry entries come through the (stubbed) loader, but the
  // `from` specifiers are the real ones, so packagedSourcePath
  // resolves each source from the installed @sublang/playbook
  // (playbook 7 ships reference/sdlc sources for code, review, and
  // decide; the vendored copies are gone — DR-019).
  const builtins = await loadBuiltinCatalog(new Set(["code"]), loader);
  assert.deepEqual(
    builtins.map((b) => [b.id, b.configured]),
    [
      ["code", true],
      ["review", false],
      ["decide", false],
    ],
  );
  const code = builtins.find((b) => b.id === "code");
  assert.ok((code?.source ?? "").startsWith("# Code"));
  const review = builtins.find((b) => b.id === "review");
  assert.deepEqual(review?.roles, ["coder", "reviewer"]);
  assert.equal(review?.from, "@sublang/playbook/review/registry");
  // Served without their maintainer-facing comment headers (DR-015).
  assert.ok((review?.source ?? "").startsWith("# Review"));
  assert.doesNotMatch(review?.source ?? "", /<!--/);
});

test("a built-in whose registry fails to load is omitted", async () => {
  const flaky: LoadModule = async (specifier) => {
    if (specifier === "@sublang/playbook/code/registry") {
      return { default: entry("code", ["coder"]) };
    }
    throw new Error("package predates review");
  };
  const builtins = await loadBuiltinCatalog(new Set(), flaky);
  assert.deepEqual(
    builtins.map((b) => b.id),
    ["code"],
  );
});
