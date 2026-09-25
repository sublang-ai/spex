// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createTmuxPlayRuntime, type Captain, type PlayerAdapterImports } from "@sublang/cligent/tmux-play";
import { openSessionHost, discardSessionUncertain, type SessionHostController } from "@sublang/playbook/session-host";
import {
  assertCaptainSessionExecutionCompatible,
  projectCaptainSessionStructure,
  validateCaptainSessionExecutionProjection,
  type SessionExecutionProjection,
  type SessionStructuralProjection,
  type ReplayStreamEntry,
} from "@sublang/playbook/session-store";
import { resolveArtifacts } from "./artifacts.js";
import { i18n } from "./i18n.js";
import type { ComposedConfig, LoadModule } from "./config.js";
import { BOSS_ABORT_REASON, CORE_STOP_REASON, controlRecord, type TurnControlKind } from "./control-record.js";
import { foldConditions } from "./ledger.js";
import { CAPTAIN_AGENT_ID, type ParkedRunAction, type ProjectInfo, type SessionAgentSettings, type SessionInfo, type SessionAgentSettingsMap, type TmuxPlayRecord } from "./protocol.js";
import { Store } from "./store.js";

export class CoreError extends Error {
  /** `details` are the facts a page acts on, apart from the words it
   * shows (core-service-111): a refusal is never matched by its prose. */
  constructor(
    readonly code: "not_found" | "busy" | "aborted" | "conflict" | "invalid_config" | "invalid_request" | "internal",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

/** core-service-98: the optional control members a Captain shell may
 * publish, forwarded from a wrapped shell by feature detection. */
function controlSurfaces(shell: unknown): Record<string, unknown> {
  const source = shell as Record<string, unknown>;
  const forwarded: Record<string, unknown> = {};
  for (const name of [
    "describeRuntimeActions",
    "submitRuntimeAction",
    "describeShellActions",
    "submitShellAction",
  ]) {
    const member = source[name];
    if (typeof member === "function") {
      forwarded[name] = (...args: unknown[]) => (member as (...a: unknown[]) => unknown).apply(source, args);
    }
  }
  return forwarded;
}

/** Deterministic record fixtures; production uses Playbook's Captain
 * shell. The session id lets a fixture keep state across the runtime
 * releases the turn-held lifecycle makes (core-service-91). */
export type CaptainFactory = (composed: ComposedConfig, sessionId: string) => Promise<Captain>;
export interface SessionManagerOptions {
  store: Store;
  loadModule?: LoadModule;
  adapterImports?: PlayerAdapterImports;
  captainFactory?: CaptainFactory;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}
export interface RecordEnvelope {
  sessionId: string;
  seq: number;
  record: TmuxPlayRecord;
  hidden: boolean;
  role?: string;
}
interface LiveSession {
  info: SessionInfo;
  controller: SessionHostController;
  runtime: SessionHostController["host"];
  seq: number;
  turnActive: boolean;
  pendingIntentId?: string;
  /** Ownership at this turn's start, before a possible human verdict. */
  turnIntentId?: string;
  operation?: Promise<void>;
}

/** The members a stored structure names: its playbooks, and its
 * referenced players in stored order (core-service-92). */
export interface StoredMembers { playbookIds: string[]; playerIds: string[] }

export function storedMembers(structure: SessionStructuralProjection): StoredMembers {
  return {
    playbookIds: Object.keys(structure.catalog),
    playerIds: structure.players.map((player) => String((player as {id: unknown}).id)),
  };
}

/** The drift lines two paths share, each phrased when it is composed
 * (core-service-111); the ids stay as the config writes them. */
const playbookGone = (playbookId: string): string =>
  i18n._({
    id: "playbook {playbookId} is no longer enabled",
    comment: "One settings drift: a stored playbook left the config",
    values: { playbookId },
  });
const playerNamed = (playerId: string): string =>
  i18n._({
    id: "player {playerId}",
    comment: "A session player, named inside a settings-drift line",
    values: { playerId },
  });

/** A drift the projection itself cannot express — a stored member the
 * current config no longer holds (core-service-92). */
export class SettingsDriftError extends Error {
  constructor(readonly changes: string[]) {
    super(i18n._({
      id: "Settings changed since this session started: {changes}. Start a new session for the new settings, or change them back.",
      comment:
        "Refusal to continue a session; `changes` are the drift lines, themselves messages",
      values: {
        changes: changes.join(
          i18n._({ id: "; ", comment: "Separates reasons listed in one message" }),
        ),
      },
    }));
    this.name = "SettingsDriftError";
  }
}

/** Construct the shared execution projection from the validated desktop
 * config — the whole enabled catalog for a new session, or the current
 * config projected onto a stored session's members so an unrelated
 * playbook or player never invalidates it (core-service-92, DR-051). */
/** One agent's tuning read onto a composed block (core-service-100,
 * DR-067): a string pins, `false` takes the provider's current
 * default, and an absent field leaves the configured selection. The
 * shell is told the outcome, exactly as composition tells it one. */
function tuned<T extends {model: unknown; effort: unknown; fastMode?: boolean}>(block: T, tuning: SessionAgentSettings | undefined): T {
  if (!tuning) return block;
  const selection = (value: string | false): unknown => value === false ? {kind: "provider-default"} : {kind: "value", value};
  return {
    ...block,
    ...(tuning.model !== undefined ? {model: selection(tuning.model)} : {}),
    ...(tuning.effort !== undefined ? {effort: selection(tuning.effort)} : {}),
    ...(tuning.fastMode !== undefined ? {fastMode: tuning.fastMode} : {}),
  };
}

export function executionConfig(composed: ComposedConfig, cwd: string, members?: StoredMembers, tuning?: SessionAgentSettingsMap): SessionExecutionProjection {
  const playbooks = members
    ? members.playbookIds.map((id) => composed.playbooks.find((playbook) => playbook.id === id))
    : composed.playbooks;
  const missingPlaybooks = members ? members.playbookIds.filter((id, index) => !playbooks[index]) : [];
  const playerIds = members ? members.playerIds : composed.players.map(({id}) => id);
  const missingPlayers = playerIds.filter((id) => !composed.captainOptions.sessionAgents.players[id]);
  if (missingPlaybooks.length || missingPlayers.length) {
    throw new SettingsDriftError([
      ...missingPlaybooks.map((id) => playbookGone(id)),
      ...missingPlayers.map((id) => i18n._({
        id: "player {playerId} is no longer bound by the session's playbooks",
        comment: "One settings drift: a stored player no longer serves any role",
        values: { playerId: id },
      })),
    ]);
  }
  return validateCaptainSessionExecutionProjection({
    schemaVersion: 2,
    captain: tuned(composed.captainOptions.sessionAgents.captain, tuning?.[CAPTAIN_AGENT_ID]),
    players: playerIds.map((id) => ({ id, ...tuned(composed.captainOptions.sessionAgents.players[id], tuning?.[id]) })),
    catalog: Object.fromEntries((playbooks as ComposedConfig["playbooks"]).map((playbook) => {
      const block = composed.captainOptions.playbooks[playbook.id];
      return [playbook.id, {
        id: playbook.id, from: isAbsolute(playbook.from) ? pathToFileURL(playbook.from).href : playbook.from,
        manifestCommand: playbook.manifestCommand,
        command: playbook.command, intent: playbook.intent,
        artifactSchema: playbook.artifactSchema,
        requiredRoleIds: playbook.requiredRoleIds,
        concurrentRoleSets: playbook.concurrentRoleSets,
        // A role's provider call is built from its binding, so a tuned
        // player must reach every binding naming it — patching the
        // player's own block alone changes nothing at call time.
        roles: Object.fromEntries(Object.entries(block.roles).map(([role, binding]) =>
          [role, tuned(binding, tuning?.[binding.playerId])])),
        options: { ...block.options, ...(playbook.acceptsCwdOption ? {cwd} : {}) },
      }];
    })),
  });
}

/** Name every structural field whose change makes the current projection
 * incompatible with the stored one — Playbook's own refusal names none
 * (core-service-92). */
export function describeStructuralDrift(stored: SessionStructuralProjection, current: SessionStructuralProjection): string[] {
  const changes: string[] = [];
  const agentDrift = (who: string, before: Record<string, unknown>, after: Record<string, unknown>): void => {
    for (const field of ["adapter", "instruction", "permissions"]) {
      if (!isDeepStrictEqual(before[field], after[field])) changes.push(i18n._({
        id: "{who}'s {field} changed",
        comment:
          "One settings drift; `who` is itself a message and `field` the config file's own field name",
        values: { who, field },
      }));
    }
  };
  agentDrift(i18n._({
    id: "the Captain",
    comment: "The session's Captain, named inside a settings-drift line",
  }), stored.captain, current.captain);
  const currentPlayers = current.players.map((player) => player as Record<string, unknown>);
  stored.players.forEach((entry, index) => {
    const before = entry as Record<string, unknown>;
    const after = currentPlayers.find((player) => player.id === before.id);
    if (!after) changes.push(i18n._({
      id: "player {playerId} is gone",
      comment: "One settings drift: a stored player left the config",
      values: { playerId: String(before.id) },
    }));
    else {
      agentDrift(playerNamed(String(before.id)), before, after);
      if (currentPlayers[index]?.id !== before.id) changes.push(i18n._({
        id: "player {playerId} changed its place in the roster",
        comment: "One settings drift: the players' order changed",
        values: { playerId: String(before.id) },
      }));
    }
  });
  for (const player of currentPlayers) {
    if (!stored.players.some((entry) => (entry as {id: unknown}).id === player.id)) changes.push(i18n._({
      id: "player {playerId} joined the roster",
      comment: "One settings drift: the config added a player",
      values: { playerId: String(player.id) },
    }));
  }
  for (const [id, before] of Object.entries(stored.catalog as Record<string, Record<string, unknown>>)) {
    const after = (current.catalog as Record<string, Record<string, unknown>>)[id];
    if (!after) { changes.push(playbookGone(id)); continue; }
    for (const field of ["from", "manifestCommand", "command", "intent", "artifactSchema", "requiredRoleIds", "concurrentRoleSets", "options"]) {
      if (!isDeepStrictEqual(before[field], after[field])) changes.push(i18n._({
        id: "playbook {playbookId}'s {field} changed",
        comment:
          "One settings drift; `field` is the manifest's own field name",
        values: { playbookId: id, field },
      }));
    }
    const beforeRoles = (before.roles ?? {}) as Record<string, {playerId?: unknown}>;
    const afterRoles = (after.roles ?? {}) as Record<string, {playerId?: unknown}>;
    for (const [role, binding] of Object.entries(beforeRoles)) {
      const now = afterRoles[role]?.playerId;
      if (now !== binding.playerId) changes.push(i18n._({
        id: "playbook {playbookId}'s {role} role now binds {player} instead of {before}",
        comment:
          "One settings drift: a role changed lanes; the ids are the config file's own",
        values: {
          playbookId: id,
          role,
          player: now === undefined || now === null
            ? i18n._({ id: "no one", comment: "Stands where a role binds no player at all" })
            : String(now),
          before: String(binding.playerId),
        },
      }));
    }
  }
  for (const id of Object.keys(current.catalog)) {
    if (!(id in stored.catalog)) changes.push(i18n._({
      id: "playbook {playbookId} joined the session",
      comment: "One settings drift: the config enabled another playbook",
      values: { playbookId: id },
    }));
  }
  return changes.length ? changes : [i18n._({
    id: "the session's structure no longer matches its stored one",
    comment: "The settings drift where no single field names itself",
  })];
}

/** A project's current conversation (core-service-93, DR-051): its live
 * session, else the most recently active owned one that continues or
 * still carries a recovery boundary. */
export function currentSession(sessions: SessionInfo[], projectId: string): SessionInfo | undefined {
  const own = sessions.filter((session) => session.projectId === projectId);
  return own.find((session) => session.live) ?? own
    .filter((session) => !session.externalWriter &&
      (session.continuable || session.recovery))
    .sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt))[0];
}

