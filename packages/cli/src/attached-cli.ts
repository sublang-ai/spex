// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readFileSync } from "node:fs";
import { join, relative, resolve, isAbsolute, sep, win32 } from "node:path";
import { AttachedClient, CliFailure, selectEndpoint } from "./attached-client.js";
import { parseManifestText } from "./lib/environment/index.js";

type Flags = Record<string, string | boolean>;
type Invocation = { group: string; action: string; positional: string[]; flags: Flags; timeoutMs: number };
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALUES = new Set(["server", "timeout", "project", "instance", "version", "path"]);

export const ATTACHED_USAGE = `Attached commands (need a running Spex server, named below):
  auth login --instance <origin>    Sign in through the browser/device instructions
  auth status                      Show instance sign-in standing
  project list                     List registered projects
  project add <folder>              Register a project working folder
  package search <query>            Search the selected project's registry
  package status                   Show its requests and installed packages
  package add <org/name> --version <requirement>
  package add <org/name> --path <relative-folder>
  package remove <org/name>
  package install                  Install the locked selections
  package resolve                  Resolve requests and install
  package publish <relative-folder> [--dry-run]

Connection: --server <access-url> or SPEX_SERVER_URL names the running
  Spex server (literal loopback only).
Observation: --timeout <positive seconds> (default 600); no reconnect or replay.
Packages: --project <registered-folder>, otherwise the exact current directory.
Publishing is explicit; --dry-run checks without uploading.`;

function usageError(message: string): never { throw new CliFailure(1, message); }

/** The `<org>/<pkg>` a package folder's `meta.yaml` names, or the
 * command refused before anything is sent. */
function packageNameAt(folder: string): string {
  let text: string;
  try { text = readFileSync(join(folder, "meta.yaml"), "utf8"); }
  catch { usageError("The package folder holds no meta.yaml."); }
  const { manifest, issues } = parseManifestText(text);
  if (!manifest) usageError(`The package folder's meta.yaml does not read: ${issues.map((issue) => issue.message).join("; ")}`);
  return `${manifest.org}/${manifest.name}`;
}
function relativeFolder(value: string): string {
  if (!value || /[\x00-\x1f\x7f]/.test(value) || isAbsolute(value) || win32.isAbsolute(value) || value.split(/[\\/]/).includes(".."))
    usageError("Package folder must be a relative folder inside the selected project.");
  return value;
}

/** Parse the whole invocation before opening a connection or sending a command. */
export function parseAttached(args: string[]): Invocation {
  const flags: Flags = {}; const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("-")) { words.push(arg); continue; }
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    const key = match?.[1];
    if (!key || (!VALUES.has(key) && key !== "dry-run")) usageError("Unknown option. Use spex --help for supported flags.");
    if (Object.hasOwn(flags, key)) usageError(`Option --${key} was repeated.`);
    if (key === "dry-run") {
      if (match![2] !== undefined) usageError("--dry-run takes no value.");
      flags[key] = true;
    } else {
      const value = match![2] ?? args[++i];
      if (!value || value.startsWith("-")) usageError(`--${key} requires a value.`);
      flags[key] = value;
    }
  }
  const [group, action, ...positional] = words;
  const allowed: Record<string, string[]> = {
    "auth login": ["instance"], "auth status": [], "project list": [], "project add": [],
    "package search": ["project"], "package status": ["project"],
    "package add": ["project", "version", "path"], "package remove": ["project"],
    "package install": ["project"], "package resolve": ["project"], "package publish": ["project", "dry-run"],
  };
  const entry = allowed[`${group} ${action}`];
  if (!entry) usageError("Unknown attached command. Use spex --help.");
  for (const key of Object.keys(flags)) if (!["server", "timeout", ...entry].includes(key)) usageError(`--${key} is not valid for this command.`);
  const needsArgument = action === "add" || action === "remove" || action === "search" || action === "publish";
  if (positional.length !== (needsArgument ? 1 : 0)) usageError(needsArgument ? "This command requires exactly one argument." : "This command takes no positional arguments.");
  if (group === "auth" && action === "login") {
    if (typeof flags.instance !== "string") usageError("auth login requires --instance <origin>.");
    try {
      const origin = new URL(flags.instance);
      if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || flags.instance.includes("#")) throw new Error();
      flags.instance = origin.origin;
    } catch { usageError("--instance must name an HTTP(S) Space origin, without credentials, path, query or fragment."); }
  }
  if (group === "package") {
    if (["add", "remove"].includes(action!) && !NAME.test(positional[0]!)) usageError("Package name must be org/name using lowercase letters, digits and hyphens.");
    if (action === "search" && positional[0]!.length > 200) usageError("Search query must be at most 200 characters.");
    if (action === "add" && (typeof flags.version === "string") === (typeof flags.path === "string")) usageError("package add requires exactly one of --version or --path.");
    if (typeof flags.path === "string") relativeFolder(flags.path);
    if (action === "publish") relativeFolder(positional[0]!);
  }
  let seconds = 600;
  if (flags.timeout !== undefined) {
    if (typeof flags.timeout !== "string" || !/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(flags.timeout)) usageError("--timeout must be positive seconds.");
    seconds = Number(flags.timeout);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1000 > 2_147_483_647) usageError("--timeout must be positive seconds within the supported timer range.");
  }
  if (typeof flags.project === "string") flags.project = resolve(flags.project);
  if (group === "project" && action === "add") positional[0] = resolve(positional[0]!);
  return { group: group!, action: action!, positional, flags, timeoutMs: Math.max(1, Math.ceil(seconds * 1000)) };
}

