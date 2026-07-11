// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Spex WebSocket protocol: every message between core and UI is
// defined here and nowhere else (CORE-12). This module must stay free
// of Node-only imports so the UI can consume it directly; the record
// type is imported type-only from cligent and erased at build time.

import { z } from "zod";
import type { TmuxPlayRecord } from "@sublang/cligent/tmux-play";

export const PROTOCOL_VERSION = 1;

export type { TmuxPlayRecord };

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export const adapterNameSchema = z.enum([
  "claude",
  "codex",
  "gemini",
  "opencode",
]);
export type AdapterName = z.infer<typeof adapterNameSchema>;

export interface ProfileSummary {
  id: string;
  adapter: AdapterName;
  model?: string;
  reasoningEffort?: string;
  instruction?: string;
  permissions?: {
    mode?: string;
    fileWrite?: string;
    shellExecute?: string;
    networkAccess?: string;
    writablePaths?: string[];
  };
}

export interface PlaybookPlayerRef {
  /** The reference exactly as written in the config (profile id or
   * adapter shorthand); inline blocks fall back to the display. */
  ref: string;
  /** Human-readable identity: pinned model, else adapter. */
  display: string;
}

export interface PlaybookSummary {
  id: string;
  from: string;
  command: string;
  intent: string;
  players: Record<string, PlaybookPlayerRef>;
}

export interface PlaybookArtifacts {
  /** The workflow markdown the playbook was compiled from. */
  source: string | null;
  /** The GEARS spec items. */
  gears: string | null;
  /** The compiled XState FSM module code. */
  fsm: string | null;
  /** Every state id of the FSM, when derivable. */
  stateIds: string[] | null;
  /** Stage names that could not be located. */
  missing: string[];
}

export interface ConfigSummary {
  path: string;
  profiles: ProfileSummary[];
  captain: string;
  playbooks: PlaybookSummary[];
  notifications?: Record<string, string>;
  theme?: string;
}

export type ConfigState =
  | { status: "valid"; summary: ConfigSummary; seeded: boolean }
  | { status: "invalid"; path: string; errors: string[] }
  | { status: "missing"; path: string };

export interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  registeredAt: number;
}

export interface SessionInfo {
  id: string;
  projectId: string;
  projectPath: string;
  createdAt: number;
  live: boolean;
  endedAt: number | null;
  /** Player pane roster: namespaced `<playbook>-<role>` ids in config order. */
  players: { id: string; adapter: AdapterName; model?: string }[];
  /** Panes visible at session start, before any player_view_changed record. */
  initialVisible: string[];
}

export interface ReadinessEntry {
  profileId: string;
  adapter: AdapterName;
  /** true = ready, false = not ready, null = no light check for this adapter. */
  ready: boolean | null;
  /** Unmet requirement, present when ready is false. */
  requirement?: string;
}

export interface StoredRecord {
  seq: number;
  record: TmuxPlayRecord;
}

export interface RepoStatusInfo {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  originUrl?: string;
}

export interface ForgeItem {
  number: number;
  title: string;
  url: string;
  author?: string;
  updatedAt?: string;
  labels?: string[];
}

export interface ForgeState {
  adapter: "github";
  /** null: adapter tool missing/unbound; false: not authenticated. */
  authenticated: boolean | null;
  /** owner/name when the origin remote maps to the forge. */
  repo?: string;
  issues: ForgeItem[];
  prs: ForgeItem[];
  /** Setup guidance when data cannot be served. */
  guidance?: string;
}

// ---------------------------------------------------------------------------
// Client → core commands (validated per CORE-13)
// ---------------------------------------------------------------------------

const id = z.string().min(1);

