// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The stand-in Git host (git-host-12): an in-process HTTP server on
// 127.0.0.1 speaking spex.pub's sign-in routes (auth-69..75) and host
// routes (host-1..12) with their exact JSON shapes, over a directory of
// bare Git repositories whose Git transport it serves through Git's own
// `http-backend`. Tests and browser journeys script it: approvals,
// denials and expiries; expired, revoked and refused tokens; refused
// creations, branch preparations and transports; renames, archives,
// membership removals, rate limits and outages.

import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, renameSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

export interface StandinPerson { id: string; login: string; displayName: string | null }

export interface StandinGroup { id: string; fullPath: string; name: string; kind: "user" | "group" }

export interface StandinMember { id: string; login: string; displayName: string | null; role: string }

export interface StandinRepository {
  id: string;
  /** The display name; the same as `path` unless a test sets another. */
  name: string;
  /** The path segment, ending in `-spex` for a spex repository. */
  path: string;
  group: StandinGroup;
  description: string;
  visibility: string;
  archived: boolean;
  lfs: boolean;
  /** The signed-in person's role on it, by the Git host's own names. */
  role: string;
  /** Members besides the person. */
  members: StandinMember[];
  /** False once the person's membership was removed: left out of
   * listings, 404 on reads and on its transport. */
  listed: boolean;
  /** Whether a rule matching `spex` would block a push by a writer. */
  blocked: boolean;
  /** The bare repository's absolute path. */
  bare: string;
}

export interface StandinRequest {
  method: string;
  /** The path without its query. */
  path: string;
  /** The query, with its `?`, or "". */
  query: string;
  authorization: boolean;
  /** `performance.now()` at arrival. */
  at: number;
}

export interface StandinScript {
  person: StandinPerson;
  /** The person's own group (kind `user`) first. */
  groups: StandinGroup[];
  repositories: StandinRepository[];
  /** How `/login/app` answers a well-formed request. */
  browser: "approve" | "deny" | "hold";
  /** The device flow's announced polling interval, in seconds. */
  deviceInterval: number;
  /** The interval the token endpoint enforces with `slow_down`, in
   * seconds; null enforces the announced one. */
  devicePollFloor: number | null;
  /** A new device code's lifetime, in seconds. */
  deviceExpiresIn: number;
  /** An access secret's lifetime. */
  accessTtlMs: number;
  /** Refuse every refresh grant with `invalid_grant`. */
  refuseRefresh: boolean;
  /** Every request, in arrival order. */
  requests: StandinRequest[];
  /** Every token grant, in order. */
  tokenGrants: { grantType: string; ok: boolean; error: string | null }[];
  /** The number of browser sign-ins held by `browser: "hold"`. */
  heldSignIns(): number;
  /** Approve the oldest held browser sign-in, delivering its callback to
   * the loopback as the browser would; the loopback's answer. */
  approveHeld(): Promise<{ status: number; body: string }>;
  /** Deny the oldest held browser sign-in, delivering `access_denied`. */
  denyHeld(): Promise<{ status: number; body: string }>;
  approveDevice(userCode: string): void;
  denyDevice(userCode: string): void;
  /** The user codes of device sign-ins still pending and unexpired. */
  pendingDevices(): string[];
  /** Expire every device's access secret now. */
  expireAccess(): void;
  /** Revoke every device. */
  revokeDevices(): void;
  /** The number of devices neither revoked nor expired. */
  liveDevices(): number;
  addRepository(input: {
    group: string;
    name: string;
    project?: Record<string, unknown>;
    archived?: boolean;
    visibility?: string;
    members?: StandinMember[];
    role?: string;
    empty?: boolean;
    description?: string;
  }): StandinRepository;
  /** Rename or transfer a repository: its bare repository moves and its
   * `path` and `remote_url` change; its id stays. */
  rename(id: string, change: { name?: string; group?: string }): void;
  archive(id: string): void;
  /** Remove the person from a repository's members. */
  removeMember(id: string): void;
  /** Set the person's role on a repository. */
  accessLevel(id: string, role: string): void;
  /** While set, creation answers 202 pending with these words. */
  refuseCreate(message: string | null): void;
  /** The members besides the person each repository created from now on
   * carries, as a group's members carry into a project created in it. */
  createMembers(members: StandinMember[]): void;
  /** While set, branch preparation answers 202 pending with these words. */
  refuseBranch(message: string | null): void;
  /** While set, every transport request answers 403 with these words. */
  refuseTransport(message: string | null): void;
  /** While set, every transport request answers 401, as to a credential
   * the host no longer accepts for Git. */
  unauthorizeTransport(on: boolean): void;
  /** Delay every transport response by this long; 0 stops delaying. */
  sleepTransport(ms: number): void;
  /** Delay every answer to a listing of spex repositories by this long,
   * the listing taken as the request arrives — a read begun before a
   * change answering after it; 0 stops delaying. */
  sleepListing(ms: number): void;
  /** Answer the next `count` admitted host requests 429 with `Retry-After`. */
  rateLimit(count: number, retryAfter: string): void;
  /** Answer the next `count` admitted host requests 503 `provider_unavailable`. */
  unavailable(count: number): void;
  /** Answer the next `count` admitted host requests 403 `host_refused`
   * with these words. */
  refuseHost(count: number, message: string): void;
}

