// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Git host client (git-host-1..11, DR-103): signs a person in as a
// public client — the browser flow with PKCE on the desktop, the device
// flow on the server shell — keeps the app token current in
// `local/credentials.yaml` (storage-19), and reads and writes the host's
// JSON routes under `/api/v1`. It composes no reader-facing prose: a
// failure is a `HostError` carrying its kind and the host's own words,
// which the core phrases where it speaks (git-host-11). No secret ever
// enters an error message or a log line.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/** The Git host a new home records unless `SPEX_HOST_URL` names another
 * (git-host-1). */
export const DEFAULT_HOST_URL = "https://spex.pub";

/** The public OAuth client id Spex signs in as. */
export const CLIENT_ID = "spex";

/** An access secret this close to expiring is refreshed first (git-host-4). */
export const REFRESH_MARGIN_MS = 60_000;

/** A browser sign-in without a callback ends `expired` after this long
 * (git-host-2). */
export const BROWSER_SIGN_IN_TIMEOUT_MS = 10 * 60_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SLOW_DOWN_STEP_MS = 5_000;
const LABEL_MAX = 80;

/**
 * The host URL a home uses (git-host-1): a home that already records one
 * keeps it whatever the environment says; a new home takes a nonempty
 * `SPEX_HOST_URL`, else spex.pub. Trailing slashes are dropped so routes
 * join cleanly.
 */
