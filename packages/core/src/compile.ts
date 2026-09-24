// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Playbook compilation via the external slc toolchain (DR-005,
// DR-081): run the app-supplied compiler on the app's own runtime —
// Electron's Node in the desktop, the server's Node — or a Node
// meeting slc's floor, in a managed library directory, then package
// the TypeScript artifacts with esbuild (type stripping + dependency
// inlining) so the registry loads in any Node and derive the
// registry's state ids by FSM introspection.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

/** The node_modules directories up-tree from a module, nearest first:
 * where a shell finds the compiler it declares (playbook-library-11). */
export function moduleDirectoriesAbove(fromUrl: string): string[] {
  const paths: string[] = [];
  let current = dirname(fileURLToPath(fromUrl));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, "node_modules");
    if (existsSync(candidate)) paths.push(candidate);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return paths;
}

/** node_modules dirs up-tree from this package, so bundling artifacts
 * in the external library dir still resolves xstate and friends. */
function bundleNodePaths(): string[] {
  return moduleDirectoriesAbove(import.meta.url);
}

import { RUNTIME_ABI } from "@sublang/playbook/xstate-runtime";

import { ARTIFACT_SCHEMAS, freshFileUrl, isValidRegistryEntry, REGISTRY_CONTRACT } from "./config.js";
import { i18n } from "./i18n.js";

export const MIN_NODE_MAJOR = 23;
export const MIN_NODE_MINOR = 6;

export interface ToolchainStatus {
  node: {
    ok: boolean;
    version?: string;
    command: string;
    /** Variables the command needs beside the caller's environment. */
    env?: Record<string, string>;
    guidance?: string;
  };
  slc: {
    ok: boolean;
    command: string[];
    /** Variables the command needs beside the caller's environment. */
    env?: Record<string, string>;
    guidance?: string;
  };
}

/** Where a compile runs (playbook-library-11): the executable running
 * this process, whether it is Electron's — run as Node through
 * ELECTRON_RUN_AS_NODE — and the node_modules directories searched
 * for the app-supplied compiler. */
export interface ToolchainRuntime {
  execPath: string;
  electron: boolean;
  modulePaths?: string[];
}

const ownRuntime = (): ToolchainRuntime => ({
  execPath: process.execPath,
  electron: Boolean(process.versions.electron),
});

/** The app-supplied compiler: `@sublang/slc` in the first node_modules
 * directory of the given ones that holds it, with its bin (DR-081). */
export function suppliedCompiler(
  modulePaths: string[] = bundleNodePaths(),
): { packageDir: string; cli: string } | undefined {
  for (const dir of modulePaths) {
    const packageDir = join(dir, "@sublang", "slc");
    const manifest = join(packageDir, "package.json");
    if (!existsSync(manifest)) continue;
    const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as {
      bin?: string | { slc?: string };
    };
    const relative = typeof bin === "string" ? bin : bin?.slc;
    const cli = relative ? join(packageDir, relative) : undefined;
    if (cli && existsSync(cli)) return { packageDir, cli };
  }
  return undefined;
}

/** What a playbook engine declares it runs (Playbook DR-022). */
interface EngineDeclaration {
  runtimeAbi: number;
  artifactSchemas: readonly number[];
}

const appEngine: EngineDeclaration = {
  runtimeAbi: RUNTIME_ABI,
  artifactSchemas: ARTIFACT_SCHEMAS,
};

/** The engine module the app itself runs artifacts on. */
const appEnginePath = createRequire(import.meta.url).resolve("@sublang/playbook/xstate-runtime");

/** The engine the supplied compiler links artifacts against: the
 * `@sublang/playbook` Node resolves from the compiler's own package —
 * the app's when npm shares one copy — read as the compiler reads it. */
