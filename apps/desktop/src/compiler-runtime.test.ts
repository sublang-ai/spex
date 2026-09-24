// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The desktop compiles playbooks on its own runtime: Electron's Node,
// run through ELECTRON_RUN_AS_NODE, answers the toolchain probe above
// slc's floor and runs the compiler the desktop declares, the variable
// dropped before the compiler starts (app-shell-33, playbook-library-80,
// DR-081) — no system Node is asked for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkToolchain, moduleDirectoriesAbove } from "@sublang/spex-core";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const electron =
  process.platform === "win32"
    ? undefined
    : (createRequire(import.meta.url)("electron") as string);

test("the desktop declares the compiler beside the agent SDKs (app-shell-33)", () => {
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
});

test(
  "the desktop compiles on its own Electron as Node (app-shell-33, playbook-library-80)",
  { skip: electron && existsSync(electron) ? false : "needs the Electron binary" },
  async () => {
    const { SPEX_NODE: _node, SPEX_SLC: _slc, ...env } = process.env;
    const status = await checkToolchain(env, undefined, {
      execPath: electron!,
      electron: true,
      modulePaths: moduleDirectoriesAbove(import.meta.url),
    });
    assert.equal(status.node.ok, true, status.node.guidance ?? "no guidance");
    assert.equal(status.node.command, electron);
    assert.deepEqual(status.node.env, { ELECTRON_RUN_AS_NODE: "1" });
    const [major, minor] = (status.node.version ?? "v0.0")
      .slice(1)
      .split(".")
      .map(Number);
    assert.ok(major > 23 || (major === 23 && minor >= 6), status.node.version ?? "no version");
    assert.equal(status.slc.ok, true, status.slc.guidance ?? "no guidance");
    const [command, ...args] = status.slc.command;
    const cli = args.at(-1) ?? "";
    assert.equal(command, electron);
    assert.ok(
      cli.endsWith(join("@sublang", "slc", "dist", "cli.js")),
      status.slc.command.join(" "),
    );
    // The compiler itself answers on that runtime.
    const ran = spawnSync(command, [...args, "--version"], {
      env: { ...env, ...status.node.env },
      encoding: "utf8",
    });
    assert.equal(ran.status, 0, ran.stderr);
    assert.match(ran.stdout, /^slc \d+\.\d+\.\d+/);
    // In the compiler's place, a probe sees the runtime as Node with
    // the variable that made it one already gone.
    const probe = join(mkdtempSync(join(tmpdir(), "spex-runtime-")), "probe.mjs");
    writeFileSync(
      probe,
      'console.log(JSON.stringify({ node: process.versions.node, flag: process.env.ELECTRON_RUN_AS_NODE ?? null }));\n',
    );
    const seen = spawnSync(command, [...args.slice(0, -1), probe], {
      env: { ...env, ...status.node.env },
      encoding: "utf8",
    });
    assert.equal(seen.status, 0, seen.stderr);
    const report = JSON.parse(seen.stdout) as { node: string; flag: string | null };
    assert.equal(report.node, status.node.version?.slice(1));
    assert.equal(report.flag, null);
  },
);
