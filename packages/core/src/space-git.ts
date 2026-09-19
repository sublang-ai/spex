// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's Git child runner (space-32, DR-057): one child
// per step, never a shell, from the home, non-interactive, with the
// transport limit and Stop, and stderr classified into the causes the
// surface explains in plain words (space-15).

import { spawn } from "node:child_process";
import { hostname } from "node:os";
import { i18n } from "./i18n.js";
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
    super(i18n._({
      id: "Git is not installed. Install Git, then reopen Space.",
      comment: "Guidance where the git command cannot be run at all",
    }));
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
  if (!url) {
    return i18n._({
      id: "the remote",
      comment: "Stands where a message names the remote's host and no URL says which",
    });
  }
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

/** Which act gives this machine access to a remote (space-50), read
 * from the URL alone — the app runs no probe, and none answers what the
 * transport already did. */
type AccessAct = "folder" | "github" | "web" | "ssh" | "any";

function accessAct(remote: string | null): AccessAct {
  if (!remote) return "any";
  if (/^\//.test(remote) || /^file:\/\//i.test(remote)) return "folder";
  if (/^https?:\/\//i.test(remote)) {
    return /^https?:\/\/(?:[^/@]*@)?(?:[^/:]*\.)?github\.com(?:[:/]|$)/i.test(remote) ? "github" : "web";
  }
  if (/^ssh:\/\//i.test(remote) || /^[^@/:\s]+@[^/:\s]+:/.test(remote)) return "ssh";
  return "any";
}

/** The act the reader performs, with the command where one serves it,
 * inside a sentence of the guidance (space-15). Its opening form is
 * separate, because a sentence's first word is the language's own
 * business, never a transform applied to a phrase (DR-079). */
export function remoteAccess(remote: string | null): string {
  switch (accessAct(remote)) {
    case "folder":
      return i18n._({
        id: "make sure this user can read the folder",
        comment: "The act that gives access to a local-path remote, inside a sentence",
      });
    case "github":
      return i18n._({
        id: "in a terminal run gh auth status to see which GitHub account this machine uses and gh auth login to change it",
        comment: "The act that gives access to a GitHub remote, inside a sentence; gh auth status and gh auth login are commands and stay as they are",
      });
    case "web":
      return i18n._({
        id: "sign this machine in at that host as an account that can see it",
        comment: "The act that gives access to an http(s) remote, inside a sentence",
      });
    case "ssh":
      return i18n._({
        id: "add this machine's SSH key to an account that can see it",
        comment: "The act that gives access to an SSH remote, inside a sentence",
      });
    default:
      return i18n._({
        id: "give this machine access to it",
        comment: "The act that gives access to a remote of an unread form, inside a sentence",
      });
  }
}

/** The same act, opening its own sentence; a language that cases no
 * differently writes it exactly as [[remoteAccess]]. */
function remoteAccessOpening(remote: string | null): string {
  switch (accessAct(remote)) {
    case "folder":
      return i18n._({
        id: "Make sure this user can read the folder",
        comment: "The act that gives access to a local-path remote, opening a sentence",
      });
    case "github":
      return i18n._({
        id: "In a terminal run gh auth status to see which GitHub account this machine uses and gh auth login to change it",
        comment: "The act that gives access to a GitHub remote, opening a sentence; gh auth status and gh auth login are commands and stay as they are",
      });
    case "web":
      return i18n._({
        id: "Sign this machine in at that host as an account that can see it",
        comment: "The act that gives access to an http(s) remote, opening a sentence",
      });
    case "ssh":
      return i18n._({
        id: "Add this machine's SSH key to an account that can see it",
        comment: "The act that gives access to an SSH remote, opening a sentence",
      });
    default:
      return i18n._({
        id: "Give this machine access to it",
        comment: "The act that gives access to a remote of an unread form, opening a sentence",
      });
  }
}

/** An SSH form, which alone can stop on an unknown host key. */
function isSsh(remote: string | null): boolean {
  return remote !== null && (/^ssh:\/\//i.test(remote) || /^[^@/:\s]+@[^/:\s]+:/.test(remote));
}

/** The remote URL as the reader set it, with an `http(s)` user removed
 * (space-1): an SSH form's user is the transport's own (space-5), so it
 * stays and the printed URL is the one the reader can compare and fix. */
export function displayRemote(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@]*@/i, "$1");
}

/** Validate a remote URL per space-5: the accepted forms, no
 * whitespace or control characters, and never an embedded credential. */
export function validateRemoteUrl(url: string): { ok: true } | { ok: false; reason: string } {
  if (url.length === 0 || /\s/.test(url) || /[\x00-\x1f\x7f]/.test(url)) {
    return { ok: false, reason: i18n._({
      id: "The remote URL is malformed: it must be one word with no spaces or control characters.",
      comment: "Refusal of a remote URL",
    }) };
  }
  if (/^https?:\/\/[^/]*@/i.test(url)) {
    return { ok: false, reason: i18n._({
      id: "The app stores no credential: remove everything before the host from the URL and use an SSH key or the machine's credential helper instead.",
      comment: "Refusal of a remote URL carrying a user before the host",
    }) };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i.test(url)) {
    return { ok: false, reason: i18n._({
      id: "The app stores no credential: remove the user and secret from the URL and use an SSH key or the machine's credential helper instead.",
      comment: "Refusal of a remote URL carrying a user and a secret",
    }) };
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^[^@/:\s]+@[^/:\s]+:/.test(url) && !url.startsWith("/")) {
    return { ok: false, reason: i18n._({
      id: "The remote URL is malformed: use ssh://, git@host:path, https://, http:// or an absolute local path.",
      comment: "Refusal of a remote URL of no accepted form; the forms themselves stay as they are",
    }) };
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
      message: i18n._({
        id: "No answer from {host}",
        values: { host },
        comment: "A stopped transfer's message; {host} is the remote's host",
      }),
      guidance: run.killed === "stopped"
        ? i18n._({
            id: "You stopped the transfer; your commits stand. Git runs without prompts, so a helper that prompts fails instead of hanging.",
            comment: "Guidance after the reader stopped a transfer",
          })
        : i18n._({
            id: "Git runs without prompts, so a helper that prompts fails instead of hanging. Check the connection, then try again.",
            comment: "Guidance after a transfer ran past its time limit",
          }),
      retry: true,
    };
  }
  const text = run.stderr;
  if (/Could not resolve host|Connection refused|Network is unreachable|Connection timed out|No route to host|Could not resolve hostname/i.test(text)) {
    return {
      cause: "unreachable",
      message: i18n._({
        id: "Could not reach {host}",
        values: { host },
        comment: "A stopped transfer's message; {host} is the remote's host",
      }),
      guidance: i18n._({
        id: "Check the network or the remote URL, then try again.",
        comment: "Guidance where the remote's host could not be reached",
      }),
      retry: true,
    };
  }
  if (/Permission denied|Authentication failed|could not read Username|terminal prompts disabled|Host key verification failed|returned error: 40[13]|HTTP (?:401|403)/i.test(text)) {
    // The act that gives access is the remote form's (space-50), and an
    // SSH form alone can stop on a host key it has never seen. Each
    // guidance is one whole sentence carrying the act, never a frame
    // assembled around a fragment (DR-079).
    const act = remoteAccessOpening(remote);
    return {
      cause: "unauthorized",
      message: i18n._({
        id: "{host} refused this machine's access",
        values: { host },
        comment: "A stopped transfer's message; {host} is the remote's host",
      }),
      guidance: isSsh(remote)
        ? i18n._({
            id: "{act}; on a first connection, accept the host key in a terminal. Then Retry.",
            values: { act },
            comment: "Guidance where an SSH remote refused access; {act} is the act that gives this machine access, already opening the sentence",
          })
        : i18n._({
            id: "{act}. Then Retry.",
            values: { act },
            comment: "Guidance where the remote refused access; {act} is the act that gives this machine access, already opening the sentence",
          }),
      retry: true,
    };
  }
  if (/Repository not found|does not appear to be a git repository|repository '[^']*' not found/i.test(text)) {
    // The host answers alike for a repository that is absent and for a
    // private one this machine may not see (space-15), so the guidance is
    // the remedies for both — every one outside the app, hence Retry —
    // the access one named as this remote's form gives it (space-50).
    const act = remoteAccess(remote);
    return {
      cause: "not-found",
      message: i18n._({
        id: "No repository this machine can see at {target}",
        values: { target: remote ? displayRemote(remote) : host },
        comment: "A stopped transfer's message; {target} is the remote URL, or its host where no URL is known",
      }),
      guidance: remote && /^\//.test(remote)
        ? i18n._({
            id: "Check the path, create the repository if it is not there yet, or {act}. Then Retry.",
            values: { act },
            comment: "Guidance where a local-path remote holds no repository this machine can see; {act} is the act that gives this machine access",
          })
        : i18n._({
            id: "Check the URL, create the repository if it is not there yet, or {act}. Then Retry.",
            values: { act },
            comment: "Guidance where the remote holds no repository this machine can see; {act} is the act that gives this machine access",
          }),
      retry: true,
    };
  }
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(text)) {
    return {
      cause: "rejected",
      message: i18n._({
        id: "The remote changed again",
        comment: "A stopped transfer's message: the remote moved while this machine was sending",
      }),
      guidance: i18n._({
        id: "Sync again to merge what the remote received meanwhile.",
        comment: "Guidance where the remote rejected the push",
      }),
      retry: true,
    };
  }
  return {
    cause: "git",
    message: lastLines(text) || (run.code === null
      ? i18n._({
          id: "git exited with a signal",
          comment: "A stopped step's message where git failed and printed nothing, ended by a signal",
        })
      : i18n._({
          id: "git exited with {code}",
          values: { code: run.code },
          comment: "A stopped step's message where git failed and printed nothing; {code} is its exit code",
        })),
    guidance: i18n._({
      id: "Retry; if it fails again, run the same step in a terminal for detail.",
      comment: "Guidance under a step git failed for a reason the app does not classify",
    }),
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
      return { ok: false, guidance: error instanceof GitMissingError ? error.message : i18n._({
        id: "Git could not run: {detail}",
        values: { detail: error instanceof Error ? error.message : String(error) },
        comment: "Guidance where git exists but failed to run; {detail} is the failure's own text, relayed",
      }) };
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