export class SessionManager {
  private readonly store: Store;
  private readonly loadModule: LoadModule;
  private readonly live = new Map<string, LiveSession>();
  // Settlement outlives the runtime: admission must also wait for the
  // released checkpoint's refreshed metadata and publication.
  private readonly settling = new Map<string, {projectId: string; done: Promise<void>}>();
  private readonly opening = new Set<string>();
  private readonly recovering = new Set<string>();
  /** Sessions whose active turn is being stopped intentionally. */
  private readonly intentionalStops = new Set<string>();
  private readonly now: () => number;
  onRecord: (envelope: RecordEnvelope) => void = () => {};
  onSessionState: (session: SessionInfo) => void = () => {};
  onLedgerChange: (projectId: string) => void = () => {};
  /** Local turn completion, after release and the durable read model agree. */
  onTurnSettled: (
    sessionId: string,
    turnId: number,
    intentId?: string,
    control?: TurnControlKind,
  ) => void = () => {};

  constructor(private readonly options: SessionManagerOptions) {
    this.store = options.store;
    this.loadModule = options.loadModule ?? ((specifier) => import(specifier));
    this.now = options.now ?? Date.now;
  }

  listSessions(): SessionInfo[] {
    return this.store.listSessions().map((session) => {
      const live = this.live.get(session.id);
      const settling = this.settling.has(session.id);
      return {...session, ...(live ? {externalWriter:undefined} : {}), live: !!live || session.live, turnActive: (live?.turnActive ?? (session.live ? session.turnActive ?? false : false)) || settling};
    });
  }
  /** One lane per project: its current or recovery-bound conversation
   * (core-service-93, core-service-107). */
  listLanes(): { sessionId: string; projectId: string; turnActive: boolean; settling: boolean }[] {
    const sessions = this.listSessions();
    const lanes: { sessionId: string; projectId: string; turnActive: boolean; settling: boolean }[] = [];
    for (const projectId of new Set(sessions.map((session) => session.projectId))) {
      // An aborted/failed conversation remains the queue's lane while
      // its recovery boundary stands, even though it cannot continue a
      // normal message yet. That is what lets the queue name the stop or
      // failure instead of presenting an unqualified Start.
      const current = currentSession(sessions, projectId);
      if (current) lanes.push({sessionId: current.id, projectId, turnActive: current.turnActive ?? false, settling: this.settling.has(current.id)});
    }
    return lanes;
  }
  getLive(sessionId: string): LiveSession | undefined { return this.live.get(sessionId); }
  /** Wait out a settling turn's release, so a caller sees the session
   * either held or released — never in between (core-service-91). */
  async settled(sessionId: string): Promise<void> {
    await this.settling.get(sessionId)?.done;
  }
  /** Wait out every release in flight across a project's sessions. */
  async projectSettled(projectId: string): Promise<void> {
    for (const entry of this.settling.values()) {
      if (entry.projectId === projectId) await entry.done;
    }
  }