async function compilerEngine(packageDir: string): Promise<EngineDeclaration | "unreadable"> {
  let enginePath: string;
  try {
    enginePath = createRequire(join(packageDir, "package.json")).resolve(
      "@sublang/playbook/xstate-runtime",
    );
  } catch {
    return "unreadable";
  }
  if (enginePath === appEnginePath) return appEngine;
  try {
    const engine = (await import(pathToFileURL(enginePath).href)) as {
      RUNTIME_ABI?: unknown;
      SUPPORTED_ARTIFACT_SCHEMAS?: unknown;
    };
    if (
      typeof engine.RUNTIME_ABI !== "number" ||
      !Array.isArray(engine.SUPPORTED_ARTIFACT_SCHEMAS)
    ) {
      return "unreadable";
    }
    return {
      runtimeAbi: engine.RUNTIME_ABI,
      artifactSchemas: engine.SUPPORTED_ARTIFACT_SCHEMAS as number[],
    };
  } catch {
    return "unreadable";
  }
}

/** The app runs what the compiler emits: one runtime ABI, and every
 * artifact schema the compiler's engine supports among the app's. */
function enginesAgree(compiler: EngineDeclaration, app: EngineDeclaration): boolean {
  return (
    compiler.runtimeAbi === app.runtimeAbi &&
    compiler.artifactSchemas.every((schema) => app.artifactSchemas.includes(schema))
  );
}

const describeEngine = (engine: EngineDeclaration | "unreadable"): string =>
  engine === "unreadable"
    ? "unreadable"
    : `ABI ${engine.runtimeAbi}, schemas ${engine.artifactSchemas.join("/")}`;

/** The module run before the compiler on Electron as Node, dropping
 * the variable that would otherwise reach every agent it spawns. */
const ELECTRON_PRELOAD = new URL("./compile-preload.js", import.meta.url).href;

/** slc's ids for the adapters it drives; an adapter absent here leaves
 * slc's own configuration to choose (playbook-library-42). */
const SLC_AGENT_IDS: Readonly<Record<string, string>> = {
  claude: "claude-code",
  codex: "codex",
  gemini: "gemini",
  opencode: "opencode",
};

/** The block a compile's agent is resolved from. */
export interface CompilerAgent {
  adapter: string;
  model?: string;
  effort?: string;
  /** `false` is a literal request, not omission. */
  fastMode?: boolean;
}

/** The compile-relevant part of a resolved agent block. */
export function compilerAgentOf(agent: {
  adapter: string;
  model?: string;
  effort?: string;
  fastMode?: boolean;
}): CompilerAgent {
  return {
    adapter: agent.adapter,
    ...(agent.model ? { model: agent.model } : {}),
    ...(agent.effort ? { effort: agent.effort } : {}),
    ...(typeof agent.fastMode === "boolean" ? { fastMode: agent.fastMode } : {}),
  };
}

/** The variables slc reads its agent from. */
const SLC_AGENT_VARIABLES = ["SLC_AGENT", "SLC_MODEL", "SLC_EFFORT", "SLC_FAST_MODE"] as const;

/** The compile's agent handed to slc — SLC_AGENT, SLC_MODEL, SLC_EFFORT
 * and SLC_FAST_MODE from the block — unless the environment configures
 * slc itself with any of those variables (playbook-library-42). */
export function compilerAgentEnv(
  env: NodeJS.ProcessEnv,
  agent?: CompilerAgent,
): Record<string, string> {
  if (!agent || SLC_AGENT_VARIABLES.some((variable) => env[variable])) return {};
  const id = SLC_AGENT_IDS[agent.adapter];
  if (!id) return {};
  return {
    SLC_AGENT: id,
    ...(agent.model ? { SLC_MODEL: agent.model } : {}),
    ...(agent.effort ? { SLC_EFFORT: agent.effort } : {}),
    ...(typeof agent.fastMode === "boolean" ? { SLC_FAST_MODE: String(agent.fastMode) } : {}),
  };
}

export type LineSpawner = (
  command: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
  signal?: AbortSignal,
  env?: NodeJS.ProcessEnv,
) => Promise<number>;

export const defaultSpawner: LineSpawner = (command, args, cwd, onLine, signal, env) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      ...(signal ? { signal } : {}),
      ...(env ? { env } : {}),
    });
    let buffer = "";
    const feed = (chunk: unknown) => {
      // A canceled run goes quiet immediately: the kill-induced tail
      // (partial lines, SIGTERM noise) must not follow the ◇ line.
      if (signal?.aborted) return;
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (signal?.aborted) return;
      if (buffer.trim()) onLine(buffer);
      resolvePromise(code ?? 1);
    });
  });

