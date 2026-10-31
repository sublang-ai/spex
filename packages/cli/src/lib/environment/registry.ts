// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The registry source (environments-12): Spex Space's `/api/v1` for
// format 2 (Spex Space DR-016, DR-017). The version index carries every
// version with its dependencies and artifacts, so a dependency graph
// resolves from indexes alone; a version resource is read only for a
// version picked; files come by raw URL or the release archive, each
// verified by its digest elsewhere. The app token of the instance the
// registry answers for is presented as a bearer where the home is signed
// in there; an answer refusing it as the instance's sign-out is reported
// with the token it refused (environments-12, DR-127).

import { canonicalOrigin } from "../instance.js";
import { isPackageName } from "./format.js";

export type RegistryErrorKind = "not_found" | "forbidden" | "unauthenticated" | "unavailable" | "unreadable" | "format" | "rejected";

export class RegistryError extends Error {
  constructor(
    readonly kind: RegistryErrorKind,
    /** The spec package the answer was about, where there is one. */
    readonly packageName: string | undefined,
    message: string,
    /** The registry's error code and issues, for a refused publish. */
    readonly code?: string,
    readonly details?: unknown[],
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

export interface IndexArtifact {
  kind: string;
  language?: string;
  languages: string[];
}

export interface VersionIndexEntry {
  version: string;
  format: number;
  published_at?: string;
  checksum: string;
  yanked: boolean;
  suppressed: boolean;
  dependencies: Record<string, string>;
  artifacts: Record<string, IndexArtifact>;
}

export interface VersionIndex {
  org: string;
  name: string;
  latest?: string | null;
  versions: VersionIndexEntry[];
}

export interface ResourceArtifact extends IndexArtifact {
  from?: string;
  requires?: string[];
  "generated-by"?: { agent: string; model: string };
}

export interface VersionResource {
  org: string;
  name: string;
  version: string;
  format: number;
  description?: string;
  license?: string;
  repository?: string;
  languages?: string[];
  artifacts: Record<string, ResourceArtifact>;
  dependencies: Record<string, string>;
  checksum: string;
  size?: number;
  published_at?: string;
  yanked: boolean;
  suppressed: boolean;
  files?: { path: string; size: number; sha256: string; executable: boolean }[];
  dist?: { tarball: string; sha256: string };
}

export interface SearchResult {
  name: string;
  description: string;
  versions: string[];
}

/** An org the signed-in person may publish to (environments-27): its
 * name, its group's path in the instance, and the person's role there. */
export interface RegistryOrg {
  provider?: string;
  name: string;
  path: string;
  role: string;
}

/** How long the core waits for the registry's orgs (environments-27). */
export const ORGS_TIMEOUT_MS = 2_000;

/** What resolving and installing read from a registry (environments-12),
 * served by Spex Space, the stand-in and the built-in spec package alike. */
export interface RegistrySource {
  /** The registry the lock names in a registry source. */
  readonly url: string;
  index(name: string): Promise<VersionIndex>;
  version(name: string, version: string): Promise<VersionResource>;
  file(name: string, version: string, path: string): Promise<Uint8Array>;
  archive(name: string, version: string): Promise<Uint8Array>;
  publish(name: string, version: string, tgz: Uint8Array): Promise<void>;
  search(query: string): Promise<SearchResult[]>;
}

/** The only manifest format this client reads (DR-104 schema versions). */
export const KNOWN_FORMAT = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitName(name: string): [string, string] {
  if (!isPackageName(name)) throw new RegistryError("not_found", name, `"${name}" is not a <org>/<pkg> name`);
  return name.split("/") as [string, string];
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function readArtifacts(raw: unknown): Record<string, IndexArtifact> | undefined {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, IndexArtifact> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isPlainObject(value) || typeof value.kind !== "string") return undefined;
    const languages = Array.isArray(value.languages) ? value.languages.filter((item): item is string => typeof item === "string")
      : typeof value.language === "string" ? [value.language] : [];
    out[id] = {
      ...(value as Record<string, unknown>),
      kind: value.kind,
      ...(typeof value.language === "string" ? { language: value.language } : {}),
      languages,
    } as IndexArtifact;
  }
  return out;
}

function readDependencies(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw) || !Object.values(raw).every((value) => typeof value === "string")) return undefined;
  return raw as Record<string, string>;
}