  async createSession(project: ProjectInfo, composed: ComposedConfig): Promise<SessionInfo> {
    return this.open(project, composed, randomUUID(), "new");
  }
  async continueSession(project: ProjectInfo, composed: ComposedConfig, session: SessionInfo): Promise<SessionInfo> {
    return this.open(project, composed, session.id, "continue");
  }
  async retrySession(project: ProjectInfo, sessionId: string): Promise<void> {
    await this.open(project, undefined, sessionId, "retry");
    this.startTurn(this.requireLive(sessionId), undefined, true);
  }
  async discardSession(sessionId: string): Promise<{removed: boolean}> {
    if (this.live.has(sessionId) || this.recovering.has(sessionId)) throw new CoreError("busy", i18n._({
      id: "the session is active",
      comment: "Refusal: the session is held, so it cannot be discarded now",
    }));
    const info = this.store.describeSession(sessionId);
    if (!info) throw new CoreError("not_found", i18n._({
      id: "no session {sessionId}",
      comment: "Refusal: no session of this id is known",
      values: { sessionId },
    }));
    this.recovering.add(sessionId);
    try {
      const restored = await discardSessionUncertain(this.store.sessionStore(), sessionId);
      if (!restored) this.store.forgetSession(sessionId);
      else { await this.store.refreshSession(sessionId, false); this.publish(sessionId); }
      this.onLedgerChange(info.projectId);
      return {removed: !restored};
    } catch (error) { throw this.failure(error); }
    finally { this.recovering.delete(sessionId); }
  }