function nodeSatisfies(version: string): boolean {
  const match = /v?(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
}

interface NodeCandidate {
  command: string;
  env?: Record<string, string>;
}

/** Resolve the toolchain (playbook-library-11): the configured Node,
 * else the app's own runtime when it meets slc's floor, else a PATH
 * `node` that does; the configured compiler, else the app-supplied one. */
export async function checkToolchain(
  env: NodeJS.ProcessEnv = process.env,
  spawner: LineSpawner = defaultSpawner,
  runtime: ToolchainRuntime = ownRuntime(),
): Promise<ToolchainStatus> {
  const candidates: NodeCandidate[] = env.SPEX_NODE
    ? [{ command: env.SPEX_NODE }]
    : [
        runtime.electron
          ? { command: runtime.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } }
          : { command: runtime.execPath },
        { command: "node" },
      ];
  let node: ToolchainStatus["node"] | undefined;
  let seen: string | undefined;
  for (const candidate of candidates) {
    let version = "";
    try {
      await spawner(
        candidate.command,
        ["--version"],
        ".",
        (line) => {
          version = line.trim();
        },
        undefined,
        candidate.env ? { ...env, ...candidate.env } : undefined,
      );
    } catch {
      continue;
    }
    if (nodeSatisfies(version)) {
      node = {
        ok: true,
        version,
        command: candidate.command,
        ...(candidate.env ? { env: candidate.env } : {}),
      };
      break;
    }
    seen ??= version || undefined;
  }
  node ??= {
    ok: false,
    command: candidates[0].command,
    ...(seen ? { version: seen } : {}),
    // Two messages, one per case: the version found is a value, and
    // "none" is the core's own word for finding none.
    guidance: seen
      ? i18n._({
          id: "Compiling playbooks needs Node >= {major}.{minor} on your system (found {found}). Install it from nodejs.org or set SPEX_NODE.",
          values: { major: MIN_NODE_MAJOR, minor: MIN_NODE_MINOR, found: seen },
          comment:
            "The toolchain's guidance; `nodejs.org` is a site and `SPEX_NODE` an environment variable, both as they are",
        })
      : i18n._({
          id: "Compiling playbooks needs Node >= {major}.{minor} on your system (found none). Install it from nodejs.org or set SPEX_NODE.",
          values: { major: MIN_NODE_MAJOR, minor: MIN_NODE_MINOR },
          comment:
            "The toolchain's guidance when no Node answered at all; `nodejs.org` is a site and `SPEX_NODE` an environment variable",
        }),
  };

  let slc: ToolchainStatus["slc"];
  const configured = env.SPEX_SLC?.split(" ").filter(Boolean);
  if (configured && configured.length > 0) {
    slc = { ok: true, command: configured };
  } else {
    const supplied = suppliedCompiler(runtime.modulePaths);
    const engine = supplied ? await compilerEngine(supplied.packageDir) : undefined;
    if (!supplied) {
      slc = {
        ok: false,
        command: [],
        guidance: i18n._({
          id: "The app's own copy of @sublang/slc is missing; run npm ci in the Spex checkout to restore it.",
          comment:
            "The toolchain's guidance when the compiler the app ships is not installed; `@sublang/slc` is a package name and `npm ci` a command, both as they are",
        }),
      };
    } else if (engine === "unreadable" || !enginesAgree(engine!, appEngine)) {
      slc = {
        ok: false,
        command: [],
        guidance: i18n._({
          id: "The app's compiler targets playbook engine {compiler} while the app runs {app}; update @sublang/slc and @sublang/playbook together.",
          values: { compiler: describeEngine(engine!), app: describeEngine(appEngine) },
          comment:
            "The toolchain's guidance when the shipped compiler and the app disagree on the playbook engine; the values read like `ABI 1, schemas 3` or `unreadable`; `@sublang/slc` and `@sublang/playbook` are package names, as they are",
        }),
      };
    } else if (!node.ok) {
      slc = {
        ok: false,
        command: [],
        guidance: i18n._({
          id: "Install Node >= 23.6 first; slc runs on it.",
          comment: "The toolchain's guidance when Node itself is missing; `slc` is the compiler's command",
        }),
      };
    } else {
      // On Electron as Node the preload drops the variable that made
      // the process a Node before the compiler and its agents run;
      // the variable travels with this command alone, never with a
      // compiler SPEX_SLC names.
      slc = node.env?.ELECTRON_RUN_AS_NODE
        ? {
            ok: true,
            command: [node.command, "--import", ELECTRON_PRELOAD, supplied.cli],
            env: node.env,
          }
        : { ok: true, command: [node.command, supplied.cli] };
    }
  }
  return { node, slc };
}

