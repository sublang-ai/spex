// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Requests: a spex repository's `spex.yaml` (environments-2, DR-104).
// Exactly `{format: 1, language?, packages}`, each package named
// `<org>/<pkg>` and requested from one source — a registry version
// requirement, a path inside the working folder, or a Git repository at
// a revision — with an optional `select` and `alias`. Edits go through
// yaml's Document API, so comments and key order survive.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, posix } from "node:path";
import { Document, isMap, isSeq, parseDocument } from "yaml";

import { writeApplicationBytes } from "../app-storage.js";
import { idRecord, isLanguageTag, isPackageName, isSkillName, sha256Hex, type Issue } from "./format.js";
import { isRequirement } from "./semver.js";

export interface Selection {
  artifact: string;
  language?: string;
}

interface RequestExtras {
  select?: Selection[];
  alias?: Record<string, string>;
}

export type RegistryRequest = { version: string } & RequestExtras;
export type PathRequest = { path: string } & RequestExtras;
export type GitRequest = { git: string; rev: string; path?: string } & RequestExtras;
export type Request = RegistryRequest | PathRequest | GitRequest;

export interface Requests {
  format: 1;
  language?: string;
  packages: Record<string, Request>;
}

export class RequestsError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`spex.yaml refused: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "RequestsError";
  }
}

export function isRegistryRequest(request: Request): request is RegistryRequest {
  return "version" in request && typeof request.version === "string";
}

export function isPathRequest(request: Request): request is PathRequest {
  return !("git" in request) && "path" in request && typeof request.path === "string";
}

export function isGitRequest(request: Request): request is GitRequest {
  return "git" in request && typeof request.git === "string";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a request path stays inside the working folder. */
export function isInsidePath(path: string): boolean {
  if (path === "" || isAbsolute(path) || path.includes("\\") || /^[a-zA-Z]:/.test(path)) return false;
  const normalized = posix.normalize(path);
  return normalized !== ".." && !normalized.startsWith("../") && !posix.isAbsolute(normalized);
}

const REQUEST_FIELDS = new Set(["version", "path", "git", "rev", "select", "alias"]);

/** Every reason a request for a name is refused (environments-2,
 * environments-15): a bad name, no or several sources, a malformed
 * requirement, a path outside the working folder, a bad select or
 * alias. */
export function requestIssues(name: string, request: unknown): Issue[] {
  const at = `packages.${name}`;
  const issues: Issue[] = [];
  if (!isPackageName(name)) issues.push({ path: at, rule: "name", message: `"${name}" is not a <org>/<pkg> name` });
  if (!isPlainObject(request)) return [...issues, { path: at, rule: "request", message: `the request for ${name} is not a mapping` }];
  for (const key of Object.keys(request)) {
    if (!REQUEST_FIELDS.has(key) && !key.startsWith("x-")) issues.push({ path: at, rule: "field", message: `the request for ${name} has unknown field "${key}"` });
  }
  const sources = [
    request.version !== undefined ? "registry" : undefined,
    request.git !== undefined ? "git" : undefined,
    request.path !== undefined && request.git === undefined ? "path" : undefined,
  ].filter(Boolean);
  if (sources.length !== 1) {
    issues.push({ path: at, rule: "source", message: `the request for ${name} must name exactly one source: version, path, or git with rev` });
  } else if (sources[0] === "registry") {
    if (!isRequirement(request.version)) issues.push({ path: at, rule: "version", message: `${JSON.stringify(request.version)} is not a version requirement: use 1.2.3, ^1.2.3 or ~1.2.3` });
    if (request.rev !== undefined || request.path !== undefined) issues.push({ path: at, rule: "source", message: `the request for ${name} must name exactly one source` });
  } else if (sources[0] === "path") {
    if (typeof request.path !== "string" || !isInsidePath(request.path)) {
      issues.push({ path: at, rule: "path", message: `path ${JSON.stringify(request.path)} is not a relative folder inside the working folder` });
    }
    if (request.rev !== undefined) issues.push({ path: at, rule: "source", message: `rev belongs to a git request` });
  } else {
    if (typeof request.git !== "string" || request.git.trim() === "") issues.push({ path: at, rule: "git", message: `git is not a repository` });
    if (typeof request.rev !== "string" || request.rev.trim() === "" || request.rev.startsWith("-")) issues.push({ path: at, rule: "git", message: `a git request names a rev: a branch, tag or commit` });
    if (request.path !== undefined && (typeof request.path !== "string" || !isInsidePath(request.path))) {
      issues.push({ path: at, rule: "path", message: `path ${JSON.stringify(request.path)} is not a relative folder inside the repository` });
    }
  }
  if (request.select !== undefined) {
    if (!Array.isArray(request.select)) {
      issues.push({ path: at, rule: "select", message: `select is not a list of {artifact, language}` });
    } else {
      for (const entry of request.select) {
        if (!isPlainObject(entry) || typeof entry.artifact !== "string" || entry.artifact === ""
          || (entry.language !== undefined && !isLanguageTag(entry.language))
          || Object.keys(entry).some((key) => key !== "artifact" && key !== "language")) {
          issues.push({ path: at, rule: "select", message: `select entry ${JSON.stringify(entry)} is not {artifact, language}` });
        }
      }
    }
  }
  if (request.alias !== undefined) {
    if (!isPlainObject(request.alias)) {
      issues.push({ path: at, rule: "alias", message: `alias is not a mapping of id to name` });
    } else {
      for (const [id, alias] of Object.entries(request.alias)) {
        if (!isSkillName(alias)) issues.push({ path: at, rule: "alias", message: `alias of ${id}, ${JSON.stringify(alias)}, is not an Agent Skills name` });
      }
    }
  }
  return issues;
}

function toRequest(value: Record<string, unknown>): Request {
  const extras: RequestExtras = {
    ...(Array.isArray(value.select)
      ? { select: (value.select as Record<string, unknown>[]).map((entry) => ({
        artifact: entry.artifact as string,
        ...(typeof entry.language === "string" ? { language: entry.language } : {}),
      })) }
      : {}),
    ...(isPlainObject(value.alias) ? { alias: Object.assign(idRecord<string>(), value.alias as Record<string, string>) } : {}),
  };
  if (value.version !== undefined) return { version: value.version as string, ...extras };
  if (value.git !== undefined) {
    return { git: value.git as string, rev: value.rev as string, ...(typeof value.path === "string" ? { path: value.path } : {}), ...extras };
  }
  return { path: value.path as string, ...extras };
}

/** Read a parsed `spex.yaml` value as requests, or throw. */
export function parseRequestsValue(raw: unknown): Requests {
  const issues: Issue[] = [];
  if (!isPlainObject(raw)) throw new RequestsError([{ rule: "requests", message: "spex.yaml is not a mapping" }]);
  if (raw.format !== 1) throw new RequestsError([{ rule: "format", message: `format ${JSON.stringify(raw.format ?? null)} is not the known format 1` }]);
  for (const key of Object.keys(raw)) {
    if (key !== "format" && key !== "language" && key !== "packages" && !key.startsWith("x-")) {
      issues.push({ rule: "field", message: `unknown field "${key}"` });
    }
  }
  if (raw.language !== undefined && !isLanguageTag(raw.language)) {
    issues.push({ rule: "language", message: `language ${JSON.stringify(raw.language)} is not a BCP 47 tag` });
  }
  const packages: Record<string, Request> = {};
  const rawPackages = raw.packages ?? {};
  if (!isPlainObject(rawPackages)) {
    issues.push({ rule: "packages", message: "packages is not a mapping" });
  } else {
    for (const [name, request] of Object.entries(rawPackages)) {
      const found = requestIssues(name, request);
      if (found.length > 0) issues.push(...found);
      else packages[name] = toRequest(request as Record<string, unknown>);
    }
  }
  if (issues.length > 0) throw new RequestsError(issues);
  return { format: 1, ...(typeof raw.language === "string" ? { language: raw.language } : {}), packages };
}

/** Parse `spex.yaml` text, or throw. */
export function parseRequests(text: string): Requests {
  const doc = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) throw new RequestsError(doc.errors.map((error) => ({ rule: "yaml", message: error.message })));
  return parseRequestsValue(doc.toJS() ?? {});
}

/** The lock's `requests` field: the SHA-256 of the file's bytes. */
export function requestsDigest(text: string | Uint8Array): string {
  return sha256Hex(text);
}

export async function readRequests(file: string): Promise<Requests> {
  return parseRequests(await readFile(file, "utf8"));
}

/** Read `spex.yaml` with its text and digest; null where absent. */
export function readRequestsFile(file: string): { requests: Requests; text: string; digest: string } | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  return { requests: parseRequests(text), text, digest: requestsDigest(text) };
}

function requestValue(request: Request): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (isRegistryRequest(request)) value.version = request.version;
  else if (isGitRequest(request)) {
    value.git = request.git;
    value.rev = request.rev;
    if (request.path !== undefined) value.path = request.path;
  } else value.path = request.path;
  if (request.select !== undefined) value.select = request.select.map((entry) => ({ ...entry }));
  if (request.alias !== undefined) value.alias = Object.assign(idRecord<string>(), request.alias);
  return value;
}

function requestsValue(requests: Requests): Record<string, unknown> {
  const packages: Record<string, unknown> = {};
  for (const [name, request] of Object.entries(requests.packages)) packages[name] = requestValue(request);
  return { format: 1, ...(requests.language !== undefined ? { language: requests.language } : {}), packages };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Bring a document node to a value, touching only what differs, so
 * comments and key order of what stays survive. */
function syncNode(doc: Document, path: (string | number)[], value: unknown): void {
  const node = path.length === 0 ? doc.contents : doc.getIn(path, true);
  if (isPlainObject(value) && isMap(node)) {
    for (const item of [...node.items]) {
      const key = (item.key as { value?: unknown })?.value ?? item.key;
      if (typeof key === "string" && !Object.hasOwn(value, key)) doc.deleteIn([...path, key]);
    }
    for (const [key, child] of Object.entries(value)) {
      if (!node.has(key)) doc.setIn([...path, key], doc.createNode(child));
      else syncNode(doc, [...path, key], child);
    }
    return;
  }
  if (Array.isArray(value) && isSeq(node) && node.items.length === value.length) {
    value.forEach((child, index) => syncNode(doc, [...path, index], child));
    return;
  }
  const current = node === undefined || node === null ? undefined
    : typeof (node as { toJSON?: () => unknown }).toJSON === "function" ? (node as { toJSON: () => unknown }).toJSON() : node;
  if (sameValue(current, value)) return;
  if (path.length === 0) doc.contents = doc.createNode(value) as typeof doc.contents;
  else doc.setIn(path, typeof value === "object" && value !== null ? doc.createNode(value) : value);
}

function documentOf(file: string): Document {
  if (existsSync(file)) {
    const doc = parseDocument(readFileSync(file, "utf8"), { uniqueKeys: true });
    if (doc.errors.length > 0) throw new RequestsError(doc.errors.map((error) => ({ rule: "yaml", message: error.message })));
    if (doc.contents !== null) return doc;
  }
  return new Document({ format: 1, packages: {} });
}

/** Prepare a request edit without changing the environment it belongs to. */
export function prepareRequest(text: string | null, name: string, request: Request | null): { requests: Requests; text: string } {
  if (request !== null) {
    const issues = requestIssues(name, request);
    if (issues.length > 0) throw new RequestsError(issues);
  }
  const doc = text === null ? new Document({ format: 1, packages: {} }) : parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length > 0) throw new RequestsError(doc.errors.map((error) => ({ rule: "yaml", message: error.message })));
  if (!doc.has("packages") || !isMap(doc.get("packages", true))) doc.set("packages", doc.createNode({}));
  if (request === null) doc.deleteIn(["packages", name]);
  else if (doc.hasIn(["packages", name])) syncNode(doc, ["packages", name], requestValue(request));
  else doc.setIn(["packages", name], doc.createNode(requestValue(request)));
  const next = doc.toString({ lineWidth: 0 });
  return { requests: parseRequests(next), text: next };
}

async function writeText(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  writeApplicationBytes(file, text);
}

/** Write requests, preserving the file's comments and key order. */
export async function writeRequests(file: string, requests: Requests): Promise<string> {
  const doc = documentOf(file);
  syncNode(doc, [], requestsValue(requests));
  const text = doc.toString({ lineWidth: 0 });
  parseRequests(text);
  await writeText(file, text);
  return text;
}

/** Edit `spex.yaml` through its Document, then validate and write it
 * atomically; a refused edit writes nothing. */
export async function editRequests(
  file: string,
  edit: (doc: Document) => void,
): Promise<{ requests: Requests; text: string; digest: string }> {
  const doc = documentOf(file);
  edit(doc);
  const text = doc.toString({ lineWidth: 0 });
  const requests = parseRequests(text);
  await writeText(file, text);
  return { requests, text, digest: requestsDigest(text) };
}

/** Set one package's request, or remove it with null (environments-15). */
export async function setRequest(file: string, name: string, request: Request | null): Promise<{ requests: Requests; text: string; digest: string }> {
  if (request !== null) {
    const issues = requestIssues(name, request);
    if (issues.length > 0) throw new RequestsError(issues);
  }
  return editRequests(file, (doc) => {
    if (!doc.has("packages") || !isMap(doc.get("packages", true))) doc.set("packages", doc.createNode({}));
    if (request === null) doc.deleteIn(["packages", name]);
    else if (doc.hasIn(["packages", name])) syncNode(doc, ["packages", name], requestValue(request));
    else doc.setIn(["packages", name], doc.createNode(requestValue(request)));
  });
}