  private async open(project: ProjectInfo, composed: ComposedConfig | undefined, sessionId: string, mode: "new" | "continue" | "retry"): Promise<SessionInfo> {
    // One working turn per project (core-service-4, DR-051): only a
    // session whose runtime is held — a turn in flight or settling — or
    // one another host holds stands in the way, and it is named. A
    // sibling mid-release is waited out first.
    await this.projectSettled(project.id);
    const holder = this.store.listSessions().find((session) => session.projectId === project.id && (session.live || session.externalWriter));
    if (this.opening.has(project.id)) throw new CoreError("busy", i18n._({
      id: "a session is starting in {project} — wait a moment",
      comment: "Refusal: another session of this project is opening",
      values: { project: project.name },
    }));
    if (holder) {
      const name = holder.title
        ? i18n._({
            id: "“{title}”",
            comment: "A session's own title, quoted",
            values: { title: holder.title },
          })
        : i18n._({
            id: "a session",
            comment: "Stands in for the title of a session that has none",
          });
      throw new CoreError("busy", holder.externalWriter
        ? i18n._({
            id: "{name} is in use elsewhere in {project}",
            comment: "Refusal: another host holds this project's conversation",
            values: { name, project: project.name },
          })
        : i18n._({
            id: "{name} is still working in {project} — wait for it to finish, or abort it",
            comment: "Refusal: one working turn per project",
            values: { name, project: project.name },
          }));
    }
    if (this.recovering.has(sessionId)) throw new CoreError("busy", i18n._({
      id: "the session is recovering",
      comment: "Refusal: a Retry or Discard of this session is still running",
    }));
    this.opening.add(project.id);
    this.store.setLocalSession(sessionId, true);
    let entry: LiveSession | undefined;
    let controller: SessionHostController | undefined;
    try {
      // A continued session takes the current config projected onto its
      // stored members, and drift is named before the runtime opens —
      // never after the provider hints are consumed (core-service-92).
      const stored = composed && mode === "continue" ? await this.storedStructure(sessionId) : undefined;
      const members = stored ? storedMembers(stored) : undefined;
      const config = composed ? executionConfig(composed, project.path, members, this.store.sessionAgentSettings(sessionId)) : undefined;
      if (stored && config) {
        try { assertCaptainSessionExecutionCompatible(stored, config); }
        catch { throw new SettingsDriftError(describeStructuralDrift(stored, projectCaptainSessionStructure(config))); }
      }
      const memberPlaybooks = composed ? composed.playbooks.filter((playbook) => !members || members.playbookIds.includes(playbook.id)) : [];
      const graphs = composed ? await Promise.all(memberPlaybooks.map(async (playbook) => ({
        playbookId: playbook.id, graph: (await resolveArtifacts(playbook, this.options.env)).machine ?? null,
      }))) : undefined;
      const initialVisible = composed ? composed.initialVisible.filter((id) => !members || members.playerIds.includes(id)) : undefined;
      const fixture = composed && this.options.captainFactory ? await this.options.captainFactory(composed, sessionId) : undefined;
      controller = await openSessionHost({
        store: this.store.sessionStore(), sessionId, mode, cwd: project.path,
        ...(config ? {config} : {}), loadModule: this.loadModule,
        ...(graphs ? {graphs} : {}),
        ...(initialVisible ? {initialVisible} : {}),
        ...(this.options.adapterImports ? {adapterImports: this.options.adapterImports} : {}),
        // Tests may narrate records before the real shell turn. Only the
        // shell supplies the reply, journal and durable settlement.
        ...(fixture ? {createHostRuntime: async (input: Parameters<typeof createTmuxPlayRuntime>[0]) => {
          const shell = input.captain;
          return createTmuxPlayRuntime({...input, captain: {
            async init(session) { await shell.init?.(session); await fixture.init?.(session); },
            async handleBossTurn(turn,context) {
              await fixture.handleBossTurn(turn,{...context, emitReply: async () => {}});
              await shell.handleBossTurn(turn,context);
            },
            async prepareDispose() { await fixture.prepareDispose?.(); await shell.prepareDispose?.(); },
            async dispose() { await fixture.dispose?.(); await shell.dispose?.(); },
            // core-service-98: the control surfaces are the real shell's,
            // and a wrapper that forwarded only the turn members hid them
            // — the notice then drew controls every activation refused.
            // Forwarded by feature detection, so an older shell that
            // publishes none still advertises none.
            ...controlSurfaces(shell),
          }});
        }} : {}),
        onStoredRecord: async (record) => {
          this.record(sessionId, record, entry);
          const result = record.record.type === "captain_finished" ? record.record.result as {status?: string; error?: string; finalText?: string} : undefined;
          // English, deliberately (core-service-111): the page matches
          // this record's text to phrase the failure itself, and the
          // reason is the runtime's own words.
          if (entry && result?.status === "error") await this.appendError(entry, `The Captain's turn failed: ${result.error ?? result.finalText ?? "unknown error"}`);
        },
        onCheckpoint: async () => {
          await this.store.refreshSession(sessionId, true);
          if (entry) this.publish(sessionId);
        },
      });
      await this.store.refreshSession(sessionId, true);
      const info = this.store.describeSession(sessionId);
      // English, deliberately (core-service-111): the shared store just
      // wrote this session, so an unreadable one is an internal failure.
      if (!info) throw new Error("shared session has no readable project history");
      entry = {info, controller, runtime: controller.host, seq: this.store.maxSeq(sessionId), turnActive: false};
      this.live.set(sessionId, entry);
      this.publish(sessionId);
      return {...info, live:true, turnActive:false};
    } catch (error) {
      if (controller) await controller.dispose();
      this.store.setLocalSession(sessionId, false);
      if (error instanceof SettingsDriftError) throw new CoreError("invalid_config", error.message);
      throw this.failure(error, mode === "new" ? "invalid_config" : "invalid_request");
    } finally { this.opening.delete(project.id); }
  }