export interface CompileOptions {
  playbookId: string;
  /** Prose/skill source: inline text or a file to copy. */
  source: { text?: string; path?: string };
  /** Roles the user expected (informational since DR-014: the
   * compiled entry's derived role ids are authoritative). */
  roles: string[];
  command: string;
  intent: string;
  libraryDir: string;
  /** Primary config path; supplied by the app to return a portable locator. */
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  spawner?: LineSpawner;
  onProgress?: (line: string) => void;
  /** Skip the slc run when artifacts already exist (re-package). */
  skipSlc?: boolean;
  /** The block the compile's agent is resolved from (playbook-library-42). */
  agent?: CompilerAgent;
  /** Where the compile runs; this process's own runtime by default. */
  runtime?: ToolchainRuntime;
  /** Cancels the run: the slc child is killed and the pipeline
   * rejects with an abort error at the next stage boundary. */
  signal?: AbortSignal;
}

export interface CompileResult {
  /** Absolute path of the bundled registry module (config `from`). */
  from: string;
  /** Derived role ids (lowercased) from the slc-emitted entry. */
  roles: string[];
  idleStateId: string;
  finalStateId: string;
  parkStateIds: string[];
}

interface MachineLike {
  config?: { initial?: unknown; states?: Record<string, { type?: string }> };
}

// --- Machine graph (playbook-library-36, DR-028) ---------------------------

export interface MachineGraphNode {
  id: string;
  parent?: string;
  kind: "state" | "final";
  /** The player role the state invokes, as the machine names it. */
  role?: string;
  /** The state's own description, for human tooltips (DR-010 §2). */
  description?: string;
  tags: string[];
}

export interface MachineGraphEdge {
  /** Stable identity: owner state, event, branch index, target index
   * — guarded sibling branches stay distinct (DR-028). */
  id: string;
  from: string;
  to: string;
  /** Event name; "" names the always transition. */
  event: string;
}

export interface MachineGraph {
  initial: string;
  nodes: MachineGraphNode[];
  edges: MachineGraphEdge[];
}

interface StateConfigLike {
  type?: string;
  id?: unknown;
  initial?: unknown;
  tags?: string | string[];
  meta?: { playbook?: { role?: unknown; player?: unknown; description?: unknown } };
  description?: unknown;
  on?: Record<string, unknown>;
  always?: unknown;
  onDone?: unknown;
  invoke?: unknown;
  states?: Record<string, StateConfigLike>;
}

/** Strip XState target syntax down to a path from the machine root.
 * A `#` target names a declared state id — resolved against the ids
 * the machine actually declares, never assumed to be prefixed with
 * the machine's own id (playbook-library-36). */
function normalizeTarget(
  target: string,
  ownerPath: string[],
  declaredIds: ReadonlyMap<string, string>,
): string | null {
  if (target.startsWith("#")) {
    const address = target.slice(1);
    const direct = declaredIds.get(address);
    if (direct !== undefined) return direct;
    // `#<id>.<child>`: the head names a declared state, the tail
    // descends into it.
    const cut = address.indexOf(".");
    if (cut > 0) {
      const head = declaredIds.get(address.slice(0, cut));
      if (head !== undefined) return `${head}.${address.slice(cut + 1)}`;
      // Legacy form: the head is the machine's own id, and the tail is
      // already a root-relative path.
      return address.slice(cut + 1) || null;
    }
    return null;
  }
  if (target.startsWith(".")) {
    return [...ownerPath, target.slice(1)].join(".");
  }
  // A bare target names a sibling: resolve within the owner's parent.
  return [...ownerPath.slice(0, -1), target].join(".");
}

