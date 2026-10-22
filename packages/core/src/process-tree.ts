// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent processes a stop signals (core-service-39, DR-134): the
// adapters spawn their agents in no process group of their own, so the
// core finds them as this process's descendants, read from `ps`, and
// signals each one by its pid.

import { spawnSync } from "node:child_process";

/** esbuild's service, which the core keeps for bundling compiled
 * playbooks (compile.ts) and shares with every core of its process: a
 * helper of the core's own, never an agent. */
const ESBUILD_SERVICE = /^\S*\besbuild(\.exe)?\s.*--service=/;

/** Every process descending from `root` — this process by default —
 * as `ps` lists them on macOS and Linux, leaving out the `ps` run itself
 * and esbuild's service; none on another platform or where `ps` cannot
 * be read. */
export function descendantProcesses(root: number = process.pid): number[] {
  if (process.platform !== "darwin" && process.platform !== "linux") return [];
  const listing = spawnSync("ps", ["-A", "-o", "pid=,ppid=,command="], { encoding: "utf8", timeout: 5_000 });
  if (listing.status !== 0 || typeof listing.stdout !== "string") return [];
  const children = new Map<number, number[]>();
  for (const line of listing.stdout.split("\n")) {
    const [, pidText, ppidText, command = ""] = /^\s*(\d+)\s+(\d+)\s?(.*)$/.exec(line) ?? [];
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    if (!pidText || !ppidText || pid === listing.pid || ESBUILD_SERVICE.test(command)) continue;
    const siblings = children.get(ppid);
    if (siblings) siblings.push(pid);
    else children.set(ppid, [pid]);
  }
  const found: number[] = [];
  const seen = new Set<number>([root]);
  for (let queue = [root]; queue.length;) {
    const next: number[] = [];
    for (const parent of queue) {
      for (const child of children.get(parent) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        found.push(child);
        next.push(child);
      }
    }
    queue = next;
  }
  return found;
}

/** Whether `pid` names a process that still exists. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Send `signal` to `pid`, ignoring a process already gone. */
export function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Gone since it was listed, or never ours to signal.
  }
}

export interface StopBounds {
  /** From the stop's start to SIGTERM, unless every turn settles first. */
  settleMs: number;
  /** From SIGTERM to SIGKILL, after which the stop waits no longer. */
  killMs: number;
  /** The agent processes to signal, read when each signal is sent. */
  agentProcesses: () => number[];
}

/** One stop's bound (core-service-39, DR-134): ten seconds after the
 * stop began, or once every turn has settled, every agent process
 * still alive receives SIGTERM; five seconds later each one still alive
 * receives SIGKILL and the bound has passed. A stop finishing before
 * SIGTERM signals nothing; one finishing after it drains what SIGTERM
 * reached first. */
export class StopBound {
  private readonly signalled = new Set<number>();
  private settleTimer: NodeJS.Timeout | undefined;
  private killTimer: NodeJS.Timeout | undefined;
  private terminating = false;
  private finished = false;
  private passed = false;
  private pass!: () => void;
  /** Resolves once the kill bound has passed. */
  readonly expired = new Promise<void>((resolve) => {
    this.pass = resolve;
  });

  constructor(private readonly bounds: StopBounds) {
    this.settleTimer = setTimeout(() => this.terminate(), bounds.settleMs);
  }

  /** Whether the kill bound has passed. */
  get hasPassed(): boolean {
    return this.passed;
  }

  /** Begin the SIGTERM step once `settled` resolves, if the settle
   * bound has not begun it already. */
  whenSettled(settled: Promise<void>): void {
    void settled.then(() => this.terminate(), () => this.terminate());
  }

  /** `work`, or nothing once the bound has passed — whichever is first. */
  within<T>(work: Promise<T>): Promise<T | undefined> {
    return Promise.race([work, this.expired.then(() => undefined)]);
  }

  /** Once SIGTERM has been sent, wait until every process it reached
   * has exited or SIGKILL has followed; at once otherwise. */
  async drain(): Promise<void> {
    while (this.terminating && !this.passed && [...this.signalled].some(processAlive)) {
      await Promise.race([this.expired, new Promise((resolve) => setTimeout(resolve, 50))]);
    }
  }

  /** The stop finished: no signal follows. */
  clear(): void {
    this.finished = true;
    clearTimeout(this.settleTimer);
    clearTimeout(this.killTimer);
  }

  private agents(): number[] {
    let pids: number[];
    try {
      pids = this.bounds.agentProcesses();
    } catch (error) {
      console.error(`spex: agent processes not listed at stop: ${String(error)}`);
      pids = [];
    }
    return pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid);
  }

  private terminate(): void {
    if (this.terminating || this.finished) return;
    this.terminating = true;
    clearTimeout(this.settleTimer);
    for (const pid of this.agents()) {
      if (!processAlive(pid)) continue;
      this.signalled.add(pid);
      signalProcess(pid, "SIGTERM");
    }
    this.killTimer = setTimeout(() => this.kill(), this.bounds.killMs);
  }

  private kill(): void {
    if (this.finished) return;
    // What SIGTERM reached, and what a fresh walk finds: an agent's
    // child its parent's exit left elsewhere, or one started since.
    for (const pid of new Set([...this.signalled, ...this.agents()])) {
      if (processAlive(pid)) signalProcess(pid, "SIGKILL");
    }
    this.passed = true;
    this.pass();
  }
}