  /** The stored structural projection of a schema-7 checkpoint, when it has one. */
  async storedStructure(sessionId: string): Promise<SessionStructuralProjection | undefined> {
    try {
      const manifest = await this.store.sessionStore().readManifest(sessionId) as {schemaVersion?: unknown; structuralProjection?: SessionStructuralProjection};
      return manifest.schemaVersion === 7 ? manifest.structuralProjection : undefined;
    } catch { return undefined; }
  }

  /** The runtime is held only for a turn (core-service-91): once the
   * checkpoint has settled, release it — the Playbook lease with it —
   * keeping the provider hints settlement wrote. Unresolved repository
   * effects hold nothing: Playbook's restore installs their fence, and
   * the controls that fence advertises are captured first (DR-074). */
  private async releaseAtSettle(entry: LiveSession): Promise<void> {
    const id = entry.info.id;
    let recovery: {state?: string} | undefined;
    try { recovery = await entry.controller.read(); } catch { recovery = undefined; }
    if (recovery?.state !== "settled") return;
    this.captureParkedRun(entry);
    try {
      await entry.controller.dispose();
      this.live.delete(id);
      this.store.setLocalSession(id, false);
    } catch (error) {
      console.error(`spex: runtime release failed; ownership retained: ${String(error)}`);
    }
  }