/** Every state id the machine declares, mapped to its root-relative
 * path. XState gives each state an implicit id of its path, and an
 * explicit `id:` overrides it — both address the same state. */
function collectDeclaredIds(
  states: Record<string, StateConfigLike>,
  parentPath: string[],
  into: Map<string, string>,
): void {
  for (const [name, state] of Object.entries(states)) {
    const path = [...parentPath, name];
    const id = path.join(".");
    if (typeof state.id === "string" && state.id) into.set(state.id, id);
    if (state.states) collectDeclaredIds(state.states, path, into);
  }
}

function transitionBranches(value: unknown): { target?: unknown }[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((branch) =>
    typeof branch === "string" ? { target: branch } : (branch as { target?: unknown }),
  );
}

/** Derive the drawable graph from an imported machine's config — the
 * config is data, so no XState import is needed (DR-028). */
export function extractMachineGraph(machine: MachineLike): MachineGraph | null {
  const config = machine.config as
    | {
        initial?: unknown;
        states?: Record<string, StateConfigLike>;
        on?: Record<string, unknown>;
      }
    | undefined;
  const rootStates = config?.states;
  const initial = typeof config?.initial === "string" ? config.initial : null;
  if (!rootStates || !initial) return null;

  // Targets are resolved against the ids the machine declares, so the
  // id table is built before any edge is read.
  const declaredIds = new Map<string, string>();
  collectDeclaredIds(rootStates, [], declaredIds);

  const nodes: MachineGraphNode[] = [];
  const edges: MachineGraphEdge[] = [];

  const addEdges = (
    ownerPath: string[],
    event: string,
    value: unknown,
  ): void => {
    const owner = ownerPath.join(".");
    const branches = transitionBranches(value);
    branches.forEach((branch, branchIndex) => {
      const targets =
        branch.target === undefined
          ? []
          : Array.isArray(branch.target)
            ? branch.target
            : [branch.target];
      targets.forEach((target, targetIndex) => {
        if (typeof target !== "string") return;
        const to = normalizeTarget(target, ownerPath, declaredIds);
        if (!to) return;
        edges.push({
          id: `${owner}::${event}::${branchIndex}::${targetIndex}`,
          from: owner,
          to,
          event,
        });
      });
    });
  };

  const walk = (
    states: Record<string, StateConfigLike>,
    parentPath: string[],
  ): void => {
    for (const [name, state] of Object.entries(states)) {
      const path = [...parentPath, name];
      const id = path.join(".");
      // Published playbook-7 machines name the invoked player as
      // meta.playbook.player; newer compiles say role. Accept both.
      const meta = state.meta?.playbook;
      const role = meta?.role ?? meta?.player;
      const description = meta?.description ?? state.description;
      nodes.push({
        id,
        ...(parentPath.length > 0 ? { parent: parentPath.join(".") } : {}),
        kind: state.type === "final" ? "final" : "state",
        ...(typeof role === "string" && role ? { role } : {}),
        ...(typeof description === "string" && description
          ? { description }
          : {}),
        tags:
          typeof state.tags === "string"
            ? [state.tags]
            : Array.isArray(state.tags)
              ? state.tags.filter((t): t is string => typeof t === "string")
              : [],
      });
      for (const [event, value] of Object.entries(state.on ?? {})) {
        addEdges(path, event, value);
      }
      if (state.always !== undefined) addEdges(path, "", state.always);
      // A compound or parallel state's own done transition: the join
      // out of its regions, a real state-to-state edge.
      if (state.onDone !== undefined) addEdges(path, "done", state.onDone);
      const invoke = state.invoke;
      const invokes = Array.isArray(invoke) ? invoke : invoke ? [invoke] : [];
      for (const entry of invokes) {
        const shaped = entry as { onDone?: unknown; onError?: unknown };
        if (shaped.onDone !== undefined) addEdges(path, "done", shaped.onDone);
        if (shaped.onError !== undefined) addEdges(path, "error", shaped.onError);
      }
      if (state.states) walk(state.states, path);
    }
  };
  walk(rootStates as Record<string, StateConfigLike>, []);

  // Edges whose target names no known node are dropped rather than
  // drawn dangling.
  const known = new Set(nodes.map((node) => node.id));
  return {
    initial,
    nodes,
    edges: edges.filter((edge) => known.has(edge.from) && known.has(edge.to)),
  };
}

