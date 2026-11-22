// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A loopback stand-in for Space sign-in, repository discovery and Git
// transport (git-host-12). Tests script OAuth and transport behavior
// against bare repositories served by Git's own HTTP backend. Multiple
// instances can share one backend while retaining their own accounts,
// visibility, credentials and rate limits. Seeded groups represent
// repositories outside a personal namespace.

import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

import { RELAY_HEADERS } from "@sublang/spex/testing";

export interface StandinPerson { id: string; login: string; displayName: string | null }
export interface StandinDeviceRequest { label: string }

export interface StandinGroup {
  id: string;
  /** The path in the instance; an account's login for its own group. */
  fullPath: string;
  name: string;
  kind: "user" | "group";
  /** Seeded membership metadata for a fixture's namespace. */
  members?: StandinMember[];
}

/** A member by the Git host's own role name (e.g. "Developer"). */
export interface StandinMember { id: string; login: string; displayName: string | null; role: string }

/** One of the stand-in's roles (host-1): `id` a client sends back,
 * `name` the Git host's role name, and whether it may push. */
export interface StandinRole { id: string; name: string; mayPush: boolean }

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

/** A transport request whose credential the Git transport accepted
 * (git-host-12, DR-127): the instance that issued that credential. */
export interface StandinTransportCredential {
  /** The issuing instance's origin, e.g. `http://127.0.0.1:41234`. */
  instance: string;
  method: string;
  /** The path without its query, under the Git origin's. */
  path: string;
  /** Whether the request belongs to a push. */
  push: boolean;
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
  /** The roles the host grants, least first (host-1); a member's role
   * and whether it may push are read by `name`. */
  roles: StandinRole[];
  /** The accounts the host knows besides the person, found by login
   * when a member is added or removed (host-27, host-28); a repository
   * may stand in one's own group, by its login. */
  accounts: StandinPerson[];
  /** The person's own group (kind `user`) first; another account's own
   * group is never listed here. */
  groups: StandinGroup[];
  /** The repositories this instance lists, as a fresh list each read:
   * those in its groups and those in every account's namespace — over a
   * shared Git backend the same objects, under the same ids, at both
   * instances (DR-127). */
  readonly repositories: readonly StandinRepository[];
  /** Every transport request whose credential the Git transport accepted,
   * in arrival order, with the instance that issued it; one list for the
   * instances over one Git backend (DR-127). */
  transportCredentials: StandinTransportCredential[];
  /** Hold an authenticated LFS download at its arrival, for Stop tests. */
  beforeLfsDownload?: (oid: string) => Promise<void>;
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
  deviceRequests: StandinDeviceRequest[];
  /** Every `POST /api/v1/host/repositories` body admitted, as it came,
   * in order (host-6). */
  creations: unknown[];
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
  /** Every device code this instance minted, a secret no output names. */
  deviceCodes(): string[];
  /** Expire every device's access secret now. */
  expireAccess(): void;
  /** Revoke every device. */
  revokeDevices(): void;
  /** The number of devices neither revoked nor expired. */
  liveDevices(): number;
  addRepository(input: {
    /** A group's full path or id, or another account's login. */
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
  /** Omit a backing repository from this Space's list and detail answers. */
  hideRepository(id: string): void;
  /** Rename or transfer a repository: its bare repository moves and its
   * `path` and `remote_url` change; its id stays. */
  rename(id: string, change: { name?: string; group?: string }): void;
  /** Archive a repository, or unarchive it with `false`. Over another
   * instance's Git backend, only what this instance answers changes: the
   * Git system's own state, which the transport follows, is the first
   * instance's to script (DR-127). */
  archive(id: string, archived?: boolean): void;
  /** Remove the person from a repository's members. */
  removeMember(id: string): void;
  /** Set the person's role on a repository; over another instance's Git
   * backend, in this instance's answers alone, as `archive`. */
  accessLevel(id: string, role: string): void;
  /** While set, creation answers 202 pending with these words. */
  refuseCreate(message: string | null): void;
  /** While set, a repository the stand-in creates holds no README on
   * `main` — empty, with no default branch — for its first `reads` reads
   * of it, its creation's answer among them, as a host answers a
   * creation before its initial commit lands; the read after them
   * commits it, and Infinity never does. Clearing it commits every
   * README held; a push into the repository ends its hold. */
  holdInitialization(reads: number | null): void;
  /** While set, a push to `main` is refused by the host's receive check
   * with these words, as a protected default branch refuses a member
   * who may not push there; every other branch is received. */
  refuseDefaultBranch(message: string | null): void;
  /** While set, branch preparation answers 202 pending with these words. */
  refuseBranch(message: string | null): void;
  /** While set, every transport request answers 403 with these words. */
  refuseTransport(message: string | null): void;
  /** While set, every transport request — or, with `push`, every one of
   * a push — answers this HTTP status with a body of no meaning, an error
   * no rule reads. */
  failTransport(status: number | null, which?: "all" | "push"): void;
  /** While set, the host's receive check refuses every push in these
   * words, which Git prints as `remote:` lines. */
  refusePush(message: string | null): void;
  /** While set, every transport request carrying a credential this
   * instance issued answers 401, as to a credential the host no longer
   * accepts for Git. The transport's other scripting is its Git
   * backend's, shared by the instances over it. */
  unauthorizeTransport(on: boolean): void;
  /** Delay every transport response by this long; 0 stops delaying. */
  sleepTransport(ms: number): void;
  /** Delay every answer to a listing of spex repositories by this long,
   * the listing taken as the request arrives — a read begun before a
   * change answering after it; 0 stops delaying. */
  sleepListing(ms: number): void;
  /** Answer the next `count` admitted host requests 429 with this
   * `Retry-After`, or with none where it is null; with `Infinity`, every
   * one after those already scripted, for the stand-in's life. */
  rateLimit(count: number, retryAfter: string | null): void;
  /** Answer the next `count` admitted host requests 503 `provider_unavailable`. */
  unavailable(count: number): void;
  /** Answer the next `count` admitted host requests 403 `host_refused`
   * with these words. */
  refuseHost(count: number, message: string): void;
}

export interface StandinHost {
  /** The stand-in's origin, e.g. `http://127.0.0.1:41234`. */
  url: string;
  /** The bare repository a key names: its group's path in the instance
   * and its own, as the stand-in answers them. */
  bareOf(key: string): string;
  /** `<url>/git`, or over another instance's Git backend that instance's:
   * the origin its credential is valid for, every repository's remote URL
   * under it. */
  gitOrigin: string;
  /** The directory of bare repositories, shared over one Git backend. */
  dir: string;
  /** The container this instance keeps its groups in on the Git system
   * (DR-120): `STANDIN_STORAGE`, and `standin-storage-<n>` for the n-th
   * instance over one Git backend (DR-127). */
  storage: string;
  script: StandinScript;
  close(): Promise<void>;
}

export interface StandinHostOptions {
  /** The directory of bare repositories; none where `gitBackend` names
   * the instance whose directory this one shares. */
  dir?: string;
  displayName?: string;
  /** The URL of a stand-in registry whose routes this instance relays,
   * naming itself and its verdict on the bearer (environments-18). */
  registry?: string;
  /** The signed-in person; unset, `ada`. */
  person?: StandinPerson;
  /** Run over this instance's Git backend (DR-127): its bare
   * repositories, its transport at its Git origin, which accepts the
   * credentials this instance issues, and the accounts' namespaces, this
   * instance's groups in a container of its own. */
  gitBackend?: StandinHost;
}

/** The group the stand-in keeps every group of the instance in, as a
 * Spex Space deployment keeps its container on its Git system (DR-120): on
 * its Git URLs and its disk alone, never in an answer's path. */
export const STANDIN_STORAGE = "standin-storage";

/** The person every instance signs in unless started with another. */
const DEFAULT_PERSON: StandinPerson = { id: "1001", login: "ada", displayName: "Ada Lovelace" };
/** The accounts a host knows besides the default person. */
const DEFAULT_ACCOUNTS: StandinPerson[] = [
  { id: "1002", login: "bob", displayName: "Bob" },
  { id: "1003", login: "grace", displayName: "Grace Hopper" },
  { id: "1004", login: "alan", displayName: null },
];

/** The roles Spex Space reports for GitLab.com (host-14): those that read
 * a private repository, least first, Developer upward pushing. */
const DEFAULT_ROLES: StandinRole[] = [
  { id: "reporter", name: "Reporter", mayPush: false },
  { id: "developer", name: "Developer", mayPush: true },
  { id: "maintainer", name: "Maintainer", mayPush: true },
  { id: "owner", name: "Owner", mayPush: true },
];
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const CODE_TTL_MS = 10 * 60_000;
const POLL_TOLERANCE_MS = 50;
const PAGE_SIZE = 2;
const SPEX_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*-spex$/;

interface Device {
  scope: "registry" | "space";
  id: string;
  label: string;
  revoked: boolean;
  access: string;
  accessExpiresAt: number;
  refresh: string;
  spent: Set<string>;
}

interface AuthCode { scope?: "registry" | "space"; label: string; redirectUri: string; challenge: string; used: boolean; expiresAt: number }

interface DeviceCode {
  scope?: "registry" | "space";
  userCode: string;
  label: string;
  status: "pending" | "approved" | "denied";
  issuedAt: number;
  lastPoll: number;
  expiresAt: number;
  consumed: boolean;
}

interface HeldSignIn { scope?: "registry" | "space"; redirectUri: string; state: string; challenge: string; label: string }

/** An instance over a Git backend, as its transport sees it. */
interface BackendInstance {
  url: string;
  /** Its container on the Git system. */
  storage: string;
  groups(): StandinGroup[];
  roles(): StandinRole[];
  /** Whether a credential it issued is live. */
  issued(token: string): boolean;
  /** Whether it scripted its credentials refused at the transport. */
  unauthorized(): boolean;
}

/** One Git system behind one stand-in instance or several (DR-127): its
 * directory of bare repositories, its transport at one Git origin, its
 * ids, every repository on it and each account's own group. */
interface GitBackend {
  dir: string;
  gitOrigin: string;
  /** The receive check a refused push runs. */
  hooks: string;
  nextId: number;
  /** Every repository on the Git system, in creation order. */
  repositories: StandinRepository[];
  /** Each account's own group, one object per login. */
  namespaces: Map<string, StandinGroup>;
  /** Created repositories whose README is held, with the reads left. */
  uninitialized: Map<StandinRepository, number>;
  /** The instances over it in start order; the first serves its
   * transport. */
  instances: BackendInstance[];
  transportCredentials: StandinTransportCredential[];
  children: Set<ChildProcess>;
  defaultBranchRefusal: string | null;
  transportRefusal: string | null;
  transportFailure: { status: number; which: "all" | "push" } | null;
  pushRefusal: string | null;
  transportSleepMs: number;
}

const backends = new WeakMap<StandinHost, GitBackend>();



/** A group's path derived from its name as Spex Space derives it (host-26):
 * lower-cased, each run outside letters, digits, `.`, `_` and `-` one
 * `-`, leading and trailing `-` and `.` dropped. */
function groupPath(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
}

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

/** Whether two paths name one file, as two spellings do on a filesystem
 * that folds case. */
function sameFile(a: string, b: string): boolean {
  try {
    const one = statSync(a);
    const two = statSync(b);
    return one.dev === two.dev && one.ino === two.ino;
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

/** A new Git backend over `dir`, its transport to be served at
 * `gitOrigin`. */
function newBackend(dir: string, gitOrigin: string): GitBackend {
  mkdirSync(dir, { recursive: true });
  /** The receive check a refused default branch runs, named to Git by
   * `core.hooksPath` only while that refusal is set. */
  const hooks = join(dir, ".hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "pre-receive"), [
    "#!/bin/sh",
    "while read -r old new ref; do",
    "  if [ -n \"$STANDIN_PUSH_REFUSAL\" ]; then",
    "    printf '%s\\n' \"$STANDIN_PUSH_REFUSAL\" >&2",
    "    exit 1",
    "  fi",
    "  if [ \"$ref\" = refs/heads/main ] && [ -n \"$STANDIN_MAIN_REFUSAL\" ]; then",
    "    printf '%s\\n' \"$STANDIN_MAIN_REFUSAL\" >&2",
    "    exit 1",
    "  fi",
    "done",
    "exit 0",
    "",
  ].join("\n"), { mode: 0o755 });
  return {
    dir,
    gitOrigin,
    hooks,
    nextId: 3001,
    repositories: [],
    namespaces: new Map(),
    uninitialized: new Map(),
    instances: [],
    transportCredentials: [],
    children: new Set(),
    defaultBranchRefusal: null,
    transportRefusal: null,
    transportFailure: null,
    pushRefusal: null,
    transportSleepMs: 0,
  };
}

/** Where a group stands on a Git backend: an account's own group at its
 * login, a group of an instance inside that instance's container. */
function storagePathOn(backend: GitBackend, group: StandinGroup): string {
  if (group.kind === "user") return group.fullPath;
  const holder = backend.instances.find((instance) => instance.groups().includes(group)) ?? backend.instances[0];
  return `${holder?.storage ?? STANDIN_STORAGE}/${group.fullPath}`;
}

/** Whether two groups are one: an account's own group by its login,
 * which every instance over one Git backend shares. */
function sameGroup(a: StandinGroup, b: StandinGroup): boolean {
  return a === b || (a.kind === "user" && b.kind === "user" && a.fullPath === b.fullPath);
}

/**
 * Start the stand-in. `registry` names a stand-in registry
 * (environments-18) whose routes — `/api/v1/packages…`,
 * `/api/v1/search`, `/api/v1/account/orgs` and the raw files at
 * `/<org>/<pkg>/<version>/<path>` — the stand-in relays, as Spex Space
 * serves the registry beside the host at one origin (DR-104): a journey
 * then signs in here and publishes and installs here
 * (playbook-library-95). Each relayed request names this instance and
 * the account it accepts the bearer as, or the code it refuses it with,
 * so several instances may relay to one registry (DR-127).
 * `gitBackend` starts another instance over a running one's Git backend
 * (DR-127): its own origin, display name, person, accounts, tokens,
 * groups and description, the first's bare repositories and transport,
 * and the accounts' namespaces listed by both under the same ids.
 */
export async function startStandinHost(opts: StandinHostOptions): Promise<StandinHost> {
  const shared = opts.gitBackend === undefined ? undefined : backends.get(opts.gitBackend);
  if (opts.gitBackend !== undefined && shared === undefined) throw new Error("stand-in: gitBackend names no stand-in instance");
  if (opts.gitBackend !== undefined && opts.dir !== undefined) throw new Error("stand-in: dir and gitBackend name two Git backends");
  if (opts.gitBackend === undefined && opts.dir === undefined) throw new Error("stand-in: a dir or a gitBackend is required");
  const displayName = opts.displayName ?? "Stand-in Git host";
  const person: StandinPerson = { ...(opts.person ?? DEFAULT_PERSON) };
  const server = createServer();

  const devices = new Map<string, Device>();
  const authCodes = new Map<string, AuthCode>();
  const deviceCodes = new Map<string, DeviceCode>();
  const held: HeldSignIn[] = [];
  let createRefusal: string | null = null;
  let branchRefusal: string | null = null;
  let initializationHold: number | null = null;
  let transportUnauthorized = false;
  let listingSleepMs = 0;
  /** Groups created while the listing lags, left out of it. */
  type HostFault = { kind: "rate"; retryAfter: string | null } | { kind: "unavailable" } | { kind: "refused"; message: string };
  const hostFaults: HostFault[] = [];
  /** The fault answering every admitted host request once `hostFaults`
   * is spent, where one is scripted to last. */
  let lastingFault: HostFault | undefined;
  /** What this instance answers of a repository unlike its Git backend's
   * own state, scripted over another instance's backend (DR-127). */
  const archivedHere = new Map<StandinRepository, boolean>();
  const roleHere = new Map<StandinRepository, string>();

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const backend = shared ?? newBackend(opts.dir as string, `${url}/git`);
  const { dir, gitOrigin } = backend;
  /** Whether this instance serves its Git backend's transport and
   * scripts the Git system's own state. */
  const serves = backend.instances.length === 0;
  const storage = serves ? STANDIN_STORAGE : `${STANDIN_STORAGE}-${backend.instances.length + 1}`;

  /** Where a group stands on the Git system: an account's own group at
   * its login, a group of the instance inside its container. */
  const storagePath = (group: StandinGroup): string => group.kind === "user" ? group.fullPath : `${storage}/${group.fullPath}`;
  const remoteUrl = (repo: StandinRepository): string => `${gitOrigin}/${storagePathOn(backend, repo.group)}/${repo.path}.git`;
  const bareFor = (group: StandinGroup, path: string): string => join(dir, ...storagePath(group).split("/"), `${path}.git`);
  const own = (): StandinGroup => script.groups.find((g) => g.kind === "user") ?? script.groups[0];
  /** Another account's own group, by its login: one object per login on
   * the Git system, never listed among the person's groups. */
  const namespaceOf = (login: string): StandinGroup | undefined => {
    const found = script.accounts.find((account) => account.login === login);
    if (!found) return undefined;
    let group = backend.namespaces.get(found.login);
    if (!group) {
      group = { id: `u${found.id}`, fullPath: found.login, name: found.displayName ?? found.login, kind: "user" };
      backend.namespaces.set(found.login, group);
    }
    return group;
  };
  const findGroup = (key: string): StandinGroup => {
    const group = script.groups.find((g) => g.id === key) ?? script.groups.find((g) => g.fullPath === key) ?? namespaceOf(key);
    if (!group) throw new Error(`stand-in: no group ${key}`);
    return group;
  };
  /** The repositories this instance lists: those in its own groups and
   * those in any account's namespace. */
  const hidden = new Set<string>();
  const mine = (): StandinRepository[] => backend.repositories.filter((r) => !hidden.has(r.id) && (r.group.kind === "user" || script.groups.includes(r.group)));
  const findRepository = (id: string): StandinRepository => {
    const repo = mine().find((r) => r.id === id);
    if (!repo) throw new Error(`stand-in: no repository ${id}`);
    return repo;
  };
  const visible = (id: string): StandinRepository | undefined => mine().find((r) => r.id === id && r.listed && r.path.endsWith("-spex"));
  const archivedOf = (repo: StandinRepository): boolean => archivedHere.get(repo) ?? repo.archived;
  const roleOf = (repo: StandinRepository): string => roleHere.get(repo) ?? repo.role;

  const groupWire = (group: StandinGroup) => ({ id: group.id, full_path: group.fullPath, name: group.name, kind: group.kind });

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

  /** The host's README on `main`, committed into a created repository
   * whose initialization was held. */
  function initialize(repo: StandinRepository): void {
    backend.uninitialized.delete(repo);
    commitFile(repo.bare, "refs/heads/main", "README.md", `# ${repo.name}\n`, "Initial commit");
  }

  /** After a push into a repository, as a host does: a held README is
   * written no more once a branch landed, and an empty repository takes
   * the first branch it received as its default. */
  function received(repo: StandinRepository, wasEmpty: boolean): void {
    try {
      const heads = gitSync(["-C", repo.bare, "for-each-ref", "--format=%(refname)", "refs/heads/"]).split("\n").filter(Boolean);
      if (heads.length === 0) return;
      backend.uninitialized.delete(repo);
      if (wasEmpty && !heads.includes(gitSync(["-C", repo.bare, "symbolic-ref", "HEAD"]))) {
        gitSync(["-C", repo.bare, "symbolic-ref", "HEAD", heads[0]]);
      }
    } catch { /* the bare repository moved meanwhile */ }
  }

  async function repositoryWire(repo: StandinRepository): Promise<Record<string, unknown>> {
    // A held README: one read fewer to go, committed once none is.
    const left = backend.uninitialized.get(repo);
    if (left !== undefined) {
      if (left > 0) backend.uninitialized.set(repo, left - 1);
      else initialize(repo);
    }
    const heads = await branches(repo.bare);
    const spex = heads.has("spex");
    return {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      group: groupWire(repo.group),
      remote_url: remoteUrl(repo),
      visibility: repo.visibility,
      archived: archivedOf(repo),
      empty: !heads.has("main"),
      lfs: repo.lfs,
      spex_branch: spex,
      project: spex ? await projectOf(repo.bare) : null,
    };
  }

  /** Whether the person's role on a repository may push, as this
   * instance answers it. */
  const mayPush = (repo: StandinRepository): boolean => script.roles.some((role) => role.name === roleOf(repo) && role.mayPush);

  async function detailWire(repo: StandinRepository): Promise<Record<string, unknown>> {
    const base = await repositoryWire(repo);
    const present = base.spex_branch === true;
    const archived = archivedOf(repo);
    const readOnly = archived
      ? { reason: "archived", message: "This project is archived and its repository is read-only." }
      : mayPush(repo) ? null : { reason: "access", message: `You have the ${roleOf(repo)} role, which may not push to this project.` };
    return {
      ...base,
      read_only: readOnly,
      branch: {
        present,
        can_push: present ? !archived && mayPush(repo) : null,
        protected: present ? false : null,
        blocked: repo.blocked,
      },
    };
  }

  /** Whether a request is the registry's, which an instance set to
   * relay to one relays (environments-18): its search, packages and the
   * account's orgs, and a raw file at `/<org>/<pkg>/<version>/<path>`,
   * which no route of the instance's own shares. */
  function registryRoute(method: string, path: string): boolean {
    if (path === "/api/v1/search" || path === "/api/v1/packages" || path.startsWith("/api/v1/packages/") || path === "/api/v1/account/orgs") return true;
    const segments = path.split("/").filter(Boolean);
    return (method === "GET" || method === "HEAD") && segments.length >= 4 && !["api", "login", "git"].includes(segments[0]!);
  }

  /** Relay one registry request to the stand-in registry, its bearer and
   * body as they came, its answer as it went: only the request's own
   * credential, body type and accepted types pass, so no relay header it
   * carries does, and this instance names itself and its verdict on the
   * bearer — the account it accepts it as, or the code it refuses it
   * with (environments-18, DR-127). */
  async function forwardToRegistry(req: IncomingMessage, res: ServerResponse, method: string, target: URL, registry: string): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers: Record<string, string> = {};
    for (const name of ["authorization", "content-type", "accept"]) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    headers[RELAY_HEADERS.instance] = url;
    const bearer = bearerOf(req);
    if (bearer !== null) {
      const found = bearerDevice(bearer);
      if ("code" in found) headers[RELAY_HEADERS.refused] = found.code;
      else if (found.device.scope !== "registry") return envelope(res, 403, "wrong_scope", "Sign in to registry.");
      else headers[RELAY_HEADERS.account] = script.person.login;
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

  function issue(label: string, scope: "registry" | "space" = "space"): { access: string; refresh: string; device: Device } {
    const device: Device = {
      scope,
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

  // The person's own group is the Git system's, one object per login
  // over one Git backend (DR-127): `2001` for the default person, any
  // other's `u<id>` as another account's is. Over another instance's
  // backend, this instance's groups take that Git system's next ids.
  const personGroup: StandinGroup = backend.namespaces.get(person.login)
    ?? { id: person.id === DEFAULT_PERSON.id ? "2001" : `u${person.id}`, fullPath: person.login, name: person.login, kind: "user" };
  backend.namespaces.set(person.login, personGroup);
  const groupId = (id: string): string => serves ? id : String(backend.nextId++);

  const script: StandinScript = {
    person,
    roles: DEFAULT_ROLES.map((role) => ({ ...role })),
    accounts: [DEFAULT_PERSON, ...DEFAULT_ACCOUNTS].filter((account) => account.login !== person.login).map((account) => ({ ...account })),
    groups: [
      personGroup,
      { id: groupId("2002"), fullPath: "acme", name: "Acme", kind: "group", members: [{ ...person, role: "Owner" }] },
      { id: groupId("2003"), fullPath: "acme/research", name: "Research", kind: "group" },
    ],
    get repositories() { return mine(); },
    transportCredentials: backend.transportCredentials,
    browser: "approve",
    deviceInterval: 1,
    devicePollFloor: null,
    deviceExpiresIn: 600,
    accessTtlMs: 3_600_000,
    refuseRefresh: false,
    requests: [],
    tokenGrants: [],
    deviceRequests: [],
    creations: [],
    heldSignIns: () => held.length,
    approveHeld: async () => {
      const request = held.shift();
      if (!request) throw new Error("stand-in: no held sign-in");
      const code = secret("");
      authCodes.set(code, { scope: request.scope, label: request.label, redirectUri: request.redirectUri, challenge: request.challenge, used: false, expiresAt: Date.now() + CODE_TTL_MS });
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
    deviceCodes: () => [...deviceCodes.keys()],
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
        id: String(backend.nextId++),
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
      backend.repositories.push(repo);
      return repo;
    },
    hideRepository: (id) => { hidden.add(id); },
    rename: (id, change) => {
      const repo = findRepository(id);
      const group = change.group === undefined ? repo.group : findGroup(change.group);
      const path = change.name ?? repo.path;
      const bare = bareFor(group, path);
      if (bare !== repo.bare) {
        // A case-only change on a case-folding filesystem names the same
        // bare repository: its metadata changes, no other is overwritten.
        if (existsSync(bare) && !sameFile(repo.bare, bare)) throw new Error(`stand-in: ${group.fullPath}/${path} exists`);
        mkdirSync(dirname(bare), { recursive: true });
        renameSync(repo.bare, bare);
      }
      if (repo.name === repo.path) repo.name = path;
      repo.path = path;
      repo.group = group;
      repo.bare = bare;
    },
    archive: (id, archived = true) => {
      const repo = findRepository(id);
      if (serves) repo.archived = archived;
      else archivedHere.set(repo, archived);
    },
    removeMember: (id) => { findRepository(id).listed = false; },
    accessLevel: (id, role) => {
      const repo = findRepository(id);
      if (serves) repo.role = role;
      else roleHere.set(repo, role);
    },
    refuseCreate: (message) => { createRefusal = message; },
    holdInitialization: (reads) => {
      initializationHold = reads;
      if (reads === null) for (const repo of mine()) if (backend.uninitialized.has(repo)) initialize(repo);
    },
    refuseDefaultBranch: (message) => { backend.defaultBranchRefusal = message; },
    refuseBranch: (message) => { branchRefusal = message; },
    refuseTransport: (message) => { backend.transportRefusal = message; },
    failTransport: (status, which = "all") => { backend.transportFailure = status === null ? null : { status, which }; },
    refusePush: (message) => { backend.pushRefusal = message; },
    unauthorizeTransport: (on) => { transportUnauthorized = on; },
    sleepTransport: (ms) => { backend.transportSleepMs = Math.max(0, ms); },
    sleepListing: (ms) => { listingSleepMs = Math.max(0, ms); },
    rateLimit: (count, retryAfter) => {
      if (count === Infinity) lastingFault = { kind: "rate", retryAfter };
      else for (let i = 0; i < count; i += 1) hostFaults.push({ kind: "rate", retryAfter });
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

    // The transport is served at one origin: over another instance's Git
    // backend, `/git` here is nothing (DR-127).
    if (serves && (path === "/git" || path.startsWith("/git/"))) return transport(req, res, target);
    if (path === "/api/v1/registry" && method === "GET") return json(res, 200, { origin: url, display_name: displayName, providers: ["github", "gitlab"] });
    if (path === "/api/v1/spaces" && method === "GET") return json(res, 200, { spaces: [{ origin: url, display_name: displayName, sign_in: ["github", "gitlab"] }] });
    if (path === "/api/v1/whoami" && method === "GET") {
      const found = bearerDevice(bearerOf(req));
      if ("code" in found) return envelope(res, 401, found.code, found.message);
      if (found.device.scope !== "registry" || target.searchParams.get("scope") !== "registry") return envelope(res, 403, "wrong_scope", "Sign in to registry.");
      return json(res, 200, { id: script.person.id, login: script.person.login, display_name: script.person.displayName, can_create_group: false });
    }
    if (path === "/login/app" && method === "GET") return loginApp(res, target.searchParams);
    if (path === "/login/device") return loginDevice(req, res, target.searchParams);
    if (path === "/api/v1/auth/device" && method === "POST") return deviceStart(req, res);
    if (path === "/api/v1/auth/token" && method === "POST") return token(req, res);
    if (path === "/api/v1/auth/revoke" && method === "POST") return revoke(req, res);
    if (path === "/api/v1/host" && method === "GET") {
      // `groups`: whether root groups can be made, as the person's
      // `can_create_group` says it (host-1, host-3).
      return json(res, 200, { display_name: displayName, git_origin: gitOrigin });
    }
    if (path.startsWith("/api/v1/host/")) return hostRoute(req, res, method, path, target);
    if (opts.registry && registryRoute(method, path)) return forwardToRegistry(req, res, method, target, opts.registry);
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
      held.push({ scope: query.get("scope") === "registry" ? "registry" : "space", redirectUri, state, challenge, label });
      return html(res, 200, `Sign in Spex on ${label}?`, "<p>Waiting for approval.</p>");
    }
    const back = new URL(redirectUri);
    if (script.browser === "deny") {
      back.searchParams.set("error", "access_denied");
    } else {
      const code = secret("");
      authCodes.set(code, { scope: query.get("scope") === "registry" ? "registry" : "space", label, redirectUri, challenge, used: false, expiresAt: Date.now() + CODE_TTL_MS });
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
    script.deviceRequests.push({ label: body.label });
    const deviceCode = secret("");
    const code = userCode();
    const now = performance.now();
    deviceCodes.set(deviceCode, {
      scope: body.scope === "registry" ? "registry" : "space",
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
      return grant(issue(entry.label, entry.scope).device);
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
    return grant(issue(entry.label, entry.scope).device);
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
    if (found.device.scope !== "space") return envelope(res, 403, "wrong_scope", "Sign in to Space.");
    const fault = hostFaults.shift() ?? lastingFault;
    if (fault?.kind === "rate") return envelope(res, 429, "rate_limited", "Too many requests to the Git host.", fault.retryAfter === null ? {} : { "retry-after": fault.retryAfter });
    if (fault?.kind === "unavailable") return envelope(res, 503, "provider_unavailable", "The Git host did not answer.");
    if (fault?.kind === "refused") return envelope(res, 403, "host_refused", fault.message);

    if (path === "/api/v1/host/me" && method === "GET") {
      return json(res, 200, {
        id: script.person.id,
        login: script.person.login,
        display_name: script.person.displayName,
      });
    }
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
      const all = mine().filter((r) => r.listed && r.path.endsWith("-spex"));
      const page = all.slice(offset, offset + PAGE_SIZE);
      const next = offset + PAGE_SIZE < all.length ? `o${offset + PAGE_SIZE}` : null;
      const repositories = await Promise.all(page.map(repositoryWire));
      if (listingSleepMs > 0) await sleep(listingSleepMs);
      return json(res, 200, { repositories, next_cursor: next });
    }
    if (path === "/api/v1/host/repositories" && method === "POST") return create(req, res);
    const match = /^\/api\/v1\/host\/repositories\/([^/]+)(\/spex-branch)?$/.exec(path);
    if (match) {
      const repo = visible(decodeURIComponent(match[1]));
      if (!repo) return envelope(res, 404, "not_found", "The repository is not shared with this account.");
      if (match[2] === undefined && method === "GET") return json(res, 200, await detailWire(repo));
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
    script.creations.push(body);
    if (!isRecord(body)) return envelope(res, 400, "bad_request", "The body must be a JSON object.");
    const { group_id: groupId, name, description } = body;
    if (typeof name !== "string" || !SPEX_NAME.test(name)) return envelope(res, 400, "bad_request", "The name must be lowercase kebab-case ending in -spex.");
    if (groupId !== null) return envelope(res, 400, "bad_request", "Creation needs the account namespace.");
    if (typeof description !== "string") return envelope(res, 400, "bad_request", "The description must be a string.");
    const group = own();
    if (createRefusal !== null) return json(res, 202, { status: "pending", message: createRefusal });
    const bare = bareFor(group, name);
    if (existsSync(bare) || mine().some((r) => sameGroup(r.group, group) && r.path === name)) {
      return envelope(res, 409, "name_taken", "A repository of that name exists in the account namespace.");
    }
    initBare(bare, { name, empty: initializationHold !== null });
    const repo: StandinRepository = {
      id: String(backend.nextId++),
      name,
      path: name,
      group,
      description,
      visibility: "private",
      archived: false,
      lfs: true,
      role: "Owner",
      members: [],
      listed: true,
      blocked: false,
      bare,
    };
    backend.repositories.push(repo);
    if (initializationHold !== null) backend.uninitialized.set(repo, initializationHold);
    json(res, 201, { status: "created", repository: await repositoryWire(repo) });
  }

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

  /** The Git transport, which the first instance over a Git backend
   * serves at its Git origin: a credential any instance over it issued is
   * accepted, its issuer recorded (DR-127), and the Git system's own
   * archive and roles decide a push. */
  async function transport(req: IncomingMessage, res: ServerResponse, target: URL): Promise<void> {
    if (backend.transportSleepMs > 0) await sleep(backend.transportSleepMs);
    const token = basicToken(req);
    const issuer = token === null ? undefined : backend.instances.find((instance) => instance.issued(token));
    if (issuer === undefined || issuer.unauthorized()) {
      res.writeHead(401, { "www-authenticate": "Basic realm=\"Stand-in Git host\"", "content-type": "text/plain; charset=utf-8" });
      res.end("HTTP Basic: Access denied.\n");
      return;
    }
    const pushes = target.searchParams.get("service") === "git-receive-pack" || target.pathname.endsWith("/git-receive-pack");
    backend.transportCredentials.push({ instance: issuer.url, method: req.method ?? "GET", path: target.pathname, push: pushes });
    if (backend.transportRefusal !== null) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(`${backend.transportRefusal}\n`);
      return;
    }
    const failure = backend.transportFailure;
    if (failure !== null && (failure.which === "all" || pushes)) {
      res.writeHead(failure.status, { "content-type": "text/plain; charset=utf-8" });
      res.end("Something went wrong.\n");
      return;
    }
    const pathInfo = target.pathname.slice("/git".length);
    const repo = backend.repositories.find((r) => r.listed && pathInfo.startsWith(`/${storagePathOn(backend, r.group)}/${r.path}.git/`));
    if (!repo) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("The project you were looking for could not be found.\n");
      return;
    }
    const lfsPrefix = `/${storagePathOn(backend, repo.group)}/${repo.path}.git/info/lfs/objects`;
    const object = (oid: string): string => join(repo.bare, "lfs", "objects", oid.slice(0, 2), oid.slice(2, 4), oid);
    if (pathInfo === `${lfsPrefix}/batch` && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { operation: string; objects: { oid: string; size: number }[] };
      if (body.operation !== "download" || !Array.isArray(body.objects)) return json(res, 400, { message: "Only fixture downloads are supported" });
      return json(res, 200, { transfer: "basic", objects: body.objects.map(({ oid, size }) => ({ oid, size,
        ...(/^[a-f0-9]{64}$/.test(oid) && existsSync(object(oid))
          ? { actions: { download: { href: `${gitOrigin}${lfsPrefix}/${oid}` } } }
          : { error: { code: 404, message: "Object missing" } }),
      })) });
    }
    if (pathInfo.startsWith(`${lfsPrefix}/`) && req.method === "GET") {
      const oid = pathInfo.slice(lfsPrefix.length + 1);
      if (!/^[a-f0-9]{64}$/.test(oid) || !existsSync(object(oid))) { res.writeHead(404).end(); return; }
      await script.beforeLfsDownload?.(oid);
      const bytes = readFileSync(object(oid));
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length }).end(bytes);
      return;
    }
    const receive = target.searchParams.get("service") === "git-receive-pack" || pathInfo.endsWith("/git-receive-pack");
    const gitMayPush = (backend.instances[0]?.roles() ?? script.roles).some((role) => role.name === repo.role && role.mayPush);
    if (receive && (repo.archived || !gitMayPush)) {
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
      // A protected default branch refuses `main`; a refused push, every
      // ref, in words Git prints as `remote:` lines.
      ...(receive && (backend.defaultBranchRefusal !== null || backend.pushRefusal !== null)
        ? {
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "core.hooksPath",
            GIT_CONFIG_VALUE_0: backend.hooks,
            STANDIN_MAIN_REFUSAL: backend.defaultBranchRefusal ?? "",
            STANDIN_PUSH_REFUSAL: backend.pushRefusal ?? "",
          }
        : {}),
    };
    const pushing = receive && req.method === "POST";
    const wasEmpty = pushing && (await branches(repo.bare)).size === 0;
    const child = spawn("git", ["http-backend"], { env, stdio: ["pipe", "pipe", "pipe"] });
    backend.children.add(child);
    child.on("close", () => backend.children.delete(child));
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
        if (pushing) received(repo, wasEmpty);
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

  backend.instances.push({
    url,
    storage,
    groups: () => script.groups,
    roles: () => script.roles,
    issued: (token) => !("code" in bearerDevice(token)),
    unauthorized: () => transportUnauthorized,
  });

  const host: StandinHost = {
    url,
    bareOf: (key: string): string => {
      const slash = key.lastIndexOf("/");
      const path = key.slice(slash + 1);
      const fullPath = key.slice(0, slash);
      const found = mine().find((r) => r.path === path && r.group.fullPath === fullPath);
      if (found) return found.bare;
      const group = script.groups.find((g) => g.fullPath === fullPath) ?? namespaceOf(fullPath);
      return group ? bareFor(group, path) : join(dir, storage, ...fullPath.split("/"), `${path}.git`);
    },
    gitOrigin,
    dir,
    storage,
    script,
    close: async () => {
      // The transport's Git children are the serving instance's to end.
      if (serves) for (const child of backend.children) child.kill("SIGKILL");
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    },
  };
  backends.set(host, backend);
  return host;
}
