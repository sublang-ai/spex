// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core service: config lifecycle (load/seed/watch, CORE-2/3),
// WebSocket endpoint with hello/version handshake (CORE-1) — a
// loopback socket by default, or attached to a shell-supplied HTTP
// server (DR-033) — command dispatch with schema validation
// (CORE-13), and record channels filtered by visibility at this
// boundary (CORE-8/14).

import { ApprovalBroker } from "./approvals.js";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir, hostname, tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { resolveMachineIdentity } from "@sublang/playbook/machine-identity";
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";

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
  seedConfig,
  summarizeConfig,
  validateProjectConfig,
  type ComposedConfig,
  type AdapterRuntimeCheck,
  type LoadModule,
  type PlaybookModules,
} from "./config.js";
import {
  CAPTAIN_AGENT_ID,
  mediaOwnerRepository,
  parseCommand,
  PROTOCOL_VERSION,
  type AdapterName,
  type Channel,
  type Command,
  type ConfigState,
  type ErrorCode,
  type MediaUploadOwner,
  type ReadinessEntry,
  type ServerMessage,
  type SessionAgentSettings,
  type SessionInfo,
  type SessionAgentSettingsMap,
} from "./protocol.js";
import { resolveLanguage, type Language } from "./language.js";
import { i18n, speak } from "./i18n.js";
import { CoreError, SessionManager, currentSession, executionConfig, storedMembers, type CaptainFactory, type RecordEnvelope } from "./session.js";
import { closedStats, foldLedger, intentTitle, queueSchedule, wasWorked } from "./ledger.js";
import type { TurnControlKind } from "./control-record.js";
import { readStoredLanguage, Store, type SpexRepository } from "./store.js";
import { UPLOAD_STAGING } from "./storage-git.js";
import { foldDiagnostics, StorageFormatError, type RepairChecked, type StorageDiagnostic } from "./app-storage.js";
import { prepareStorageGitFiles } from "./storage-git.js";
import {
  GitHubForgeAdapter,
  createProjectRepo,
  seedExampleProject,
  defaultRunCommand,
  isWorkTreeRoot,
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
import { loadBuiltinCatalog } from "./builtins.js";
import { AuthorManager } from "./authoring.js";
import { AUTHORING_LANGUAGE, authoringManifest, DraftStore, draftPackagePath } from "./drafts.js";
import { EnvironmentManager, toRequest } from "./environments.js";
import {
  builtinPackage,
  isGitSource,
  isPathSource,
  isSkillName,
  prepareBuiltinEnvironment,
  readManifest,
  writeExcludeBlock,
  type BuiltinPackage,
} from "./environment/index.js";
import { kebab } from "./home.js";
import type { CommandResults, InvalidPlaybookEntry, PlaybookAvailability, PublishPreview, RoleBindingSummary } from "./protocol.js";
import {
  parseSpecTree,
  readRecordCommitTimes,
  readSpecFile,
  resolveSpecPath,
  writeSpecFile,
} from "./specs.js";
import { checkToolchain, compilePlaybook, compilerAgentOf, type CompileResult, type LineSpawner, type ToolchainRuntime } from "./compile.js";
import { browserAgent } from "./browser.js";
import { ApplicationMedia } from "./media.js";
import { MediaTransferError } from "./media-transfers.js";
import { readAgentOptions, type AgentModelDiscovery } from "./agent-options.js";
import { SpaceManager, type SpaceHost } from "./space.js";
import { GitHostClient, fileCredentialStore } from "./git-host.js";
import { relayHostError } from "./space-groups.js";
import { currentRuntime, withGitCredential } from "./git-credential.js";
import { validateRemoteUrl } from "./space-git.js";
import type { SpaceOp, SyncStep } from "./protocol.js";
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
  /** Test seam: awaited before each Space step runs, so a suite can act
   * between steps deterministically. */
  spaceBeforeStep?: (event: { op: SpaceOp; step: SyncStep; repository: string }) => void | Promise<void>;
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
}

/** Commands that write beneath a clone (space-21): refused `busy` while
 * an operation runs on that spex repository, so the core stays the sole
 * writer through it while every other clone stays writable. */
const SPACE_GATED_COMMANDS = new Set<Command["type"]>([
  "turn.submit", "session.control", "session.create", "session.restore", "session.discard", "session.delete", "session.viewed",
  "project.rebind", "project.remove",
  "intent.queue", "intent.edit", "intent.close", "intent.remove",
  "config.edit", "compile.run", "media.begin", "media.chunk", "media.finish", "media.cancel",
  "draft.create", "draft.open", "draft.send", "draft.abort", "draft.source.write", "draft.compile", "draft.register", "draft.player.set", "draft.delete", "draft.artifacts",
  // An environment's writes (environments-15, environments-17).
  "environment.request", "environment.remove", "environment.resolve", "environment.install", "environment.publish",
]);

// The Sources cache ages out at ten minutes (dashboard-14).
const FORGE_CACHE_MS = 600_000;

/** What a sync tells the environments once it applied a lock or moved a
 * clone (environments-8, environments-17): optional on the Space host. */
interface SpaceEnvironmentHooks {
  environmentChanged?(key: string): void | Promise<void>;
  environmentMoved?(oldKey: string, newKey: string): void | Promise<void>;
}

/** The engine links a compile provisions in a spec package under
 * development stay out of the working folder's Git (playbook-library-12). */
function excludeEngineLinks(workingFolder: string): void {
  try { writeExcludeBlock(workingFolder, [`/${draftPackagePath("**")}/node_modules/`], "engine links"); }
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
    ? `draft:${channel.draftId}:${channel.instance}`
    : `${channel.kind}:${channel.sessionId}`;
}

/** A session named as the reader sees it, so a language can quote its
 * own way (core-service-111). */
const titled = (title: string): string =>
  i18n._({ id: "“{title}”", comment: "A session's own title, quoted", values: { title } });
const inUseElsewhere = (name: string): string =>
  i18n._({
    id: "{name} is in use elsewhere",
    comment: "A session another host is writing right now",
    values: { name },
  });
