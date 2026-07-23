// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// PROJ coverage: fixture-repo git state, work-tree validation,
// create flow, and the gh adapter with a stubbed runner
// (PROJ-16..19 territory plus unit checks).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GitHubForgeAdapter,
  academyCorpusDir,
  createProjectRepo,
  isWorkTreeRoot,
  parseGitHubRepo,
  repoStatus,
  seedExampleProject,
  type RunCommand,
} from "./forge.js";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd });
}

function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "spex-forge-"));
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "a.txt"), "hello\n");
  git(["add", "a.txt"], dir);
  git(["commit", "-q", "-m", "init"], dir);
  return dir;
}

test("isWorkTreeRoot accepts only the repo root", async () => {
  const repo = fixtureRepo();
  assert.equal(await isWorkTreeRoot(repo), true);
  const sub = join(repo, "sub");
  mkdirSync(sub);
  assert.equal(await isWorkTreeRoot(sub), false);
  const plain = mkdtempSync(join(tmpdir(), "spex-plain-"));
  assert.equal(await isWorkTreeRoot(plain), false);
});

test("repoStatus reports branch and dirty state from local git", async () => {
  const repo = fixtureRepo();
  const clean = await repoStatus(repo);
  assert.equal(clean.branch, "main");
  assert.equal(clean.dirty, false);
  assert.equal(clean.originUrl, undefined);
  writeFileSync(join(repo, "b.txt"), "dirty\n");
  const dirty = await repoStatus(repo);
  assert.equal(dirty.dirty, true);
  git(["remote", "add", "origin", "git@github.com:sublang-ai/spex.git"], repo);
  const withOrigin = await repoStatus(repo);
  assert.equal(withOrigin.originUrl, "git@github.com:sublang-ai/spex.git");
});

test("repoStatus names the real branch on a fresh repo with no commits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-forge-fresh-"));
  git(["init", "-q", "-b", "main", "."], dir);
  const status = await repoStatus(dir);
  assert.equal(status.branch, "main");
  assert.equal(status.dirty, false);
});

test("createProjectRepo initializes a commit-ready repo", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "spex-create-")), "newproj");
  await createProjectRepo({ path: dir });
  assert.equal(await isWorkTreeRoot(dir), true);
});

test("createProjectRepo surfaces scaffold failures", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "spex-create-")), "p2");
  const run: RunCommand = async (command, args, cwd) => {
    if (command === "git") {
      const { execFile } = await import("node:child_process");
      return new Promise((resolvePromise) => {
        execFile(command, args, { cwd }, (error, stdout, stderr) =>
          resolvePromise({
            code: error ? 1 : 0,
            stdout: String(stdout),
            stderr: String(stderr),
          }),
        );
      });
    }
    return { code: 1, stdout: "", stderr: "scaffold exploded" };
  };
  await assert.rejects(
    createProjectRepo({ path: dir, scaffold: true, run }),
    /scaffold failed: scaffold exploded/,
  );
});

test("parseGitHubRepo handles https and ssh remotes", () => {
  assert.equal(
    parseGitHubRepo("https://github.com/sublang-ai/spex.git"),
    "sublang-ai/spex",
  );
  assert.equal(
    parseGitHubRepo("git@github.com:sublang-ai/spex.git"),
    "sublang-ai/spex",
  );
  assert.equal(parseGitHubRepo("https://gitlab.com/x/y.git"), undefined);
});

function stubRun(
  behavior: (command: string, args: string[]) => { code: number; stdout: string; stderr: string },
): RunCommand {
  return async (command, args) => behavior(command, args);
}

test("gh adapter: missing tool, unauthenticated, and authenticated states", async () => {
  const origin = "https://github.com/sublang-ai/spex.git";

  const missing = new GitHubForgeAdapter(
    stubRun(() => ({ code: 127, stdout: "", stderr: "gh: command not found" })),
  );
  const missingState = await missing.state("/tmp/x", origin);
  assert.equal(missingState.authenticated, null);
  assert.match(missingState.guidance ?? "", /not installed/);

  const unauth = new GitHubForgeAdapter(
    stubRun((command, args) =>
      args[0] === "auth"
        ? { code: 1, stdout: "", stderr: "not logged in" }
        : { code: 0, stdout: "[]", stderr: "" },
    ),
  );
  const unauthState = await unauth.state("/tmp/x", origin);
  assert.equal(unauthState.authenticated, false);
  assert.match(unauthState.guidance ?? "", /gh auth login/);

  const authed = new GitHubForgeAdapter(
    stubRun((command, args) => {
      if (args[0] === "auth") return { code: 0, stdout: "ok", stderr: "" };
      if (args[0] === "issue") {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: 7,
              title: "Fix flaky test",
              url: "https://github.com/sublang-ai/spex/issues/7",
              author: { login: "alice" },
            },
          ]),
          stderr: "",
        };
      }
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            number: 12,
            title: "Add dashboard",
            url: "https://github.com/sublang-ai/spex/pull/12",
          },
        ]),
        stderr: "",
      };
    }),
  );
  const authedState = await authed.state("/tmp/x", origin);
  assert.equal(authedState.authenticated, true);
  assert.equal(authedState.repo, "sublang-ai/spex");
  assert.deepEqual(authedState.issues[0], {
    number: 7,
    title: "Fix flaky test",
    url: "https://github.com/sublang-ai/spex/issues/7",
    author: "alice",
  });
  assert.equal(authedState.prs[0].number, 12);
});

test("no origin remote degrades to guidance", async () => {
  const adapter = new GitHubForgeAdapter(
    stubRun(() => ({ code: 0, stdout: "", stderr: "" })),
  );
  const state = await adapter.state("/tmp/x", undefined);
  assert.equal(state.authenticated, null);
  assert.match(state.guidance ?? "", /origin remote/);
});

test("seedExampleProject materializes the corpus into an empty dir", async () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-seed-"));
  const corpus = join(dir, "corpus");
  mkdirSync(join(corpus, "specs"), { recursive: true });
  writeFileSync(join(corpus, "README.md"), "# Example\n");
  writeFileSync(join(corpus, "specs", "map.md"), "# Map\n");

  const target = join(dir, "project");
  await seedExampleProject({ path: target, corpusDir: corpus });
  assert.ok(existsSync(join(target, "README.md")));
  assert.ok(existsSync(join(target, "specs", "map.md")));
  assert.ok(existsSync(join(target, ".git")));
  const log = execFileSync("git", ["-C", target, "log", "--oneline"], {
    encoding: "utf8",
  });
  assert.match(log, /seed the Academy example/);

  // Non-empty targets are refused before any write.
  await assert.rejects(
    seedExampleProject({ path: target, corpusDir: corpus }),
    /not empty/,
  );
});

test("the staged Academy corpus is present and seedable", async () => {
  const corpus = academyCorpusDir();
  assert.ok(existsSync(join(corpus, "specs", "map.md")));
  assert.ok(existsSync(join(corpus, "guidelines.md")));
  const target = join(mkdtempSync(join(tmpdir(), "spex-seed-")), "academy");
  await seedExampleProject({ path: target });
  assert.ok(existsSync(join(target, "specs", "meta.md")));
});