export function hostUrlFor(env: NodeJS.ProcessEnv, existing: string | null | undefined): string {
  if (typeof existing === "string" && existing.trim().length > 0) return trimUrl(existing.trim());
  const fromEnv = env.SPEX_HOST_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return trimUrl(fromEnv.trim());
  return DEFAULT_HOST_URL;
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface HostAccount { id: string; login: string; displayName: string | null }

export interface HostGroup { id: string | null; fullPath: string; name: string; url: string | null; kind: "user" | "group" }

export interface HostRepository {
  id: string;
  name: string;
  path: string;
  group: HostGroup;
  remoteUrl: string;
  webUrl: string;
  visibility: string;
  archived: boolean;
  empty: boolean;
  lfs: boolean;
  spexBranch: boolean;
  project: Record<string, unknown> | null;
}

export interface HostRepositoryDetail extends HostRepository {
  readOnly: null | { reason: "archived" | "access"; message: string };
  branch: { present: boolean; canPush: boolean | null; protected: boolean | null; blocked: boolean };
}

export interface HostMember { id: string; login: string; displayName: string | null; role: string; url: string | null }

export type HostErrorKind =
  | "pending"
  | "name_taken"
  | "host_refused"
  | "not_found"
  | "rate_limited"
  | "reauth"
  | "unreachable"
  | "bad_request";

/** Why a sign-in ended without an account (git-host-2, git-host-3). */
export type SignInCause = "denied" | "expired" | "stopped" | "refused" | "state" | "unreachable";

/**
 * A host answer other than success (git-host-11). `words` is the host's
 * own message, kept whole; `retryAfter` the host's `Retry-After` for
 * `rate_limited`; `code` the envelope's `error.code` where one came; and,
 * for a sign-in that ended without an account, `cause` names why.
 */
export class HostError extends Error {
  readonly kind: HostErrorKind;
  readonly words: string | null;
  readonly retryAfter: string | null;
  readonly code: string | null;
  readonly status: number | null;
  declare readonly cause?: SignInCause;

  constructor(
    kind: HostErrorKind,
    options: { words?: string | null; retryAfter?: string | null; code?: string | null; status?: number | null; cause?: SignInCause } = {},
  ) {
    const words = options.words ?? null;
    const code = options.code ?? null;
    const what = options.cause ? `sign-in ${options.cause}` : code ?? kind;
    super(`Git host: ${what}${words ? `: ${words}` : ""}`, options.cause ? { cause: options.cause } : undefined);
    this.name = "HostError";
    this.kind = kind;
    this.words = words;
    this.retryAfter = options.retryAfter ?? null;
    this.code = code;
    this.status = options.status ?? null;
  }
}

/** A sign-in started while another runs (git-host-2: a second start is
 * `busy`). */
export class SignInBusyError extends Error {
  readonly code = "busy";
  constructor() {
    super("A sign-in is already running");
    this.name = "SignInBusyError";
  }
}

// ---------------------------------------------------------------------------
// The credential file (storage-19)

export interface StoredCredential { access: string; accessExpiresAt: number; refresh: string }

export interface CredentialStore {
  read(): Promise<StoredCredential | null>;
  write(credential: StoredCredential): Promise<void>;
  remove(): Promise<void>;
}

interface CredentialsFile { format: 1; hosts: Record<string, unknown> }

/** The path of the credentials file under a home. */
export function credentialsPath(homeDir: string): string {
  return join(homeDir, "local", "credentials.yaml");
}

/**
 * The app token of one Git host in `local/credentials.yaml`, exactly
 * `{format: 1, hosts: {<url>: {access, accessExpiresAt, refresh}}}`,
 * written atomically with owner-only permissions under a `local/` made
 * owner-only (storage-19). A file of another format is refused, never
 * guessed at or overwritten. Other hosts' entries are kept; removing the
 * last one removes the file.
 */
export function fileCredentialStore(homeDir: string, hostUrl: string): CredentialStore {
  const dir = join(homeDir, "local");
  const file = credentialsPath(homeDir);
  const key = trimUrl(hostUrl);
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  async function load(): Promise<CredentialsFile | null> {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let doc: unknown;
    try {
      doc = parseYaml(text);
    } catch {
      throw new Error(`${file} is not valid YAML; it is left as it is`);
    }
    if (!isRecord(doc)) throw new Error(`${file} holds no credentials map; it is left as it is`);
    if (doc.format !== 1) {
      throw new Error(`${file} has format ${JSON.stringify(doc.format ?? null)}, which this version of Spex does not read; it is left as it is`);
    }
    if (!isRecord(doc.hosts)) throw new Error(`${file} has no hosts map; it is left as it is`);
    return { format: 1, hosts: { ...doc.hosts } };
  }

  async function save(doc: CredentialsFile): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = join(dir, `.credentials.yaml.${randomBytes(6).toString("hex")}.tmp`);
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(stringifyYaml({ format: 1, hosts: doc.hosts }), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await chmod(temp, 0o600);
      await rename(temp, file);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  return {
    read: () => serial(async () => {
      const doc = await load();
      if (!doc) return null;
      const entry = doc.hosts[key];
      if (entry === undefined) return null;
      if (!isRecord(entry) || typeof entry.access !== "string" || typeof entry.refresh !== "string"
        || typeof entry.accessExpiresAt !== "number" || !Number.isFinite(entry.accessExpiresAt)) {
        throw new Error(`${file} holds a malformed entry for ${key}; it is left as it is`);
      }
      return { access: entry.access, accessExpiresAt: entry.accessExpiresAt, refresh: entry.refresh };
    }),
    write: (credential) => serial(async () => {
      const doc = (await load()) ?? { format: 1, hosts: {} };
      doc.hosts[key] = { access: credential.access, accessExpiresAt: credential.accessExpiresAt, refresh: credential.refresh };
      await save(doc);
    }),
    remove: () => serial(async () => {
      const doc = await load();
      if (!doc || !(key in doc.hosts)) return;
      delete doc.hosts[key];
      if (Object.keys(doc.hosts).length === 0) await rm(file, { force: true });
      else await save(doc);
    }),
  };
}

// ---------------------------------------------------------------------------
// The client

export interface GitHostClientOptions {
  url: string;
  /** The public client id; `spex`. */
  clientId?: string;
  /** This device and app, e.g. "Spex on <hostname>", shown on the host's
   * approval page and device list; cut to 80 characters. */
  label: string;
  credentials: CredentialStore;
  fetch?: typeof fetch;
  now?: () => number;
  /** Called once the client has signed the device out on the host's
   * refusal (git-host-4); never on an explicit `signOut()`. */
  onSignedOut?: (cause: HostErrorKind) => void;
  /** Bound on each host request; a request past it is unreachable. */
  requestTimeoutMs?: number;
}

/** A running browser sign-in (git-host-2). */
export interface BrowserSignIn {
  /** The host's `/login/app` URL for the system browser. */
  url: string;
  /** The loopback address the host redirects back to. */
  redirectUri: string;
  /** Resolves with the account once the token is stored; rejects with a
   * `HostError` whose `cause` names why the sign-in ended. */
  done: Promise<HostAccount>;
  cancel(): void;
}

/** A running device sign-in (git-host-3). */
export interface DeviceSignIn {
  userCode: string;
  verificationUri: string;
  /** Unix milliseconds. */
  expiresAt: number;
  done: Promise<HostAccount>;
  cancel(): void;
}

/** Pages the loopback answers the browser with; English by default. */
export interface CallbackPages {
  complete: string;
  failed: string;
}

const DEFAULT_PAGES: CallbackPages = {
  complete: page("Signed in", "Spex is signed in. You may close this browser window."),
  failed: page("Not signed in", "Spex did not sign in. You may close this browser window and return to Spex."),
};

function page(title: string, text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${text}</p></body></html>`;
}

interface Answer { status: number; json: unknown; retryAfter: string | null }

const REAUTH_CODES = new Set(["invalid_token", "token_revoked", "reauth_required", "unauthenticated", "token_expired"]);

/**
 * The client of one Git host. Every call to a host route presents the
 * stored access secret and keeps the app token current (git-host-4);
 * `describe()` alone needs no token.
 */
export class GitHostClient {
  readonly url: string;
  private readonly clientId: string;
  private readonly label: string;
  private readonly credentials: CredentialStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly onSignedOut?: (cause: HostErrorKind) => void;
  private readonly requestTimeoutMs: number;
  private refreshing: Promise<StoredCredential> | null = null;
  private signIn: object | null = null;

  constructor(options: GitHostClientOptions) {
    this.url = trimUrl(options.url);
    this.clientId = options.clientId ?? CLIENT_ID;
    const label = options.label.trim();
    this.label = (label.length > 0 ? label : "Spex").slice(0, LABEL_MAX);
    this.credentials = options.credentials;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.onSignedOut = options.onSignedOut;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** `GET /api/v1/host`: the host's display name and the Git origin its
   * credentials are valid for. */
  async describe(): Promise<{ displayName: string; gitOrigin: string }> {
    const answer = await this.send("GET", "/api/v1/host", {});
    if (answer.status !== 200) throw answerError(answer);
    const body = record(answer.json);
    return { displayName: text(body.display_name), gitOrigin: text(body.git_origin) };
  }

  /** Whether this device holds an app token for the host. */
  async signedIn(): Promise<boolean> {
    return (await this.credentials.read()) !== null;
  }

  /** Whether a sign-in is running. */
  signingIn(): boolean {
    return this.signIn !== null;
  }

  /**
   * The browser flow with PKCE (git-host-2): a loopback listener on
   * `127.0.0.1` at an OS-assigned port for one callback, an S256
   * challenge, and the host's `/login/app` URL to open.
   */
  async startBrowserSignIn(options: { timeoutMs?: number; pages?: CallbackPages } = {}): Promise<BrowserSignIn> {
    const slot = this.claimSignIn();
    const pages = options.pages ?? DEFAULT_PAGES;
    const server = createServer();
    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", rejectListen);
          resolveListen();
        });
      });
    } catch (error) {
      this.releaseSignIn(slot);
      throw new HostError("unreachable", { words: error instanceof Error ? error.message : null, cause: "unreachable" });
    }
    const port = (server.address() as AddressInfo).port;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(32));
    const query = new URLSearchParams({
      client_id: this.clientId,
      label: this.label,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    const url = `${this.url}/login/app?${query.toString()}`;

    let settled = false;
    let answering = false;
    let resolveDone!: (account: HostAccount) => void;
    let rejectDone!: (error: HostError) => void;
    const done = new Promise<HostAccount>((resolveFlow, rejectFlow) => {
      resolveDone = resolveFlow;
      rejectDone = rejectFlow;
    });
    done.catch(() => undefined);
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      server.close();
      server.closeAllConnections();
    };
    const end = (outcome: { account: HostAccount } | { error: HostError }, keepOpen = false): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this.releaseSignIn(slot);
      if (!keepOpen) close();
      if ("account" in outcome) resolveDone(outcome.account);
      else rejectDone(outcome.error);
    };
    const timer = setTimeout(() => end({ error: signInError("expired") }), options.timeoutMs ?? BROWSER_SIGN_IN_TIMEOUT_MS);

    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      const target = new URL(request.url ?? "/", redirectUri);
      if (request.method !== "GET" || target.pathname !== "/callback" || settled || answering) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8", connection: "close" }).end();
        return;
      }
      answering = true;
      clearTimeout(timer);
      void this.answerCallback(target.searchParams, { state, verifier, redirectUri, isSettled: () => settled }).then((outcome) => {
        if (settled) {
          respond(response, 410, pages.failed, close);
          return;
        }
        // The page goes out before the listener closes, so the browser
        // always sees how the sign-in ended.
        end(outcome, true);
        respond(response, "account" in outcome ? 200 : 400, "account" in outcome ? pages.complete : pages.failed, close);
      });
    });

    return {
      url,
      redirectUri,
      done,
      cancel: () => end({ error: signInError("stopped") }),
    };
  }

  private async answerCallback(
    params: URLSearchParams,
    flow: { state: string; verifier: string; redirectUri: string; isSettled: () => boolean },
  ): Promise<{ account: HostAccount } | { error: HostError }> {
    try {
      if (params.get("state") !== flow.state) return { error: signInError("state") };
      const error = params.get("error");
      if (error !== null) {
        return { error: signInError(error === "access_denied" ? "denied" : "refused", { code: error, words: params.get("error_description") }) };
      }
      const code = params.get("code");
      if (!code) return { error: signInError("refused") };
      const answer = await this.send("POST", "/api/v1/auth/token", {
        body: { grant_type: "authorization_code", code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri, client_id: this.clientId },
      });
      if (flow.isSettled()) return { error: signInError("stopped") };
      if (answer.status !== 200) return { error: exchangeError(answer) };
      return { account: await this.completeSignIn(answer) };
    } catch (error) {
      return { error: asSignInError(error) };
    }
  }

  /**
   * The device flow (git-host-3): the host's user code and verification
   * URL, then polling the token endpoint at its interval, five seconds
   * slower on each `slow_down`, until the token, a denial or the expiry.
   */
  async startDeviceSignIn(): Promise<DeviceSignIn> {
    const slot = this.claimSignIn();
    let start: { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number };
    try {
      const answer = await this.send("POST", "/api/v1/auth/device", { body: { client_id: this.clientId, label: this.label } });
      if (answer.status !== 200) throw answerError(answer);
      const body = record(answer.json);
      start = {
        deviceCode: text(body.device_code),
        userCode: text(body.user_code),
        verificationUri: text(body.verification_uri),
        expiresIn: positive(body.expires_in, 600),
        interval: positive(body.interval, 5),
      };
    } catch (error) {
      this.releaseSignIn(slot);
      throw error;
    }
    const expiresAt = this.now() + start.expiresIn * 1000;

    let settled = false;
    let wake: (() => void) | null = null;
    let sleeper: NodeJS.Timeout | undefined;
    let resolveDone!: (account: HostAccount) => void;
    let rejectDone!: (error: HostError) => void;
    const done = new Promise<HostAccount>((resolveFlow, rejectFlow) => {
      resolveDone = resolveFlow;
      rejectDone = rejectFlow;
    });
    done.catch(() => undefined);
    const end = (outcome: { account: HostAccount } | { error: HostError }): void => {
      if (settled) return;
      settled = true;
      if (sleeper) clearTimeout(sleeper);
      wake?.();
      this.releaseSignIn(slot);
      if ("account" in outcome) resolveDone(outcome.account);
      else rejectDone(outcome.error);
    };
    const wait = (ms: number): Promise<void> => new Promise<void>((resolveWait) => {
      wake = resolveWait;
      sleeper = setTimeout(resolveWait, ms);
    });

    const poll = async (): Promise<void> => {
      let intervalMs = start.interval * 1000;
      while (!settled) {
        await wait(intervalMs);
        if (settled) return;
        if (this.now() >= expiresAt) {
          end({ error: signInError("expired") });
          return;
        }
        let answer: Answer;
        try {
          answer = await this.send("POST", "/api/v1/auth/token", {
            body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: start.deviceCode, client_id: this.clientId },
          });
        } catch {
          continue; // no answer: keep polling until the code expires
        }
        if (settled) return;
        if (answer.status === 200) {
          try {
            end({ account: await this.completeSignIn(answer) });
          } catch (error) {
            end({ error: asSignInError(error) });
          }
          return;
        }
        const code = codeOf(answer);
        if (code === "authorization_pending") continue;
        if (code === "slow_down") {
          intervalMs += SLOW_DOWN_STEP_MS;
          continue;
        }
        if (code === "access_denied") {
          end({ error: signInError("denied", { code, words: wordsOf(answer) }) });
          return;
        }
        if (code === "expired_token") {
          end({ error: signInError("expired", { code, words: wordsOf(answer) }) });
          return;
        }
        if (answer.status >= 500 || answer.status === 429) continue;
        end({ error: exchangeError(answer) });
        return;
      }
    };
    void poll();

    return {
      userCode: start.userCode,
      verificationUri: start.verificationUri,
      expiresAt,
      done,
      cancel: () => end({ error: signInError("stopped") }),
    };
  }

  /**
   * Sign this device out (git-host-10): revoke it at the host with its
   * app token, tried once, and remove the credential either way.
   */
  async signOut(): Promise<void> {
    let credential: StoredCredential | null = null;
    try {
      credential = await this.credentials.read();
    } catch {
      credential = null;
    }
    if (credential) {
      const stored = credential;
      try {
        // An expired access secret cannot revoke; a fresh one can.
        const fresh = async (): Promise<string | null> => {
          const answer = await this.send("POST", "/api/v1/auth/token", {
            body: { grant_type: "refresh_token", refresh_token: stored.refresh, client_id: this.clientId },
          });
          return answer.status === 200 ? tokenFrom(answer, this.now()).access : null;
        };
        let access: string | null = stored.access;
        let refreshed = false;
        if (stored.accessExpiresAt - this.now() < REFRESH_MARGIN_MS) {
          access = await fresh();
          refreshed = true;
        }
        if (access !== null) {
          const answer = await this.send("POST", "/api/v1/auth/revoke", { bearer: access });
          if (!refreshed && answer.status === 401 && codeOf(answer) === "token_expired") {
            const next = await fresh();
            if (next !== null) await this.send("POST", "/api/v1/auth/revoke", { bearer: next });
          }
        }
      } catch {
        // No answer: tried once, and the credential goes either way.
      }
    }
    await this.credentials.remove();
  }

  /** `GET /api/v1/host/me`: the person, as the host reports them. */
  async me(): Promise<HostAccount> {
    return accountFrom((await this.call("GET", "/api/v1/host/me")).json);
  }

  /** `GET /api/v1/host/groups`: the person's own group and every group
   * they belong to. */
  async groups(): Promise<HostGroup[]> {
    const body = record((await this.call("GET", "/api/v1/host/groups")).json);
    return list(body.groups).map(groupFrom);
  }

  /** `GET /api/v1/host/repositories`, every page. */
  async repositories(): Promise<HostRepository[]> {
    const all: HostRepository[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const path: string = cursor === null ? "/api/v1/host/repositories" : `/api/v1/host/repositories?cursor=${encodeURIComponent(cursor)}`;
      const body = record((await this.call("GET", path)).json);
      all.push(...list(body.repositories).map(repositoryFrom));
      const next: unknown = body.next_cursor;
      cursor = typeof next === "string" && next.length > 0 ? next : null;
      if (cursor !== null) {
        if (seen.has(cursor)) throw new HostError("unreachable", { code: "malformed_answer", words: null });
        seen.add(cursor);
      }
    } while (cursor !== null);
    return all;
  }

  /** `GET /api/v1/host/repositories/:id`, with its read-only state and
   * the `spex` branch's. */
  async repository(id: string): Promise<HostRepositoryDetail> {
    const body = record((await this.call("GET", `/api/v1/host/repositories/${encodeURIComponent(id)}`)).json);
    return detailFrom(body);
  }

  /** `GET /api/v1/host/repositories/:id/members` (git-host-8). */
  async members(id: string): Promise<{ members: HostMember[]; membersUrl: string }> {
    const body = record((await this.call("GET", `/api/v1/host/repositories/${encodeURIComponent(id)}/members`)).json);
    return { members: list(body.members).map(memberFrom), membersUrl: text(body.members_url) };
  }

  /**
   * `POST /api/v1/host/repositories` (git-host-6): `name` is the whole
   * repository name, `<name>-spex`; `groupId` null means the person's own
   * group. A taken name throws `name_taken`.
   */
  async create(input: { groupId: string | null; name: string; description: string }): Promise<{ status: "created"; repository: HostRepository } | { status: "pending"; message: string }> {
    const answer = await this.call("POST", "/api/v1/host/repositories", { group_id: input.groupId, name: input.name, description: input.description });
    const body = record(answer.json);
    if (answer.status === 202) return { status: "pending", message: pendingWords(body) };
    if (body.status !== "created") throw new HostError("unreachable", { code: "malformed_answer", status: answer.status });
    return { status: "created", repository: repositoryFrom(body.repository) };
  }

  /** `POST /api/v1/host/repositories/:id/spex-branch` (git-host-7). */
  async prepareBranch(id: string): Promise<{ status: "ready" } | { status: "pending"; message: string }> {
    const answer = await this.call("POST", `/api/v1/host/repositories/${encodeURIComponent(id)}/spex-branch`, {});
    const body = record(answer.json);
    if (answer.status === 202) return { status: "pending", message: pendingWords(body) };
    if (body.status !== "ready") throw new HostError("unreachable", { code: "malformed_answer", status: answer.status });
    return { status: "ready" };
  }

  /** `POST /api/v1/host/credential` (git-host-9): the Git credential for
   * the host's Git origin, with its expiry in Unix milliseconds. */
  async credential(origin: string): Promise<{ username: string; secret: string; expiresAt: number }> {
    const body = record((await this.call("POST", "/api/v1/host/credential", { origin })).json);
    const expiresAt = Date.parse(text(body.expires_at));
    return { username: text(body.username), secret: text(body.secret), expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0 };
  }

  // -------------------------------------------------------------------------

  private claimSignIn(): object {
    if (this.signIn) throw new SignInBusyError();
    const slot = {};
    this.signIn = slot;
    return slot;
  }

  private releaseSignIn(slot: object): void {
    if (this.signIn === slot) this.signIn = null;
  }

  /** Store the issued app token, then read the person with it; a person
   * the host does not return leaves nothing stored. */
  private async completeSignIn(answer: Answer): Promise<HostAccount> {
    const credential = tokenFrom(answer, this.now());
    await this.credentials.write(credential);
    try {
      const me = await this.send("GET", "/api/v1/host/me", { bearer: credential.access });
      if (me.status !== 200) throw answerError(me);
      return accountFrom(me.json);
    } catch (error) {
      await this.credentials.remove().catch(() => undefined);
      throw error;
    }
  }

  /** A host route with the bearer kept current (git-host-4). Only a
   * success, `202` included, comes back; everything else throws. */
  private async call(method: string, path: string, body?: unknown): Promise<Answer> {
    let credential = await this.current();
    let answer = await this.send(method, path, { body, bearer: credential.access });
    if (answer.status === 401 && codeOf(answer) === "token_expired") {
      credential = await this.refresh(credential);
      answer = await this.send(method, path, { body, bearer: credential.access });
    }
    if (answer.status === 401 || REAUTH_CODES.has(codeOf(answer) ?? "")) {
      await this.signOutLocally();
      throw new HostError("reauth", { code: codeOf(answer), words: wordsOf(answer), status: answer.status });
    }
    if (answer.status < 200 || answer.status >= 300) throw answerError(answer);
    return answer;
  }

  private async current(): Promise<StoredCredential> {
    const stored = await this.credentials.read();
    if (!stored) throw new HostError("reauth", { code: "signed_out" });
    if (stored.accessExpiresAt - this.now() < REFRESH_MARGIN_MS) return this.refresh(stored);
    return stored;
  }

  /** One refresh at a time: a caller arriving while one runs joins it,
   * and one arriving after it finds the rotated pair already stored. */
  private refresh(stale: StoredCredential): Promise<StoredCredential> {
    if (this.refreshing) return this.refreshing;
    const tracked: Promise<StoredCredential> = this.runRefresh(stale).finally(() => {
      if (this.refreshing === tracked) this.refreshing = null;
    });
    this.refreshing = tracked;
    return tracked;
  }

  private async runRefresh(stale: StoredCredential): Promise<StoredCredential> {
    const latest = await this.credentials.read();
    if (!latest) throw new HostError("reauth", { code: "signed_out" });
    if (latest.access !== stale.access && latest.accessExpiresAt - this.now() >= REFRESH_MARGIN_MS) return latest;
    const answer = await this.send("POST", "/api/v1/auth/token", {
      body: { grant_type: "refresh_token", refresh_token: latest.refresh, client_id: this.clientId },
    });
    if (answer.status === 200) {
      const next = tokenFrom(answer, this.now());
      await this.credentials.write(next);
      return next;
    }
    const error = answerError(answer);
    if (error.kind === "unreachable" || error.kind === "rate_limited") throw error;
    await this.signOutLocally();
    throw new HostError("reauth", { code: codeOf(answer), words: wordsOf(answer), status: answer.status });
  }

  private async signOutLocally(): Promise<void> {
    await this.credentials.remove();
    try {
      this.onSignedOut?.("reauth");
    } catch {
      // The listener's failure is its own.
    }
  }

  private async send(method: string, path: string, init: { body?: unknown; bearer?: string }): Promise<Answer> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.bearer !== undefined) headers.authorization = `Bearer ${init.bearer}`;
    let response: Response;
    let raw: string;
    try {
      response = await this.fetchImpl(`${this.url}${path}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "manual",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      raw = await response.text();
    } catch {
      throw new HostError("unreachable", { code: null, words: null });
    }
    let json: unknown = null;
    if (raw.length > 0) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json, retryAfter: response.headers.get("retry-after") };
  }
}

