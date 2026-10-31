// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent processes a stop signals (core-service-39, DR-134): the
// processes the core started. The adapters spawn their agents in no
// process group of their own, and the core may share its process with
// a host's own children — a browser journey's Chromium, a harness's
// stand-ins — so the core records each child process created while its
// own work runs, tells it from its host's by the async context it was
// created in, finds that child's descendants with `ps`, and signals each
// one by its pid.

import { AsyncLocalStorage } from "node:async_hooks";
import { spawnSync, type ChildProcess } from "node:child_process";
import { subscribe } from "node:diagnostics_channel";

/** esbuild's service, which the core keeps for bundling compiled
 * playbooks (compile.ts) and shares with every core of its process: a
 * helper of the core's own, never an agent. */
const ESBUILD_SERVICE = /^\S*\besbuild(\.exe)?\s.*--service=/;

/** Every process descending from `root` — this process by default —
 * as `ps` lists them on macOS and Linux, leaving out the `ps` run itself
 * and esbuild's service; none on another platform or where `ps` cannot
 * be read. */
export function descendantProcesses(root: number = process.pid): number[] {
  return descendantsOf([root]);
}

/** Every process descending from any of `roots`, the roots left out, as
 * `descendantProcesses` reads them. */
function descendantsOf(roots: number[]): number[] {
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
  const seen = new Set<number>(roots);
  for (let queue = [...roots]; queue.length;) {
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

/** The core whose work is running, as the async context carries it. */
const runningCore = new AsyncLocalStorage<StartedProcesses>();

// Node publishes every child process this process creates on its
// `child_process` channel as the process is constructed: one created
// while a core's work runs is that core's.
subscribe("child_process", (message) => {
  runningCore.getStore()?.record((message as { process: ChildProcess }).process);
});

/** The processes one core started (core-service-39): each child process
 * created while the core's work ran — inside `run`, or in anything it
 * scheduled from there — with the descendants each one still has.
 * Nothing its host started is among them. */
export class StartedProcesses {
  private readonly children = new Set<ChildProcess>();

  /** Run `work` as the core's: a child process it, or anything it
   * schedules, creates is the core's. */
  run<T>(work: () => T): T {
    return runningCore.run(this, work);
  }

  /** Record a child process created while the core's work ran. */
  record(child: ChildProcess): void {
    this.prune();
    this.children.add(child);
  }

  /** The core's child processes still running, with their descendants;
   * never esbuild's service, which every core of this process shares. */
  async pids(): Promise<number[]> {
    this.prune();
    const roots = [...this.children]
      .filter((child) => !ESBUILD_SERVICE.test(child.spawnargs.join(" ")))
      .map((child) => child.pid as number);
    if (!roots.length) return [];
    if (process.platform === "win32") {
      let getProcessTree: typeof import("@vscode/windows-process-tree").getProcessTree;
      try { ({ getProcessTree } = await import("@vscode/windows-process-tree")); }
      catch { return roots; } // taskkill /T still reaches each owned root's descendants.

      const trees = await Promise.all(roots.map(root => new Promise<number[]>((resolve) => {
        const timer = setTimeout(() => resolve([root]), 5_000);
        getProcessTree(root, tree => {
          clearTimeout(timer);
          const found = new Set<number>([root]);
          const visit = (entry: { pid: number; children?: unknown[] }): void => {
            found.add(entry.pid);
            for (const child of entry.children ?? []) visit(child as typeof entry);
          };
          if (tree) visit(tree);
          resolve([...found]);
        });
      })));
      return [...new Set(trees.flat())];
    }
    return [...roots, ...descendantsOf(roots)];
  }

  /** Forget the children that have exited or never started: a spawn is
   * attempted as its process is created, so one without a pid failed. */
  private prune(): void {
    for (const child of this.children) {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
        this.children.delete(child);
      }
    }
  }
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
  if (process.platform === "win32") {
    // Windows Node termination signals are forceful. Delegate tree handling to
    // the OS even where optional process enumeration is unavailable.
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 1_000, stdio: "ignore" });
    return;
  }
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
  agentProcesses: () => number[] | Promise<number[]>;
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

  private async agents(): Promise<number[]> {
    let pids: number[];
    try {
      pids = await this.bounds.agentProcesses();
    } catch (error) {
      console.error(`spex: agent processes not listed at stop: ${String(error)}`);
      pids = [];
    }
    return pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid);
  }

  private async terminate(): Promise<void> {
    if (this.terminating || this.finished) return;
    this.terminating = true;
    clearTimeout(this.settleTimer);
    this.killTimer = setTimeout(() => { void this.kill(); }, this.bounds.killMs);
    const pids = await this.agents();
    if (this.finished) return;
    for (const pid of pids) {
      if (!processAlive(pid)) continue;
      this.signalled.add(pid);
      signalProcess(pid, "SIGTERM");
    }

  }

  private async kill(): Promise<void> {
    if (this.finished) return;
    // What SIGTERM reached, and what a fresh walk finds: an agent's
    // child its parent's exit left elsewhere, or one started since.
    const pids = await this.agents();
    if (this.finished) return;
    for (const pid of new Set([...this.signalled, ...pids])) {
      if (processAlive(pid)) signalProcess(pid, "SIGKILL");
    }
    this.passed = true;
    this.pass();
  }
}
