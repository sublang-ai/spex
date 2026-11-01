// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core service: config lifecycle (load/seed/watch, CORE-2/3),
// WebSocket endpoint with hello/version handshake (CORE-1) — a
// loopback socket by default, or attached to a shell-supplied HTTP
// server (DR-033) — command dispatch with schema validation
// (CORE-13), and record channels filtered by visibility at this
// boundary (CORE-8/14).

import { canonicalOrigin } from "@sublang/spex/instance";
import { AppletServer, isAppletPath } from "./applets.js";
import { ApprovalBroker } from "./approvals.js";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir, hostname, tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { resolveMachineIdentity } from "@sublang/playbook/machine-identity";
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type { Duplex } from "node:stream";

import {
  checkAdapterReadiness,
  checkAdapterRuntime,
  composeConfig,
  createModuleLoader,
  isValidRegistryEntry,
  loadConfig,
  missingPlayersOf,
  relocateLegacyConfig,
  resolveFormerConfigPaths,
  isSeedRecord,
  reseedConfig,
  SEED_PREF,
  seedConfig,
  summarizeConfig,
  validateProjectConfig,
  type ComposedConfig,
  type AdapterRuntimeCheck,
  type LoadModule,
  type PlaybookModules,
} from "./config.js";
import {
  adapterNameSchema,
  CAPTAIN_AGENT_ID,
  parseCommand,
  PACKAGE_LICENSE_PATTERN,
  PROTOCOL_VERSION,
  type AdapterName,
  type Channel,
  type Command,
  type ConfigState,
  type ForgeState,
  type MediaUploadOwner,
  type ReadinessEntry,
  type ServerMessage,
  type SessionAgentSettings,
  type SessionInfo,
  type SessionAgentSettingsMap,
} from "./protocol.js";
import { resolveLanguage, type Language } from "./language.js";
import { i18n, speak } from "./i18n.js";
import { CoreError, SessionManager, assertRunsHere, currentSession, executionConfig, runsElsewhereRefusal, runsNowhereRefusal, storedMembers, type CaptainFactory, type RecordEnvelope } from "./session.js";
import { closedStats, foldConditions, foldLedger, intentTitle, queueSchedule, wasWorked } from "./ledger.js";
import { CORE_STOP_REASON, runsElsewhere, type TurnControlKind } from "./control-record.js";
import { StartedProcesses, StopBound } from "./process-tree.js";
import { readStoredLanguage, Store, type SpexRepository } from "./store.js";
import { UPLOAD_STAGING } from "./storage-git.js";
import { foldDiagnostics, StorageFormatError, type RepairChecked, type StorageDiagnostic } from "./app-storage.js";
import { fileVersion, listed, readVersioned, UUID, VersionConflictError, writeApplicationBytes } from "@sublang/spex/files";
import { prepareStorageGitFiles } from "./storage-git.js";
import {
  GitHubForgeAdapter,
  InitialCommitRefusal,
  createProjectRepo,
  seedExampleProject,
  defaultRunCommand,
  isWorkTreeRoot,
  isSeededAcademyProject,
  repoStatus,
  type ForgeAdapter,
  type RunCommand,
} from "./forge.js";
import {
  applyConfigOp,
  editConfigFile,
  editProjectConfigFile,
  rewriteLibraryPaths,
  type AgentBlock,
  type ConfigEditOp,
} from "./config-edit.js";
import { migrateManagedLibraryConfig } from "./config-migrate.js";
import { resolveArtifacts } from "./artifacts.js";
import { builtinPackage, loadBuiltinCatalog } from "./builtins.js";
import { AuthorManager } from "./authoring.js";
import { authoringLanguage, authoringManifest, DraftStore, isDraftPackagePath, newPackageDefaults, packageFolderFor } from "./drafts.js";
import { EnvironmentManager, toRequest } from "./environments.js";
import {
  INSTALL_RECORD,
  installedDir,
  isGitSource,
  isPathSource,
  isKebabName,
  isSkillName,
  playbookModuleCandidates,
  prepareBuiltinEnvironment,
  readManifest,
  writeExcludeBlock,
  type BuiltinPackage,
} from "@sublang/spex/environment";
import { splitKey } from "./home.js";
import type { AssignedRuntime, CommandResults, IntentInfo, InvalidPlaybookEntry, PlaybookAvailability, ProjectInfo, PublishPreview, RoleBindingSummary } from "./protocol.js";
import {
  parseSpecTree,
  readRecordCommitTimes,
  readSpecFile,
  resolveSpecPath,
  writeSpecFile,
} from "./specs.js";
import { ArtifactFolderBusy, canonicalFolder, checkToolchain, compilePlaybook, compilerAgentOf, ENGINE_LINKS_EXCLUDE, type CompileResult, type LineSpawner, type ToolchainRuntime } from "./compile.js";
import { browserAgent } from "./browser.js";
import { ApplicationMedia } from "./media.js";
import { MediaTransferError } from "./media-transfers.js";
import { readAgentOptions, type AgentModelDiscovery } from "./agent-options.js";
import { DEFAULT_ADAPTER_IMPORTS } from "./agent-runtime.js";
import { canonicalHost, codeCredentialsPath, codeCredentialStore, isAdapterName, type AgentCredential, type CodeCredentialStore, type HostCredential } from "./code-credentials.js";
import { AGENT_CREDENTIAL_FORMS, SeatEnvironment, seatAdapterImports, seatCredentialHalf, type SeatCredentialSources } from "./seat-credentials.js";
import { RegistryManager } from "./registry.js";
import { SpaceManager, type SpaceHost, type SpaceStepEvent } from "./space.js";
import { Places } from "./places.js";
import { GitHostClient, SEAT_ID_MAX, fileCredentialStore } from "@sublang/spex/git-host";
import { relayHostError } from "./space-groups.js";
import { currentRuntime, withGitCredential } from "./git-credential.js";
import { configureSeatGit } from "./seat-git.js";
import { displayRemote, validateRemoteUrl } from "./space-git.js";
import { isFastModeSupported, isSubagentModelSupported } from "@sublang/cligent";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";

const CORE_VERSION = "0.1.0";

export interface CoreServiceOptions {
  /** Shared config path; defaults to the XDG playbook location. */
  configPath?: string;
  /**
   * The Spex home (DR-036, DR-103); unset runs on a scratch home removed
   * at stop (callers should set it). Shells resolve `${SPEX_HOME:-~/.spex}`.
   */
  dataDir?: string;
  /** A legacy SQLite store the shell hands over for the one-time
   * import (core-service-64); the file is left in place, marked
   * `<store>.imported` beside itself once a root has taken it. */
  legacyDbPath?: string;
  /** This machine's identity for the root lease (core-service-61);
   * resolved through Playbook's facade when unset. */
  machineIdentity?: string;
  /** A legacy compiled-playbook library to relocate into the root,
   * with config `from` paths rewritten (core-service-64). */
  legacyLibraryDir?: string;
  port?: number;
  /**
   * A shell-supplied HTTP(S) server to attach the WebSocket endpoint
   * to (DR-033). The shell owns binding, TLS, and the server's
   * lifecycle; `port` is ignored, and `port()` reports the attached
   * server's bound port once the shell listens.
   */
  httpServer?: HttpServer | HttpsServer;
  loadModule?: LoadModule;
  adapterImports?: PlayerAdapterImports;
  /**
   * Injectable runtime half of adapter readiness (DR-024); defaults to
   * the cligent-derived check. Tests faking `adapterImports` fake this
   * too, for the same reason: the host machine's installed runtimes must
   * not decide a hermetic verdict.
   */
  adapterRuntime?: (
    adapter: AdapterName,
  ) => AdapterRuntimeCheck | Promise<AdapterRuntimeCheck>;
  /** Substitute only discovery; real Cligent capabilities remain composed. */
  discoverAgentModels?: AgentModelDiscovery;
  captainFactory?: CaptainFactory;
  env?: NodeJS.ProcessEnv;
  home?: string;
  /** Disable the config file watcher (tests drive reload directly). */
  watchConfig?: boolean;
  /** Injectable external-command runner (git/gh; tests stub this). */
  runCommand?: RunCommand;
  forgeAdapter?: ForgeAdapter;
  /** The shell's own scaffold CLI on its own executable (projects-31);
   * unset, the create flow runs the registry's and names it. */
  scaffoldCommand?: string[];
  /** Variables that command runs under: Electron's run-as-Node one. */
  scaffoldEnv?: Record<string, string>;
  /** Compiled-playbook library directory (DR-005). */
  libraryDir?: string;
  /**
   * Handshake token required on the WS URL (?token=). Unset or empty
   * defaults to a random value — a blank secret would disable the
   * handshake — and embedding shells pass it to the UI. Foreign
   * browser origins are rejected regardless.
   */
  token?: string;
  /** Injectable line-streaming spawner for compile runs (tests). */
  compileSpawner?: LineSpawner;
  /** Where compiles run: the shell's own runtime and the module tree
   * it declares the compiler in (playbook-library-11). */
  compileRuntime?: ToolchainRuntime;
  /**
   * The reader's system languages, as the embedding shell knows them
   * (core-service-111, localization-2): the desktop shell passes the
   * operating system's preferred languages, since its OS is the
   * reader's device. With none passed — a served core, whose page may
   * sit elsewhere — the core reads its own process locale.
   */
  systemLanguages?: readonly string[];
  /** Test seam (space-32): the Space transport limit; 120 s by default. */
  spaceTransportTimeoutMs?: number;
  /** Test seam (git-host-21): the longest the Git host's rate limit
   * holds its calls; 120 s by default. */
  hostHoldMaxMs?: number;
  /** Test seam: awaited before each Space step runs, and inside Save
   * between its validation and its commit (`at: "commit"`), so a suite can
   * act between them deterministically; a placement's step names that
   * placement, and the catch-up's push is marked `at: "catch-up"`
   * (space-12). */
  spaceBeforeStep?: (event: SpaceStepEvent) => void | Promise<void>;
  /** Test seam: awaited as a session's own lifecycle publishes its state
   * — at a turn's acceptance and at the checkpoint that marks the turn
   * begun, before the runtime has begun it — so a suite can hold a turn
   * in that window (core-service-6). */
  sessionStatePublished?: (session: import("./protocol.js").SessionInfo) => void | Promise<void>;
  /** Your own group's folder name for a new home; this device's user
   * name by default (storage-2). */
  own?: string;
  /** The Git host's sign-in flow this deployment runs: `browser` on the
   * desktop (git-host-2), `device` on the server shell (git-host-3), the
   * default. */
  signIn?: "browser" | "device";
  /** The runtime the Git credential helper runs on (git-host-9): the
   * shell's own executable, Electron's run as Node; this process's by
   * default. */
  hostRuntime?: { execPath: string; electron: boolean };
  /** The built-in spec package this app ships (environments-11): the
   * build's staged one by default; null ships none. A test seam. */
  builtinPackage?: BuiltinPackage | null;
  /** Your agents' home folders' root, where your own group's skills are
   * exported (environments-8); null writes none. By default the given
   * `home`, or this user's home for the default Spex home at `~/.spex`;
   * a home elsewhere exports nothing there, so a scratch home never
   * writes into the person's real agent folders. */
  userHome?: string | null;
  /** The registry's fetch (environments-12); a test seam. */
  registryFetch?: typeof fetch;
  /** The stop's bounds (core-service-39, DR-134): from the stop's start
   * to SIGTERM unless every turn settles first, 10 s by default, and
   * from SIGTERM to SIGKILL, 5 s by default. A test seam. */
  stop?: { settleMs?: number; killMs?: number };
  /** The agent processes the stop signals (core-service-39): by
   * default the processes the core started — each child process created
   * while its own work ran — with their descendants on macOS and Linux.
   * A shell that bounds its own exit — Electron's — passes none. */
  agentProcesses?: () => number[];
  /** This runtime's label, stored beside the home's device at assignment
   * for display alone (DR-134): the server's name on a seat, else this
   * label, else the host name. */
  runtimeLabel?: string;
  /**
   * Seat mode (core-service-125, DR-132): this core runs on a team
   * server for one member — the server's id and name and the admitted
   * person's permanent account id at the instance. Its sign-in is the
   * device flow naming the server and the person (git-host-27), your
   * own group is placed at no instance (space-102), the commands naming
   * a working folder are refused, and the runtime's label is the
   * server's name. The ids are at most 64 characters. Its runs inherit
   * the shared credential file's forms and the member's own credentials
   * (core-service-126).
   */
  seat?: SeatOptions;
  /** Test seam (DR-133): CA certificates, PEM, trusted beside the
   * system's when the core presents a ticket at a team server's address;
   * a stand-in hub's fixture CA. */
  serverCertificateAuthorities?: readonly string[];
  /** Test seam (core-service-128): the scale of the ninety seconds an
   * admission is awaited, 1 by default, so a suite stands a fraction of
   * a second in for each second. */
  serverAdmitTimeScale?: number;
}

/** A seat's facts (core-service-125). */
export interface SeatOptions {
  serverId: string;
  serverName: string;
  personId: string;
  /** The administrator's shared credential file, an absolute path: its
   * `NAME=value` lines are read into the environment of every agent run
   * (core-service-126). */
  sharedCredentialFile?: string;
}

/** A seat's options checked at start: both ids hold 1 to 64 characters
 * (git-host-27), the name some text, and a shared credential file, where
 * one is given, an absolute path. A shell's mistake, in English. */
function checkSeat(seat: SeatOptions): SeatOptions {
  for (const [name, value] of [["serverId", seat.serverId], ["personId", seat.personId]] as const) {
    if (typeof value !== "string" || value.length === 0 || value.length > SEAT_ID_MAX) {
      throw new Error(`spex: a seat's ${name} must hold 1 to ${SEAT_ID_MAX} characters`);
    }
  }
  const serverName = typeof seat.serverName === "string" ? seat.serverName.trim() : "";
  if (serverName.length === 0) throw new Error("spex: a seat's serverName must hold some text");
  const shared = seat.sharedCredentialFile;
  if (shared !== undefined && (typeof shared !== "string" || !isAbsolute(shared))) {
    throw new Error("spex: a seat's sharedCredentialFile must be an absolute path");
  }
  return { serverId: seat.serverId, serverName, personId: seat.personId, ...(shared !== undefined ? { sharedCredentialFile: shared } : {}) };
}

/** The refusal off a seat of a command on the member's own credentials
 * (settings-48). */
const credentialsOffSeat = (): CoreError => new CoreError("invalid_request", i18n._({
  id: "Credentials are set on a server only",
  comment: "Refusal of a credentials command on a computer of one's own: Spex keeps a member's code-host and agent credentials only on a team server",
}));

/** The refusal off a seat of a sign-in naming a ticket (git-host-27):
 * only a seat's device request carries one. */
const ticketOffSeat = (): CoreError => new CoreError("invalid_request", i18n._({
  id: "This sign-in is for a server only — sign in on Space",
  comment: "Refusal of a sign-in carrying a team server's admission on a computer of one's own: only a team server signs in that way; the person signs in from the card on the Space surface, which the rail names Space",
}));

// A credential command's fields, each checked before anything is written
// (settings-48); a refusal never repeats what was given, which may hold
// a secret.
const blankCredentialName = (): CoreError => new CoreError("invalid_request", i18n._({
  id: "A credential needs a name",
  comment: "Refusal of a credential on a team server's seat: the host's or the agent's name, or a variable's name, is blank",
}));
const blankCredentialValue = (): CoreError => new CoreError("invalid_request", i18n._({
  id: "A credential's value cannot be blank",
  comment: "Refusal of a credential on a team server's seat: a token, a username or an agent's value is blank, or none is given",
}));

/** A code host as the member names it, in lowercase. */
function credentialHost(name: string): string {
  if (name.trim() === "") throw blankCredentialName();
  const host = canonicalHost(name);
  if (host === null) {
    throw new CoreError("invalid_request", i18n._({
      id: "That is not a host name: give the host alone, with a port where it needs one, and no scheme, path, user or spaces",
      comment: "Refusal of a code host's credential on a team server's seat: the name given is not a DNS host name with an optional port",
    }));
  }
  return host;
}

/** An agent as the member names it: one of the adapters. */
function credentialAgent(name: string): AdapterName {
  if (name.trim() === "") throw blankCredentialName();
  if (!isAdapterName(name)) {
    throw new CoreError("invalid_request", i18n._({
      id: "That is not an agent: name one of {agents}",
      comment: "Refusal of an agent's credential on a team server's seat: the name is no agent's; `agents` lists the agents' names as they are",
      values: { agents: listed(adapterNameSchema.options) },
    }));
  }
  return name;
}

/** A code host's credential: a token and an optional username, each one
 * line of text. */
function hostCredentialOf(values: Record<string, string>): HostCredential {
  if (Object.keys(values).some((field) => field !== "token" && field !== "username")) {
    throw new CoreError("invalid_request", i18n._({
      id: "A code host's credential is a token and, where the host asks for one, a username",
      comment: "Refusal of a code host's credential on a team server's seat: it names a field other than the token and the username",
    }));
  }
  const { token, username } = values;
  if (token === undefined || token.trim() === "" || (username !== undefined && username.trim() === "")) throw blankCredentialValue();
  if ([token, username ?? ""].some((value) => /[\u0000-\u001f\u007f]/.test(value))) {
    throw new CoreError("invalid_request", i18n._({
      id: "A code host's token and username are each one line of text",
      comment: "Refusal of a code host's credential on a team server's seat: the token or the username holds a line break or another control character",
    }));
  }
  return { token, ...(username !== undefined ? { username } : {}) };
}

/** An agent's own credential: values by the agent's forms (settings-49). */
function agentCredentialOf(adapter: AdapterName, values: Record<string, string>): AgentCredential {
  const names = Object.keys(values);
  if (names.length === 0) throw blankCredentialValue();
  const forms = AGENT_CREDENTIAL_FORMS[adapter].names;
  for (const name of names) {
    if (name.trim() === "") throw blankCredentialName();
    if (!forms.includes(name)) {
      throw new CoreError("invalid_request", i18n._({
        id: "{adapter} takes only {forms}",
        comment: "Refusal of an agent's credential on a team server's seat: a variable's name is none of the agent's forms; `adapter` is the agent's name and `forms` lists the variables' names, both as they are",
        values: { adapter, forms: listed(forms) },
      }));
    }
    const value = values[name] ?? "";
    if (value.trim() === "") throw blankCredentialValue();
    if (value.includes("\0")) {
      throw new CoreError("invalid_request", i18n._({
        id: "An agent's credential cannot hold a NUL character",
        comment: "Refusal of an agent's credential on a team server's seat: a value holds a NUL character, which no process environment carries",
      }));
    }
  }
  // A credential holds the agent's key form: Kimi's model name, base URL
  // and provider type only accompany its key (settings-48, settings-49).
  const keys = AGENT_CREDENTIAL_FORMS[adapter].keys;
  if (!names.some((name) => keys.includes(name))) {
    throw new CoreError("invalid_request", i18n._({
      id: "A {adapter} credential needs {keys}",
      comment: "Refusal of an agent's credential on a team server's seat: it carries only names that accompany the agent's key, such as Kimi's model name, and not the key; `adapter` is the agent's name and `keys` lists the key's variable names, any one of which will do, both as they are",
      values: { adapter, keys: listed(keys) },
    }));
  }
  return { ...values };
}

// The Sources cache ages out at ten minutes (dashboard-14).
const FORGE_CACHE_MS = 600_000;

/** The files a config state was composed from, each at the version read
 * (DR-111): an unreadable one stands as its error, so it compares stably.
 * A boolean records only presence, where installed-package availability
 * depends on a selected file standing, not its bytes. */
type ConfigInputs = Map<string, string | null | boolean>;
const inputVersion = (file: string): string | null => {
  try { return fileVersion(file); }
  catch (error) { return `!${(error as NodeJS.ErrnoException).code ?? "unreadable"}`; }
};
/** The first input no longer standing at the version read. */
const changedInput = (inputs: ConfigInputs): string | undefined => {
  for (const [file, version] of inputs) {
    if ((typeof version === "boolean" ? existsSync(file) : inputVersion(file)) !== version) return file;
  }
  return undefined;
};
const changedMeanwhile = (file: string): CoreError => new CoreError("conflict", new VersionConflictError(file).message);

/** What a sync tells the environments once it applied a lock or moved a
 * clone (environments-8, environments-17): optional on the Space host. */
interface SpaceEnvironmentHooks {
  environmentChanged?(key: string): void | Promise<void>;
  environmentMoved?(oldKey: string, newKey: string): void | Promise<void>;
}

/** The engine links a compile provisions in a spec package under
 * development stay out of the working folder's Git (playbook-library-12),
 * as an install's in a path source's playbook folders do. */
function excludeEngineLinks(workingFolder: string): void {
  try { writeExcludeBlock(workingFolder, [ENGINE_LINKS_EXCLUDE], "engine links"); }
  catch (error) { console.error(`spex: ${workingFolder}'s engine links are not excluded: ${String(error)}`); }
}

interface ClientState {
  socket: WebSocket;
  channels: Set<string>;
}

interface QueueHandoff {
  sessionId: string;
  turnId: number;
  ownerIntentId: string;
  nextIntentId: string;
  projectId: string;
}

function channelKey(channel: Channel): string {
  return channel.kind === "draft"
    ? `draft:${channel.draftId}`
    : `${channel.kind}:${channel.sessionId}`;
}

/** Any failure as the reply's error: a CoreError as it is, any other
 * classed by what it is, its own words kept. */
function coreErrorOf(error: unknown): CoreError {
  if (error instanceof CoreError) return error;
  const code: CoreError["code"] = error instanceof MediaTransferError ? "invalid_request" : error instanceof StorageFormatError ? "invalid_request" : (error as {code?:string})?.code === "PLAYBOOK_SESSION_LEASE_ACTIVE" ? "busy" : "internal";
  return new CoreError(code, error instanceof Error ? error.message : String(error));
}

/** The not-found refusals the command paths share, each phrased when
 * it is raised (core-service-111); the id itself is never translated. */
const noProject = (projectId: string): CoreError =>
  new CoreError("not_found", i18n._({
    id: "no project {projectId}",
    comment: "Refusal: no project of this id is registered",
    values: { projectId },
  }));
const noSession = (sessionId: string): CoreError =>
  new CoreError("not_found", i18n._({
    id: "no session {sessionId}",
    comment: "Refusal: no session of this id is known",
    values: { sessionId },
  }));
const noIntent = (intentId: string): CoreError =>
  new CoreError("not_found", i18n._({
    id: "no intent {intentId}",
    comment: "Refusal: no intent of this id is in the ledger",
    values: { intentId },
  }));
const noDraft = (draftId: string): CoreError =>
  new CoreError("not_found", i18n._({
    id: "no draft {draftId}",
    comment: "Refusal: no playbook draft of this id is open",
    values: { draftId },
  }));

/** A playbook id outside the Agent Skills name rule (playbook-library-51):
 * it names the spec package, the file and the command. */
const invalidPlaybookId = (id: string): CoreError =>
  new CoreError("invalid_request", i18n._({
    id: "\"{id}\" is not a playbook id: lowercase letters, digits and single hyphens, at most 64 characters",
    comment: "Refusal: the id offered for a new playbook breaks the Agent Skills name rule",
    values: { id },
  }));