// ---------------------------------------------------------------------------
// Wire shapes: snake_case in, camelCase out

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new HostError("unreachable", { code: "malformed_answer" });
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new HostError("unreachable", { code: "malformed_answer" });
  return value;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new HostError("unreachable", { code: "malformed_answer" });
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function flag(value: unknown): boolean {
  return value === true;
}

function optionalFlag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function accountFrom(value: unknown): HostAccount {
  const body = record(value);
  return { id: text(body.id), login: text(body.login), displayName: optionalText(body.display_name) };
}

function groupFrom(value: unknown): HostGroup {
  const body = record(value);
  return {
    id: optionalText(body.id),
    fullPath: text(body.full_path),
    name: text(body.name),
    url: optionalText(body.url),
    kind: body.kind === "user" ? "user" : "group",
  };
}

function repositoryFrom(value: unknown): HostRepository {
  const body = record(value);
  return {
    id: text(body.id),
    name: text(body.name),
    path: text(body.path),
    group: groupFrom(body.group),
    remoteUrl: text(body.remote_url),
    webUrl: text(body.web_url),
    visibility: text(body.visibility),
    archived: flag(body.archived),
    empty: flag(body.empty),
    lfs: flag(body.lfs),
    spexBranch: flag(body.spex_branch),
    project: isRecord(body.project) ? body.project : null,
  };
}