/** Validate a version index answer, or throw `unreadable`. */
export function readVersionIndex(name: string, raw: unknown): VersionIndex {
  const unreadable = (why: string): RegistryError => new RegistryError("unreadable", name, `the registry's version index for ${name} is unreadable: ${why}`);
  if (!isPlainObject(raw) || !Array.isArray(raw.versions)) throw unreadable("no versions");
  const versions: VersionIndexEntry[] = [];
  for (const entry of raw.versions) {
    if (!isPlainObject(entry) || typeof entry.version !== "string" || typeof entry.checksum !== "string") throw unreadable("an entry lacks version or checksum");
    const dependencies = readDependencies(entry.dependencies);
    const artifacts = readArtifacts(entry.artifacts);
    if (!dependencies || !artifacts) throw unreadable(`version ${entry.version} has unreadable dependencies or artifacts`);
    versions.push({
      version: entry.version,
      format: typeof entry.format === "number" ? entry.format : -1,
      ...(typeof entry.published_at === "string" ? { published_at: entry.published_at } : {}),
      checksum: entry.checksum,
      yanked: entry.yanked === true,
      suppressed: entry.suppressed === true,
      dependencies,
      artifacts,
    });
  }
  const [org, pkg] = name.split("/") as [string, string];
  return { org: typeof raw.org === "string" ? raw.org : org, name: typeof raw.name === "string" ? raw.name : pkg, latest: typeof raw.latest === "string" ? raw.latest : null, versions };
}

/** Validate a version resource answer: a format this client does not
 * know is refused naming it (environments-12). */
export function readVersionResource(name: string, version: string, raw: unknown): VersionResource {
  const unreadable = (why: string): RegistryError => new RegistryError("unreadable", name, `the registry's answer for ${name} ${version} is unreadable: ${why}`);
  if (!isPlainObject(raw)) throw unreadable("not an object");
  if (raw.format !== KNOWN_FORMAT) {
    throw new RegistryError("format", name, `${name} ${version} is in format ${JSON.stringify(raw.format ?? null)}, which this Spex does not read`);
  }
  if (typeof raw.version !== "string" || typeof raw.checksum !== "string") throw unreadable("no version or checksum");
  const dependencies = readDependencies(raw.dependencies);
  const artifacts = readArtifacts(raw.artifacts);
  if (!dependencies || !artifacts) throw unreadable("unreadable dependencies or artifacts");
  let files: VersionResource["files"];
  if (raw.files !== undefined) {
    if (!Array.isArray(raw.files)) throw unreadable("files is not a list");
    files = raw.files.map((file) => {
      if (!isPlainObject(file) || typeof file.path !== "string" || typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256)) {
        throw unreadable("a file entry lacks path or sha256");
      }
      return { path: file.path, size: typeof file.size === "number" ? file.size : 0, sha256: file.sha256, executable: file.executable === true };
    });
  }
  return {
    ...(raw as Record<string, unknown>),
    org: String(raw.org ?? name.split("/")[0]),
    name: String(raw.name ?? name.split("/")[1]),
    version: raw.version,
    format: KNOWN_FORMAT,
    artifacts: artifacts as Record<string, ResourceArtifact>,
    dependencies,
    checksum: raw.checksum,
    yanked: raw.yanked === true,
    suppressed: raw.suppressed === true,
    ...(files ? { files } : {}),
    ...(isPlainObject(raw.dist) && typeof raw.dist.tarball === "string" ? { dist: { tarball: raw.dist.tarball, sha256: String(raw.dist.sha256 ?? raw.checksum) } } : {}),
  } as VersionResource;
}

/** The codes a registry refuses an instance's token with that sign that
 * instance out (environments-12, git-host-4); `token_expired` is not one
 * of them, an expired access secret being a failure of its call. */
export const SIGN_OUT_CODES: readonly string[] = ["invalid_token", "token_revoked", "reauth_required"];

export interface RegistryDescriptor { origin: string; displayName: string; providers: string[] }
export interface SpaceDirectoryEntry { origin: string; displayName: string; signIn: string[] }

