// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A stand-in for spex.pub (environments-18): an in-process HTTP server
// serving the format 2 interface (spex.pub DR-016, DR-017) — version
// index, version resources, raw files, release archives and search —
// from a directory of releases, with a publish endpoint that validates
// as the core's publishing does — the release checks and the fields the
// registry requires (environments-10) — and stores the archive.
// Scripted yank, suppression, private namespaces honouring app tokens,
// the orgs each app token's person may publish to, held as scripted,
// and outages let the core's tests and the browser journeys drive every
// registry answer. It answers at each stand-in instance set to relay to
// it (DR-127): the instance names itself and its verdict on the bearer
// in the relay headers, so one registry stands behind several instances,
// honouring each one's tokens, and a scripted refusal answers one
// instance's tokens alone.

import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { stringify } from "yaml";

import { unpackRelease } from "../environment/archive.js";
import { artifactLanguages, publishIssues, sha256Hex, type Issue, type Manifest, type ReleaseFile } from "../environment/format.js";
import { compareVersions, isVersion } from "../environment/semver.js";

export type ReleaseFixture =
  | string
  | Uint8Array
  | { data: string | Uint8Array; executable?: boolean }
  | { symlink: string };

/** Write a release folder: `meta.yaml` from the manifest — a value
 * written as YAML exactly as given, or raw text — and each file. */