function detailFrom(body: Record<string, unknown>): HostRepositoryDetail {
  const readOnly = isRecord(body.read_only)
    ? { reason: body.read_only.reason === "archived" ? "archived" as const : "access" as const, message: optionalText(body.read_only.message) ?? "" }
    : null;
  const branch = isRecord(body.branch) ? body.branch : {};
  return {
    ...repositoryFrom(body),
    readOnly,
    branch: {
      present: flag(branch.present),
      canPush: optionalFlag(branch.can_push),
      protected: optionalFlag(branch.protected),
      blocked: flag(branch.blocked),
    },
  };
}

function memberFrom(value: unknown): HostMember {
  const body = record(value);
  return {
    id: text(body.id),
    login: text(body.login),
    displayName: optionalText(body.display_name),
    role: text(body.role),
    url: optionalText(body.url),
  };
}

function tokenFrom(answer: Answer, now: number): StoredCredential {
  const body = record(answer.json);
  return {
    access: text(body.access_token),
    accessExpiresAt: now + positive(body.expires_in, 3600) * 1000,
    refresh: text(body.refresh_token),
  };
}

function pendingWords(body: Record<string, unknown>): string {
  return optionalText(body.message) ?? "";
}

/** The envelope `{error: {code, message}}`, or OAuth's flat `{error,
 * error_description}`. */