export interface RegistryClientOptions {
  url: string;
  /** The app token of the instance the registry answers for, where the
   * home is signed in there; a getter that throws fails the call as
   * `unavailable`. */
  token?: () => Promise<string | null>;
  /** Told the token a call presented when the registry refused it with
   * one of `SIGN_OUT_CODES`, before that call fails (environments-12):
   * awaited; where it throws — the token no longer the instance's stored
   * one (git-host-4) — the call fails with what it threw in place of the
   * registry's words, still `unauthenticated`. */
  refused?: (token: string, code: string) => void | Promise<void>;
  fetch?: typeof fetch;
}

/** Spex Space over HTTP (environments-12). */
export class RegistryClient implements RegistrySource {
  readonly url: string;
  private readonly token?: () => Promise<string | null>;
  private readonly refused?: (token: string, code: string) => void | Promise<void>;
  private readonly fetcher: typeof fetch;

  constructor(options: RegistryClientOptions) {
    this.url = options.url.replace(/\/+$/, "");
    this.token = options.token;
    this.refused = options.refused;
    this.fetcher = options.fetch ?? fetch;
  }

  /** Public discovery never presents a stored credential. */
  private async discovery(path: string): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.url}${path}`, { headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(ORGS_TIMEOUT_MS) });
    if (!response.ok) throw new RegistryError("unavailable", undefined, `service discovery answered ${response.status}`);
    const raw: unknown = await response.json();
    if (!isPlainObject(raw)) throw new RegistryError("unreadable", undefined, "service discovery is unreadable");
    return raw;
  }

  async describe(): Promise<RegistryDescriptor> {
    const raw = await this.discovery("/api/v1/registry");
    if (typeof raw.origin !== "string" || typeof raw.display_name !== "string" || !Array.isArray(raw.providers) || !raw.providers.every((provider) => typeof provider === "string")) {
      throw new RegistryError("unreadable", undefined, "registry descriptor is unreadable");
    }
    return { origin: canonicalOrigin(raw.origin), displayName: raw.display_name, providers: raw.providers as string[] };
  }

  async spaces(): Promise<SpaceDirectoryEntry[]> {
    const raw = await this.discovery("/api/v1/spaces");
    if (!Array.isArray(raw.spaces)) throw new RegistryError("unreadable", undefined, "Space directory is unreadable");
    return raw.spaces.map((entry: unknown) => {
      if (!isPlainObject(entry) || typeof entry.origin !== "string" || typeof entry.display_name !== "string" || !Array.isArray(entry.sign_in) || !entry.sign_in.every((provider) => typeof provider === "string")) {
        throw new RegistryError("unreadable", undefined, "Space directory is unreadable");
      }
      return { origin: canonicalOrigin(entry.origin), displayName: entry.display_name, signIn: entry.sign_in as string[] };
    });
  }

  private async request(path: string, name: string | undefined, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const about = name ? `${name}: ` : "";
    let token: string | null = null;
    try {
      token = this.token ? await this.token() : null;
    } catch (error) {
      // No token to be had: the call fails as one the registry could
      // not be asked, so a caller with another registry moves on.
      throw new RegistryError("unavailable", name, `${about}${error instanceof Error ? error.message : String(error)}`);
    }
    if (token) headers.set("authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await this.fetcher(`${this.url}${path}`, { ...init, headers, redirect: "manual" });
    } catch (error) {
      throw new RegistryError("unavailable", name, `the registry at ${this.url} is unreachable${name ? ` for ${name}` : ""}: ${(error as Error).message}`);
    }
    if (response.ok) return response;
    let code: string | undefined;
    let message: string | undefined;
    let details: unknown[] | undefined;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown[] } };
      code = body.error?.code;
      message = body.error?.message;
      details = body.error?.details;
    } catch { /* not the envelope */ }
    const said = message ? ` (${message})` : "";
    if (response.status === 404) throw new RegistryError("not_found", name, `${about}not found at the registry, or not readable by this account${said}`, code);
    if (response.status === 410) throw new RegistryError("not_found", name, `${about}suppressed by the registry's operator${said}`, code);
    if (response.status === 401) {
      // A refusal answers the token this call presented (git-host-4); a
      // hook that throws says why the call fails instead.
      if (token && code !== undefined && SIGN_OUT_CODES.includes(code) && this.refused) {
        try {
          await this.refused(token, code);
        } catch (error) {
          throw new RegistryError("unauthenticated", name, `${about}${error instanceof Error ? error.message : String(error)}`, code);
        }
      }
      throw new RegistryError("unauthenticated", name, `${about}the registry did not accept this device's sign-in${said}`, code);
    }
    if (response.status === 403) throw new RegistryError("forbidden", name, `${about}this account may not fetch it from the registry${said}`, code);
    if (response.status === 409 || response.status === 422 || response.status === 413) {
      throw new RegistryError("rejected", name, `${about}the registry refused it${said}`, code, details);
    }
    throw new RegistryError("unavailable", name, `${about}the registry answered ${response.status}${said}`, code);
  }

  private async json(path: string, name: string | undefined, init: RequestInit = {}): Promise<unknown> {
    const response = await this.request(path, name, init);
    try {
      return await response.json();
    } catch (error) {
      throw new RegistryError("unreadable", name, `${name ?? "the registry"}: the registry's answer is not JSON: ${(error as Error).message}`);
    }
  }

  async index(name: string): Promise<VersionIndex> {
    const [org, pkg] = splitName(name);
    return readVersionIndex(name, await this.json(`/api/v1/packages/${org}/${pkg}`, name));
  }

  async version(name: string, version: string): Promise<VersionResource> {
    const [org, pkg] = splitName(name);
    return readVersionResource(name, version, await this.json(`/api/v1/packages/${org}/${pkg}/${encodeURIComponent(version)}`, name));
  }

  async file(name: string, version: string, path: string): Promise<Uint8Array> {
    const [org, pkg] = splitName(name);
    const response = await this.request(`/${org}/${pkg}/${encodeURIComponent(version)}/${encodePath(path)}`, name, { headers: { accept: "*/*" } });
    return new Uint8Array(await response.arrayBuffer());
  }

  async archive(name: string, version: string): Promise<Uint8Array> {
    const [org, pkg] = splitName(name);
    const response = await this.request(`/api/v1/packages/${org}/${pkg}/${encodeURIComponent(version)}/download`, name, { headers: { accept: "application/gzip" } });
    return new Uint8Array(await response.arrayBuffer());
  }

  async publish(name: string, version: string, tgz: Uint8Array): Promise<void> {
    const [org, pkg] = splitName(name);
    await this.request(`/api/v1/packages/${org}/${pkg}/${encodeURIComponent(version)}`, name, {
      method: "PUT",
      headers: { "content-type": "application/gzip" },
      body: tgz as unknown as BodyInit,
    });
  }

  /** The orgs the signed-in person may publish to (environments-27):
   * `GET /api/v1/account/orgs` with the device's app token, read within
   * the timeout; null for no answer — a refusal, any other status, a
   * body not in its shape, a network failure, or none in time. */
  async orgs(timeoutMs = ORGS_TIMEOUT_MS): Promise<RegistryOrg[] | null> {
    const signal = AbortSignal.timeout(timeoutMs);
    const late = new Promise<null>((resolve) => signal.addEventListener("abort", () => resolve(null), { once: true }));
    const asked = (async (): Promise<RegistryOrg[] | null> => {
      const raw = await this.json("/api/v1/account/orgs", undefined, { signal });
      if (!isPlainObject(raw) || !Array.isArray(raw.orgs)) return null;
      const orgs: RegistryOrg[] = [];
      for (const org of raw.orgs) {
        if (!isPlainObject(org) || typeof org.name !== "string" || typeof org.path !== "string" || typeof org.role !== "string") return null;
        orgs.push({ name: org.name, path: org.path, role: org.role, ...(typeof org.provider === "string" ? { provider: org.provider } : {}) });
      }
      return orgs;
    })().catch(() => null);
    return Promise.race([asked, late]);
  }

  async search(query: string): Promise<SearchResult[]> {
    const raw = await this.json(`/api/v1/search?q=${encodeURIComponent(query)}`, undefined);
    const results = isPlainObject(raw) && Array.isArray(raw.results) ? raw.results : [];
    const out: SearchResult[] = [];
    for (const result of results) {
      if (!isPlainObject(result) || typeof result.org !== "string" || typeof result.name !== "string") continue;
      const name = `${result.org}/${result.name}`;
      let versions: string[] = [];
      try {
        versions = (await this.index(name)).versions.filter((entry) => !entry.suppressed && !entry.yanked).map((entry) => entry.version);
      } catch { /* listed without versions */ }
      out.push({ name, description: typeof result.description === "string" ? result.description : "", versions });
    }
    return out;
  }
}