/** Bundle an FSM module and serve its state ids and drawable graph,
 * or nulls on failure (playbook-library-36). */
export async function loadFsmInfo(fsmPath: string): Promise<{
  stateIds: string[] | null;
  machine: MachineGraph | null;
}> {
  try {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const outfile = join(mkdtempSync(join(tmpdir(), "spex-fsm-")), "fsm.mjs");
    await build({
      entryPoints: [fsmPath],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      nodePaths: bundleNodePaths(),
    });
    const machine = await importMachine(outfile);
    return {
      stateIds: Object.keys(machine.config?.states ?? {}),
      machine: extractMachineGraph(machine),
    };
  } catch {
    return { stateIds: null, machine: null };
  }
}

/** Bundle an FSM module and list every state id, or null on failure. */
export async function listFsmStates(
  fsmPath: string,
): Promise<string[] | null> {
  return (await loadFsmInfo(fsmPath)).stateIds;
}

export function deriveStateIds(machine: MachineLike): {
  idleStateId: string;
  finalStateId: string;
  parkStateIds: string[];
} {
  const config = machine.config;
  const states = config?.states ?? {};
  const initial = typeof config?.initial === "string" ? config.initial : undefined;
  if (!initial) throw new Error("FSM has no initial state");
  const finals = Object.entries(states)
    .filter(([, state]) => state?.type === "final")
    .map(([name]) => name);
  if (finals.length === 0) throw new Error("FSM has no final state");
  const finalStateId = finals.includes("done") ? "done" : finals[0];
  const parkStateIds = ["failed", "awaitBossReply"].filter(
    (name) => name in states && name !== finalStateId,
  );
  return { idleStateId: initial, finalStateId, parkStateIds };
}

async function importMachine(bundlePath: string): Promise<MachineLike> {
  const moduleValue = (await import(pathToFileURL(bundlePath).href)) as Record<
    string,
    unknown
  >;
  for (const value of Object.values(moduleValue)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "config" in value &&
      typeof (value as MachineLike).config === "object"
    ) {
      return value as MachineLike;
    }
  }
  throw new Error("no XState machine export found in the compiled FSM");
}

function wrapperSource(options: CompileOptions, entryModulePath: string): string {
  return `// Generated by Spex (DR-014, DR-032): a thin wrapper over the
// slc-emitted registry entry, supplying the command and intent the
// config names. Under artifact schema 2 a role id is a playbook-local
// slot that binds to a session player, not a host player id, so the
// entry's role ids pass through exactly as the gears declared them —
// the lowercasing and re-casing shim of the v7 host boundary is gone.
import entry from ${JSON.stringify(`./${options.playbookId}.ts`)};

export const spexRegistryContract = ${REGISTRY_CONTRACT};

export default {
  ...entry,
  command: ${JSON.stringify(options.command)},
  intent: ${JSON.stringify(options.intent)},
};
`;
}