  private record(sessionId: string, entry: ReplayStreamEntry, live?: LiveSession): void {
    if (entry.seq <= this.store.maxSeq(sessionId)) return;
    const record = entry.record as unknown as TmuxPlayRecord;
    this.store.appendRecord(sessionId, entry.seq, record, entry.role);
    this.store.foldStoredRecord(sessionId, record);
    if (live) live.seq = entry.seq;
    if (record.type === "turn_started" && live?.pendingIntentId) {
      const turn = (record as {turn: {id: number}}).turn;
      this.store.stampIntentDispatch(live.pendingIntentId, sessionId, turn.id, record.timestamp);
      live.pendingIntentId = undefined;
    }
    if (record.type === "turn_started" && live) {
      const owner = this.store.listSessionDispatches(sessionId).at(-1);
      live.turnIntentId = owner?.open ? owner.intentId : undefined;
    }
    this.onRecord({sessionId, seq: entry.seq, record, hidden: entry.record.visibility === "hidden", ...(entry.role ? {role:entry.role} : {})});
    if (live) {
      this.publish(sessionId);
      this.onLedgerChange(live.info.projectId);
    }
  }

  private async appendError(entry: LiveSession, message: string): Promise<void> {
    const afterSeq = this.store.maxSeq(entry.info.id);
    await entry.controller.lease.append({type:"runtime_error", turnId:null, timestamp:this.now(), message});
    const added = await entry.controller.lease.readStream({afterSeq});
    for (const item of added.entries) this.record(entry.info.id, item, entry);
  }

  /** Persist which kind of control produced a turn. The Captain's
   * ordinary turn record carries only the control label, which is not
   * enough to distinguish recovery from ending after a restart. */
  private async appendControl(
    entry: LiveSession,
    turnId: number,
    kind: TurnControlKind,
  ): Promise<void> {
    const afterSeq = this.store.maxSeq(entry.info.id);
    await entry.controller.lease.append(controlRecord(turnId, kind, this.now()));
    const added = await entry.controller.lease.readStream({ afterSeq });
    for (const item of added.entries) this.record(entry.info.id, item, entry);
  }

  /** What the opened shell advertises now (core-service-98): the
   * parked leaf's own actions for a recovery, the shell's own controls
   * for an ending. An unreadable control view advertises nothing
   * rather than failing in a way a notice cannot explain. Fields the
   * installed runtime does not report are simply absent. */
  private advertised(entry: LiveSession, kind: "recovery" | "ending"): ParkedRunAction[] {
    const controller = entry.controller as {
      listRuntimeActions?(): readonly Partial<ParkedRunAction>[];
      listShellActions?(): readonly Partial<ParkedRunAction>[];
    };
    let offered: readonly Partial<ParkedRunAction>[] = [];
    try {
      offered = (kind === "recovery" ? controller.listRuntimeActions?.() : controller.listShellActions?.()) ?? [];
    } catch { offered = []; }
    return offered.flatMap((action) => typeof action?.id === "string" && typeof action.label === "string" ? [{
      id: action.id, label: action.label,
      ...(action.standing ? {standing: action.standing} : {}),
      ...(action.reason ? {reason: action.reason} : {}),
    }] : []);
  }

