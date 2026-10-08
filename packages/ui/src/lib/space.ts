// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's words and groupings (DR-057, DR-103): the
// home's path in the reader's shorthand, a remote with no user in it,
// a spex repository's clone and the state its row reads (space-61),
// the kinds' order and labels (space-7), the sync steps' names
// (space-12), the catalog's sharing marks, each entry's family word,
// and the families that stay on this device (space-23, space-25).
// Pure functions; the surface renders them.
//
// Every word here is a message of the catalog (localization-4), so a
// table of phrases holds thunks read at render — a table of strings
// would freeze the language this module was imported in.

import type {
  RepositoryState,
  SpaceEntry,
  SpaceUnit,
  SpaceUnitKind,
  SyncStep,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { relativeAge } from "./time.js";

/** The home's path with the user's home directory as `~` (space-1):
 * the full path rides the title. Only the two POSIX layouts the app
 * runs on are known (DR-049). */
export function tildify(path: string): string {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/, "~");
}

/** The `origin` URL as set, with an `http(s)` user removed (space-1):
 * `https://user@host/…` loses its user part, while an SSH form's user is
 * the transport's own (space-5) and stays, so the URL reads back as the
 * one to compare and fix; anything else is shown as stored. */
export function displayRemote(url: string): string {
  const embedded = /^(https?:\/\/)([^/@]*@)(.*)$/i.exec(url);
  return embedded ? `${embedded[1]}${embedded[3]}` : url;
}

/** A spex repository's clone: its key is its path under `workspace/`
 * (storage-1). */
export function clonePath(home: string, key: string): string {
  return `${home.replace(/\/$/, "")}/workspace/${key}`;
}

/** The phrase a step waiting on someone else's rights reads on its
 * row (space-58, space-64): the step and the group, phrased here in the
 * reader's language; the host's own words ride the row's title. */
export function waitingPhrase(waiting: NonNullable<RepositoryState["waiting"]>): string {
  return waiting.step === "create"
    ? i18n._("Waiting for a member who can create it in {group}", { group: waiting.group })
    : i18n._("Waiting for a member who can prepare its branch in {group}", { group: waiting.group });
}

/** What a spex repository's row reads for its state (space-61): a
 * waiting step's phrase stands in place of the state's (space-64). */
export function repositoryStatePhrase(repo: RepositoryState, now: number): string {
  if (repo.waiting) return waitingPhrase(repo.waiting);
  switch (repo.state) {
    case "local-only":
      return i18n._("On this device only");
    case "reachable":
      return repo.lastSync
        ? i18n._({
            id: "Synced {age}",
            values: { age: relativeAge(repo.lastSync.at, now) },
            comment: "a spex repository's row: when it last synced",
          })
        : i18n._("Never synced");
    case "read-only":
      return repo.reason
        ? i18n._("Read-only: {reason}", { reason: repo.reason })
        : i18n._({ id: "Read-only", comment: "a spex repository's state: the host lets this account only read it" });
    case "unreachable":
      return repo.reason
        ? i18n._("Unreachable: {reason}", { reason: repo.reason })
        : i18n._({ id: "Unreachable", comment: "a spex repository's state: the host cannot be read for it" });
    case "absent":
      return i18n._("Not on this device");
    default:
      // A state the page does not know: the raw value is data.
      return repo.state;
  }
}

/** A group's own spex repository rather than a project's (DR-103):
 * your own group's, or the one named `<group>-spex` in its group — a
 * project of that name is refused at creation, the name being taken. */
export function isGroupRepository(group: { name: string }, repo: RepositoryState): boolean {
  return repo.own || repo.name === `${group.name}-spex`;
}

/** Two code remotes name the same repository (space-58): compared as
 * the reader reads them, with no user part, no `.git` and no trailing
 * slash, the host's name in any case. */
export function sameRemote(a: string, b: string): boolean {
  const norm = (url: string) =>
    displayRemote(url.trim())
      .replace(/\/+$/, "")
      .replace(/\.git$/i, "")
      .replace(/^([a-z+]+:\/\/)?([^/:@]+@)?([^/:]+)/i, (_, scheme = "", user = "", host: string) =>
        `${scheme}${user}${host.toLowerCase()}`);
  return norm(a) === norm(b);
}