export async function compilePlaybook(
  options: CompileOptions,
): Promise<CompileResult> {
  const progress = options.onProgress ?? (() => {});
  const spawner = options.spawner ?? defaultSpawner;
  const env = options.env ?? process.env;
  const signal = options.signal;
  const id = options.playbookId;
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    throw new Error(
      `playbook id "${id}" must match ^[a-z][a-z0-9_-]*$ (it becomes player id prefixes)`,
    );
  }

  const dir = resolve(options.libraryDir, id);
  mkdirSync(dir, { recursive: true });
  const sourcePath = join(dir, `${id}.md`);
  if (options.source.text !== undefined) {
    writeFileSync(sourcePath, options.source.text);
  } else if (options.source.path) {
    copyFileSync(options.source.path, sourcePath);
  } else if (!existsSync(sourcePath)) {
    throw new Error("compile needs a source text or file");
  }

  const artifactDir = join(dir, `${id}.playbook`);
  const fsmPath = join(artifactDir, `${id}.fsm.ts`);
  const playbookPath = join(artifactDir, `${id}.playbook.ts`);
  // slc emits the registry-entry module beside the artifact dir when
  // no -o is given (DR-014); the compile runs with cwd = dir.
  const entryModulePath = join(dir, `${id}.ts`);

  if (!options.skipSlc) {
    const toolchain = await checkToolchain(env, spawner, options.runtime);
    if (!toolchain.node.ok) throw new Error(toolchain.node.guidance);
    if (!toolchain.slc.ok) throw new Error(toolchain.slc.guidance);
    const [slcCommand, ...slcArgs] = toolchain.slc.command;
    // The compile's agent (playbook-library-42): the block's, unless the
    // environment configures slc; an adapter slc cannot drive is refused
    // here rather than left to slc's seeded default.
    const configured = SLC_AGENT_VARIABLES.some((variable) => env[variable]);
    const agentEnv = compilerAgentEnv(env, options.agent);
    if (options.agent && !configured && !SLC_AGENT_IDS[options.agent.adapter]) {
      throw new Error(
        i18n._({
          id: "The compile's agent runs on {adapter}, which the compiler cannot drive; choose an agent on claude, codex, gemini or opencode, or set SLC_AGENT.",
          values: { adapter: options.agent.adapter },
          comment:
            "Refusal before the compiler runs: the block's adapter has no slc id; the adapter names and `SLC_AGENT` stay as they are",
        }),
      );
    }
    // The pipeline's own progress lines — `running:`, `packaging:`,
    // `introspected states:`, `derived roles:`, `compile complete` —
    // are wire texts the compile band matches to name its phases, read
    // its roles and know the run finished; they stay as they are, and
    // the page phrases what it shows (localization-4, DR-079).
    if (configured) {
      progress(`agent: ${env.SLC_AGENT ?? "slc's configuration"} from the environment`);
    } else if (agentEnv.SLC_AGENT) {
      progress(`agent: ${agentEnv.SLC_AGENT} from the block`);
    }
    progress(`running: ${toolchain.slc.command.join(" ")} playbook ${id}.md`);
    // Bare invocation (DR-019): slc >= 0.2 links against the installed
    // @sublang/playbook runtime contract by default.
    // slc aborts an agent call after its ten-minute default silence; the
    // agent-driven phases routinely stay quieter, so the runner grants the
    // 2400s budget IR-053 settled on, unless the env already sets it (DR-005).
    const code = await spawner(
      slcCommand,
      [...slcArgs, "playbook", sourcePath],
      dir,
      progress,
      signal,
      {
        ...env,
        ...toolchain.slc.env,
        ...agentEnv,
        SLC_STALL_TIMEOUT: env.SLC_STALL_TIMEOUT ?? "2400",
      },
    );
    signal?.throwIfAborted();
    if (code !== 0) {
      throw new Error(`slc playbook failed with exit code ${code}`);
    }
  }
  signal?.throwIfAborted();

  if (!existsSync(fsmPath) || !existsSync(playbookPath)) {
    throw new Error(
      `expected artifacts missing: ${fsmPath} / ${playbookPath} — the slc run did not produce the <id>.playbook/ layout`,
    );
  }
  if (!existsSync(entryModulePath)) {
    throw new Error(
      `expected registry entry missing: ${entryModulePath} — slc >= 0.1.0 emits it beside the artifact directory; recompile with the released toolchain`,
    );
  }

  progress("packaging: bundling the FSM for introspection");
  const fsmBundle = join(dir, `${id}.fsm.bundle.mjs`);
  await build({
    entryPoints: [fsmPath],
    outfile: fsmBundle,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    nodePaths: bundleNodePaths(),
  });
  const ids = deriveStateIds(await importMachine(fsmBundle));
  progress(
    `introspected states: idle=${ids.idleStateId} final=${ids.finalStateId} park=[${ids.parkStateIds.join(", ")}]`,
  );

  signal?.throwIfAborted();
  progress("packaging: wrapping and bundling the slc registry entry");
  const registryTs = join(dir, `${id}.registry.ts`);
  writeFileSync(registryTs, wrapperSource(options, entryModulePath));
  const registryBundle = join(dir, `${id}.registry.mjs`);
  await build({
    entryPoints: [registryTs],
    outfile: registryBundle,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    nodePaths: bundleNodePaths(),
  });

  // Fail-closed validation before anything touches the config
  // (PBLIB-14): the bundle must satisfy the captain shell's checks.
  // The import is keyed by the file's change so a re-packaged bundle
  // — a draft registered with its confirmed command and intent — is
  // checked fresh, never served from the module cache.
  const moduleValue = (await import(freshFileUrl(registryBundle))) as {
    default?: unknown;
    spexRegistryContract?: unknown;
  };
  const entry = moduleValue.default;
  if (!isValidRegistryEntry(entry)) {
    throw new Error("generated registry failed structural validation");
  }
  if (entry.id !== id) {
    throw new Error(
      `generated registry id mismatch: slc derived "${entry.id}" from the source, expected "${id}"`,
    );
  }
  if (moduleValue.spexRegistryContract !== REGISTRY_CONTRACT) {
    throw new Error("generated registry is missing the contract marker");
  }
  entry.validateOptions(undefined);
  const roles = [...entry.requiredRoleIds];
  if (roles.length === 0) {
    // Entries compiled before slc 0.2 can carry no roles when the
    // gears rendered Players as a heading (fixed upstream).
    throw new Error(
      "the compiled entry declares no player roles; recompile with slc >= 0.2 (its gears Players parsing fix)",
    );
  }
  const seen = new Set<string>();
  for (const role of roles) {
    // A role is a config key a user binds to a player, so it must be
    // writable and distinct; it is no longer a host player id and
    // carries no case folding (DR-032).
    if (seen.has(role)) {
      throw new Error(`derived role ids collide: "${role}" appears twice`);
    }
    seen.add(role);
  }
  progress(`derived roles: ${roles.join(", ")}`);

  signal?.throwIfAborted();
  progress("compile complete");
  const locator = options.configPath ? relative(dirname(options.configPath), registryBundle).split("\\").join("/") : registryBundle;
  const from = options.configPath && !locator.startsWith(".") ? `./${locator}` : locator;
  return { from, roles, ...ids };
}