export interface StandinHost {
  /** The stand-in's origin, e.g. `http://127.0.0.1:41234`. */
  url: string;
  /** `<url>/git`: the origin its credential is valid for. */
  gitOrigin: string;
  /** The directory of bare repositories. */
  dir: string;
  script: StandinScript;
  close(): Promise<void>;
}

const PUSH_ROLES = new Set(["Developer", "Maintainer", "Owner"]);
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const CODE_TTL_MS = 10 * 60_000;
const POLL_TOLERANCE_MS = 50;
const PAGE_SIZE = 2;
/** A project path the Git host accepts — letters, digits, `_`, `-` and
 * `.`, never starting with `-` — ending in `-spex`. */
const SPEX_NAME = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*-spex$/;

interface Device {
  id: string;
  label: string;
  revoked: boolean;
  access: string;
  accessExpiresAt: number;
  refresh: string;
  spent: Set<string>;
}

interface AuthCode { label: string; redirectUri: string; challenge: string; used: boolean; expiresAt: number }

interface DeviceCode {
  userCode: string;
  label: string;
  status: "pending" | "approved" | "denied";
  issuedAt: number;
  lastPoll: number;
  expiresAt: number;
  consumed: boolean;
}

interface HeldSignIn { redirectUri: string; state: string; challenge: string; label: string }

/** Git run by the stand-in itself: isolated from the person's config. */
function gitEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Stand-in Host",
    GIT_AUTHOR_EMAIL: "host@standin.test",
    GIT_COMMITTER_NAME: "Stand-in Host",
    GIT_COMMITTER_EMAIL: "host@standin.test",
    LC_ALL: "C",
  };
}

function gitSync(args: string[], input?: string): string {
  return execFileSync("git", args, { encoding: "utf8", env: gitEnv(), input, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function gitAsync(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolveRun) => {
    execFile("git", args, { encoding: "utf8", env: gitEnv(), maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      const code = error ? (typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 1) : 0;
      resolveRun({ code, stdout });
    });
  });
}

/** A bare repository with `http.receivepack` on and, unless empty, the
 * host's README on `main`; a seeded `project.json` on an orphan `spex`. */
function initBare(bare: string, options: { name: string; empty: boolean; project?: Record<string, unknown> }): void {
  mkdirSync(dirname(bare), { recursive: true });
  gitSync(["init", "-q", "--bare", "-b", "main", bare]);
  gitSync(["-C", bare, "config", "http.receivepack", "true"]);
  if (!options.empty) commitFile(bare, "refs/heads/main", "README.md", `# ${options.name}\n`, "Initial commit");
  if (options.project) commitFile(bare, "refs/heads/spex", "project.json", `${JSON.stringify(options.project, null, 2)}\n`, "Records");
}

function commitFile(bare: string, ref: string, name: string, content: string, message: string): void {
  const blob = gitSync(["-C", bare, "hash-object", "-w", "--stdin"], content);
  const tree = gitSync(["-C", bare, "mktree"], `100644 blob ${blob}\t${name}\n`);
  const commit = gitSync(["-C", bare, "commit-tree", tree, "-m", message]);
  gitSync(["-C", bare, "update-ref", ref, commit]);
}

function secret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function userCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    if (i === 4) code += "-";
    code += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  }
  return code;
}

function normalizeUserCode(code: string): string {
  return code.toUpperCase().replace(/-/g, "");
}

/** Whether two paths name one entry on disk. */
function sameEntry(a: string, b: string): boolean {
  try {
    const first = lstatSync(a);
    const second = lstatSync(b);
    return first.dev === second.dev && first.ino === second.ino;
  } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c);
}

