// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Registry grants are independent of Space grants, including at the same
// origin. This manager never creates a Space or changes a placement (DR-168).
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GitHostClient, fileCredentialStore, type BrowserSignIn, type DeviceSignIn, type HostAccount } from "@sublang/spex/git-host";
import { RegistryClient, PUBLIC_REGISTRY_ORIGIN } from "@sublang/spex/environment";
import { canonicalOrigin } from "@sublang/spex/instance";
import { writeApplicationBytes } from "@sublang/spex/files";
import { CoreError } from "./session.js";
import { i18n } from "./i18n.js";
import type { RegistryState } from "./protocol.js";

type Metadata = { displayName?: string; account?: HostAccount };
interface PendingSignIn { cancelled: boolean; done: Promise<void>; finish(): void }
export class RegistryManager {
  private readonly clients = new Map<string, GitHostClient>();
  private readonly metadata = new Map<string, Metadata>();
  private readonly starting = new Map<string, PendingSignIn>();
  private readonly completing = new Set<Promise<void>>();
  private stopped = false;
  private readonly flows = new Map<string, BrowserSignIn | DeviceSignIn>();
  private readonly failures = new Map<string, string>();
  private readonly file: string;
  private readonly generations = new Map<string, number>();
  private bump(origin: string): void { this.generations.set(origin, (this.generations.get(origin) ?? 0) + 1); }
  constructor(private readonly options: { home: string; label: string; flow: "browser" | "device"; fetch?: typeof fetch; broadcast(state: RegistryState): void }) {
    this.file = join(options.home, "local", "registry-accounts.json");
    try {
      const data: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        for (const [origin, value] of Object.entries(data)) if (canonicalOrigin(origin) === origin && typeof value === "object" && value !== null) this.metadata.set(origin, value as Metadata);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private save(): void {
    if (this.stopped) return;
    mkdirSync(join(this.options.home, "local"), { recursive: true, mode: 0o700 });
    writeApplicationBytes(this.file, JSON.stringify(Object.fromEntries(this.metadata), null, 2) + "\n");
  }
  client(origin: string): GitHostClient {
    origin = canonicalOrigin(origin);
    let client = this.clients.get(origin);
    if (!client) {
      client = new GitHostClient({ url: origin, scope: "registry", label: this.options.label,
        credentials: fileCredentialStore(this.options.home, origin, "registry"),
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        onSignedOut: () => { this.bump(origin); const info = this.metadata.get(origin) ?? {}; delete info.account; this.metadata.set(origin, info); this.save(); this.publish(origin); },
      });
      this.clients.set(origin, client);
    }
    return client;
  }
  /** A registry's name in what Spex says of it (core-service-145,
   * DR-172): the display name its descriptor gave when last read, else
   * its host. */
  name(origin: string): string { return this.metadata.get(canonicalOrigin(origin))?.displayName ?? new URL(origin).host; }
  /** A registry that gave no answer, with what to do. */
  private unreachable(origin: string): string {
    return i18n._({ id: "{registry} could not be reached — check the connection, then Retry", comment: "The registry did not answer; {registry} is the registry's display name as last read, else its host", values: { registry: this.name(origin) } });
  }
  /** A sign-in that ended without one, with what to do. */
  private unfinished(origin: string): string {
    return i18n._({ id: "Sign-in to {registry} did not finish — Sign in again", comment: "A sign-in at the registry was cancelled, denied, expired or interrupted; {registry} is the registry's display name", values: { registry: this.name(origin) } });
  }
  snapshot(origin: string): RegistryState {
    origin = canonicalOrigin(origin);
    const info = this.metadata.get(origin);
    const flow = this.flows.get(origin);
    return { origin, displayName: this.name(origin), account: info?.account ? { id: info.account.id, login: info.account.login } : null,
      signIn: flow ? ("url" in flow ? { phase: "running", flow: "browser", url: flow.url } : { phase: "running", flow: "device", userCode: flow.userCode, verificationUri: flow.verificationUri }) : { phase: "idle" }, error: this.failures.get(origin) ?? null };
  }
  private publish(origin: string): void { if (!this.stopped) this.options.broadcast(this.snapshot(origin)); }
  async get(origin = PUBLIC_REGISTRY_ORIGIN): Promise<RegistryState> {
    origin = canonicalOrigin(origin);
    const client = this.client(origin);
    const generation = this.generations.get(origin);
    try {
      const remote = new RegistryClient({ url: origin, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
      const description = await remote.describe();
      const info: Metadata = { displayName: description.displayName };
      if (await client.accessSecret()) info.account = await client.me();
      if (!this.stopped && generation === this.generations.get(origin)) { this.metadata.set(origin, info); this.failures.delete(origin); this.save(); }
    } catch {
      // Never expose a transport's raw response (which may name backend
      // resources), and never turn an outage into a Space sign-out.
      if (generation === this.generations.get(origin)) this.failures.set(origin, this.unreachable(origin));
    }
    const state = this.snapshot(origin); this.publish(origin); return state;
  }
  async start(origin: string): Promise<{ flow: "browser"; url: string } | { flow: "device"; userCode: string; verificationUri: string; expiresAt: number; interval: number }> {
    origin = canonicalOrigin(origin);
    if (this.stopped) throw new CoreError("aborted", this.unfinished(origin));
    if (this.flows.has(origin) || this.starting.has(origin)) {
      throw new CoreError("busy", i18n._({ id: "A sign-in to {registry} is already running — finish it in the browser, or Cancel", comment: "Refusal: a second sign-in at the registry while one waits for the browser; {registry} is the registry's display name", values: { registry: this.name(origin) } }));
    }
    let finish!: () => void;
    const pending: PendingSignIn = { cancelled: false, done: new Promise<void>((resolve) => { finish = resolve; }), finish: () => finish() };
    this.starting.set(origin, pending);
    this.bump(origin);
    const generation = this.generations.get(origin);
    try {
      const client = this.client(origin);
      const flow = this.options.flow === "browser" ? await client.startBrowserSignIn() : await client.startDeviceSignIn();
      if (pending.cancelled || this.stopped || generation !== this.generations.get(origin)) {
        flow.cancel();
        await flow.done.catch(() => {});
        throw new CoreError("aborted", this.unfinished(origin));
      }
      this.flows.set(origin, flow);
      this.failures.delete(origin);
      this.publish(origin);
      const completion = flow.done.then((account) => {
        if (generation !== this.generations.get(origin)) return;
        const info = this.metadata.get(origin) ?? {};
        info.account = account;
        this.metadata.set(origin, info);
        this.save();
      }).catch(() => {
        if (generation === this.generations.get(origin)) this.failures.set(origin, this.unfinished(origin));
      }).finally(() => {
        if (this.flows.get(origin) === flow) this.flows.delete(origin);
        this.publish(origin);
      });
      this.completing.add(completion);
      void completion.finally(() => this.completing.delete(completion)).catch(() => {});
      return "url" in flow ? { flow: "browser", url: flow.url } : { flow: "device", userCode: flow.userCode, verificationUri: flow.verificationUri, expiresAt: flow.expiresAt, interval: flow.interval };
    } catch (error) {
      if (error instanceof CoreError) throw error;
      const message = this.unfinished(origin);
      if (generation === this.generations.get(origin)) this.failures.set(origin, message);
      this.publish(origin);
      throw new CoreError("invalid_request", message);
    } finally {
      if (this.starting.get(origin) === pending) this.starting.delete(origin);
      pending.finish();
    }
  }
  cancel(origin: string): { stopped: boolean } {
    origin = canonicalOrigin(origin);
    const pending = this.starting.get(origin);
    const flow = this.flows.get(origin);
    if (pending) pending.cancelled = true;
    if (pending || flow) {
      this.bump(origin);
      this.flows.delete(origin);
      this.failures.delete(origin);
      flow?.cancel();
      this.publish(origin);
    }
    return { stopped: !!pending || !!flow };
  }
  async signOut(origin: string): Promise<RegistryState> {
    origin = canonicalOrigin(origin);
    this.bump(origin);
    this.cancel(origin);
    let failed = false;
    try { await this.client(origin).signOut(); } catch { failed = true; }
    // A concurrent CLI sign-in can replace the pair while revocation is
    // pending. The shared store preserves it; keep its account view too.
    if (!failed || this.client(origin).holdsNone()) {
      const info = this.metadata.get(origin) ?? {};
      delete info.account;
      this.metadata.set(origin, info);
      this.save();
    }
    this.publish(origin);
    if (failed) throw new CoreError("invalid_request", i18n._({ id: "Sign-out at {registry} did not finish — check the connection, then Sign out again", comment: "The registry did not take this computer's sign-out, so its sign-in may still stand; {registry} is the registry's display name", values: { registry: this.name(origin) } }));
    return this.snapshot(origin);
  }
  async directory(origin = PUBLIC_REGISTRY_ORIGIN): Promise<{ spaces: { origin: string; displayName: string; signIn: string[] }[] }> {
    try { return { spaces: await new RegistryClient({ url: origin, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) }).spaces() }; }
    catch { throw new CoreError("invalid_request", i18n._({ id: "The Spaces {registry} lists could not be read — check the connection, then Retry", comment: "The registry's list of Spaces to sign in to did not answer or did not read; {registry} is the registry's display name", values: { registry: this.name(origin) } })); }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    const pending = [...this.starting.values()];
    for (const origin of new Set([...this.starting.keys(), ...this.flows.keys()])) this.cancel(origin);
    await Promise.allSettled(pending.map((entry) => entry.done));
    await Promise.allSettled([...this.completing]);
  }
}