const unverifiedOwner = (name: string): string =>
  i18n._({
    id: "{name} ownership cannot be verified",
    comment: "A session whose lease this host cannot read",
    values: { name },
  });

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
  /** The ledger fold moved (DR-035): the shell re-reads `ledger()`
   * for its badge, so the dock and the app never disagree. */
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
  /** The Git host this home signs in to (git-host-1..11). */
  private readonly hostClient: GitHostClient;
  /** The runtime the Git credential helper runs on (git-host-9). */
  private readonly hostRuntime: { execPath: string; electron: boolean };
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
  private seeded = false;
  private readonly runCommand: RunCommand;
  private readonly forge: ForgeAdapter;
  /** One in-flight compile per playbook id; abort via compile.abort. */
  private readonly activeCompiles = new Map<string, AbortController>();
  /** The project a one-shot compile writes its spec package in. */
  private readonly compileHolders = new Map<string, string>();
  /** Projects whose ledger changed since the last broadcast (DR-035). */
  private readonly ledgerChanged = new Set<string>();
  private ledgerTimer?: NodeJS.Timeout;
  /** Monotonic reload identity; a superseded reload commits nothing. */
  private reloadGeneration = 0;
  /** The reload in flight, awaited before a runtime opens (core-service-92). */
  private reloading?: Promise<void>;
  private readonly migrationDiagnostics: {file: string; reason: string; blocking: boolean}[] = [];
  private stopping = false;
  /** Tracked so shutdown cannot race an automatic continuation opening. */
  private readonly advancing = new Set<Promise<void>>();
  /** A settled lane whose one automatic handoff is being decided. */
  private readonly handoffs = new Map<string, string>();
  /** Manual and automatic sends share one admission per conversation. */
  private readonly submitting = new Map<string, Promise<void>>();
  /** Groups' engine (DR-103): one sync machine per spex repository. */
  private readonly space: SpaceManager;
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
  /** A sync's Apply through Refresh pauses its clone's watchers (space-31). */
  private readonly watchersPaused = new Set<string>();
  /** The language the core is composing in (core-service-111): the
   * resolution in force, kept so a choice that resolves to the same
   * language re-derives nothing. */
  private spoken: Language = "en";

  private constructor(options: CoreServiceOptions, store: Store) {
    this.options = options;
    this.env = options.env ?? process.env;
    this.home = options.home ?? this.env.HOME ?? homedir();
    this.store = store;
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
    // One client of the Git host the home records (git-host-1): its
    // credential in `local/credentials.yaml`, this device and app as its
    // label, and a refusal that signs the device out marking the home so
    // (git-host-4).
    const host = store.home.host;
    this.hostClient = new GitHostClient({
      url: host.url,
      label: `Spex on ${hostname()}`,
      credentials: fileCredentialStore(store.dir, host.url),
      onSignedOut: () => this.space.signedOutByHost(),
    });
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
      adapterImports: options.adapterImports,
      captainFactory: options.captainFactory,
      env: this.env,
    });
    this.sessions.onRecord = (envelope) => {
      this.dispatchRecord(envelope);
      this.events.onRecord?.(envelope);
    };
    this.sessions.onSessionState = (session) => {
      this.broadcast({ type: "session.state", session });
      this.events.onSessionState?.(session);
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
    this.environments = new EnvironmentManager({
      store: this.store,
      userHome: CoreService.userHomeOf(options, this.env, this.home),
      deviceHome: this.home,
      ...(options.compileRuntime?.modulePaths ? { modulePaths: options.compileRuntime.modulePaths } : {}),
      builtin: CoreService.shippedBuiltin(options),
      ...(options.registryFetch ? { fetch: options.registryFetch } : {}),
      // The registry presents the access secret the host client keeps
      // current (environments-12, git-host-4); a Git source at the
      // host's origin takes its brokered credential through the app's
      // helper (environments-13, git-host-9).
      token: () => this.registryToken(),
      gitCredential: (repo) => this.space.sourceCredential(repo),
      credentialArgs: async (credential) => {
        const handle = await withGitCredential(credential, this.hostRuntime);
        const env: Record<string, string> = {};
        for (const [name, value] of Object.entries(handle.env)) if (value !== undefined) env[name] = value;
        return { env, configArgs: handle.configArgs, dispose: handle.dispose };
      },
      broadcast: (repository, state) => this.broadcast({ type: "environment.state", repository, state }),
      changed: (repository) => this.environmentChanged(repository),
    });
    // A working folder unpaired from its project keeps nothing the
    // exports wrote there (environments-8).
    this.store.onProjectRemoving = (key, folder) => this.environments.removeExportsFor(key, folder);
    // The hooks a sync calls once it applied a lock or moved a clone
    // (environments-8, environments-17), beside the host's own fields.
    const spaceHost: SpaceHost & SpaceEnvironmentHooks = {
      environmentChanged: (key: string) => this.environments.applied(key),
      environmentMoved: (oldKey: string, newKey: string) => this.environments.moved(oldKey, newKey),
      settleBeneath: (repositories: string[]) => this.environments.idle(repositories),
      home: this.store.dir,
      env: this.env,
      store: this.store,
      libraryDir: this.libraryDir(),
      diagnostics: () => foldDiagnostics([...this.migrationDiagnostics, ...this.store.storageDiagnostics(), ...this.store.sessionDiagnostics(), ...this.drafts.diagnostics()]),
      checkRepairs: (diagnostics) => checkRepairs(
        diagnostics,
        this.store.listProjects().map((project) => ({ id: project.id, name: project.name, path: project.path })),
        this.runCommand,
      ),
      blocker: (repository) => this.spaceBlocker(repository),
      broadcast: (state) => this.broadcast({ type: "space.state", state }),
      pauseWatchers: (repository) => {
        this.watchersPaused.add(repository);
        if (this.adoptTimer) { clearTimeout(this.adoptTimer); this.adoptTimer = undefined; }
        if (repository === this.store.home.own() && this.reloadTimer) { clearTimeout(this.reloadTimer); this.reloadTimer = undefined; }
      },
      resumeWatchers: (repository) => { this.watchersPaused.delete(repository); },
      reloadConfig: () => this.reloadConfig(),
      rescanSessions: async (repository) => {
        await this.media.reset();
        this.drafts.refresh();
        // What the sync applied is read back before any authoring
        // session of it records again (playbook-library-70).
        this.authors.reread(repository);
        await this.syncForeignSessions();
        // A sync applied what the host holds, its lock among it: the
        // environment installs from it and exports (environments-8,
        // environments-17), its state broadcast.
        void this.environments.applied(repository).catch(() => {});
      },
      ledgerChanged: (projectIds) => this.queueLedgerChange(projectIds),
      ...(options.spaceTransportTimeoutMs !== undefined ? { transportTimeoutMs: options.spaceTransportTimeoutMs } : {}),
      ...(options.spaceBeforeStep ? { beforeStep: options.spaceBeforeStep } : {}),
      client: this.hostClient,
      signInFlow: options.signIn ?? "device",
      hostRuntime: this.hostRuntime,
      repositoriesChanged: () => this.afterRepositoriesChanged(),
      repositoriesMoved: (moves) => this.repositoriesMoved(moves),
    };
    this.space = new SpaceManager(spaceHost);
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
      approvalHandler: (draftId) => this.approvals.handler({kind: "draft", id: draftId}, () => ({ownerLabel: draftId})),
      cancelApprovals: (draftId, invocationId) => this.approvals.cancel({kind: "draft", id: draftId}, invocationId),
      retireMedia: (draftId, remove) => {
        const projectId = this.drafts.projectOf(draftId);
        return projectId ? this.media.retireOwner({kind: "draft", projectId, id: draftId}, remove) : Promise.resolve(remove());
      },
      store: this.store,
      drafts: this.drafts,
      // Read when used: your own group's config moves with its clone.
      get configPath() { return service.configPath; },
      env: this.env,
      adapterImports: options.adapterImports,
      compileSpawner: options.compileSpawner,
      compileRuntime: options.compileRuntime,
      activeCompiles: this.activeCompiles,
      composed: () => this.composed,
      readiness: (adapter) => this.readinessByAdapter.get(adapter) ?? null,
      // An id either environment exports is taken (playbook-library-51).
      reservedIds: (projectId) => this.reservedPlaybookIds(projectId),
      org: () => this.packageOrg(),
      enabled: (id) => this.draftEnabled(id),
      excludeEngineLinks: (workingFolder) => excludeEngineLinks(workingFolder),
    });
    // A draft channel names an instance (core-service-96): a subscriber
    // of an instance that left receives nothing of its successor.
    this.authors.events.onRecord = (draftId, instance, record) => {
      const key = `draft:${draftId}:${instance}`;
      for (const client of this.clients) {
        if (client.channels.has(key)) {
          this.send(client.socket, { type: "draft.record", draftId, instance, seq: record.seq, record: record.record });
        }
      }
    };
    // A transcript a re-read found changed reaches the same audience as
    // its records, whole, before anything appends (core-service-96).
    this.authors.events.onHistoryReplaced = (draftId, instance, projectId, records) => {
      const key = `draft:${draftId}:${instance}`;
      for (const client of this.clients) {
        if (client.channels.has(key)) this.send(client.socket, { type: "draft.history-replaced", draftId, instance, projectId, records });
      }
    };
    this.authors.events.onState = (draft) => this.broadcast({ type: "draft.state", draft });
    this.authors.events.onSource = (message) => this.broadcast(message);
    this.authors.events.onProgress = (draftId, line) => this.broadcast({ type: "compile.progress", playbookId: draftId, line });
    this.authors.events.onRemoved = (draftId, projectId, instance) => this.broadcast({ type: "draft.removed", draftId, projectId, instance });
    this.media = new ApplicationMedia({
      home: this.store.dir,
      directoryOf: (owner) => this.mediaDirectory(owner),
      assertOwner: (owner, write) => {
        if (this.stopping) throw new CoreError("busy", i18n._({id: "The core is stopping.", comment: "Refusal during attachment admission"}));
        const repository = mediaOwnerRepository(owner);
        const gate = this.space.busyFor(repository ?? (owner.kind === "session" ? this.store.sessionRepository(owner.id) : undefined));
        if (write && gate) throw new CoreError("busy", gate);
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
          if (!this.authors.has(owner.id) || this.drafts.projectOf(owner.id) !== owner.projectId) throw noDraft(owner.id);
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

  /** The access secret the registry presents (environments-12): the host
   * client's, kept current (git-host-4); null while signed out. A host
   * that cannot be reached, or asks to wait, reads as it answered
   * (git-host-11). */
  private async registryToken(): Promise<string | null> {
    try {
      return await this.hostClient.accessSecret();
    } catch (error) {
      throw new Error(relayHostError(error, this.space.hostName()));
    }
  }

  /** The `org` of a new spec package: the account's login, else `local`
   * (playbook-library-70). */
  private packageOrg(): string {
    const host = this.store.home.host;
    const login = host.account && !host.signedOut ? kebab(host.account.login).slice(0, 64) : "";
    return login || "local";
  }

  /** Playbook ids a new authoring session of a project may not take:
   * every playbook the project's or your own group's environment
   * exports, but the one a folder `spex-packages/<id>/` left by a
   * deleted session exports, which the new session takes over
   * (playbook-library-51). */
  private reservedPlaybookIds(projectId: string): string[] {
    const ids = new Set(this.composed?.playbooks.map((playbook) => playbook.id) ?? []);
    for (const key of new Set([projectId, this.store.home.own()])) {
      for (const resolution of Object.values(this.environments.lockOf(key)?.packages ?? {})) {
        for (const [exported, artifact] of Object.entries(resolution.exports)) {
          const own = isPathSource(resolution.source) && key === projectId && resolution.source.path === draftPackagePath(artifact);
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
      const folder = this.environments.workingFolder(key);
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

  /** The players every project's file names that your own group's
   * roster lacks (core-service-2, settings-46), listed on the valid
   * config state; a project's session raises them when it opens. */
  private missingPlayers(ownTop: unknown): import("./protocol.js").MissingPlayer[] {
    const own = this.store.home.own();
    const projects: { repository: string; top: unknown }[] = [];
    for (const repository of this.store.listRepositories()) {
      if (repository.key === own || resolve(repository.configPath) === resolve(this.configPath) || !existsSync(repository.configPath)) continue;
      try { projects.push({ repository: repository.key, top: parseYaml(readFileSync(repository.configPath, "utf8")) }); }
      catch { /* that project's own load reports it */ }
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

  /**
   * The named blocker of an operation on one clone (space-11): a turn
   * in flight or being admitted in one of its sessions, a session of it
   * held — or unprovably held — by another host, observed live through
   * its shared store, a turn of one of its authoring sessions, or a
   * running compile of them.
   */
  private async spaceBlocker(repository: string): Promise<string | undefined> {
    if (this.media.isWriting()) return i18n._({id: "Wait for the media upload to finish.", comment: "Attachment transfer or storage diagnostic"});
    // An environment resolving or installing writes beneath the clone.
    const installing = this.environments.busyFor(repository);
    if (installing) return installing;
    const sessions = this.sessions.listSessions().filter((session) => session.projectId === repository);
    for (const session of sessions) {
      const project = this.store.getProject(session.projectId)?.name ?? i18n._({
        id: "the project",
        comment: "Stands in for a project's name where the core has none",
      });
      const name = session.title ? titled(session.title) : i18n._({
        id: "a new session",
        comment: "Stands in for the title of a session that has none yet",
      });
      if (session.externalWriter === "active") return inUseElsewhere(name);
      if (session.externalWriter === "unknown") return unverifiedOwner(name);
      if (session.live || session.turnActive || this.submitting.has(session.id)) return i18n._({
        id: "Wait for {name} in {project}",
        comment:
          "What blocks a Space operation: a session of this project is working",
        values: { name, project },
      });
    }
    if ([...this.submitting.keys()].some((sessionId) => this.store.sessionRepository(sessionId) === repository)) return i18n._({
      id: "Wait for the turn being submitted",
      comment: "What blocks a Space operation: a turn is being admitted",
    });
    const answering = this.authors.turning(repository);
    if (answering !== undefined) return i18n._({
      id: "Wait for {playbookId}",
      comment: "What blocks a Space operation: an authoring session of this spex repository has a turn running",
      values: { playbookId: answering },
    });
    for (const playbookId of this.activeCompiles.keys()) {
      const holder = this.compileHolders.get(playbookId) ?? this.drafts.projectOf(playbookId) ?? this.store.home.own();
      // A compile.run holds the spex repository of the authoring session
      // its id names as well as its own project's (space-11).
      if (holder !== repository && this.drafts.projectOf(playbookId) !== repository) continue;
      return i18n._({
        id: "{playbookId} is compiling",
        comment: "What blocks a Space operation: a playbook compile is running",
        values: { playbookId },
      });
    }
    // A lease taken since the last rescan is still a held session.
    const shared = this.store.sessionStore(repository);
    for (const session of sessions) {
      if (this.sessions.getLive(session.id)) continue;
      const name = session.title ? titled(session.title) : i18n._({
        id: "a session",
        comment: "Stands in for the title of a session that has none",
      });
      let lease: "active" | "idle" | "unknown";
      try { lease = await shared.readLeaseState(session.id); } catch { lease = "unknown"; }
      if (lease === "active") return inUseElsewhere(name);
      if (lease === "unknown") return unverifiedOwner(name);
    }
    return undefined;
  }

  private requireSpace(): SpaceManager {
    return this.space;
  }

  /** The spex repository a command writes beneath, for the write gate
   * (space-21); undefined where it writes beneath none. */
  private commandRepository(command: Command): string | undefined {
    switch (command.type) {
      case "turn.submit": case "session.control": case "session.restore": case "session.discard": case "session.delete": case "session.viewed":
        return this.store.sessionRepository(command.sessionId);
      case "session.create": case "project.rebind": case "project.remove": case "intent.queue":
        return command.projectId;
      case "intent.edit": case "intent.close": case "intent.remove":
        return this.store.getIntent(command.intentId)?.projectId;
      case "config.edit":
        return command.repository ?? this.store.home.own();
      case "compile.run":
        return command.projectId;
      case "environment.request": case "environment.remove": case "environment.resolve": case "environment.install": case "environment.publish":
        return command.repository;
      case "draft.open": case "draft.artifacts":
        return command.projectId;
      case "media.begin":
        return mediaOwnerRepository(command.owner);
      case "media.chunk": case "media.finish": case "media.cancel": {
        const owner = this.media.uploads.ownerOf(command.uploadId);
        return owner ? mediaOwnerRepository(owner) : undefined;
      }
      case "draft.create": case "draft.send": case "draft.abort": case "draft.source.write": case "draft.compile":
      case "draft.register": case "draft.player.set": case "draft.delete":
        return command.projectId;
      default:
        return undefined;
    }
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

  /** The one ledger fold (DR-035), for the embedding shell's badge. */
  ledger(): import("./protocol.js").LedgerState {
    return foldLedger({
      store: this.store,
      lanes: this.ledgerLanes(),
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
    if (process.platform !== "darwin" && process.platform !== "linux") {
      throw new Error(i18n._({
        id: "Spex desktop and server require macOS or Linux with private POSIX file permissions. On Windows, use the scaffold CLI or connect to a Spex server in your browser.",
        comment: "Startup refusal shown in the shell's dialog on an unsupported host",
      }));
    }
    if (options.dataDir) ApplicationMedia.assertStagingParents(options.dataDir);
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
          id: "Spex cannot identify this machine: {reason}",
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
    const store = await Store.open({
      ...(options.dataDir ? { dir: options.dataDir } : {}),
      ...(machineIdentity !== undefined ? { machineIdentity } : {}),
      ...(options.legacyDbPath ? { legacyDbPath: options.legacyDbPath } : {}),
      ...(options.own ? { own: options.own } : {}),
      env,
      ...(options.dataDir ? { libraryDir: options.libraryDir ?? join(options.dataDir, "playbooks") } : {}),
      ...(relocateConfig ? { relocateConfig } : {}),
      ...(builtin ? { prepareRepository: (dir: string, _key: string, hostUrl: string) => { prepareBuiltinEnvironment(dir, builtin, hostUrl); } } : {}),
    });
    let service: CoreService;
    try { service = new CoreService(options, store); }
    catch (error) { store.close(); throw error; }
    try {
    // Store construction already holds the exclusive home lease. Never
    // reclaim another live core's incomplete uploads before that boundary.
    await service.media.prepare();
    service.store.markAllSessionsNotLive();
    service.relocateLegacyLibrary();
    // The store seeds your own group's config as the clone stands up;
    // the core reports that starter as its own seed (settings-9).
    service.seeded = seedConfig(service.configPath) ||
      (service.configPath === store.ownRepository().configPath && store.seededConfig);
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
        // A sync's Apply through Refresh writes the directory itself and
        // ends in one full rescan (space-31).
        if (this.watchersPaused.has(key)) return;
        // The CLI can append without replacing its manifest. Our own
        // sidecars are irrelevant, and the store excludes owned sessions
        // when a shared stream changes. A missing filename means scan.
        if (filename && (
          (!filename.endsWith(".json") && !filename.endsWith(".records.jsonl") && !/^\.[0-9a-f-]{36}\.lock$/.test(filename)) ||
          filename.endsWith(".spex.json")
        )) {
          return;
        }
        if (filename?.endsWith(".records.jsonl")) {
          const session = this.store.describeSession(filename.slice(0, -".records.jsonl".length));
          if (session?.live) return;
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
          // A sync's Apply through Refresh reloads once it is done
          // (space-31).
          if (this.watchersPaused.has(key)) return;
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
    const address = this.wss?.address() as AddressInfo | null;
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
    this.approvals.stop();
    for (const entry of this.browserPreparations.values()) entry.controller.abort();
    await Promise.allSettled([...this.browserPreparations.values()].map(({done}) => done));
    this.watcher?.close();
    for (const watcher of this.sessionsWatchers.values()) watcher.close();
    this.sessionsWatchers.clear();
    for (const { watcher } of this.configWatchers.values()) watcher.close();
    this.configWatchers.clear();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    if (this.adoptTimer) clearTimeout(this.adoptTimer);
    // A Space transport in flight is stopped; a local step finishes.
    await this.space.stop();
    // An environment's resolve or install finishes; nothing new starts.
    await this.environments.stop();
    await this.adoptScan;
    if (this.ledgerTimer) clearTimeout(this.ledgerTimer);
    // A draft compile cut here stays "running" on disk and reads as
    // interrupted at the next start (playbook-library-59); its turns
    // abort and are awaited so no Cligent outlives the core (DR-051).
    this.authors.markStopping();
    // Kill any in-flight compile child so shutdown never orphans slc.
    for (const controller of this.activeCompiles.values()) controller.abort();
    // A disposal failure must not leave the endpoint or the store open
    // (CORE-39): finish the shutdown, then report it to the host.
    let failure: { error: unknown } | undefined;
    try {
      await Promise.all(this.advancing);
      await this.sessions.disposeAll();
    } catch (error) {
      failure = { error };
    }
    await this.authors.stopAll();
    await this.media.close();
    for (const client of this.clients) client.socket.close();
    await new Promise<void>((resolveClose) =>
      this.wss ? this.wss.close(() => resolveClose()) : resolveClose(),
    );
    // No draft is written once the authors have stopped; a scratch
    // home goes with its store.
    this.store.close();
    if (failure) throw failure.error;
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

  /** The composition of {@link composedFor} on the config already
   * loaded: `ready` first waits for the project's environment, which a
   * reload's own broadcast does not, its environment announcing itself
   * when it settles (environments-17). */
  private async composeProject(projectId: string, ready: boolean): Promise<ComposedConfig> {
    if (this.configState.status !== "valid" || !this.composed) {
      throw new CoreError("invalid_config", this.configRefusal());
    }
    const repository = this.store.repository(projectId);
    if (!repository || resolve(repository.configPath) === resolve(this.configPath)) return this.composed;
    const hasProjectFile = existsSync(repository.configPath);
    const file = hasProjectFile ? repository.configPath : this.configPath;
    const cause = (error: unknown): CoreError => new CoreError("invalid_config", i18n._({
      id: "{file}: {reason}", comment: "A storage fault as one line: the file, then the reason — itself a message",
      values: { file, reason: error instanceof Error ? error.message : String(error) },
    }));
    let projectTop: unknown;
    let ownTop: unknown;
    try {
      projectTop = hasProjectFile ? parseYaml(readFileSync(repository.configPath, "utf8")) : undefined;
      ownTop = parseYaml(readFileSync(this.configPath, "utf8"));
    } catch (error) { throw cause(error); }
    // The session's playbooks come from the project's environment before
    // your own group's (environments-9), whether or not the project's
    // own file enables any; one not yet resolved resolves first.
    if (ready) await this.environments.ready(projectId);
    try {
      return await composeConfig(ownTop, this.options.loadModule, this.configPath, {
        modules: this.modules(projectId),
        ...(hasProjectFile ? { project: { top: projectTop, path: repository.configPath } } : {}),
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
    const own = this.configState;
    if (own.status !== "valid") return own;
    const repository = this.store.repository(projectId);
    if (!repository) throw noProject(projectId);
    try {
      const composed = await this.composeProject(projectId, ready);
      if (composed === this.composed) return own;
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
      if (!(error instanceof CoreError)) throw error;
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

  /** Broadcast the config state with every project's composition. */
  private async broadcastConfig(generation: number): Promise<void> {
    const projects = await this.projectConfigStates();
    if (generation !== this.reloadGeneration) return;
    this.broadcast({ type: "config.state", state: this.configState, ...(projects ? { projects } : {}) });
  }

  private async settledConfig(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = undefined;
      await this.reloadConfig();
    }
    while (this.reloading) await this.reloading;
  }

  private async reloadNow(generation: number): Promise<void> {
    // Reloads overlap: the watcher fires and forgets, two command paths
    // await their own, and external edits add more. Each reload reads the
    // file at its own start, so the newest reload holds the newest content
    // and every superseded one must discard its work — committing it would
    // publish an older file's state, and a readiness probe that outlived a
    // newer reload would overwrite that reload's broadcast with entries
    // for a configuration no longer active.
    let nextState: ConfigState;
    let nextComposed: ComposedConfig | undefined;
    if (!existsSync(this.configPath)) {
      nextState = { status: "missing", path: this.configPath };
      nextComposed = undefined;
    } else {
      try {
        const loaded = await loadConfig(this.configPath, this.options.loadModule, { modules: this.modules(null) });
        nextComposed = loaded.composed;
        const missingPlayers = this.missingPlayers(loaded.raw);
        nextState = {
          status: "valid",
          summary: summarizeConfig(loaded),
          seeded: this.seeded,
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
    if (generation !== this.reloadGeneration) return;
    this.composed = nextComposed;
    this.configState = nextState;
    await this.broadcastConfig(generation);
    if (generation !== this.reloadGeneration) return;
    const entries = await this.readiness();
    if (generation !== this.reloadGeneration) return;
    this.broadcast({ type: "readiness.state", entries });
  }

  private watchConfigFile(): void {
    const dir = dirname(this.configPath);
    const file = basename(this.configPath);
    if (!existsSync(dir)) return;
    this.watcher = watch(dir, (_eventType, filename) => {
      if (this.watchersPaused.has(this.store.home.own())) return;
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
    return Promise.all(
      [...positions.entries()].map(async ([adapter, usedBy]) => {
        const readiness = await checkAdapterReadiness(
          adapter,
          this.env,
          this.home,
          this.options.adapterRuntime ?? checkAdapterRuntime,
        );
        this.readinessByAdapter.set(adapter, readiness.ready);
        return {
          adapter,
          ready: readiness.ready,
          ...(readiness.requirement
            ? { requirement: readiness.requirement }
            : {}),
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

  /** The Git host this home records (git-host-1): the one URL whose
   * pages a shell opens in the system browser (app-shell-20). */
  hostUrl(): string {
    return this.store.home.host.url;
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
      const query = new URL(info.req.url ?? "/", "ws://127.0.0.1").searchParams;
      return query.get("token") === this.authToken;
    };
    this.wss = this.options.httpServer
      ? new WebSocketServer({ server: this.options.httpServer, verifyClient })
      : new WebSocketServer({ host: "127.0.0.1", port, verifyClient });
    this.wss.on("connection", (socket) => {
      const client: ClientState = { socket, channels: new Set() };
      this.clients.add(client);
      socket.on("close", () => {
        this.clients.delete(client);
        for (const entry of this.browserPreparations.values()) {
          if (entry.client === client) entry.controller.abort();
        }
      });
      socket.on("message", (data) => {
        void this.handleMessage(client, String(data));
      });
      this.send(socket, {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        coreVersion: CORE_VERSION,
      });
      this.send(socket, {type: "approval.state", state: this.approvals.snapshot()});
    });
    if (this.options.httpServer) return; // the shell listens
    await new Promise<void>((resolveListen, rejectListen) => {
      this.wss?.once("listening", resolveListen);
      this.wss?.once("error", rejectListen);
    });
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
    try {
      const result = await this.execute(client, command);
      this.send(client.socket, {
        type: "reply",
        id: command.id,
        ok: true,
        result,
      });
    } catch (error) {
      const code: ErrorCode =
        error instanceof CoreError ? error.code : error instanceof MediaTransferError ? "invalid_request" : error instanceof StorageFormatError ? "invalid_request" : (error as {code?:string})?.code === "PLAYBOOK_SESSION_LEASE_ACTIVE" ? "busy" : "internal";
      const message = error instanceof Error ? error.message : String(error);
      this.send(client.socket, {
        type: "reply",
        id: command.id,
        ok: false,
        error: {
          code,
          message,
          ...(error instanceof CoreError && error.details ? { details: error.details } : {}),
        },
      });
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
      return await browserAgent(command.agent, cwd, command.context?.kind === "draft", this.options.adapterImports);
    } catch (cause) {
      throw new CoreError("invalid_config", cause instanceof Error ? cause.message : String(cause));
    }
  }

  private async execute(
    client: ClientState,
    command: Command,
  ): Promise<unknown> {
    // The write gate (space-21): while an operation runs on a spex
    // repository, every command writing beneath its clone is refused
    // naming the operation; other clones stay writable.
    const gate = SPACE_GATED_COMMANDS.has(command.type) ? this.space.busyFor(this.commandRepository(command)) : undefined;
    if (gate) throw new CoreError("busy", gate);
    if (["project.create", "project.register", "project.rebind", "project.remove"].includes(command.type)) this.store.assertProjectsWritable();
    if (command.type === "session.create" || command.type === "intent.queue") this.store.assertWritable({projectId:command.projectId});
    if (command.type === "session.restore" || command.type === "session.discard" || command.type === "turn.submit" || command.type === "session.control") this.store.assertWritable({sessionId:command.sessionId});
    switch (command.type) {
      case "approval.list": return this.approvals.snapshot();
      case "approval.respond": return this.approvals.respond(command.generation, command.requestId, command.owner, command.decision);
      case "media.begin": {
        this.media.ownerStore(command.owner, true);
        return this.media.writing(() => this.media.uploads.begin(command));
      }
      case "media.chunk":
        return this.media.writing(() => this.media.uploads.chunk(command.uploadId, command.offset, command.data));
      case "media.finish":
        return this.media.writing(() => this.media.uploads.finish(command.uploadId));
      case "media.cancel":
        return this.media.writing(() => this.media.uploads.cancel(command.uploadId));
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
        if (this.browserPreparations.has(command.operationId) ||
            [...this.browserPreparations.values()].some((entry) => entry.client === client)) {
          throw new CoreError("busy", i18n._({id: "Browser preparation is already running.", comment: "Refusal: this client already owns browser preparation"}));
        }
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
        if (command.projectId === undefined) return this.configState;
        await this.settledConfig();
        return this.projectConfigState(command.projectId, true);
      case "readiness.get":
        return this.readiness();
      case "agent.options":
        return readAgentOptions(command.adapter, this.env, this.options.discoverAgentModels);
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
        const registered = this.store.registerProject(path, basename(path), Date.now());
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
        await this.syncForeignSessions();
        this.announceGroups();
        return project;
      }
      case "storage.diagnostics":
        return foldDiagnostics([...this.migrationDiagnostics, ...this.store.storageDiagnostics(), ...this.store.sessionDiagnostics(), ...this.drafts.diagnostics(), ...this.authors.diagnostics()]);
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
            await seedExampleProject({ path, run: this.runCommand });
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
          throw new CoreError("invalid_request", message);
        }
        const created = this.store.registerProject(path, basename(path), Date.now());
        this.afterRepositoriesChanged();
        this.announceGroups();
        return created;
      }
      case "project.status": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        return repoStatus(project.path, this.runCommand);
      }
      case "forge.items": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
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
          return { ...cached.state, at: cached.at };
        }
        const status = await repoStatus(project.path, this.runCommand);
        const at = Date.now();
        const state = {
          ...(await this.forge.state(project.path, status.originUrl)),
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
        if (!this.store.repository(key) && !this.store.home.folderOf(key)) throw noProject(key);
        if (key === this.store.home.own() && !this.store.home.folderOf(key)) throw noProject(key);
        // Removal waits for what a sync of the spex repository waits
        // for — an authoring session's turn, compile or enabling among
        // it — naming it (projects-10, space-11).
        const blocker = await this.spaceBlocker(key);
        if (blocker !== undefined) throw new CoreError("busy", blocker);
        // What has not reached the host asks a second confirmation
        // naming the count (projects-9).
        if (command.confirm !== true) {
          const units = await this.space.pendingUnits(key);
          if (units > 0) {
            throw new CoreError("conflict", i18n._({
              id: "{count, plural, one {# record has} other {# records have}} not reached the host and would be lost; confirm to remove anyway",
              comment: "Refusal asking a second confirmation: removing the project deletes its spex repository's clone, whose records were never sent",
              values: { count: units },
            }), { units });
          }
        }
        const removed = this.store.listSessions().filter((session) => session.projectId === key).map((session) => session.id);
        await this.media.retireOwner({kind: "project", id: key}, () => {
          if (!this.store.removeProject(key)) throw noProject(key);
        }, () => {
          if (!this.store.repository(key) && !this.store.home.folderOf(key)) throw noProject(key);
          this.store.assertProjectsWritable();
        });
        for (const sessionId of removed) this.broadcast({ type: "session.removed", sessionId, projectId: key });
        this.afterRepositoriesChanged();
        this.queueLedgerChange([key]);
        this.announceGroups();
        return null;
      }
      case "session.list":
        return this.sessions.listSessions();
      case "session.create": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw noProject(command.projectId);
        }
        // A project's group gains its own spex repository at session
        // start where it has none (DR-103); it checks for itself and
        // never throws.
        void this.ensureGroupRepository(project.id).catch(() => {});
        // Yours with the project.s own on top (core-service-2).
        return this.sessions.createSession(project, await this.composedFor(project.id));
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
          // An unknown draft, or an instance the session the id names
          // does not hold, is refused as every draft command refuses it
          // (core-service-96), never subscribed to in advance.
          this.authors.admit(command.channel.draftId, { instance: command.channel.instance });
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
          ? await editProjectConfigFile(target.configPath, this.configPath, op, this.options.loadModule, this.modules(target.key))
          : await editConfigFile(
            this.configPath,
            op,
            this.options.loadModule,
            { modules: this.modules(null) },
          );
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
        // enables it (playbook-library-34).
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
        // The one-shot compile writes the spec package under development
        // in the working folder of the project it names (environments-10).
        const project = this.store.getProject(command.projectId);
        if (!project) throw noProject(command.projectId);
        if (!isSkillName(command.playbookId)) throw invalidPlaybookId(command.playbookId);
        // One compile per playbook id, fail-closed (DR-010 §5): a
        // duplicate submission is rejected, never queued or merged.
        if (this.activeCompiles.has(command.playbookId)) {
          throw new CoreError(
            "busy",
            i18n._({
              id: "a compile is already running for {playbookId}",
              comment: "Refusal: one compile per playbook at a time",
              values: { playbookId: command.playbookId },
            }),
          );
        }
        const controller = new AbortController();
        this.activeCompiles.set(command.playbookId, controller);
        this.compileHolders.set(command.playbookId, project.id);
        // A session of the id reads compiling while this compile holds
        // it (core-service-96).
        this.authors.announce(command.playbookId);
        try {
          const packagePath = draftPackagePath(command.playbookId);
          const packageDir = join(project.path, ...packagePath.split("/"));
          mkdirSync(join(packageDir, "playbooks", AUTHORING_LANGUAGE), { recursive: true });
          if (!existsSync(join(packageDir, "meta.yaml"))) writeFileSync(join(packageDir, "meta.yaml"), authoringManifest(command.playbookId, this.packageOrg()));
          excludeEngineLinks(project.path);
          const libraryDir = join(packageDir, "playbooks", AUTHORING_LANGUAGE);
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
              env: this.env,
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
            if (controller.signal.aborted) {
              throw new CoreError("aborted", i18n._({
                id: "compile canceled",
                comment: "The outcome of a compile the reader stopped",
              }));
            }
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
          // Only this compile's hold on the id goes (playbook-library-70).
          if (this.activeCompiles.get(command.playbookId) === controller) {
            this.activeCompiles.delete(command.playbookId);
            this.compileHolders.delete(command.playbookId);
          }
          // The id is free: a session of it reads idle again and
          // dispatches its queue (playbook-library-102).
          this.authors.released(command.playbookId);
        }
      }
      case "compile.abort": {
        const controller = this.activeCompiles.get(command.playbookId);
        if (!controller) {
          throw new CoreError(
            "not_found",
            i18n._({
              id: "no compile is running for {playbookId}",
              comment: "Refusal: nothing to abort for this playbook",
              values: { playbookId: command.playbookId },
            }),
          );
        }
        controller.abort();
        this.broadcast({
          // English, deliberately (core-service-111): the page reads the
          // compile's progress lines, and this one tells it the run was
          // canceled, so it is wire text rather than the core's prose.
          type: "compile.progress",
          playbookId: command.playbookId,
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
        if (command.source && command.source.kind !== "chat") {
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
        }
        // An intent holds no place of its own: the queue is its project's
        // queued intents oldest first (core-service-42, core-service-107).
        const id = randomUUID();
        const account = this.store.home.host;
        const author = account.account && !account.signedOut
          ? { login: account.account.login, displayName: account.account.displayName }
          : undefined;
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
          this.store.addIntent(intent);
        } catch (error) {
          rmSync(this.store.intentAssetsDir(id, project.id), { recursive: true, force: true });
          throw error;
        }
        this.queueLedgerChange([project.id]);
        return this.store.getIntent(intent.id);
      }
      case "intent.edit": {
        const intent = this.requireOpenIntent(command.intentId);
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
        this.requireOpenIntent(intent.id);
        if (this.deriveIntentState(intent.id) !== "queued") throw new CoreError("conflict", i18n._({id: "A dispatched intent's content is history.", comment: "Refusal during attachment admission"}));
        this.store.editIntent(intent.id, command.text, command.attachments);
        this.queueLedgerChange([intent.projectId]);
        return this.store.getIntent(intent.id);
      }
      case "intent.close": {
        let intent = this.requireOpenIntent(command.intentId);
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
      // Groups (space-29): the core performs every Git operation, one
      // spex repository at a time; long commands reply accepted and
      // report as state.
      case "space.get":
        return this.requireSpace().get();
      // The Git host (git-host-2..10, space-3..6, space-58..65): sign-in
      // and its set-up, the host read, picks, joins and members.
      case "space.refresh":
        return this.requireSpace().refresh();
      case "space.signin.start":
        return this.requireSpace().signInStart();
      case "space.signin.cancel":
        return { stopped: this.requireSpace().signInCancel() };
      case "space.signout":
        return this.requireSpace().signOut();
      case "space.pick":
        return this.requireSpace().pick(command.repository, command.choice, command.noticed === true);
      case "space.join":
        return this.requireSpace().join(command.hostId, command.folder === undefined ? undefined : expandPath(command.folder, this.home));
      case "space.members":
        return this.requireSpace().members(command.repository);
      case "space.remote.set":
        return this.requireSpace().setRemote(command.repository, command.url);
      case "space.fetch":
        return this.requireSpace().fetch(command.repository);
      case "space.sync":
        return this.requireSpace().sync(command.repository, {
          ...(command.choices ? { choices: command.choices } : {}),
          ...(command.join !== undefined ? { join: command.join } : {}),
          ...(command.noticed !== undefined ? { noticed: command.noticed } : {}),
        });
      case "space.cancel":
        return { stopped: this.requireSpace().cancel(command.repository) };
      case "space.diff":
        return this.requireSpace().diff(command.repository, command.unit, command.path, command.side);
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
      case "draft.create": {
        const project = this.store.getProject(command.projectId);
        const repository = this.store.repository(command.projectId);
        if (!project || !repository) {
          throw new CoreError("invalid_request", i18n._({
            id: "{projectId} has no working folder on this device",
            comment: "Refusal: an authoring session belongs to a project whose working folder is on this device",
            values: { projectId: command.projectId },
          }));
        }
        // The id names the spec package, the file and the command: the
        // Agent Skills name rule (playbook-library-51).
        if (!isSkillName(command.draftId)) throw invalidPlaybookId(command.draftId);
        return this.authors.create(command.draftId, { key: repository.key, authoringDir: repository.authoringDir, workingFolder: project.path });
      }
      case "draft.open":
        // The bootstrap: it hands the client the session's instance.
        this.requireDraft(command.projectId, command.draftId);
        return this.authors.open(command.draftId, command.afterSeq);
      case "draft.send": {
        this.requireDraft(command.projectId, command.draftId, command.instance);
        const owner = {kind: "draft" as const, projectId: command.projectId, id: command.draftId};
        await this.media.validate(owner, command.attachments ?? []);
        this.media.ownerStore(owner, true);
        return this.authors.send(command.draftId, {text: command.text, ...(command.attachments?.length ? {attachments: command.attachments} : {})});
      }
      case "draft.abort":
        this.requireDraft(command.projectId, command.draftId, command.instance);
        return this.authors.abort(command.draftId);
      case "draft.source.write":
        this.requireDraft(command.projectId, command.draftId, command.instance);
        return this.authors.writeSource(command.draftId, {
          ...(command.content !== undefined ? { content: command.content } : {}),
          ...(command.sourcePath !== undefined ? { sourcePath: command.sourcePath } : {}),
          ...(command.baseVersion !== undefined ? { baseVersion: command.baseVersion } : {}),
        });
      case "draft.compile":
        this.requireDraft(command.projectId, command.draftId, command.instance);
        return this.authors.compile(command.draftId);
      case "draft.register": {
        this.requireDraft(command.projectId, command.draftId, command.instance);
        if (!existsSync(this.configPath)) {
          throw new CoreError("invalid_config", i18n._({
            id: "config file is missing",
            comment: "Refusal: no config file exists at the path the core reads",
          }));
        }
        // Re-package with the confirmed command and intent, then enable
        // through the shared path — the session held busy throughout and
        // kept after, enabled; a refused write leaves it standing with
        // its artifacts (playbook-library-69).
        return await this.authors.register(
          command.draftId,
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
        this.requireDraft(command.projectId, command.draftId, command.instance);
        return this.authors.setPlayer(command.draftId, command.playerId);
      case "draft.delete":
        this.requireDraft(command.projectId, command.draftId, command.instance);
        this.authors.assertDeletable(command.draftId);
        await this.media.retireOwner({kind: "draft", projectId: command.projectId, id: command.draftId}, () => this.authors.delete(command.draftId),
          () => this.authors.assertDeletable(command.draftId));
        return null;
      case "draft.artifacts": {
        this.requireDraft(command.projectId, command.draftId, command.instance);
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
        return this.environments.state(command.repository);
      case "environment.request": {
        const { done } = await this.environments.request(command.repository, command.name, toRequest(command.request));
        void done.catch(() => {});
        return { accepted: true };
      }
      case "environment.remove": {
        const { done } = await this.environments.remove(command.repository, command.name);
        void done.catch(() => {});
        return { accepted: true };
      }
      case "environment.resolve":
        void this.environments.resolveLater(command.repository).catch(() => {});
        return { accepted: true };
      case "environment.install":
        void this.environments.installLater(command.repository).catch(() => {});
        return { accepted: true };
      case "environment.search":
        return { packages: await this.environments.search(command.query) };
      case "environment.publish": {
        // A dry run replies the inline summary and uploads nothing
        // (playbook-library-93); the upload reports through state.
        const { done, preview } = await this.environments.publish(command.repository, command.path, command.dryRun === true);
        void done.catch(() => {});
        return command.dryRun === true ? { accepted: true, preview } : { accepted: true };
      }
      case "environment.playbooks":
        return this.playbookAvailability(command.projectId);
    }
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
          this.options.loadModule, this.configPath, { modules: this.modules(project.key), project: { top: projectOnly, path: project.path } },
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
   * config; reload.
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
    const targetFolder = this.environments.workingFolder(targetKey);
    const relativePath = targetFolder === null ? undefined : relative(resolve(targetFolder), resolve(input.packageDir));
    if (targetFolder === null || relativePath === undefined || relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new CoreError("invalid_request", i18n._({
        id: "the environment of {repository} can request this spec package by path only from inside its own working folder; enable it in the project, or publish it and add it from the registry",
        comment: "Refusal: a request by path names a folder inside the repository's working folder (environments-2)",
        values: { repository: targetKey },
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
        await composeConfig(ownTop, this.options.loadModule, this.configPath, { modules: overlay, project: { top: projectTop, path: target.configPath } });
      }
    } catch (error) {
      throw new CoreError("invalid_config", i18n._({
        id: "compiled, but enabling was refused: {error}",
        comment: "Refusal after a successful compile; `error` is the config validation's own words",
        values: { error: error instanceof Error ? error.message : String(error) },
      }));
    }

    // The spec package is requested by path and installed before the
    // config names its playbook (playbook-library-69, environments-15).
    await this.environments.requestAndInstall(targetKey, name, { path: packagePath });

    // Lanes the bindings name but the roster lacks are created first,
    // so the binding never dangles (DR-032, playbook-library-3).
    for (const op of playerOps) {
      const minted = await editConfigFile(this.configPath, op, this.options.loadModule, { modules: this.modules(null) });
      if (!minted.ok) {
        throw new CoreError("invalid_config", i18n._({
          id: "compiled, but creating session player \"{playerId}\" was refused: {error}",
          comment: "Refusal after a successful compile; `error` is the config validation's own words",
          values: { playerId: (op as { playerId: string }).playerId, error: minted.error },
        }));
      }
    }
    const edit = targetKey === own
      ? await editConfigFile(this.configPath, entryOp, this.options.loadModule, { modules: this.modules(null) })
      : await editProjectConfigFile(target.configPath, this.configPath, entryOp, this.options.loadModule, this.modules(targetKey));
    if (!edit.ok) {
      throw new CoreError("invalid_config", i18n._({
        id: "compiled, but registration was refused: {error}",
        comment:
          "Refusal after a successful compile; `error` is the config validation's own words",
        values: { error: edit.error },
      }));
    }
    await this.reloadConfig();
    this.authors.republish();
    return this.configState;
  }

  /** An authoring session of the named project, or `not_found`; with
   * an instance, the one the session holds, else `not_found` naming the
   * id as another session's (core-service-96). */
  private requireDraft(projectId: string, draftId: string, instance?: string): void {
    this.authors.admit(draftId, { projectId, ...(instance !== undefined ? { instance } : {}) });
  }

  /**
   * Clones moved under `workspace/` — your own group renamed at sign-in
   * (space-59), a rename or transfer followed (space-60) — the store
   * already re-keyed: your own group's config is read where it now lies,
   * every moved clone's sessions are watched there, and each moved
   * session and ledger is announced under its new key.
   */
  private async repositoriesMoved(moves: { from: string; to: string }[]): Promise<void> {
    // A kept authoring session follows its clone (storage-12).
    this.drafts.moved(moves);
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
    // A moved authoring session is the same instance at a new address:
    // its state is announced under its new project (core-service-96).
    this.authors.republish();
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

  /** A project was added, paired or removed: the Groups surface re-reads
   * on its announcement (space-2). */
  private announceGroups(): void {
    this.space.publish().catch((error: unknown) => {
      console.error(`spex: groups state failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** A clone came or went: watch its sessions and re-read its
   * authoring sessions. */
  private afterRepositoriesChanged(): void {
    this.drafts.refresh();
    if (this.options.watchConfig !== false) this.watchRepositories();
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
    const next = ledger.intents.find((entry) =>
      entry.intent.projectId === session.projectId && entry.state === "queued"
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
    const session = this.store.describeSession(sessionId);
    if (!session || session.projectId !== intent.projectId) {
      throw new CoreError("invalid_request", i18n._({
        id: "the intent belongs to another project",
        comment: "Refusal: the work named is not this session's project's",
      }));
    }
    if (this.deriveIntentState(intent.id) !== "queued") {
      throw new CoreError("conflict", i18n._({
        id: "the intent is already dispatched",
        comment: "Refusal: this work was already sent to a turn",
      }));
    }
  }

  /** Continue either host's checkpoint through the shared lifecycle. */
  private async continueSession(sessionId: string): Promise<void> {
    const session = this.store.describeSession(sessionId);
    if (!session) throw noSession(sessionId);
    if (!session.continuable) {
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
        id: "this session ran in {cwd}; continue it on the device whose folder it ran in",
        comment: "Refusal: the session's recorded working directory is not the project's working folder on this device",
        values: { cwd: cwd ?? "" },
      }));
    }
    await this.sessions.continueSession(project, await this.composedFor(project.id), session);
  }

  /** The intent named must exist and still be open (DR-035). */
  private requireOpenIntent(intentId: string) {
    const intent = this.store.getIntent(intentId);
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
