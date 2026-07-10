// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Playbook compilation via the external slc toolchain (DR-005):
// resolve system Node >= 23.6 and the slc CLI, run the pipeline in a
// managed library directory, then package the TypeScript artifacts
// with esbuild (type stripping + dependency inlining) so the
// registry loads in any Node — including Electron's — and derive the
// registry's state ids by FSM introspection.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

/** node_modules dirs up-tree from this package, so bundling artifacts
 * in the external library dir still resolves xstate and friends. */
function bundleNodePaths(): string[] {
  const paths: string[] = [];
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, "node_modules");
    if (existsSync(candidate)) paths.push(candidate);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return paths;
}

import { isValidRegistryEntry } from "./config.js";

export const MIN_NODE_MAJOR = 23;
export const MIN_NODE_MINOR = 6;

export interface ToolchainStatus {
  node: { ok: boolean; version?: string; command: string; guidance?: string };
  slc: { ok: boolean; command: string[]; guidance?: string };
}

export type LineSpawner = (
  command: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
) => Promise<number>;

export const defaultSpawner: LineSpawner = (command, args, cwd, onLine) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let buffer = "";
    const feed = (chunk: unknown) => {
      buffer += String(chunk);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", rejectPromise);
    child.on("close", (code) => {
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

/** Resolve the toolchain (PBLIB-11): env overrides, then PATH, then npx. */
export async function checkToolchain(
  env: NodeJS.ProcessEnv = process.env,
  spawner: LineSpawner = defaultSpawner,
): Promise<ToolchainStatus> {
  const nodeCommand = env.SPEX_NODE ?? "node";
  let nodeVersion = "";
  let nodeOk = false;
  try {
    await spawner(nodeCommand, ["--version"], ".", (line) => {
      nodeVersion = line.trim();
    });
    nodeOk = nodeSatisfies(nodeVersion);
  } catch {
    nodeOk = false;
  }
  const node: ToolchainStatus["node"] = {
    ok: nodeOk,
    command: nodeCommand,
    ...(nodeVersion ? { version: nodeVersion } : {}),
    ...(nodeOk
      ? {}
      : {
          guidance: `Compiling playbooks needs Node >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} on your system (found ${nodeVersion || "none"}). Install it from nodejs.org or set SPEX_NODE.`,
        }),
  };

  let slc: ToolchainStatus["slc"];
  const configured = env.SPEX_SLC?.split(" ").filter(Boolean);
  if (configured && configured.length > 0) {
    slc = { ok: true, command: configured };
  } else {
    let found = false;
    try {
      await spawner("slc", ["--version"], ".", () => {});
      found = true;
    } catch {
      found = false;
    }
    slc = found
      ? { ok: true, command: ["slc"] }
      : node.ok
        ? {
            ok: true,
            command: [nodeCommand === "node" ? "npx" : nodeCommand, "--yes", "@sublang/slc"],
            guidance:
              "slc is not installed; Spex will run it via npx (downloads on first use). Install @sublang/slc globally to pin it.",
          }
        : {
            ok: false,
            command: [],
            guidance: "Install Node >= 23.6 first; slc runs on it.",
          };
  }
  return { node, slc };
}

export interface CompileOptions {
  playbookId: string;
  /** Prose/skill source: inline text or a file to copy. */
  source: { text?: string; path?: string };
  /** Local role ids the playbook's players use (declared by the user). */
  roles: string[];
  command: string;
  intent: string;
  libraryDir: string;
  env?: NodeJS.ProcessEnv;
  spawner?: LineSpawner;
  onProgress?: (line: string) => void;
  /** Skip the slc run when artifacts already exist (re-package). */
  skipSlc?: boolean;
}

export interface CompileResult {
  /** Absolute path of the bundled registry module (config `from`). */
  from: string;
  idleStateId: string;
  finalStateId: string;
  parkStateIds: string[];
}

function resolveRuntimeContract(): string {
  const require = createRequire(import.meta.url);
  // The exports map exposes ./runtime (src/runtime.js); the authored
  // .ts contract ships beside it and is what slc's --link wants.
  const runtimeJs = require.resolve("@sublang/playbook/runtime");
  return join(dirname(runtimeJs), "runtime.ts");
}

interface MachineLike {
  config?: { initial?: unknown; states?: Record<string, { type?: string }> };
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

function registrySource(
  options: CompileOptions,
  ids: { idleStateId: string; finalStateId: string; parkStateIds: string[] },
  playbookModulePath: string,
): string {
  const roles = JSON.stringify(options.roles);
  return `// Generated by Spex (DR-005). Judgment fields came from the compile
// form; state ids were derived from the compiled FSM.
import createPlaybookRuntime from ${JSON.stringify(playbookModulePath)};

const entry = {
  id: ${JSON.stringify(options.playbookId)},
  command: ${JSON.stringify(options.command)},
  intent: ${JSON.stringify(options.intent)},
  requiredRoleIds: ${roles},
  idleStateId: ${JSON.stringify(ids.idleStateId)},
  finalStateId: ${JSON.stringify(ids.finalStateId)},
  parkStateIds: ${JSON.stringify(ids.parkStateIds)},
  validateOptions(options) {
    if (options === undefined) return {};
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new Error(
        "captain.options.playbooks." + entry.id + ".options must be an object",
      );
    }
    return options;
  },
  createRuntime({ captainOptions, players }) {
    // Convention from the slc link phase: each role's prompt identity
    // arrives as <role>Player, preferring the pinned model.
    const identities = {};
    for (const player of players ?? []) {
      identities[player.id + "Player"] = player.model ?? player.adapter;
    }
    const options = {
      ...(entry.validateOptions(captainOptions) ?? {}),
      ...identities,
    };
    return createPlaybookRuntime(options);
  },
};

export default entry;
`;
}

export async function compilePlaybook(
  options: CompileOptions,
): Promise<CompileResult> {
  const progress = options.onProgress ?? (() => {});
  const spawner = options.spawner ?? defaultSpawner;
  const env = options.env ?? process.env;
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

  if (!options.skipSlc) {
    const toolchain = await checkToolchain(env, spawner);
    if (!toolchain.node.ok) throw new Error(toolchain.node.guidance);
    if (!toolchain.slc.ok) throw new Error(toolchain.slc.guidance);
    const [slcCommand, ...slcArgs] = toolchain.slc.command;
    progress(`running: ${toolchain.slc.command.join(" ")} playbook ${id}.md`);
    const code = await spawner(
      slcCommand,
      [...slcArgs, "playbook", sourcePath, "--link", resolveRuntimeContract()],
      dir,
      progress,
    );
    if (code !== 0) {
      throw new Error(`slc playbook failed with exit code ${code}`);
    }
  }

  if (!existsSync(fsmPath) || !existsSync(playbookPath)) {
    throw new Error(
      `expected artifacts missing: ${fsmPath} / ${playbookPath} — the slc run did not produce the <id>.playbook/ layout`,
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

  progress("packaging: generating and bundling the registry");
  const registryTs = join(dir, `${id}.registry.ts`);
  writeFileSync(registryTs, registrySource(options, ids, playbookPath));
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
  const moduleValue = (await import(pathToFileURL(registryBundle).href)) as {
    default?: unknown;
  };
  const entry = moduleValue.default;
  if (!isValidRegistryEntry(entry)) {
    throw new Error("generated registry failed structural validation");
  }
  if (entry.id !== id) {
    throw new Error("generated registry id mismatch");
  }
  entry.validateOptions(undefined);

  progress("compile complete");
  return { from: registryBundle, ...ids };
}
