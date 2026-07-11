// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Git-aware project support and the forge adapter seam (DR-006):
// repo state comes from local git commands only; forge data flows
// through one adapter interface, with the gh-CLI GitHub adapter as
// the v1 implementation. No credentials are ever stored.

import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type { ForgeItem, ForgeState, RepoStatusInfo } from "./protocol.js";

export type { ForgeItem, ForgeState };
export type RepoStatus = RepoStatusInfo;

export type RunCommand = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export const defaultRunCommand: RunCommand = (command, args, cwd) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code?: number }).code ?? 1)
            : error
              ? 1
              : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

// ---------------------------------------------------------------------------
// Local git state (PROJ-3, PROJ-11)
// ---------------------------------------------------------------------------

export async function isWorkTreeRoot(
  path: string,
  run: RunCommand = defaultRunCommand,
): Promise<boolean> {
  const result = await run("git", ["rev-parse", "--show-toplevel"], path);
  if (result.code !== 0) return false;
  const top = result.stdout.trim();
  if (!top || !existsSync(path) || !existsSync(top)) return false;
  // git prints forward-slash paths and Windows temp dirs may surface
  // as 8.3 short names; canonicalize both sides before comparing.
  const canonical = (p: string): string => {
    const real = resolvePath(realpathSync.native(p));
    return process.platform === "win32" ? real.toLowerCase() : real;
  };
  try {
    return canonical(top) === canonical(path);
  } catch {
    return false;
  }
}

export async function repoStatus(
  path: string,
  run: RunCommand = defaultRunCommand,
): Promise<RepoStatus> {
  const branch = await run(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    path,
  );
  const porcelain = await run("git", ["status", "--porcelain"], path);
  const counts = await run(
    "git",
    ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
    path,
  );
  const origin = await run("git", ["remote", "get-url", "origin"], path);

  let ahead = 0;
  let behind = 0;
  if (counts.code === 0) {
    const [behindText, aheadText] = counts.stdout.trim().split(/\s+/);
    behind = Number(behindText) || 0;
    ahead = Number(aheadText) || 0;
  }
  return {
    branch: branch.code === 0 ? branch.stdout.trim() : "(unknown)",
    dirty: porcelain.code === 0 && porcelain.stdout.trim().length > 0,
    ahead,
    behind,
    ...(origin.code === 0 && origin.stdout.trim()
      ? { originUrl: origin.stdout.trim() }
      : {}),
  };
}

export interface CreateProjectOptions {
  path: string;
  scaffold?: boolean;
  /** Command used for scaffolding, e.g. ["npx", "-y", "@sublang/spex"]. */
  scaffoldCommand?: string[];
  run?: RunCommand;
}

export async function createProjectRepo(
  options: CreateProjectOptions,
): Promise<{ scaffolded: boolean }> {
  const run = options.run ?? defaultRunCommand;
  const init = await run("git", ["init", options.path]);
  if (init.code !== 0) {
    throw new Error(`git init failed: ${init.stderr.trim() || init.stdout.trim()}`);
  }
  let scaffolded = false;
  if (options.scaffold) {
    const [command, ...args] = options.scaffoldCommand ?? [
      "npx",
      "--yes",
      "@sublang/spex",
    ];
    const scaffoldRun = await run(
      command,
      [...args, "scaffold", options.path],
      options.path,
    );
    scaffolded = scaffoldRun.code === 0;
    if (!scaffolded) {
      throw new Error(
        `scaffold failed: ${scaffoldRun.stderr.trim() || scaffoldRun.stdout.trim()}`,
      );
    }
    // Commit only what scaffolding produced — never the user's
    // pre-existing files (a picked folder may hold anything).
    for (const path of ["specs", "CLAUDE.md", "AGENTS.md", "LICENSE"]) {
      await run("git", ["add", "--", path], options.path);
    }
    await run(
      "git",
      ["commit", "-m", "chore: scaffold specs"],
      options.path,
    );
  }
  return { scaffolded };
}

// ---------------------------------------------------------------------------
// Forge adapter interface (DR-006) and the gh GitHub adapter
// ---------------------------------------------------------------------------

export interface ForgeAdapter {
  state(projectPath: string, originUrl?: string): Promise<ForgeState>;
}

export function parseGitHubRepo(originUrl: string): string | undefined {
  const match =
    /(?:github\.com[/:])([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(originUrl);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

const GH_ITEM_FIELDS = "number,title,url,author,updatedAt,labels";

interface GhItem {
  number: number;
  title: string;
  url: string;
  author?: { login?: string };
  updatedAt?: string;
  labels?: { name?: string }[];
}

function toForgeItems(json: string): ForgeItem[] {
  try {
    const items = JSON.parse(json) as GhItem[];
    return items.map((item) => ({
      number: item.number,
      title: item.title,
      url: item.url,
      ...(item.author?.login ? { author: item.author.login } : {}),
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
      ...(item.labels?.length
        ? {
            labels: item.labels
              .map((label) => label.name)
              .filter((name): name is string => Boolean(name)),
          }
        : {}),
    }));
  } catch {
    return [];
  }
}

export class GitHubForgeAdapter implements ForgeAdapter {
  constructor(private readonly run: RunCommand = defaultRunCommand) {}

  async state(projectPath: string, originUrl?: string): Promise<ForgeState> {
    const repo = originUrl ? parseGitHubRepo(originUrl) : undefined;
    if (!repo) {
      return {
        adapter: "github",
        authenticated: null,
        issues: [],
        prs: [],
        guidance:
          "No GitHub origin remote. Add one (git remote add origin …) to see issues and PRs.",
      };
    }
    const auth = await this.run("gh", ["auth", "status"], projectPath);
    if (auth.code === 127 || /not found|ENOENT/i.test(auth.stderr)) {
      return {
        adapter: "github",
        authenticated: null,
        repo,
        issues: [],
        prs: [],
        guidance:
          "GitHub CLI (gh) is not installed. Install it and run `gh auth login`.",
      };
    }
    if (auth.code !== 0) {
      return {
        adapter: "github",
        authenticated: false,
        repo,
        issues: [],
        prs: [],
        guidance: "GitHub CLI is not authenticated. Run `gh auth login`.",
      };
    }
    const [issues, prs] = await Promise.all([
      this.run(
        "gh",
        ["issue", "list", "--json", GH_ITEM_FIELDS, "-R", repo, "--limit", "30"],
        projectPath,
      ),
      this.run(
        "gh",
        ["pr", "list", "--json", GH_ITEM_FIELDS, "-R", repo, "--limit", "30"],
        projectPath,
      ),
    ]);
    return {
      adapter: "github",
      authenticated: true,
      repo,
      issues: issues.code === 0 ? toForgeItems(issues.stdout) : [],
      prs: prs.code === 0 ? toForgeItems(prs.stdout) : [],
      ...(issues.code !== 0 || prs.code !== 0
        ? { guidance: "Some forge data could not be loaded from gh." }
        : {}),
    };
  }
}
