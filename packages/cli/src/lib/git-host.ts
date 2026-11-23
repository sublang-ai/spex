// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Sign-in, credential storage and personal records requests for a Space.
// Browser sign-in uses PKCE; device sign-in also works without a local
// browser. The client keeps the grant current under local/credentials.yaml.
// A rate limit holds opted-in calls until the Space's retry time.
// It composes no reader-facing prose: a failure is a `HostError` carrying
// its kind and the host's own words, which the core phrases where it
// speaks (git-host-11). No secret ever enters an error message or a log
// line.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { makePrivateDirectory, writeApplicationBytes } from "./files.js";
import { canonicalOrigin } from "./instance.js";
import { words } from "./words.js";

export { DEFAULT_HOST_URL, hostUrlFor } from "./instance.js";

/** The public OAuth client id Spex signs in as. */
export const CLIENT_ID = "spex";

/** An access secret this close to expiring is refreshed first (git-host-4). */
export const REFRESH_MARGIN_MS = 60_000;

/** A browser sign-in without a callback ends `expired` after this long
 * (git-host-2). */
export const BROWSER_SIGN_IN_TIMEOUT_MS = 10 * 60_000;

/** The longest a rate limit holds the calls to the host (git-host-21). */
export const RATE_LIMIT_HOLD_MAX_MS = 120_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SLOW_DOWN_STEP_MS = 5_000;
const LABEL_MAX = 80;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = MONTHS.join("|");
/** The three forms of an HTTP date (RFC 9110 §5.6.7), always GMT. */
const IMF_FIXDATE = new RegExp(`^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\\d{2}) (${MONTH}) (\\d{4}) (\\d{2}):(\\d{2}):(\\d{2}) GMT$`);
const RFC850_DATE = new RegExp(`^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\\d{2})-(${MONTH})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) GMT$`);
const ASCTIME_DATE = new RegExp(`^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (${MONTH}) ( \\d|\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) (\\d{4})$`);

/** An HTTP date as Unix milliseconds, or null where the text is none. */
function httpDate(text: string, now: number): number | null {
  const at = (year: number, month: string, day: string, h: string, m: string, s: string): number | null => {
    const ms = Date.UTC(year, MONTHS.indexOf(month), Number(day), Number(h), Number(m), Number(s));
    return Number.isFinite(ms) ? ms : null;
  };
  let match = IMF_FIXDATE.exec(text);
  if (match) return at(Number(match[3]), match[2], match[1], match[4], match[5], match[6]);
  match = RFC850_DATE.exec(text);
  if (match) {
    // A two-digit year more than 50 years ahead is of the past century.
    const thisYear = new Date(now).getUTCFullYear();
    let year = Math.floor(thisYear / 100) * 100 + Number(match[3]);
    if (year > thisYear + 50) year -= 100;
    return at(year, match[2], match[1], match[4], match[5], match[6]);
  }
  match = ASCTIME_DATE.exec(text);
  if (match) return at(Number(match[6]), match[1], match[2].trim(), match[3], match[4], match[5]);
  return null;
}

/**
 * The seconds a host's `Retry-After` asks to wait (git-host-11): its
 * number where it is all digits, the seconds from `now` until its HTTP
 * date — none below zero — and null where it is absent or anything else.
 */
export function retryAfterSeconds(value: string | null | undefined, now: number = Date.now()): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const at = httpDate(text, now);
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface HostAccount { id: string; login: string; displayName: string | null }

export interface HostDescription { displayName: string; gitOrigin: string }

/** Namespace identity as reported by the Space. */
export interface HostNamespace { fullPath: string; kind: "user" | "group" }