export const configEditOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("profile.save"),
    id: z.string().min(1),
    profile: z.object({
      adapter: z.string().min(1),
      model: z.string().optional(),
      reasoningEffort: z.string().optional(),
      instruction: z.string().optional(),
      permissions: z
        .object({
          mode: z.string().optional(),
          fileWrite: z.string().optional(),
          shellExecute: z.string().optional(),
          networkAccess: z.string().optional(),
          writablePaths: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  }),
  z.object({ kind: z.literal("profile.delete"), id: z.string().min(1) }),
  z.object({
    kind: z.literal("profile.patch"),
    id: z.string().min(1),
    patch: z.object({
      model: z.string().optional(),
      reasoningEffort: z.string().optional(),
    }),
  }),
  z.object({ kind: z.literal("captain.set"), ref: z.string().min(1) }),
  z.object({
    kind: z.literal("notifications.set"),
    prefs: z.record(z.string(), z.string()),
  }),
  z.object({ kind: z.literal("theme.set"), theme: z.string().nullable() }),
  z.object({
    kind: z.literal("playbook.player.set"),
    playbookId: z.string().min(1),
    role: z.string().min(1),
    ref: z.string().min(1),
  }),
  z.object({
    kind: z.literal("playbook.option.set"),
    playbookId: z.string().min(1),
    key: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({ kind: z.literal("playbook.delete"), playbookId: z.string().min(1) }),
  z.object({
    kind: z.literal("playbook.add"),
    playbookId: z.string().min(1),
    from: z.string().min(1),
    players: z.record(z.string(), z.string()),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
]);
export type ConfigEditOpInput = z.infer<typeof configEditOpSchema>;

export const channelSchema = z.object({
  kind: z.enum(["session", "debug"]),
  sessionId: z.string().min(1),
});
export type Channel = z.infer<typeof channelSchema>;

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("config.get"), id }),
  z.object({ type: z.literal("readiness.get"), id }),
  z.object({ type: z.literal("project.list"), id }),
  z.object({ type: z.literal("project.register"), id, path: z.string().min(1) }),
  z.object({ type: z.literal("project.remove"), id, projectId: z.string().min(1) }),
  z.object({
    type: z.literal("project.create"),
    id,
    path: z.string().min(1),
    scaffold: z.boolean().optional(),
  }),
  z.object({ type: z.literal("project.status"), id, projectId: z.string().min(1) }),
  z.object({
    type: z.literal("forge.items"),
    id,
    projectId: z.string().min(1),
    refresh: z.boolean().optional(),
  }),
  z.object({ type: z.literal("session.list"), id }),
  z.object({ type: z.literal("session.create"), id, projectId: z.string().min(1) }),
  z.object({ type: z.literal("session.dispose"), id, sessionId: z.string().min(1) }),
  z.object({
    type: z.literal("turn.submit"),
    id,
    sessionId: z.string().min(1),
    text: z.string().min(1),
  }),
  z.object({ type: z.literal("turn.abort"), id, sessionId: z.string().min(1) }),
  z.object({ type: z.literal("subscribe"), id, channel: channelSchema }),
  z.object({ type: z.literal("unsubscribe"), id, channel: channelSchema }),
  z.object({
    type: z.literal("history.get"),
    id,
    sessionId: z.string().min(1),
    afterSeq: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("usage.get"), id, sessionId: z.string().min(1) }),
  z.object({ type: z.literal("usage.days"), id }),
  z.object({ type: z.literal("config.edit"), id, op: configEditOpSchema }),
  z.object({ type: z.literal("compile.check"), id }),
  z.object({
    type: z.literal("playbook.artifacts"),
    id,
    playbookId: z.string().min(1),
  }),
  z.object({
    type: z.literal("compile.run"),
    id,
    playbookId: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    sourceText: z.string().optional(),
    sourcePath: z.string().optional(),
    roles: z.array(z.string().min(1)).min(1),
    command: z.string().min(1),
    intent: z.string().min(1),
    /** role -> profile id or adapter shorthand, written to the config. */
    players: z.record(z.string(), z.string()),
  }),
  z.object({
    type: z.literal("compile.abort"),
    id,
    playbookId: z.string().min(1),
  }),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command["type"];

/** Reply result payload per command type. */
export interface CommandResults {
  "config.get": ConfigState;
  "readiness.get": ReadinessEntry[];
  "project.list": ProjectInfo[];
  "project.register": ProjectInfo;
  "project.remove": null;
  "project.create": ProjectInfo;
  "project.status": RepoStatusInfo;
  "forge.items": ForgeState;
  "session.list": SessionInfo[];
  "session.create": SessionInfo;
  "session.dispose": null;
  "turn.submit": { accepted: true };
  "turn.abort": { aborted: boolean };
  subscribe: null;
  unsubscribe: null;
  "history.get": { records: StoredRecord[] };
  "usage.get": {
    inputTokens: number;
    outputTokens: number;
    toolUses: number;
    totalCostUsd: number;
  };
  "usage.days": {
    day: string;
    totals: {
      inputTokens: number;
      outputTokens: number;
      toolUses: number;
      totalCostUsd: number;
    };
  }[];
  "config.edit": ConfigState;
  "compile.check": {
    node: { ok: boolean; version?: string; command: string; guidance?: string };
    slc: { ok: boolean; command: string[]; guidance?: string };
  };
  "compile.run": ConfigState;
  "compile.abort": null;
  "playbook.artifacts": PlaybookArtifacts;
}

// ---------------------------------------------------------------------------
// Core → client messages
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "invalid_message"
  | "invalid_request"
  | "invalid_config"
  | "not_found"
  | "busy"
  | "aborted"
  | "conflict"
  | "internal";

export interface HelloMessage {
  type: "hello";
  protocolVersion: number;
  coreVersion: string;
}

export type ReplyMessage =
  | { type: "reply"; id: string; ok: true; result: unknown }
  | {
      type: "reply";
      id: string;
      ok: false;
      error: { code: ErrorCode; message: string };
    };

export interface RecordMessage {
  type: "record";
  channel: "session" | "debug";
  sessionId: string;
  seq: number;
  record: TmuxPlayRecord;
}

export interface ConfigStateMessage {
  type: "config.state";
  state: ConfigState;
}

export interface ReadinessStateMessage {
  type: "readiness.state";
  profiles: ReadinessEntry[];
}

export interface SessionStateMessage {
  type: "session.state";
  session: SessionInfo;
}

export interface CompileProgressMessage {
  type: "compile.progress";
  playbookId: string;
  line: string;
}

export type ServerMessage =
  | HelloMessage
  | ReplyMessage
  | RecordMessage
  | ConfigStateMessage
  | ReadinessStateMessage
  | SessionStateMessage
  | CompileProgressMessage;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export type ParseCommandResult =
  | { ok: true; command: Command }
  | { ok: false; error: string; id?: string };

/** Parse and validate one inbound client message (CORE-13). */
export function parseCommand(raw: unknown): ParseCommandResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "message is not valid JSON" };
    }
  }
  const result = commandSchema.safeParse(value);
  if (result.success) return { ok: true, command: result.data };
  const maybeId =
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
      ? (value as { id: string }).id
      : undefined;
  return {
    ok: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join(".") || "message"}: ${issue.message}`)
      .join("; "),
    id: maybeId,
  };
}