  /** The parked run's advertised controls, read at settlement while the
   * shell is still held — the only moment they can be read without
   * opening the session — and kept with the local preferences, so the
   * summary carries them after a restart (core-service-32, DR-074). A
   * settlement that finds no run parked leaves no reading behind. */
  private captureParkedRun(entry: LiveSession): void {
    const id = entry.info.id;
    const conditions = foldConditions(this.store.getRecords(id));
    const reason = conditions.failure ? "failure" as const : conditions.question ? "question" as const : undefined;
    const actions = reason ? this.advertised(entry, "recovery") : [];
    const ending = reason ? this.advertised(entry, "ending")[0] : undefined;
    try {
      this.store.setParkedRun(id, reason && (actions.length > 0 || ending)
        ? {reason, actions, ...(ending ? {ending: {id: ending.id, label: ending.label}} : {})}
        : undefined);
    } catch (error) {
      console.error(`spex: parked-run controls not recorded: ${String(error)}`);
    }
  }

  /** core-service-98: run one advertised control as the next turn. */
  submitControl(sessionId: string, kind: "recovery" | "ending", actionId?: string): void {
    const entry = this.requireLive(sessionId);
    if (entry.turnActive) throw new CoreError("busy", i18n._({
      id: "a turn is already running in this session",
      comment: "Refusal: this conversation is mid-turn",
    }));
    if (this.store.describeSession(sessionId)?.recovery) throw new CoreError("invalid_request", i18n._({
      id: "Recover the interrupted turn with Retry or Discard first",
      comment: "Refusal; Retry and Discard are the controls the interface offers",
    }));
    // The runtime is held only for a turn (core-service-91), so what a
    // run advertises can be read only while the session is open — which
    // it is by the time this runs. The named control is validated here,
    // at activation, against what the opened shell advertises now,
    // never against the reading the client held.
    const offered = this.advertised(entry, kind);
    const control = actionId === undefined ? offered[0] : offered.find((action) => action.id === actionId);
    if (!control) {
      throw new CoreError(
        "invalid_request",
        actionId !== undefined
          ? kind === "recovery"
            ? i18n._({
                id: "This run no longer offers “{actionId}”.",
                comment:
                  "Refusal: the recovery the reader activated is no longer advertised; the id is the runtime's own",
                values: { actionId },
              })
            : i18n._({
                id: "This session no longer offers “{actionId}” to end its run.",
                comment:
                  "Refusal: the ending the reader activated is no longer advertised; the id is the runtime's own",
                values: { actionId },
              })
          : kind === "recovery"
            ? i18n._({
                id: "This run offers no recovery to rerun.",
                comment: "Refusal: the run advertises no recovery action",
              })
            : i18n._({
                id: "This session offers no way to end its run.",
                comment: "Refusal: the run advertises no ending action",
              }),
      );
    }
    this.startTurn(entry, undefined, false, { kind, controlId: control.id });
  }

  /** The same control, awaited to its settlement (DR-073): a caller that
   * rules on what the control did — the Drop that ends a parked run
   * before it records its verdict — reads a settled session. */
  async runControl(sessionId: string, kind: "recovery" | "ending", actionId?: string): Promise<void> {
    this.submitControl(sessionId, kind, actionId);
    await this.live.get(sessionId)?.operation;
    await this.settled(sessionId);
  }

  submitTurn(sessionId: string, text: string, intentId?: string): void {
    const entry = this.requireLive(sessionId);
    if (entry.turnActive) throw new CoreError("busy", i18n._({
      id: "a turn is already running in this session",
      comment: "Refusal: this conversation is mid-turn",
    }));
    if (this.store.describeSession(sessionId)?.recovery) throw new CoreError("invalid_request", i18n._({
      id: "Recover the interrupted turn with Retry or Discard first",
      comment: "Refusal; Retry and Discard are the controls the interface offers",
    }));
    entry.pendingIntentId = intentId;
    this.startTurn(entry, text, false);
  }

