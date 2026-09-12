// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's Git child runner (space-32, DR-057): one child
// per step, never a shell, from the home, non-interactive, with the
// transport limit and Stop, and stderr classified into the causes the
// surface explains in plain words (space-15).

import { spawn } from "node:child_process";
import { hostname } from "node:os";
import type { SyncCause } from "./protocol.js";

export interface GitRun {
  /** The exit code, or null when a signal ended the child. */
  code: number | null;
  stdout: Buffer;
  stderr: string;
  /** Set when this runner ended the child: the transport limit or Stop. */
  killed?: "timeout" | "stopped";
}

export interface GitRunOptions {
  /** `ls-remote`, `fetch` and `push`: bounded by the transport limit
   * and cancelable (space-16). */
  transport?: boolean;
  /** Bytes written to the child's stdin, then closed. */
  input?: string;
  /** Extra environment for this child only (a temporary index file). */
  env?: Record<string, string>;
}

/** `git` itself is not runnable: absent from PATH or not executable. */
export class GitMissingError extends Error {
  constructor(cause: unknown) {
    super("Git is not installed. Install Git, then reopen Space.");
    this.name = "GitMissingError";
    this.cause = cause;
  }
}

/** A Git command exited non-zero where success was required. */
export class GitError extends Error {
  constructor(readonly args: string[], readonly run: GitRun) {
    super(`git ${args.join(" ")} failed${run.code === null ? "" : ` (${run.code})`}: ${lastLines(run.stderr)}`);
    this.name = "GitError";
  }
}

/** A stopped step: the cause, its plain-words message and guidance. */
export interface GitFailure {
  cause: SyncCause;
  message: string;
  guidance: string;
  retry: boolean;
}

export const DEFAULT_TRANSPORT_TIMEOUT_MS = 120_000;
const KILL_GRACE_MS = 5_000;

export function lastLines(text: string, count = 3): string {
  const lines = text.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
  return lines.slice(-count).join("\n");
}

/** The host a remote URL addresses, for the messages of space-15; a
 * local path is its own host. */
export function remoteHost(url: string | null): string {
  if (!url) return "the remote";
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/([^/]*)/i.exec(url);
  if (scheme) {
    const authority = scheme[1];
    const host = authority.slice(authority.lastIndexOf("@") + 1);
    return host.replace(/:\d+$/, "") || url;
  }
  const scp = /^(?:[^@/:\s]+@)?([^/:\s]+):/.exec(url);
  if (scp) return scp[1];
  return url;
}

/** The remote URL with any embedded user removed (space-1). */
export function displayRemote(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1").replace(/^[^@/:\s]+@([^/:\s]+):/, "$1:");
}

/** Validate a remote URL per space-5: the accepted forms, no
 * whitespace or control characters, and never an embedded credential. */
export function validateRemoteUrl(url: string): { ok: true } | { ok: false; reason: string } {
  if (url.length === 0 || /\s/.test(url) || /[\x00-\x1f\x7f]/.test(url)) {
    return { ok: false, reason: "The remote URL is malformed: it must be one word with no spaces or control characters." };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i.test(url)) {
    return { ok: false, reason: "The app stores no credential: remove the user and secret from the URL and use an SSH key or the machine's credential helper instead." };
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^[^@/:\s]+@[^/:\s]+:/.test(url) && !url.startsWith("/")) {
    return { ok: false, reason: "The remote URL is malformed: use ssh://, git@host:path, https://, http:// or an absolute local path." };
  }
  return { ok: true };
}

/** Classify a failed transport child's stderr under LC_ALL=C (space-32)
 * into the stopped states of space-15. */
export function classifyTransportFailure(run: GitRun, remote: string | null): GitFailure {
  const host = remoteHost(remote);
  if (run.killed) {
    return {
      cause: run.killed,
      message: `No answer from ${host}`,
      guidance: run.killed === "stopped"
        ? "You stopped the transfer; your commits stand. Git runs without prompts, so a helper that prompts fails instead of hanging."
        : "Git runs without prompts, so a helper that prompts fails instead of hanging. Check the connection, then try again.",
      retry: true,
    };
  }
  const text = run.stderr;
  if (/Could not resolve host|Connection refused|Network is unreachable|Connection timed out|No route to host|Could not resolve hostname/i.test(text)) {
    return { cause: "unreachable", message: `Could not reach ${host}`, guidance: "Check the network or the remote URL, then try again.", retry: true };
  }
  if (/Permission denied|Authentication failed|could not read Username|terminal prompts disabled|Host key verification failed/i.test(text)) {
    return {
      cause: "unauthorized",
      message: `${host} did not accept this machine's key`,
      guidance: "Set up an SSH key or credential helper for this machine and accept the host key once in a terminal; the app never asks for a password.",
      retry: true,
    };
  }
  if (/Repository not found|does not appear to be a git repository/i.test(text)) {
    return { cause: "not-found", message: `No repository at ${remote ?? host}`, guidance: "Check the URL or create the repository.", retry: false };
  }
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(text)) {
    return { cause: "rejected", message: "The remote changed again", guidance: "Sync again to merge what the remote received meanwhile.", retry: true };
  }
  return {
    cause: "git",
    message: lastLines(text) || `git exited with ${run.code ?? "a signal"}`,
    guidance: "Retry; if it fails again, run the same step in a terminal for detail.",
    retry: true,
  };
}