function envelopeOf(answer: Answer): { code: string | null; message: string | null } {
  if (!isRecord(answer.json)) return { code: null, message: null };
  const error = answer.json.error;
  if (isRecord(error)) return { code: optionalText(error.code), message: optionalText(error.message) };
  if (typeof error === "string") return { code: error, message: optionalText(answer.json.error_description) };
  return { code: null, message: null };
}

function codeOf(answer: Answer): string | null {
  return envelopeOf(answer).code;
}

function wordsOf(answer: Answer): string | null {
  return envelopeOf(answer).message;
}

/** A failure answer as its kind (git-host-4, git-host-11). */
function answerError(answer: Answer): HostError {
  const { code, message } = envelopeOf(answer);
  const base = { code, words: message, status: answer.status };
  if (answer.status === 429 || code === "rate_limited") return new HostError("rate_limited", { ...base, retryAfter: answer.retryAfter });
  if (code === "provider_unavailable" || answer.status >= 500) return new HostError("unreachable", base);
  if (code === "name_taken" || answer.status === 409) return new HostError("name_taken", base);
  if (code === "not_found" || answer.status === 404) return new HostError("not_found", base);
  if (code === "host_refused") return new HostError("host_refused", base);
  if (code !== null && REAUTH_CODES.has(code)) return new HostError("reauth", base);
  if (answer.status === 401) return new HostError("reauth", base);
  if (code === "bad_request" || answer.status === 400) return new HostError("bad_request", base);
  return new HostError("host_refused", base);
}