function html(res: ServerResponse, status: number, title: string, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`);
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function envelope(res: ServerResponse, status: number, code: string, message: string, headers: Record<string, string> = {}): void {
  json(res, status, { error: { code, message } }, headers);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return JSON.parse(await readBody(req));
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Start the stand-in. `registry` names a stand-in registry
 * (environments-18) whose routes — `/api/v1/packages…` and
 * `/api/v1/search` — the stand-in forwards, as spex.pub serves the
 * registry beside the host at one origin (DR-104): a journey then signs
 * in here and publishes and installs here (playbook-library-95).
 */
export async function startStandinHost(opts: { dir: string; displayName?: string; registry?: string }): Promise<StandinHost> {
  const dir = opts.dir;
  mkdirSync(dir, { recursive: true });
  const displayName = opts.displayName ?? "Stand-in Git host";
  const server = createServer();
  const children = new Set<ChildProcess>();

  const devices = new Map<string, Device>();
  const authCodes = new Map<string, AuthCode>();
  const deviceCodes = new Map<string, DeviceCode>();
  const held: HeldSignIn[] = [];
  let nextId = 3001;
  let createRefusal: string | null = null;
  let createdMembers: StandinMember[] = [];
  let branchRefusal: string | null = null;
  let transportRefusal: string | null = null;
  let transportUnauthorized = false;
  let transportSleepMs = 0;
  let listingSleepMs = 0;
  const hostFaults: ({ kind: "rate"; retryAfter: string } | { kind: "unavailable" } | { kind: "refused"; message: string })[] = [];

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const gitOrigin = `${url}/git`;

  const groupUrl = (group: StandinGroup): string => `${url}/${group.fullPath}`;
  const webUrl = (repo: StandinRepository): string => `${url}/${repo.group.fullPath}/${repo.path}`;
  const remoteUrl = (repo: StandinRepository): string => `${gitOrigin}/${repo.group.fullPath}/${repo.path}.git`;
  const bareFor = (group: StandinGroup, path: string): string => join(dir, ...group.fullPath.split("/"), `${path}.git`);
  const own = (): StandinGroup => script.groups.find((g) => g.kind === "user") ?? script.groups[0];
  const findGroup = (key: string): StandinGroup => {
    const group = script.groups.find((g) => g.fullPath === key || g.id === key);
    if (!group) throw new Error(`stand-in: no group ${key}`);
    return group;
  };
  const findRepository = (id: string): StandinRepository => {
    const repo = script.repositories.find((r) => r.id === id);
    if (!repo) throw new Error(`stand-in: no repository ${id}`);
    return repo;
  };
  const visible = (id: string): StandinRepository | undefined => script.repositories.find((r) => r.id === id && r.listed && r.path.endsWith("-spex"));

  const groupWire = (group: StandinGroup) => ({ id: group.id, full_path: group.fullPath, name: group.name, url: groupUrl(group), kind: group.kind });

  async function branches(bare: string): Promise<Set<string>> {
    const run = await gitAsync(["-C", bare, "for-each-ref", "--format=%(refname:short)", "refs/heads/"]);
    return new Set(run.code === 0 ? run.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : []);
  }

  async function projectOf(bare: string): Promise<Record<string, unknown> | null> {
    const run = await gitAsync(["-C", bare, "show", "spex:project.json"]);
    if (run.code !== 0) return null;
    try {
      const parsed: unknown = JSON.parse(run.stdout);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function repositoryWire(repo: StandinRepository): Promise<Record<string, unknown>> {
    const heads = await branches(repo.bare);
    const spex = heads.has("spex");
    return {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      group: groupWire(repo.group),
      remote_url: remoteUrl(repo),
      web_url: webUrl(repo),
      visibility: repo.visibility,
      archived: repo.archived,
      empty: !heads.has("main"),
      lfs: repo.lfs,
      spex_branch: spex,
      project: spex ? await projectOf(repo.bare) : null,
    };
  }

  const mayPush = (repo: StandinRepository): boolean => PUSH_ROLES.has(repo.role);

  async function detailWire(repo: StandinRepository): Promise<Record<string, unknown>> {
    const base = await repositoryWire(repo);
    const present = base.spex_branch === true;
    const readOnly = repo.archived
      ? { reason: "archived", message: "This project is archived and its repository is read-only." }
      : mayPush(repo) ? null : { reason: "access", message: `You have the ${repo.role} role, which may not push to this project.` };
    return {
      ...base,
      read_only: readOnly,
      branch: {
        present,
        can_push: present ? !repo.archived && mayPush(repo) : null,
        protected: present ? false : null,
        blocked: repo.blocked,
      },
    };
  }

  /** Relay one registry request to the stand-in registry, headers and
   * body as they came, its answer as it went. */
  async function forwardToRegistry(req: IncomingMessage, res: ServerResponse, method: string, target: URL, registry: string): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers: Record<string, string> = {};
    for (const name of ["authorization", "content-type", "accept"]) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const answer = await fetch(new URL(`${target.pathname}${target.search}`, registry), {
      method,
      headers,
      ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
    });
    res.writeHead(answer.status, {
      "content-type": answer.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(Buffer.from(await answer.arrayBuffer()));
  }

  // ---- tokens -------------------------------------------------------------

  function issue(label: string): { access: string; refresh: string; device: Device } {
    const device: Device = {
      id: randomBytes(8).toString("hex"),
      label,
      revoked: false,
      access: secret("spexa_"),
      accessExpiresAt: Date.now() + script.accessTtlMs,
      refresh: secret("spexr_"),
      spent: new Set(),
    };
    devices.set(device.id, device);
    return { access: device.access, refresh: device.refresh, device };
  }

  function tokenBody(device: Device): Record<string, unknown> {
    return {
      access_token: device.access,
      token_type: "bearer",
      expires_in: Math.max(1, Math.round((device.accessExpiresAt - Date.now()) / 1000)),
      refresh_token: device.refresh,
    };
  }

  /** The device a bearer access secret names, or the 401 code it earns. */
  function bearerDevice(token: string | null): { device: Device } | { code: string; message: string } {
    if (token === null) return { code: "unauthenticated", message: "Sign in to continue." };
    if (!/^spexa_[A-Za-z0-9_-]{43}$/.test(token)) return { code: "invalid_token", message: "The token is malformed." };
    for (const device of devices.values()) {
      if (device.access !== token) continue;
      if (device.revoked) return { code: "token_revoked", message: "This device was signed out." };
      if (device.accessExpiresAt <= Date.now()) return { code: "token_expired", message: "The access token expired." };
      return { device };
    }
    return { code: "invalid_token", message: "The token is not known." };
  }

  function bearerOf(req: IncomingMessage): string | null {
    const header = req.headers.authorization;
    if (typeof header !== "string") return null;
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    return match ? match[1] : null;
  }

  // ---- the script -----------------------------------------------------------

  const script: StandinScript = {
    person: { id: "1001", login: "ada", displayName: "Ada Lovelace" },
    groups: [
      { id: "2001", fullPath: "ada", name: "ada", kind: "user" },
      { id: "2002", fullPath: "acme", name: "Acme", kind: "group" },
      { id: "2003", fullPath: "acme/research", name: "Research", kind: "group" },
    ],
    repositories: [],
    browser: "approve",
    deviceInterval: 1,
    devicePollFloor: null,
    deviceExpiresIn: 600,
    accessTtlMs: 3_600_000,
    refuseRefresh: false,
    requests: [],
    tokenGrants: [],
    heldSignIns: () => held.length,
    approveHeld: async () => {
      const request = held.shift();
      if (!request) throw new Error("stand-in: no held sign-in");
      const code = secret("");
      authCodes.set(code, { label: request.label, redirectUri: request.redirectUri, challenge: request.challenge, used: false, expiresAt: Date.now() + CODE_TTL_MS });
      return deliver(request.redirectUri, { code, state: request.state });
    },
    denyHeld: async () => {
      const request = held.shift();
      if (!request) throw new Error("stand-in: no held sign-in");
      return deliver(request.redirectUri, { error: "access_denied", state: request.state });
    },
    approveDevice: (code) => decideDevice(code, "approved"),
    denyDevice: (code) => decideDevice(code, "denied"),
    pendingDevices: () => [...deviceCodes.values()].filter((d) => d.status === "pending" && d.expiresAt > Date.now()).map((d) => d.userCode),
    expireAccess: () => {
      for (const device of devices.values()) device.accessExpiresAt = Date.now() - 1;
    },
    revokeDevices: () => {
      for (const device of devices.values()) device.revoked = true;
    },
    liveDevices: () => [...devices.values()].filter((d) => !d.revoked).length,
    addRepository: (input) => {
      const group = findGroup(input.group);
      const bare = bareFor(group, input.name);
      if (existsSync(bare)) throw new Error(`stand-in: ${group.fullPath}/${input.name} exists`);
      initBare(bare, { name: input.name, empty: input.empty === true, project: input.project });
      const repo: StandinRepository = {
        id: String(nextId++),
        name: input.name,
        path: input.name,
        group,
        description: input.description ?? "",
        visibility: input.visibility ?? "private",
        archived: input.archived === true,
        lfs: true,
        role: input.role ?? "Owner",
        members: input.members ?? [],
        listed: true,
        blocked: false,
        bare,
      };
      script.repositories.push(repo);
      return repo;
    },
    rename: (id, change) => {
      const repo = findRepository(id);
      const group = change.group === undefined ? repo.group : findGroup(change.group);
      const path = change.name ?? repo.path;
      const bare = bareFor(group, path);
      if (bare !== repo.bare) {
        // A spelling differing only by case names the same bare
        // repository on a case-insensitive filesystem: no collision.
        if (existsSync(bare) && !sameEntry(bare, repo.bare)) throw new Error(`stand-in: ${group.fullPath}/${path} exists`);
        mkdirSync(dirname(bare), { recursive: true });
        renameSync(repo.bare, bare);
      }
      if (repo.name === repo.path) repo.name = path;
      repo.path = path;
      repo.group = group;
      repo.bare = bare;
    },
    archive: (id) => { findRepository(id).archived = true; },
    removeMember: (id) => { findRepository(id).listed = false; },
    accessLevel: (id, role) => { findRepository(id).role = role; },
    refuseCreate: (message) => { createRefusal = message; },
    createMembers: (members) => { createdMembers = members.map((member) => ({ ...member })); },
    refuseBranch: (message) => { branchRefusal = message; },
    refuseTransport: (message) => { transportRefusal = message; },
    unauthorizeTransport: (on) => { transportUnauthorized = on; },
    sleepTransport: (ms) => { transportSleepMs = Math.max(0, ms); },
    sleepListing: (ms) => { listingSleepMs = Math.max(0, ms); },
    rateLimit: (count, retryAfter) => {
      for (let i = 0; i < count; i += 1) hostFaults.push({ kind: "rate", retryAfter });
    },
    unavailable: (count) => {
      for (let i = 0; i < count; i += 1) hostFaults.push({ kind: "unavailable" });
    },
    refuseHost: (count, message) => {
      for (let i = 0; i < count; i += 1) hostFaults.push({ kind: "refused", message });
    },
  };

  function decideDevice(code: string, status: "approved" | "denied"): void {
    const wanted = normalizeUserCode(code);
    for (const entry of deviceCodes.values()) {
      if (normalizeUserCode(entry.userCode) !== wanted) continue;
      if (entry.status !== "pending") throw new Error(`stand-in: ${code} is ${entry.status}`);
      entry.status = status;
      return;
    }
    throw new Error(`stand-in: no device code ${code}`);
  }

  async function deliver(redirectUri: string, params: Record<string, string>): Promise<{ status: number; body: string }> {
    const target = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    const response = await fetch(target, { redirect: "manual" });
    return { status: response.status, body: await response.text() };
  }

  // ---- routes ---------------------------------------------------------------

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const target = new URL(req.url ?? "/", url);
    const method = req.method ?? "GET";
    script.requests.push({ method, path: target.pathname, query: target.search, authorization: typeof req.headers.authorization === "string", at: performance.now() });
    const path = target.pathname;

    if (path === "/git" || path.startsWith("/git/")) return transport(req, res, target);
    if (path === "/login/app" && method === "GET") return loginApp(res, target.searchParams);
    if (path === "/login/device") return loginDevice(req, res, target.searchParams);
    if (path === "/api/v1/auth/device" && method === "POST") return deviceStart(req, res);
    if (path === "/api/v1/auth/token" && method === "POST") return token(req, res);
    if (path === "/api/v1/auth/revoke" && method === "POST") return revoke(req, res);
    if (path === "/api/v1/host" && method === "GET") return json(res, 200, { display_name: displayName, git_origin: gitOrigin });
    if (path.startsWith("/api/v1/host/")) return hostRoute(req, res, method, path, target);
    if (opts.registry && (path === "/api/v1/search" || path === "/api/v1/packages" || path.startsWith("/api/v1/packages/"))) {
      return forwardToRegistry(req, res, method, target, opts.registry);
    }
    return envelope(res, 404, "not_found", "Nothing is here.");
  }

  function loginApp(res: ServerResponse, query: URLSearchParams): void {
    const clientId = query.get("client_id");
    if (clientId !== "spex") return html(res, 400, "Unknown client", `<p>The client ${escapeHtml(clientId ?? "")} is not known.</p>`);
    const redirectUri = query.get("redirect_uri") ?? "";
    let loopback = false;
    try {
      const parsed = new URL(redirectUri);
      loopback = parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    } catch {
      loopback = false;
    }
    if (!loopback) return html(res, 400, "Bad request", "<p>The redirect must be a loopback address.</p>");
    const challenge = query.get("code_challenge") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || query.get("code_challenge_method") !== "S256") {
      return html(res, 400, "Bad request", "<p>An S256 code challenge is required.</p>");
    }
    const label = query.get("label") ?? "";
    const state = query.get("state") ?? "";
    if (label.length === 0 || label.length > 80) return html(res, 400, "Bad request", "<p>A label of at most 80 characters is required.</p>");
    if (state.length === 0) return html(res, 400, "Bad request", "<p>A state is required.</p>");
    if (script.browser === "hold") {
      held.push({ redirectUri, state, challenge, label });
      return html(res, 200, `Sign in Spex on ${label}?`, "<p>Waiting for approval.</p>");
    }
    const back = new URL(redirectUri);
    if (script.browser === "deny") {
      back.searchParams.set("error", "access_denied");
    } else {
      const code = secret("");
      authCodes.set(code, { label, redirectUri, challenge, used: false, expiresAt: Date.now() + CODE_TTL_MS });
      back.searchParams.set("code", code);
    }
    back.searchParams.set("state", state);
    res.writeHead(302, { location: back.toString(), "cache-control": "no-store" });
    res.end();
  }

  async function loginDevice(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
    const form = (code: string, note: string) => `<p>${escapeHtml(note)}</p><form method="post" action="/login/device"><label>Code <input name="user_code" value="${escapeHtml(code)}"></label><button name="decision" value="approve">Approve</button><button name="decision" value="deny">Deny</button></form>`;
    if (req.method === "GET") return html(res, 200, "Sign in a device", form(query.get("user_code") ?? "", "A program outside this browser is being signed in."));
    if (req.method !== "POST") return html(res, 405, "Not allowed", "");
    const fields = new URLSearchParams(await readBody(req));
    const code = fields.get("user_code") ?? "";
    const decision = fields.get("decision");
    const entry = [...deviceCodes.values()].find((d) => normalizeUserCode(d.userCode) === normalizeUserCode(code));
    if (!entry || entry.status !== "pending" || entry.expiresAt <= Date.now()) return html(res, 200, "Sign in a device", form(code, "That code is unknown, expired or already used."));
    if (decision === "approve" || decision === "deny") {
      entry.status = decision === "approve" ? "approved" : "denied";
      return html(res, 200, decision === "approve" ? "Approved" : "Denied", "<p>You may return to Spex.</p>");
    }
    return html(res, 200, `Sign in Spex on ${entry.label}?`, form(code, "Approve or deny."));
  }

  async function deviceStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    if (!isRecord(body)) return envelope(res, 400, "invalid_request", "The body must be a JSON object.");
    if (body.client_id !== "spex") return envelope(res, 400, "invalid_client", "The client is not known.");
    if (typeof body.label !== "string" || body.label.length === 0 || body.label.length > 80) return envelope(res, 400, "invalid_request", "A label of at most 80 characters is required.");
    const deviceCode = secret("");
    const code = userCode();
    const now = performance.now();
    deviceCodes.set(deviceCode, {
      userCode: code,
      label: body.label,
      status: "pending",
      issuedAt: now,
      lastPoll: now,
      expiresAt: Date.now() + script.deviceExpiresIn * 1000,
      consumed: false,
    });
    const verification = `${url}/login/device`;
    json(res, 200, {
      device_code: deviceCode,
      user_code: code,
      verification_uri: verification,
      verification_uri_complete: `${verification}?user_code=${encodeURIComponent(code)}`,
      expires_in: script.deviceExpiresIn,
      interval: script.deviceInterval,
    });
  }

  async function token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    const grantType = isRecord(body) && typeof body.grant_type === "string" ? body.grant_type : "";
    const refuse = (code: string, message: string): void => {
      script.tokenGrants.push({ grantType, ok: false, error: code });
      envelope(res, 400, code, message);
    };
    const grant = (device: Device): void => {
      script.tokenGrants.push({ grantType, ok: true, error: null });
      json(res, 200, tokenBody(device));
    };
    if (!isRecord(body) || grantType === "") return refuse("invalid_request", "The body must be a JSON object naming grant_type.");
    if (!["authorization_code", "urn:ietf:params:oauth:grant-type:device_code", "refresh_token"].includes(grantType)) {
      return refuse("unsupported_grant_type", "The grant type is not supported.");
    }
    if (body.client_id !== "spex") return refuse("invalid_client", "The client is not known.");

    if (grantType === "authorization_code") {
      const { code, code_verifier: verifier, redirect_uri: redirectUri } = body;
      if (typeof code !== "string" || typeof verifier !== "string" || typeof redirectUri !== "string") return refuse("invalid_request", "A field is missing.");
      const entry = authCodes.get(code);
      if (!entry || entry.used || entry.expiresAt <= Date.now() || entry.redirectUri !== redirectUri) return refuse("invalid_grant", "The authorization code is not valid.");
      const hash = createHash("sha256").update(verifier).digest("base64url");
      if (hash !== entry.challenge) return refuse("invalid_grant", "The code verifier does not match.");
      entry.used = true;
      return grant(issue(entry.label).device);
    }

    if (grantType === "refresh_token") {
      const refresh = body.refresh_token;
      if (typeof refresh !== "string") return refuse("invalid_request", "A field is missing.");
      for (const device of devices.values()) {
        if (device.spent.has(refresh)) {
          device.revoked = true;
          return refuse("invalid_grant", "A spent refresh token was presented; the device is signed out.");
        }
        if (device.refresh !== refresh) continue;
        if (device.revoked) return refuse("invalid_grant", "This device was signed out.");
        if (script.refuseRefresh) return refuse("invalid_grant", "The refresh was refused.");
        device.spent.add(device.refresh);
        device.refresh = secret("spexr_");
        device.access = secret("spexa_");
        device.accessExpiresAt = Date.now() + script.accessTtlMs;
        return grant(device);
      }
      return refuse("invalid_grant", "The refresh token is not known.");
    }

    const deviceCode = body.device_code;
    if (typeof deviceCode !== "string") return refuse("invalid_request", "A field is missing.");
    const entry = deviceCodes.get(deviceCode);
    if (!entry || entry.consumed) return refuse("invalid_grant", "The device code is not valid.");
    if (entry.expiresAt <= Date.now()) return refuse("expired_token", "The device code expired.");
    if (entry.status === "denied") return refuse("access_denied", "The sign-in was denied.");
    const now = performance.now();
    const floorMs = (script.devicePollFloor ?? script.deviceInterval) * 1000;
    const tooSoon = now - entry.lastPoll < floorMs - POLL_TOLERANCE_MS;
    entry.lastPoll = now;
    if (tooSoon) return refuse("slow_down", "Polling too fast.");
    if (entry.status === "pending") return refuse("authorization_pending", "The sign-in is not approved yet.");
    entry.consumed = true;
    return grant(issue(entry.label).device);
  }

  function revoke(req: IncomingMessage, res: ServerResponse): void {
    const token = bearerOf(req);
    if (token !== null) {
      for (const device of devices.values()) {
        if (device.access === token && device.revoked) {
          res.writeHead(204, { "cache-control": "no-store" }).end();
          return;
        }
      }
    }
    const found = bearerDevice(token);
    if ("code" in found) return envelope(res, 401, found.code, found.message);
    found.device.revoked = true;
    res.writeHead(204, { "cache-control": "no-store" }).end();
  }

  async function hostRoute(req: IncomingMessage, res: ServerResponse, method: string, path: string, target: URL): Promise<void> {
    const found = bearerDevice(bearerOf(req));
    if ("code" in found) return envelope(res, 401, found.code, found.message);
    const fault = hostFaults.shift();
    if (fault?.kind === "rate") return envelope(res, 429, "rate_limited", "Too many requests to the Git host.", { "retry-after": fault.retryAfter });
    if (fault?.kind === "unavailable") return envelope(res, 503, "provider_unavailable", "The Git host did not answer.");
    if (fault?.kind === "refused") return envelope(res, 403, "host_refused", fault.message);

    if (path === "/api/v1/host/me" && method === "GET") {
      return json(res, 200, { id: script.person.id, login: script.person.login, display_name: script.person.displayName, profile_url: `${url}/${script.person.login}` });
    }
    if (path === "/api/v1/host/groups" && method === "GET") return json(res, 200, { groups: script.groups.map(groupWire) });
    if (path === "/api/v1/host/credential" && method === "POST") {
      const body = await readJson(req);
      if (!isRecord(body) || typeof body.origin !== "string" || body.origin !== gitOrigin) return envelope(res, 400, "bad_request", "The origin is not this host's Git origin.");
      return json(res, 200, { username: "oauth2", secret: found.device.access, expires_at: new Date(found.device.accessExpiresAt).toISOString() });
    }
    if (path === "/api/v1/host/repositories" && method === "GET") {
      const cursor = target.searchParams.get("cursor");
      let offset = 0;
      if (cursor !== null) {
        const match = /^o(\d+)$/.exec(cursor);
        if (!match) return envelope(res, 400, "bad_request", "The cursor is malformed.");
        offset = Number(match[1]);
      }
      const all = script.repositories.filter((r) => r.listed && r.path.endsWith("-spex"));
      const page = all.slice(offset, offset + PAGE_SIZE);
      const next = offset + PAGE_SIZE < all.length ? `o${offset + PAGE_SIZE}` : null;
      const repositories = await Promise.all(page.map(repositoryWire));
      if (listingSleepMs > 0) await sleep(listingSleepMs);
      return json(res, 200, { repositories, next_cursor: next });
    }
    if (path === "/api/v1/host/repositories" && method === "POST") return create(req, res);
    const match = /^\/api\/v1\/host\/repositories\/([^/]+)(\/members|\/spex-branch)?$/.exec(path);
    if (match) {
      const repo = visible(decodeURIComponent(match[1]));
      if (!repo) return envelope(res, 404, "not_found", "The repository is not shared with this account.");
      if (match[2] === undefined && method === "GET") return json(res, 200, await detailWire(repo));
      if (match[2] === "/members" && method === "GET") {
        const members = [
          { id: script.person.id, login: script.person.login, display_name: script.person.displayName, role: repo.role, url: `${url}/${script.person.login}` },
          ...repo.members.map((m) => ({ id: m.id, login: m.login, display_name: m.displayName, role: m.role, url: `${url}/${m.login}` })),
        ];
        return json(res, 200, { members, members_url: `${webUrl(repo)}/-/project_members` });
      }
      if (match[2] === "/spex-branch" && method === "POST") {
        if (branchRefusal !== null) return json(res, 202, { status: "pending", message: branchRefusal });
        repo.blocked = false;
        return json(res, 200, { status: "ready" });
      }
    }
    return envelope(res, 404, "not_found", "Nothing is here.");
  }

  async function create(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    if (!isRecord(body)) return envelope(res, 400, "bad_request", "The body must be a JSON object.");
    const { group_id: groupId, name, description } = body;
    if (typeof name !== "string" || !SPEX_NAME.test(name)) return envelope(res, 400, "bad_request", "The name must be a project path ending in -spex.");
    if (groupId !== null && typeof groupId !== "string") return envelope(res, 400, "bad_request", "The group_id must be a string or null.");
    if (typeof description !== "string") return envelope(res, 400, "bad_request", "The description must be a string.");
    const group = groupId === null ? own() : script.groups.find((g) => g.id === groupId);
    if (!group) return envelope(res, 404, "not_found", "The group is not known.");
    if (createRefusal !== null) return json(res, 202, { status: "pending", message: createRefusal });
    const bare = bareFor(group, name);
    if (existsSync(bare) || script.repositories.some((r) => r.group.fullPath === group.fullPath && r.path === name)) {
      return envelope(res, 409, "name_taken", "A repository of that name exists in the group.");
    }
    initBare(bare, { name, empty: false });
    const repo: StandinRepository = {
      id: String(nextId++),
      name,
      path: name,
      group,
      description,
      visibility: "private",
      archived: false,
      lfs: true,
      role: "Owner",
      members: createdMembers.map((member) => ({ ...member })),
      listed: true,
      blocked: false,
      bare,
    };
    script.repositories.push(repo);
    json(res, 201, { status: "created", repository: await repositoryWire(repo) });
  }

  // ---- Git transport --------------------------------------------------------

  function basicToken(req: IncomingMessage): string | null {
    const header = req.headers.authorization;
    if (typeof header !== "string") return null;
    const match = /^Basic\s+(\S+)$/i.exec(header);
    if (!match) return null;
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 0 || decoded.slice(0, colon) !== "oauth2") return null;
    return decoded.slice(colon + 1);
  }

  async function transport(req: IncomingMessage, res: ServerResponse, target: URL): Promise<void> {
    if (transportSleepMs > 0) await sleep(transportSleepMs);
    const found = bearerDevice(basicToken(req));
    if ("code" in found || transportUnauthorized) {
      res.writeHead(401, { "www-authenticate": "Basic realm=\"Stand-in Git host\"", "content-type": "text/plain; charset=utf-8" });
      res.end("HTTP Basic: Access denied.\n");
      return;
    }
    if (transportRefusal !== null) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(`${transportRefusal}\n`);
      return;
    }
    const pathInfo = target.pathname.slice("/git".length);
    const repo = script.repositories.find((r) => r.listed && pathInfo.startsWith(`/${r.group.fullPath}/${r.path}.git/`));
    if (!repo) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("The project you were looking for could not be found.\n");
      return;
    }
    const receive = target.searchParams.get("service") === "git-receive-pack" || pathInfo.endsWith("/git-receive-pack");
    if (receive && (repo.archived || !mayPush(repo))) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(repo.archived ? "You are not allowed to push code to an archived project.\n" : "You are not allowed to push code to this project.\n");
      return;
    }
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return typeof value === "string" ? value : undefined;
    };
    const env: NodeJS.ProcessEnv = {
      ...gitEnv(),
      GIT_PROJECT_ROOT: dir,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: pathInfo,
      REQUEST_METHOD: req.method ?? "GET",
      QUERY_STRING: target.search.slice(1),
      CONTENT_TYPE: header("content-type") ?? "",
      REMOTE_USER: "oauth2",
      REMOTE_ADDR: "127.0.0.1",
      ...(header("content-length") !== undefined ? { CONTENT_LENGTH: header("content-length") } : {}),
      ...(header("git-protocol") !== undefined ? { GIT_PROTOCOL: header("git-protocol") } : {}),
      ...(header("content-encoding") !== undefined ? { HTTP_CONTENT_ENCODING: header("content-encoding") } : {}),
    };
    const child = spawn("git", ["http-backend"], { env, stdio: ["pipe", "pipe", "pipe"] });
    children.add(child);
    child.on("close", () => children.delete(child));
    child.stdin.on("error", () => undefined);
    child.stderr.resume();
    req.pipe(child.stdin);
    res.on("close", () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    });

    await new Promise<void>((resolveRelay) => {
      let head = Buffer.alloc(0);
      let headersDone = false;
      child.stdout.on("data", (chunk: Buffer) => {
        if (headersDone) {
          res.write(chunk);
          return;
        }
        head = Buffer.concat([head, chunk]);
        let end = head.indexOf("\r\n\r\n");
        let skip = 4;
        if (end < 0) {
          end = head.indexOf("\n\n");
          skip = 2;
        }
        if (end < 0) return;
        headersDone = true;
        let status = 200;
        const headers: Record<string, string> = {};
        for (const line of head.subarray(0, end).toString("latin1").split(/\r?\n/)) {
          const colon = line.indexOf(":");
          if (colon < 0) continue;
          const name = line.slice(0, colon).trim();
          const value = line.slice(colon + 1).trim();
          if (name.toLowerCase() === "status") status = Number.parseInt(value, 10) || 200;
          else headers[name] = value;
        }
        res.writeHead(status, headers);
        const rest = head.subarray(end + skip);
        if (rest.length > 0) res.write(rest);
      });
      child.on("close", () => {
        if (!headersDone && !res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        }
        res.end();
        resolveRelay();
      });
      child.on("error", () => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end();
        resolveRelay();
      });
    });
  }

  server.on("request", (req: IncomingMessage, res: ServerResponse) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) envelope(res, 500, "internal", "The stand-in failed.");
      else res.destroy();
    });
  });

  return {
    url,
    gitOrigin,
    dir,
    script,
    close: async () => {
      for (const child of children) child.kill("SIGKILL");
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    },
  };
}
