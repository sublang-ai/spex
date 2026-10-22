// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Git host client against the stand-in host (git-host-13,
// git-host-14): both sign-in flows, token keeping, reads and writes,
// sign-out, the relayed failures, and a real `git push` through the
// credential helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { inspect } from "node:util";
import { parse as parseYaml } from "yaml";
import {
  CredentialChanged,
  DEFAULT_HOST_URL,
  GitHostClient,
  HostError,
  HostWaitStopped,
  SignInBusyError,
  credentialsPath,
  fileCredentialStore,
  hostUrlFor,
  type HostRepository,
  type HostErrorKind,
  type SignInCause,
  type StoredCredential,
} from "./git-host.js";
import { GIT_CREDENTIAL_FILE_ENV, currentRuntime, withGitCredential } from "./git-credential.js";
import { OriginRefused } from "./instance.js";
import { holdingFetch, samePair, settled } from "./testing/holding-fetch.js";
import { browserSignIn, instanceClient } from "./testing/host-sign-in.js";
import { readHostView, relayHostError } from "./space-groups.js";
import { STANDIN_STORAGE, startStandinHost, type StandinHost } from "./testing/standin-host.js";

async function setup(options: { skew?: { ms: number }; holdMaxMs?: number } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), "spex-git-host-"));
  const home = join(scratch, "home");
  const host = await startStandinHost({ dir: join(scratch, "host") });
  const signedOut: HostErrorKind[] = [];
  const skew = options.skew;
  const holds = holdingFetch();
  const client = new GitHostClient({
    url: host.url,
    label: "Spex on test",
    credentials: fileCredentialStore(home, host.url),
    fetch: holds.fetch,
    ...(skew ? { now: () => Date.now() + skew.ms } : {}),
    onSignedOut: (kind) => signedOut.push(kind),
    ...(options.holdMaxMs !== undefined ? { holdMaxMs: options.holdMaxMs } : {}),
  });
  let closed = false;
  return {
    scratch,
    home,
    host,
    client,
    holds,
    signedOut,
    closeHost: async () => {
      if (!closed) await host.close();
      closed = true;
    },
    dispose: async () => {
      if (!closed) await host.close();
      closed = true;
      rmSync(scratch, { recursive: true, force: true });
    },
  };
}

function hostError(kind: HostErrorKind, extra: { cause?: SignInCause; words?: string | RegExp; retryAfter?: string } = {}) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof HostError, `expected a HostError, got ${String(error)}`);
    assert.equal(error.kind, kind, error.message);
    if (extra.cause !== undefined) assert.equal(error.cause, extra.cause);
    if (typeof extra.words === "string") assert.equal(error.words, extra.words);
    else if (extra.words) assert.match(error.words ?? "", extra.words);
    if (extra.retryAfter !== undefined) assert.equal(error.retryAfter, extra.retryAfter);
    return true;
  };
}

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

async function unreachable(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return false;
  } catch {
    return true;
  }
}

function tokenPolls(host: StandinHost): number[] {
  return host.script.requests.filter((r) => r.method === "POST" && r.path === "/api/v1/auth/token").map((r) => r.at);
}

function refreshGrants(host: StandinHost): number {
  return host.script.tokenGrants.filter((g) => g.grantType === "refresh_token").length;
}

// ---------------------------------------------------------------------------
// git-host-1

test("git-host-1: a new home takes SPEX_HOST_URL; a recorded host keeps itself", () => {
  assert.equal(hostUrlFor({}, null), DEFAULT_HOST_URL);
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "" }, undefined), "https://spex.pub");
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "  " }), "https://spex.pub");
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "http://127.0.0.1:4100/" }, null), "http://127.0.0.1:4100");
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "http://127.0.0.1:4200" }, "http://127.0.0.1:4100"), "http://127.0.0.1:4100");
  assert.equal(hostUrlFor({}, "https://spex.pub"), "https://spex.pub");
  // Either way the result is the instance's canonical origin (DR-127).
  assert.equal(hostUrlFor({ SPEX_HOST_URL: " HTTPS://Spex.Pub:443/ " }, null), "https://spex.pub");
  assert.equal(hostUrlFor({}, "HTTP://LocalHost:4100/"), "http://localhost:4100");
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "http://127.0.0.1:80" }), "http://127.0.0.1");
  // A URL the origin rule refuses names no instance, trailing slashes
  // past the root included.
  const refused = (reason: string) => (error: unknown) => error instanceof OriginRefused && error.reason === reason;
  assert.throws(() => hostUrlFor({ SPEX_HOST_URL: "http://127.0.0.1:4100//" }, null), refused("path"));
  assert.throws(() => hostUrlFor({ SPEX_HOST_URL: "https://spex.pub/api" }), refused("path"));
  assert.throws(() => hostUrlFor({ SPEX_HOST_URL: "http://spex.pub" }), refused("insecure"));
  assert.throws(() => hostUrlFor({}, "https://me:secret@spex.pub"), refused("user"));
});

// ---------------------------------------------------------------------------
// git-host-2: the browser flow