/**
 * Git as a child process per step, from the home, never through a shell
 * (space-32): the core's captured environment plus non-interactive
 * settings, a bounded and cancelable transport, and the committer
 * fallback where Git has no identity.
 */
export class SpaceGit {
  private readonly transportTimeoutMs: number;
  private transportChild?: { child: import("node:child_process").ChildProcess; kill: (why: "timeout" | "stopped") => void };

  constructor(
    private readonly home: string,
    private readonly captured: NodeJS.ProcessEnv,
    options: { transportTimeoutMs?: number } = {},
  ) {
    this.transportTimeoutMs = options.transportTimeoutMs ?? DEFAULT_TRANSPORT_TIMEOUT_MS;
  }

  /** The environment every child runs with (space-32). */
  environment(): NodeJS.ProcessEnv {
    return {
      ...this.captured,
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
      LANG: "C",
      ...(this.captured.GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: "ssh -oBatchMode=yes" }),
    };
  }

  /** Run one Git command; a non-zero exit is a result, not an exception. */
  run(args: string[], options: GitRunOptions = {}): Promise<GitRun> {
    return new Promise<GitRun>((resolveRun, rejectRun) => {
      const env = { ...this.environment(), ...(options.env ?? {}) };
      const child = spawn("git", ["-C", this.home, ...args], {
        env,
        stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        // A transport child leads its own process group, so Stop and the
        // limit end its ssh or helper grandchildren with it.
        detached: options.transport === true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let killed: "timeout" | "stopped" | undefined;
      let settled = false;
      let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
      let limit: NodeJS.Timeout | undefined;
      let grace: NodeJS.Timeout | undefined;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (limit) clearTimeout(limit);
        if (grace) clearTimeout(grace);
        if (this.transportChild?.child === child) this.transportChild = undefined;
        resolveRun({
          code: exit?.code ?? null,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr).toString("utf8"),
          ...(killed ? { killed } : {}),
        });
      };
      const signal = (name: NodeJS.Signals): void => {
        if (child.pid === undefined) return;
        try {
          if (options.transport) process.kill(-child.pid, name);
          else child.kill(name);
        } catch {
          try { child.kill(name); } catch { /* already gone */ }
        }
      };
      const kill = (why: "timeout" | "stopped"): void => {
        if (killed || exit) return;
        killed = why;
        signal("SIGTERM");
        grace = setTimeout(() => signal("SIGKILL"), KILL_GRACE_MS);
      };
      if (options.transport) {
        this.transportChild = { child, kill };
        limit = setTimeout(() => kill("timeout"), this.transportTimeoutMs);
      }
      child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        if (limit) clearTimeout(limit);
        if (grace) clearTimeout(grace);
        if (this.transportChild?.child === child) this.transportChild = undefined;
        rejectRun(error.code === "ENOENT" || error.code === "EACCES" ? new GitMissingError(error) : error);
      });
      child.on("exit", (code, signalName) => {
        exit = { code, signal: signalName };
        // A killed transport's grandchildren may hold the pipes a while;
        // its outcome is decided, so answer on exit.
        if (killed) finish();
      });
      child.on("close", finish);
      if (options.input !== undefined) child.stdin?.end(options.input);
    });
  }

  /** Run and require success; trimmed stdout. */
  async ok(args: string[], options: GitRunOptions = {}): Promise<string> {
    const run = await this.run(args, options);
    if (run.code !== 0) throw new GitError(args, run);
    return run.stdout.toString("utf8").trim();
  }

  /** Whether the command exits zero. */
  async succeeds(args: string[], options: GitRunOptions = {}): Promise<boolean> {
    return (await this.run(args, options)).code === 0;
  }

  /** Whether `git` runs at all, and its version line. */
  async version(): Promise<{ ok: true; version: string } | { ok: false; guidance: string }> {
    try {
      const out = await this.ok(["--version"]);
      return { ok: true, version: out.replace(/^git version\s*/, "") };
    } catch (error) {
      return { ok: false, guidance: error instanceof GitMissingError ? error.message : `Git could not run: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** Whether Git has no committer identity of its own (space-4). */
  async identityFallback(): Promise<boolean> {
    return !(await this.succeeds(["var", "GIT_COMMITTER_IDENT"]));
  }

  /** The `-c` prefix every commit-writing command carries (space-32). */
  async committerArgs(): Promise<string[]> {
    const args = ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"];
    if (await this.identityFallback()) args.push("-c", "user.name=Spex", "-c", `user.email=spex@${hostname()}`);
    return args;
  }

  /** Stop the transport child in flight, if any (space-16). */
  cancel(): boolean {
    const running = this.transportChild;
    if (!running) return false;
    running.kill("stopped");
    return true;
  }
}