export interface HostRepository {
  id: string;
  name: string;
  path: string;
  group: HostNamespace;
  /** The Git URL the core hands to Git alone (git-host-5, DR-120). */
  remoteUrl: string;
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

export type HostErrorKind =
  | "pending"
  | "name_taken"
  | "host_refused"
  | "not_found"
  | "rate_limited"
  | "reauth"
  | "unreachable"
  | "bad_request";

/** Why a sign-in ended without an account (git-host-2, git-host-3):
 * `account` a person other than the account listed for that Space. */
export type SignInCause = "denied" | "expired" | "stopped" | "refused" | "state" | "unreachable" | "account";

/**
 * A host answer other than success (git-host-11). `words` is the host's
 * own message, kept whole; `retryAfter` the host's `Retry-After` for
 * `rate_limited`, raw, read as seconds by `retryAfterSeconds`; `code`
 * the envelope's `error.code` where one came; and,
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

/** A call's own Stop ended its wait for the host's rate limit before it
 * was sent (git-host-21). Local; not the host's. */
export class HostWaitStopped extends Error {
  readonly code = "stopped";
  constructor() {
    super("Stopped while waiting for the Git host");
    this.name = "HostWaitStopped";
  }
}

/**
 * How a call meets the host's rate limit (git-host-21): one carrying
 * `signal` — a sync step's, whose Stop aborts it and so ends the wait
 * unsent — or `wait` — the host read's — waits the hold out; any other
 * call made while the hold stands is refused at once as `rate_limited`
 * with the seconds that remain.
 */
export interface HostCallOptions {
  signal?: AbortSignal;
  wait?: boolean;
  /** Full-view essentials alone opt into deadline-bounded 429 GET recovery. */
  retryRead?: boolean;
}

/** Only this request's recovery deadline expired, not its ordinary timeout. */
class ReadRecoveryExpired extends Error {}

interface ReadRecovery {
  until: number;
  signal: AbortSignal;
  latest: Answer;
}

/** The pair a step used was no longer the stored one when its answer
 * came (git-host-4, git-host-10, storage-19): nothing was stored or
 * removed, and the step may be made again. Local; not the host's. */
export class CredentialChanged extends Error {
  readonly code = "changed";
  constructor() {
    super("The stored sign-in changed meanwhile");
    this.name = "CredentialChanged";
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

export type AuthScope = "registry" | "space";

export interface StoredCredential { access: string; accessExpiresAt: number; refresh: string }

export interface CredentialStore {
  read(): Promise<StoredCredential | null>;
  /**
   * A versioned write of this host's pair (storage-19, DR-111): `next`,
   * or none, in place of `expected`, the pair the writer read, or none.
   * The file is read, compared and replaced in one synchronous step;
   * false, and nothing written, where it holds another pair.
   */
  replace(expected: StoredCredential | null, next: StoredCredential | null): boolean;
  /**
   * For a sign-out whose read failed (git-host-10, storage-19): remove
   * this host's malformed entry in one synchronous step, other hosts'
   * kept; true where it is gone or none stands, false, and nothing
   * written, where a well-formed pair stands by then. A file of another
   * format is refused.
   */
  removeMalformed?(): boolean;
}

/** Whether two pairs are one, compared in every field. */
function samePair(a: StoredCredential | null, b: StoredCredential | null): boolean {
  if (a === null || b === null) return a === b;
  return a.access === b.access && a.accessExpiresAt === b.accessExpiresAt && a.refresh === b.refresh;
}

interface CredentialsFile { format: 1; hosts: Record<string, unknown> }

/** The path of the credentials file under a home. */
export function credentialsPath(homeDir: string): string {
  return join(homeDir, "local", "credentials.yaml");
}

/**
 * The app token of one instance in `local/credentials.yaml`, exactly
 * `{format: 1, hosts: {<origin>: {access, accessExpiresAt, refresh}}}`
 * Space entries keyed by canonical origin; registry entries keyed by
 * `registry:<origin>` (DR-168), with no implicit scope upgrade,
 * written atomically with owner-only permissions under a `local/` made
 * owner-only (storage-19). A file of another format is refused, never
 * guessed at or overwritten, and no refusal or warning repeats the file's
 * content, a secret among it: the format is named only where it is a
 * number. Other instances' entries are kept; removing
 * the last one removes the file. Every access is synchronous, so a
 * replacement's read, comparison and rename leave no await between them.
 */
export function fileCredentialStore(homeDir: string, hostUrl: string, scope: AuthScope = "space"): CredentialStore {
  const dir = join(homeDir, "local");
  const file = credentialsPath(homeDir);
  const origin = canonicalOrigin(hostUrl);
  const key = scope === "space" ? origin : `registry:${origin}`;

  function load(): CredentialsFile | null {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let doc: unknown;
    try {
      // At "error" the parser emits no warning, each quoting the file,
      // yet still throws where the YAML will not read; "silent" would
      // read it. Its words are never repeated.
      doc = parseYaml(text, { logLevel: "error" });
    } catch {
      throw new Error(`${file} is not valid YAML; it is left as it is`);
    }
    if (!isRecord(doc)) throw new Error(`${file} holds no credentials map; it is left as it is`);
    if (typeof doc.format !== "number") {
      throw new Error(`${file}: ${words().unsupportedUnnamedFormat()}`);
    }
    if (doc.format !== 1) {
      throw new Error(`${file} has format ${JSON.stringify(doc.format ?? null)}, which this version of Spex does not read; it is left as it is`);
    }
    if (!isRecord(doc.hosts)) throw new Error(`${file} has no hosts map; it is left as it is`);
    return { format: 1, hosts: { ...doc.hosts } };
  }

  function entryOf(doc: CredentialsFile | null): StoredCredential | null {
    const entry = doc?.hosts[key];
    if (entry === undefined) return null;
    if (!isRecord(entry) || typeof entry.access !== "string" || typeof entry.refresh !== "string"
      || typeof entry.accessExpiresAt !== "number" || !Number.isFinite(entry.accessExpiresAt)) {
      throw new Error(`${file} holds a malformed entry for ${key}; it is left as it is`);
    }
    return { access: entry.access, accessExpiresAt: entry.accessExpiresAt, refresh: entry.refresh };
  }

  /** Write `doc` with this host's pair set to `next` or removed. */
  function save(doc: CredentialsFile, next: StoredCredential | null): true {
    if (next === null) {
      if (!(key in doc.hosts)) return true;
      delete doc.hosts[key];
    } else {
      doc.hosts[key] = { access: next.access, accessExpiresAt: next.accessExpiresAt, refresh: next.refresh };
    }
    if (Object.keys(doc.hosts).length === 0) {
      rmSync(file, { force: true });
      return true;
    }
    makePrivateDirectory(dir);
    writeApplicationBytes(file, stringifyYaml({ format: 1, hosts: doc.hosts }));
    return true;
  }

  return {
    read: async () => entryOf(load()),
    replace: (expected, next) => {
      const doc = load() ?? { format: 1, hosts: {} };
      if (!samePair(entryOf(doc), expected)) return false;
      // The same-pair CAS is also a synchronous, write-free continuity check.
      if (samePair(expected, next)) return true;
      return save(doc, next);
    },
    removeMalformed: () => {
      const doc = load();
      if (doc === null) return true;
      try {
        if (entryOf(doc) !== null) return false;
      } catch {
        return save(doc, null);
      }
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// The client

export interface GitHostClientOptions {
  url: string;
  scope?: AuthScope;
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
  /** Called when an answer of 429 sets the instant the calls are held
   * until (git-host-21), with that instant in Unix milliseconds. */
  onHold?: (until: number) => void;
  /** Test seam (git-host-21): the hold and per-request recovery bounds;
   * 120 s by default. */
  holdMaxMs?: number;
}

/** Whether a sign-in may store its token for the person it read
 * (git-host-2): null admits them; a refusal ends the sign-in `failed`
 * with it, storing nothing. Called in the turn that would store it. */
export type AdmitAccount = (account: HostAccount) => HostError | null;

/** The refusal of a sign-in at a listed instance as another person than
 * its entry's account (git-host-2): `words` carries the entry's login. */
export function anotherAccountError(login: string): HostError {
  return signInError("account", { words: login });
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
  /** The seconds between polls the host named (git-host-3). */
  interval: number;
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

/** An app token a sign-in was issued, and the person it reads as. */
interface Issued { credential: StoredCredential; account: HostAccount }

const REAUTH_CODES = new Set(["invalid_token", "token_revoked", "reauth_required", "unauthenticated", "token_expired"]);

/**
 * The client of one Git host. Every call to a host route presents the
 * stored access secret and keeps the app token current (git-host-4);
 * `describe()` alone needs no token.
 */
export class GitHostClient {
  readonly url: string;
  readonly scope: AuthScope;
  private readonly clientId: string;
  private readonly label: string;
  private readonly credentials: CredentialStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly onSignedOut?: (cause: HostErrorKind) => void;
  private readonly requestTimeoutMs: number;
  private readonly onHold?: (until: number) => void;
  private readonly holdMaxMs: number;
  private refreshing: Promise<StoredCredential> | null = null;
  private signIn: object | null = null;
  /** The instant the host's last rate limit asked every call to wait
   * until (git-host-21); 0 where none holds. */
  private holdUntil = 0;

  constructor(options: GitHostClientOptions) {
    this.url = trimUrl(options.url);
    this.scope = options.scope ?? "space";
    this.clientId = options.clientId ?? CLIENT_ID;
    const label = options.label.trim();
    this.label = (label.length > 0 ? label : "Spex").slice(0, LABEL_MAX);
    this.credentials = options.credentials;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.onSignedOut = options.onSignedOut;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.onHold = options.onHold;
    this.holdMaxMs = options.holdMaxMs ?? RATE_LIMIT_HOLD_MAX_MS;
  }

  /** Whether the host's rate limit holds the calls now (git-host-21). */
  holding(): boolean {
    return this.holdUntil > this.now();
  }

  /** `GET /api/v1/host`: the host's display name, the Git origin its
   * credentials are valid for (git-host-5). */
  async describe(options: HostCallOptions = {}): Promise<HostDescription> {
    const answer = await this.send("GET", "/api/v1/host", options);
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
  async startBrowserSignIn(options: { timeoutMs?: number; pages?: CallbackPages; admit?: AdmitAccount } = {}): Promise<BrowserSignIn> {
    const { slot, expected } = await this.beginSignIn();
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
      scope: this.scope,
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
      void this.answerCallback(target.searchParams, { state, verifier, redirectUri, isSettled: () => settled }).then((answered) => {
        if (settled) {
          respond(response, 410, pages.failed, close);
          return;
        }
        // Stored and ended in one turn: no cancel falls between them.
        const outcome = "issued" in answered ? this.publish(expected, answered.issued, options.admit) : answered;
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
  ): Promise<{ issued: Issued } | { error: HostError }> {
    try {
      if (params.get("state") !== flow.state) return { error: signInError("state") };
      const error = params.get("error");
      if (error !== null) {
        return { error: signInError(error === "access_denied" ? "denied" : "refused", { code: error, words: params.get("error_description") }) };
      }
      const code = params.get("code");
      if (!code) return { error: signInError("refused") };
      const answer = await this.send("POST", "/api/v1/auth/token", {
        body: { scope: this.scope, grant_type: "authorization_code", code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri, client_id: this.clientId },
      });
      if (flow.isSettled()) return { error: signInError("stopped") };
      if (answer.status !== 200) return { error: exchangeError(answer) };
      return { issued: await this.issued(answer) };
    } catch (error) {
      return { error: asSignInError(error) };
    }
  }

  /**
   * The device flow (git-host-3): the host's user code and verification
   * URL, completed with the code where the host gives it, then polling the token endpoint at its interval, five seconds
   * slower on each `slow_down`, until the token, a denial or the expiry.
   */
  async startDeviceSignIn(options: { admit?: AdmitAccount } = {}): Promise<DeviceSignIn> {
    const { slot, expected } = await this.beginSignIn();
    let start: { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number };
    try {
      const answer = await this.send("POST", "/api/v1/auth/device", { body: { scope: this.scope, client_id: this.clientId, label: this.label } });
      if (answer.status !== 200) throw answerError(answer);
      const body = record(answer.json);
      start = {
        deviceCode: text(body.device_code),
        userCode: text(body.user_code),
        // The URL completed with the code where the host gives one,
        // so the person never types it (git-host-3).
        verificationUri: optionalText(body.verification_uri_complete) || text(body.verification_uri),
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
            body: { scope: this.scope, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: start.deviceCode, client_id: this.clientId },
          });
        } catch {
          continue; // no answer: keep polling until the code expires
        }
        if (settled) return;
        if (answer.status === 200) {
          let answered: { issued: Issued } | { error: HostError };
          try {
            answered = { issued: await this.issued(answer) };
          } catch (error) {
            answered = { error: asSignInError(error) };
          }
          if (settled) return;
          // Stored and ended in one turn: no cancel falls between them.
          end("issued" in answered ? this.publish(expected, answered.issued, options.admit) : answered);
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
      interval: start.interval,
      done,
      cancel: () => end({ error: signInError("stopped") }),
    };
  }

  /**
   * Sign this device out (git-host-10): revoke it at the host with its
   * app token, tried once, and remove that pair either way, calling
   * `onRemoved` in the same turn as the removal. Where another pair was
   * stored in its place meanwhile, that pair stays, `onRemoved` is not
   * called, and `CredentialChanged` is thrown. A malformed entry, which
   * cannot be read, is removed unless a well-formed pair stands by then.
   */
  async signOut(onRemoved?: () => void): Promise<void> {
    let credential: StoredCredential | null = null;
    try {
      credential = await this.credentials.read();
    } catch (error) {
      if (!this.credentials.removeMalformed) throw error;
      if (!this.credentials.removeMalformed()) throw new CredentialChanged();
      onRemoved?.();
      return;
    }
    if (credential) {
      const stored = credential;
      try {
        // An expired access secret cannot revoke; a fresh one can.
        const fresh = async (): Promise<string | null> => {
          const answer = await this.send("POST", "/api/v1/auth/token", {
            body: { scope: this.scope, grant_type: "refresh_token", refresh_token: stored.refresh, client_id: this.clientId },
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
          const answer = await this.send("POST", "/api/v1/auth/revoke", { bearer: access, body: { scope: this.scope } });
          if (!refreshed && answer.status === 401 && codeOf(answer) === "token_expired") {
            const next = await fresh();
            if (next !== null) await this.send("POST", "/api/v1/auth/revoke", { bearer: next, body: { scope: this.scope } });
          }
        }
      } catch {
        // No answer: tried once, and the credential goes either way.
      }
    }
    if (!this.credentials.replace(credential, null)) throw new CredentialChanged();
    onRemoved?.();
  }

  /** Whether no pair is stored for this host now, read synchronously so
   * a caller acts on it in the same turn. */
  holdsNone(): boolean {
    return this.credentials.replace(null, null);
  }

  /** The selected purpose's account; registry identity needs no host API. */
  async me(options: HostCallOptions = {}): Promise<HostAccount> {
    return accountFrom((await this.call("GET", (this.scope === "registry" ? "/api/v1/whoami?scope=registry" : "/api/v1/host/me"), undefined, options)).json);
  }

  /** `GET /api/v1/host/repositories`, every page. */
  async repositories(options: HostCallOptions = {}): Promise<HostRepository[]> {
    const all: HostRepository[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const path: string = cursor === null ? "/api/v1/host/repositories" : `/api/v1/host/repositories?cursor=${encodeURIComponent(cursor)}`;
      const body = record((await this.call("GET", path, undefined, options)).json);
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
  async repository(id: string, options: HostCallOptions = {}): Promise<HostRepositoryDetail> {
    const body = record((await this.call("GET", `/api/v1/host/repositories/${encodeURIComponent(id)}`, undefined, options)).json);
    return detailFrom(body);
  }

  /**
   * `POST /api/v1/host/repositories` (git-host-6): `name` is the whole
   * repository name, `<name>-spex`; creation uses the authenticated account’s namespace. A taken name throws `name_taken`.
   */
  async create(input: { name: string; description: string }): Promise<{ status: "created"; repository: HostRepository } | { status: "pending"; message: string }> {
    const answer = await this.call("POST", "/api/v1/host/repositories", { group_id: null, name: input.name, description: input.description });
    const body = record(answer.json);
    if (answer.status === 202) return { status: "pending", message: pendingWords(body) };
    if (body.status !== "created") throw new HostError("unreachable", { code: "malformed_answer", status: answer.status });
    return { status: "created", repository: repositoryFrom(body.repository) };
  }

  /** `POST /api/v1/host/repositories/:id/spex-branch` (git-host-7). */
  async prepareBranch(id: string, options: HostCallOptions = {}): Promise<{ status: "ready" } | { status: "pending"; message: string }> {
    const answer = await this.call("POST", `/api/v1/host/repositories/${encodeURIComponent(id)}/spex-branch`, {}, options);
    const body = record(answer.json);
    if (answer.status === 202) return { status: "pending", message: pendingWords(body) };
    if (body.status !== "ready") throw new HostError("unreachable", { code: "malformed_answer", status: answer.status });
    return { status: "ready" };
  }

  /** `POST /api/v1/host/credential` (git-host-9): the Git credential for
   * the host's Git origin, with its expiry in Unix milliseconds. */
  async credential(origin: string, options: HostCallOptions = {}): Promise<{ username: string; secret: string; expiresAt: number }> {
    const body = record((await this.call("POST", "/api/v1/host/credential", { origin }, options)).json);
    const expiresAt = Date.parse(text(body.expires_at));
    return { username: text(body.username), secret: text(body.secret), expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0 };
  }

  /**
   * The access secret a call to the host presents now, for a client of
   * the same host outside this one — the registry (environments-12):
   * kept current as every call's is (git-host-4), refreshed first where
   * it is within a minute of expiring; null where this device holds no
   * app token, or the host refused the refresh and so signed it out.
   * An unreachable host or a rate limit is thrown as the host answered.
   */
  async accessSecret(): Promise<string | null> {
    if ((await this.credentials.read()) === null) return null;
    try {
      return (await this.current()).access;
    } catch (error) {
      if (error instanceof HostError && error.kind === "reauth") return null;
      throw error;
    }
  }

  /**
   * A client of the same host outside this one — the registry
   * (environments-12) — was refused `access` with a code that signs the
   * device out: as a refusal of this client's own call does (git-host-4),
   * the pair that presented it is removed and the device signed out of
   * this host alone in one step, `onSignedOut` called; true then. Where
   * it is no longer the stored pair's — a sign-in, a refresh or a
   * sign-out meanwhile — nothing is removed or said, and false comes
   * back: the call stands refused as changed meanwhile.
   */
  async signOutRefused(access: string): Promise<boolean> {
    const stored = await this.credentials.read();
    if (stored === null || stored.access !== access) return false;
    return !(this.signOutLocally(stored, new HostError("reauth")) instanceof CredentialChanged);
  }

  // -------------------------------------------------------------------------

  private claimSignIn(): object {
    if (this.signIn) throw new SignInBusyError();
    const slot = {};
    this.signIn = slot;
    return slot;
  }

  /** Claim the one sign-in, and read the pair it begins over: its token
   * is stored only in that pair's place (git-host-2). */
  private async beginSignIn(): Promise<{ slot: object; expected: StoredCredential | null }> {
    const slot = this.claimSignIn();
    try {
      return { slot, expected: await this.credentials.read() };
    } catch (error) {
      this.releaseSignIn(slot);
      throw error;
    }
  }

  private releaseSignIn(slot: object): void {
    if (this.signIn === slot) this.signIn = null;
  }

  /** The issued app token and the person read with it, nothing stored
   * yet; a person the host does not return throws (git-host-2). */
  private async issued(answer: Answer): Promise<Issued> {
    const credential = tokenFrom(answer, this.now());
    const me = await this.send("GET", (this.scope === "registry" ? "/api/v1/whoami?scope=registry" : "/api/v1/host/me"), { bearer: credential.access });
    if (me.status !== 200) throw answerError(me);
    return { credential, account: accountFrom(me.json) };
  }

  /** Store an issued token in place of the pair its sign-in began over;
   * the caller ends the sign-in in the same turn. A person `admit` refuses
   * ends it with that refusal; and another pair stored meanwhile ends it
   * `stopped`, that pair kept: each stores nothing (git-host-2). */
  private publish(expected: StoredCredential | null, issued: Issued, admit?: AdmitAccount): { account: HostAccount } | { error: HostError } {
    try {
      const refused = admit?.(issued.account);
      if (refused) return { error: refused };
      return this.credentials.replace(expected, issued.credential) ? { account: issued.account } : { error: signInError("stopped") };
    } catch (error) {
      return { error: asSignInError(error) };
    }
  }

  /** A host route with the bearer kept current (git-host-4). Only a
   * success, `202` included, comes back; everything else throws.
   * `signal` ends the call's wait for the host's rate limit (git-host-21). */
  private async call(method: string, path: string, body?: unknown, options: HostCallOptions = {}): Promise<Answer> {
    // A call that does not wait is refused while the hold stands before
    // anything is sent for it, a refresh among them (git-host-21).
    const waits = options.signal !== undefined || options.wait === true;
    if (!waits) this.refuseWhileHeld();
    let credential = await this.current(waits);
    let refreshed = false;
    let recovery: ReadRecovery | undefined;
    const retryableRead = options.retryRead === true && waits && method === "GET"
      && /^\/api\/v1\/host\/(?:me|repositories(?:\?[^/]*|\/[^/?]+)?)$/.test(path);
    const unchanged = (): void => {
      if (options.signal?.aborted) throw new HostWaitStopped();
      if (!this.credentials.replace(credential, credential)) throw new CredentialChanged();
    };
    try {
      for (;;) {
        const answer = await this.send(method, path, {
          body, bearer: credential.access, ...options,
          ...(recovery ? { beforeSend: unchanged, recovery } : {}),
        });
        if (!refreshed && answer.status === 401 && codeOf(answer) === "token_expired") {
          if (recovery) {
            unchanged();
            if (recovery.signal.aborted || this.now() >= recovery.until) throw new ReadRecoveryExpired();
            const signal = options.signal ? AbortSignal.any([recovery.signal, options.signal]) : recovery.signal;
            let expired!: () => void;
            try {
              // A shared refresh keeps its own authority; this caller's wait is bounded.
              credential = await Promise.race([this.refresh(credential, waits), new Promise<never>((_resolve, reject) => {
                expired = () => reject(options.signal?.aborted ? new HostWaitStopped() : new ReadRecoveryExpired());
                signal.addEventListener("abort", expired, { once: true });
                if (signal.aborted) expired();
              })]);
            } finally { signal.removeEventListener("abort", expired); }
          } else credential = await this.refresh(credential, waits);
          refreshed = true;
          continue;
        }
        const seconds = answer.status === 429 ? retryAfterSeconds(answer.retryAfter, this.now()) : null;
        if (answer.status === 429 && retryableRead) {
          recovery ??= { until: this.now() + this.holdMaxMs, signal: AbortSignal.timeout(this.holdMaxMs), latest: answer };
          recovery.latest = answer;
          if (seconds !== null && seconds > 0 && seconds * 1000 <= recovery.until - this.now()) continue;
        }
        if (answer.status === 401 || REAUTH_CODES.has(codeOf(answer) ?? "")) {
          throw this.signOutLocally(credential, new HostError("reauth", { code: codeOf(answer), words: wordsOf(answer), status: answer.status }));
        }
        if (answer.status < 200 || answer.status >= 300) throw answerError(answer);
        return answer;
      }
    } catch (error) {
      if (!(error instanceof ReadRecoveryExpired) || !recovery) throw error;
      unchanged();
      throw answerError(recovery.latest);
    }
  }

  /** The pair a call presents, refreshed first near its expiry; the
   * refresh waits out the host's rate limit where the call does
   * (git-host-21). */
  private async current(waits = false): Promise<StoredCredential> {
    const stored = await this.credentials.read();
    if (!stored) throw new HostError("reauth", { code: "signed_out" });
    if (stored.accessExpiresAt - this.now() < REFRESH_MARGIN_MS) return this.refresh(stored, waits);
    return stored;
  }

  /** One refresh at a time: a caller arriving while one runs joins it,
   * and one arriving after it finds the rotated pair already stored.
   * Where another pair replaced the refreshed one meanwhile, the answer
   * stores and removes nothing, and `CredentialChanged` is thrown. */
  private refresh(stale: StoredCredential, waits = false): Promise<StoredCredential> {
    if (this.refreshing) return this.refreshing;
    const tracked: Promise<StoredCredential> = this.runRefresh(stale, waits).finally(() => {
      if (this.refreshing === tracked) this.refreshing = null;
    });
    this.refreshing = tracked;
    return tracked;
  }

  private async runRefresh(stale: StoredCredential, waits: boolean): Promise<StoredCredential> {
    const latest = await this.credentials.read();
    if (!latest) throw new HostError("reauth", { code: "signed_out" });
    if (latest.access !== stale.access && latest.accessExpiresAt - this.now() >= REFRESH_MARGIN_MS) return latest;
    const answer = await this.send("POST", "/api/v1/auth/token", {
      body: { scope: this.scope, grant_type: "refresh_token", refresh_token: latest.refresh, client_id: this.clientId },
      wait: waits,
    });
    if (answer.status === 200) {
      const next = tokenFrom(answer, this.now());
      if (!this.credentials.replace(latest, next)) throw new CredentialChanged();
      return next;
    }
    const error = answerError(answer);
    if (error.kind === "unreachable" || error.kind === "rate_limited") throw error;
    throw this.signOutLocally(latest, new HostError("reauth", { code: codeOf(answer), words: wordsOf(answer), status: answer.status }));
  }

  /** The host refused `used` (git-host-4): remove it and say the device
   * is signed out in the same turn, giving back `refusal` to throw;
   * where another pair is stored in its place, nothing is removed or
   * said, and `CredentialChanged` comes back instead. */
  private signOutLocally(used: StoredCredential, refusal: HostError): Error {
    if (!this.credentials.replace(used, null)) return new CredentialChanged();
    try {
      this.onSignedOut?.("reauth");
    } catch {
      // The listener's failure is its own.
    }
    return refusal;
  }

  /** Wait out the host's rate limit (git-host-21): until the instant it
   * holds, again where a later answer moves it on meanwhile; `signal`
   * ends the wait. The timer keeps no process alive. */
  private async waitOut(signal?: AbortSignal, recovery?: ReadRecovery): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new HostWaitStopped();
      if (recovery && (recovery.signal.aborted || this.now() >= recovery.until)) throw new ReadRecoveryExpired();
      const ms = this.holdUntil - this.now();
      if (ms <= 0) return;
      try {
        const waiting = recovery ? AbortSignal.any([recovery.signal, ...(signal ? [signal] : [])]) : signal;
        await sleep(ms, undefined, { ref: false, ...(waiting ? { signal: waiting } : {}) });
      } catch {
        if (!signal?.aborted && recovery?.signal.aborted) throw new ReadRecoveryExpired();
        throw new HostWaitStopped();
      }
    }
  }

  /** An answer of 429 holds the calls until the instant it asks for —
   * its time plus its seconds, `holdMaxMs` at most — keeping a later
   * instant already held; none where its seconds are unknown
   * (git-host-21). */
  private hold(retryAfter: string | null, answeredAt: number): void {
    const seconds = retryAfterSeconds(retryAfter, answeredAt);
    if (seconds === null || seconds <= 0) return;
    const until = answeredAt + Math.min(seconds * 1000, this.holdMaxMs);
    if (until <= this.holdUntil) return;
    this.holdUntil = until;
    try {
      this.onHold?.(until);
    } catch {
      // The listener's failure is its own.
    }
  }

  /** A call that does not wait, made while the hold stands, is refused
   * at once as the host asking to wait the seconds that remain
   * (git-host-21). */
  private refuseWhileHeld(): void {
    const ms = this.holdUntil - this.now();
    if (ms > 0) throw new HostError("rate_limited", { code: "rate_limited", retryAfter: String(Math.ceil(ms / 1000)) });
  }

  /** One request to the host. A call carrying a signal, or asked to
   * wait, waits out the host's rate limit first; any other is refused
   * while it holds (git-host-21). */
  private async send(method: string, path: string, init: { body?: unknown; bearer?: string; beforeSend?: () => void; recovery?: ReadRecovery } & HostCallOptions): Promise<Answer> {
    if (init.signal !== undefined || init.wait === true) await this.waitOut(init.signal, init.recovery);
    else this.refuseWhileHeld();
    init.beforeSend?.();
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.bearer !== undefined) headers.authorization = `Bearer ${init.bearer}`;
    let response: Response;
    let raw: string;
    const timeout = AbortSignal.timeout(this.requestTimeoutMs);
    const transport = init.recovery ? AbortSignal.any([timeout, init.recovery.signal]) : timeout;
    try {
      response = await this.fetchImpl(`${this.url}${path}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "manual",
        signal: transport,
      });
      raw = await response.text();
    } catch {
      if (init.recovery?.signal.aborted && transport.reason === init.recovery.signal.reason) throw new ReadRecoveryExpired();
      throw new HostError("unreachable", { code: null, words: null });
    }
    const retryAfter = response.headers.get("retry-after");
    if (response.status === 429) this.hold(retryAfter, this.now());
    let json: unknown = null;
    if (raw.length > 0) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json, retryAfter };
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

function repositoryFrom(value: unknown): HostRepository {
  const body = record(value);
  const namespace = record(body.group);
  return {
    id: text(body.id),
    name: text(body.name),
    path: text(body.path),
    group: { fullPath: text(namespace.full_path), kind: namespace.kind === "user" ? "user" : "group" },
    remoteUrl: text(body.remote_url),
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
