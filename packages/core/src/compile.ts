// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Playbook compilation via the external slc toolchain (DR-005,
// DR-081): run the app-supplied compiler on the app's own runtime —
// Electron's Node in the desktop, the server's Node — or a Node
// meeting slc's floor, in a managed library directory, then package
// the TypeScript artifacts with esbuild — types stripped, the artifact
// inlined, the engine imported from the app through the folder's
// engine links, never carried (playbook-library-14) — and derive the
// registry's state ids by FSM introspection.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
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
import { ENGINE_LINKS_EXCLUDE, type InstallEngine } from "@sublang/spex/environment";
import { readVersioned, VersionConflictError, writeVersionedBytes } from "@sublang/spex/files";
import { i18n } from "./i18n.js";

/** The packages a compile resolves from the playbook's own directory:
 * the engine the compiler links against and the machine library the
 * generated `.fsm.ts` imports — which slc's strict type check reads
 * from there, and which the emitted entry imports at run time. */
export const ENGINE_LINKS = ["xstate", "@sublang/playbook"] as const;

/**
 * Provision `<dir>/node_modules/` with links to the app's own copies of
 * the engine packages (playbook-library-12, DR-081): the library
 * directory lies outside any dependency tree, so without them slc's
 * gears2fsm check finds no `xstate` types and fails the machine, and
 * the entry it emits would resolve nothing. Idempotent: a link that
 * already points at the copy stays, a stale link is replaced, and a
 * real directory a user placed there is left alone. Playbook's host
 * provisions the same links for a run.
 */
export function provisionEngineLinks(dir: string, modulePaths: string[] = bundleNodePaths()): string[] {
  const provisioned: string[] = [];
  // A folder gone meanwhile — its clone moved by a sync — takes no
  // link, and nothing of it is made again (playbook-library-46).
  if (!existsSync(dir)) return provisioned;
  for (const name of ENGINE_LINKS) {
    const target = modulePaths.map((root) => join(root, name)).find((candidate) => existsSync(join(candidate, "package.json")));
    if (!target) continue;
    const link = join(dir, "node_modules", name);
    mkdirSync(dirname(link), { recursive: true });
    let stat;
    try { stat = lstatSync(link); } catch { stat = undefined; }
    if (stat?.isSymbolicLink()) {
      if (readlinkSync(link) === target) { provisioned.push(link); continue; }
      rmSync(link);
    } else if (stat) {
      continue;
    }
    symlinkSync(target, link, "dir");
    provisioned.push(link);
  }
  return provisioned;
}

/** Where a working folder's Git is told to ignore every playbook
 * artifact folder's engine links (playbook-library-12), the library's
 * one pattern. */
export { ENGINE_LINKS_EXCLUDE };

/** The engine a registry module imports rather than carries
 * (playbook-library-14): each engine package and its subpaths. */
const ENGINE_EXTERNALS = ENGINE_LINKS.flatMap((name) => [name, `${name}/*`]);

/** Whether a registry module imports the engine — a specifier naming
 * `@sublang/playbook` or one of its subpaths — rather than carrying it
 * inside, as one bundled before the engine was imported does
 * (playbook-library-46). */