export async function makeRelease(dir: string, manifest: Record<string, unknown> | string, files: Record<string, ReleaseFixture>): Promise<string> {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.yaml"), typeof manifest === "string" ? manifest : stringify(manifest, { lineWidth: 0 }));
  for (const [path, fixture] of Object.entries(files)) {
    const target = join(dir, ...path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    if (typeof fixture === "object" && "symlink" in fixture) {
      symlinkSync(fixture.symlink, target);
      continue;
    }
    const data = typeof fixture === "string" || fixture instanceof Uint8Array ? fixture : fixture.data;
    writeFileSync(target, data);
    const executable = typeof fixture === "object" && !(fixture instanceof Uint8Array) && "data" in fixture && fixture.executable === true;
    chmodSync(target, executable ? 0o755 : 0o644);
  }
  return dir;
}

interface Stored {
  org: string;
  pkg: string;
  version: string;
  manifest: Manifest;
  files: ReleaseFile[];
  data: Map<string, Uint8Array>;
  tgz: Uint8Array;
  checksum: string;
  publishedAt: string;
  createdAt: string;
  yanked: boolean;
  suppressed: boolean;
}

/** The headers a stand-in instance relaying a request to the registry
 * sets (environments-18), every inbound one of these names dropped
 * first: the instance by its origin, and its verdict on the bearer — the
 * account it accepts it as, or the code it refuses it with. */
export const RELAY_HEADERS = {
  instance: "x-standin-instance",
  account: "x-standin-account",
  refused: "x-standin-refused",
} as const;

/** One request as the registry received it (environments-18). */
export interface StandinRegistryRequest {
  method: string;
  /** The path without its query. */
  path: string;
  /** The stand-in instance that relayed it, by its origin; null for a
   * request made to the registry directly. */
  instance: string | null;
  /** The account the relaying instance accepted the bearer as; null
   * where it accepted none, or for a direct request. */
  account: string | null;
  /** Whether it presented a bearer. */
  bearer: boolean;
}

/**
 * A reader of a private org, a holder of orgs and a scripted refusal
 * name the bearers they cover: a literal token presented as the bearer,
 * as a direct caller presents one, or a stand-in instance's origin,
 * standing for every bearer that instance relays as one it accepts.
 */
export interface StandinRegistryScript {
  /** Yank a version: caret and tilde stop picking it. */
  yank(name: string, version: string): void;
  /** Suppress a version as the operator: nothing picks or serves it. */
  suppress(name: string, version: string): void;
  /** Make an org private: a request without a bearer finds nothing
   * (404), one whose bearer no reader covers is forbidden (403). */
  setPrivate(org: string, readers: Iterable<string>): void;
  /** The orgs the person presenting a bearer `reader` covers may publish
   * to, which `GET /api/v1/account/orgs` lists sorted by name; any other
   * bearer, or none, is answered 401. */
  setOrgs(reader: string, orgs: { name: string; path: string; role: string }[]): void;
  /** Answer every request presenting a bearer `reader` covers 401 with
   * `code`, `token_revoked` unless given, as spex.pub answers a device
   * signed out; null lifts every such refusal. */
  refuseTokens(reader: string | null, code?: string): void;
  /** Hold each orgs answer `ms` before sending it. */
  delayOrgs(ms: number): void;
  /** Answer the next `count` requests 500, as an outage. */
  unavailable(count: number): void;
  /** Every request as `<METHOD> <path>`, in order. */
  readonly requests: string[];
  /** Every request with the instance that relayed it and the account it
   * came as, in order. */
  readonly received: StandinRegistryRequest[];
  /** Forget `requests` and `received`. */
  clearRequests(): void;
}

export interface StandinRegistry {
  url: string;
  script: StandinRegistryScript;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, code: string, message: string, details?: unknown[]): void {
  sendJson(res, status, { error: { code, message, ...(details ? { details } : {}) } });
}

/** The words spex.pub answers a refused bearer with, by its code. */
const REFUSED_WORDS: Record<string, string> = {
  invalid_token: "The token is not known.",
  token_revoked: "This device was signed out.",
  token_expired: "The access token expired.",
  reauth_required: "Sign in again.",
};

function headerOf(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** An origin as a reader names it, without a trailing slash. */
const readerKey = (reader: string): string => reader.replace(/\/+$/, "");

async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

/** Start the stand-in over the releases stored under `dir`. */
export async function startStandinRegistry(options: { dir: string }): Promise<StandinRegistry> {
  const { dir } = options;
  mkdirSync(dir, { recursive: true });
  const releases = new Map<string, Map<string, Stored>>();
  const privateOrgs = new Map<string, Set<string>>();
  const accountOrgs = new Map<string, { name: string; path: string; role: string }[]>();
  const refusedReaders = new Map<string, string>();
  let orgsDelay = 0;
  const requests: string[] = [];
  const received: StandinRegistryRequest[] = [];
  let outages = 0;

  /** Keep a release; a publish also holds it to the fields the
   * registry requires, which a release already served may lack. */
  function store(org: string, pkg: string, version: string, tgz: Uint8Array, publishedAt: string, publishing = false): Issue[] {
    const unpacked = unpackRelease(tgz, pkg);
    const issues = [...unpacked.issues];
    const manifest = unpacked.manifest;
    if (manifest && (manifest.org !== org || manifest.name !== pkg || manifest.version !== version)) {
      issues.push({ path: "meta.yaml", rule: "identity", message: `the manifest names ${manifest.org}/${manifest.name} ${manifest.version}, not ${org}/${pkg} ${version}` });
    }
    if (manifest && publishing) issues.push(...publishIssues(manifest));
    if (!manifest || issues.length > 0) return issues;
    const name = `${org}/${pkg}`;
    const versions = releases.get(name) ?? new Map<string, Stored>();
    const createdAt = [...versions.values()][0]?.createdAt ?? publishedAt;
    versions.set(version, {
      org, pkg, version, manifest, files: unpacked.files, data: unpacked.data, tgz,
      checksum: sha256Hex(tgz), publishedAt, createdAt, yanked: false, suppressed: false,
    });
    releases.set(name, versions);
    return [];
  }

  // Releases already in the directory are served from the start.
  for (const org of existsSync(dir) ? readdirSync(dir) : []) {
    const orgDir = join(dir, org);
    for (const pkg of readdirSync(orgDir)) {
      for (const version of readdirSync(join(orgDir, pkg))) {
        const file = join(orgDir, pkg, version, "release.tgz");
        if (existsSync(file)) store(org, pkg, version, new Uint8Array(readFileSync(file)), new Date().toISOString());
      }
    }
  }

  /** Who a request comes from: the bearer it presents and, relayed by a
   * stand-in instance, that instance and its verdict on the bearer. */
  interface Caller {
    bearer: string | null;
    instance: string | null;
    account: string | null;
    refused: string | null;
  }

  function callerOf(req: IncomingMessage): Caller {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") && header.length > 7 ? header.slice(7) : null;
    const instance = headerOf(req, RELAY_HEADERS.instance);
    return {
      bearer,
      instance: instance === null ? null : readerKey(instance),
      account: instance === null || bearer === null ? null : headerOf(req, RELAY_HEADERS.account),
      refused: instance === null || bearer === null ? null : headerOf(req, RELAY_HEADERS.refused),
    };
  }

  /** The readers a caller's bearer is covered by: the token itself, and
   * the relaying instance where it accepted the bearer. */
  function readersOf(caller: Caller): string[] {
    if (caller.bearer === null) return [];
    return caller.account !== null && caller.instance !== null ? [caller.bearer, caller.instance] : [caller.bearer];
  }

  /** The 401 a bearer earns before any route: the relaying instance's
   * refusal of it, or a refusal scripted for a reader covering it. */
  function refusal(caller: Caller): string | null {
    if (caller.bearer === null) return null;
    if (caller.refused !== null) return caller.refused;
    for (const reader of readersOf(caller)) {
      const code = refusedReaders.get(reader);
      if (code !== undefined) return code;
    }
    return null;
  }

  function access(org: string, caller: Caller, res: ServerResponse): boolean {
    const readers = privateOrgs.get(org);
    if (!readers) return true;
    if (caller.bearer === null) { sendError(res, 404, "not_found", "not found"); return false; }
    if (!readersOf(caller).some((reader) => readers.has(reader))) { sendError(res, 403, "forbidden", "this token may not read the namespace"); return false; }
    return true;
  }

  function artifactsIndex(stored: Stored): Record<string, unknown> {
    const languages = artifactLanguages(stored.manifest, stored.files);
    const out: Record<string, unknown> = {};
    for (const [id, artifact] of Object.entries(stored.manifest.artifacts)) {
      out[id] = { kind: artifact.kind, ...(artifact.language ? { language: artifact.language } : {}), languages: languages[id] ?? [] };
    }
    return out;
  }

  function artifactsFull(stored: Stored): Record<string, unknown> {
    const index = artifactsIndex(stored);
    const out: Record<string, unknown> = {};
    for (const [id, artifact] of Object.entries(stored.manifest.artifacts)) {
      out[id] = {
        ...(index[id] as Record<string, unknown>),
        ...(artifact.from ? { from: artifact.from } : {}),
        requires: artifact.requires,
        ...(artifact.generatedBy ? { "generated-by": artifact.generatedBy } : {}),
      };
    }
    return out;
  }

  const active = (stored: Stored): boolean => !stored.yanked && !stored.suppressed;

  function packageResource(name: string, versions: Map<string, Stored>): unknown {
    const all = [...versions.values()].sort((a, b) => compareVersions(a.version, b.version));
    const stable = all.filter((stored) => active(stored) && !stored.version.includes("-"));
    const latest = (stable.length > 0 ? stable : all.filter(active)).at(-1);
    const [org, pkg] = name.split("/");
    return {
      org, name: pkg,
      created_at: all[0]?.createdAt,
      latest: latest?.version ?? null,
      ...(latest ? {
        ...(latest.manifest.description ? { description: latest.manifest.description } : {}),
        ...(latest.manifest.license ? { license: latest.manifest.license } : {}),
        ...(latest.manifest.repository ? { repository: latest.manifest.repository } : {}),
        languages: [...new Set(Object.values(artifactLanguages(latest.manifest, latest.files)).flat())].sort(),
      } : {}),
      versions: all.map((stored) => ({
        version: stored.version,
        format: 2,
        published_at: stored.publishedAt,
        checksum: stored.checksum,
        yanked: stored.yanked,
        suppressed: stored.suppressed,
        dependencies: stored.manifest.dependencies,
        artifacts: artifactsIndex(stored),
      })),
    };
  }

  function versionResource(stored: Stored): unknown {
    const { manifest } = stored;
    return {
      org: stored.org,
      name: stored.pkg,
      version: stored.version,
      format: 2,
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.license ? { license: manifest.license } : {}),
      ...(manifest.repository ? { repository: manifest.repository } : {}),
      languages: [...new Set(Object.values(artifactLanguages(manifest, stored.files)).flat())].sort(),
      artifacts: artifactsFull(stored),
      dependencies: manifest.dependencies,
      checksum: stored.checksum,
      size: stored.tgz.length,
      published_at: stored.publishedAt,
      yanked: stored.yanked,
      suppressed: stored.suppressed,
      ...(stored.suppressed ? {} : {
        files: stored.files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256, executable: file.executable })),
        dist: { tarball: `/api/v1/packages/${stored.org}/${stored.pkg}/${stored.version}/download`, sha256: stored.checksum },
      }),
    };
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://standin");
    const method = req.method ?? "GET";
    const caller = callerOf(req);
    requests.push(`${method} ${url.pathname}`);
    received.push({ method, path: url.pathname, instance: caller.instance, account: caller.account, bearer: caller.bearer !== null });
    if (outages > 0) {
      outages -= 1;
      sendError(res, 500, "internal_error", "the stand-in registry is scripted to be unavailable");
      return;
    }
    // A refused bearer is answered 401 on every route, whatever it names
    // and whether it exists, as spex.pub answers it.
    const refused = refusal(caller);
    if (refused !== null) { sendError(res, 401, refused, REFUSED_WORDS[refused] ?? "The token was refused."); return; }
    const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    if (method === "GET" && url.pathname === "/api/v1/account/orgs") {
      if (orgsDelay > 0) await new Promise((resolve) => setTimeout(resolve, orgsDelay));
      const orgs = readersOf(caller).map((reader) => accountOrgs.get(reader)).find((found) => found !== undefined);
      if (!orgs) { sendError(res, 401, "unauthenticated", "sign in to list your orgs"); return; }
      sendJson(res, 200, { orgs: [...orgs].sort((a, b) => a.name.localeCompare(b.name)) });
      return;
    }
    if (method === "GET" && url.pathname === "/api/v1/search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const results = [...releases.entries()]
        .filter(([name]) => !privateOrgs.has(name.split("/")[0]!))
        .map(([name, versions]) => ({ name, latest: [...versions.values()].sort((a, b) => compareVersions(a.version, b.version)).at(-1)! }))
        .filter(({ name, latest }) => q === "" || name.includes(q) || (latest.manifest.description ?? "").toLowerCase().includes(q))
        .map(({ name, latest }) => ({ org: name.split("/")[0], name: name.split("/")[1], description: latest.manifest.description ?? "" }));
      sendJson(res, 200, { results });
      return;
    }
    if (segments[0] === "api" && segments[1] === "v1" && segments[2] === "packages" && segments.length >= 5) {
      const [org, pkg, version, tail] = [segments[3]!, segments[4]!, segments[5], segments[6]];
      const name = `${org}/${pkg}`;
      if (method === "PUT" && version && segments.length === 6) {
        if (!access(org, caller, res)) return;
        if (!isVersion(version)) { sendError(res, 400, "bad_request", `${version} is not a version`); return; }
        const body = await readBody(req);
        if (releases.get(name)?.has(version)) { sendError(res, 409, "version_exists", `${name} ${version} is already published`); return; }
        const issues = store(org, pkg, version, body, new Date().toISOString(), true);
        if (issues.length > 0) { sendError(res, 422, "invalid_artifact", `${name} ${version} is not a valid release`, issues); return; }
        const target = join(dir, org, pkg, version);
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, "release.tgz"), body);
        sendJson(res, 201, { org, name: pkg, version, checksum: sha256Hex(body) });
        return;
      }
      if (method !== "GET") { sendError(res, 400, "bad_request", "unsupported method"); return; }
      if (!access(org, caller, res)) return;
      const versions = releases.get(name);
      if (!versions) { sendError(res, 404, "not_found", `${name} is not published`); return; }
      if (!version) { sendJson(res, 200, packageResource(name, versions)); return; }
      const stored = versions.get(version);
      if (!stored) { sendError(res, 404, "not_found", `${name} ${version} is not published`); return; }
      if (tail === undefined && segments.length === 6) { sendJson(res, 200, versionResource(stored)); return; }
      if (tail === "download" && segments.length === 7) {
        if (stored.suppressed) { sendError(res, 410, "suppressed", `${name} ${version} is suppressed`); return; }
        res.writeHead(200, { "content-type": "application/gzip" });
        res.end(Buffer.from(stored.tgz));
        return;
      }
      sendError(res, 404, "not_found", "not found");
      return;
    }
    if (method === "GET" && segments.length >= 4 && segments[0] !== "api") {
      const [org, pkg, version] = [segments[0]!, segments[1]!, segments[2]!];
      if (!access(org, caller, res)) return;
      const stored = releases.get(`${org}/${pkg}`)?.get(version);
      if (stored?.suppressed) { sendError(res, 410, "suppressed", `${org}/${pkg} ${version} is suppressed`); return; }
      const bytes = stored?.data.get(segments.slice(3).join("/"));
      if (!bytes) { sendError(res, 404, "not_found", "not found"); return; }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from(bytes));
      return;
    }
    sendError(res, 404, "not_found", "not found");
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) sendError(res, 500, "internal_error", (error as Error).message);
      else res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  function find(name: string, version: string): Stored {
    const stored = releases.get(name)?.get(version);
    if (!stored) throw new Error(`the stand-in holds no ${name} ${version}`);
    return stored;
  }

  return {
    url: `http://127.0.0.1:${port}`,
    script: {
      yank: (name, version) => { find(name, version).yanked = true; },
      suppress: (name, version) => { find(name, version).suppressed = true; },
      setPrivate: (org, readers) => { privateOrgs.set(org, new Set([...readers].map(readerKey))); },
      setOrgs: (reader, orgs) => { accountOrgs.set(readerKey(reader), orgs.map((org) => ({ ...org }))); },
      refuseTokens: (reader, code = "token_revoked") => {
        if (reader === null) refusedReaders.clear();
        else refusedReaders.set(readerKey(reader), code);
      },
      delayOrgs: (ms) => { orgsDelay = ms; },
      unavailable: (count) => { outages = count; },
      requests,
      received,
      clearRequests: () => { requests.length = 0; received.length = 0; },
    },
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
