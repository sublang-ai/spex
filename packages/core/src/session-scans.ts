// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Which sessions the core reads again, and when (core-service-158). A
// clone's `sessions/` holds the sessions another host writes
// (core-service-60) beside the ones this core runs, and its watch reports
// every file of both. A file of a session this core holds is the core's
// own write and reads nothing; a file naming another session reads that
// session alone; anything else reads them all. One read runs at a time
// and one waits behind it, every change meanwhile joining the one that
// waits, so a read slower than the changes arriving leaves no backlog.

/** The sessions one read covers: each one named, or every session of
 * every clone. */
export interface SessionScan {
  all: boolean;
  ids: ReadonlySet<string>;
}

export interface SessionScansOptions {
  /** Whether this core holds the session, so the files changing under
   * its name are its own writes. */
  holds: (sessionId: string) => boolean;
  /** Read these sessions again and publish what changed. */
  scan: (scan: SessionScan) => Promise<void>;
  /** How long a change waits for others to join it; later changes never
   * postpone the read past it. */
  delayMs?: number;
}

/** The files that are a session's own, by the session they name: its
 * record, replay descriptor, provider hints and former stream, and its
 * lease. */
const SESSION_FILE = /^(?:([0-9a-f-]{36})\.(?:json|replay\.json|hints\.json|records\.jsonl)|\.([0-9a-f-]{36})\.lock)$/;

/** What a changed file asks to be read: one session, every session, or
 * nothing — a Spex sidecar, a temporary file, a retired lease. */
function named(filename: string): { id: string } | "all" | undefined {
  if (filename.endsWith(".spex.json")) return undefined;
  const match = SESSION_FILE.exec(filename);
  if (match) return { id: match[1] ?? match[2] };
  // A record or stream under a name no session has is read as before:
  // with everything.
  return filename.endsWith(".json") || filename.endsWith(".records.jsonl") ? "all" : undefined;
}

interface Waiting {
  all: boolean;
  ids: Set<string>;
  /** What each caller asked to run before the read, with how to tell it
   * the read is done. */
  callers: { before?: () => Promise<void>; resolve: () => void; reject: (error: unknown) => void }[];
}

export class SessionScans {
  /** The changes reported since the last read was asked for. */
  private noted: { all: boolean; ids: Set<string> } = { all: false, ids: new Set() };
  private timer?: NodeJS.Timeout;
  private waiting?: Waiting;
  private running?: Promise<void>;
  private stopped = false;

  constructor(private readonly options: SessionScansOptions) {}

  /** A file changed in a clone's `sessions/`: the one named, where the
   * platform names one. */
  changed(filename: string | null): void {
    if (this.stopped) return;
    const what = filename === null ? "all" : named(filename);
    if (what === undefined) return;
    if (what === "all") this.noted.all = true;
    else if (this.options.holds(what.id)) return;
    else this.noted.ids.add(what.id);
    // The wait is bounded even while a writer keeps writing: later
    // changes join this read instead of postponing it.
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const noted = this.noted;
      this.noted = { all: false, ids: new Set() };
      this.enqueue(noted).catch(() => {});
    }, this.options.delayMs ?? 150);
  }

  /** Read every session of every clone, `before` run first: done once a
   * read begun after this call has finished, failed where `before` or
   * that read failed. */
  all(before?: () => Promise<void>): Promise<void> {
    return this.enqueue({ all: true, ids: new Set() }, before);
  }

  /** Every read asked for so far has finished. */
  async settled(): Promise<void> {
    while (this.running) await this.running;
  }

  /** No change is noted from now on; a read in flight finishes. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private enqueue(scan: SessionScan, before?: () => Promise<void>): Promise<void> {
    const waiting = this.waiting ??= { all: false, ids: new Set(), callers: [] };
    waiting.all ||= scan.all;
    for (const id of scan.ids) waiting.ids.add(id);
    const done = new Promise<void>((resolve, reject) => { waiting.callers.push({ before, resolve, reject }); });
    this.running ??= this.drain();
    return done;
  }

  private async drain(): Promise<void> {
    // The caller's own turn ends first, so `running` stands before the
    // first read starts and a second caller joins it.
    await Promise.resolve();
    try {
      for (let waiting = this.waiting; waiting; waiting = this.waiting) {
        this.waiting = undefined;
        const failed = new Map<object, unknown>();
        for (const caller of waiting.callers) {
          try { await caller.before?.(); }
          catch (error) { failed.set(caller, error); }
        }
        let fault: { error: unknown } | undefined;
        try { await this.options.scan({ all: waiting.all, ids: waiting.all ? new Set() : waiting.ids }); }
        catch (error) { fault = { error }; }
        for (const caller of waiting.callers) {
          if (failed.has(caller)) caller.reject(failed.get(caller));
          else if (fault) caller.reject(fault.error);
          else caller.resolve();
        }
      }
    } finally {
      this.running = undefined;
    }
  }
}
