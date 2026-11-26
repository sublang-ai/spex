// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What another host appends to a session it runs (core-service-60).
// Playbook's writer appends each record to the newest segment under
// `<id>.replay/` and replaces the session's root only at a checkpoint, and
// no watch of `sessions/` reports a write inside that folder — nor, on
// macOS, a write through a handle the writer keeps open. So while another
// host's writer holds a session, its newest segment's name, size and time
// are looked at on a short interval, and a change asks that session alone
// to be read (core-service-158, DR-254). Nothing is opened: a stat holds
// no folder, so no move of a clone waits on it.

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ReplayTailsOptions {
  /** The sessions another host's writer holds now, with the sessions
   * folder of the clone that holds each. */
  held: () => { id: string; sessionsDir: string }[];
  /** A held session's replay changed: `<id>.replay`, as a watch names it. */
  changed: (filename: string) => void;
  /** How often a held session's newest segment is looked at. */
  intervalMs?: number;
}

/** The newest segment of a session's replay as it stands: its name, size
 * and time, or what stands in its place. */
function tail(sessionsDir: string, id: string): string {
  const folder = join(sessionsDir, `${id}.replay`);
  try {
    const newest = readdirSync(folder).filter((name) => name.endsWith(".jsonl")).sort().at(-1);
    if (newest === undefined) return "!empty";
    const stat = lstatSync(join(folder, newest), { bigint: true });
    return `${newest}:${stat.ino}:${stat.size}:${stat.mtimeNs}`;
  } catch (error) {
    return `!${(error as NodeJS.ErrnoException).code ?? "unreadable"}`;
  }
}

export class ReplayTails {
  /** Each held session's tail as last looked at; none before the first look. */
  private readonly seen = new Map<string, { sessionsDir: string; tail?: string }>();
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(private readonly options: ReplayTailsOptions) {}

  /** Follow the sessions held now: a session newly held is looked at on
   * the next interval — a first look reads it once, should it have grown
   * since the read that found it held — and one no longer held is let go. */
  update(): void {
    if (this.stopped) return;
    const held = new Map(this.options.held().map(({ id, sessionsDir }) => [id, sessionsDir]));
    for (const [id, entry] of this.seen) if (held.get(id) !== entry.sessionsDir) this.seen.delete(id);
    for (const [id, sessionsDir] of held) if (!this.seen.has(id)) this.seen.set(id, { sessionsDir });
    if (this.seen.size > 0 && !this.timer) {
      this.timer = setInterval(() => this.look(), this.options.intervalMs ?? 250);
      this.timer.unref();
    } else if (this.seen.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private look(): void {
    for (const [id, entry] of this.seen) {
      const now = tail(entry.sessionsDir, id);
      if (now === entry.tail) continue;
      entry.tail = now;
      this.options.changed(`${id}.replay`);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.seen.clear();
  }
}
