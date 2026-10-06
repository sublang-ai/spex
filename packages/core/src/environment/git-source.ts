// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Git source (environments-13): a repository fetched at a branch,
// tag or commit into a bare mirror under `cache/git/`, and the commit's
// tree exported once under `cache/git-trees/<commit>`. Resolution reads
// the manifest there and digests every file; installing reads the same
// tree at the locked commit. A credential, where one is given, reaches
// Git only through the caller's credential arguments.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { sha256Hex } from "./format.js";
import { readTar } from "./tar.js";

export interface GitCredential {
  username: string;
  secret: string;
}

export interface GitSource {
  /** Fetch a repository at a branch, tag or commit; returns the commit
   * and a folder holding its tree. */
  fetch(repo: string, rev: string, credential?: GitCredential): Promise<{ commit: string; dir: string }>;
}

export interface GitRun {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

export type RunGit = (args: string[], options?: { env?: NodeJS.ProcessEnv }) => Promise<GitRun>;

/** How a credential reaches Git: extra `-c` arguments and variables,
 * and what removes them after (as `withGitCredential` does). */
export type CredentialArgs = (credential: GitCredential) => Promise<{
  env: Record<string, string>;
  configArgs: string[];
  dispose: () => Promise<void> | void;
}>;

export class GitSourceError extends Error {
  constructor(readonly repo: string, message: string) {
    super(message);
    this.name = "GitSourceError";
  }
}

export const defaultRunGit: RunGit = (args, options = {}) =>
  new Promise<GitRun>((resolve, reject) => {
    const child = spawn("git", args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
        SSH_ASKPASS: "",
        LC_ALL: "C",
        LANG: "C",
        ...(process.env.GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: "ssh -oBatchMode=yes" }),
        ...(options.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString("utf8") }));
  });

export interface GitSourceOptions {
  runGit?: RunGit;
  credentialArgs?: CredentialArgs;
}

const COMMIT_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/** A Git source caching under `<cacheDir>/git/` and `<cacheDir>/git-trees/`. */
export function gitSource(cacheDir: string, options: GitSourceOptions = {}): GitSource {
  const runGit = options.runGit ?? defaultRunGit;
  const mirrors = join(cacheDir, "git");
  const trees = join(cacheDir, "git-trees");

  async function withCredential<T>(credential: GitCredential | undefined, body: (config: string[], env: Record<string, string>) => Promise<T>): Promise<T> {
    if (!credential || !options.credentialArgs) return body([], {});
    const prepared = await options.credentialArgs(credential);
    try {
      return await body(prepared.configArgs, prepared.env);
    } finally {
      await prepared.dispose();
    }
  }

  async function git(repo: string, args: string[], env: Record<string, string> = {}): Promise<Buffer> {
    const run = await runGit(args, { env });
    if (run.code !== 0) throw new GitSourceError(repo, `git ${args.find((arg) => !arg.startsWith("-") && !arg.includes("=")) ?? ""} failed for ${repo}: ${run.stderr.trim() || `exit ${run.code}`}`);
    return run.stdout;
  }

  async function revParse(mirror: string, rev: string): Promise<string | undefined> {
    const candidates = rev.startsWith("refs/") ? [rev] : [`refs/heads/${rev}`, `refs/tags/${rev}`, rev];
    for (const candidate of candidates) {
      const run = await runGit(["-C", mirror, "rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
      if (run.code === 0) return run.stdout.toString("utf8").trim();
    }
    return undefined;
  }

  async function exportTree(repo: string, mirror: string, commit: string): Promise<string> {
    const dir = join(trees, commit);
    if (existsSync(dir)) return dir;
    const tar = await git(repo, ["-C", mirror, "archive", "--format=tar", commit]);
    const staging = join(trees, `.${commit}.${randomUUID()}`);
    mkdirSync(staging, { recursive: true });
    try {
      for (const entry of readTar(new Uint8Array(tar))) {
        const target = join(staging, ...entry.path.split("/"));
        if (entry.type === "directory") { mkdirSync(target, { recursive: true }); continue; }
        mkdirSync(dirname(target), { recursive: true });
        if (entry.type === "symlink") symlinkSync(entry.linkname ?? "", target);
        else if (entry.type === "file") writeFileSync(target, entry.data, { mode: entry.mode & 0o100 ? 0o755 : 0o644 });
      }
      if (existsSync(dir)) rmSync(staging, { recursive: true, force: true });
      else renameSync(staging, dir);
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }
    return dir;
  }

  return {
    async fetch(repo, rev, credential) {
      if (rev.startsWith("-")) throw new GitSourceError(repo, `"${rev}" is not a branch, tag or commit`);
      const mirror = join(mirrors, sha256Hex(repo));
      return withCredential(credential, async (config, env) => {
        if (!existsSync(join(mirror, "HEAD"))) {
          mkdirSync(mirrors, { recursive: true });
          const staging = `${mirror}.${randomUUID()}`;
          try {
            await git(repo, [...config, "clone", "--mirror", "--quiet", "--", repo, staging], env);
            if (existsSync(join(mirror, "HEAD"))) rmSync(staging, { recursive: true, force: true });
            else { rmSync(mirror, { recursive: true, force: true }); renameSync(staging, mirror); }
          } catch (error) {
            rmSync(staging, { recursive: true, force: true });
            throw error;
          }
        } else if (!(COMMIT_RE.test(rev) && (await revParse(mirror, rev)))) {
          // A branch or tag moves; a commit already held does not.
          await git(repo, [...config, "-C", mirror, "fetch", "--prune", "--quiet", "origin"], env);
        }
        let commit = await revParse(mirror, rev);
        if (!commit && /^[0-9a-f]{7,64}$/.test(rev)) {
          // A commit no ref names: ask for it by id.
          const run = await runGit([...config, "-C", mirror, "fetch", "--quiet", "origin", rev], { env });
          if (run.code === 0) commit = await revParse(mirror, rev);
        }
        if (!commit) throw new GitSourceError(repo, `${repo} has no branch, tag or commit "${rev}"`);
        return { commit, dir: await exportTree(repo, mirror, commit) };
      });
    },
  };
}