test("git-host-2: the browser flow signs in through the loopback and stores the token owner-only", async () => {
  const t = await setup();
  try {
    const flow = await t.client.startBrowserSignIn();
    const url = new URL(flow.url);
    assert.equal(`${url.origin}${url.pathname}`, `${t.host.url}/login/app`);
    assert.equal(url.searchParams.get("client_id"), "spex");
    assert.equal(url.searchParams.get("label"), "Spex on test");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.match(url.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
    assert.ok((url.searchParams.get("state") ?? "").length > 0);
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
    assert.equal(redirect.protocol, "http:");
    assert.equal(redirect.hostname, "127.0.0.1");
    assert.ok(Number(redirect.port) > 0);
    assert.equal(redirect.toString(), flow.redirectUri);

    const first = await fetch(flow.url, { redirect: "manual" });
    assert.equal(first.status, 302);
    const back = await fetch(first.headers.get("location") ?? "");
    assert.equal(back.status, 200);
    assert.match(await back.text(), /may close this browser window/);
    const account = await flow.done;
    assert.deepEqual(account, { id: "1001", login: "ada", displayName: "Ada Lovelace", canCreateGroup: true });

    const file = credentialsPath(t.home);
    assert.equal(mode(file), 0o600);
    assert.equal(mode(dirname(file)), 0o700);
    const doc = parseYaml(readFileSync(file, "utf8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(doc).sort(), ["format", "hosts"]);
    assert.equal(doc.format, 1);
    const hosts = doc.hosts as Record<string, Record<string, unknown>>;
    assert.deepEqual(Object.keys(hosts), [t.host.url]);
    assert.deepEqual(Object.keys(hosts[t.host.url]).sort(), ["access", "accessExpiresAt", "refresh"]);
    assert.match(String(hosts[t.host.url].access), /^spexa_/);
    assert.match(String(hosts[t.host.url].refresh), /^spexr_/);
    assert.equal(await t.client.signedIn(), true);
    assert.equal(await unreachable(flow.redirectUri), true, "the listener closes after its one callback");
    assert.equal(t.client.signingIn(), false);
  } finally {
    await t.dispose();
  }
});

test("git-host-2: a denial, a wrong state and a refused exchange end the sign-in with their causes and store nothing", async () => {
  const t = await setup();
  try {
    t.host.script.browser = "deny";
    const denied = await t.client.startBrowserSignIn();
    const first = await fetch(denied.url, { redirect: "manual" });
    assert.match(first.headers.get("location") ?? "", /error=access_denied/);
    const page = await fetch(first.headers.get("location") ?? "");
    assert.equal(page.status, 400);
    await assert.rejects(denied.done, hostError("reauth", { cause: "denied" }));

    t.host.script.browser = "approve";
    const wrongState = await t.client.startBrowserSignIn();
    const crafted = new URL(wrongState.redirectUri);
    crafted.searchParams.set("code", "anything");
    crafted.searchParams.set("state", "not-the-state");
    assert.equal((await fetch(crafted)).status, 400);
    await assert.rejects(wrongState.done, hostError("reauth", { cause: "state" }));
    assert.equal(await unreachable(wrongState.redirectUri), true);

    const refused = await t.client.startBrowserSignIn();
    const bogus = new URL(refused.redirectUri);
    bogus.searchParams.set("code", "not-a-code-the-host-issued");
    bogus.searchParams.set("state", new URL(refused.url).searchParams.get("state") ?? "");
    assert.equal((await fetch(bogus)).status, 400);
    await assert.rejects(refused.done, hostError("reauth", { cause: "refused", words: "The authorization code is not valid." }));

    assert.equal(existsSync(credentialsPath(t.home)), false);
    assert.equal(await t.client.signedIn(), false);
    assert.equal(t.host.script.liveDevices(), 0);
  } finally {
    await t.dispose();
  }
});

test("git-host-2: a cancel and an expiry end the sign-in and close the listener; a second start is busy", async () => {
  const t = await setup();
  try {
    t.host.script.browser = "hold";
    const running = await t.client.startBrowserSignIn();
    assert.equal((await fetch(running.url, { redirect: "manual" })).status, 200);
    assert.equal(t.host.script.heldSignIns(), 1);
    await assert.rejects(t.client.startBrowserSignIn(), (error: unknown) => error instanceof SignInBusyError && error.code === "busy");
    await assert.rejects(t.client.startDeviceSignIn(), SignInBusyError);
    running.cancel();
    await assert.rejects(running.done, hostError("reauth", { cause: "stopped" }));
    assert.equal(await unreachable(running.redirectUri), true);
    await assert.rejects(t.host.script.approveHeld(), /fetch failed/);

    const expiring = await t.client.startBrowserSignIn({ timeoutMs: 150 });
    await assert.rejects(expiring.done, hostError("reauth", { cause: "expired" }));
    assert.equal(await unreachable(expiring.redirectUri), true);
    assert.equal(existsSync(credentialsPath(t.home)), false);

    // A held approval delivered later completes a running flow.
    const held = await t.client.startBrowserSignIn();
    await fetch(held.url, { redirect: "manual" });
    const delivered = await t.host.script.approveHeld();
    assert.equal(delivered.status, 200);
    assert.equal((await held.done).login, "ada");
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-3: the device flow

test("git-host-3: the device flow links the user code, polls at the interval and completes on approval", async () => {
  const t = await setup();
  try {
    const flow = await t.client.startDeviceSignIn();
    assert.match(flow.userCode, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    assert.equal(flow.verificationUri, `${t.host.url}/login/device?user_code=${encodeURIComponent(flow.userCode)}`);
    assert.ok(flow.expiresAt > Date.now() + 590_000);
    assert.deepEqual(t.host.script.pendingDevices(), [flow.userCode]);
    while (tokenPolls(t.host).length < 2) await new Promise((r) => setTimeout(r, 50));
    assert.equal(existsSync(credentialsPath(t.home)), false, "nothing is stored before the token");
    t.host.script.approveDevice(flow.userCode);
    assert.equal((await flow.done).login, "ada");
    const polls = tokenPolls(t.host);
    for (let i = 1; i < polls.length; i += 1) assert.ok(polls[i] - polls[i - 1] >= 950, `poll gap ${polls[i] - polls[i - 1]}`);
    assert.deepEqual(t.host.script.tokenGrants.map((g) => g.error), ["authorization_pending", "authorization_pending", null]);
    assert.equal(mode(credentialsPath(t.home)), 0o600);
    assert.equal(t.client.signingIn(), false);
  } finally {
    await t.dispose();
  }
});

test("git-host-3: a denial, an expiry and a cancel end the device flow with their causes", async () => {
  const t = await setup();
  try {
    const denied = await t.client.startDeviceSignIn();
    t.host.script.denyDevice(denied.userCode);
    await assert.rejects(denied.done, hostError("reauth", { cause: "denied" }));

    t.host.script.deviceExpiresIn = 1;
    const expired = await t.client.startDeviceSignIn();
    await assert.rejects(expired.done, hostError("reauth", { cause: "expired" }));

    t.host.script.deviceExpiresIn = 600;
    const stopped = await t.client.startDeviceSignIn();
    stopped.cancel();
    await assert.rejects(stopped.done, hostError("reauth", { cause: "stopped" }));
    const polls = tokenPolls(t.host).length;
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal(tokenPolls(t.host).length, polls, "a cancel stops the polling");
    assert.equal(existsSync(credentialsPath(t.home)), false);
  } finally {
    await t.dispose();
  }
});

test("git-host-3: slow_down backs the polling off by five seconds", async () => {
  const t = await setup();
  try {
    t.host.script.devicePollFloor = 3;
    const flow = await t.client.startDeviceSignIn();
    t.host.script.approveDevice(flow.userCode);
    assert.equal((await flow.done).login, "ada");
    const polls = tokenPolls(t.host);
    assert.equal(polls.length, 2);
    assert.ok(polls[1] - polls[0] >= 5_900, `backed-off gap ${polls[1] - polls[0]}`);
    assert.deepEqual(t.host.script.tokenGrants.map((g) => g.error), ["slow_down", null]);
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-27, git-host-28: a seat's device request

test("git-host-28: a seat's device request carries the server and the person; a denied code and a person of another id each end the sign-in failed, storing nothing", async () => {
  const t = await setup();
  try {
    const store = fileCredentialStore(t.home, t.host.url);
    const seat = new GitHostClient({
      url: t.host.url,
      label: "Spex on lab-1",
      credentials: store,
      server: { id: "srv_42", personId: "1001" },
    });
    // A device request names the server and the person beside the
    // client id and the label (git-host-27); a client of no seat names
    // neither.
    const plain = await t.client.startDeviceSignIn();
    plain.cancel();
    await assert.rejects(plain.done, hostError("reauth", { cause: "stopped" }));
    const denied = await seat.startDeviceSignIn();
    assert.deepEqual(t.host.script.deviceRequests, [
      { label: "Spex on test", serverId: null, personId: null },
      { label: "Spex on lab-1", serverId: "srv_42", personId: "1001" },
    ]);
    // The instance denying the code ends it `denied` (git-host-27).
    t.host.script.denyDevice(denied.userCode);
    await assert.rejects(denied.done, hostError("reauth", { cause: "denied" }));
    assert.equal(await store.read(), null, "a denied code stores nothing");

    // A person bearing another permanent id ends it naming the account
    // signed in, and nothing is stored (git-host-27).
    t.host.script.person = { id: "1002", login: "bob", displayName: "Bob" };
    const other = await seat.startDeviceSignIn();
    t.host.script.approveDevice(other.userCode);
    await assert.rejects(other.done, hostError("reauth", { cause: "person", words: "bob" }));
    assert.equal(await store.read(), null, "a person of another id stores nothing");
    assert.equal(existsSync(credentialsPath(t.home)), false);
    assert.equal(await seat.signedIn(), false);

    // The admitted person signs in and the token is stored.
    t.host.script.person = { id: "1001", login: "ada", displayName: "Ada Lovelace" };
    const admitted = await seat.startDeviceSignIn();
    t.host.script.approveDevice(admitted.userCode);
    assert.equal((await admitted.done).id, "1001");
    assert.ok(await store.read(), "the person's sign-in is stored");
    assert.deepEqual(t.host.script.deviceRequests.slice(2).map((request) => [request.serverId, request.personId]), [["srv_42", "1001"], ["srv_42", "1001"]]);
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-29, git-host-30: the servers listing and the tickets

/** Every file under a directory, at any depth. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/** The failure a call ends with. */
async function failureOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  return assert.fail("the call must fail");
}

test("git-host-30: the servers listing and a ticket carry the instance's app token and come back as answered, held nowhere; host_refused, not_found and 429 are relayed as git-host-11 states", async () => {
  // The 30 s the rate limit asks for hold the next call 0.2 s at most
  // here, a test-shortened bound (git-host-21).
  const t = await setup({ holdMaxMs: 200 });
  try {
    await browserSignIn(t.client);
    const stored = await fileCredentialStore(t.home, t.host.url).read();
    assert.ok(stored);
    const s = t.host.script;
    s.servers.push({ id: "srv_lab1", name: "lab-1", group: "acme", address: "https://lab-1.example.test" });

    // The listing and the ticket as the instance answers them (git-host-29).
    assert.deepEqual(await t.client.servers(), [
      { id: "srv_lab1", name: "lab-1", group: { id: "2002", fullPath: "acme", name: "Acme", kind: "group" }, address: "https://lab-1.example.test" },
    ]);
    const ticket = await t.client.ticket("srv_lab1");
    const minted = s.tickets.at(-1);
    assert.ok(minted);
    assert.deepEqual(ticket, { ticket: minted.ticket, expiresIn: 120, server: { id: "srv_lab1", name: "lab-1", address: "https://lab-1.example.test" } });
    // Each call carried that instance's app token (git-host-4).
    assert.deepEqual(s.serverCalls, [
      { method: "GET", path: "/api/v1/host/servers", bearer: stored.access },
      { method: "POST", path: "/api/v1/host/servers/srv_lab1/tickets", bearer: stored.access },
    ]);
    // Held nowhere after the reply: neither in the client nor in any file
    // of the home.
    const client = inspect(t.client, { depth: 10, showHidden: true });
    assert.ok(!client.includes(minted.ticket), "the client holds no ticket");
    assert.ok(!client.includes("srv_lab1") && !client.includes("lab-1.example.test"), "the client holds no listing");
    for (const file of filesUnder(t.home)) {
      const text = readFileSync(file, "utf8");
      assert.ok(!text.includes(minted.ticket) && !text.includes("srv_lab1"), `${file} holds nothing of the listing or the ticket`);
    }

    // Any other answer is relayed as git-host-11 states it.
    s.refuseHost(1, "a seat on this server needs the Developer role or above in its group");
    const refused = await failureOf(t.client.ticket("srv_lab1"));
    assert.ok(hostError("host_refused", { words: "a seat on this server needs the Developer role or above in its group" })(refused));
    assert.equal(relayHostError(refused, "Stand-in Git host"), "Stand-in Git host refused: a seat on this server needs the Developer role or above in its group");
    const gone = await failureOf(t.client.ticket("srv_gone"));
    assert.ok(hostError("not_found", { words: "no server has this id" })(gone));
    assert.equal(relayHostError(gone, "Stand-in Git host"), "No longer shared with you");
    s.rateLimit(1, "30");
    const limited = await failureOf(t.client.servers());
    assert.ok(hostError("rate_limited", { retryAfter: "30" })(limited));
    assert.equal(relayHostError(limited, "Stand-in Git host"), "Stand-in Git host asks to wait 30 seconds");
    await sleep(300);
    // Every call carried the token; none signed the device out.
    assert.ok(s.serverCalls.every((call) => call.bearer === stored.access));
    assert.equal(s.serverCalls.length, 5);
    assert.equal(t.signedOut.length, 0);
    assert.equal((await t.client.servers()).length, 1, "a refusal leaves the device signed in");
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-4: token keeping

test("git-host-4: an access secret within a minute of expiring is refreshed once before the call", async () => {
  const skew = { ms: 0 };
  const t = await setup({ skew });
  try {
    await browserSignIn(t.client);
    const store = fileCredentialStore(t.home, t.host.url);
    const before = await store.read();
    skew.ms = 3_600_000 - 30_000;
    const from = t.host.script.requests.length;
    const [groups, me] = await Promise.all([t.client.groups(), t.client.me()]);
    assert.equal(groups.length, 3);
    assert.equal(me.login, "ada");
    assert.equal(refreshGrants(t.host), 1, "two concurrent calls refresh once");
    const after = await store.read();
    assert.ok(before && after && after.access !== before.access && after.refresh !== before.refresh);
    const seen = t.host.script.requests.slice(from).map((r) => r.path);
    assert.ok(seen.indexOf("/api/v1/auth/token") < seen.indexOf("/api/v1/host/groups"), "the refresh precedes the call");
    assert.ok(seen.indexOf("/api/v1/auth/token") < seen.indexOf("/api/v1/host/me"));
  } finally {
    await t.dispose();
  }
});

test("git-host-4: a token_expired answer refreshes once and retries; two concurrent calls refresh once", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    t.host.script.expireAccess();
    const [groups, repositories] = await Promise.all([t.client.groups(), t.client.repositories()]);
    assert.equal(groups.length, 3);
    assert.deepEqual(repositories, []);
    assert.equal(refreshGrants(t.host), 1);
    assert.equal(t.signedOut.length, 0);
    assert.equal(t.host.script.liveDevices(), 1, "no spent refresh token was presented");
  } finally {
    await t.dispose();
  }
});

test("git-host-4: a refused refresh or a revoked device signs the device out", async () => {
  const skew = { ms: 0 };
  const t = await setup({ skew });
  try {
    await browserSignIn(t.client);
    t.host.script.refuseRefresh = true;
    skew.ms = 3_600_000;
    await assert.rejects(t.client.groups(), hostError("reauth"));
    assert.deepEqual(t.signedOut, ["reauth"]);
    assert.equal(existsSync(credentialsPath(t.home)), false);
    assert.equal(await t.client.signedIn(), false);
    const from = t.host.script.requests.length;
    await assert.rejects(t.client.me(), hostError("reauth"));
    assert.equal(t.host.script.requests.length, from, "a signed-out home contacts nothing");

    skew.ms = 0;
    t.host.script.refuseRefresh = false;
    await browserSignIn(t.client);
    t.host.script.revokeDevices();
    await assert.rejects(t.client.me(), (error: unknown) => hostError("reauth")(error) && (error as HostError).code === "token_revoked");
    assert.deepEqual(t.signedOut, ["reauth", "reauth"]);
    assert.equal(await t.client.signedIn(), false);
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-10: sign-out

test("git-host-10: sign-out revokes the device and removes the credential, reachable or not", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    assert.equal(t.host.script.liveDevices(), 1);
    await t.client.signOut();
    assert.equal(t.host.script.liveDevices(), 0);
    const revoke = t.host.script.requests.find((r) => r.path === "/api/v1/auth/revoke");
    assert.ok(revoke?.authorization);
    assert.equal(existsSync(credentialsPath(t.home)), false);
    assert.equal(t.signedOut.length, 0, "an explicit sign-out is no refusal");

    await browserSignIn(t.client);
    await t.closeHost();
    await t.client.signOut();
    assert.equal(existsSync(credentialsPath(t.home)), false);
    assert.equal(await t.client.signedIn(), false);
  } finally {
    await t.dispose();
  }
});

test("git-host-10: another host's credential stays; a file of another format is refused", async () => {
  const t = await setup();
  try {
    const other = fileCredentialStore(t.home, "https://elsewhere.example");
    assert.equal(other.replace(null, { access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" }), true);
    await browserSignIn(t.client);
    await t.client.signOut();
    assert.deepEqual(await other.read(), { access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" });
    assert.equal(await t.client.signedIn(), false);
    assert.equal(mode(credentialsPath(t.home)), 0o600);

    writeFileSync(credentialsPath(t.home), "format: 2\nhosts: {}\n");
    await assert.rejects(other.read(), /format 2, which this version of Spex does not read/);
    assert.throws(() => other.replace(null, { access: "a", accessExpiresAt: 1, refresh: "r" }), /format 2/);
    assert.equal(readFileSync(credentialsPath(t.home), "utf8"), "format: 2\nhosts: {}\n");
  } finally {
    await t.dispose();
  }
});

test("storage-19: a credential write replaces or removes only the pair it names, another host's pair kept", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-credentials-"));
  try {
    const mine = fileCredentialStore(scratch, "https://host.example");
    const other = fileCredentialStore(scratch, "https://elsewhere.example");
    const a: StoredCredential = { access: "spexa_a", accessExpiresAt: 1, refresh: "spexr_a" };
    const b: StoredCredential = { access: "spexa_b", accessExpiresAt: 2, refresh: "spexr_b" };
    const kept: StoredCredential = { access: "spexa_other", accessExpiresAt: 3, refresh: "spexr_other" };
    assert.equal(other.replace(null, kept), true);
    assert.equal(mine.replace(a, b), false, "none stood in place of the named pair");
    assert.equal(mine.replace(null, a), true);
    assert.equal(mine.replace(null, b), false, "a pair stands where none was named");
    assert.equal(mine.replace({ ...a, accessExpiresAt: 9 }, b), false, "compared in every field");
    assert.ok(samePair(await mine.read(), a));
    assert.equal(mine.replace(a, b), true);
    assert.equal(mine.replace(a, null), false, "a removal of a replaced pair removes nothing");
    assert.ok(samePair(await mine.read(), b));
    assert.equal(mode(credentialsPath(scratch)), 0o600);
    assert.equal(mine.replace(b, null), true);
    assert.equal(await mine.read(), null);
    assert.ok(samePair(await other.read(), kept), "another host's pair stays throughout");
    assert.equal(other.replace(kept, null), true);
    assert.equal(existsSync(credentialsPath(scratch)), false, "the last pair takes the file with it");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("git-host-10, storage-19: a sign-out removes a malformed entry unless a well-formed pair stands by then; another format stays", async () => {
  const t = await setup();
  try {
    const file = credentialsPath(t.home);
    const key = t.host.url.replace(/\/+$/, "");
    const store = fileCredentialStore(t.home, t.host.url);
    const other = fileCredentialStore(t.home, "https://elsewhere.example");
    const kept: StoredCredential = { access: "spexa_other", accessExpiresAt: 3, refresh: "spexr_other" };
    const newer: StoredCredential = { access: "spexa_newer", accessExpiresAt: Date.now() + 3_600_000, refresh: "spexr_newer" };
    const write = (entry: unknown): void => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ format: 1, hosts: { [key]: entry, "https://elsewhere.example": kept } }));
    };
    let removed = 0;
    const onRemoved = () => { removed += 1; };

    // Every other read and write refuses the malformed entry, writing nothing.
    write({ access: 7 });
    const malformed = readFileSync(file, "utf8");
    await assert.rejects(store.read(), /malformed entry/);
    assert.throws(() => store.replace(null, newer), /malformed entry/);
    assert.throws(() => t.client.holdsNone(), /malformed entry/);
    assert.equal(readFileSync(file, "utf8") === malformed, true, "the file is left as it is");

    // A well-formed pair stored after the sign-out's failed read stays.
    const racing = new GitHostClient({
      url: t.host.url,
      label: "Spex on test",
      fetch: t.holds.fetch,
      credentials: {
        read: async () => {
          try {
            return await store.read();
          } catch (error) {
            write(newer);
            throw error;
          }
        },
        replace: (expected, next) => store.replace(expected, next),
        removeMalformed: () => store.removeMalformed!(),
      },
    });
    await assert.rejects(racing.signOut(onRemoved), (error: unknown) => error instanceof CredentialChanged);
    assert.equal(removed, 0, "nothing is marked signed out");
    assert.ok(samePair(await store.read(), newer), "the well-formed pair stays");

    // The malformed entry alone is removed, and the account signed out.
    write({ access: 7 });
    await t.client.signOut(onRemoved);
    assert.equal(removed, 1, "the account is signed out in the removal's turn");
    assert.equal(await store.read(), null);
    assert.ok(samePair(await other.read(), kept), "another host's pair stays");
    assert.equal(mode(file), 0o600);
    assert.equal(t.host.script.requests.some((r) => r.path === "/api/v1/auth/revoke"), false, "nothing is revoked");
    assert.deepEqual(t.signedOut, [], "an explicit sign-out is no refusal");

    // A file of another format is refused and left byte for byte.
    writeFileSync(file, "format: 2\nhosts: {}\n");
    await assert.rejects(t.client.signOut(onRemoved), /format 2/);
    assert.equal(readFileSync(file, "utf8") === "format: 2\nhosts: {}\n", true, "the file is left as it is");
    assert.equal(removed, 1, "nothing more is marked signed out");
  } finally {
    await t.dispose();
  }
});

test("git-host-4: a held refresh, granted or refused, or a held refusal of a pair replaced meanwhile stores, removes and signs out nothing", async () => {
  const skew = { ms: 0 };
  const t = await setup({ skew });
  try {
    const store = fileCredentialStore(t.home, t.host.url);
    const other = fileCredentialStore(t.home, "https://elsewhere.example");
    const kept: StoredCredential = { access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" };
    assert.equal(other.replace(null, kept), true);
    /** Hold the answer `match` picks, store `next` in place of the pair
     * the call used, release, and find the call refused as changed. */
    const overtaken = async (match: (path: string, status: number) => boolean, next: StoredCredential): Promise<void> => {
      const used = await store.read();
      const gate = t.holds.hold(match);
      const pending = t.client.groups();
      pending.catch(() => undefined);
      try {
        await gate.reached;
        assert.equal(store.replace(used, next), true);
      } finally {
        gate.release();
      }
      await assert.rejects(pending, (error: unknown) => error instanceof CredentialChanged);
      assert.ok(samePair(await store.read(), next), "the newer pair stays");
      assert.ok(samePair(await other.read(), kept), "another host's pair stays");
      assert.deepEqual(t.signedOut, [], "nothing is signed out");
    };
    const newer = (n: number): StoredCredential => ({ access: `spexa_newer_${n}`, accessExpiresAt: Date.now() + 7_200_000, refresh: `spexr_newer_${n}` });

    // A refresh the stand-in grants, its answer held.
    await browserSignIn(t.client);
    skew.ms = 3_600_000 - 30_000;
    await overtaken((path) => path === "/api/v1/auth/token", newer(1));
    // A refresh the stand-in refuses, its answer held.
    skew.ms = 0;
    await browserSignIn(t.client);
    t.host.script.refuseRefresh = true;
    skew.ms = 3_600_000 - 30_000;
    await overtaken((path) => path === "/api/v1/auth/token", newer(2));
    // A call refused for a revoked device, its answer held.
    skew.ms = 0;
    t.host.script.refuseRefresh = false;
    await browserSignIn(t.client);
    t.host.script.revokeDevices();
    await overtaken((path, status) => path === "/api/v1/host/groups" && status === 401, newer(3));
  } finally {
    await t.dispose();
  }
});

test("git-host-4: a refusal reported from outside the client signs the device out only while the pair that presented it stands", async () => {
  const skew = { ms: 0 };
  const t = await setup({ skew });
  try {
    const store = fileCredentialStore(t.home, t.host.url);
    const other = fileCredentialStore(t.home, "https://elsewhere.example");
    const kept: StoredCredential = { access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" };
    assert.equal(other.replace(null, kept), true);
    await browserSignIn(t.client);
    const presented = await store.read();
    assert.ok(presented);

    // A refresh meanwhile: the refusal of the pair it replaced removes
    // and signs out nothing, and reads as changed meanwhile.
    skew.ms = 3_600_000 - 30_000;
    await t.client.me();
    skew.ms = 0;
    const refreshed = await store.read();
    assert.ok(refreshed && refreshed.access !== presented.access, "the pair was refreshed");
    assert.equal(await t.client.signOutRefused(presented.access), false);
    assert.ok(samePair(await store.read(), refreshed), "the refreshed pair stays");
    assert.deepEqual(t.signedOut, [], "nothing is signed out");

    // The stored pair refused: removed and signed out in one step, said
    // once, another host's pair kept.
    assert.equal(await t.client.signOutRefused(refreshed.access), true);
    assert.equal(await store.read(), null);
    assert.equal(await t.client.signedIn(), false);
    assert.deepEqual(t.signedOut, ["reauth"]);
    assert.ok(samePair(await other.read(), kept), "another host's pair stays");

    // A sign-out meanwhile, then a sign-in meanwhile: the refusal of the
    // pair gone removes and signs out nothing, the new pair staying.
    assert.equal(await t.client.signOutRefused(refreshed.access), false);
    await browserSignIn(t.client);
    const signedIn = await store.read();
    assert.equal(await t.client.signOutRefused(refreshed.access), false);
    assert.ok(samePair(await store.read(), signedIn), "the newer sign-in's pair stays");
    assert.deepEqual(t.signedOut, ["reauth"], "said once");
  } finally {
    await t.dispose();
  }
});

test("git-host-2, git-host-3: with the person's read held, a cancel stores nothing, and a pair stored meanwhile stays", async () => {
  const t = await setup();
  try {
    const store = fileCredentialStore(t.home, t.host.url);
    const other = fileCredentialStore(t.home, "https://elsewhere.example");
    const kept: StoredCredential = { access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" };
    assert.equal(other.replace(null, kept), true);
    const holdMe = () => t.holds.hold((path) => path === "/api/v1/host/me");
    /** Open a browser flow's URL and deliver its callback, unanswered yet. */
    const callback = async (url: string): Promise<{ page: Promise<Response> }> => {
      const first = await fetch(url, { redirect: "manual" });
      const page = fetch(first.headers.get("location") ?? "");
      page.catch(() => undefined);
      return { page };
    };

    // The browser flow, canceled while the person's read is held.
    let gate = holdMe();
    const browser = await t.client.startBrowserSignIn();
    browser.done.catch(() => undefined);
    const { page } = await callback(browser.url);
    try {
      await gate.reached;
      browser.cancel();
    } finally {
      gate.release();
    }
    // The cancel closes the listener, so the page may be cut off.
    await page.then((answer) => answer.text(), () => undefined);
    await assert.rejects(browser.done, hostError("reauth", { cause: "stopped" }));
    await settled();
    assert.equal(await store.read(), null, "the browser flow stored nothing");

    // The device flow, the same.
    gate = holdMe();
    const device = await t.client.startDeviceSignIn();
    device.done.catch(() => undefined);
    t.host.script.approveDevice(device.userCode);
    try {
      await gate.reached;
      device.cancel();
    } finally {
      gate.release();
    }
    await assert.rejects(device.done, hostError("reauth", { cause: "stopped" }));
    await settled();
    assert.equal(await store.read(), null, "the device flow stored nothing");

    // A pair stored meanwhile ends the sign-in stopped, and stays.
    gate = holdMe();
    const overtaken = await t.client.startBrowserSignIn();
    const ended = overtaken.done.then(() => null, (error: unknown) => error);
    const { page: answered } = await callback(overtaken.url);
    const newer: StoredCredential = { access: "spexa_newer", accessExpiresAt: Date.now() + 3_600_000, refresh: "spexr_newer" };
    try {
      await gate.reached;
      assert.equal(store.replace(null, newer), true);
    } finally {
      gate.release();
    }
    await (await answered).text();
    assert.ok(hostError("reauth", { cause: "stopped" })(await ended));
    assert.ok(samePair(await store.read(), newer), "the pair stored meanwhile stays");
    assert.ok(samePair(await other.read(), kept), "another host's pair stays");
  } finally {
    await t.dispose();
  }
});

test("git-host-2, git-host-3: a person read that fails ends either flow failed, nothing stored", async () => {
  const t = await setup();
  try {
    // The stand-in issues the token; its person read is answered 403.
    const client = new GitHostClient({
      url: t.host.url,
      label: "Spex on test",
      credentials: fileCredentialStore(t.home, t.host.url),
      fetch: async (input, init) => {
        const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
        if (path !== "/api/v1/host/me") return fetch(input, init);
        return new Response(JSON.stringify({ error: { code: "forbidden", message: "No person." } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const browser = await client.startBrowserSignIn();
    const first = await fetch(browser.url, { redirect: "manual" });
    await (await fetch(first.headers.get("location") ?? "")).text();
    await assert.rejects(browser.done, hostError("reauth", { cause: "refused" }));
    assert.equal(existsSync(credentialsPath(t.home)), false, "the browser flow stored nothing");

    const device = await client.startDeviceSignIn();
    t.host.script.approveDevice(device.userCode);
    await assert.rejects(device.done, hostError("reauth", { cause: "refused" }));
    assert.equal(existsSync(credentialsPath(t.home)), false, "the device flow stored nothing");
    assert.equal(await client.signedIn(), false);
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-5, -6, -7, -8: reads and writes

test("git-host-5: groups and every spex repository across two pages, followed through a rename and a removal", async () => {
  const t = await setup();
  try {
    const s = t.host.script;
    const a = s.addRepository({ group: "acme", name: "a-spex", project: { format: 1, name: "a", remote: "git@example.test:acme/a.git" } });
    const b = s.addRepository({ group: "acme/research", name: "b-spex" });
    const c = s.addRepository({ group: "ada", name: "ada-spex", empty: true });
    s.addRepository({ group: "acme", name: "code" });
    await browserSignIn(t.client);

    const groups = await t.client.groups();
    assert.deepEqual(groups.map((g) => [g.fullPath, g.kind]), [["ada", "user"], ["acme", "group"], ["acme/research", "group"]]);
    assert.ok(groups.every((g) => typeof g.id === "string" && typeof g.name === "string"));

    const from = s.requests.length;
    const repositories = await t.client.repositories();
    const pages = s.requests.slice(from).filter((r) => r.path === "/api/v1/host/repositories");
    assert.equal(pages.length, 2);
    assert.equal(pages[0].query, "");
    assert.match(pages[1].query, /^\?cursor=/);
    assert.deepEqual(repositories.map((r) => r.id), [a.id, b.id, c.id]);
    const first = repositories[0];
    assert.equal(first.path, "a-spex");
    assert.equal(first.group.fullPath, "acme");
    // The remote is the Git system's, inside its storage group; the
    // path is the instance's, and no page is answered (DR-120).
    assert.equal(first.remoteUrl, `${t.host.gitOrigin}/${STANDIN_STORAGE}/acme/a-spex.git`);
    assert.ok(!("webUrl" in first) && !("url" in first.group));
    assert.equal(first.visibility, "private");
    assert.equal(first.spexBranch, true);
    assert.equal(first.empty, false);
    assert.deepEqual(first.project, { format: 1, name: "a", remote: "git@example.test:acme/a.git" });
    assert.equal(repositories[1].spexBranch, false);
    assert.equal(repositories[1].project, null);
    assert.equal(repositories[2].empty, true);

    s.rename(b.id, { name: "bee-spex", group: "acme" });
    const renamed = (await t.client.repositories()).find((r) => r.id === b.id);
    assert.equal(renamed?.path, "bee-spex");
    assert.equal(renamed?.remoteUrl, `${t.host.gitOrigin}/${STANDIN_STORAGE}/acme/bee-spex.git`);

    s.removeMember(a.id);
    assert.deepEqual((await t.client.repositories()).map((r) => r.id), [b.id, c.id]);
    await assert.rejects(t.client.repository(a.id), hostError("not_found", { words: "The repository is not shared with this account." }));
  } finally {
    await t.dispose();
  }
});

test("git-host-5: a repository's read-only state and branch state as the host reports them", async () => {
  const t = await setup();
  try {
    const s = t.host.script;
    const a = s.addRepository({ group: "acme", name: "a-spex", project: { format: 1, name: "a", remote: null } });
    const archived = s.addRepository({ group: "acme", name: "old-spex", archived: true });
    const guest = s.addRepository({ group: "acme", name: "guest-spex" });
    s.accessLevel(guest.id, "Guest");
    await browserSignIn(t.client);

    const detail = await t.client.repository(a.id);
    assert.equal(detail.readOnly, null);
    assert.deepEqual(detail.branch, { present: true, canPush: true, protected: false, blocked: false });
    const old = await t.client.repository(archived.id);
    assert.equal(old.readOnly?.reason, "archived");
    assert.ok((old.readOnly?.message ?? "").length > 0);
    assert.deepEqual(old.branch, { present: false, canPush: null, protected: null, blocked: false });
    const reader = await t.client.repository(guest.id);
    assert.equal(reader.readOnly?.reason, "access");
    assert.match(reader.readOnly?.message ?? "", /Guest/);
  } finally {
    await t.dispose();
  }
});

test("git-host-6, git-host-7: creation answers created, pending or name taken; branch preparation ready or pending", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    const created = await t.client.create({ groupId: "2002", name: "widget-spex", description: "Records of the widget project; its code lives at git@example.test:acme/widget.git" });
    assert.equal(created.status, "created");
    if (created.status !== "created") return;
    const repo = created.repository;
    assert.equal(repo.path, "widget-spex");
    assert.equal(repo.group.fullPath, "acme");
    assert.equal(repo.visibility, "private");
    assert.equal(repo.empty, false);
    assert.equal(repo.spexBranch, false);
    const bare = t.host.bareOf("acme/widget-spex");
    assert.equal(execFileSync("git", ["-C", bare, "ls-tree", "--name-only", "main"], { encoding: "utf8" }).trim(), "README.md");

    const own = await t.client.create({ groupId: null, name: "ada-spex", description: "Ada's own records" });
    assert.equal(own.status === "created" && own.repository.group.kind, "user");
    // The own namespace's id names no group of the instance: the
    // stand-in answers it 404, as spex.pub does (git-host-12).
    await assert.rejects(t.client.create({ groupId: "2001", name: "mine-spex", description: "" }), hostError("not_found", { words: "The group is not known." }));
    assert.deepEqual(t.host.script.creations.map((body) => (body as { group_id?: unknown }).group_id), ["2002", null, "2001"]);

    await assert.rejects(t.client.create({ groupId: "2002", name: "widget-spex", description: "" }), hostError("name_taken"));
    await assert.rejects(t.client.create({ groupId: "2002", name: "Widget", description: "" }), hostError("bad_request"));

    t.host.script.refuseCreate("You need the Maintainer role in acme to create projects.");
    assert.deepEqual(await t.client.create({ groupId: "2002", name: "other-spex", description: "" }), { status: "pending", message: "You need the Maintainer role in acme to create projects." });
    t.host.script.refuseCreate(null);

    assert.deepEqual(await t.client.prepareBranch(repo.id), { status: "ready" });
    t.host.script.refuseBranch("You are not allowed to change branch rules.");
    assert.deepEqual(await t.client.prepareBranch(repo.id), { status: "pending", message: "You are not allowed to change branch rules." });
  } finally {
    await t.dispose();
  }
});

test("git-host-8: members with the host's role names and no page", async () => {
  const t = await setup();
  try {
    const repo = t.host.script.addRepository({
      group: "acme",
      name: "team-spex",
      members: [{ id: "1002", login: "grace", displayName: "Grace Hopper", role: "Developer" }, { id: "1003", login: "alan", displayName: null, role: "Guest" }],
    });
    await browserSignIn(t.client);
    const answer = await t.client.members({ kind: "repository", id: repo.id });
    const { members } = answer;
    assert.deepEqual(members.map((m) => [m.login, m.displayName, m.role]), [["ada", "Ada Lovelace", "Owner"], ["grace", "Grace Hopper", "Developer"], ["alan", null, "Guest"]]);
    assert.ok(members.every((m) => typeof m.id === "string" && m.direct && m.via === null));
    // No page of the host crosses (DR-120).
    assert.deepEqual(Object.keys(answer), ["members"]);
    assert.ok(members.every((m) => Object.keys(m).sort().join() === "direct,displayName,id,login,role,via"), JSON.stringify(members));

    // Every members route failing, as spex.pub's do while its service
    // identity's read fails, every other route answering (git-host-12):
    // a read holds the rest of the view, the count unknown (git-host-5).
    t.host.script.failMembers(true);
    await assert.rejects(t.client.members({ kind: "repository", id: repo.id }), hostError("unreachable", { words: "The Git host could not be reached." }));
    await assert.rejects(t.client.members({ kind: "group", id: "2002" }), hostError("unreachable"));
    await assert.rejects(t.client.addMember({ kind: "repository", id: repo.id }, { login: "bob", role: "developer" }), hostError("unreachable"));
    await assert.rejects(t.client.removeMember({ kind: "repository", id: repo.id }, "grace"), hostError("unreachable"));
    const held = await readHostView(t.client);
    assert.deepEqual(held.groups.map((group) => group.fullPath), ["ada", "acme", "acme/research"]);
    assert.deepEqual(held.listings.map((listing) => [listing.repository.id, listing.branchPresent, listing.members]), [[repo.id, false, null]]);
    t.host.script.failMembers(false);
    assert.deepEqual((await readHostView(t.client)).listings.map((listing) => listing.members), [3]);
  } finally {
    await t.dispose();
  }
});

test("git-host-5, git-host-8: the host's roles, what it lets the person do per group and repository, and a group's members with their source", async () => {
  const t = await setup();
  try {
    const s = t.host.script;
    const research = s.groups.find((group) => group.fullPath === "acme/research");
    assert.ok(research);
    research.can = { createSubgroup: false, manageMembers: true, rename: true, delete: false };
    research.members = [{ id: "1003", login: "grace", displayName: "Grace Hopper", role: "Developer" }];
    const managed = s.addRepository({ group: "acme", name: "a-spex", role: "Owner" });
    const reader = s.addRepository({ group: "acme", name: "b-spex", role: "Developer" });
    await browserSignIn(t.client);

    // The roles as the host lists them, least first (git-host-5).
    const described = await t.client.describe();
    assert.deepEqual(described.roles, [
      { id: "reporter", name: "Reporter", mayPush: false },
      { id: "developer", name: "Developer", mayPush: true },
      { id: "maintainer", name: "Maintainer", mayPush: true },
      { id: "owner", name: "Owner", mayPush: true },
    ]);
    assert.equal((await t.client.me()).canCreateGroup, true);
    // The description says whether root groups can be made, as spex.pub's
    // does, and the person's ability says the same (git-host-12).
    const description = async (): Promise<unknown> => (await fetch(`${t.host.url}/api/v1/host`)).json();
    assert.equal((await description() as { groups?: unknown }).groups, true);
    s.canCreateGroup = false;
    assert.equal((await t.client.me()).canCreateGroup, false);
    assert.equal((await description() as { groups?: unknown }).groups, false);
    const groups = await t.client.groups();
    assert.deepEqual(groups.map((group) => [group.fullPath, group.can]), [
      ["ada", { createSubgroup: false, manageMembers: false, rename: false, delete: false }],
      ["acme", { createSubgroup: true, manageMembers: true, rename: true, delete: true }],
      ["acme/research", { createSubgroup: false, manageMembers: true, rename: true, delete: false }],
    ]);
    const repositories = await t.client.repositories();
    assert.deepEqual(repositories.map((repository) => [repository.id, repository.can]), [[managed.id, { manageMembers: true, transfer: true }], [reader.id, { manageMembers: false, transfer: false }]]);

    // A group's members: its own first, then those it inherits, each
    // with the group it comes through (git-host-8).
    const { members } = await t.client.members({ kind: "group", id: "2003" });
    assert.deepEqual(members.map((m) => [m.login, m.role, m.direct, m.via]), [["grace", "Developer", true, null], ["ada", "Owner", false, "acme"]]);
    const inherited = await t.client.members({ kind: "repository", id: managed.id });
    assert.deepEqual(inherited.members.map((m) => [m.login, m.direct, m.via]), [["ada", true, null]]);
  } finally {
    await t.dispose();
  }
});

test("git-host-15, git-host-16, git-host-17: group creation and member writes answer as the host does, its words kept whole", async () => {
  const t = await setup();
  try {
    const s = t.host.script;
    const repo = s.addRepository({ group: "acme", name: "team-spex" });
    await browserSignIn(t.client);

    // Creation at the top and inside a group, named as typed at the path
    // given (git-host-15).
    const top = await t.client.createGroup({ name: "Lumen Labs", path: "lumen-labs", parentId: null });
    assert.deepEqual([top.fullPath, top.name, top.kind, top.can], ["lumen-labs", "Lumen Labs", "group", { createSubgroup: true, manageMembers: true, rename: true, delete: true }]);
    assert.equal(typeof top.id, "string");
    // At the instance's root the service identity is an Owner beside the
    // person, and no members listing shows it (git-host-8, DR-120): the
    // group, and a repository made in it, list the person alone.
    assert.ok(s.groups.find((group) => group.id === top.id)?.members?.some((member) => member.login === s.serviceAccount.login));
    assert.deepEqual((await t.client.members({ kind: "group", id: top.id ?? "" })).members.map((m) => [m.login, m.role, m.direct]), [["ada", "Owner", true]]);
    const inTop = await t.client.create({ groupId: top.id, name: "lumen-spex", description: "" });
    assert.ok(inTop.status === "created");
    assert.deepEqual((await t.client.members({ kind: "repository", id: inTop.repository.id })).members.map((m) => [m.login, m.direct, m.via]), [["ada", true, null]]);
    // A root path an account holds is taken, unless the host admits it.
    await assert.rejects(t.client.createGroup({ name: "Bob", path: "bob", parentId: null }), hostError("name_taken", { words: "This path is taken by an account." }));
    const named = await t.client.createGroup({ name: "华芯智造", path: "huaxin-mfg", parentId: null });
    assert.deepEqual([named.fullPath, named.name], ["huaxin-mfg", "华芯智造"]);
    const sub = await t.client.createGroup({ name: "Team One", path: "team-one", parentId: "2002" });
    assert.equal(sub.fullPath, "acme/team-one");
    assert.ok((await t.client.groups()).some((group) => group.id === sub.id && group.fullPath === "acme/team-one"));
    await assert.rejects(t.client.createGroup({ name: "Lumen Labs", path: "lumen-labs", parentId: null }), hostError("name_taken", { words: "Failed to save group: Path has already been taken." }));
    s.takenGroups.push("elsewhere");
    await assert.rejects(t.client.createGroup({ name: "Elsewhere", path: "elsewhere", parentId: null }), hostError("name_taken"));
    s.refuseGroupCreate("You cannot create groups here.");
    await assert.rejects(t.client.createGroup({ name: "Other", path: "other", parentId: "2002" }), hostError("host_refused", { words: "You cannot create groups here." }));
    s.refuseGroupCreate(null);

    // Addition by login at a role's id, to a group and to a repository
    // (git-host-16).
    const added = await t.client.addMember({ kind: "group", id: sub.id ?? "" }, { login: "grace", role: "maintainer" });
    assert.deepEqual([added.login, added.displayName, added.role, added.direct, added.via], ["grace", "Grace Hopper", "Maintainer", true, null]);
    const toRepo = await t.client.addMember({ kind: "repository", id: repo.id }, { login: "bob", role: "developer" });
    assert.equal(toRepo.role, "Developer");
    assert.deepEqual((await t.client.members({ kind: "repository", id: repo.id })).members.map((m) => [m.login, m.role]), [["ada", "Owner"], ["bob", "Developer"]]);
    await assert.rejects(t.client.addMember({ kind: "group", id: sub.id ?? "" }, { login: "zed", role: "developer" }), hostError("not_found", { words: "No account is named zed." }));
    await assert.rejects(t.client.addMember({ kind: "group", id: sub.id ?? "" }, { login: "grace", role: "developer" }), hostError("host_refused", { words: "Member already exists" }));
    s.refuseMembers("You need the Owner role to add members.");
    await assert.rejects(t.client.addMember({ kind: "repository", id: repo.id }, { login: "alan", role: "reporter" }), hostError("host_refused", { words: "You need the Owner role to add members." }));

    // Removal of a membership of its own (git-host-17).
    await assert.rejects(t.client.removeMember({ kind: "repository", id: repo.id }, "bob"), hostError("host_refused", { words: "You need the Owner role to add members." }));
    s.refuseMembers(null);
    await t.client.removeMember({ kind: "repository", id: repo.id }, "bob");
    await t.client.removeMember({ kind: "group", id: sub.id ?? "" }, "grace");
    assert.deepEqual((await t.client.members({ kind: "group", id: sub.id ?? "" })).members.map((m) => [m.login, m.direct, m.via]), [["ada", true, null]]);
    await assert.rejects(t.client.removeMember({ kind: "group", id: "2003" }, "ada"), hostError("not_found", { words: "ada is not a direct member of acme/research." }));
    await assert.rejects(t.client.removeMember({ kind: "group", id: "2003" }, "zed"), hostError("not_found", { words: "No account is named zed." }));
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-9: the credential and the helper

function testGitEnv(scratch: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: scratch,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.test",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.test",
    LC_ALL: "C",
    ...extra,
  };
}

function runGit(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveRun) => {
    const child = spawn("git", args, { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code) => resolveRun({ code, stderr }));
  });
}

test("git-host-9: the credential is the host's for its own Git origin and refused for another", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    const described = await t.client.describe();
    assert.deepEqual([described.displayName, described.gitOrigin], ["Stand-in Git host", t.host.gitOrigin]);
    const credential = await t.client.credential(t.host.gitOrigin);
    const stored = await fileCredentialStore(t.home, t.host.url).read();
    assert.equal(credential.username, "oauth2");
    assert.ok(stored && credential.secret === stored.access, "the secret is this device's live access token");
    assert.ok(credential.expiresAt > Date.now());
    await assert.rejects(t.client.credential("https://elsewhere.example"), hostError("bad_request"));
    assert.equal(t.signedOut.length, 0);
  } finally {
    await t.dispose();
  }
});

test("git-host-9: a push through the helper carries the brokered credential; one without it is refused", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    const created = await t.client.create({ groupId: "2002", name: "push-spex", description: "push test" });
    assert.equal(created.status, "created");
    if (created.status !== "created") return;
    const remote = created.repository.remoteUrl;
    assert.ok(!remote.includes("@"), "no credential in the remote URL");

    // The device's own helper, which must neither answer nor store the
    // brokered secret.
    const recorder = join(t.scratch, "device-helper.sh");
    const recorded = join(t.scratch, "device-helper.log");
    writeFileSync(recorder, `#!/bin/sh\necho "$1" >> "${recorded}"\ncat > /dev/null\n`);
    chmodSync(recorder, 0o755);
    const globalConfig = join(t.scratch, "gitconfig");
    writeFileSync(globalConfig, `[credential]\n\thelper = ${recorder}\n`);
    const env = testGitEnv(t.scratch, { GIT_CONFIG_GLOBAL: globalConfig });

    const clone = join(t.scratch, "clone");
    const cloneCredential = await withGitCredential(await t.client.credential(t.host.gitOrigin), currentRuntime());
    const cloned = await runGit([...cloneCredential.configArgs, "clone", "-q", remote, clone], { ...env, ...cloneCredential.env });
    await cloneCredential.dispose();
    assert.equal(cloned.code, 0, cloned.stderr);

    execFileSync("git", ["-C", clone, "checkout", "-q", "--orphan", "spex"], { env });
    execFileSync("git", ["-C", clone, "rm", "-rfq", "."], { env });
    writeFileSync(join(clone, "project.json"), `${JSON.stringify({ format: 1, name: "push", remote: null })}\n`);
    execFileSync("git", ["-C", clone, "add", "project.json"], { env });
    execFileSync("git", ["-C", clone, "-c", "commit.gpgsign=false", "commit", "-qm", "records"], { env });

    const credential = await t.client.credential(t.host.gitOrigin);
    const handle = await withGitCredential(credential, currentRuntime());
    const file = handle.env[GIT_CREDENTIAL_FILE_ENV] ?? "";
    assert.equal(mode(file), 0o600);
    assert.equal(mode(dirname(file)), 0o700);
    assert.equal(handle.env.ELECTRON_RUN_AS_NODE, undefined);
    const from = t.host.script.requests.length;
    const pushed = await runGit([...handle.configArgs, "-C", clone, "push", "-q", "origin", "spex"], { ...env, ...handle.env });
    await handle.dispose();
    assert.equal(pushed.code, 0, pushed.stderr);
    assert.equal(existsSync(dirname(file)), false, "the credential's directory is removed after the child");
    assert.ok(t.host.script.requests.slice(from).some((r) => r.path.endsWith("/git-receive-pack") && r.authorization));
    const bare = t.host.bareOf("acme/push-spex");
    assert.equal(execFileSync("git", ["-C", bare, "show", "spex:project.json"], { encoding: "utf8" }).trim(), JSON.stringify({ format: 1, name: "push", remote: null }));
    assert.equal(existsSync(recorded), false, "the device's own helper was never asked");
    const detail = await t.client.repository(created.repository.id);
    assert.equal(detail.branch.present, true);
    assert.equal(detail.spexBranch, true);

    writeFileSync(join(clone, "note.txt"), "more\n");
    execFileSync("git", ["-C", clone, "add", "note.txt"], { env });
    execFileSync("git", ["-C", clone, "-c", "commit.gpgsign=false", "commit", "-qm", "more"], { env });
    const before = execFileSync("git", ["-C", bare, "rev-parse", "spex"], { encoding: "utf8" }).trim();
    const refused = await runGit(["-C", clone, "push", "-q", "origin", "spex"], env);
    assert.notEqual(refused.code, 0);
    assert.match(refused.stderr, /Authentication failed|could not read Username|401/);
    assert.equal(execFileSync("git", ["-C", bare, "rev-parse", "spex"], { encoding: "utf8" }).trim(), before);
    assert.match(readFileSync(recorded, "utf8"), /^get$/m, "without Spex's helper the device's own is asked");

    // An archived repository refuses the push even with the credential.
    t.host.script.archive(created.repository.id);
    const archivedHandle = await withGitCredential(await t.client.credential(t.host.gitOrigin), currentRuntime());
    const archived = await runGit([...archivedHandle.configArgs, "-C", clone, "push", "-q", "origin", "spex"], { ...env, ...archivedHandle.env });
    await archivedHandle.dispose();
    assert.notEqual(archived.code, 0);
    assert.match(archived.stderr, /403|archived/);
  } finally {
    await t.dispose();
  }
});

test("git-host-9: the helper names the runtime and refuses what the shell cannot quote", async () => {
  const electron = await withGitCredential({ username: "oauth2", secret: "s3cret" }, { execPath: "/Applications/Spex.app/Contents/MacOS/Spex", electron: true });
  try {
    assert.equal(electron.env.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(electron.configArgs[0], "-c");
    assert.equal(electron.configArgs[1], "credential.helper=");
    assert.match(electron.configArgs[3], /^credential\.helper=!"\/Applications\/Spex\.app\/Contents\/MacOS\/Spex" ".*git-credential-spex\.mjs"$/);
    const file = electron.env[GIT_CREDENTIAL_FILE_ENV] ?? "";
    assert.equal(readFileSync(file, "utf8"), "username=oauth2\npassword=s3cret\n");
  } finally {
    await electron.dispose();
  }
  await assert.rejects(withGitCredential({ username: "oauth2", secret: "x" }, { execPath: "/tmp/a\"b", electron: false }), /cannot be quoted/);
  await assert.rejects(withGitCredential({ username: "oauth2", secret: "x\ny" }, currentRuntime()), /cannot carry/);
  // The shipped helper answers `get` from the file and ignores the rest.
  const handle = await withGitCredential({ username: "oauth2", secret: "tok" }, currentRuntime());
  try {
    const helper = /" "(.*)"$/.exec(handle.configArgs[3])?.[1] ?? "";
    const ask = (operation: string) => execFileSync(process.execPath, [helper, operation], { input: "protocol=https\nhost=example.test\n\n", encoding: "utf8", env: { ...process.env, ...handle.env } });
    assert.equal(ask("get"), "username=oauth2\npassword=tok\n\n");
    assert.equal(ask("store"), "");
    assert.equal(ask("erase"), "");
  } finally {
    await handle.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-11: failures relayed with the host's words

test("git-host-11: each failure the host answers is a kind with the host's words kept whole", async () => {
  // The 30 s the rate limit asks for hold the next call 0.2 s at most
  // here, a test-shortened bound (git-host-21).
  const t = await setup({ holdMaxMs: 200 });
  try {
    await browserSignIn(t.client);
    const s = t.host.script;
    s.rateLimit(1, "30");
    await assert.rejects(t.client.groups(), hostError("rate_limited", { retryAfter: "30", words: "Too many requests to the Git host." }));
    // The hold passes before the next call, which would be refused
    // while it stands (git-host-21).
    await sleep(300);
    s.unavailable(1);
    await assert.rejects(t.client.groups(), hostError("unreachable", { words: "The Git host did not answer." }));
    s.refuseHost(1, "Your account is blocked: contact support.");
    await assert.rejects(t.client.groups(), hostError("host_refused", { words: "Your account is blocked: contact support." }));
    await assert.rejects(t.client.repository("9999"), hostError("not_found", { words: "The repository is not shared with this account." }));
    assert.equal((await t.client.groups()).length, 3, "a failure leaves the device signed in");
    assert.equal(t.signedOut.length, 0);

    await t.closeHost();
    await assert.rejects(t.client.groups(), hostError("unreachable", { words: undefined }));
    assert.equal(await t.client.signedIn(), true, "no answer signs nobody out");
  } finally {
    await t.dispose();
  }
});

// ---------------------------------------------------------------------------
// git-host-21: the host's rate limit holds every call

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number): string => String(n).padStart(2, "0");
const clock = (d: Date): string => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
/** An HTTP date in RFC 850's obsolete form. */
const rfc850 = (d: Date): string => `${WEEKDAYS[d.getUTCDay()]}, ${two(d.getUTCDate())}-${MONTH_NAMES[d.getUTCMonth()]}-${two(d.getUTCFullYear() % 100)} ${clock(d)} GMT`;
/** An HTTP date in asctime's obsolete form. */
const asctime = (d: Date): string => `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, " ")} ${clock(d)} ${d.getUTCFullYear()}`;

test("git-host-21, git-host-11: a 429 holds the calls that wait until the instant it asks for — its number, its date, none without either — 120 s at most, a call's Stop ending its wait unsent, and refuses any other with the seconds that remain", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    const s = t.host.script;
    /** A call the stand-in answers 429: the words it is relayed in, and
     * when its request reached the stand-in. */
    const limited = async (client: GitHostClient, retryAfter: string | null): Promise<{ words: string; at: number }> => {
      s.rateLimit(1, retryAfter);
      let words = "";
      await assert.rejects(client.groups(), (error: unknown) => {
        hostError("rate_limited", { words: "Too many requests to the Git host." })(error);
        assert.equal((error as HostError).retryAfter, retryAfter, "the host's Retry-After is kept raw");
        words = relayHostError(error, "Host");
        return true;
      });
      return { words, at: s.requests[s.requests.length - 1].at };
    };
    /** When the next call that waits, as the host read's do, reached the
     * stand-in. */
    const next = async (client: GitHostClient): Promise<number> => {
      const index = s.requests.length;
      assert.equal((await client.groups({ wait: true })).length, 3);
      return s.requests[index].at;
    };

    // The header's number (git-host-11): any call that does not wait is
    // refused at once meanwhile, as the host asking to wait the seconds
    // that remain, sending nothing; the next call that waits waits it out.
    const number = await limited(t.client, "2");
    assert.equal(number.words, "Host asks to wait 2 seconds");
    const held = s.requests.length;
    const refusedAt = Date.now();
    await assert.rejects(t.client.members({ kind: "repository", id: "1001" }), (error: unknown) => {
      hostError("rate_limited", { retryAfter: "2" })(error);
      assert.equal(relayHostError(error, "Host"), "Host asks to wait 2 seconds");
      return true;
    });
    assert.ok(Date.now() - refusedAt < 500, "refused at once");
    assert.equal(s.requests.length, held, "the refused call sent nothing");
    assert.ok((await next(t.client)) - number.at >= 1_950, "the next call that waits waits the 2 s out");

    // Two calls in flight answered 3 and 1 seconds: the later instant
    // stands, whichever answer comes last.
    s.rateLimit(1, "3");
    s.rateLimit(1, "1");
    const pair = s.requests.length;
    const answers = await Promise.allSettled([t.client.groups(), t.client.groups()]);
    assert.deepEqual(answers.map((answer) => answer.status), ["rejected", "rejected"]);
    assert.ok((await next(t.client)) - s.requests[pair].at >= 2_950, "the next call waits the 3 s out");

    // An HTTP date three seconds ahead: the seconds until it.
    while (Date.now() % 1_000 > 50) await sleep(5);
    const date = Math.floor(Date.now() / 1_000) * 1_000 + 3_000;
    const dated = await limited(t.client, new Date(date).toUTCString());
    assert.equal(dated.words, "Host asks to wait 3 seconds");
    await next(t.client);
    assert.ok(Date.now() >= date, "the next call waits for the date");

    // A date past, in either obsolete form, reads no seconds below zero
    // and holds nothing; no time of its own reads "a moment" and holds
    // nothing either.
    const past = new Date(Date.now() - 10_000);
    for (const [retryAfter, words] of [[rfc850(past), "Host asks to wait 0 seconds"], [asctime(past), "Host asks to wait 0 seconds"], [null, "Host asks to wait a moment"]] as const) {
      const answered = await limited(t.client, retryAfter);
      assert.equal(answered.words, words);
      assert.ok((await next(t.client)) - answered.at < 1_000, `${retryAfter ?? "no Retry-After"} holds nothing`);
    }

    // 120 s at most: a test-shortened bound of 1 s holds the 30 s asked
    // for 1 s.
    const bounded = new GitHostClient({ url: t.host.url, label: "Spex on test", credentials: fileCredentialStore(t.home, t.host.url), holdMaxMs: 1_000 });
    const capped = await limited(bounded, "30");
    assert.equal(capped.words, "Host asks to wait 30 seconds");
    const cappedNext = (await next(bounded)) - capped.at;
    assert.ok(cappedNext >= 950 && cappedNext < 10_000, `the bound held the next call ${Math.round(cappedNext)} ms`);

    // A call's Stop ends its wait at once, the call sending nothing.
    await limited(t.client, "30");
    const index = s.requests.length;
    const stop = new AbortController();
    const asked = Date.now();
    const pending = t.client.prepareBranch("1001", { signal: stop.signal });
    setTimeout(() => stop.abort(), 200);
    await assert.rejects(pending, HostWaitStopped);
    assert.ok(Date.now() - asked < 5_000, "the Stop ends the wait");
    assert.equal(s.requests.length, index, "nothing reached the stand-in");
  } finally {
    await t.dispose();
  }
});

test("git-host-11: no secret enters an error message", async () => {
  const t = await setup();
  try {
    await browserSignIn(t.client);
    const stored = await fileCredentialStore(t.home, t.host.url).read();
    assert.ok(stored);
    t.host.script.revokeDevices();
    try {
      await t.client.groups();
      assert.fail("a revoked device must be refused");
    } catch (error) {
      const text = `${String(error)} ${(error as Error).stack ?? ""} ${JSON.stringify(error)}`;
      assert.ok(!text.includes(stored.access) && !text.includes(stored.refresh));
    }
  } finally {
    await t.dispose();
  }
});

test("git-host-12: the stand-in serves its pages and refuses malformed sign-in requests", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-standin-"));
  mkdirSync(scratch, { recursive: true });
  const host = await startStandinHost({ dir: join(scratch, "host"), displayName: "Test Host" });
  try {
    const describe = await fetch(`${host.url}/api/v1/host`);
    assert.equal(describe.headers.get("cache-control"), "no-store");
    assert.deepEqual(await describe.json(), {
      display_name: "Test Host",
      git_origin: `${host.url}/git`,
      roles: [
        { id: "reporter", name: "Reporter", may_push: false },
        { id: "developer", name: "Developer", may_push: true },
        { id: "maintainer", name: "Maintainer", may_push: true },
        { id: "owner", name: "Owner", may_push: true },
      ],
      groups: true,
    });
    const unauth = await fetch(`${host.url}/api/v1/host/me`);
    assert.equal(unauth.status, 401);
    assert.deepEqual(((await unauth.json()) as { error: { code: string } }).error.code, "unauthenticated");
    const badClient = await fetch(`${host.url}/login/app?client_id=other`, { redirect: "manual" });
    assert.equal(badClient.status, 400);
    const badRedirect = await fetch(`${host.url}/login/app?${new URLSearchParams({ client_id: "spex", label: "x", redirect_uri: "https://evil.example/cb", code_challenge: "a".repeat(43), code_challenge_method: "S256", state: "s" })}`, { redirect: "manual" });
    assert.equal(badRedirect.status, 400);
    assert.equal(badRedirect.headers.get("location"), null);
    const page = await fetch(`${host.url}/login/device?user_code=BCDF-GHJK`);
    assert.match(await page.text(), /BCDF-GHJK/);
    const transport = await fetch(`${host.url}/git/acme/none-spex.git/info/refs?service=git-upload-pack`);
    assert.equal(transport.status, 401);
    assert.match(transport.headers.get("www-authenticate") ?? "", /^Basic/);
  } finally {
    await host.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// git-host-12: the stand-in run as several instances (DR-127)

/** The status a Git transport answers a ref advertisement of the
 * repository at `path` under its Git origin, with `secret` presented as
 * the core presents a brokered credential. */
async function advertised(gitOrigin: string, path: string, secret: string): Promise<number> {
  const answer = await fetch(`${gitOrigin}/${path}.git/info/refs?service=git-upload-pack`, {
    headers: { authorization: `Basic ${Buffer.from(`oauth2:${secret}`).toString("base64")}` },
  });
  await answer.arrayBuffer();
  return answer.status;
}

async function described(host: StandinHost): Promise<{ display_name: string; git_origin: string }> {
  const answer = await fetch(`${host.url}/api/v1/host`);
  const body = (await answer.json()) as { display_name: string; git_origin: string };
  return { display_name: body.display_name, git_origin: body.git_origin };
}

test("git-host-12: two stand-in instances run at once, each at its own origin with its own display name, accounts, tokens, groups and description", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-standin-"));
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startStandinHost({ dir: join(scratch, "first"), displayName: "First" });
  const second = await startStandinHost({ dir: join(scratch, "second"), displayName: "Second", person: bob });
  try {
    assert.notEqual(first.url, second.url);
    assert.notEqual(first.dir, second.dir);
    assert.deepEqual([first.gitOrigin, second.gitOrigin], [`${first.url}/git`, `${second.url}/git`]);
    assert.deepEqual([first.storage, second.storage], [STANDIN_STORAGE, STANDIN_STORAGE]);
    assert.deepEqual(await described(first), { display_name: "First", git_origin: first.gitOrigin });
    assert.deepEqual(await described(second), { display_name: "Second", git_origin: second.gitOrigin });
    // Each its own person, the others known as its accounts.
    assert.deepEqual(first.script.accounts.map((account) => account.login), ["bob", "grace", "alan"]);
    assert.deepEqual(second.script.accounts.map((account) => account.login), ["ada", "grace", "alan"]);

    const homeOne = join(scratch, "home-one");
    const homeTwo = join(scratch, "home-two");
    const one = instanceClient(homeOne, first);
    const two = instanceClient(homeTwo, second);
    assert.equal((await browserSignIn(one)).account.login, "ada");
    assert.equal((await browserSignIn(two)).account.login, "bob");
    assert.deepEqual((await one.groups()).map((group) => [group.id, group.fullPath, group.kind]), [["2001", "ada", "user"], ["2002", "acme", "group"], ["2003", "acme/research", "group"]]);
    assert.deepEqual((await two.groups()).map((group) => [group.id, group.fullPath, group.kind]), [["u1002", "bob", "user"], ["2002", "acme", "group"], ["2003", "acme/research", "group"]]);

    // A group `acme` at each, each listing its own repository: two Git
    // systems mint ids that collide.
    const a = first.script.addRepository({ group: "acme", name: "a-spex" });
    const b = second.script.addRepository({ group: "acme", name: "b-spex" });
    assert.equal(a.id, b.id);
    assert.deepEqual((await one.repositories()).map((repository) => repository.remoteUrl), [`${first.gitOrigin}/${STANDIN_STORAGE}/acme/a-spex.git`]);
    assert.deepEqual((await two.repositories()).map((repository) => repository.remoteUrl), [`${second.gitOrigin}/${STANDIN_STORAGE}/acme/b-spex.git`]);
    assert.notEqual(first.bareOf("acme/a-spex"), second.bareOf("acme/b-spex"));

    // One instance's token is refused at the other's routes and transport.
    const tokenOne = (await fileCredentialStore(homeOne, first.url).read())?.access ?? "";
    const tokenTwo = (await fileCredentialStore(homeTwo, second.url).read())?.access ?? "";
    const me = await fetch(`${second.url}/api/v1/host/me`, { headers: { authorization: `Bearer ${tokenOne}` } });
    assert.equal(me.status, 401);
    await me.arrayBuffer();
    assert.equal(await advertised(first.gitOrigin, `${STANDIN_STORAGE}/acme/a-spex`, tokenTwo), 401);
    assert.equal(await advertised(first.gitOrigin, `${STANDIN_STORAGE}/acme/a-spex`, tokenOne), 200);
    assert.equal(await advertised(second.gitOrigin, `${STANDIN_STORAGE}/acme/b-spex`, tokenTwo), 200);
    assert.deepEqual(first.script.transportCredentials.map((use) => use.instance), [first.url]);
    assert.deepEqual(second.script.transportCredentials.map((use) => use.instance), [second.url]);
  } finally {
    await first.close();
    await second.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("git-host-12: two instances over one Git backend share one transport at one Git origin and the namespaces' repositories under the same ids, keep their groups in containers of their own, and answer archive and role each its own way", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-standin-"));
  const first = await startStandinHost({ dir: join(scratch, "git"), displayName: "First" });
  const second = await startStandinHost({ gitBackend: first, displayName: "Second" });
  const env = testGitEnv(scratch);
  try {
    // One directory and one transport, at the Git origin both describe.
    assert.notEqual(second.url, first.url);
    assert.equal(second.dir, first.dir);
    assert.equal(second.gitOrigin, `${first.url}/git`);
    assert.deepEqual([first.storage, second.storage], [STANDIN_STORAGE, `${STANDIN_STORAGE}-2`]);
    assert.deepEqual(await described(first), { display_name: "First", git_origin: first.gitOrigin });
    assert.deepEqual(await described(second), { display_name: "Second", git_origin: first.gitOrigin });
    const stray = await fetch(`${second.url}/git/ada/none-spex.git/info/refs?service=git-upload-pack`);
    assert.equal(stray.status, 404, "the transport is served at one origin");
    await stray.arrayBuffer();

    const one = instanceClient(join(scratch, "home-one"), first);
    const two = instanceClient(join(scratch, "home-two"), second);
    await browserSignIn(one);
    await browserSignIn(two);

    // The person's namespace and its repositories, listed by both under
    // the same ids, one added at the first and one created at the second.
    const ns = first.script.addRepository({ group: "ada", name: "ns-spex" });
    const made = await two.create({ groupId: null, name: "made-spex", description: "made at the second" });
    assert.equal(made.status, "created");
    if (made.status !== "created") return;
    assert.notEqual(made.repository.id, ns.id, "one Git system's ids");
    const namespaceRows = [[ns.id, "2001", `${first.gitOrigin}/ada/ns-spex.git`], [made.repository.id, "2001", `${first.gitOrigin}/ada/made-spex.git`]];
    const rows = (listed: HostRepository[]) => listed.map((repository) => [repository.id, repository.group.id, repository.remoteUrl]);
    assert.deepEqual(rows(await one.repositories()), namespaceRows);
    assert.deepEqual(rows(await two.repositories()), namespaceRows);
    assert.ok(second.script.repositories.includes(ns));

    // Each instance's groups in a container of its own on the Git system,
    // under that system's ids; neither lists the other's.
    const a = first.script.addRepository({ group: "acme", name: "a-spex" });
    const b = second.script.addRepository({ group: "acme", name: "b-spex" });
    const acmeOf = async (client: GitHostClient) => (await client.groups()).find((group) => group.fullPath === "acme")?.id;
    assert.notEqual(await acmeOf(two), await acmeOf(one));
    assert.deepEqual(rows(await one.repositories()).slice(2), [[a.id, a.group.id, `${first.gitOrigin}/${STANDIN_STORAGE}/acme/a-spex.git`]]);
    assert.deepEqual(rows(await two.repositories()).slice(2), [[b.id, b.group.id, `${first.gitOrigin}/${STANDIN_STORAGE}-2/acme/b-spex.git`]]);
    assert.equal(first.bareOf("acme/a-spex"), join(first.dir, STANDIN_STORAGE, "acme", "a-spex.git"));
    assert.equal(second.bareOf("acme/b-spex"), join(first.dir, `${STANDIN_STORAGE}-2`, "acme", "b-spex.git"));
    assert.ok(existsSync(b.bare));
    assert.ok(!second.script.repositories.includes(a) && !first.script.repositories.includes(b));
    await assert.rejects(two.repository(a.id), hostError("not_found"));

    // Each issues credentials for the one Git origin, which its transport
    // accepts, recording the issuer.
    await assert.rejects(two.credential(`${second.url}/git`), hostError("bad_request"));
    const credentialOne = await one.credential(first.gitOrigin);
    const credentialTwo = await two.credential(first.gitOrigin);
    assert.equal(second.script.transportCredentials, first.script.transportCredentials);
    const uses = first.script.transportCredentials;
    const withCredential = async (credential: { username: string; secret: string; expiresAt: number }, args: string[]) => {
      const handle = await withGitCredential(credential, currentRuntime());
      try {
        return await runGit([...handle.configArgs, ...args], { ...env, ...handle.env });
      } finally {
        await handle.dispose();
      }
    };
    const clone = join(scratch, "clone");
    const cloned = await withCredential(credentialTwo, ["clone", "-q", `${first.gitOrigin}/ada/ns-spex.git`, clone]);
    assert.equal(cloned.code, 0, cloned.stderr);
    execFileSync("git", ["-C", clone, "checkout", "-q", "--orphan", "spex"], { env });
    writeFileSync(join(clone, "project.json"), `${JSON.stringify({ format: 1, name: "ns", remote: null })}\n`);
    execFileSync("git", ["-C", clone, "add", "project.json"], { env });
    execFileSync("git", ["-C", clone, "-c", "commit.gpgsign=false", "commit", "-qm", "records"], { env });
    const pushedTwo = await withCredential(credentialTwo, ["-C", clone, "push", "-q", "origin", "spex"]);
    assert.equal(pushedTwo.code, 0, pushedTwo.stderr);
    assert.ok(uses.length > 0 && uses.every((use) => use.instance === second.url), JSON.stringify(uses));
    assert.ok(uses.some((use) => use.push && use.path === "/git/ada/ns-spex.git/git-receive-pack"));
    const commit = (message: string) => {
      writeFileSync(join(clone, "note.txt"), `${message}\n`);
      execFileSync("git", ["-C", clone, "add", "note.txt"], { env });
      execFileSync("git", ["-C", clone, "-c", "commit.gpgsign=false", "commit", "-qm", message], { env });
    };
    commit("from the first");
    let mark = uses.length;
    const pushedOne = await withCredential(credentialOne, ["-C", clone, "push", "-q", "origin", "spex"]);
    assert.equal(pushedOne.code, 0, pushedOne.stderr);
    assert.ok(uses.length > mark && uses.slice(mark).every((use) => use.instance === first.url));
    const tip = execFileSync("git", ["-C", clone, "rev-parse", "spex"], { encoding: "utf8" }).trim();
    assert.equal(execFileSync("git", ["-C", ns.bare, "rev-parse", "spex"], { encoding: "utf8" }).trim(), tip);

    // The second scripted to answer it archived: the first answers as the
    // Git system, whose transport still takes the second's push.
    second.script.archive(ns.id);
    const archivedTwo = await two.repository(ns.id);
    assert.equal(archivedTwo.archived, true);
    assert.equal(archivedTwo.readOnly?.reason, "archived");
    assert.equal(archivedTwo.branch.canPush, false);
    const unarchivedOne = await one.repository(ns.id);
    assert.equal(unarchivedOne.archived, false);
    assert.equal(unarchivedOne.readOnly, null);
    assert.equal(unarchivedOne.branch.canPush, true);
    commit("while the second answers archived");
    assert.equal((await withCredential(credentialTwo, ["-C", clone, "push", "-q", "origin", "spex"])).code, 0);
    // The first archiving it, the second scripted not to: the transport
    // follows the Git system.
    second.script.archive(ns.id, false);
    first.script.archive(ns.id);
    assert.equal((await one.repository(ns.id)).archived, true);
    assert.equal((await two.repository(ns.id)).archived, false);
    commit("while the Git system holds it archived");
    const refused = await withCredential(credentialTwo, ["-C", clone, "push", "-q", "origin", "spex"]);
    assert.notEqual(refused.code, 0);
    assert.match(refused.stderr, /403|archived/);
    first.script.archive(ns.id, false);

    // The person's role there, the second scripted below the role that
    // pushes, the first answering the Git system's.
    second.script.accessLevel(ns.id, "Reporter");
    const reporter = await two.repository(ns.id);
    assert.equal(reporter.readOnly?.reason, "access");
    assert.equal(reporter.branch.canPush, false);
    assert.deepEqual(reporter.can, { manageMembers: false, transfer: false });
    const owner = await one.repository(ns.id);
    assert.equal(owner.readOnly, null);
    assert.deepEqual(owner.can, { manageMembers: true, transfer: true });
    assert.deepEqual((await two.members({ kind: "repository", id: ns.id })).members.map((member) => [member.login, member.role]), [["ada", "Reporter"]]);
    assert.deepEqual((await one.members({ kind: "repository", id: ns.id })).members.map((member) => [member.login, member.role]), [["ada", "Owner"]]);
    commit("while the second answers Reporter");
    assert.equal((await withCredential(credentialTwo, ["-C", clone, "push", "-q", "origin", "spex"])).code, 0);

    // A credential the second issued and revoked is refused, the first's
    // still taken.
    second.script.revokeDevices();
    mark = uses.length;
    assert.equal(await advertised(first.gitOrigin, "ada/ns-spex", credentialTwo.secret), 401);
    assert.equal(await advertised(first.gitOrigin, "ada/ns-spex", credentialOne.secret), 200);
    assert.deepEqual(uses.slice(mark).map((use) => use.instance), [first.url]);
  } finally {
    await second.close();
    await first.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});