/** A refused token exchange ends the sign-in `refused` with the host's
 * words; no answer ends it `unreachable`. */
function exchangeError(answer: Answer): HostError {
  const error = answerError(answer);
  if (error.kind === "unreachable" || error.kind === "rate_limited") {
    return new HostError("unreachable", { code: error.code, words: error.words, status: error.status, retryAfter: error.retryAfter, cause: "unreachable" });
  }
  return signInError("refused", { code: error.code, words: error.words, status: error.status });
}

function signInError(cause: SignInCause, extra: { code?: string | null; words?: string | null; status?: number | null } = {}): HostError {
  return new HostError(cause === "unreachable" ? "unreachable" : "reauth", { ...extra, cause });
}

function asSignInError(error: unknown): HostError {
  if (error instanceof HostError) {
    if (error.cause) return error;
    if (error.kind === "unreachable" || error.kind === "rate_limited") {
      return new HostError("unreachable", { code: error.code, words: error.words, status: error.status, cause: "unreachable" });
    }
    return signInError("refused", { code: error.code, words: error.words, status: error.status });
  }
  return new HostError("unreachable", { cause: "unreachable" });
}

function respond(response: ServerResponse, status: number, body: string, after: () => void): void {
  response.on("finish", after);
  response.on("close", after);
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    connection: "close",
  });
  response.end(body);
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}