  private startTurn(entry: LiveSession, text: string | undefined, retry: boolean, control?: { kind: "recovery" | "ending"; controlId: string }): void {
    const owner = this.store.listSessionDispatches(entry.info.id).at(-1);
    entry.turnIntentId = retry && owner?.open ? owner.intentId : undefined;
    entry.turnActive = true;
    this.publish(entry.info.id);
    entry.operation = (async () => {
      let failed = false;
      try {
        if (retry) await entry.controller.retry();
        else if (control) {
          const controller = entry.controller as {
            submitRuntimeAction(id: string): Promise<unknown>;
            submitShellAction(id: string): Promise<unknown>;
          };
          await (control.kind === "recovery"
            ? controller.submitRuntimeAction(control.controlId)
            : controller.submitShellAction(control.controlId));
          const turnId = this.store.listTurns(entry.info.id).at(-1)?.turnId;
          if (turnId !== undefined) await this.appendControl(entry, turnId, control.kind);
        } else await entry.controller.handleBossTurn(text!);
      } catch (error) {
        failed = true;
        // The runtime reports an intentional stop through the same
        // rejected promise as a fault, after durably ending its turn as
        // aborted. Its stopped outcome is sufficient evidence; recording
        // a runtime_error as well would misclassify it as failure.
        const stopped = this.intentionalStops.has(entry.info.id);
        if (!stopped) {
          try { await this.appendError(entry, error instanceof Error ? error.message : String(error)); }
          catch { /* The lifecycle retains incomplete evidence and ownership. */ }
        }
      } finally {
        entry.turnActive = false;
        entry.pendingIntentId = undefined;
        const turnId = this.store.listTurns(entry.info.id).at(-1)?.turnId;
        const intentId = entry.turnIntentId;
        // Register before cleanup starts, including the failed/aborted
        // path, and keep the barrier after cleanup removes the runtime.
        const done = Promise.resolve().then(async () => {
          if (failed) {
            try { await entry.controller.dispose(); this.live.delete(entry.info.id); this.store.setLocalSession(entry.info.id, false); }
            catch (error) { console.error(`spex: session cleanup failed; ownership retained: ${String(error)}`); }
          } else {
            await this.releaseAtSettle(entry);
          }
          await this.store.refreshSession(entry.info.id, this.live.has(entry.info.id));
          this.publish(entry.info.id);
          this.onLedgerChange(entry.info.projectId);
        });
        this.settling.set(entry.info.id, {projectId: entry.info.projectId, done});
        try { await done; }
        finally {
          this.settling.delete(entry.info.id);
          this.intentionalStops.delete(entry.info.id);
        }
        if (!failed && turnId !== undefined) {
          this.onTurnSettled(entry.info.id, turnId, intentId, control?.kind);
        }
      }
    })().catch((error) => console.error(`spex: session state refresh failed: ${String(error)}`));
  }

  abortTurn(sessionId: string): boolean {
    const entry = this.requireLive(sessionId);
    if (!entry.turnActive) return false;
    this.stopActiveTurn(entry, BOSS_ABORT_REASON);
    return true;
  }

  private stopActiveTurn(entry: LiveSession, reason: string): void {
    this.intentionalStops.add(entry.info.id);
    try {
      (entry.runtime.abortActiveTurn as (reason?: string) => void)(reason);
    } catch (error) {
      this.intentionalStops.delete(entry.info.id);
      throw error;
    }
  }

  async disposeSession(sessionId: string): Promise<void> {
    if (!this.live.has(sessionId) && this.settling.has(sessionId)) {
      await this.settled(sessionId);
      return;
    }
    const entry = this.requireLive(sessionId);
    if (entry.turnActive) {
      this.stopActiveTurn(entry, CORE_STOP_REASON);
    }
    await entry.operation;
    // The turn's own settlement may have released the runtime already.
    if (!this.live.has(sessionId)) return;
    await entry.controller.dispose();
    this.live.delete(sessionId);
    this.store.setLocalSession(sessionId, false);
    await this.store.refreshSession(sessionId, false);
    this.publish(sessionId);
    this.onLedgerChange(entry.info.projectId);
  }
  async disposeAll(): Promise<void> {
    const ids = new Set([...this.live.keys(), ...this.settling.keys()]);
    const results = await Promise.allSettled([...ids].map((id) => this.disposeSession(id)));
    const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (failures.length) throw new AggregateError(failures, "session cleanup failed");
  }
  private publish(sessionId: string): void {
    const session = this.store.describeSession(sessionId);
    const entry = this.live.get(sessionId);
    if (session) this.onSessionState({...session, ...(entry ? {externalWriter:undefined} : {}), live:!!entry, turnActive:entry?.turnActive ?? false});
  }

  private requireLive(sessionId: string): LiveSession {
    const entry = this.live.get(sessionId);
    if (!entry) throw new CoreError("not_found", i18n._({
      id: "no live session {sessionId}",
      comment: "Refusal: the session named holds no runtime right now",
      values: { sessionId },
    }));
    return entry;
  }
  private failure(error: unknown, fallback: CoreError["code"] = "invalid_request"): CoreError {
    if (error instanceof CoreError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new CoreError(/lease|already active|already held|owned by/.test(message) ? "busy" : /structur|execution config|catalog.*(changed|mismatch)|players.*(changed|mismatch)/i.test(message) ? "invalid_config" : fallback, message);
  }
}
