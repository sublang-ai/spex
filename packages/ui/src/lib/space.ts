// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's words and groupings (DR-057): the home's path
// in the reader's shorthand, a remote with no user in it, the kinds'
// order and labels (space-7), the sync steps' names (space-12), the
// catalog's sharing marks and the families that stay on this device
// (space-23, space-25). Pure functions; the surface renders them.

import type {
  SpaceEntry,
  SpaceUnit,
  SpaceUnitKind,
  SyncStep,
} from "@sublang/spex-core/protocol";

/** The home's path with the user's home directory as `~` (space-1):
 * the full path rides the title. Only the two POSIX layouts the app
 * runs on are known (DR-049). */
export function tildify(path: string): string {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/, "~");
}

/** The `origin` URL with any embedded user removed (space-1): a
 * `scheme://user@host/…` loses its user part, a `git@host:path`
 * reads `host:path`; anything else is shown as stored. */
export function displayRemote(url: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*:\/\/)([^/@]*@)(.*)$/i.exec(url);
  if (scheme) return `${scheme[1]}${scheme[3]}`;
  const scp = /^([^@/:]+)@([^:/]+:.*)$/.exec(url);
  if (scp) return scp[2];
  return url;
}

/** The kinds in the order the lists group them (space-7). */
export const KIND_ORDER: readonly SpaceUnitKind[] = [
  "session",
  "queue",
  "projects",
  "settings",
  "playbook",
  "rules",
  "other",
];

export const KIND_LABELS: Record<SpaceUnitKind, string> = {
  session: "Sessions",
  queue: "Queues",
  projects: "Projects",
  settings: "Settings",
  playbook: "Playbooks",
  rules: "Sync rules",
  other: "Other",
};

/** Units grouped by kind in the kinds' order, empty kinds omitted. */
export function groupUnits(
  units: readonly SpaceUnit[],
): { kind: SpaceUnitKind; units: SpaceUnit[] }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    units: units.filter((unit) => unit.kind === kind),
  })).filter((group) => group.units.length > 0);
}

/** The six steps in order (space-12). */
export const STEP_ORDER: readonly SyncStep[] = [
  "save",
  "check",
  "compare",
  "apply",
  "refresh",
  "push",
];

/** A step's name on the rail. */
export const STEP_NAMES: Record<SyncStep, string> = {
  save: "Save",
  check: "Check",
  compare: "Compare",
  apply: "Apply",
  refresh: "Refresh",
  push: "Push",
};

/** What the step line reads while a step runs (space-12). */
export const STEP_LINES: Record<SyncStep, string> = {
  save: "Saving changes…",
  check: "Checking remote…",
  compare: "Comparing…",
  apply: "Applying…",
  refresh: "Refreshing…",
  push: "Pushing…",
};

/** A byte count in the reader's units: "312 B", "4.1 KB", "2.3 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** The sharing mark's words (space-23): color never carries it alone. */
export const SHARING_LABELS: Record<SpaceEntry["sync"], string> = {
  shared: "Shared",
  pending: "Not yet shared",
  local: "Stays here",
  git: "Git data",
};

/** Every ignored family with its one plain reason (space-25). */
export const STAYS_HERE: readonly { family: string; reason: string }[] = [
  {
    family: "provider hints",
    reason:
      "resume tokens for this machine's agent conversations; they work nowhere else",
  },
  { family: "leases and locks", reason: "which process is writing right now" },
  {
    family: "local project paths",
    reason: "where your projects live on this machine",
  },
  {
    family: "preferences",
    reason: "where you last stopped reading in each session",
  },
  { family: "forge cache", reason: "GitHub lists the app fetches again" },
  {
    family: "migration receipts and inputs",
    reason: "original files kept from an upgrade, some holding old tokens",
  },
  {
    family: "config backups and temporary files",
    reason: "copies made while writing",
  },
];

/** A session's files under its node read by their part, not their
 * file name (space-23). */
export function sessionPartName(entry: SpaceEntry): string {
  switch (entry.family) {
    case "session manifest":
      return "manifest";
    case "session records":
      return "records";
    case "provider hints":
      return "provider hints";
    default:
      return entry.name;
  }
}

/** How the preview renders a text entry (space-24), by its name. */
export function previewKindOf(
  name: string,
): "json" | "jsonl" | "markdown" | "text" {
  if (/\.jsonl$/i.test(name)) return "jsonl";
  if (/\.json$/i.test(name)) return "json";
  if (/\.(md|markdown)$/i.test(name)) return "markdown";
  return "text";
}

/** JSON pretty-printed for the preview; text that is not JSON stands. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The phrase a withheld preview reads (space-24). */
export const WITHHELD_PHRASE = "May hold provider tokens — not shown";

/** Whether the page runs on a Mac, for the reveal control's name. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ??
    navigator.platform ??
    "";
  return /mac/i.test(platform);
}

/** The reveal control's name (space-26): the file manager's own. */
export function revealLabel(): string {
  return isMacPlatform() ? "Show in Finder" : "Show in folder";
}

/** The native bridge's reveal capability, feature-detected
 * (app-shell-28, space-36); absent on the served page. */
export function revealBridge(): ((path: string) => Promise<boolean>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { revealPath?: unknown } }).spexNative;
  return typeof native?.revealPath === "function"
    ? (native.revealPath as (path: string) => Promise<boolean>)
    : undefined;
}

/** "1 unit" / "3 units". */
export function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : nouns}`;
}

/** The absolute path of an entry under the home. */
export function absolutePath(home: string, relative: string): string {
  if (!relative || relative === ".") return home;
  return `${home.replace(/\/$/, "")}/${relative.replace(/^\.?\//, "")}`;
}