function object(value: any): value is Record<string, any> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function malformed(): never { throw new CliFailure(2, "The server returned an incomplete result. Outcome is unknown; inspect its state before retrying. Nothing was resent."); }

export async function runAttached(args: string[], env = process.env): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) { process.stdout.write(ATTACHED_USAGE + "\n"); return 0; }
  let client: AttachedClient | undefined;
  let token = "";
  let endpoint = "";
  const clean = (value: unknown): string => {
    let text = String(value);
    if (endpoint) text = text.split(endpoint).join("[server access URL redacted]");
    if (token) { text = text.split(token).join("[redacted]").split(encodeURIComponent(token)).join("[redacted]"); }
    return text;
  };
  const print = (value: string) => process.stdout.write(clean(value) + "\n");
  const interrupt = () => client?.interrupt();
  try {
    const invocation = parseAttached(args);
    const { group, action, positional, flags } = invocation;
    const access = selectEndpoint(typeof flags.server === "string" ? flags.server : undefined, env);
    token = access.token; endpoint = access.url;
    client = new AttachedClient(access.url, invocation.timeoutMs);
    process.on("SIGINT", interrupt);
    await client.connect();
    if (group === "project") {
      const result = await client.command(action === "list" ? "project.list" : "project.register", action === "add" ? { path: positional[0] } : {});
      const projects = action === "list" ? result : [result];
      if (!Array.isArray(projects) || projects.some((p) => !object(p) || typeof p.name !== "string" || typeof p.path !== "string")) malformed();
      print(projects.length ? projects.map((p) => `${p.name}\t${p.path}`).join("\n") : "No registered projects.");
    } else if (group === "auth") {
      if (action === "status") {
        const result = await client.command("space.get");
        if (!Array.isArray(result?.instances) || result.instances.some((i: any) => !object(i) || typeof i.origin !== "string" || typeof i.signedIn !== "boolean" || (i.signedIn && typeof i.account?.login !== "string"))) malformed();
        print(result.instances.length ? result.instances.map((i: any) => `${i.displayName ?? i.host ?? i.origin}\t${i.signedIn ? `Signed in${i.account?.login ? ` as @${i.account.login}` : ""}` : "Signed out"}`).join("\n") : "No instances. Sign in with spex auth login --instance <origin>.");
      } else {
        const result = await client.signIn(String(flags.instance), (instruction) => {
          if (instruction?.flow === "device" && typeof instruction.verificationUri === "string" && typeof instruction.userCode === "string") print(`Open ${instruction.verificationUri}\nEnter code: ${instruction.userCode}\nWaiting for this sign-in to complete…`);
          else if (instruction?.flow === "browser" && typeof instruction.url === "string") print(`Open ${instruction.url}\nWaiting for this sign-in to complete…`);
          else malformed();
        });
        print(`Signed in as @${result.account.login}. Catalog reading and Sync are separate operations.`);
      }
    } else {
      const listed = await client.command("project.list");
      if (!Array.isArray(listed)) malformed();
      const target = typeof flags.project === "string" ? flags.project : process.cwd();
      const matching = listed.filter((p: any) => p?.path === target);
      if (matching.length !== 1 || typeof matching[0]?.repository?.key !== "string") usageError("No unique registered project matches this folder. Use spex project add <folder>, then run from its root or pass --project <folder>.");
      const project = matching[0]; const repository = project.repository.key;
      if (action === "search") {
        const result = await client.command("environment.search", { repository, query: positional[0] });
        if (!Array.isArray(result?.packages) || result.packages.some((p: any) => !object(p) || typeof p.name !== "string" || !Array.isArray(p.versions) || p.versions.some((v: any) => typeof v !== "string"))) malformed();
        print(result.packages.length ? result.packages.map((p: any) => `${p.name}\t${p.versions?.join(", ") ?? ""}\t${p.description ?? ""}`).join("\n") : "No packages found.");
      } else if (action === "status") {
        const result = await client.command("environment.get", { repository });
        if (!object(result?.requests) || Object.values(result.requests).some((r) => !object(r) || typeof r.kind !== "string") || !Array.isArray(result?.packages) || result.packages.some((p: any) => !object(p) || typeof p.name !== "string" || typeof p.installed !== "boolean")) malformed();
        print(`Project: ${project.name}\nRequests:`);
        for (const [name, request] of Object.entries(result.requests) as [string, any][]) print(`  ${name}\t${request.kind}\t${request.version ?? request.path ?? request.repository ?? ""}`);
        print("Packages:");
        for (const p of result.packages) print(`  ${p.name}\t${p.version ?? "unresolved"}\t${p.installed ? "installed" : "not installed"}`);
        if (result.stale?.length) print(`Stale: ${result.stale.join("; ")}`);
        if (result.error) print(`Last environment error: ${result.error}`);
      } else if (action === "publish") {
        const dryRun = flags["dry-run"] === true;
        // The core publishes by name (environments-10): the name the
        // folder's manifest gives, its folder the request's path.
        const name = packageNameAt(join(project.path, positional[0]!));
        // The core publishes the folder of the environment's request by
        // path for that name, else `spex-packages/<org>/<pkg>/`
        // (environments-10): a folder named here that is not that one is
        // refused before anything is sent, so the upload is the folder named.
        const environment = await client.command("environment.get", { repository });
        if (!object(environment?.requests)) malformed();
        const request = (environment.requests as Record<string, any>)[name];
        const expected = (request?.kind === "path" && typeof request.path === "string" ? request.path : `spex-packages/${name}`).replace(/\/+$/u, "");
        const named = relative(project.path, resolve(project.path, positional[0]!)).split(sep).join("/");
        const normal = (path: string): string => relative(project.path, resolve(project.path, path)).split(sep).join("/");
        if (normal(expected) !== named) usageError(`${name} is published from ${normal(expected)}, not ${named}. Move the package there, or request it by that path, then publish again.`);
        const result = await client.command("environment.publish", { repository, name, ...(dryRun ? { dryRun: true } : { wait: true }) });
        const receipt = dryRun ? result?.preview : result?.published;
        if ((dryRun ? result?.accepted !== true : result?.completed !== true) || !object(receipt?.instance) || typeof receipt.name !== "string" || typeof receipt.version !== "string" || typeof receipt.instance.origin !== "string") malformed();
        if (dryRun ? !Array.isArray(receipt.files) || receipt.files.some((f: any) => typeof f !== "string" && (!object(f) || typeof f.path !== "string")) : typeof receipt.url !== "string") malformed();
        print(`${dryRun ? "Would publish" : "Published"} ${receipt.name}@${receipt.version}\nDestination: ${receipt.instance.name ?? receipt.instance.origin} (${receipt.instance.origin})`);
        if (dryRun) {
          if (!Array.isArray(receipt.files)) malformed();
          for (const file of receipt.files) print(`  ${typeof file === "string" ? file : file.path}`);
        } else if (typeof receipt.url === "string") print(receipt.url);
      } else {
        let type = `environment.${action}`; const fields: Record<string, unknown> = { repository, wait: true };
        if (action === "add") {
          type = "environment.request"; fields.name = positional[0];
          fields.request = typeof flags.path === "string" ? { kind: "path", path: flags.path } : { kind: "registry", version: flags.version };
        } else if (action === "remove") fields.name = positional[0];
        const result = await client.command(type, fields);
        if (result?.completed !== true) malformed();
        print(`Package ${action} completed for ${project.name}.`);
      }
    }
    return 0;
  } catch (error) {
    const failure = error instanceof CliFailure ? error : new CliFailure(1, "Command failed. Check the running server and command arguments.");
    process.stderr.write(clean(failure.message) + "\n");
    return failure.exitCode;
  } finally {
    process.off("SIGINT", interrupt);
    client?.close();
  }
}