export function importsEngine(text: string): boolean {
  return /(?:\bfrom\s*|\bimport\s*\(?\s*)["']@sublang\/playbook(?:\/[^"'\s]+)?["']/.test(text);
}

/**
 * Bundle a registry wrapper into its module's bytes (playbook-library-14):
 * the wrapper, the slc entry and the artifact it links inlined with
 * their types stripped, the engine left as imports the module resolves
 * at load through its folder's engine links. Paths the output names are
 * the folder's own, so the same sources bundle to the same bytes in any
 * folder.
 */
export async function bundleRegistryModule(registryTs: string, modulePaths: string[] = bundleNodePaths()): Promise<Buffer> {
  const folder = dirname(resolve(registryTs));
  const { outputFiles } = await build({
    entryPoints: [resolve(registryTs)],
    outfile: join(folder, `${basename(registryTs, ".ts")}.mjs`),
    absWorkingDir: folder,
    write: false,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    external: ENGINE_EXTERNALS,
    nodePaths: modulePaths,
  });
  const output = outputFiles?.[0];
  if (!output) throw new Error(`bundling ${basename(registryTs)} produced no module`);
  return Buffer.from(output.contents);
}

/**
 * Prepare an installed playbook artifact's folder to run on the app's
 * engine (playbook-library-46): its engine links provisioned, and a
 * registry module Spex bundled carrying its own engine bundled again
 * from the wrapper shipped beside it, replacing it atomically under the
 * bytes read — a hard link into the store keeps the store's copy. A
 * module changed meanwhile stands as it is. Returns why a module
 * carrying its engine was kept as it is, or null.
 */
export async function prepareArtifactEngine(folder: string, id: string, modulePaths?: string[]): Promise<string | null> {
  provisionEngineLinks(folder, modulePaths);
  const module = join(folder, `${id}.registry.mjs`);
  const read = readVersioned(module);
  if (read.bytes === null || importsEngine(read.bytes.toString("utf8"))) return null;
  const wrapper = `${id}.registry.ts`;
  if (!existsSync(join(folder, wrapper))) return `its ${wrapper} is missing`;
  let bytes: Buffer;
  try {
    bytes = await bundleRegistryModule(join(folder, wrapper), modulePaths ?? bundleNodePaths());
  } catch (error) {
    const failure = (error as { errors?: { text?: string }[] }).errors?.[0]?.text ?? (error as Error).message;
    return `bundling its ${wrapper} failed: ${failure}`;
  }
  if (bytes.equals(read.bytes)) return null;
  try {
    writeVersionedBytes(module, bytes, read.version, statSync(module).mode & 0o777);
  } catch (error) {
    // Changed or gone meanwhile: what stands there is not this write's.
    if (error instanceof VersionConflictError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return `replacing it failed: ${(error as Error).message}`;
  }
  return null;
}

/** The app's engine as an install prepares for it (playbook-library-46,
 * DR-165): each installed playbook artifact's folder prepared, and a
 * path source's folders given the engine links, which point into
 * `modulePaths` — the app's own node_modules where omitted. */
export function installEngine(modulePaths?: string[]): InstallEngine {
  return {
    prepare: (folder, id) => prepareArtifactEngine(folder, id, modulePaths),
    link: (folder) => { provisionEngineLinks(folder, modulePaths); },
  };
}

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

/** An empty slc configuration, shipped with the core: handed to slc
 * as `--config` when the block drives the compile, so slc discovers no
 * configuration file of its own (playbook-library-42). */
const SLC_EMPTY_CONFIG = fileURLToPath(new URL("../assets/slc/empty.config.yaml", import.meta.url));

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
    // A canceled run settles only once its child has exited, so the job
    // holds its folder until then (playbook-library-99); a spawn failure
    // rejects at once.
    let canceled: Error | undefined;
    child.on("error", (error) => {
      if (signal?.aborted && error.name === "AbortError") canceled = error;
      else rejectPromise(error);
    });
    child.on("close", (code) => {
      if (signal?.aborted) {
        rejectPromise(canceled ?? signal.reason);
        return;
      }
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
  /** Run once the job is admitted, before it writes anything; the agent
   * it returns is the compile's, read at that start (playbook-library-42). */
  start?: () => Promise<CompilerAgent | undefined>;
  /** Where the compile runs; this process's own runtime by default. */
  runtime?: ToolchainRuntime;
  /** Cancels the run: the slc child is killed and the pipeline
   * rejects with an abort error at the next stage boundary. */
  signal?: AbortSignal;
}

/** What a job writing a playbook artifact's folder does there. */
export type ArtifactWork = "compile" | "packaging";

/** The job writing each playbook artifact's folder in this core, keyed
 * by the folder's canonical path: one entry per admitted job, dropped by
 * that job alone when it ends, nothing written to hold it
 * (playbook-library-99, DR-111). */
const artifactJobs = new Map<string, { work: ArtifactWork }>();

/** The folder a compile of `id` in `libraryDir` writes. */
function artifactFolder(libraryDir: string, id: string): string {
  return resolve(libraryDir, id);
}

/** A folder's path with every link resolved — through its nearest
 * existing ancestor where it is not made yet — so two spellings of one
 * destination are one key. */
function canonicalFolder(folder: string): string {
  let existing = resolve(folder);
  const rest: string[] = [];
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  try {
    return join(realpathSync.native(existing), ...rest);
  } catch {
    return resolve(folder);
  }
}

/** A job asked for a folder another job of this core writes. */
export class ArtifactFolderBusy extends Error {
  constructor(readonly folder: string, readonly work: ArtifactWork) {
    super(work === "compile"
      ? i18n._({ id: "a compile is writing {folder}; retry once it ends", values: { folder },
          comment: "Refusal: another compile of this core writes the playbook's artifact folder" })
      : i18n._({ id: "Spex is packaging {folder}; retry once it ends", values: { folder },
          comment: "Refusal: an enabling of this core packages the playbook's artifact folder" }));
    this.name = "ArtifactFolderBusy";
  }
}

/** Run `job` as the one job writing `folder`: admitted, or refused by a
 * throw, at the call itself, before the job starts; the admission is
 * released when that job ends (playbook-library-99). */
function admitArtifactJob<T>(folder: string, work: ArtifactWork, job: () => Promise<T>): Promise<T> {
  const key = canonicalFolder(folder);
  const running = artifactJobs.get(key);
  if (running) throw new ArtifactFolderBusy(folder, running.work);
  const entry = { work };
  artifactJobs.set(key, entry);
  return (async () => {
    try {
      return await job();
    } finally {
      if (artifactJobs.get(key) === entry) artifactJobs.delete(key);
    }
  })();
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

/** A machine's state ids and drawable graph, nulls when it cannot load. */
export interface FsmInfo {
  stateIds: string[] | null;
  machine: MachineGraph | null;
}

/**
 * Machine loads kept per FSM path, keyed by a sha256 digest of the
 * entry file's content — not its mtime, which npm sets alike on every
 * file it extracts. Importing a bundle leaves its module in Node's ESM
 * cache for the life of the process, and loads recur on every
 * artifacts request and session open, so unchanged content is bundled
 * and imported once. The bytes digested are the bytes bundled, so a
 * file that changes between reading and bundling cannot leave one
 * content's result kept under the other's digest. The digest covers
 * the entry alone, which is exact while every other bundled input
 * lies in an installed package the core treats as fixed for its
 * lifetime: the built-in and slc-emitted machines import only
 * `xstate`. A load whose bundle read any other input (a relative
 * module) is not kept, so such a machine is bundled afresh each time.
 * Only a successful load is kept; a failed one is retried on the next
 * request. Callers share the result deep-frozen, so a caller that
 * would mutate it throws instead of changing it for every other.
 */
const fsmInfoMemo = new Map<string, { digest: string; info: Promise<FsmInfo> }>();

const NODE_MODULES_SEGMENT = /(^|[\\/])node_modules[\\/]/;

/** The metafile's name for the entry bundled from `stdin`. esbuild
 * keys it by `sourcefile` when one is given, which is also the key of
 * that file read from disk — so none is given, and a machine that
 * imports its own file still shows an input outside the digest. */
const STDIN_INPUT = "<stdin>";

const NO_FSM_INFO: FsmInfo = Object.freeze({ stateIds: null, machine: null });

/** Bundle an FSM module and serve its state ids and drawable graph,
 * or nulls on failure (playbook-library-36). */
export async function loadFsmInfo(fsmPath: string): Promise<FsmInfo> {
  let contents: Buffer;
  try {
    contents = readFileSync(fsmPath);
  } catch {
    return NO_FSM_INFO;
  }
  const digest = createHash("sha256").update(contents).digest("hex");
  const key = resolve(fsmPath);
  const kept = fsmInfoMemo.get(key);
  if (kept?.digest === digest) return kept.info;
  const forget = (): void => {
    if (fsmInfoMemo.get(key)?.info === info) fsmInfoMemo.delete(key);
  };
  const info: Promise<FsmInfo> = bundleFsmInfo(fsmPath, contents).then(
    ({ loaded, reproducible }) => {
      if (!reproducible) forget();
      return freezeFsmInfo(loaded);
    },
    () => {
      forget();
      return NO_FSM_INFO;
    },
  );
  fsmInfoMemo.set(key, { digest, info });
  return info;
}

/** Freeze a load's result through every array and object it holds. */
function freezeFsmInfo(info: FsmInfo): FsmInfo {
  if (info.stateIds) Object.freeze(info.stateIds);
  if (info.machine) {
    for (const node of info.machine.nodes) {
      Object.freeze(node.tags);
      Object.freeze(node);
    }
    for (const edge of info.machine.edges) Object.freeze(edge);
    Object.freeze(info.machine.nodes);
    Object.freeze(info.machine.edges);
    Object.freeze(info.machine);
  }
  return Object.freeze(info);
}

/** Bundle and import one machine from the entry's given bytes,
 * resolving its imports from the entry's directory, and remove the
 * bundle once imported (the module is evaluated by then);
 * `reproducible` says whether those bytes were the only input outside
 * installed packages. */
async function bundleFsmInfo(
  fsmPath: string,
  contents: Uint8Array,
): Promise<{ loaded: FsmInfo; reproducible: boolean }> {
  const bundleDir = mkdtempSync(join(tmpdir(), "spex-fsm-"));
  try {
    const outfile = join(bundleDir, "fsm.mjs");
    const { metafile } = await build({
      stdin: { contents, resolveDir: dirname(resolve(fsmPath)), loader: "ts" },
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      metafile: true,
      nodePaths: bundleNodePaths(),
    });
    const reproducible = Object.keys(metafile.inputs).every(
      (input) => input === STDIN_INPUT || NODE_MODULES_SEGMENT.test(input),
    );
    const machine = await importMachine(outfile);
    return {
      loaded: {
        stateIds: Object.keys(machine.config?.states ?? {}),
        machine: extractMachineGraph(machine),
      },
      reproducible,
    };
  } finally {
    rmSync(bundleDir, { recursive: true, force: true });
  }
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

/**
 * Compile, or with `skipSlc` repackage, a playbook in its artifact
 * folder as the one job of this core writing that folder: where another
 * writes it, the call throws {@link ArtifactFolderBusy} at once and
 * nothing runs (playbook-library-99).
 */
export function compilePlaybook(options: CompileOptions): Promise<CompileResult> {
  return admitArtifactJob(artifactFolder(options.libraryDir, options.playbookId), options.skipSlc ? "packaging" : "compile", () => compileAdmitted(options));
}

async function compileAdmitted(
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

  // The toolchain is probed before the start, so an authoring compile's
  // start, whose rebind check follows its own awaits, comes after the
  // probe's await (playbook-library-67); the probe's verdict is thrown
  // after the start, which records it. A compile canceled during the
  // probe starts nothing.
  const toolchain = options.skipSlc ? undefined : await checkToolchain(env, spawner, options.runtime);
  signal?.throwIfAborted();
  const agent = options.start ? await options.start() : options.agent;
  const dir = artifactFolder(options.libraryDir, id);
  mkdirSync(dir, { recursive: true });
  const sourcePath = join(dir, `${id}.md`);
  if (options.source.text !== undefined || options.source.path) {
    // Spex's own write of the source replaces `<id>.md` atomically under
    // the bytes it held as the job began, the picked file read once; a
    // file changed meanwhile is a conflict (playbook-library-12).
    const before = readVersioned(sourcePath);
    const mode = before.bytes === null ? 0o644 : statSync(sourcePath).mode & 0o777;
    const bytes = options.source.text ?? await readFile(options.source.path as string);
    writeVersionedBytes(sourcePath, bytes, before.version, mode);
  } else if (!existsSync(sourcePath)) {
    throw new Error("compile needs a source text or file");
  }

  const artifactDir = join(dir, `${id}.playbook`);
  const fsmPath = join(artifactDir, `${id}.fsm.ts`);
  const playbookPath = join(artifactDir, `${id}.playbook.ts`);
  // slc emits the registry-entry module beside the artifact dir when
  // no -o is given (DR-014); the compile runs with cwd = dir.
  const entryModulePath = join(dir, `${id}.ts`);

  if (toolchain) {
    if (!toolchain.node.ok) throw new Error(toolchain.node.guidance);
    if (!toolchain.slc.ok) throw new Error(toolchain.slc.guidance);
    const [slcCommand, ...slcArgs] = toolchain.slc.command;
    // The compile's agent (playbook-library-42): the block's, unless the
    // environment configures slc; an adapter slc cannot drive is refused
    // here rather than left to slc's seeded default.
    const configured = SLC_AGENT_VARIABLES.some((variable) => env[variable]);
    const agentEnv = compilerAgentEnv(env, agent);
    if (agent && !configured && !SLC_AGENT_IDS[agent.adapter]) {
      throw new Error(
        i18n._({
          id: "The compile's agent runs on {adapter}, which the compiler cannot drive; choose an agent on claude, codex, gemini or opencode, or set SLC_AGENT.",
          values: { adapter: agent.adapter },
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
    // The engine resolves from the playbook's own directory (see
    // provisionEngineLinks): the compiler's checks, the entry it emits
    // and the registry module packaged from it all look there.
    provisionEngineLinks(dir, options.runtime?.modulePaths ?? bundleNodePaths());
    progress(`running: ${toolchain.slc.command.join(" ")} playbook ${id}.md`);
    // Bare invocation (DR-019): slc >= 0.2 links against the installed
    // @sublang/playbook runtime contract by default.
    // slc aborts an agent call after its ten-minute default silence; the
    // agent-driven phases routinely stay quieter, so the runner grants the
    // 2400s budget IR-053 settled on, unless the env already sets it (DR-005).
    // The block is the whole agent: no slc configuration file adds to it.
    const configArgs = agentEnv.SLC_AGENT ? ["--config", SLC_EMPTY_CONFIG] : [];
    const code = await spawner(
      slcCommand,
      [...slcArgs, ...configArgs, "playbook", sourcePath],
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
  // The module imports the engine rather than carrying it, so it runs on
  // the engine of the app that loads it (playbook-library-14); a
  // repackaging, which runs no compiler, finds the links all the same.
  if (!toolchain) provisionEngineLinks(dir, options.runtime?.modulePaths ?? bundleNodePaths());
  writeFileSync(registryBundle, await bundleRegistryModule(registryTs));

  // Fail-closed validation before anything touches the config
  // (PBLIB-14): the bundle must satisfy the captain shell's checks, its
  // engine resolved through the folder's engine links.
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
  // Packaging has no selected runtime configuration: a valid entry may
  // require source-owned options with no default (playbook-library-14).
  // Enabling and runtime admission validate the actual configured slice.
  // A roleless entry is legal: the Captain runs every step (DR-032).
  const roles = [...entry.requiredRoleIds];
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