/** A path's last segment: a working folder's name, the default name
 * of the spex repository made for it (space-58). */
export function lastSegment(path: string): string {
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? path;
}

/** The kinds in the order the lists group them (space-7). */
export const KIND_ORDER: readonly SpaceUnitKind[] = [
  "session",
  "intent",
  "authoring",
  "environment",
  "settings",
  "code",
  "rules",
  "other",
];

export const KIND_LABELS: Record<SpaceUnitKind, () => string> = {
  session: () => i18n._("Sessions"),
  intent: () => i18n._({ id: "Intents", comment: "heading over a spex repository's changed intents" }),
  authoring: () => i18n._({ id: "Authoring", comment: "heading over a spex repository's changed authoring sessions" }),
  environment: () => i18n._({ id: "Environment", comment: "heading over a spex repository's spec package requests and lock" }),
  settings: () => i18n._("Settings"),
  code: () => i18n._({ id: "Code", comment: "heading over the file naming where a project's code lives" }),
  rules: () => i18n._("Sync rules"),
  other: () => i18n._({ id: "Other", comment: "heading over units of no named kind" }),
};

/** One unit of a kind, for the row that names a single conflict
 * (space-17): the singular each language forms for itself. */
export const KIND_SINGULAR: Record<SpaceUnitKind, () => string> = {
  session: () => i18n._({ id: "Session", comment: "one unit's kind: a session" }),
  intent: () => i18n._({ id: "Intent", comment: "one unit's kind: an intent with its attachments" }),
  authoring: () => i18n._({ id: "Authoring session", comment: "one unit's kind: an authoring session" }),
  environment: () => i18n._({ id: "unit.environment", message: "Environment", comment: "one unit's kind: the spec package requests and lock" }),
  settings: () => i18n._({ id: "Setting", comment: "one unit's kind: the settings file" }),
  code: () => i18n._({ id: "unit.code", message: "Code", comment: "one unit's kind: the file naming where the code lives" }),
  rules: () => i18n._({ id: "Sync rule", comment: "one unit's kind: a sync rule file" }),
  other: () => i18n._({ id: "Other", comment: "heading over units of no named kind" }),
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
export const STEP_NAMES: Record<SyncStep, () => string> = {
  save: () => i18n._({ id: "Save", comment: "sync step: saving this device's changes" }),
  check: () => i18n._({ id: "Check", comment: "sync step: checking the host" }),
  compare: () => i18n._({ id: "Compare", comment: "sync step: comparing both sides" }),
  apply: () => i18n._({ id: "Apply", comment: "sync step: applying the chosen versions" }),
  refresh: () => i18n._({ id: "Refresh", comment: "sync step: re-reading the spex repository" }),
  push: () => i18n._({ id: "Push", comment: "sync step: sending to the host" }),
  // A join's step while its code clones (space-63).
  code: () => i18n._({ id: "Code", comment: "join step: cloning the project's code" }),
};

/** What the step line reads while a step runs (space-12, space-63). */
export const STEP_LINES: Record<SyncStep, () => string> = {
  save: () => i18n._("Saving changes…"),
  check: () => i18n._("Checking host…"),
  compare: () => i18n._({ id: "Comparing…", comment: "sync step running: comparing both sides" }),
  apply: () => i18n._({ id: "Applying…", comment: "sync step running: applying the chosen versions" }),
  refresh: () => i18n._({ id: "Refreshing…", comment: "sync step running: re-reading the spex repository" }),
  push: () => i18n._({ id: "Pushing…", comment: "sync step running: sending to the host" }),
  code: () => i18n._({ id: "Cloning code…", comment: "join step running: cloning the project's code into its folder" }),
};

/** A byte count in the reader's units: "312 B", "4.1 KB", "2.3 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return i18n._({ id: "{size} B", values: { size: bytes }, comment: "a file size in bytes" });
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    const size = kb < 10 ? kb.toFixed(1) : String(Math.round(kb));
    return i18n._({ id: "{size} KB", values: { size }, comment: "a file size in kilobytes" });
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    const size = mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
    return i18n._({ id: "{size} MB", values: { size }, comment: "a file size in megabytes" });
  }
  return i18n._({
    id: "{size} GB",
    values: { size: (mb / 1024).toFixed(1) },
    comment: "a file size in gigabytes",
  });
}

/** The sharing mark's words (space-23): color never carries it alone. */
export const SHARING_LABELS: Record<SpaceEntry["sync"], () => string> = {
  shared: () => i18n._({ id: "Shared", comment: "entry mark: this file syncs and is already sent" }),
  pending: () => i18n._("Not yet shared"),
  local: () => i18n._({ id: "Stays here", comment: "entry mark: this file never leaves the device" }),
  git: () => i18n._({ id: "Git data", comment: "entry mark: the repository's own files" }),
};

/** The word this interface calls each catalog family by, keyed by the
 * family the core sends (space-23): the core names the family in one
 * closed English vocabulary the page holds against it (storage-1), so
 * every comparison stays on that raw value and only the reading passes
 * through here, whose English is the core's own word. Thunks, never
 * strings: a table read at module load would freeze the language it
 * was imported in. */
export const FAMILY_LABELS: Record<string, () => string> = {
  "Git data": () => i18n._({ id: "Git data", comment: "entry mark: the repository's own files" }),
  lease: () => i18n._({ id: "lease", comment: "catalog family: the lock naming the process writing now" }),
  "temporary write": () => i18n._({ id: "temporary write", comment: "catalog family: a copy made while writing" }),
  "config backup": () => i18n._({ id: "config backup", comment: "catalog family: a copy of the config kept before a write" }),
  "sync repair marker": () => i18n._({ id: "sync repair marker", comment: "catalog family: the mark of a repair this device acknowledged" }),
  "session bundles": () => i18n._({ id: "session bundles", comment: "catalog family: the folder holding every session's files" }),
  "session manifest": () => i18n._({ id: "session manifest", comment: "catalog family: one session's manifest file" }),
  "session records": () => i18n._({ id: "session records", comment: "catalog family: one session's record stream" }),
  "session attachments": () => i18n._({ id: "session attachments", comment: "catalog family: the files attached to one session's turns" }),
  "provider hints": () => i18n._({ id: "provider hints", comment: "a file family that stays on this device" }),
  "legacy session sidecar": () => i18n._({ id: "legacy session sidecar", comment: "catalog family: a session file an earlier release wrote" }),
  intents: () => i18n._({ id: "intents", comment: "catalog family: the folder holding every intent's file" }),
  intent: () => i18n._({ id: "intent", comment: "catalog family: one intent's file" }),
  "intent attachments": () => i18n._({ id: "intent attachments", comment: "catalog family: the files attached to one intent" }),
  "authoring sessions": () => i18n._({ id: "authoring sessions", comment: "catalog family: the folder holding every authoring session" }),
  "authoring session": () => i18n._({ id: "authoring session", comment: "catalog family: one authoring session's files" }),
  "authoring records": () => i18n._({ id: "authoring records", comment: "catalog family: one authoring session's record stream" }),
  "authoring attachments": () => i18n._({ id: "authoring attachments", comment: "catalog family: the files attached to one authoring session" }),
  "spec package requests": () => i18n._({ id: "spec package requests", comment: "catalog family: the spec packages the environment asks for" }),
  "spec package lock": () => i18n._({ id: "spec package lock", comment: "catalog family: the exact spec packages the environment resolved" }),
  "upload staging": () => i18n._({ id: "upload staging", comment: "catalog family: files uploaded and not yet attached" }),
  Settings: () => i18n._({ id: "Settings", comment: "catalog family: the shared config the Settings surface edits" }),
  "code remote": () => i18n._({ id: "code remote", comment: "catalog family: the file naming where a project's code lives" }),
  "installed spec packages": () => i18n._({ id: "installed spec packages", comment: "catalog family: spec packages installed on this device from the lock" }),
  "exported skills": () => i18n._({ id: "exported skills", comment: "catalog family: skills exported from the installed spec packages" }),
  "sync rules": () => i18n._({ id: "sync rules", comment: "catalog family: the files saying what syncs" }),
  "Not a Spex folder": () => i18n._({ id: "Not a Spex folder", comment: "catalog family: a folder Spex did not write" }),
  "Not a Spex file": () => i18n._({ id: "Not a Spex file", comment: "catalog family: a file Spex did not write" }),
};

/** The word an entry's family reads as; a family this interface does
 * not know reads as the core sent it, so a family a later core adds is
 * never renamed into nonsense. */
export function familyName(family: string): string {
  return FAMILY_LABELS[family]?.() ?? family;
}

/** Every ignored family with its one plain reason (space-25); read at
 * render, never at module load. */
export function staysHere(): readonly { family: string; reason: string }[] {
  return [
    {
      family: i18n._({ id: "provider hints", comment: "a file family that stays on this device" }),
      reason: i18n._(
        "resume tokens for this machine's agent conversations; they work nowhere else",
      ),
    },
    {
      family: i18n._({ id: "leases and locks", comment: "a file family that stays on this device" }),
      reason: i18n._("which process is writing right now"),
    },
    {
      family: i18n._({
        id: "installed spec packages and exported skills",
        comment: "a file family that stays on this device",
      }),
      reason: i18n._("copies installed from the lock; every device installs its own"),
    },
    {
      family: i18n._({ id: "where projects live", comment: "a file family that stays on this device" }),
      reason: i18n._("where your working folders are on this machine, in the home file"),
    },
    {
      family: i18n._({ id: "preferences", comment: "a file family that stays on this device" }),
      reason: i18n._("where you last stopped reading in each session"),
    },
    {
      family: i18n._({ id: "credentials", comment: "a file family that stays on this device" }),
      reason: i18n._("this device's sign-in to the Git host"),
    },
    {
      family: i18n._({
        id: "migration receipts and inputs",
        comment: "a file family that stays on this device",
      }),
      reason: i18n._("original files kept from an upgrade"),
    },
    {
      family: i18n._({
        id: "temporary files",
        comment: "a file family that stays on this device",
      }),
      reason: i18n._("copies made while writing"),
    },
  ];
}

/** A session's files under its node read by their part, not their
 * file name (space-23). The family the core sent names the part; the
 * word the row reads is this interface's own. */
export function sessionPartName(entry: SpaceEntry): string {
  switch (entry.family) {
    case "session manifest":
      return i18n._({ id: "manifest", comment: "a session's part: its manifest file" });
    case "session records":
      return i18n._({ id: "records", comment: "a session's part: its record file" });
    case "provider hints":
      return i18n._({ id: "provider hints", comment: "a file family that stays on this device" });
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

/** The phrase a withheld preview reads (space-24): the page's own
 * words for a read the core answered with the `withheld` kind, which
 * is what the page recognizes — never the reason's wording, which the
 * core composes in the home's language (localization-11). */
export function withheldPhrase(): string {
  return i18n._("May hold provider tokens — not shown");
}

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
  return isMacPlatform()
    ? i18n._({ id: "Show in Finder", comment: "reveal a path in macOS Finder" })
    : i18n._({ id: "Show in folder", comment: "reveal a path in the file manager" });
}

/** The native bridge's reveal capability, feature-detected
 * (app-shell-28, DR-008); absent on the served page. */
export function revealBridge(): ((path: string) => Promise<boolean>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { revealPath?: unknown } }).spexNative;
  return typeof native?.revealPath === "function"
    ? (native.revealPath as (path: string) => Promise<boolean>)
    : undefined;
}

/** The native bridge's browser opener, feature-detected
 * (app-shell-37, DR-008); absent on the served page, where the
 * sign-in URL stands as a link instead (space-3). */
export function openExternalBridge(): ((url: string) => Promise<boolean>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { openExternal?: unknown } }).spexNative;
  return typeof native?.openExternal === "function"
    ? (native.openExternal as (url: string) => Promise<boolean>)
    : undefined;
}

/** The native bridge's directory picker, where the shell offers one
 * (DR-008): Join and Choose folder… ask through it (space-63). */
export function pickDirectoryBridge(): (() => Promise<string | null>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { pickDirectory?: unknown } }).spexNative;
  return typeof native?.pickDirectory === "function"
    ? (native.pickDirectory as () => Promise<string | null>)
    : undefined;
}

/** The absolute path of an entry under the home. */
export function absolutePath(home: string, relative: string): string {
  if (!relative || relative === ".") return home;
  return `${home.replace(/\/$/, "")}/${relative.replace(/^\.?\//, "")}`;
}