/** A handshake request's path, its query and fragment left out. */
function requestPath(url: string | undefined): string {
  const raw = url ?? "/";
  const end = raw.search(/[?#]/);
  return end < 0 ? raw : raw.slice(0, end);
}

/** Expand a leading ~ so the most natural path spelling works. */
function expandPath(input: string, home: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return resolve(home, trimmed.slice(2));
  return resolve(trimmed);
}

export interface CoreServiceEvents {
  /** Local hook for an embedding shell (notifications, badges). */
  onRecord?: (envelope: RecordEnvelope) => void;
  onSessionState?: (session: import("./protocol.js").SessionInfo) => void;
  /** The attention count moved — this core's ledger fold (DR-035) or
   * a seat's counted badge (core-service-129): the shell re-reads
   * `attentionCount()` for its badge, so the dock and the app never
   * disagree. */
  onLedgerChange?: () => void;
}


/**
 * What the core found about the folders a repair already names, and the
 * one it proposes (space-53). The bound is a prohibition: the core may
 * CHECK a path it can already name and must report what it found; it
 * may never SEARCH for one. It lists no directory and descends none.
 */
async function checkRepairs(
  diagnostics: StorageDiagnostic[],
  bindings: { id: string; name: string; path: string }[],
  run: RunCommand,
): Promise<StorageDiagnostic[]> {
  const claimed = new Map(bindings.map((b) => [resolve(b.path), b.name]));
  // The parent the most of this device's projects already share, so a
  // candidate is named rather than hunted for.
  const parents = new Map<string, number>();
  for (const binding of bindings) {
    const parent = dirname(resolve(binding.path));
    parents.set(parent, (parents.get(parent) ?? 0) + 1);
  }
  const dominant = [...parents.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

  const checkOne = async (path: string): Promise<RepairChecked> => {
    if (!existsSync(path)) return { path, here: false, repo: false };
    const name = claimed.get(resolve(path));
    try {
      // existsSync gates the git call, and the git call is bounded: a
      // dead mount must never stall the surface's read.
      const repo = await withTimeout(isWorkTreeRoot(path, run), 3_000);
      return { path, here: true, repo, ...(name ? { claimedBy: name } : {}) };
    } catch {
      return { path, here: true, repo: false, unknown: true, ...(name ? { claimedBy: name } : {}) };
    }
  };

  return Promise.all(diagnostics.map(async (entry) => {
    const repair = entry.repair;
    if (!repair) return entry;
    const recorded = repair.directories.slice(0, 4);
    const lastSegment = (p: string): string => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? p;
    const named = recorded[0] ?? repair.name?.replace(/-spex$/, "");
    const beside = dominant && named ? join(dominant, lastSegment(named)) : undefined;
    const paths = [...new Set([...recorded, ...(beside && !recorded.includes(beside) ? [beside] : [])])];
    const checked = await Promise.all(paths.map(checkOne));
    // Exactly one qualifying folder is a proposal; two is ambiguity,
    // and the row asks instead.
    const qualifying = checked.filter((c) => c.here && c.repo && !c.claimedBy && !c.unknown);
    const proposal = qualifying.length === 1
      ? {
          path: qualifying[0].path,
          from: recorded.includes(qualifying[0].path) ? ("recorded" as const) : ("beside-projects" as const),
        }
      : undefined;
    return { ...entry, repair: { ...repair, checked, ...(proposal ? { proposal } : {}) } };
  }));
}

/** A bounded wait, so one unreachable folder cannot hold the surface. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    work.then((value) => { clearTimeout(timer); resolve(value); },
              (error) => { clearTimeout(timer); reject(error); });
  });
}

export class CoreService {
  private readonly options: CoreServiceOptions;
  /** Your own group's config, which follows its clone when your own
   * group is renamed at sign-in (space-59); an explicit path stays. */
  private configPath: string;
  /** The runtime the Git credential helper runs on (git-host-9). */
  private readonly hostRuntime: { execPath: string; electron: boolean };
  /** This core's seat on a team server, where it runs as one
   * (core-service-125); none on a machine of one's own. */
  private readonly seat?: SeatOptions;
  /** On a seat, the environment its agent runs inherit (core-service-126)
   * and the member's own credentials (storage-44). */
  private readonly seatEnvironment?: SeatEnvironment;
  private readonly codeCredentials?: CodeCredentialStore;
  /** The adapter imports every agent run loads: on a seat, each run
   * first writes its environment (core-service-126). */
  private readonly adapterImports?: PlayerAdapterImports;
  /** This runtime's label for display (core-service-4, DR-134): the
   * server's name on a seat, else the given label, else this machine's
   * host name; its name is the home's device, read when a record is
   * assigned. */
  private readonly runtimeLabel: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly home: string;
  private readonly store: Store;
  private readonly approvals = new ApprovalBroker((state) => this.broadcast({type: "approval.state", state}));
  private readonly sessions: SessionManager;
  /** Authoring sessions and their conversations (DR-058). */
  private readonly authors: AuthorManager;
  private readonly drafts: DraftStore;
  /** The latest readiness verdict per adapter, for the draft chips. */
  private readonly readinessByAdapter = new Map<AdapterName, boolean | null>();
  private readonly clients = new Set<ClientState>();
  private authToken = "";
  readonly events: CoreServiceEvents = {};
  private wss?: WebSocketServer;
  /** The HTTP server the endpoint stands on: the shell's, or the
   * loopback one this core binds itself (core-service-1). */
  private endpoint?: HttpServer | HttpsServer;
  /** The endpoint's upgrade listener, taken off the server at stop. */
  private upgradeListener?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  /** The applets open on the endpoint, by capability (applets-3). */
  private readonly applets: AppletServer;
  private watcher?: FSWatcher;
  /** One watcher per clone's `sessions/` (storage-14). */
  private readonly sessionsWatchers = new Map<string, FSWatcher>();
  /** One watcher per clone's config beside your own group's
   * (core-service-2): its `config/`, or the clone until that appears. */
  private readonly configWatchers = new Map<string, { dir: string; watcher: FSWatcher }>();
  private adoptTimer?: NodeJS.Timeout;
  private reloadTimer?: NodeJS.Timeout;

  private configState: ConfigState;
  private composed?: ComposedConfig;
  /** The files {@link configState} was composed from: the state is a
   * cache validated by them at use (DR-111); none while no load of the
   * files has been published. */
  private configInputs?: ConfigInputs;
  private seeded = false;
  /** An untouched seed rewritten for the current credentials this run
   * (core-service-137), reported apart from a creation (settings-9). */
  private reseeded = false;
  private readonly runCommand: RunCommand;
  private readonly forge: ForgeAdapter;
  /** Each running one-shot compile's own cancel handle, by playbook id:
   * cancellation and progress only, admitting or refusing nothing
   * (core-service-25). */
  private readonly standaloneCompiles = new Map<string, Set<AbortController>>();
  /** Projects whose ledger changed since the last broadcast (DR-035). */
  private readonly ledgerChanged = new Set<string>();
  private ledgerTimer?: NodeJS.Timeout;
  /** Monotonic reload identity; a superseded reload commits nothing. */
  private reloadGeneration = 0;
  /** Each readiness push a change of the member's agent credentials
   * started, the newest alone announced (settings-49). */
  private credentialPushes = 0;
  /** The reload in flight, awaited before a runtime opens (core-service-92). */
  private reloading?: Promise<void>;
  private readonly migrationDiagnostics: {file: string; reason: string; blocking: boolean}[] = [];
  private stopping = false;
  /** The endpoint file this process wrote under the home
   * (core-service-143), removed at stop; unset while none stands. */
  /** Tracked so shutdown cannot race an automatic continuation opening. */
  private readonly advancing = new Set<Promise<void>>();
  /** A settled lane whose one automatic handoff is being decided. */
  private readonly handoffs = new Map<string, string>();
  /** Manual and automatic sends share one admission per conversation. */
  private readonly submitting = new Map<string, Promise<void>>();
  /** Groups' engine (DR-103): one sync machine per spex repository. */
  private readonly space: SpaceManager;
  private readonly registry: RegistryManager;
  /** The seats this core holds on team servers (core-service-128). */
  private readonly places: Places;
  /** Every spex repository's environment (DR-104). */
  private readonly environments: EnvironmentManager;
  /** Set once start finished: environment changes then reload. */
  private started = false;
  private readonly media: ApplicationMedia;
  private readonly browserPreparations = new Map<string, {
    client: ClientState;
    controller: AbortController;
    done: Promise<unknown>;
  }>();
  /** The language the core is composing in (core-service-111): the
   * resolution in force, kept so a choice that resolves to the same
   * language re-derives nothing. */
  private spoken: Language = "en";

  private constructor(
    options: CoreServiceOptions,
    store: Store,
    /** The processes this core started (core-service-39). */
    private readonly startedProcesses: StartedProcesses,
    seat?: { credentials: CodeCredentialStore; environment: SeatEnvironment },
  ) {
    this.options = options;
    if (options.seat) this.seat = options.seat;
    this.runtimeLabel = options.seat?.serverName ?? (options.runtimeLabel || hostname());
    this.env = options.env ?? process.env;
    this.home = options.home ?? this.env.HOME ?? homedir();
    this.store = store;
    if (options.seat) {
      const { credentials, environment } = seat ?? CoreService.seatCredentials(options, store.dir);
      this.codeCredentials = credentials;
      this.seatEnvironment = environment;
      this.adapterImports = seatAdapterImports(options.adapterImports ?? DEFAULT_ADAPTER_IMPORTS, () => { environment.prepare(); });
    } else if (options.adapterImports) this.adapterImports = options.adapterImports;
    // Your own group's config, inside its clone (storage-1, DR-103); an
    // explicit path is the operator's.
    this.configPath = options.configPath ?? store.ownRepository().configPath;
    if (!options.loadModule) {
      this.options = { ...options, loadModule: createModuleLoader(this.env) };
    }
    this.authToken = options.token || randomUUID();
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.forge =
      options.forgeAdapter ?? new GitHubForgeAdapter(this.runCommand);
    this.configState = { status: "missing", path: this.configPath };
    this.hostRuntime = options.hostRuntime ?? currentRuntime();
    this.sessions = new SessionManager({
      approvalHandler: (sessionId) => this.approvals.handler({kind: "session", id: sessionId}, () => {
        const session = this.store.describeSession(sessionId);
        const project = session ? this.store.getProject(session.projectId) : undefined;
        return {ownerLabel: session?.title ?? sessionId, ...(project ? {projectName: project.name} : {})};
      }),
      cancelApprovals: (sessionId) => this.approvals.cancel({kind: "session", id: sessionId}),
      store: this.store,
      loadModule: this.options.loadModule,
      adapterImports: this.adapterImports,
      captainFactory: options.captainFactory,
      env: this.env,
      runtime: () => this.assignableRuntime(),
    });
    this.sessions.onRecord = (envelope) => {
      this.dispatchRecord(envelope);
      this.events.onRecord?.(envelope);
    };
    this.sessions.onSessionState = async (session) => {
      if (!session.live && !session.turnActive && !session.externalWriter) {
        await this.refreshReportedContinuations([session.id], true);
        // The manager keeps its settlement reservation until this
        // publication finishes; it is not a still-active turn here.
        const current = this.sessions.getLive(session.id)
          ? this.sessions.listSessions().find(({id}) => id === session.id)
          : this.store.describeSession(session.id);
        if (!current) return;
        session = {...current, turnActive: current.turnActive ?? false};
      }
      this.broadcast({ type: "session.state", session });
      this.events.onSessionState?.(session);
      await this.options.sessionStatePublished?.(session);
    };
    this.sessions.onLedgerChange = (projectId) => {
      this.queueLedgerChange([projectId]);
    };
    this.sessions.onTurnSettled = (sessionId, turnId, intentId, control) => {
      if (this.stopping || intentId === undefined) return;
      const handoff = this.authorizeQueueHandoff(sessionId, turnId, intentId, control);
      if (!handoff) return;
      this.handoffs.set(sessionId, handoff.nextIntentId);
      this.queueLedgerChange([handoff.projectId]);
      const work = this.advanceQueue(handoff).catch((error) => {
        // Admission can require human repair (settings, ownership or
        // recovery). Keep the next intent queued; never retry silently.
        console.error(`spex: queue advancement paused: ${String(error)}`);
      });
      this.advancing.add(work);
      void work.finally(() => {
        this.advancing.delete(work);
        this.handoffs.delete(sessionId);
        this.queueLedgerChange([handoff.projectId]);
      });
    };
    this.registry = new RegistryManager({ home: this.store.dir, label: `Spex on ${this.runtimeLabel}`, flow: options.seat ? "device" : options.signIn ?? "device", ...(options.registryFetch ? { fetch: options.registryFetch } : {}), broadcast: (state) => this.broadcast({ type: "registry.state", state }) });
    this.environments = new EnvironmentManager({
      store: this.store,
      userHome: CoreService.userHomeOf(options, this.env, this.home),
      deviceHome: this.home,
      ...(options.compileRuntime?.modulePaths ? { modulePaths: options.compileRuntime.modulePaths } : {}),
      builtin: CoreService.shippedBuiltin(options),
      ...(options.registryFetch ? { fetch: options.registryFetch } : {}),
      // An environment's instance is its spex repository's (storage-31);
      // its registry presents the access secret that instance's client
      // keeps current, asked only where the home is signed in there
      // (environments-12, git-host-4, DR-127), an instance that cannot
      // be reached, or asks to wait, read as it answered (git-host-11).
      placedAt: (key) => this.space.instanceOriginOf(key),
      tokenFor: async (origin, scope = "space") => {
        if (scope === "registry") {
          try { return await this.registry.client(origin).accessSecret(); }
          catch (error) { throw new Error(relayHostError(error, this.registry.name(origin))); }
        }
        try {
          return await this.space.accessSecretFor(origin);
        } catch (error) {
          throw new Error(relayHostError(error, this.space.instanceName(origin)));
        }
      },
      // The instance a publish goes to, named by its display name as last
      // read, else its host name (environments-10, playbook-library-93).
      instanceName: (origin) => this.registry.name(origin),
      // A registry refusing an instance's token signs that instance alone
      // out, where that token is still its stored pair's; a pair replaced
      // meanwhile fails the call as changed meanwhile (environments-12,
      // git-host-4, DR-127).
      refused: async (origin, token, scope = "space") => {
        if (scope === "registry") { await this.registry.client(origin).signOutRefused(token); return; }
        try {
          await this.space.registryRefused(origin, token);
        } catch (error) {
          throw new Error(relayHostError(error, this.space.instanceName(origin)));
        }
      },
      // A Git source at a signed-in instance's Git origin takes the
      // credential that instance brokers, through the app's helper, and
      // reads as an instance's name, the environment's own instance
      // preferred (environments-13, environments-29, git-host-9, DR-127).
      gitCredential: (repo, preferred) => this.space.sourceCredential(repo, preferred),
      gitLabel: (repo, preferred) => this.space.packageSourceAsShown(repo, preferred),
      gitFailure: (repo, run, preferred) => this.space.packageSourceFailure(repo, run, preferred),
      credentialArgs: async (credential) => {
        const handle = await withGitCredential(credential, this.hostRuntime);
        const env: Record<string, string> = {};
        for (const [name, value] of Object.entries(handle.env)) if (value !== undefined) env[name] = value;
        return { env, configArgs: handle.configArgs, dispose: handle.dispose };
      },
      broadcast: (repository, state) => this.broadcast({ type: "environment.state", repository, state }),
      changed: (repository) => this.environmentChanged(repository),
    });
    // Each request reads the applet's folder and the project's working
    // folder as they stand (applets-4): a package removed, or a folder
    // unpaired, serves nothing; the home is never read through `~/`.
    this.applets = new AppletServer((ask) => {
      let applet;
      try { applet = this.environments.applet(ask.repository, ask.applet); } catch { return null; }
      const workingFolder = this.environments.workingFolder(ask.project);
      if (!applet?.present || applet.dir === null || workingFolder === null) return null;
      return { applet: applet.dir, workingFolder };
    }, store.dir);
    // A working folder unpaired from its project keeps nothing the
    // exports wrote there (environments-8).
    this.store.onProjectRemoving = (key, folder) => this.environments.removeExportsFor(key, folder);
    // The hooks a sync calls once it applied a lock or moved a clone
    // (environments-8, environments-17), beside the host's own fields.
    const spaceHost: SpaceHost & SpaceEnvironmentHooks = {
      environmentChanged: (key: string) => this.environments.applied(key),
      environmentMoved: (oldKey: string, newKey: string) => this.environments.moved(oldKey, newKey),
      // A clone a join paired requests the built-in spec package at its
      // instance's registry, then installs and exports; one a pick placed
      // at an instance locks it there (environments-11, environments-31).
      environmentPaired: (key: string) => { void this.environments.paired(key).catch(() => {}); },
      environmentPlaced: (key: string) => { void this.environments.placed(key).catch(() => {}); },
      home: this.store.dir,
      env: this.env,
      store: this.store,
      libraryDir: this.libraryDir(),
      diagnostics: () => foldDiagnostics([...this.migrationDiagnostics, ...this.store.storageDiagnostics(), ...this.store.sessionDiagnostics(), ...this.credentialDiagnostics()]),
      checkRepairs: (diagnostics) => checkRepairs(
        diagnostics,
        this.store.listProjects().map((project) => ({ id: project.id, name: project.name, path: project.path })),
        this.runCommand,
      ),
      broadcast: (state) => this.broadcast({ type: "space.state", state }),
      reloadConfig: () => this.reloadConfig(),
      rescanSessions: async (repository) => {
        await this.media.reset();
        await this.syncForeignSessions();
        // Its authoring sessions are read from their files again by the
        // clients showing them (core-service-118).
        this.authors.applied(repository);
        // A sync applied what the host holds, its lock among it: the
        // environment installs from it and exports (environments-8,
        // environments-17), its state broadcast.
        void this.environments.applied(repository).catch(() => {});
      },
      ledgerChanged: (projectIds) => this.queueLedgerChange(projectIds),
      // An apply replaces no authoring session's files under a turn this
      // core runs for it (space-19).
      assertAuthoringWritable: (key, id) => this.authors.assertTurnWritable(id, key),
      ...(options.spaceTransportTimeoutMs !== undefined ? { transportTimeoutMs: options.spaceTransportTimeoutMs } : {}),
      ...(options.spaceBeforeStep ? { beforeStep: options.spaceBeforeStep } : {}),
      clientFor: (origin: string) => this.hostClientFor(origin),
      // A seat signs in through the device flow alone (core-service-125).
      signInFlow: options.seat ? "device" : options.signIn ?? "device",
      seat: options.seat !== undefined,
      // On a seat, the member's own token for a code host, read from
      // its file before each transport to that host; an entry that will
      // not read is refused, serving no transport, the storage
      // diagnostics reporting it and a failed code clone saying so
      // (git-host-9, storage-44, space-103).
      ...(this.codeCredentials ? {
        hostToken: (host: string) => this.codeCredentials?.readHost(host) ?? null,
      } : {}),
      hostRuntime: this.hostRuntime,
      repositoriesChanged: () => this.afterRepositoriesChanged(),
      repositoriesMoved: (moves) => this.repositoriesMoved(moves),
    };
    this.space = new SpaceManager(spaceHost);
    // The seats on team servers (core-service-128, DR-133): each
    // signed-in instance's servers read through the client this core
    // keeps for it, every change of the open seats announced.
    this.places = new Places({
      homeDir: this.store.dir,
      signedInOrigins: () => this.space.signedInOrigins(),
      signedInInstance: (named) => this.space.signedInInstance(named),
      clientOf: (origin) => this.space.clientOf(origin),
      instanceName: (origin) => this.space.instanceName(origin),
      broadcast: (seats) => this.broadcast({ type: "server.state", seats }),
      attentionChanged: () => this.events.onLedgerChange?.(),
      ...(options.serverCertificateAuthorities ? { certificateAuthorities: options.serverCertificateAuthorities } : {}),
      ...(options.serverAdmitTimeScale !== undefined ? { admitTimeScale: options.serverAdmitTimeScale } : {}),
    });
    // Authoring sessions live in the spex repository of their project
    // (storage-23); their spec packages in its working folder
    // (environments-10).
    this.drafts = new DraftStore(() =>
      this.store.listRepositories().map((repository) => ({
        key: repository.key,
        authoringDir: repository.authoringDir,
        workingFolder: this.store.home.folderOf(repository.key)?.path ?? null,
      })));
    const service = this;
    this.authors = new AuthorManager({
      approvalHandler: (draftId, instance) => this.approvals.handler({kind: "draft", id: draftId, instance}, () => ({ownerLabel: draftId})),
      cancelApprovals: (draftId, instance, invocationId) => this.approvals.cancel({kind: "draft", id: draftId, instance}, invocationId),
      store: this.store,
      drafts: this.drafts,
      // Read when used: your own group's config moves with its clone.
      get configPath() { return service.configPath; },
      env: this.env,
      agentEnv: () => service.agentRunEnv(),
      adapterImports: this.adapterImports,
      compileSpawner: options.compileSpawner,
      compileRuntime: options.compileRuntime,
      composed: () => this.composed,
      // A turn reads the config as its files stand when it starts (DR-111).
      prepareConfig: () => this.settledConfig(),
      readiness: (adapter) => this.readinessByAdapter.get(adapter) ?? null,
      // An id either environment exports is taken (playbook-library-51).
      reservedIds: (projectId) => this.reservedPlaybookIds(projectId),
      homeLanguage: () => this.homeLanguage(),
      enabled: (id) => this.draftEnabled(id),
      excludeEngineLinks: (workingFolder) => excludeEngineLinks(workingFolder),
      device: () => this.store.home.device,
      importInto: (prepare, place) => this.media.importInto(prepare, place),
    });
    this.authors.events.onRecord = (draftId, instance, record) => {
      const key = `draft:${draftId}`;
      for (const client of this.clients) {
        if (client.channels.has(key)) {
          this.send(client.socket, { type: "draft.record", draftId, instance, seq: record.seq, record: record.record });
        }
      }
    };
    this.authors.events.onState = (draft) => this.broadcast({ type: "draft.state", draft });
    this.authors.events.onSource = (message) => this.broadcast(message);
    this.authors.events.onProgress = (draftId, instance, line) => this.broadcast({ type: "compile.progress", playbookId: draftId, instance, line });
    this.authors.events.onHistory = (draftId, instance) => this.broadcast({ type: "draft.history-replaced", draftId, instance });
    this.authors.events.onRemoved = (draftId, projectId, instance) => this.broadcast({ type: "draft.removed", draftId, projectId, ...(instance ? { instance } : {}) });
    this.media = new ApplicationMedia({
      home: this.store.dir,
      directoryOf: (owner) => this.mediaDirectory(owner),
      rootOf: (owner) => {
        const key = owner.kind === "project" ? owner.id : owner.projectId;
        const repository = this.store.repository(key);
        if (!repository) throw noProject(key);
        return repository.dir;
      },
      assertOwner: (owner, write) => {
        if (this.stopping) throw new CoreError("busy", i18n._({id: "The core is stopping.", comment: "Refusal during attachment admission"}));
        if (owner.kind === "project") {
          if (!this.store.getProject(owner.id)) throw noProject(owner.id);
          if (write) this.store.assertWritable({ projectId: owner.id });
        } else if (owner.kind === "intent") {
          if (!this.store.getProject(owner.projectId)) throw noProject(owner.projectId);
          // A queued intent's directory is filled at admission, before
          // its file is written (media-4); a read needs the intent.
          const intent = this.store.getIntent(owner.intentId);
          if (intent && intent.projectId !== owner.projectId) throw noIntent(owner.intentId);
          if (!write && !intent) throw noIntent(owner.intentId);
        } else if (owner.kind === "draft") {
          // The session the owner names by its instance (media-4): a
          // session made again under its id is another owner.
          if (!this.authors.has(owner.id) || this.drafts.projectOf(owner.id) !== owner.projectId ||
            this.drafts.instanceOf(owner.id) !== owner.instance) throw noDraft(owner.id);
        } else if (!this.store.describeSession(owner.id)) throw noSession(owner.id);
      },
      openSessionAsset: (sessionId, assetId) => this.store.sessionStoreFor(sessionId).openAsset(sessionId, assetId),
    });
    // The core speaks before it composes its first text (core-service-111):
    // the config error a start may raise, and the readiness requirement
    // that follows it, already read in the home's language.
    this.spoken = this.speakHomeLanguage();
  }

  // -- environments (DR-104) --------------------------------------------------

  /** The built-in spec package this app ships (environments-11). */
  private static shippedBuiltin(options: CoreServiceOptions): BuiltinPackage | null {
    if (options.builtinPackage !== undefined) return options.builtinPackage;
    try { return builtinPackage(); } catch { return null; }
  }

  /** Where your own group's skills are exported (environments-8): the
   * given root; else the given `home`; else, for the default Spex home
   * at `~/.spex`, this user's home; a home elsewhere writes none there. */
  private static userHomeOf(options: CoreServiceOptions, env: NodeJS.ProcessEnv, home: string): string | null {
    if (options.userHome !== undefined) return options.userHome;
    if (options.home !== undefined) return options.home;
    if (options.dataDir && resolve(options.dataDir) === resolve(home, ".spex") && !env.SPEX_HOME?.trim()) return home;
    return null;
  }

  /** The environment an agent run the core spawns itself inherits — a
   * compile's slc and the agent it drives (playbook-library-42), a
   * model discovery: on a seat, the shared credential file and the
   * member's own credentials read afresh first, as before every agent
   * run (core-service-126). */
  private agentRunEnv(): NodeJS.ProcessEnv {
    const seat = this.seatEnvironment;
    if (!seat) return this.env;
    seat.prepare();
    return seat.envFor(this.env);
  }

  /** On a seat, write the seat account's own Git configuration naming
   * the app's helper in its member mode (core-service-125, git-host-9):
   * an agent's push from a project's work tree then carries the member's
   * token. Nothing is written off a seat; a failure is logged, blocking
   * nothing else, and no secret enters either file or the log. */
  private async configureSeatGit(): Promise<void> {
    if (!this.seat) return;
    try {
      await configureSeatGit({ home: this.home, env: this.env, runtime: this.hostRuntime, storePath: codeCredentialsPath(this.store.dir) });
    } catch (error) {
      console.error(`spex: the seat's Git configuration was not written: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** On a seat, the member's credentials file refused or its malformed
   * entries (storage-44), as the file stands now. */
  private credentialDiagnostics(): StorageDiagnostic[] {
    try {
      return this.codeCredentials?.diagnostics() ?? [];
    } catch {
      return [];
    }
  }

  /** This runtime (DR-134): one core on one home, named by the home's
   * `device` as `home.yaml` reads now, with its label. A caller reads it
   * once the home reads, in the step that writes the assignment, so a
   * device minted for one run while `home.yaml` does not read assigns
   * nothing: that write is refused (storage-2). */
  private runtime(): AssignedRuntime {
    return { device: this.store.home.device, label: this.runtimeLabel };
  }

  /** This runtime as a new session is assigned to it (core-service-4,
   * DR-134): none while `home.yaml` does not read, as its device may be
   * one minted for this run alone, which assigns nothing. */
  private assignableRuntime(): AssignedRuntime | undefined {
    try { this.store.assertProjectsWritable(); }
    catch { return undefined; }
    return this.runtime();
  }

  /** An intent assigned to another runtime runs there alone: its turn,
   * edit and close are refused `conflict` here, read against this home's
   * device now, so no sync choice can drop the stamp of work that ran
   * there (core-service-43, core-service-46, core-service-47, DR-134). */
  private requireOwnIntent(intent: IntentInfo): void {
    const runsOn = intent.runtime ? runsElsewhere(intent.runtime, this.store.home.device) : undefined;
    if (runsOn !== undefined) throw runsElsewhereRefusal("conflict", runsOn);
  }

  /** A client of the instance at an origin (git-host-1..11, DR-127),
   * which the space keeps one of per instance: its app token under that
   * origin in `local/credentials.yaml`, this device and app as its label,
   * a refusal that signs the device out of that instance alone, its
   * entry marked so (git-host-4), and a rate limit holding that
   * instance's calls, offering Stop on the steps that wait (git-host-21).
   * On a seat, the label names the server and the device request the
   * server and the person (git-host-27). */
  private hostClientFor(origin: string): GitHostClient {
    return new GitHostClient({
      url: origin,
      label: `Spex on ${this.runtimeLabel}`,
      ...(this.seat ? { server: { id: this.seat.serverId, personId: this.seat.personId } } : {}),
      credentials: fileCredentialStore(this.store.dir, origin),
      onSignedOut: () => this.space.signedOutByHost(origin),
      onHold: () => this.space.holdBegan(origin),
      ...(this.options.hostHoldMaxMs !== undefined ? { holdMaxMs: this.options.hostHoldMaxMs } : {}),
    });
  }

  /** Playbook ids a new authoring session of a project may not take:
   * every playbook the project's or your own group's environment
   * exports, but the one a folder `spex-packages/<org>/<id>/` left by a
   * deleted session exports, which the new session takes over
   * (playbook-library-51). */
  private reservedPlaybookIds(projectId: string): string[] {
    const ids = new Set(this.composed?.playbooks.map((playbook) => playbook.id) ?? []);
    for (const key of new Set([projectId, this.store.home.own()])) {
      for (const resolution of Object.values(this.environments.lockOf(key)?.packages ?? {})) {
        for (const [exported, artifact] of Object.entries(resolution.exports)) {
          const own = isPathSource(resolution.source) && key === projectId && isDraftPackagePath(resolution.source.path, artifact);
          if (!own) { ids.add(exported); ids.add(artifact); }
        }
      }
    }
    return [...ids];
  }

  /** Whether an authoring session's playbook is enabled: a config of
   * the session's project or your own group enables its id, and that
   * spex repository's environment requests the session's spec package
   * by path (playbook-library-69). */
  private draftEnabled(id: string): boolean {
    const projectId = this.drafts.projectOf(id);
    const draftFolder = this.drafts.workingFolder(id);
    if (!projectId || draftFolder === null) return false;
    const packageDir = resolve(draftFolder, this.drafts.packagePath(id));
    for (const key of new Set([projectId, this.store.home.own()])) {
      const repository = this.store.repository(key);
      const folder = this.environments.pathRoot(key);
      if (!repository || folder === null) continue;
      const requested = [...this.environments.pathRequests(key).values()].some((path) => resolve(folder, path) === packageDir);
      if (!requested) continue;
      const configPath = key === this.store.home.own() ? this.configPath : repository.configPath;
      try {
        const top = existsSync(configPath) ? parseYaml(readFileSync(configPath, "utf8")) as { playbooks?: Record<string, unknown> } | null : null;
        if (top?.playbooks && Object.hasOwn(top.playbooks, id)) return true;
      } catch { /* an unreadable config enables nothing */ }
    }
    return false;
  }

  /** An environment's files or exports changed (environments-17): your
   * own group's config composes anew; a session's enabled mark may move. */
  private environmentChanged(repository: string): void {
    if (!this.started || this.stopping) return;
    if (repository === this.store.home.own()) void this.reloadConfig();
    // A project's playbooks come from its environment first
    // (environments-9): its composition is announced again.
    else if (this.store.listProjects().some((project) => project.id === repository)) {
      void this.broadcastConfig(this.reloadGeneration).catch((error: unknown) => {
        console.error(`spex: the config state was not announced: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    this.authors.republish();
  }

  /** Where your own group's config, or a project's session, finds each
   * enabled playbook's module (environments-9). */
  private modules(projectId: string | null): PlaybookModules {
    return this.environments.modulesFor(projectId);
  }

  /** {@link modules}, recording the locks, install records and selected
   * file presence that establish availability, then each requested
   * module entry's full version — a missing one as absent, so its repair
   * is a change (DR-111). Other files' bytes are not recorded. */
  private modulesRead(projectId: string | null, inputs: ConfigInputs): PlaybookModules {
    const keys = [...new Set([...(projectId === null ? [] : [projectId]), this.store.home.own()])];
    for (const key of keys) {
      if (this.store.repository(key)) {
        // The environment's files and what is installed stand at its root
        // and under its `.spex/` (environments-26); none without a root.
        const root = this.environments.rootOf(key);
        if (root === null) continue;
        inputs.set(join(root, "spex.lock"), inputVersion(join(root, "spex.lock")));
        const installed = join(installedDir(root), INSTALL_RECORD);
        inputs.set(installed, inputVersion(installed));
        for (const [name, resolution] of Object.entries(this.environments.lockOf(key)?.packages ?? {})) {
          if (isPathSource(resolution.source)) continue;
          for (const file of resolution.files) {
            const path = join(installedDir(root), ...name.split("/"), ...file.path.split("/"));
            if (!inputs.has(path)) inputs.set(path, existsSync(path));
          }
        }
      }
    }
    const located = keys.map((key) => this.environments.locations(key));
    const modules = this.modules(projectId);
    return {
      repository: modules.repository,
      find: (id) => {
        for (const locations of located) {
          for (const [name, location] of locations) {
            if (name !== id && location.id !== id) continue;
            // A missing entry stands at its first candidate; any of them appearing repairs it.
            const entries = location.present ? [location.module] : playbookModuleCandidates(dirname(dirname(location.module)), location.id);
            for (const entry of entries) {
              if (!inputs.has(entry) || typeof inputs.get(entry) === "boolean") inputs.set(entry, inputVersion(entry));
            }
          }
        }
        return modules.find(id);
      },
    };
  }

  /** The players every project's file names that your own group's
   * roster lacks (core-service-2, settings-46), listed on the valid
   * config state; a project's session raises them when it opens. */
  private missingPlayers(ownTop: unknown, inputs: ConfigInputs): import("./protocol.js").MissingPlayer[] {
    const own = this.store.home.own();
    const projects: { repository: string; top: unknown }[] = [];
    for (const repository of this.store.listRepositories()) {
      if (repository.key === own || resolve(repository.configPath) === resolve(this.configPath)) continue;
      try {
        const { bytes, version } = readVersioned(repository.configPath);
        inputs.set(repository.configPath, version);
        if (bytes) projects.push({ repository: repository.key, top: parseYaml(bytes.toString("utf8")) });
      } catch { /* that project's own load reports it */ }
    }
    return missingPlayersOf(ownTop, projects);
  }

  /** Where an application owner keeps its assets (media-4): a spex
   * repository's ignored staging owner, an intent's directory beside its
   * file, an authoring session's beside its file. */
  private mediaDirectory(owner: MediaUploadOwner): string {
    if (owner.kind === "project") {
      const repository = this.store.repository(owner.id);
      if (!repository) throw noProject(owner.id);
      return join(repository.dir, UPLOAD_STAGING);
    }
    if (owner.kind === "intent") return this.store.intentAssetsDir(owner.intentId, owner.projectId);
    return this.drafts.assetsDir(owner.id);
  }

  /**
   * Resolve the home's interface language and speak it from here on
   * (core-service-111, localization-2): the stored choice, or with none
   * the reader's system — the languages the embedding shell passed at
   * start, or this process's own locale where a shell passed none.
   */
  private speakHomeLanguage(): Language {
    const language = resolveLanguage(this.store.interfaceLanguage(), this.preferredLanguages());
    speak(language);
    return language;
  }

  /** The reader's system languages: those the embedding shell passed
   * at start, or this process's own locale where a shell passed none. */
  private preferredLanguages(): readonly string[] {
    return this.options.systemLanguages ?? [Intl.DateTimeFormat().resolvedOptions().locale];
  }

  /** The home's interface language as it resolves now (core-service-108,
   * localization-2) — the stored choice, else the reader's system, else
   * `en` — the language a new playbook is authored in where neither its
   * package nor its project names one (playbook-library-70). */
  private homeLanguage(): Language {
    return resolveLanguage(this.store.interfaceLanguage(), this.preferredLanguages());
  }

  private requireSpace(): SpaceManager {
    return this.space;
  }

  /**
   * Every session of a clone a removal deletes, held under Playbook's
   * management lease (projects-10): a lease another writer holds — a
   * running turn here or a terminal's — refuses the removal `busy`.
   * `check` is the removal's own instant: called synchronously inside
   * the removal itself, with nothing awaited before the deletion, it
   * refuses as a change meanwhile a session that appeared while the
   * leases were taken, or a clone moved or replaced since. Your own
   * group's clone is never deleted.
   */
  private async leaseClone(key: string): Promise<{ leases: { release(): Promise<unknown> }[]; check(): void }> {
    const repository = this.store.repository(key);
    if (!repository || key === this.store.home.own()) return { leases: [], check: () => undefined };
    const identity = (): string | undefined => {
      try { const info = statSync(repository.dir); return `${info.dev}:${info.ino}`; } catch { return undefined; }
    };
    // A session stands on disk by any of its files: Playbook publishes
    // its lease `.<id>.lock` before it writes `<id>.json`, and lists a
    // session by its records too.
    const sessionIds = (): string[] => {
      if (!existsSync(repository.sessionsDir)) return [];
      const ids = new Set<string>();
      for (const file of readdirSync(repository.sessionsDir)) {
        const id = /^\.(.+)\.lock$/.exec(file)?.[1] ?? /^(.+?)(?:\.records\.jsonl|\.json)$/.exec(file)?.[1];
        if (id && UUID.test(id)) ids.add(id);
      }
      return [...ids].sort();
    };
    const clone = identity();
    const stands = (): boolean => clone !== undefined && this.store.repository(key)?.dir === repository.dir && identity() === clone;
    const changed = (): CoreError => new CoreError("conflict", i18n._({
      id: "The records of {name} changed meanwhile — Retry",
      values: { name: splitKey(key).name.replace(/-spex$/i, "") || splitKey(key).name },
      comment: "Refusal: the project's records changed between Spex's read and its write — moved, or their remote set from a terminal; {name} is the project",
    }));
    const held: { sessionId: string; release(): Promise<unknown> }[] = [];
    try {
      for (const id of sessionIds()) {
        // Each acquisition is asked of the clone where it still stands; a
        // clone moved or removed meanwhile is a change, never a holder.
        if (!stands()) throw changed();
        try { held.push(await repository.store.acquireManagement(id)); }
        catch {
          if (!stands()) throw changed();
          throw new CoreError("busy", i18n._({
            id: "wait for the project's running turn to finish, or abort it, before removing it",
            comment: "Refusal: a turn is running in the project being removed",
          }));
        }
      }
    } catch (error) {
      await Promise.allSettled(held.map((lease) => lease.release()));
      throw error;
    }
    const leased = new Set(held.map((lease) => lease.sessionId));
    return {
      leases: held,
      check: () => {
        if (stands() && sessionIds().every((id) => leased.has(id))) return;
        throw changed();
      },
    };
  }

  /** Announce ledger changes debounced (DR-035): session records land
   * in bursts, and every consumer re-pulls the one fold on receipt, so
   * a trailing edge per burst is all the truth costs. */
  private queueLedgerChange(projectIds: string[]): void {
    for (const projectId of projectIds) this.ledgerChanged.add(projectId);
    if (this.ledgerTimer) return;
    this.ledgerTimer = setTimeout(() => {
      this.ledgerTimer = undefined;
      const projects = [...this.ledgerChanged];
      this.ledgerChanged.clear();
      if (projects.length > 0) {
        this.broadcast({ type: "intents.changed", projectIds: projects });
        this.events.onLedgerChange?.();
      }
    }, 200);
  }

  /** The one attention count the shell's badge shows
   * (core-service-129): this core's badge (core-service-49) plus each
   * seat's last read badge while its relay stands open or closed, none
   * for a mismatched seat. */
  attentionCount(): number {
    return this.ledger().badge + this.places.badges();
  }

  /** The one ledger fold (DR-035). */
  ledger(): import("./protocol.js").LedgerState {
    return foldLedger({
      store: this.store,
      lanes: this.ledgerLanes(),
      // This runtime's: another's records summon nothing here, and run
      // nowhere but there (DR-134); on a seat an intent holding no
      // runtime runs nowhere (core-service-125).
      device: this.store.home.device,
      seat: !!this.seat,
      now: Date.now,
    });
  }

  /** The ledger keeps the lane busy through release and the one-shot
   * handoff decision, so no consumer sees a manual Start flicker. */
  private ledgerLanes() {
    return this.sessions.listLanes().map((lane) => {
      return this.handoffs.has(lane.sessionId)
        ? { ...lane, settling: true }
        : lane;
    });
  }

  static async start(options: CoreServiceOptions = {}): Promise<CoreService> {
    // The core's work runs in an async context of its own, so the
    // processes it starts are told from its host's (core-service-39).
    const started = new StartedProcesses();
    return started.run(() => CoreService.boot(options, started));
  }

  /** A seat's credential store and the environment its runs inherit
   * (core-service-126), for the seat's home. */
  private static seatCredentials(options: CoreServiceOptions, dir: string): { credentials: CodeCredentialStore; environment: SeatEnvironment } {
    const credentials = codeCredentialStore(dir);
    const environment = new SeatEnvironment(process.env, options.seat?.sharedCredentialFile, () => credentials.readAgents());
    return { credentials, environment };
  }

  private static async boot(options: CoreServiceOptions, started: StartedProcesses): Promise<CoreService> {
    if (process.platform !== "darwin" && process.platform !== "linux") {
      throw new Error(i18n._({
        id: "Spex desktop and server require macOS or Linux with private POSIX file permissions. On Windows, use the scaffold CLI or connect to a Spex server in your browser.",
        comment: "Startup refusal shown in the shell's dialog on an unsupported host",
      }));
    }
    if (options.dataDir) ApplicationMedia.assertStagingParents(options.dataDir);
    // A seat's facts are checked before anything opens (core-service-125).
    if (options.seat) options = { ...options, seat: checkSeat(options.seat) };
    const env = options.env ?? process.env;
    // The store's load composes diagnostics, so the home's stored
    // language is spoken before it opens (core-service-111); the full
    // resolution re-reads it through the opened store.
    if (options.dataDir) speak(resolveLanguage(readStoredLanguage(options.dataDir), options.systemLanguages ?? [Intl.DateTimeFormat().resolvedOptions().locale]));
    // A config still at a former location relocates once, nearest
    // first, before seeding could shadow it and before the library
    // relocation rewrites `from` paths in it (core-service-66).
    // An explicit --config is the operator's path and moves nothing.
    const dataDir = options.dataDir;
    const relocateConfig = options.configPath === undefined && dataDir
      ? (configPath: string): void => {
        const former = resolveFormerConfigPaths({ ...env, SPEX_HOME: dataDir }, options.home ?? env.HOME ?? homedir());
        for (const path of former) {
          if (relocateLegacyConfig(configPath, path, dataDir)) break;
          // The nearer location answers for the home: where that path
          // still holds something — refused, or not a file at all — no
          // older one is published past it (core-service-66).
          if (existsSync(path)) break;
        }
      }
      : undefined;
    // The root lease carries this machine's identity (core-service-61,
    // storage-26), read once through Playbook's facade before the store
    // takes the lease; an unusable identity file refuses the start
    // naming it, before the lease is inspected.
    let machineIdentity = options.machineIdentity;
    if (machineIdentity === undefined && dataDir) {
      try {
        machineIdentity = await resolveMachineIdentity({ env, homeDir: options.home ?? env.HOME ?? homedir() });
      } catch (error) {
        throw new Error(i18n._({
          id: "Spex cannot identify this computer: {reason}",
          comment: "Startup refusal the shell shows in a dialog; the reason names Playbook's machine identity file",
          values: { reason: error instanceof Error ? error.message : String(error) },
        }));
      }
    }
    // The home opens under its lease, migrating the former layout once
    // before any writer is admitted (storage-9, core-service-15). Every
    // clone the store makes requests the built-in spec package before
    // its first commit (storage-6, environments-11).
    const builtin = CoreService.shippedBuiltin(options);
    // A seat reads its credentials into the environment before the
    // store seeds your own group's config from them (core-service-126,
    // core-service-3).
    const seat = options.seat && dataDir ? CoreService.seatCredentials(options, resolve(dataDir)) : undefined;
    seat?.environment.prepare();
    // A start that fails before the service stands puts the environment
    // back, as a stop does (core-service-126).
    let store: Store;
    try {
      store = await Store.open({
        ...(options.dataDir ? { dir: options.dataDir } : {}),
        ...(machineIdentity !== undefined ? { machineIdentity } : {}),
        ...(options.legacyDbPath ? { legacyDbPath: options.legacyDbPath } : {}),
        ...(options.own ? { own: options.own } : {}),
        env: seat ? seat.environment.envFor(env) : env,
        ...(options.home !== undefined ? { home: options.home } : {}),
        ...(options.dataDir ? { libraryDir: options.libraryDir ?? join(options.dataDir, "playbooks") } : {}),
        ...(relocateConfig ? { relocateConfig } : {}),
        ...(builtin ? { prepareRepository: (dir: string, _key: string, registryOrigin: string, space: string | null) => { prepareBuiltinEnvironment(dir, builtin, registryOrigin, space); } } : {}),
      });
    } catch (error) { seat?.environment.restore(); throw error; }
    let service: CoreService;
    try { service = new CoreService(options, store, started, seat); }
    catch (error) {
      try { store.close(); } finally { seat?.environment.restore(); }
      throw error;
    }
    // A seat reads its credentials into the environment at start
    // (core-service-126).
    service.seatEnvironment?.prepare();
    try {
    // A seat's account names the app's helper in its member mode, for
    // the Git its agents run (core-service-125, git-host-9).
    await service.configureSeatGit();
    // Store construction already holds the exclusive home lease. Never
    // reclaim another live core's incomplete uploads before that boundary.
    await service.media.prepare();
    service.store.markAllSessionsNotLive();
    service.relocateLegacyLibrary();
    // The store seeds your own group's config as the clone stands up;
    // the core reports that starter as its own seed (settings-9).
    const version = seedConfig(service.configPath, service.seedEnv(), service.home);
    if (version !== null) store.recordSeed(service.configPath, version);
    service.seeded = version !== null ||
      (service.configPath === store.ownRepository().configPath && store.seededConfig);
    // An untouched seed follows the credentials it was chosen from
    // (core-service-137).
    if (service.reseed()) service.reseeded = true;
    if (service.options.dataDir) migrateManagedLibraryConfig(service.configPath, service.libraryDir(), service.options.dataDir);
    // An apply a crash interrupted is repaired from its marker before the
    // clone reopens (space-31); a failure stands as a blocking issue.
    await service.space.repairAtStartup();
    // The built-in spec package is seeded and every environment installed
    // and exported before the config composes from them (environments-11,
    // environments-9).
    await service.environments.startup();
    await service.reloadConfig();
    await service.migrateLegacySessionDefault();
    await service.store.initializeSessions();
    await service.syncForeignSessions();
    // A restore a stopped core left without its recorded position is
    // completed before anything reads the ledger (core-service-82).
    await service.sessions.completeRestores();
    service.store.validateStorage();
    // A compile running when the core last stopped reads as interrupted
    // (playbook-library-59); a person restarts it.
    service.authors.start();
    for (const repository of service.store.listRepositories()) {
      try { prepareStorageGitFiles(repository.dir, service.store.untrackedSessionPaths(repository.key)); }
      catch (error) { console.error(`spex: sync rules of ${repository.key} not refreshed: ${String(error)}`); }
    }
    if (options.watchConfig !== false) {
      service.watchConfigFile();
      service.watchRepositories();
    }
    // Every seat the seats file holds is read and announced
    // (core-service-128); each client is sent them as it connects.
    service.places.start();
    await service.listen(options.port ?? 0);
    service.started = true;
    return service;
    } catch (error) {
      await service.stop();
      throw error;
    }
  }

  /**
   * Serve the sessions another host wrote into a clone's shared session
   * store (core-service-60), and forget the ones whose record left it
   * (core-service-76). Called once before serving and again whenever
   * a captain-session record or replay stream changes, so terminal
   * sessions join the listing, keep their history current, and leave
   * it when removed.
   */
  private adoptScan: Promise<void> = Promise.resolve();

  private syncForeignSessions(): Promise<void> {
    const scan = this.adoptScan.then(() => this.scanSessions());
    this.adoptScan = scan.catch(() => {});
    return scan;
  }

  private async scanSessions(): Promise<void> {
    let changed: Awaited<ReturnType<Store["adoptForeignSessions"]>>;
    let vanished: { id: string; projectId: string }[];
    try {
      changed = await this.store.adoptForeignSessions();
      vanished = this.store.forgetVanishedForeignSessions();
    } catch {
      // Another host's directory is not ours to depend on: an
      // unreadable one costs its sessions, never this service.
      return;
    }
    const projectIds = new Set<string>();
    await this.refreshReportedContinuations();
    for (const { id: sessionId, appended, replaced, unlistedProjectId } of changed) {
      if (unlistedProjectId) {
        this.broadcast({ type: "session.removed", sessionId, projectId: unlistedProjectId });
        projectIds.add(unlistedProjectId);
        continue;
      }
      const session = this.store.describeSession(sessionId);
      if (!session) continue;
      if (replaced) this.broadcast({type:"session.history-replaced", sessionId});
      this.broadcast({ type: "session.state", session });
      for (const entry of appended) {
        this.dispatchRecord({
          sessionId,
          ...entry,
          hidden: "visibility" in entry.record && entry.record.visibility === "hidden",
        });
      }
      projectIds.add(session.projectId);
    }
    for (const { id, projectId } of vanished) {
      this.broadcast({ type: "session.removed", sessionId: id, projectId });
      projectIds.add(projectId);
    }
    if (projectIds.size > 0) this.queueLedgerChange([...projectIds]);
    // A session that joins the listing — its project registered, or
    // another host's writes read — may hold a restore a stopped core
    // left unrecorded (core-service-82).
    const joined = changed.filter((entry) => !entry.unlistedProjectId).map((entry) => entry.id);
    if (joined.length > 0) await this.sessions.completeRestores(joined);
  }

  /** The playbook CLI's former XDG sessions import once into your own
   * group's spex repository (storage-18). */
  private async migrateLegacySessionDefault(): Promise<void> {
    if (!this.options.dataDir || this.env.SPEX_HOME?.trim() ||
      resolve(this.options.dataDir) !== resolve(this.home,".spex")) return;
    let config: unknown;
    try { config = parseYaml(readFileSync(this.configPath,"utf8")); }
    catch { return; }
    if (!config || typeof config !== "object" || Object.hasOwn(config,"sessions")) return;
    const result = await this.store.sessionStore().migrateLegacyDefault({env:this.env,homeDir:this.home});
    for (const entry of result.skipped) this.migrationDiagnostics.push({
      file:join(result.sourceDir,`${entry.sessionId}.json`), reason:entry.reason, blocking:false,
    });
  }

  /** One watcher per clone's `sessions/`; a clone that appeared gets
   * one, a clone that left loses its own. */
  private watchRepositories(): void {
    const keys = new Set(this.store.listRepositories().map((repository) => repository.key));
    for (const [key, watcher] of [...this.sessionsWatchers]) {
      if (keys.has(key)) continue;
      watcher.close();
      this.sessionsWatchers.delete(key);
    }
    for (const repository of this.store.listRepositories()) {
      if (this.sessionsWatchers.has(repository.key) || !existsSync(repository.sessionsDir)) continue;
      const key = repository.key;
      this.sessionsWatchers.set(key, watch(repository.sessionsDir, (_eventType, filename) => {
        // The CLI can append without replacing its manifest. Our own
        // sidecars are irrelevant, and the store excludes owned sessions
        // when a shared stream changes. A missing filename means scan.
        if (filename && (
          (!filename.endsWith(".json") && !filename.endsWith(".records.jsonl") && !/^\.[0-9a-f-]{36}\.lock$/.test(filename)) ||
          filename.endsWith(".spex.json")
        )) {
          return;
        }
        if (filename?.endsWith(".records.jsonl") || filename?.endsWith(".replay.json")) {
          const session = this.store.describeSession(filename.replace(/\.(?:records\.jsonl|replay\.json)$/, ""));
          if (session?.live && !session.externalWriter) return;
        }
        // Bound the wait even while a CLI keeps writing: later events
        // join this scan instead of postponing it until the writer stops.
        if (this.adoptTimer) return;
        this.adoptTimer = setTimeout(() => {
          this.adoptTimer = undefined;
          void this.syncForeignSessions();
        }, 150);
      }));
    }
    this.watchProjectConfigs();
  }

  /**
   * One watcher per clone's `config/playbook.config.yaml` beside your
   * own group's (core-service-2): a change reloads the composed state.
   * A clone with no `config/` yet is watched for its appearing, then
   * inside it; a clone that left, or moved, loses its own.
   */
  private watchProjectConfigs(): void {
    if (this.options.watchConfig === false || this.stopping) return;
    const own = resolve(this.configPath);
    const wanted = new Map<string, SpexRepository>();
    for (const repository of this.store.listRepositories()) {
      if (repository.key !== this.store.home.own() && resolve(repository.configPath) !== own) wanted.set(repository.key, repository);
    }
    const target = (repository: SpexRepository): string | undefined => {
      const configDir = dirname(repository.configPath);
      if (existsSync(configDir)) return configDir;
      return existsSync(repository.dir) ? repository.dir : undefined;
    };
    for (const [key, entry] of [...this.configWatchers]) {
      const repository = wanted.get(key);
      if (repository && target(repository) === entry.dir) continue;
      entry.watcher.close();
      this.configWatchers.delete(key);
    }
    for (const [key, repository] of wanted) {
      if (this.configWatchers.has(key)) continue;
      const dir = target(repository);
      if (!dir) continue;
      const configDir = dirname(repository.configPath);
      const name = dir === configDir ? basename(repository.configPath) : basename(configDir);
      try {
        const watcher = watch(dir, (_eventType, filename) => {
          if (filename && filename !== name) return;
          // `config/` appeared: the file inside it is watched from now.
          if (dir !== configDir) this.watchProjectConfigs();
          this.scheduleReload();
        });
        watcher.on("error", () => {
          watcher.close();
          if (this.configWatchers.get(key)?.watcher === watcher) this.configWatchers.delete(key);
        });
        this.configWatchers.set(key, { dir, watcher });
      } catch {
        // A folder that left between the check and the watch: the next
        // change of the clones watches again.
      }
    }
  }

  /** A config file changed on disk: reload once the writes settle. */
  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      void this.reloadConfig();
    }, 150);
  }

  /** The compiled-playbook library home (DR-005, DR-036): under the
   * state root when one is set, the pre-DR-036 XDG default otherwise. */
  private libraryDir(): string {
    return (
      this.options.libraryDir ??
      (this.options.dataDir
        ? join(this.options.dataDir, "playbooks")
        : join(
            this.env.XDG_DATA_HOME || join(this.home, ".local", "share"),
            "spex",
            "playbooks",
          ))
    );
  }

  /** The one-time library relocation riding the import (CORE-64): a
   * legacy library moves into the root and the config's `from` paths
   * follow, comment-preservingly. */
  private relocateLegacyLibrary(): void {
    if (!this.options.dataDir) return;
    const legacy =
      this.options.legacyLibraryDir ??
      join(
        this.env.XDG_DATA_HOME || join(this.home, ".local", "share"),
        "spex",
        "playbooks",
      );
    const target = this.libraryDir();
    if (legacy === target || !existsSync(legacy) || existsSync(target)) return;
    // Copy, repoint, then delete: a crash at any point leaves every
    // `from` path aimed at a directory that still exists.
    cpSync(legacy, target, { recursive: true });
    rewriteLibraryPaths(this.configPath, legacy, target);
    rmSync(legacy, { recursive: true, force: true });
  }

  port(): number {
    const address = this.endpoint?.address() as AddressInfo | null | undefined;
    if (!address || typeof address === "string") {
      throw new Error("service is not listening");
    }
    return address.port;
  }

  configStateSnapshot(): ConfigState {
    return this.configState;
  }

  /** The config's own refusal (core-service-111): the core's frame
   * around the errors it composed, or the missing file — phrased when
   * the refusal is raised, never when the file was read. */
  private configRefusal(): string {
    return this.configState.status === "invalid"
      ? i18n._({
          id: "config is invalid: {errors}",
          comment:
            "Refusal: the config file failed to load; `errors` are the config errors themselves",
          values: {
            errors: this.configState.errors.join(
              i18n._({ id: "; ", comment: "Separates reasons listed in one message" }),
            ),
          },
        })
      : i18n._({
          id: "config file is missing",
          comment: "Refusal: no config file exists at the path the core reads",
        });
  }

  /** The home's interface language, or null for the reader's system
   * (core-service-108, DR-078): the embedding shell reads it in
   * process for the text it composes itself, so its notifications and
   * dialogs speak the language every page of the home speaks. */
  language(): Language | null {
    return this.store.interfaceLanguage();
  }

  /** Config notification preferences (event -> off|bell|desktop). */
  notificationPrefs(): Record<string, string> {
    const prefs = this.composed?.notifications;
    return typeof prefs === "object" && prefs !== null
      ? (prefs as Record<string, string>)
      : {};
  }

  /** True while any live session has an active boss turn. */
  hasActiveTurns(): boolean {
    return this.sessions
      .listSessions()
      .some((session) => session.live && this.sessions.getLive(session.id)?.turnActive);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.sessions.beginShutdown();
    // The stop is bounded (core-service-39, DR-134): every active turn
    // is aborted as admission closes; once those turns have settled, or
    // ten seconds after the stop began, the agent processes still alive
    // receive SIGTERM, and SIGKILL five seconds later, after which the
    // stop waits for nothing it has not confirmed.
    const turnsSettled = this.sessions.abortAll(CORE_STOP_REASON);
    const bound = new StopBound({
      settleMs: this.options.stop?.settleMs ?? 10_000,
      killMs: this.options.stop?.killMs ?? 5_000,
      agentProcesses: this.options.agentProcesses ?? (() => this.startedProcesses.pids()),
    });
    try {
      this.approvals.stop();
      // Every seat's relay ends; the seats stand in their file, reopened at
      // the next start (DR-133).
      this.places.stop();
      for (const entry of this.browserPreparations.values()) entry.controller.abort();
      await bound.within(Promise.allSettled([...this.browserPreparations.values()].map(({done}) => done)));
      this.watcher?.close();
      for (const watcher of this.sessionsWatchers.values()) watcher.close();
      this.sessionsWatchers.clear();
      for (const { watcher } of this.configWatchers.values()) watcher.close();
      this.configWatchers.clear();
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      if (this.adoptTimer) clearTimeout(this.adoptTimer);
      // A Space transport in flight is stopped; a local step finishes.
      await bound.within(this.space.stop());
      // An environment's resolve or install finishes; nothing new starts.
      await bound.within(this.environments.stop());
      await bound.within(this.registry.stop());
      await bound.within(this.adoptScan);
      if (this.ledgerTimer) clearTimeout(this.ledgerTimer);
      // A draft compile cut here stays "running" on disk and reads as
      // interrupted at the next start (playbook-library-59); its turns
      // abort and are awaited so no Cligent outlives the core (DR-051).
      this.authors.markStopping();
      // Kill any in-flight compile child so shutdown never orphans slc.
      for (const handles of this.standaloneCompiles.values()) for (const controller of handles) controller.abort();
      // A disposal failure must not leave the endpoint or the store open
      // (CORE-39): finish the shutdown, then report it to the host.
      let failure: { error: unknown } | undefined;
      try {
        await bound.within(Promise.all(this.advancing));
        // Settled turns hasten the signals only from here: nothing the
        // stop still waited on above is an agent's.
        if (turnsSettled) bound.whenSettled(turnsSettled);
        await this.sessions.disposeAll(bound.expired);
      } catch (error) {
        failure = { error };
      }
      await bound.within(this.authors.stopAll());
      await this.media.close();
      for (const client of this.clients) client.socket.close();
      if (this.endpoint && this.upgradeListener) this.endpoint.removeListener("upgrade", this.upgradeListener);
      await bound.within(new Promise<void>((resolveClose) =>
        this.wss ? this.wss.close(() => resolveClose()) : resolveClose(),
      ));
      // The loopback server this core bound goes with it; a shell's
      // server is the shell's to close.
      if (this.endpoint && !this.options.httpServer) {
        const own = this.endpoint;
        await bound.within(new Promise<void>((resolveClose) => {
          own.close(() => resolveClose());
          own.closeIdleConnections();
        }));
      }
      // An agent SIGTERM reached ends, or SIGKILL ends it, before the
      // home's lease goes.
      await bound.drain();
      // No draft is written once the authors have stopped; a scratch
      // home goes with its store, and the root lease is released.
      this.store.close();
      if (failure) throw failure.error;
    } finally {
      bound.clear();
      // The forms go back as the process started with them, however far
      // the stop got (core-service-126).
      this.seatEnvironment?.restore();
    }
  }

  // -- config ---------------------------------------------------------------

  async reloadConfig(): Promise<void> {
    const generation = ++this.reloadGeneration;
    const work = this.reloadNow(generation).finally(() => {
      if (this.reloading === work) this.reloading = undefined;
    });
    this.reloading = work;
    await work;
  }

  /** A message applies the file's latest settings (core-service-92): a
   * reload the watcher scheduled or started is awaited before a session
   * opens, so the debounce window never applies stale settings. */
  /** core-service-100: accept a change to one agent's settings only if
   * the projection the session's next message would open on validates
   * with it applied, then persist it and republish the session
   * (DR-067, DR-068). */
  private async setSessionAgent(command: {sessionId: string; agentId: string; model?: string | false | null; subagentModel?: string | false | null; effort?: string | false | null; subagentEffort?: string | false | null; fastMode?: boolean | null; browser?: boolean | null}): Promise<SessionInfo> {
    const session = this.store.describeSession(command.sessionId);
    if (!session) throw noSession(command.sessionId);
    const project = this.store.getProject(session.projectId);
    if (!project) throw new CoreError("invalid_request", i18n._({
      id: "bind the existing project before changing its session's agents",
      comment:
        "Refusal: the session's project has no folder on this device yet",
    }));
    const composed = await this.composedFor(project.id);
    const known = command.agentId === CAPTAIN_AGENT_ID || session.players.some(({id}) => id === command.agentId);
    if (!known) throw new CoreError("invalid_request", i18n._({
      id: "session {sessionId} has no agent \"{agentId}\"",
      comment: "Refusal: the session holds no agent of that id",
      values: { sessionId: session.id, agentId: command.agentId },
    }));

    // Every await this change needs happens before the stored settings
    // are read, so read, validate and write run without one between them:
    // a second change arriving meanwhile cannot be clobbered by a value
    // this one read before it landed.
    const stored = await this.sessions.storedStructure(session.id).catch(() => undefined);
    const current = this.store.sessionAgentSettings(session.id) ?? {};
    const entry: SessionAgentSettings = {...current[command.agentId]};
    for (const field of ["model", "subagentModel", "effort", "subagentEffort"] as const) {
      const change = command[field];
      if (change === undefined) continue;
      if (change === null) delete entry[field];
      else entry[field] = change;
    }
    if (command.fastMode === null) delete entry.fastMode;
    else if (command.fastMode !== undefined) entry.fastMode = command.fastMode;

    if (command.browser === null) delete entry.browser;
    else if (command.browser !== undefined) entry.browser = command.browser;

    const next: SessionAgentSettingsMap = {...current};
    if (Object.keys(entry).length > 0) next[command.agentId] = entry;
    else delete next[command.agentId];

    // The same rules the open path enforces, run here and locally: a
    // value the adapter cannot enforce is refused with nothing written,
    // and runtime discovery gates no save (DR-052).
    try {
      executionConfig(composed, project.path, stored ? storedMembers(stored) : undefined, next);
    } catch (cause) {
      throw new CoreError("invalid_config", cause instanceof Error ? cause.message : String(cause));
    }
    this.store.setSessionAgentSettingsMap(session.id, next);
    await this.refreshContinuationReadings([session.id]);
    const updated = this.sessions.listSessions().find(({id}) => id === session.id) ?? this.store.describeSession(session.id);
    if (!updated) throw noSession(session.id);
    this.broadcast({ type: "session.state", session: updated });
    this.events.onSessionState?.(updated);
    return updated;
  }

  /**
   * The configuration a session of this project runs with
   * (core-service-2): your own group's, with the project's own file on
   * top where its spex repository holds one. A project's file that
   * breaks the rules, or names a player yours lacks, is a config error
   * raised here, when a session of that project opens — never at load,
   * so sessions of other spex repositories are unaffected.
   */
  private async composedFor(projectId: string): Promise<ComposedConfig> {
    await this.settledConfig();
    return this.composeProject(projectId, true);
  }

  /** A selected folder's option context, guarded until its write or
   * admission. Reading the project refreshes the pairing from disk. */
  private projectConfigContext(projectId: string): { cwd?: string; assertCurrent: () => void } {
    const file = join(this.store.dir, "home.yaml");
    const version = inputVersion(file);
    const cwd = this.store.getProject(projectId)?.path;
    return { cwd, assertCurrent: () => {
      if (inputVersion(file) !== version) throw new VersionConflictError(file);
    } };
  }

  /** The composition of {@link composedFor} on the config already
   * loaded: `ready` first waits for the project's environment, which a
   * reload's own broadcast does not, its environment announcing itself
   * when it settles (environments-17). The files are read after that
   * wait and checked after composing: one changed meanwhile composes
   * once more, then the caller is refused to retry (DR-111). */
  private async composeProject(projectId: string, ready: boolean, observedInputs?: ConfigInputs): Promise<ComposedConfig> {
    const own = (): ComposedConfig => {
      if (this.configState.status !== "valid" || !this.composed) {
        throw new CoreError("invalid_config", this.configRefusal());
      }
      return this.composed;
    };
    own();
    const repository = this.store.repository(projectId);
    if (!repository) return own();
    // The session's playbooks come from the project's environment before
    // your own group's (environments-9), whether or not the project's
    // own file enables any; one not yet resolved resolves first.
    if (ready) await this.environments.ready(projectId);
    for (let attempt = 0; ; attempt += 1) {
      own();
      const inputs: ConfigInputs = new Map();
      const homeFile = join(this.store.dir, "home.yaml");
      inputs.set(homeFile, inputVersion(homeFile));
      const current = this.store.repository(projectId);
      if (!current) throw noProject(projectId);
      let result: { composed: ComposedConfig } | { error: unknown };
      try { result = { composed: await this.composeProjectOnce(current.configPath, projectId, inputs) }; }
      catch (error) { result = { error }; }
      const changed = changedInput(inputs);
      if (changed === undefined) {
        for (const [path, version] of inputs) observedInputs?.set(path, version);
        if ("error" in result) throw result.error;
        return result.composed;
      }
      if (attempt > 0) throw changedMeanwhile(changed);
    }
  }

  /** One read and composition of a project's configuration, recording
   * each file read in `inputs`. */
  private async composeProjectOnce(projectPath: string, projectId: string, inputs: ConfigInputs): Promise<ComposedConfig> {
    let file = this.configPath;
    const cause = (error: unknown): CoreError => new CoreError("invalid_config", i18n._({
      id: "{file}: {reason}", comment: "A storage fault as one line: the file, then the reason — itself a message",
      values: { file, reason: error instanceof Error ? error.message : String(error) },
    }));
    let projectTop: unknown;
    let ownTop: unknown;
    try {
      const project = readVersioned(projectPath);
      inputs.set(projectPath, project.version);
      if (project.bytes) file = projectPath;
      projectTop = project.bytes ? parseYaml(project.bytes.toString("utf8")) : undefined;
      const read = readVersioned(this.configPath);
      inputs.set(this.configPath, read.version);
      // Gone, the file is read once more for the system's own reason.
      ownTop = parseYaml((read.bytes ?? readFileSync(this.configPath)).toString("utf8"));
    } catch (error) {
      if (!inputs.has(projectPath)) inputs.set(projectPath, inputVersion(projectPath));
      if (!inputs.has(this.configPath)) inputs.set(this.configPath, inputVersion(this.configPath));
      throw cause(error);
    }
    // The session's playbooks run on the app's engine, whichever host
    // installed them (environments-9, playbook-library-46).
    await this.environments.prepareForUse(projectId);
    try {
      return await composeConfig(ownTop, this.options.loadModule, this.configPath, {
        modules: this.modulesRead(projectId, inputs),
        ...(file === projectPath && resolve(projectPath) !== resolve(this.configPath) ? { project: { top: projectTop, path: projectPath } } : {}),
        cwd: this.store.getProject(projectId)?.path,
      });
    } catch (error) { throw cause(error); }
  }

  /**
   * The configuration a session of this project runs with, as a state
   * a client reads (core-service-2, DR-104: every member gets the same
   * tools): your own group's summary with the project's file on top and
   * its environment's playbooks first; your own group's state while that
   * is not valid; and invalid, naming the cause, where the project's
   * file is refused.
   */
  private async projectConfigState(projectId: string, ready: boolean): Promise<ConfigState> {
    if (this.configState.status !== "valid") return this.configState;
    const repository = this.store.repository(projectId);
    if (!repository) throw noProject(projectId);
    try {
      const inputs = this.configInputs;
      const composed = await this.composeProject(projectId, ready);
      // Your own group's state, its notifications and theme, as its files
      // still stand after composing.
      const changed = this.cacheChanged(inputs);
      if (changed !== undefined) throw changedMeanwhile(changed);
      const own = this.configState;
      if (own.status !== "valid" || composed === this.composed) return own;
      // Notifications and theme are your own group's alone.
      const summary = summarizeConfig({ path: own.summary.path, raw: null, composed });
      return {
        ...own,
        summary: {
          ...summary,
          ...(own.summary.notifications !== undefined ? { notifications: own.summary.notifications } : {}),
          ...(own.summary.theme !== undefined ? { theme: own.summary.theme } : {}),
        },
      };
    } catch (error) {
      // A file changed meanwhile is no state of the files (DR-111).
      if (!(error instanceof CoreError) || error.code === "conflict") throw error;
      if (this.configState.status !== "valid") return this.configState;
      return {
        status: "invalid",
        path: existsSync(repository.configPath) ? repository.configPath : this.configPath,
        errors: [error.message],
      };
    }
  }

  /** Every project's composed configuration, for the broadcast; none
   * while your own group's is not valid. */
  private async projectConfigStates(): Promise<Record<string, ConfigState> | undefined> {
    if (this.configState.status !== "valid") return undefined;
    const out: Record<string, ConfigState> = {};
    for (const project of this.store.listProjects()) {
      try { out[project.id] = await this.projectConfigState(project.id, false); }
      catch (error) { console.error(`spex: the config of ${project.id} was not composed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return out;
  }

  /** Broadcast the config state with every project's composition,
   * unless a newer reload began or the files it stands on changed while
   * the compositions were read (DR-111); whether it was broadcast. */
  private async broadcastConfig(generation: number, inputs = this.configInputs): Promise<boolean> {
    const projects = await this.projectConfigStates();
    if (generation !== this.reloadGeneration || this.cacheChanged(inputs) !== undefined) return false;
    await this.refreshReportedContinuations();
    if (generation !== this.reloadGeneration || this.cacheChanged(inputs) !== undefined) return false;
    this.broadcast({ type: "config.state", state: this.configState, ...(projects ? { projects } : {}) });
    for (const session of this.sessions.listSessions()) {
      this.broadcast({type: "session.state", session});
      this.events.onSessionState?.(session);
    }
    return true;
  }

  /** Deterministic continuation admission, without opening a runtime or
   * touching hints/leases. The reading is volatile; admission checks again. */
  private async refreshContinuationReadings(ids = this.store.listSessions().map(({id}) => id)): Promise<void> {
    const ownInputs = this.configInputs;
    const inputs: ConfigInputs = new Map(ownInputs);
    const homeFile = join(this.store.dir, "home.yaml");
    inputs.set(homeFile, inputVersion(homeFile));
    const readings = new Map<string, string | undefined>();
    const configurations = new Map<string, Promise<ComposedConfig>>();
    for (const id of ids) {
      let reason: string | undefined;
      if (this.store.hasContinuableCheckpoint(id)) {
        const session = this.store.describeSession(id)!;
        const folder = this.store.home.folderOf(session.projectId);
        const cwd = this.store.sessionCwd(id);
        if (!folder || (cwd !== undefined && cwd !== folder.path && !folder.aliases?.includes(cwd))) {
          reason = i18n._({
            id: "this session ran in {cwd}; continue it on the computer whose folder it ran in",
            comment: "Refusal: the session's recorded working directory is not the project's folder on this computer",
            values: {cwd: cwd ?? ""},
          });
        } else {
          try {
            let configuration = configurations.get(session.projectId);
            if (!configuration) {
              configuration = this.composeProject(session.projectId, false, inputs);
              configurations.set(session.projectId, configuration);
            }
            const project = this.store.getProject(session.projectId);
            if (!project) throw noProject(session.projectId);
            await this.sessions.checkContinuation(project, await configuration, id);
          } catch (error) {
            if (error instanceof CoreError && error.code === "conflict") throw error;
            reason = error instanceof Error ? error.message : String(error);
          }
        }
      }
      readings.set(id, reason);
    }
    const changed = changedInput(inputs);
    if (ownInputs !== this.configInputs || changed !== undefined) throw changedMeanwhile(changed ?? this.configPath);
    for (const [id, reason] of readings) this.store.setContinuationRefusal(id, reason);
  }

  /** An editor race must not lose a turn's settlement, a rescan's
   * records or ledger notifications. Retry once, otherwise publish an
   * unprovable reading as history-only; a later read checks it afresh. */
  private async refreshReportedContinuations(ids = this.store.listSessions().map(({id}) => id), settleConfig = false): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        if (settleConfig) await this.settledConfig();
        await this.refreshContinuationReadings(ids);
        return;
      } catch (error) {
        if (attempt === 0 && error instanceof CoreError && error.code === "conflict") continue;
        const reason = error instanceof Error ? error.message : String(error);
        for (const id of ids) this.store.setContinuationRefusal(id, reason);
        return;
      }
    }
  }

  /** The config state as its files stand now: a reload pending or in
   * flight is awaited, and a file changed with no watcher's word yet
   * reloads once here; changed again meanwhile, the caller is refused
   * to retry (DR-111). */
  private async settledConfig(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = undefined;
      await this.reloadConfig();
    }
    while (this.reloading) await this.reloading;
    if (this.cacheChanged() === undefined) return;
    await this.reloadConfig();
    while (this.reloading) await this.reloading;
    const changed = this.cacheChanged();
    if (changed !== undefined) throw changedMeanwhile(changed);
  }

  /** The first file the published config state no longer stands on;
   * your own group's config where no load has been published. */
  private cacheChanged(inputs = this.configInputs): string | undefined {
    return inputs === undefined ? this.configPath : changedInput(inputs);
  }

  private async reloadNow(generation: number): Promise<void> {
    // Reloads overlap: the watcher fires and forgets, two command paths
    // await their own, and external edits add more. Each reload reads the
    // file at its own start, so the newest reload holds the newest content
    // and every superseded one must discard its work — committing it would
    // publish an older file's state, and a readiness probe that outlived a
    // newer reload would overwrite that reload's broadcast with entries
    // for a configuration no longer active. A file changed while the load
    // composed makes its result, valid or not, no state of the files:
    // it is read once more, else nothing is published and the next use
    // reads again (DR-111).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inputs: ConfigInputs = new Map();
      const next = await this.loadOwnConfig(inputs);
      if (generation !== this.reloadGeneration) return;
      if (changedInput(inputs) !== undefined) continue;
      this.composed = next.composed;
      this.configState = next.state;
      this.configInputs = inputs;
      // Each broadcast awaits more reads: the files are checked after
      // them, and a change is no state to announce.
      if (!(await this.broadcastConfig(generation, inputs))) {
        if (generation !== this.reloadGeneration) return;
        continue;
      }
      const entries = await this.readiness();
      if (generation !== this.reloadGeneration) return;
      if (changedInput(inputs) !== undefined) continue;
      this.broadcast({ type: "readiness.state", entries });
      return;
    }
  }

  /** The environment a seed reads: on a seat, the one its runs inherit
   * (core-service-3, core-service-126). */
  private seedEnv(): NodeJS.ProcessEnv {
    return this.seatEnvironment ? this.seatEnvironment.envFor(this.env) : this.env;
  }

  /** Reseed your own group's config while it stands at the version the
   * core seeded (core-service-137, DR-156); true where it was rewritten.
   * A file no longer at that version loses its record for good. */
  private reseed(): boolean {
    const record = this.store.getPref<unknown>(SEED_PREF);
    if (!isSeedRecord(record) || record.path !== this.configPath) return false;
    let result: ReturnType<typeof reseedConfig>;
    try { result = reseedConfig(this.configPath, record.version, this.seedEnv(), this.home); }
    catch { return false; }
    if (result.outcome === "edited") {
      try { this.store.deletePref(SEED_PREF); } catch { /* the next start drops it */ }
      return false;
    }
    if (result.outcome === "kept") return false;
    this.store.recordSeed(this.configPath, result.version);
    return true;
  }

  /** Your own group's config state, recording each file read in `inputs`. */
  private async loadOwnConfig(inputs: ConfigInputs): Promise<{ state: ConfigState; composed: ComposedConfig | undefined }> {
    let nextState: ConfigState;
    let nextComposed: ComposedConfig | undefined;
    // Read before any migration; the load reports the bytes it composed.
    inputs.set(this.configPath, inputVersion(this.configPath));
    if (inputs.get(this.configPath) === null) {
      nextState = { status: "missing", path: this.configPath };
      nextComposed = undefined;
    } else {
      // Your own group's playbooks run on the app's engine, whichever
      // host installed them (environments-9, playbook-library-46).
      await this.environments.prepareForUse(null);
      try {
        const loaded = await loadConfig(this.configPath, this.options.loadModule, {
          modules: this.modulesRead(null, inputs),
          read: (version) => inputs.set(this.configPath, version),
        });
        nextComposed = loaded.composed;
        const missingPlayers = this.missingPlayers(loaded.raw, inputs);
        nextState = {
          status: "valid",
          summary: summarizeConfig(loaded),
          seeded: this.seeded,
          ...(this.reseeded ? { reseeded: true } : {}),
          ...(missingPlayers.length > 0 ? { missingPlayers } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nextState = {
          status: "invalid",
          path: this.configPath,
          errors: [message],
        };
        // A turn in flight keeps the config it opened with (core-service-2);
        // opening a runtime is refused until the file is valid again.
        nextComposed = undefined;
      }
    }
    return { state: nextState, composed: nextComposed };
  }

  private watchConfigFile(): void {
    const dir = dirname(this.configPath);
    const file = basename(this.configPath);
    if (!existsSync(dir)) return;
    this.watcher = watch(dir, (_eventType, filename) => {
      if (filename && filename !== file) return;
      this.scheduleReload();
    });
  }

  async readiness(): Promise<ReadinessEntry[]> {
    if (this.configState.status !== "valid") return [];
    const summary = this.configState.summary;
    // Adapter-keyed and deduplicated (DR-019): readiness is a
    // property of the adapter's auth, not of any one agent block.
    // Each entry names the positions using the adapter so guidance
    // points somewhere concrete.
    const positions = new Map<AdapterName, string[]>();
    const note = (adapter: AdapterName, position: string): void => {
      const list = positions.get(adapter);
      if (list) list.push(position);
      else positions.set(adapter, [position]);
    };
    note(summary.captain.adapter, "captain");
    // A position is a session player, named by its own id; the roles
    // it serves ride along, since one lane may answer several
    // (DR-032). A lane no role binds is listed for Settings and the
    // draft picker (settings-26, playbook-library-55) but probed here
    // for nothing: it opens no session, so an unused entry never
    // gates a first run, and the picker's chip reads it as unknown.
    for (const player of summary.players) {
      if (player.boundBy.length === 0) continue;
      note(player.agent.adapter, `${player.id} (${player.boundBy.join(", ")})`);
    }
    // On a seat the credential half is the forms a run would inherit
    // now, read as before a run (settings-49, core-service-126).
    const seat = this.seatEnvironment;
    const sources: SeatCredentialSources | undefined = seat?.prepare();
    const credentialHalf = seat && sources
      ? (adapter: AdapterName) => seatCredentialHalf(adapter, sources, seat.runValues(adapter), this.runCommand)
      : undefined;
    return Promise.all(
      [...positions.entries()].map(async ([adapter, usedBy]) => {
        const readiness = await checkAdapterReadiness(
          adapter,
          this.env,
          this.home,
          this.options.adapterRuntime ?? checkAdapterRuntime,
          credentialHalf,
        );
        this.readinessByAdapter.set(adapter, readiness.ready);
        return {
          adapter,
          ready: readiness.ready,
          ...(readiness.requirement
            ? { requirement: readiness.requirement }
            : {}),
          ...(readiness.credential ? { credential: readiness.credential } : {}),
          usedBy,
          // The embedded runtime declares which adapters take fast mode
          // (DR-038); the editor offers the switch only for those.
          fastModeSupported: isFastModeSupported(adapter),
          // Likewise for a subagent model (DR-093).
          subagentModelSupported: isSubagentModelSupported(adapter),
        };
      }),
    );
  }

  // -- websocket ------------------------------------------------------------

  /** The handshake token clients must present (?token=). */
  token(): string {
    return this.authToken;
  }

  /** The origins of every instance the home lists and of the one a
   * running sign-in names: those whose sign-in pages a shell may open in
   * the system browser (app-shell-37, app-shell-20). */
  instanceOrigins(): string[] {
    return this.space.instanceOrigins();
  }

  private async listen(port: number): Promise<void> {
    const verifyClient = (info: {
      origin?: string;
      req: { url?: string; headers: { host?: string } };
    }): boolean => {
      // Reject foreign browser origins outright: only the packaged
      // file:// renderer (origin "file://" or "null"), local dev
      // pages, a page served from the host this handshake itself
      // addressed (DR-033), and non-browser clients (no Origin
      // header) may connect.
      const origin = info.origin;
      if (
        origin &&
        origin !== "null" &&
        !origin.startsWith("file://") &&
        !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) &&
        !this.originMatchesRequestHost(origin, info.req.headers.host)
      ) {
        return false;
      }
      // The path `/`, or an open seat's relay path, admitted alike
      // (core-service-24, core-service-129); every other path refused.
      const path = requestPath(info.req.url);
      if (path !== "/" && !this.places.relaying(path)) return false;
      const query = new URL(info.req.url ?? "/", "ws://127.0.0.1").searchParams;
      return query.get("token") === this.authToken;
    };
    // The endpoint is an HTTP server: the shell's, or one this core
    // binds on loopback alone, answering its own HTTP requests with the
    // applets' reads and every other path 404 (core-service-1, applets-4).
    const server = this.options.httpServer ?? createHttpServer((req, res) => {
      if (!this.handleAppletRequest(req, res)) res.writeHead(404, { "content-length": 0 }).end();
    });
    this.endpoint = server;
    const wss = new WebSocketServer({ noServer: true, verifyClient });
    this.wss = wss;
    // A handshake under `/applets/` is refused 404 with an empty body
    // (applets-4); every other one is the WebSocket endpoint's to admit.
    this.upgradeListener = (req, socket, head) => {
      if (isAppletPath(req.url)) {
        this.applets.refuseUpgrade(req, socket);
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    };
    server.on("upgrade", this.upgradeListener);
    this.wss.on("connection", (socket, req) => {
      // A relay path's connection is the seat's: piped there, frames
      // unread, with no word of this core's (core-service-129).
      const path = requestPath(req.url);
      if (path !== "/") {
        this.places.pipe(path, socket);
        return;
      }
      const client: ClientState = { socket, channels: new Set() };
      this.clients.add(client);
      socket.on("close", () => {
        this.clients.delete(client);
        for (const entry of this.browserPreparations.values()) {
          if (entry.client === client) entry.controller.abort();
        }
      });
      // A shell's server delivers the message in the shell's context:
      // the command runs as the core's (core-service-39).
      socket.on("message", (data) => {
        this.startedProcesses.run(() => void this.handleMessage(client, String(data)));
      });
      this.send(socket, {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        coreVersion: CORE_VERSION,
      });
      this.send(socket, {type: "approval.state", state: this.approvals.snapshot()});
      this.send(socket, {type: "server.state", seats: this.places.state()});
    });
    if (this.options.httpServer) return; // the shell listens
    await new Promise<void>((resolveListen, rejectListen) => {
      const refuse = (error: Error) => rejectListen(error);
      server.once("error", refuse);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", refuse);
        resolveListen();
      });
    });
  }

  /** Answer an HTTP request under `/applets/` on the endpoint
   * (applets-4, server-shell-4): false, answering nothing, for any
   * other path, which the shell serves itself. */
  handleAppletRequest(req: IncomingMessage, res: ServerResponse): boolean {
    return this.applets.handle(req, res);
  }

  /** A browser Origin naming the host the request itself addressed. */
  private originMatchesRequestHost(origin: string, host?: string): boolean {
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) this.send(client.socket, message);
  }

  private dispatchRecord(envelope: RecordEnvelope): void {
    const channel = envelope.hidden ? "debug" : "session";
    const key = `${channel}:${envelope.sessionId}`;
    for (const client of this.clients) {
      if (client.channels.has(key)) {
        this.send(client.socket, {
          type: "record",
          channel,
          sessionId: envelope.sessionId,
          seq: envelope.seq,
          record: envelope.record,
          ...(envelope.role !== undefined ? { role: envelope.role } : {}),
        });
      }
    }
  }

  private async handleMessage(client: ClientState, raw: string): Promise<void> {
    const parsed = parseCommand(raw);
    if (!parsed.ok) {
      this.send(client.socket, {
        type: "reply",
        id: parsed.id ?? "",
        ok: false,
        error: { code: "invalid_message", message: parsed.error },
      });
      return;
    }
    const command = parsed.command;
    // Only reported sign-in needs a second message; fence it behind its
    // start reply even when a controlled provider settles immediately.
    let releaseReply: (() => void) | undefined;
    const replySent = command.type === "space.signin.start" && command.reportCompletion
      ? new Promise<void>((resolve) => { releaseReply = resolve; }) : undefined;
    try {
      const result = await this.execute(client, command, replySent);
      this.send(client.socket, {
        type: "reply",
        id: command.id,
        ok: true,
        result,
      });
    } catch (error) {
      const failure = coreErrorOf(error);
      this.send(client.socket, {
        type: "reply",
        id: command.id,
        ok: false,
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.details ? { details: failure.details } : {}),
        },
      });
    } finally {
      releaseReply?.();
    }
  }

  private async contextualBrowserAgent(command: Extract<Command, {type: "agent.capabilities" | "browser.prepare"}>) {
    let cwd = process.cwd();
    if (command.context?.kind === "project" || command.context?.kind === "intent") {
      const project = this.store.getProject(command.context.kind === "project" ? command.context.id : command.context.projectId);
      if (!project) throw new CoreError("invalid_request", i18n._({id: "Project is unavailable.", comment: "Refusal: the selected project is unavailable on this host"}));
      cwd = project.path;
    } else if (command.context?.kind === "draft") {
      if (!this.authors.has(command.context.id)) throw new CoreError("invalid_request", i18n._({id: "Draft is unavailable.", comment: "Refusal: the selected authoring draft does not exist"}));
      const packageDir = this.drafts.draftDir(command.context.id);
      if (packageDir === null) throw new CoreError("invalid_request", i18n._({id: "Draft is unavailable.", comment: "Refusal: the selected authoring draft does not exist"}));
      cwd = packageDir;
    }
    try {
      return await browserAgent(command.agent, cwd, command.context?.kind === "draft", this.adapterImports);
    } catch (cause) {
      throw new CoreError("invalid_config", cause instanceof Error ? cause.message : String(cause));
    }
  }

  private async execute(
    client: ClientState,
    command: Command,
    replySent?: Promise<void>,
  ): Promise<unknown> {
    if (this.stopping && ["session.create", "turn.submit", "session.restore", "session.control"].includes(command.type)) {
      throw new CoreError("busy", i18n._({id: "The core is stopping.", comment: "Refusal during core shutdown"}));
    }
    // On a seat no command names a working folder (core-service-125): a
    // project is opened from its group, the core allocating its folder.
    if (this.seat && (command.type === "project.register" || command.type === "project.rebind" || command.type === "project.create" ||
      (command.type === "space.join" && command.folder !== undefined))) {
      throw new CoreError("invalid_request", i18n._({
        id: "Projects on a server are opened from their group",
        comment: "Refusal on a team server's seat of a command naming a working folder: the server allocates every project's folder itself",
      }));
    }
    // A seat holds no seats of its own (core-service-125): its
    // `server.open` is refused before anything is asked; `server.list`,
    // `server.close` and `server.signin` answer as on any core.
    if (this.seat && command.type === "server.open") {
      throw new CoreError("invalid_request", i18n._({
        id: "Already on a server — open it from your computer",
        comment: "Refusal on a team server of opening another team server from it: a server opens no server of its own; the person opens it from their own computer",
      }));
    }
    // No operation refuses a command (space-21): each write is checked
    // at its own instant, against its file's version or its session's
    // lease.
    if (["project.create", "project.register", "project.rebind", "project.remove"].includes(command.type)) this.store.assertProjectsWritable();
    if (command.type === "session.create" || command.type === "intent.queue") this.store.assertWritable({projectId:command.projectId});
    if (command.type === "session.restore" || command.type === "session.discard" || command.type === "turn.submit" || command.type === "session.control") this.store.assertWritable({sessionId:command.sessionId});
    switch (command.type) {
      case "approval.list": return this.approvals.snapshot();
      case "approval.respond": return this.approvals.respond(command.generation, command.requestId, command.owner, command.decision);
      case "media.begin":
        return this.media.begin(command);
      case "media.chunk":
        return this.media.uploads.chunk(command.uploadId, command.offset, command.data);
      case "media.finish":
        return this.media.uploads.finish(command.uploadId);
      case "media.cancel":
        return this.media.uploads.cancel(command.uploadId);
      case "media.read":
        return this.media.read(command.owner, command.assetId, command.offset, command.length);
      case "agent.capabilities": {
        const agent = await this.contextualBrowserAgent(command);
        return agent.getCapabilities();
      }
      case "browser.prepare": {
        if (this.stopping || client.socket.readyState !== WebSocket.OPEN) {
          return {status: "cancelled"};
        }
        // The same preparation asked again joins the one running.
        const running = this.browserPreparations.get(command.operationId);
        if (running) return await running.done;
        const controller = new AbortController();
        const done = (async () => {
          const agent = await this.contextualBrowserAgent(command);
          return agent.prepareBrowser({
            timeoutMs: 900_000,
            abortSignal: controller.signal,
            onProgress: (progress) => this.send(client.socket, {type: "browser.progress", operationId: command.operationId, progress}),
          });
        })();
        this.browserPreparations.set(command.operationId, {client, controller, done});
        try { return await done; }
        finally { this.browserPreparations.delete(command.operationId); }
      }
      case "browser.cancel": {
        const entry = this.browserPreparations.get(command.operationId);
        const canceled = entry?.client === client;
        if (canceled) entry.controller.abort();
        return {canceled};
      }
      case "config.get":
        // The state as the files stand now, a change no watcher reported
        // yet read here (DR-111).
        await this.settledConfig();
        if (command.projectId === undefined) return this.configState;
        return this.projectConfigState(command.projectId, true);
      case "credential.list": {
        const credentials = this.codeCredentials;
        if (!credentials) throw credentialsOffSeat();
        return credentials.list();
      }
      case "credential.set":
      case "credential.remove": {
        // Each field is checked before anything is written; the entry is
        // replaced as read, in one synchronous step (settings-48,
        // storage-44).
        const credentials = this.codeCredentials;
        if (!credentials) throw credentialsOffSeat();
        if (command.kind === "host") {
          const host = credentialHost(command.name);
          const next = command.type === "credential.set" ? hostCredentialOf(command.values) : null;
          if (!credentials.replaceHost(host, credentials.readHost(host), next)) throw changedMeanwhile(codeCredentialsPath(this.store.dir));
        } else {
          const adapter = credentialAgent(command.name);
          const next = command.type === "credential.set" ? agentCredentialOf(adapter, command.values) : null;
          if (!credentials.replaceAgent(adapter, credentials.readAgent(adapter), next)) throw changedMeanwhile(codeCredentialsPath(this.store.dir));
          // An untouched seed follows the member's credentials
          // (core-service-137), read into the environment first.
          this.seatEnvironment?.prepare();
          if (this.reseed()) { this.reseeded = true; await this.reloadConfig(); }
          // The agent's credential class follows (settings-49): pushed
          // unless a newer change or a reload answers after it.
          const generation = this.reloadGeneration;
          const push = ++this.credentialPushes;
          void this.readiness().then((entries) => {
            if (generation === this.reloadGeneration && push === this.credentialPushes) this.broadcast({ type: "readiness.state", entries });
          }).catch(() => {});
        }
        return credentials.list();
      }
      case "readiness.get": {
        await this.settledConfig();
        // The probes await: their answer stands only on the files it read.
        const inputs = this.configInputs;
        const entries = await this.readiness();
        const changed = this.cacheChanged(inputs);
        if (changed !== undefined) throw changedMeanwhile(changed);
        return entries;
      }
      case "agent.options":
        return readAgentOptions(command.adapter, this.agentRunEnv(), this.options.discoverAgentModels);
      case "project.list":
        return this.store.listProjects();
      case "project.register": {
        const path = expandPath(command.path, this.home);
        if (!existsSync(path) || !statSync(path).isDirectory()) {
          throw new CoreError(
            "invalid_request",
            i18n._({
              id: "{path} is not a directory",
              comment:
                "Refusal: the path offered as a project is no directory on this device",
              values: { path },
            }),
          );
        }
        if (!(await isWorkTreeRoot(path, this.runCommand))) {
          // English, deliberately (core-service-111): the page matches
          // this phrase to offer Create instead, so it is wire text.
          throw new CoreError(
            "invalid_request",
            `${path} is not the root of a git work tree (run git init first, or use project.create)`,
          );
        }
        // The code's remote is written without a credential, and one
        // carrying any is refused before `project.json` is (space-5).
        const origin = await this.runCommand("git", ["remote", "get-url", "origin"], path);
        const remote = origin.code === 0 ? origin.stdout.trim() : "";
        if (/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i.test(remote)) {
          const checked = validateRemoteUrl(remote);
          if (!checked.ok) throw new CoreError("invalid_request", checked.reason);
        }
        // The folder pairs with a local spex repository in your own group
        // until a group is picked (storage-6).
        const pairedAlready = this.store.home.keyForFolder(resolve(path)) !== undefined;
        const registered = this.store.registerProject(path, basename(path), Date.now());
        // A folder newly paired: its environment — the one it holds, or
        // the one the store just wrote at its root — installs and exports
        // there (storage-6, environments-26, environments-31); one paired
        // already selects its pair and changes nothing.
        if (!pairedAlready) void this.environments.paired(registered.id).catch(() => {});
        this.afterRepositoriesChanged();
        await this.syncForeignSessions();
        // A folder paired with a group's own spex repository brings that
        // repository to the host as its first session would (space-65).
        void this.space.ensureGroupRepository(registered.id);
        this.announceGroups();
        return registered;
      }
      case "project.rebind": {
        const path = expandPath(command.path, this.home);
        if (!(await isWorkTreeRoot(path, this.runCommand))) {
          throw new CoreError("invalid_request", i18n._({
            id: "{path} is not the root of a git work tree",
            comment: "Refusal: the folder offered for rebinding is no git repository",
            values: { path },
          }));
        }
        if (this.sessions.listSessions().some((session) => session.projectId === command.projectId && session.live)) {
          throw new CoreError("busy", i18n._({
            id: "wait for the project's running turn to finish, or abort it, before rebinding",
            comment: "Refusal: a turn is running in the project being rebound",
          }));
        }
        const project = this.store.rebindProject({ id: command.projectId, path,
          ...(command.aliases ? { aliases: command.aliases } : {}) });
        // The folder now paired is exported into, its state broadcast
        // (environments-31); a session started meanwhile does not wait
        // for it.
        void this.environments.paired(project.id).catch(() => {});
        await this.syncForeignSessions();
        for (const session of this.sessions.listSessions()) {
          if (session.projectId !== project.id) continue;
          this.broadcast({type: "session.state", session});
          this.events.onSessionState?.(session);
        }
        this.announceGroups();
        return project;
      }
      case "storage.diagnostics":
        return foldDiagnostics([...this.migrationDiagnostics, ...this.store.storageDiagnostics(), ...this.store.sessionDiagnostics(), ...this.authors.diagnostics(), ...this.credentialDiagnostics()]);
      case "project.create": {
        const path = expandPath(command.path, this.home);
        const registered = this.store.getProjectByPath(path);
        if (registered) {
          // The registered path travels as a fact, so the page acts on
          // it without reading the refusal's words (core-service-111).
          throw new CoreError("conflict", i18n._({
            id: "{path} is already registered",
            comment: "Refusal: a project already holds this folder",
            values: { path },
          }), { path: registered.path });
        }
        if (command.example && command.scaffold) {
          // English, deliberately (core-service-111): no surface offers
          // both, so this names a caller's programming failure.
          throw new CoreError(
            "invalid_request",
            "example seeding and scaffold are mutually exclusive",
          );
        }
        try {
          if (command.example) {
            // Removing a project deliberately leaves its working folder.
            // Reopen that same Academy repository without copying over
            // any edits; every other occupied path remains a refusal.
            if (!(await isSeededAcademyProject(path, this.runCommand))) {
              await seedExampleProject({ path, run: this.runCommand });
            }
          } else {
            await createProjectRepo({
              path,
              scaffold: command.scaffold,
              scaffoldLanguage: command.scaffoldLanguage ?? this.spoken,
              run: this.runCommand,
              ...(this.options.scaffoldCommand
                ? {
                    scaffoldCommand: this.options.scaffoldCommand,
                    ...(this.options.scaffoldEnv
                      ? { scaffoldEnv: this.options.scaffoldEnv }
                      : {}),
                  }
                : {}),
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // A refused initial commit keeps Git's own output whole beside
          // the core's words (projects-34).
          throw new CoreError(
            "invalid_request",
            message,
            error instanceof InitialCommitRefusal ? { output: error.output } : undefined,
          );
        }
        const created = this.store.registerProject(path, basename(path), Date.now());
        void this.environments.paired(created.id).catch(() => {});
        this.afterRepositoriesChanged();
        this.announceGroups();
        return created;
      }
      case "project.status": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        const { originUrl, ...status } = await repoStatus(project.path, this.runCommand);
        // Only a remote outside the default instance's and every listed
        // instance's reported Git origin is named, with no user in it
        // (projects-36).
        return {
          ...status,
          ...(originUrl && this.space.codeRemoteKind(originUrl, this.space.instanceOriginOf(project.id)) === "external" ? { originUrl: displayRemote(originUrl) } : {}),
        };
      }
      case "forge.items": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        // The real origin stays internal for binding. A response's
        // guidance follows the origins known now, even from an older
        // cache, read against the project's instance first — its spex
        // repository's, the default instance where it has none; local
        // status never asks any instance (projects-7, -11).
        const status = await repoStatus(project.path, this.runCommand);
        const shown = (state: ForgeState): ForgeState => {
          if (!status.originUrl || state.repo) return state;
          const origin = this.space.instanceOriginOf(project.id);
          const kind = this.space.codeRemoteKind(status.originUrl, origin);
          if (kind === "external") return state;
          return { ...state, guidance: kind === "instance"
            ? i18n._({ id: "Issues and PRs come from GitHub · Code: {space}", values: { space: this.space.instanceNameOrDefault(origin) }, comment: "Forge setup guidance for code at the project's own Space, whose underlying Git system is never named; {space} is that Space's display name; the · separates two key phrases" })
            : i18n._({ id: "Issues and PRs come from GitHub", comment: "Forge setup guidance before every Space has reported where it keeps code, or for code at another Space; the actual remote and hostname stay internal" }) };
        };
        // The cache is persisted in the app store (dashboard-14), so a
        // restart serves the last lists rather than a blank.
        const cached = this.store.getForgeCache(project.id);
        if (
          !command.refresh &&
          cached &&
          Date.now() - cached.at < FORGE_CACHE_MS
        ) {
          // The lists travel with their fetch moment, so a client reading
          // the cache shows the data's age, not its own read's.
          return { ...shown(cached.state), at: cached.at };
        }
        const at = Date.now();
        const state = {
          ...shown(await this.forge.state(project.path, status.originUrl)),
          at,
        };
        this.store.setForgeCache(project.id, { at, state });
        return state;
      }
      case "project.remove": {
        // Removal forgets the working folder and deletes its spex
        // repository's clone; the folder and the host stay untouched
        // (projects-9, projects-10).
        const key = command.projectId;
        const assertProject = (): void => {
          if (!this.store.repository(key) && !this.store.home.folderOf(key)) throw noProject(key);
          if (key === this.store.home.own() && !this.store.home.folderOf(key)) throw noProject(key);
        };
        assertProject();
        // What no placement's `spex` holds asks a second confirmation
        // naming the count (projects-9).
        if (command.confirm !== true) {
          const units = await this.space.pendingUnits(key);
          if (units > 0) {
            throw new CoreError("conflict", i18n._({
              id: "{count, plural, one {# record never reached a Space.} other {# records never reached a Space.}}",
              comment: "Refusal asking a second confirmation of removing a project, which the Overview reads before its own \"Remove anyway?\": removing it deletes its records from this computer, and that many were never sent to any Space",
              values: { count: units },
            }), { units });
          }
        }
        // The removal is one write at its instant (projects-10): every
        // session of the clone held under its Playbook lease — a live
        // writer's refuses it — then, with nothing awaited, the pair
        // forgotten and the clone deleted. No other work is waited for.
        const { leases, check } = await this.leaseClone(key);
        const removed = this.store.listSessions().filter((session) => session.projectId === key).map((session) => session.id);
        try {
          // retireOwner runs the final check, then invalidates the
          // project's uploads and readers, then the removal, with nothing
          // awaited between them: a refusal at the check invalidates
          // nothing (media-17). The project is read first, so a home
          // that query finds changed is refused next, before the check.
          await this.media.retireOwner({kind: "project", id: key}, () => {
            if (!this.store.removeProject(key)) throw noProject(key);
          }, () => {
            assertProject();
            this.store.assertProjectsWritable();
            check();
          });
        } finally {
          // The leases went with the clone; what stands is released.
          await Promise.allSettled(leases.map((lease) => lease.release()));
        }
        for (const sessionId of removed) this.broadcast({ type: "session.removed", sessionId, projectId: key });
        this.afterRepositoriesChanged();
        this.queueLedgerChange([key]);
        this.announceGroups();
        return null;
      }
      case "session.list":
        await this.settledConfig();
        await this.refreshContinuationReadings();
        return this.sessions.listSessions();
      case "session.create": {
        const context = this.projectConfigContext(command.projectId);
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        // A project's group gains its own spex repository at session
        // start where it has none (DR-103); it checks for itself and
        // never throws.
        void this.ensureGroupRepository(project.id).catch(() => {});
        // Yours with the project.s own on top (core-service-2).
        const composed = await this.composedFor(project.id);
        const assertCurrent = () => {
          try { context.assertCurrent(); }
          catch { throw changedMeanwhile(join(this.store.dir, "home.yaml")); }
        };
        assertCurrent();
        return this.sessions.createSession(project, composed, assertCurrent);
      }
      case "session.dispose":
        await this.sessions.disposeSession(command.sessionId);
        return null;
      // core-service-100: one agent's settings for one session. It
      // writes no config — the claim that a default cannot change from
      // here is kept by there being no path that could (DR-067).
      case "session.agent.set":
        return await this.setSessionAgent(command);
      case "session.restore": {
        const session = this.store.describeSession(command.sessionId);
        if (!session) throw noSession(command.sessionId);
        // Another runtime's session is refused first, whatever its
        // checkpoint holds (core-service-82, DR-134).
        assertRunsHere(session);
        const project = this.store.getProject(session.projectId);
        if (!project) throw new CoreError("invalid_request", i18n._({
          id: "bind the existing project before restoring",
          comment:
            "Refusal: the session's project has no folder on this device yet",
        }));
        await this.sessions.restoreSession(project, session.id);
        return {accepted: true};
      }
      case "session.discard": {
        const session = this.store.describeSession(command.sessionId);
        if (!session) throw noSession(command.sessionId);
        // Refused before anything is retired (core-service-83, DR-134).
        assertRunsHere(session);
        const result = await this.media.retireOwner({kind: "session", id: session.id}, () => this.sessions.discardSession(session.id));
        if (result.removed) this.broadcast({type:"session.removed", sessionId:session.id, projectId:session.projectId});
        return result;
      }
      case "session.delete": {
        const session = this.store.describeSession(command.sessionId);
        if (!session) {
          throw noSession(command.sessionId);
        }
        // A turn in flight finishes or aborts first (core-service-70):
        // deleting under a running runtime would orphan its agents.
        const assertIdle = () => {
          if (this.sessions.getLive(session.id)) {
            throw new CoreError("busy", i18n._({
              id: "wait for the running turn to finish, or abort it, before deleting",
              comment: "Refusal: the session being deleted has a turn in flight",
            }));
          }
        };
        assertIdle();
        await this.media.retireOwner({kind: "session", id: session.id}, () => {
          assertIdle();
          return this.store.deleteSession(session.id);
        });
        this.broadcast({
          type: "session.removed",
          sessionId: session.id,
          projectId: session.projectId,
        });
        // An open intent the session served re-derives as queued (DR-038).
        this.queueLedgerChange([session.projectId]);
        return null;
      }
      case "turn.submit": {
        const release = this.admitSubmission(command.sessionId);
        let opened = false;
        let submitted = false;
        try {
          await this.sessions.settled(command.sessionId);
          if (command.intentId !== undefined) {
            this.validateIntentDispatch(command.sessionId, command.intentId);
          }
          // The runtime is held only for a turn (DR-051): a message to a
          // session that is not live opens it first — on the settings the
          // file holds now — then the turn as usual. A turn still settling
          // is waited out, so the message never reaches a closing host.
          if (!this.sessions.getLive(command.sessionId)) {
            await this.settledConfig();
            await this.continueSession(command.sessionId);
            opened = true;
          }
          if (command.intentId !== undefined) {
            this.validateIntentDispatch(command.sessionId, command.intentId);
          }
          const session = this.store.describeSession(command.sessionId);
          if (!session) throw noSession(command.sessionId);
          const assets = command.attachments ?? (command.intentId ? this.store.getIntent(command.intentId)?.attachments : undefined) ?? [];
          if (!command.text.length && !assets.length) throw new CoreError("invalid_request", i18n._({id: "Text or an attachment is required.", comment: "Attachment transfer or storage diagnostic"}));
          // Sent attachments come from the spex repository.s staging; an
          // intent.s own from its directory beside its file (media-4).
          const source: MediaUploadOwner = command.attachments || command.intentId === undefined
            ? {kind: "project", id: session.projectId}
            : {kind: "intent", projectId: session.projectId, intentId: command.intentId};
          const attachments = assets.length ? await this.sessions.importAttachments(command.sessionId,
            this.media.ownerStore(source), assets) : [];
          if (command.intentId !== undefined) this.validateIntentDispatch(command.sessionId, command.intentId);
          this.sessions.submitTurn(
            command.sessionId,
            command.text,
            command.intentId,
            attachments,
          );
          submitted = true;
          return { accepted: true };
        } finally {
          // Admission may fail after opening, including while importing
          // attachments. Release only the idle runtime this request opened.
          try {
            if (opened && !submitted && this.sessions.getLive(command.sessionId)) {
              await this.sessions.disposeSession(command.sessionId);
            }
          } finally { release(); }
        }
      }
      // core-service-98: a control the session already advertises, run as
      // its next turn. It shares turn.submit's admission and continuation
      // so a parked run reached after a restart still answers, and stamps
      // no intent dispatch — the Boss is acting on the run, not sending work.
      case "session.control": {
        await this.runControl(command.sessionId, command.kind, false, command.actionId);
        return { accepted: true };
      }
      case "turn.abort":
        return { aborted: this.sessions.abortTurn(command.sessionId) };
      case "subscribe": {
        if (command.channel.kind === "draft") {
          // An unknown draft is refused as every draft command refuses
          // it (core-service-96), never subscribed to in advance.
          if (!this.authors.has(command.channel.draftId)) {
            throw noDraft(command.channel.draftId);
          }
        } else {
          this.requireKnownSession(command.channel.sessionId);
        }
        client.channels.add(channelKey(command.channel));
        return null;
      }
      case "unsubscribe":
        client.channels.delete(channelKey(command.channel));
        return null;
      case "history.get":
        this.requireKnownSession(command.sessionId);
        return {
          records: this.store.getRecords(command.sessionId, {
            afterSeq: command.afterSeq,
          }),
        };
      case "usage.get":
        this.requireKnownSession(command.sessionId);
        return this.store.sessionUsage(command.sessionId);
      case "usage.days":
        return this.store.usageByDay();
      case "config.edit": {
        if (!existsSync(this.configPath)) {
          throw new CoreError("invalid_config", i18n._({
            id: "config file is missing",
            comment: "Refusal: no config file exists at the path the core reads",
          }));
        }
        const op = command.op as ConfigEditOp;
        // A project's or another group's file (playbook-library-3): its
        // playbook entries alone, composed on top of yours with the
        // modules its environment exports before yours.
        const target = command.repository !== undefined && command.repository !== this.store.home.own()
          ? this.store.repository(command.repository)
          : undefined;
        if (command.repository !== undefined && command.repository !== this.store.home.own() && !target) throw noProject(command.repository);
        const result = target
          ? await editProjectConfigFile(target.configPath, this.configPath, op, this.options.loadModule, this.modules(target.key), this.projectConfigContext(target.key))
          : await editConfigFile(
            this.configPath,
            op,
            this.options.loadModule,
            { modules: this.modules(null) },
          );
        // The file changed while the candidate composed: changed
        // meanwhile, retry (DR-111).
        if (result.conflict) throw new CoreError("conflict", result.error!);
        if (!result.ok) {
          throw new CoreError(
            "invalid_config",
            // The composition's own words where it gave any, relayed.
            result.error ?? i18n._({
              id: "edit rejected",
              comment: "Refusal: a config edit failed validation with no reason given",
            }),
          );
        }
        await this.reloadConfig();
        // The reply is the state the files stand at; the write stands
        // either way (DR-111).
        await this.settledConfig();
        this.authors.republish();
        return this.configState;
      }
      case "compile.check":
        return checkToolchain(this.env, this.options.compileSpawner, this.options.compileRuntime);
      case "playbook.artifacts": {
        // A playbook's stages beside its module: the one the named spex
        // repository's environment exports, else the composed config's,
        // else wherever an environment of this device installs it
        // (playbook-library-24).
        const named = command.repository !== undefined
          ? [...this.environments.locations(command.repository).values()].find((location) => location.id === command.playbookId && location.present)?.module
          : undefined;
        if (command.repository !== undefined && !this.store.repository(command.repository)) throw noProject(command.repository);
        // The config's module, as its files stand (DR-111).
        if (!named && command.repository === undefined) await this.settledConfig();
        const from = named
          ?? (command.repository === undefined ? this.composed?.playbooks.find((entry) => entry.id === command.playbookId)?.from : undefined)
          ?? (command.repository === undefined ? this.installedModule(command.playbookId) : undefined);
        if (!from) {
          throw new CoreError(
            "not_found",
            i18n._({
              id: "no configured playbook {playbookId}",
              comment: "Refusal: the config enables no playbook of this id",
              values: { playbookId: command.playbookId },
            }),
          );
        }
        return resolveArtifacts({ id: command.playbookId, from }, this.env);
      }
      case "library.builtins": {
        // The built-in spec package's playbooks your own group's
        // environment installs, each `configured` where the config
        // enables it (playbook-library-34), as its files stand (DR-111).
        await this.settledConfig();
        const configuredIds = new Set(
          this.composed?.playbooks.map((playbook) => playbook.id) ?? [],
        );
        return {
          builtins: await loadBuiltinCatalog(
            this.environments.locations(this.store.home.own()),
            configuredIds,
            this.options.loadModule,
          ),
        };
      }
      case "compile.run": {
        if (!existsSync(this.configPath)) {
          throw new CoreError("invalid_config", i18n._({
            id: "config file is missing",
            comment: "Refusal: no config file exists at the path the core reads",
          }));
        }
        // The Captain's block as the file stands (DR-111).
        await this.settledConfig();
        // The one-shot compile writes the spec package under development
        // in the working folder of the project it names (environments-10).
        const project = this.store.getProject(command.projectId);
        if (!project) throw noProject(command.projectId);
        if (!isSkillName(command.playbookId)) throw invalidPlaybookId(command.playbookId);
        // A compile is an independent process with its own cancel handle
        // (DR-111), and the one job writing its artifact folder while it
        // compiles and packages (playbook-library-99); the enabling after
        // it writes the environment and the config on their own.
        const controller = new AbortController();
        const handles = this.standaloneCompiles.get(command.playbookId) ?? new Set<AbortController>();
        handles.add(controller);
        this.standaloneCompiles.set(command.playbookId, handles);
        try {
          // The folder of the authoring session of this id where it lies
          // in this working folder, however the folder is spelled, so
          // the two are one job (playbook-library-99); else the one a
          // session would take under the project's default org,
          // `spex-packages/<org>/<id>/` (playbook-library-69,
          // playbook-library-70, environments-10) — never another org's
          // package of that name; no one is asked here: the project's
          // defaults stand, with no license where none is derived.
          const defaults = newPackageDefaults(project.id, project.path, await this.environments.publishableOrgs(project.id));
          const sessionFolder = this.drafts.workingFolder(command.playbookId);
          const packagePath = sessionFolder !== null && canonicalFolder(sessionFolder) === canonicalFolder(project.path)
            ? this.drafts.packagePath(command.playbookId)
            : packageFolderFor(project.path, defaults.org, command.playbookId);
          const packageDir = join(project.path, ...packagePath.split("/"));
          // The language its manifest already names, else the project's
          // authoring language, else the home's (playbook-library-70).
          const language = authoringLanguage(project.path, packageDir, command.playbookId, this.homeLanguage());
          mkdirSync(join(packageDir, "playbooks", language), { recursive: true });
          if (!existsSync(join(packageDir, "meta.yaml"))) {
            const fields = { org: defaults.org, ...(defaults.license !== null ? { license: defaults.license } : {}) };
            // A manifest made while the registry was asked stands.
            try {
              writeFileSync(join(packageDir, "meta.yaml"), authoringManifest(command.playbookId, fields, language), { flag: "wx" });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            }
          }
          excludeEngineLinks(project.path);
          const libraryDir = join(packageDir, "playbooks", language);
          let result;
          try {
            result = await compilePlaybook({
              playbookId: command.playbookId,
              source: {
                ...(command.sourceText !== undefined
                  ? { text: command.sourceText }
                  : {}),
                ...(command.sourcePath ? { path: command.sourcePath } : {}),
              },
              roles: command.roles,
              command: command.command,
              intent: command.intent,
              libraryDir,
              // The compile's agent is an agent run (core-service-126).
              env: this.agentRunEnv(),
              // The form's compile runs on the Captain's block
              // (playbook-library-42).
              ...(this.composed
                ? { agent: compilerAgentOf(this.composed.captainAgent) }
                : {}),
              ...(this.options.compileRuntime ? { runtime: this.options.compileRuntime } : {}),
              signal: controller.signal,
              ...(this.options.compileSpawner
                ? { spawner: this.options.compileSpawner }
                : {}),
              onProgress: (line) => {
                // After an abort the ◇ canceled line (sent by the
                // compile.abort handler) stays the last progress output.
                if (controller.signal.aborted) return;
                this.broadcast({
                  type: "compile.progress",
                  playbookId: command.playbookId,
                  line,
                });
              },
            });
          } catch (error) {
            if (error instanceof ArtifactFolderBusy) throw new CoreError("busy", error.message);
            if (controller.signal.aborted) {
              throw new CoreError("aborted", i18n._({
                id: "compile canceled",
                comment: "The outcome of a compile the reader stopped",
              }));
            }
            // `<id>.md` changed under Spex's own write of the source
            // (playbook-library-12).
            if (error instanceof VersionConflictError) throw new CoreError("conflict", error.message);
            const message =
              error instanceof Error ? error.message : String(error);
            throw new CoreError("invalid_request", message);
          }
          // The one-shot form is a draft-style compile followed by the
          // enabling path a session takes (playbook-library-69).
          return await this.enableCompiled({
            playbookId: command.playbookId,
            result,
            bindings: command.bindings,
            newPlayers: command.newPlayers,
            projectId: project.id,
            ...(command.repository !== undefined ? { repository: command.repository } : {}),
            packageDir,
          });
        } finally {
          handles.delete(controller);
          if (handles.size === 0 && this.standaloneCompiles.get(command.playbookId) === handles) this.standaloneCompiles.delete(command.playbookId);
        }
      }
      case "compile.abort": {
        // Naming an authoring session's instance cancels that session's
        // compile: a successor under the id is not it. Without one, every
        // running one-shot compile of the id, and never a session's
        // (core-service-25).
        const controllers = command.instance === undefined ? [...(this.standaloneCompiles.get(command.playbookId) ?? [])] : [];
        const canceled = command.instance !== undefined ? this.authors.cancelCompiles(command.instance) : controllers.length > 0;
        if (!canceled) {
          throw new CoreError(
            "not_found",
            i18n._({
              id: "no compile is running for {playbookId}",
              comment: "Refusal: nothing to abort for this playbook",
              values: { playbookId: command.playbookId },
            }),
          );
        }
        for (const controller of controllers) controller.abort();
        this.broadcast({
          // English, deliberately (core-service-111): the page reads the
          // compile's progress lines, and this one tells it the run was
          // canceled, so it is wire text rather than the core's prose.
          type: "compile.progress",
          playbookId: command.playbookId,
          ...(command.instance !== undefined ? { instance: command.instance } : {}),
          line: "◇ compile canceled",
        });
        return null;
      }
      case "specs.get": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        return parseSpecTree(project.path, {
          committedAt: await readRecordCommitTimes(project.path, this.runCommand),
        });
      }
      case "specs.read": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        const resolved = resolveSpecPath(project.path, command.path);
        if (!resolved.ok) throw new CoreError(resolved.code, resolved.message);
        return readSpecFile(resolved.path);
      }
      case "specs.write": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        const written = writeSpecFile(
          project.path,
          command.path,
          command.content,
          command.baseVersion,
        );
        if (!written.ok) throw new CoreError(written.code, written.message);
        return { version: written.version, mtime: written.mtime };
      }
      case "intent.queue": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        const staging: MediaUploadOwner = {kind: "project", id: project.id};
        await this.media.validate(staging, command.attachments ?? []);
        this.media.ownerStore(staging, true);
        const refuseHeldSource = (): void => {
          if (!command.source || command.source.kind === "chat") return;
          const holder = this.store.openIntentBySource(
            project.id,
            command.source.kind,
            command.source.ref,
          );
          if (holder) {
            throw new CoreError(
              "conflict",
              i18n._({
                id: "an open intent already holds this source: \"{title}\"",
                comment:
                  "Refusal: the issue or pull request is already queued; the title is the reader's own text",
                values: { title: intentTitle(holder) },
              }),
            );
          }
        };
        refuseHeldSource();
        // An intent holds no place of its own: the queue is its project's
        // queued intents oldest first (core-service-42, core-service-107).
        const id = randomUUID();
        // The account signed in at the instance of the project's spex
        // repository, none where it has none (core-service-42).
        const at = this.space.instanceOriginOf(project.id);
        const account = at === null ? null : this.store.home.account(at);
        const author = account ? { login: account.login, displayName: account.login } : undefined;
        const intent = {
          id,
          projectId: project.id,
          text: command.text,
          ...(command.attachments?.length ? {attachments: command.attachments} : {}),
          ...(command.source ? { source: command.source } : {}),
          ...(author ? { author } : {}),
          createdAt: Date.now(),
        };
        // Its attachments move from the staging owner into the intent's
        // own directory beside its file (media-4).
        const owner: MediaUploadOwner = {kind: "intent", projectId: project.id, intentId: id};
        try {
          await this.media.adopt(owner, [staging], command.attachments ?? []);
          // Read again after the await, in the step that writes: an
          // intent another queue or a sync wrote meanwhile holds it.
          refuseHeldSource();
          // Its runtime is this one, read once the home reads, in the
          // step that writes it (core-service-42, DR-134).
          this.store.assertWritable({ projectId: project.id });
          this.store.addIntent({ ...intent, runtime: this.runtime() });
        } catch (error) {
          // The project may have left meanwhile: only its own folder goes.
          if (this.store.repository(project.id)) rmSync(this.store.intentAssetsDir(id, project.id), { recursive: true, force: true });
          throw error;
        }
        this.queueLedgerChange([project.id]);
        return this.store.getIntent(intent.id);
      }
      case "intent.edit": {
        const intent = this.requireOpenIntent(command.intentId);
        this.requireOwnIntent(intent);
        if (this.deriveIntentState(intent.id) !== "queued") {
          throw new CoreError(
            "conflict",
            i18n._({
              id: "a dispatched intent's text is history",
              comment: "Refusal: work already sent cannot be reworded",
            }),
          );
        }
        const attachments = command.attachments ?? intent.attachments ?? [];
        if (!command.text.length && !attachments.length) throw new CoreError("invalid_request", i18n._({id: "Text or an attachment is required.", comment: "Attachment transfer or storage diagnostic"}));
        // Kept references stay in the intent's directory; new ones come
        // from the spex repository's staging owner (media-4).
        const owner: MediaUploadOwner = {kind: "intent", projectId: intent.projectId, intentId: intent.id};
        await this.media.adopt(owner, [{kind: "project", id: intent.projectId}], attachments);
        this.assertIntentUnchanged(intent);
        if (this.deriveIntentState(intent.id) !== "queued") throw new CoreError("conflict", i18n._({id: "A dispatched intent's content is history.", comment: "Refusal during attachment admission"}));
        this.store.editIntent(intent.id, command.text, command.attachments);
        this.queueLedgerChange([intent.projectId]);
        return this.store.getIntent(intent.id);
      }
      case "intent.close": {
        let intent = this.requireOpenIntent(command.intentId);
        this.requireOwnIntent(intent);
        if (
          command.as === "done" &&
          this.deriveIntentState(intent.id) !== "finished"
        ) {
          throw new CoreError(
            "conflict",
            i18n._({
              id: "only a finished intent confirms done",
              comment: "Refusal: the work has not finished, so Done is not offered",
            }),
          );
        }
        // Letting go ends the parked run (DR-073): a Drop taken on work
        // whose run stands parked on the Boss is one ruling, not two.
        // The run is ended first, through the shell's own ending, and
        // the verdict is recorded only once that turn has settled with
        // nothing of the session's still parked. Nothing half-rules: a
        // refused ending refuses the close and leaves the intent open.
        const parkedSession =
          command.as === "dropped" && this.parkedRun(intent.id)
            ? intent.dispatched?.sessionId
            : undefined;
        if (parkedSession !== undefined) {
          await this.runControl(parkedSession, "ending", true);
          intent = this.requireOpenIntent(command.intentId);
          if (this.parkedRun(intent.id)) {
            throw new CoreError(
              "conflict",
              i18n._({
                id: "the run is still parked, so the intent stays open",
                comment: "Refusal: ending the parked run did not settle it",
              }),
            );
          }
        }
        const at = Date.now();
        // A drop before any work deletes the file with its attachments,
        // so no read sees it (core-service-46, core-service-52); work
        // underway keeps it, to list in History once its turn finishes.
        const remove = command.as === "dropped" && !wasWorked(this.store, intent) && this.deriveIntentState(intent.id) !== "working";
        if (remove) {
          const closing = intent;
          await this.media.retireOwner({kind: "intent", projectId: closing.projectId, intentId: closing.id},
            () => this.store.closeIntent(closing.id, command.as, at, true));
        } else this.store.closeIntent(intent.id, command.as, at);
        this.queueLedgerChange([intent.projectId]);
        return this.store.getIntent(intent.id) ?? { ...intent, closedAt: at, closedAs: command.as };
      }
      case "intent.remove": {
        // Only done work leaves History (core-service-79): an open
        // intent is still the ledger's, and its own act closes it.
        const intent = this.store.getIntent(command.intentId);
        if (!intent) {
          throw noIntent(command.intentId);
        }
        if (intent.closedAt === undefined) {
          throw new CoreError(
            "conflict",
            i18n._({
              id: "only a closed intent leaves history",
              comment: "Refusal: open work cannot be removed from History",
            }),
          );
        }
        await this.media.retireOwner({kind: "intent", projectId: intent.projectId, intentId: intent.id},
          () => this.store.removeIntent(intent.id, Date.now()));
        this.queueLedgerChange([intent.projectId]);
        return null;
      }
      case "ledger.get":
        return this.ledger();
      case "ledger.history": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        // History is done work (DR-038): closed done, or dropped after
        // a turn of the intent's ended finished; a drop before any work
        // left the queue without a trace.
        const page = this.store.listClosedIntents(
          project.id,
          21,
          command.before
            ? {
                closedAt: command.before.closedAt,
                intentId: command.before.intentId,
              }
            : undefined,
          (intent) => intent.closedAs === "done" || wasWorked(this.store, intent),
        );
        const more = page.length > 20;
        return {
          intents: page.slice(0, 20).map((intent) => {
            const stats = closedStats(this.store, intent);
            return { intent, ...(stats ? { stats } : {}) };
          }),
          more,
        };
      }
      case "session.viewed": {
        this.requireKnownSession(command.sessionId);
        // A marker may name only a turn that has ended (core-service-48):
        // naming one still in flight would set the marker to the very id
        // the fold compares against when it finishes, swallowing the next
        // summons with no act by the reader (DR-066).
        const ended = this.store
          .listTurns(command.sessionId)
          .some((turn) => turn.turnId === command.turnId && turn.endedAt !== null);
        if (!ended) {
          throw new CoreError(
            "invalid_request",
            i18n._({
              id: "That turn has not ended, so it cannot be marked as read.",
              comment: "Refusal: a summons is marked read only once its turn ended",
            }),
          );
        }
        const key = `viewed:${command.sessionId}`;
        const previous = this.store.getPref<number>(key) ?? -1;
        if (command.turnId > previous) {
          this.store.setPref(key, command.turnId);
          const session = this.store.describeSession(command.sessionId);
          if (session) this.queueLedgerChange([session.projectId]);
        }
        return null;
      }
      // The home's interface language (core-service-108/109): one
      // stored choice, read by every client and followed by every one
      // of them the moment it changes.
      case "language.get":
        return { language: this.language() };
      case "language.set": {
        this.store.setInterfaceLanguage(command.language);
        // The core speaks the new choice before it answers or tells
        // anyone (core-service-111), so every text it composes from
        // here on reads in it.
        const before = this.spoken;
        this.spoken = this.speakHomeLanguage();
        const language = this.language();
        this.broadcast({ type: "language.state", language });
        // A change of language re-derives the states the core caches
        // and broadcasts them, so a page reads the core's prose in the
        // new language without asking for it (core-service-111,
        // localization-11). The config's errors and the adapter
        // readiness requirements are the two the core holds and
        // re-derives; a forge cache entry that carries guidance rather
        // than lists is dropped, so the page's re-read composes the
        // guidance afresh (dashboard-14 keeps every entry with lists);
        // the Space, the storage diagnostics and every reply are
        // composed at the moment they are read.
        if (this.spoken !== before) {
          this.store.dropForgeGuidance();
          void this.reloadConfig();
        }
        return { language };
      }
      // Team servers (core-service-128, DR-133): the servers each signed-in
      // instance lists, and the seats this core opens and closes on them.
      case "server.list":
        return this.places.list();
      case "server.open":
        return this.places.open({ instance: command.instance, serverId: command.serverId, ...(command.consented !== undefined ? { consented: command.consented } : {}) });
      case "server.close":
        return this.places.close({ instance: command.instance, serverId: command.serverId });
      case "server.signin":
        return this.places.signIn({ instance: command.instance, serverId: command.serverId });
      // Groups (space-29): the core performs every Git operation, one
      // spex repository at a time; long commands reply accepted and
      // report as state.
      case "registry.get":
        return this.registry.get(command.origin ?? (command.repository ? this.environments.registryOf(command.repository).origin : undefined));
      case "registry.signin.start":
        return this.registry.start(command.origin);
      case "registry.signin.cancel":
        return this.registry.cancel(command.origin);
      case "registry.signout":
        return this.registry.signOut(command.origin);
      case "registry.orgs":
        return { orgs: await this.environments.registryOrgs(command.repository) };
      case "registry.directory":
        return this.registry.directory(command.origin);
      case "environment.registry.set":
        return this.environments.setRegistry(command.repository, command.origin);
      case "space.get":
        return this.requireSpace().get();
      // The Git host (git-host-2..10, space-3..6, space-58..65): sign-in
      // and its set-up, the host read, picks, joins and members.
      case "space.refresh":
        return this.requireSpace().refresh();
      case "space.signin.start":
        // A ticket goes with a seat's device request alone; off a seat it
        // is refused before anything is asked (git-host-27).
        if (command.ticket !== undefined && !this.seat) throw ticketOffSeat();
        return this.requireSpace().signInStart(command.url, command.reportCompletion ? {
          owner: client,
          id: command.id,
          complete: (outcome) => {
            void (replySent ?? Promise.resolve()).then(() => {
              const identity = { type: "space.signin.completed" as const, id: command.id, instance: canonicalOrigin(command.url) };
              if ("account" in outcome) this.send(client.socket, { ...identity, ok: true, account: outcome.account });
              else {
                const failure = coreErrorOf(outcome.error);
                this.send(client.socket, { ...identity, ok: false, error: { code: failure.code, message: failure.message,
                  ...(failure.details ? { details: failure.details } : {}) } });
              }
            });
          },
        } : undefined, command.ticket);
      case "space.signin.cancel":
        return { stopped: this.requireSpace().signInCancel(client, command.startId) };
      // Each command names the instance it acts at by its origin
      // (space-29, DR-127).
      case "space.signout":
        return this.requireSpace().signOut(command.instance);
      case "space.forget":
        return this.requireSpace().forget(command.instance);
      case "space.pick":
        return this.requireSpace().pick(command.repository, command.choice, command.noticed === true);
      // A placement at another instance, an operation of the clone's
      // machine (space-97, DR-128).
      case "space.place":
        return this.requireSpace().place(command.repository, command.choice, command.noticed === true);
      // A placement left, an operation of the clone's machine (space-98,
      // DR-128).
      case "space.leave":
        return this.requireSpace().leave(command.repository, command.instance, command.confirmed === true);
      // A placement a file names, attached as an operation of the clone's
      // machine (space-99, DR-128).
      case "space.attach":
        return this.requireSpace().attach(command.repository, command.instance, command.noticed);
      case "space.join":
        return this.requireSpace().join(command.instance, command.hostId, command.folder === undefined ? undefined : expandPath(command.folder, this.home));
      case "space.members":
        return this.requireSpace().members({ instance: command.instance, repository: command.repository, group: command.group });
      // Groups and sharing (git-host-15..17, DR-114): the host is asked,
      // and its answer is the reply.
      case "space.group.create":
        return this.requireSpace().createGroup(command.instance, command.name, command.path, command.parent);
      // Undo in Spex (git-host-18..20, DR-120): the host is asked, and its
      // answer is the reply.
      case "space.group.rename":
        return this.requireSpace().renameGroup(command.instance, command.group, {
          ...(command.name !== undefined ? { name: command.name } : {}),
          ...(command.path !== undefined ? { path: command.path } : {}),
        });
      case "space.group.delete":
        return this.requireSpace().deleteGroup(command.instance, command.group);
      case "space.repository.move":
        return this.requireSpace().moveRepository(command.repository, command.groupId, command.instance);
      case "space.share":
        return this.requireSpace().share({ instance: command.instance, repository: command.repository, group: command.group, login: command.login, role: command.role });
      case "space.unshare":
        return this.requireSpace().unshare({ instance: command.instance, repository: command.repository, group: command.group, login: command.login });
      case "space.remote.set":
        return this.requireSpace().setRemote(command.repository, command.url);
      case "space.fetch":
        return this.requireSpace().fetch(command.repository);
      case "space.sync":
        return this.requireSpace().sync(command.repository, {
          ...(command.placement !== undefined ? { placement: command.placement } : {}),
          ...(command.choices ? { choices: command.choices } : {}),
          ...(command.join !== undefined ? { join: command.join } : {}),
          ...(command.noticed !== undefined ? { noticed: command.noticed } : {}),
        });
      case "space.cancel":
        return { stopped: this.requireSpace().cancel(command.repository) };
      case "space.diff":
        return this.requireSpace().diff(command.repository, command.unit, command.path, command.side, command.placement);
      case "space.tree":
        return this.requireSpace().tree(command.repository, command.path);
      case "space.read":
        return this.requireSpace().read(command.repository, command.path);
      case "space.repair.decline":
        return this.requireSpace().decline(command.repair, command.declined);
      // Authoring sessions (DR-058, core-service-96): each in its
      // project's spex repository, one activity per session, Boss
      // messages queue, the manager holds the matrix.
      case "draft.list":
        return this.authors.list();
      case "draft.defaults": {
        // What New playbook fills in, read from the project and the
        // registry of its instance now, asked once (playbook-library-103).
        const { project, repository } = this.draftHome(command.projectId);
        return newPackageDefaults(repository.key, project.path, await this.environments.publishableOrgs(repository.key));
      }
      case "draft.create": {
        // The ids the config enables are taken (playbook-library-51), as
        // its files stand (DR-111).
        await this.settledConfig();
        const { project, repository } = this.draftHome(command.projectId);
        // The id names the spec package, the file and the command: the
        // Agent Skills name rule (playbook-library-51).
        if (!isSkillName(command.draftId)) throw invalidPlaybookId(command.draftId);
        if (this.drafts.exists(command.draftId) && this.drafts.projectOf(command.draftId) !== project.id) {
          throw new CoreError("invalid_request", i18n._({
            id: "{id} is already an authoring session of another project; pick another id",
            values: { id: command.draftId },
            comment: "Refusal: the id offered for a new playbook is another project's authoring session",
          }));
        }
        // The org and license the New playbook field holds go into the
        // new package's manifest (playbook-library-51, -70): the org by
        // the manifest's name rule (environments-1), the license given.
        if (!isKebabName(command.org)) {
          throw new CoreError("invalid_request", i18n._({
            id: "org {org} is not lowercase letters and digits in words joined by single hyphens, at most 64 characters",
            values: { org: JSON.stringify(command.org) },
            comment: "Refusal: the org a new playbook's spec package names breaks the manifest's name rule",
          }));
        }
        if (!PACKAGE_LICENSE_PATTERN.test(command.license)) {
          throw new CoreError("invalid_request", i18n._({
            id: "a new playbook needs a license on one line, such as Apache-2.0",
            comment: "Refusal: the license a new playbook's spec package names is empty, spans lines or is edged with spaces",
          }));
        }
        return this.authors.create(
          command.draftId,
          { key: repository.key, authoringDir: repository.authoringDir, workingFolder: project.path },
          { org: command.org, license: command.license },
        );
      }
      case "draft.open":
        this.requireDraft(command.projectId, command.draftId);
        return this.authors.open(command.draftId, command.afterSeq);
      case "draft.send": {
        this.requireDraft(command.projectId, command.draftId);
        this.authors.assertInstance(command.draftId, command.instance);
        const owner = {kind: "draft" as const, projectId: command.projectId, id: command.draftId, instance: command.instance};
        await this.media.validate(owner, command.attachments ?? []);
        this.media.ownerStore(owner, true);
        return this.authors.send(command.draftId, command.instance, {text: command.text, ...(command.attachments?.length ? {attachments: command.attachments} : {})});
      }
      case "draft.abort":
        this.requireDraft(command.projectId, command.draftId);
        return this.authors.abort(command.draftId, command.instance);
      case "draft.source.write":
        this.requireDraft(command.projectId, command.draftId);
        return this.authors.writeSource(command.draftId, command.instance, {
          ...(command.content !== undefined ? { content: command.content } : {}),
          ...(command.sourcePath !== undefined ? { sourcePath: command.sourcePath } : {}),
          ...(command.baseVersion !== undefined ? { baseVersion: command.baseVersion } : {}),
        });
      case "draft.compile":
        this.requireDraft(command.projectId, command.draftId);
        return this.authors.compile(command.draftId, command.instance);
      case "draft.register": {
        this.requireDraft(command.projectId, command.draftId);
        if (!existsSync(this.configPath)) {
          throw new CoreError("invalid_config", i18n._({
            id: "config file is missing",
            comment: "Refusal: no config file exists at the path the core reads",
          }));
        }
        // Re-package with the confirmed command and intent, one job over
        // the artifact folder (playbook-library-99), then enable through
        // the shared path; the session is not held and stays after,
        // enabled; a refused write leaves it standing with its artifacts
        // (playbook-library-69).
        return await this.authors.register(
          command.draftId,
          command.instance,
          command.command,
          command.intent,
          (result, location) => this.enableCompiled({
            playbookId: command.draftId,
            result,
            bindings: command.bindings,
            newPlayers: command.newPlayers,
            projectId: command.projectId,
            ...(command.repository !== undefined ? { repository: command.repository } : {}),
            packageDir: location.packageDir,
          }),
        );
      }
      case "draft.player.set":
        this.requireDraft(command.projectId, command.draftId);
        // The roster as the file stands now (DR-111).
        await this.settledConfig();
        return this.authors.setPlayer(command.draftId, command.instance, command.playerId);
      case "draft.delete": {
        this.requireDraft(command.projectId, command.draftId);
        // The instance read, or a damaged file's version: one of the two.
        if ((command.instance === undefined) === (command.fileVersion === undefined)) {
          throw new CoreError("invalid_request", i18n._({
            id: "name either the session's instance or its file's version",
            comment: "Refusal: a draft deletion names exactly one of the two",
          }));
        }
        this.authors.assertDeletable(command.draftId, command.instance !== undefined ? { instance: command.instance } : { version: command.fileVersion as string });
        if (command.instance === undefined) {
          // A file that will not read names no instance, so no media
          // owner was ever admitted for it (media-4): it goes at once.
          this.authors.delete(command.draftId, { version: command.fileVersion as string });
          return null;
        }
        const expected = { instance: command.instance };
        await this.media.retireOwner({kind: "draft", projectId: command.projectId, id: command.draftId, instance: command.instance}, () => this.authors.delete(command.draftId, expected),
          () => this.authors.assertDeletable(command.draftId, expected));
        return null;
      }
      case "draft.artifacts": {
        this.requireDraft(command.projectId, command.draftId);
        // The compiled stages in the playbook artifact's folder of the
        // spec package under development (playbook-library-24).
        const artifactDir = this.drafts.artifactDir(command.draftId) ?? join(this.store.dir, "missing");
        return resolveArtifacts(
          { id: command.draftId, from: join(artifactDir, `${command.draftId}.registry.mjs`) },
          this.env,
        );
      }
      // Environments (environments-14, environments-15, environments-17).
      case "environment.get":
        // A use's read (environments-26): a lock other than the one
        // installed is installed, reported through state.
        this.environments.use(command.repository);
        return this.environments.state(command.repository);
      case "environment.request": {
        // A dry run replies what the request would take and writes
        // nothing (environments-15).
        if (command.dryRun === true) {
          return { accepted: true, preview: await this.environments.previewRequest(command.repository, command.name, toRequest(command.request)) };
        }
        const { done } = await this.environments.request(command.repository, command.name, toRequest(command.request), command.wait === true);
        if (command.wait) { await done; return { completed: true }; }
        void done.catch(() => {});
        return { accepted: true };
      }
      case "environment.remove": {
        const { done } = await this.environments.remove(command.repository, command.name, command.wait === true);
        if (command.wait) { await done; return { completed: true }; }
        void done.catch(() => {});
        return { accepted: true };
      }
      case "environment.resolve": {
        const done = this.environments.resolveLater(command.repository, command.wait === true);
        if (command.wait) { await done; return { completed: true }; }
        void done.catch(() => {});
        return { accepted: true };
      }
      case "environment.install": {
        const done = this.environments.installLater(command.repository, command.wait === true);
        if (command.wait) { await done; return { completed: true }; }
        void done.catch(() => {});
        return { accepted: true };
      }
      case "environment.search":
        return { packages: await this.environments.search(command.repository, command.query) };
      case "environment.publish": {
        // A dry run replies the inline summary and uploads nothing
        // (playbook-library-93); the upload reports through state.
        const { done, preview } = await this.environments.publish(command.repository, command.name, command.dryRun === true, command.wait === true);
        if (command.wait && !command.dryRun) {
          const published = await done;
          if (!published) throw new CoreError("internal", "Publication completed without a receipt");
          return { completed: true, published };
        }
        void done.catch(() => {});
        return command.dryRun === true ? { accepted: true, preview } : { accepted: true };
      }
      case "environment.playbooks":
        return this.playbookAvailability(command.projectId);
      case "applet.open":
        return this.openApplet(command.repository, command.applet, command.project);
    }
  }

  /** `applet.open` (applets-3): the path of the applet's capability for
   * the project, once the applet is installed, the project pairs a
   * working folder on this device, and the applet's files stand here. */
  private openApplet(repository: string, applet: string, project: string): CommandResults["applet.open"] {
    const installed = this.environments.applet(repository, applet);
    if (!installed) {
      throw new CoreError("not_found", i18n._({
        id: "The applet {applet} is not installed here — add its package in Packages",
        comment: "Refusal: an applet tab asked for an applet this project's packages do not install; Packages is the project's tab that adds a package",
        values: { applet },
      }));
    }
    if (!this.store.repository(project) || this.environments.workingFolder(project) === null) {
      throw new CoreError("not_found", i18n._({
        id: "{name} has no project folder on this computer — Open here first",
        comment: "Refusal: package work in a project not opened on this computer, so its spex.yaml has no folder here; 'Open here' is the project's control on the Space surface",
        values: { name: splitKey(project).name.replace(/-spex$/, "") },
      }));
    }
    if (!installed.present) {
      throw new CoreError("invalid_request", i18n._({
        id: "The files of the applet {applet} are not on this computer — Install in Packages",
        comment: "Refusal: the applet's package is in spex.lock, but its installed files or its folder are missing here; Install is the Packages tab's control",
        values: { applet },
      }));
    }
    return { path: this.applets.path({ repository, applet, project }) };
  }

  /** A playbook's installed module on this device, from any spex
   * repository's environment, your own group's first. */
  private installedModule(playbookId: string): string | undefined {
    const own = this.store.home.own();
    const keys = [own, ...this.store.listRepositories().map((repository) => repository.key).filter((key) => key !== own)];
    for (const key of keys) {
      for (const location of this.environments.locations(key).values()) {
        if (location.id === playbookId && location.present) return location.module;
      }
    }
    return undefined;
  }

  /** `environment.playbooks` (playbook-library-1): every playbook the
   * project's and your own group's environments export, with where each
   * is enabled, read from the config files. */
  private async playbookAvailability(projectId: string | undefined): Promise<CommandResults["environment.playbooks"]> {
    const own = this.store.home.own();
    const projectRepository = projectId !== undefined && projectId !== own ? this.store.repository(projectId) : undefined;
    if (projectId !== undefined && projectId !== own && !projectRepository) throw noProject(projectId);
    // Each listed playbook's module is read on the app's engine
    // (environments-9, playbook-library-46).
    await this.environments.prepareForUse(projectRepository ? projectId! : null);
    const topOf = (path: string | undefined): Record<string, unknown> | null => {
      if (!path || !existsSync(path)) return null;
      try {
        const top = parseYaml(readFileSync(path, "utf8")) as unknown;
        return typeof top === "object" && top !== null && !Array.isArray(top) ? top as Record<string, unknown> : null;
      } catch { return null; }
    };
    const entriesOf = (top: Record<string, unknown> | null): Record<string, Record<string, unknown>> =>
      top && typeof top.playbooks === "object" && top.playbooks !== null ? top.playbooks as Record<string, Record<string, unknown>> : {};
    const ownTop = topOf(this.configPath);
    const projectTop = topOf(projectRepository?.configPath);
    const ownEntries = entriesOf(ownTop);
    const projectEntries = entriesOf(projectTop);
    const players = (ownTop && typeof ownTop.players === "object" && ownTop.players !== null ? ownTop.players : {}) as Record<string, unknown>;
    // What each binding effectively runs (playbook-library-1): the
    // role's own pin, the provider default it chose, or its player's.
    const bindingsOf = (entry: Record<string, unknown> | undefined): Record<string, RoleBindingSummary> | undefined => {
      if (!entry || typeof entry.roles !== "object" || entry.roles === null) return undefined;
      const out: Record<string, RoleBindingSummary> = {};
      for (const [role, value] of Object.entries(entry.roles as Record<string, unknown>)) {
        const binding = (typeof value === "string" ? { player: value } : value) as Record<string, unknown> | null;
        const playerId = typeof binding?.player === "string" ? binding.player : undefined;
        if (!playerId) continue;
        const player = players[playerId];
        const agent = (typeof player === "string" ? { adapter: player } : player ?? {}) as { adapter?: string; model?: string };
        const tuning: Partial<RoleBindingSummary> = {};
        for (const field of ["model", "effort", "fastMode", "subagentModel", "subagentEffort"] as const) {
          const tuned = binding?.[field];
          if (typeof tuned === "string" || typeof tuned === "boolean") (tuning as Record<string, unknown>)[field] = tuned;
        }
        const display = tuning.model === false ? `${agent.adapter ?? "?"} default` : (typeof tuning.model === "string" ? tuning.model : agent.model ?? agent.adapter ?? "?");
        out[role] = { playerId, ...tuning, display };
      }
      return out;
    };
    const list = async (key: string): Promise<PlaybookAvailability[]> => {
      const lock = this.environments.lockOf(key);
      const out: PlaybookAvailability[] = [];
      for (const [name, location] of this.environments.locations(key)) {
        let entry: { command?: unknown; intent?: unknown; requiredRoleIds?: unknown } | undefined;
        if (location.present) {
          try {
            const value = ((await this.options.loadModule!(location.module)) as { default?: unknown }).default;
            if (isValidRegistryEntry(value)) entry = value;
          } catch { entry = undefined; }
        }
        const resolution = lock?.packages[location.package];
        const source: PlaybookAvailability["source"] = location.builtin ? "builtin"
          : resolution && isPathSource(resolution.source) ? "path"
            : resolution && isGitSource(resolution.source) ? "git" : "registry";
        const config = projectEntries[location.id] ?? ownEntries[location.id];
        const command = typeof config?.command === "string" ? config.command : typeof entry?.command === "string" ? entry.command : null;
        const projectBindings = projectRepository ? bindingsOf(projectEntries[location.id]) : undefined;
        const ownBindings = bindingsOf(ownEntries[location.id]);
        // The artifact's folder: the module stands in it, or in its
        // `<id>.playbook/` (playbook-library-29).
        const near = dirname(location.module);
        out.push({
          name,
          id: location.id,
          command,
          intent: typeof entry?.intent === "string" ? entry.intent : null,
          roles: Array.isArray(entry?.requiredRoleIds) ? [...entry!.requiredRoleIds as string[]] : [],
          package: location.package,
          version: location.version,
          source,
          repository: key,
          enabled: [
            ...(projectRepository && Object.hasOwn(projectEntries, location.id) ? ["project" as const] : []),
            ...(Object.hasOwn(ownEntries, location.id) ? ["own" as const] : []),
          ],
          present: location.present,
          ...(projectBindings || ownBindings ? { bindings: { ...(projectBindings ? { project: projectBindings } : {}), ...(ownBindings ? { own: ownBindings } : {}) } } : {}),
          folder: basename(near) === `${location.id}.playbook` ? dirname(near) : near,
        });
      }
      return out;
    };
    const invalid = await this.invalidEntries(ownTop, projectRepository ? { key: projectRepository.key, path: projectRepository.configPath, top: projectTop } : undefined);
    return {
      project: projectRepository ? await list(projectRepository.key) : null,
      own: await list(own),
      ...(invalid.length > 0 ? { invalid } : {}),
    };
  }

  /**
   * Each enabled entry failing the fail-closed validation, with its own
   * failure (playbook-library-2): every entry composed alone — yours on
   * your own group's modules, a project's on top of your roster with the
   * project's modules first — and the effective commands checked across
   * them, so one bad entry hides no other.
   */
  private async invalidEntries(
    ownTop: Record<string, unknown> | null,
    project: { key: string; path: string; top: Record<string, unknown> | null } | undefined,
  ): Promise<InvalidPlaybookEntry[]> {
    if (!ownTop) return [];
    const out: InvalidPlaybookEntry[] = [];
    const entries = (top: Record<string, unknown> | null): Record<string, unknown> =>
      top && typeof top.playbooks === "object" && top.playbooks !== null ? top.playbooks as Record<string, unknown> : {};
    const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
    const commands = new Map<string, string>();
    const check = async (config: "own" | "project", id: string, compose: () => Promise<ComposedConfig>): Promise<void> => {
      try {
        const composed = await compose();
        const command = composed.playbooks.find((playbook) => playbook.id === id)?.command;
        if (command === undefined) return;
        const holder = commands.get(command);
        if (holder !== undefined && holder !== id) {
          out.push({ config, playbook: id, reason: i18n._({
            id: "duplicate effective command \"{command}\"",
            comment: "Config error: two playbooks answer to the same slash command",
            values: { command },
          }) });
        } else commands.set(command, id);
      } catch (error) {
        out.push({ config, playbook: id, reason: reason(error) });
      }
    };
    for (const id of Object.keys(entries(ownTop))) {
      const only = { ...ownTop, playbooks: { [id]: entries(ownTop)[id] } };
      await check("own", id, () => composeConfig(only, this.options.loadModule, this.configPath, { modules: this.modules(null) }));
    }
    if (project) {
      for (const id of Object.keys(entries(project.top))) {
        const projectOnly = { playbooks: { [id]: entries(project.top)[id] } };
        const ownBase = { ...ownTop, playbooks: { ...entries(ownTop) } } as Record<string, unknown>;
        await check("project", id, () => composeConfig(
          { ...ownBase, playbooks: { [id]: (ownBase.playbooks as Record<string, unknown>)[id] ?? {} } },
          this.options.loadModule, this.configPath, { modules: this.modules(project.key), project: { top: projectOnly, path: project.path }, cwd: this.store.getProject(project.key)?.path },
        ));
      }
    }
    return out;
  }

  /**
   * The tail of a compile (playbook-library-69), shared by the one-shot
   * `compile.run` and an authoring session's enabling: re-key the
   * bindings onto the compiled entry's derived roles; check the whole
   * enabling against the config's fail-closed rules before anything is
   * written (playbook-library-15, playbook-library-20); request the spec
   * package by path from the chosen spex repository's environment and
   * install it; write the players your own group's roster lacks; write
   * the `playbooks.<id>` entry, no `from`, into that spex repository's
   * config; reload. Each write is versioned on its own file; one refused
   * after others leaves them written, named in the refusal (DR-111).
   */
  private async enableCompiled(input: {
    playbookId: string;
    result: CompileResult;
    bindings: Record<string, string>;
    newPlayers: Record<string, AgentBlock> | undefined;
    projectId: string;
    /** The spex repository to enable in: the project's, by default, or your own group's. */
    repository?: string;
    packageDir: string;
  }): Promise<ConfigState> {
    const { playbookId, result } = input;
    const roles = this.rekeyRoles(result, input.bindings);
    const own = this.store.home.own();
    const targetKey = input.repository ?? input.projectId;
    if (targetKey !== own && targetKey !== input.projectId) throw noProject(targetKey);
    const target = this.store.repository(targetKey);
    if (!target) throw noProject(targetKey);
    // A request by path is relative to the environment's path root:
    // your own group's clone, or the working folder (environments-2).
    const targetFolder = this.environments.pathRoot(targetKey);
    const relativePath = targetFolder === null ? undefined : relative(resolve(targetFolder), resolve(input.packageDir));
    if (targetFolder === null || relativePath === undefined || relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new CoreError("invalid_request", targetKey === own
        ? i18n._({
          id: "This package's folder is outside your Personal records — enable it in the project, or publish it and add it from the registry",
          comment: "Refusal of Enable: a Personal package is added from a folder only inside what Spex keeps for you alone (environments-2), and this package lies elsewhere",
        })
        : i18n._({
          id: "This package's folder is outside the project folder — enable it in that project, or publish it and add it from the registry",
          comment: "Refusal of Enable: a project's package is added from a folder only inside its project folder (environments-2), and this package lies elsewhere",
        }));
    }
    const packagePath = relativePath.split(sep).join("/");
    let manifest;
    try { manifest = readManifest(input.packageDir); }
    catch (error) { throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error)); }
    const name = `${manifest.org}/${manifest.name}`;
    const entryOp: ConfigEditOp = { kind: "playbook.add", playbookId, roles };
    const playerOps: ConfigEditOp[] = Object.entries(input.newPlayers ?? {}).map(([playerId, block]) => ({ kind: "player.set", playerId, patch: block }));

    // Nothing is written until the whole enabling passes the config's
    // own rules, the new module standing in for the one the environment
    // will export (playbook-library-15).
    const base = this.modules(targetKey === own ? null : targetKey);
    const overlay: PlaybookModules = {
      repository: base.repository,
      find: (id) => (id === playbookId ? { module: result.from, builtin: false } : base.find(id)),
    };
    const context = targetKey === own ? undefined : this.projectConfigContext(targetKey);
    let validationFailure: { error: unknown } | undefined;
    try {
      let ownText = readFileSync(this.configPath, "utf8");
      for (const op of playerOps) ownText = applyConfigOp(ownText, op);
      if (targetKey === own) ownText = applyConfigOp(ownText, entryOp);
      const ownTop = parseYaml(ownText) as unknown;
      if (targetKey === own) {
        await composeConfig(ownTop, this.options.loadModule, this.configPath, { modules: overlay });
      } else {
        const projectText = applyConfigOp(existsSync(target.configPath) ? readFileSync(target.configPath, "utf8") : "", entryOp);
        const projectTop = parseYaml(projectText) as unknown;
        validateProjectConfig(projectTop, target.configPath);
        await composeConfig(ownTop, this.options.loadModule, this.configPath, { modules: overlay, project: { top: projectTop, path: target.configPath }, cwd: context?.cwd });
      }
    } catch (error) { validationFailure = { error }; }
    // The preflight authorizes the first environment/player writes too,
    // not just the final guarded config entry.
    try { context?.assertCurrent(); }
    catch { throw changedMeanwhile(join(this.store.dir, "home.yaml")); }
    if (validationFailure) {
      const { error } = validationFailure;
      throw new CoreError("invalid_config", i18n._({
        id: "compiled, but enabling was refused: {error}",
        comment: "Refusal after a successful compile; `error` is the config validation's own words",
        values: { error: error instanceof Error ? error.message : String(error) },
      }));
    }

    // Each write from here stands on its own, versioned on the file it
    // writes; any failure after one of them leaves those before it
    // written, undoes nothing, and names them (playbook-library-69,
    // DR-111).
    const done: string[] = [];
    try {
      // The spec package is requested by path and installed before the
      // config names its playbook (playbook-library-69, environments-15).
      const requested = await this.environments.ensureRequested(targetKey, name, { path: packagePath });
      if (requested) {
        done.push(i18n._({ id: "{name} added to spex.yaml", comment: "A completed step of an enabling: the package written into spex.yaml", values: { name } }));
      }
      const progress = { lockWritten: false, installed: false };
      try {
        await this.environments.installNow(targetKey, requested, progress);
      } finally {
        if (progress.lockWritten) done.push(i18n._({ id: "spex.lock written", comment: "A completed step of an enabling: spex.lock written with the versions chosen" }));
        if (progress.installed) done.push(i18n._({ id: "packages installed", comment: "A completed step of an enabling: the project's installed packages replaced, those the added package needs among them" }));
      }

      // Lanes the bindings name but the roster lacks are created first,
      // so the binding never dangles (DR-032, playbook-library-3).
      for (const op of playerOps) {
        const playerId = (op as { playerId: string }).playerId;
        const minted = await editConfigFile(this.configPath, op, this.options.loadModule, { modules: this.modules(null) });
        if (!minted.ok) {
          throw new CoreError(minted.conflict ? "conflict" : "invalid_config", i18n._({
            id: "compiled, but creating session player \"{playerId}\" was refused: {error}",
            comment: "Refusal after a successful compile; `error` is the config validation's own words",
            values: { playerId, error: minted.error },
          }));
        }
        done.push(i18n._({ id: "player {playerId} written", comment: "A completed step of an enabling: a new session player written to your own settings", values: { playerId } }));
      }
      const edit = targetKey === own
        ? await editConfigFile(this.configPath, entryOp, this.options.loadModule, { modules: this.modules(null) })
        : await editProjectConfigFile(target.configPath, this.configPath, entryOp, this.options.loadModule, this.modules(targetKey), this.projectConfigContext(targetKey));
      if (!edit.ok) {
        throw new CoreError(edit.conflict ? "conflict" : "invalid_config", i18n._({
          id: "compiled, but registration was refused: {error}",
          comment:
            "Refusal after a successful compile; `error` is the config validation's own words",
          values: { error: edit.error },
        }));
      }
      done.push(i18n._({ id: "playbook {playbookId} written", comment: "A completed step of an enabling: the playbook's entry written to the config", values: { playbookId } }));
      await this.reloadConfig();
      // The state the files stand at, or the enabling reports what it did.
      await this.settledConfig();
      this.authors.republish();
    } catch (error) {
      if (done.length === 0) throw error;
      const failure = coreErrorOf(error);
      throw new CoreError(failure.code, i18n._({
        id: "enabling stopped after {done}: {error}",
        comment: "Refusal of an enabling after some of its writes, which stand; {done} lists them, each itself a message, and {error} is the refusal's own words",
        values: { done: listed(done), error: failure.message },
      }), failure.details);
    }
    return this.configState;
  }

  /** The project a new authoring session would live in, with its spex
   * repository, or `invalid_request` where its working folder is not on
   * this device (core-service-96). */
  private draftHome(projectId: string): { project: ProjectInfo; repository: SpexRepository } {
    const project = this.store.getProject(projectId);
    const repository = this.store.repository(projectId);
    if (!project || !repository) {
      throw new CoreError("invalid_request", i18n._({
        id: "{name} has no project folder on this computer — Open here first",
        comment: "Refusal: package work in a project not opened on this computer, so its spex.yaml has no folder here; 'Open here' is the project's control on the Space surface",
        values: { name: splitKey(projectId).name.replace(/-spex$/, "") },
      }));
    }
    return { project, repository };
  }

  /** An authoring session of the named project, or `not_found`
   * (core-service-96). */
  private requireDraft(projectId: string, draftId: string): void {
    if (!this.authors.has(draftId) || this.drafts.projectOf(draftId) !== projectId) throw noDraft(draftId);
  }

  /**
   * Clones moved under `workspace/` — your own group renamed at sign-in
   * (space-59), a rename or transfer followed (space-60) — the store
   * already re-keyed: your own group's config is read where it now lies,
   * every moved clone's sessions are watched there, and each moved
   * session and ledger is announced under its new key.
   */
  private async repositoriesMoved(moves: { from: string; to: string }[]): Promise<void> {
    if (this.options.configPath === undefined) {
      const configPath = this.store.ownRepository().configPath;
      if (configPath !== this.configPath) {
        this.configPath = configPath;
        this.watcher?.close();
        this.watcher = undefined;
        if (this.options.watchConfig !== false) this.watchConfigFile();
        await this.reloadConfig();
      }
    }
    this.afterRepositoriesChanged();
    const moved = new Set(moves.map((move) => move.to));
    for (const session of this.sessions.listSessions()) {
      if (moved.has(session.projectId)) this.broadcast({ type: "session.state", session });
    }
    this.queueLedgerChange(moves.flatMap((move) => [move.from, move.to]));
  }

  /**
   * A group's spex repository on the Git host at its first session
   * (space-65): where the working folder a session starts in pairs a
   * group's own key, its repository is joined where the host lists one,
   * else created there and pushed; a refusal leaves it local only and
   * the session running. It never throws.
   */
  ensureGroupRepository(key: string): Promise<"unchanged" | "local" | "joined" | "created" | "waiting"> {
    return this.space.ensureGroupRepository(key);
  }

  /** A project was added, paired or removed: the Space surface re-reads
   * on its announcement (space-2). */
  private announceGroups(): void {
    this.space.publish().catch((error: unknown) => {
      console.error(`spex: groups state failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** A clone came or went: watch its sessions; its authoring sessions
   * are read where they stand at each use, and announced again so a
   * page shows each under the project now holding it (core-service-96). */
  private afterRepositoriesChanged(): void {
    if (this.options.watchConfig !== false) this.watchRepositories();
    this.authors.republish();
    // A new clone's environment — requesting the built-in spec package
    // since the store made it (storage-6) — resolves and installs.
    this.environments.settleUnresolved();
  }

  /**
   * Re-key an enabling's role -> player bindings onto the compiled
   * entry's derived roles (playbook-library-32).
   */
  private rekeyRoles(result: CompileResult, bindings: Record<string, string>): Record<string, string> {
    // The compiled entry's derived roles are authoritative (DR-014):
    // re-key the request's role -> player bindings onto them by
    // case-insensitive name match — slc emits the ids as the gears
    // declared them (`Coder`), the form may key them either way — and
    // an unmatched role fails before any config write, keeping the
    // artifacts for a re-registration without recompiling
    // (playbook-library-32).
    const assignments = new Map(
      Object.entries(bindings).map(([role, playerId]) => [role.toLowerCase(), playerId]),
    );
    const roles: Record<string, string> = {};
    const unmatched: string[] = [];
    for (const role of result.roles) {
      const playerId = assignments.get(role.toLowerCase());
      if (playerId === undefined) unmatched.push(role);
      else roles[role] = playerId;
    }
    if (unmatched.length > 0) {
      const listed = (roles: string[]): string =>
        roles.join(i18n._({ id: ", ", comment: "Separates names listed in one message" }));
      throw new CoreError(
        "invalid_request",
        i18n._({
          id: "compiled, but the playbook's derived roles are [{roles}] and no player was bound for: {unbound}. Re-submit with a binding per derived role; the compiled artifacts are kept.",
          comment:
            "Refusal after a successful compile; the role ids are the manifest's own",
          values: { roles: listed(result.roles), unbound: listed(unmatched) },
        }),
      );
    }
    return roles;
  }

  /** Starting an intent authorizes its same-project successor, not a
   * verdict on its delivery. Decide the one handoff synchronously at
   * settlement: the project's oldest queued intent (core-service-94).
   * Queue writes after this point can update its text, but cannot
   * create or substitute automatic work. */
  private authorizeQueueHandoff(
    sessionId: string,
    turnId: number,
    intentId: string,
    control?: TurnControlKind,
  ): QueueHandoff | undefined {
    if (this.stopping || control === "ending") return;
    const session = this.store.describeSession(sessionId);
    if (!session) return;
    const current = currentSession(this.sessions.listSessions(), session.projectId);
    if (current?.id !== sessionId || current.turnActive || current.recovery ||
        current.externalWriter || this.sessions.getLive(sessionId) || !current.continuable) return;
    const lastTurn = this.store.listTurns(sessionId).at(-1);
    if (lastTurn?.turnId !== turnId || lastTurn.status !== "finished") return;
    if (!this.dispatchBoundaryCurrent(sessionId, turnId, intentId)) return;
    const lane = this.sessions.listLanes().find((entry) => entry.sessionId === sessionId);
    if (!lane || queueSchedule(this.store, lane).standing !== "manual-ready") return;
    const ledger = this.ledger();
    const owner = this.store.getIntent(intentId);
    if (owner && owner.closedAt === undefined &&
        ledger.intents.find((entry) => entry.intent.id === intentId)?.state !== "finished") return;
    // The successor is the project's next: its oldest queued intent this
    // runtime may run, never one assigned to another (core-service-94,
    // DR-134).
    const next = ledger.intents.find((entry) =>
      entry.intent.projectId === session.projectId && entry.next !== undefined
    )?.intent;
    if (!next) return;
    return {
      sessionId,
      turnId,
      ownerIntentId: intentId,
      nextIntentId: next.id,
      projectId: session.projectId,
    };
  }

  private async advanceQueue(handoff: QueueHandoff): Promise<void> {
    const {
      sessionId,
      turnId,
      ownerIntentId,
      nextIntentId,
      projectId,
    } = handoff;
    // Let an already-admitted manual send finish. If it starts a new
    // turn, the original completion is stale; if it is refused, the
    // already-authorized queue intent can still advance normally.
    while (this.submitting.has(sessionId)) await this.submitting.get(sessionId);
    const release = this.admitSubmission(sessionId);
    let opened = false;
    let submitted = false;
    try {
      const boundary = (opened = false) => {
        if (this.stopping) return;
        const sessions = this.sessions.listSessions();
        const current = currentSession(sessions, projectId);
        if (current?.id !== sessionId || current.turnActive || current.recovery || current.externalWriter) return;
        if (this.sessions.getLive(sessionId) ? !opened : !current.continuable) return;
        const lastTurn = this.store.listTurns(sessionId).at(-1);
        if (lastTurn?.turnId !== turnId || lastTurn.status !== "finished") return;
        if (!this.dispatchBoundaryCurrent(sessionId, turnId, ownerIntentId)) return;
        return current;
      };
      const authorized = () => {
        const intent = this.store.getIntent(nextIntentId);
        if (!intent || intent.closedAt !== undefined || intent.projectId !== projectId) return;
        const ledger = this.ledger();
        const entry = ledger.intents.find((candidate) =>
          candidate.intent.id === nextIntentId
        );
        if (entry?.state !== "queued") return;
        // Next is always the oldest queued. An older intent arriving
        // through a sync, or a close, that changes next cancels the
        // handoff rather than substituting another (core-service-94).
        const currentNext = ledger.intents.find((candidate) =>
          candidate.intent.projectId === projectId && candidate.next
        );
        if (currentNext?.intent.id !== nextIntentId) return;
        return intent;
      };
      if (!boundary() || !authorized()) return;
      await this.settledConfig();
      if (!boundary() || !authorized()) return;
      await this.continueSession(sessionId);
      opened = true;
      // Opening is asynchronous. Re-read the queue and dispatch boundary
      // before sending, so edits and competing manual sends win honestly.
      if (this.stopping) return;
      const intent = boundary(true) ? authorized() : undefined;
      if (intent) {
        this.validateIntentDispatch(sessionId, intent.id);
        const attachments = intent.attachments?.length ? await this.sessions.importAttachments(sessionId,
          this.media.ownerStore({kind: "intent", projectId, intentId: intent.id}), intent.attachments) : [];
        // Asset import yields to other commands; do not dispatch an edited or
        // removed queue entry from an earlier snapshot.
        const latest = boundary(true) ? authorized() : undefined;
        if (!latest || JSON.stringify(latest) !== JSON.stringify(intent)) return;
        this.validateIntentDispatch(sessionId, intent.id);
        this.sessions.submitTurn(sessionId, intent.text, intent.id, attachments);
        submitted = true;
      }
    } finally {
      // A queue changed during opening may have nothing left to send.
      // Release that idle runtime while competing sends remain excluded.
      try {
        if (opened && !submitted && this.sessions.getLive(sessionId)) {
          await this.sessions.disposeSession(sessionId);
        }
      } finally { release(); }
    }
  }

  /** The settled turn's dispatch boundary stands: the session's latest
   * dispatch stamp is its owner's, and none is newer. A removed owner's
   * stamp went with its file (core-service-79), and that removal neither
   * authorizes nor cancels the successor (core-service-94): then only a
   * newer dispatch makes the boundary stale. */
  private dispatchBoundaryCurrent(sessionId: string, turnId: number, ownerIntentId: string): boolean {
    const dispatch = this.store.listSessionDispatches(sessionId).at(-1);
    if (!this.store.getIntent(ownerIntentId)) return !dispatch || dispatch.turnId <= turnId;
    return dispatch?.intentId === ownerIntentId && dispatch.turnId <= turnId;
  }

  private admitSubmission(sessionId: string): () => void {
    if (this.submitting.has(sessionId)) throw new CoreError("busy", i18n._({
      id: "a turn is being submitted in this session",
      comment: "Refusal: another send is already being admitted here",
    }));
    let settled!: () => void;
    this.submitting.set(sessionId, new Promise<void>((resolve) => { settled = resolve; }));
    return () => { this.submitting.delete(sessionId); settled(); };
  }

  private validateIntentDispatch(sessionId: string, intentId: string): void {
    const intent = this.requireOpenIntent(intentId);
    // Another runtime's intent runs there alone (core-service-47, DR-134),
    // and on a seat one holding no runtime runs nowhere (core-service-125,
    // DR-132); its edit and close stay allowed (core-service-43,
    // core-service-46).
    this.requireOwnIntent(intent);
    if (this.seat && intent.runtime === undefined) throw runsNowhereRefusal();
    const session = this.store.describeSession(sessionId);
    if (!session || session.projectId !== intent.projectId) {
      throw new CoreError("invalid_request", i18n._({
        id: "the intent belongs to another project",
        comment: "Refusal: the work named is not this session's project's",
      }));
    }
    const row = this.ledger().intents.find((entry) => entry.intent.id === intent.id);
    if (row?.state !== "queued") {
      throw new CoreError("conflict", i18n._({
        id: "the intent is already dispatched",
        comment: "Refusal: this work was already sent to a turn",
      }));
    }
    // One naming no runtime whose dispatch another runtime's session
    // holds is never released here: that runtime reads its stop
    // (core-service-47, DR-134).
    if (row.runsOn !== undefined) throw runsElsewhereRefusal("conflict", row.runsOn);
    // An answer is a turn of the work that asked (DR-119): a dispatch is
    // new work, so it waits while a run of this session stands parked on
    // a Boss question — the fact the fold reads for an interrupted
    // question — and queued text never answers it by accident (DR-085).
    if (foldConditions(this.store.getRecords(sessionId)).question) {
      throw new CoreError("conflict", i18n._({
        id: "this conversation is waiting for your reply; answer it first",
        comment: "Refusal: queued work cannot start while a run of this conversation waits on the Boss's answer to its question",
      }));
    }
  }

  /** Continue either host's checkpoint through the shared lifecycle. */
  private async continueSession(sessionId: string): Promise<void> {
    const session = this.store.describeSession(sessionId);
    if (!session) throw noSession(sessionId);
    // A session assigned to another runtime continues there alone, the
    // folder rule standing beneath: refused first, with its label as a
    // detail, whatever its checkpoint holds (core-service-73, DR-134).
    assertRunsHere(session);
    // The summary's current-config refusal is advisory. Check admission
    // again below, so a stale reading neither admits nor blocks a turn.
    if (!this.store.hasContinuableCheckpoint(sessionId)) {
      throw new CoreError("invalid_request", session.recovery
        ? i18n._({
            id: "Restore the interrupted turn first",
            comment: "Refusal; Restore is the control the interface offers for interrupted work",
          })
        // The stored reason where the session carries one, its own words.
        : session.continuationReason ?? i18n._({
            id: "this session has no compatible checkpoint",
            comment: "Refusal: nothing in the session's history can be continued",
          }));
    }
    const project = this.store.getProject(session.projectId);
    if (!project) {
      throw noProject(session.projectId);
    }
    // A session continues only in the working folder it ran in: its
    // clone paired with a folder here, and its recorded directory that
    // folder or one of its aliases (core-service-73, storage-6).
    const folder = this.store.home.folderOf(session.projectId);
    const cwd = this.store.sessionCwd(session.id);
    if (!folder || (cwd !== undefined && cwd !== folder.path && !folder.aliases?.includes(cwd))) {
      throw new CoreError("invalid_request", i18n._({
        id: "this session ran in {cwd}; continue it on the computer whose folder it ran in",
        comment: "Refusal: the session's recorded working directory is not the project's folder on this computer",
        values: { cwd: cwd ?? "" },
      }));
    }
    await this.sessions.continueSession(project, await this.composedFor(project.id), session);
  }

  /** The intent named must exist and still be open (DR-035). */
  private requireOpenIntent(intentId: string) {
    // Read from its file now (DR-111), as a sync may have changed it.
    const intent = this.store.currentIntent(intentId);
    if (!intent) throw noIntent(intentId);
    this.store.assertWritable({projectId:intent.projectId});
    if (intent.closedAt !== undefined) {
      throw new CoreError("conflict", i18n._({
        id: "the intent is already closed",
        comment: "Refusal: the work already carries a verdict",
      }));
    }
    return intent;
  }

  /** An intent read before an await, refused as changed meanwhile where
   * its file no longer reads the same (DR-111); the write that follows
   * lands in the same synchronous step. */
  private assertIntentUnchanged(read: IntentInfo): void {
    const now = this.store.currentIntent(read.id);
    if (!now) throw noIntent(read.id);
    if (!isDeepStrictEqual(now, read)) {
      throw new CoreError("conflict", i18n._({
        id: "{what} changed meanwhile; retry",
        values: { what: intentTitle(now) },
        comment: "Refusal of a write: the file it would replace changed since it was read; {what} names the file or folder",
      }));
    }
  }

  /** One intent's derived state, read from the one fold (DR-035). */
  private deriveIntentState(intentId: string) {
    const ledger = this.ledger();
    return ledger.intents.find((entry) => entry.intent.id === intentId)?.state;
  }

  /** Whether a run of this intent's session stands parked on the Boss
   * within the turns the intent attributes (DR-073), read from the one
   * fold rather than derived again here: a question entry is a parked
   * run by definition, and a failure entry says whether one parked. */
  private parkedRun(intentId: string): boolean {
    const ledger = this.ledger();
    const entry = ledger.attention.find(
      (row) => row.intentId === intentId && row.band === "interrupted",
    );
    if (!entry) return false;
    return entry.kind === "question" || entry.parked === true;
  }

  /** core-service-98: open the session and run one control it advertises
   * as its next turn, under turn.submit's admission, so a parked run
   * reached after a restart still answers. `awaitTurn` holds the caller
   * until that turn has settled — the ruling of core-service-46 needs
   * its outcome before it writes. `actionId` names which advertised
   * control to run; without a name the first advertised one runs. */
  private async runControl(
    sessionId: string,
    kind: "recovery" | "ending",
    awaitTurn = false,
    actionId?: string,
  ): Promise<void> {
    const release = this.admitSubmission(sessionId);
    let opened = false;
    let submitted = false;
    try {
      await this.sessions.settled(sessionId);
      if (!this.sessions.getLive(sessionId)) {
        await this.settledConfig();
        await this.continueSession(sessionId);
        opened = true;
      }
      if (awaitTurn) await this.sessions.runControl(sessionId, kind, actionId);
      else this.sessions.submitControl(sessionId, kind, actionId);
      submitted = true;
    } finally {
      // A refused control starts no turn, so the runtime this command
      // opened to read what the session advertises is let go again: an
      // idle session never stands in its project's way (DR-074).
      try {
        if (opened && !submitted && this.sessions.getLive(sessionId)) {
          await this.sessions.disposeSession(sessionId);
        }
      } finally { release(); }
    }
  }

  private requireKnownSession(sessionId: string): void {
    const known = this.store
      .listSessions()
      .some((session) => session.id === sessionId);
    if (!known) throw noSession(sessionId);
  }
}

export const createCoreService = CoreService.start;