/** Rebuild bundles from retained compiler outputs without invoking an agent. */
export async function rebuildManagedRegistry(libraryDir: string, id: string): Promise<void> {
  const directory = resolve(libraryDir, id);
  if (existsSync(join(directory, `${id}.registry.mjs`))) return;
  const source = join(directory, `${id}.md`); const entry = join(directory, `${id}.ts`);
  const wrapper = join(directory, `${id}.registry.ts`);
  if (!existsSync(source) || !existsSync(entry) || !existsSync(wrapper)) throw new Error(`playbook ${id} is unavailable: retained source or compiler output is missing; compile it in Playbooks`);
  const temporary = mkdtempSync(join(tmpdir(), "spex-library-rebuild-"));
  try {
    const bundled = join(temporary, "entry.mjs");
    await build({ entryPoints: [wrapper], outfile: bundled, bundle: true, format: "esm", platform: "node", logLevel: "silent", nodePaths: bundleNodePaths() });
    const module = await import(pathToFileURL(bundled).href);
    if (!isValidRegistryEntry(module.default) || module.default.id !== id) throw new Error(`retained registry ${id} is invalid`);
    await compilePlaybook({ playbookId: id, source: {}, roles: [...module.default.requiredRoleIds], command: module.default.command, intent: module.default.intent, libraryDir, skipSlc: true });
  } catch (error) {
    throw new Error(`playbook ${id} is unavailable: rebuilding failed: ${(error as Error).message}`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
