// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultRunGit, gitSource } from "@sublang/spex/environment";

test("environments-44: Windows Git fetches and reuses a long package mirror without changing source configuration", { skip: process.platform !== "win32" }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-git-longpaths-"));
  try {
    const origin = join(scratch, "origin");
    mkdirSync(origin);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: origin, encoding: "utf8", windowsHide: true }).trim();
    git("init", "--quiet", "--initial-branch=main");
    writeFileSync(join(origin, "README.md"), "Real file-transport source\n".repeat(64));
    git("add", "README.md");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Create Git source fixture");
    const head = git("rev-parse", "HEAD");
    const config = readFileSync(join(origin, ".git/config"));
    const mirrorName = "a".repeat(64) + "." + "b".repeat(36);
    // Match the observed APP failure: the mirror itself fits Git's directory
    // bound, but index-pack's keep file exceeds the legacy Windows path bound.
    const componentLength = 201 - join(scratch, "cache", "git", mirrorName).length - 1;
    assert.ok(componentLength > 0 && componentLength <= 255);
    const cache = join(scratch, "cache", "c".repeat(componentLength));
    assert.equal(join(cache, "git", mirrorName).length, 201);
    assert.ok(join(cache, "git", mirrorName, "objects/pack", "pack-" + "c".repeat(40) + ".keep").length > 260);
    const source = gitSource(cache, {
      runGit: (args, options) => defaultRunGit(["-c", "core.autocrlf=true", ...args], options),
    });
    const fetched = await source.fetch(pathToFileURL(origin).href, "main");
    assert.equal(fetched.commit, head);
    assert.deepEqual(readFileSync(join(fetched.dir, "README.md")), readFileSync(join(origin, "README.md")));
    const reused = await source.fetch(pathToFileURL(origin).href, head);
    assert.deepEqual(reused, fetched);
    assert.deepEqual(readFileSync(join(origin, ".git/config")), config);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
