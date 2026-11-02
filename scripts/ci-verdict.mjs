#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The required CI verdict (release-44, DR-190). Missing, failed or
// unexpectedly skipped checks must never satisfy the merge/release gate.
import { resolve } from "node:path";

function boolean(value, name) {
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}

export function testMatrix(full, affected) {
  const all = boolean(full, "full");
  if (typeof affected !== "string") throw new Error("affected is missing");
  const row = (os, node) => ({ os, "node-version": node });
  if (all) return { include: [
    row("ubuntu-latest", 22), row("ubuntu-latest", 24),
    row("macos-latest", 22), row("macos-latest", 24), row("windows-latest", 22),
  ] };
  const include = [row("ubuntu-latest", 22)];
  const workspaces = new Set(affected.split(/\s+/));
  if (["all", "packages/cli", "packages/core", "packages/ui"].some((name) => workspaces.has(name))) {
    include.push(row("windows-latest", 22));
  }
  return { include };
}

export function verifyChecks(needs) {
  if (needs?.changes?.result !== "success") throw new Error("changes did not succeed");
  const outputs = needs.changes.outputs;
  const full = boolean(outputs?.full, "full");
  const docsOnly = boolean(outputs?.["docs-only"], "docs-only");
  if (!["app", "cli"].includes(outputs?.channel)) throw new Error("unknown validation channel");
  // Empty job outputs disappear from GitHub's needs JSON. The encoded
  // selection remains present even for documentation or script tests alone.
  const affected = JSON.parse(outputs?.["affected-json"] ?? "null");
  if (typeof affected !== "string") throw new Error("affected is missing");
  if (docsOnly && affected !== "") throw new Error("documentation has a nonempty selection");
  if (full && (docsOnly || affected !== (outputs.channel === "app" ? "all" : "packages/cli"))) {
    throw new Error("full validation has an incomplete selection");
  }
  const fullApp = full && outputs.channel === "app";
  const expected = { test: !docsOnly, journeys: fullApp, "desktop-browser": fullApp, "hub-lane": fullApp };
  const results = [];
  for (const [name, selected] of Object.entries(expected)) {
    const wanted = selected ? "success" : "skipped";
    const actual = needs[name]?.result;
    if (actual !== wanted) throw new Error(`${name}: expected ${wanted}, got ${actual ?? "missing"}`);
    results.push(`${name}: ${selected ? "passed" : "not selected"}`);
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    if (process.argv[2] === "--matrix") {
      console.log(`matrix=${JSON.stringify(testMatrix(process.env.CI_FULL, process.env.CI_AFFECTED))}`);
    } else {
      if (process.argv.length > 2) throw new Error("unknown argument");
      console.log(verifyChecks(JSON.parse(process.env.CI_NEEDS ?? "null")).join("\n"));
    }
  } catch (error) {
    console.error(`CI checks: ${error.message}`);
    process.exitCode = 1;
  }
}
