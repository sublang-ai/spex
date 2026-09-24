// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The server shell supplies the agent SDKs and the playbook compiler,
// and the compiler resolves from this package's own module tree
// (server-shell-7, DR-081).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { moduleDirectoriesAbove, suppliedCompiler } from "@sublang/spex-core";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the server declares the compiler beside the agent SDKs, and resolves it (server-shell-7)", () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  for (const name of [
    "@anthropic-ai/claude-agent-sdk",
    "@openai/codex-sdk",
    "@opencode-ai/sdk",
    "@sublang/slc",
  ]) {
    assert.ok(manifest.dependencies[name], `${name} declared`);
  }
  const supplied = suppliedCompiler(moduleDirectoriesAbove(import.meta.url));
  assert.ok(supplied, "the compiler resolves from the server's module tree");
  assert.ok(existsSync(supplied.cli), supplied.cli);
  assert.ok(
    supplied.cli.endsWith(join("@sublang", "slc", "dist", "cli.js")),
    supplied.cli,
  );
});
