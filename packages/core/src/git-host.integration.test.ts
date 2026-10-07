// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Git host client against the stand-in host (git-host-13,
// git-host-14): both sign-in flows, token keeping, reads and writes,
// sign-out, the relayed failures, and a real `git push` through the
// credential helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  DEFAULT_HOST_URL,
  GitHostClient,
  HostError,
  SignInBusyError,
  credentialsPath,
  fileCredentialStore,
  hostUrlFor,
  type HostAccount,
  type HostErrorKind,
  type SignInCause,
} from "./git-host.js";
import { GIT_CREDENTIAL_FILE_ENV, currentRuntime, withGitCredential } from "./git-credential.js";
import { startStandinHost, type StandinHost } from "./testing/standin-host.js";

async function setup(options: { skew?: { ms: number } } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), "spex-git-host-"));
  const home = join(scratch, "home");
  const host = await startStandinHost({ dir: join(scratch, "host") });
  const signedOut: HostErrorKind[] = [];
  const skew = options.skew;
  const client = new GitHostClient({
    url: host.url,
    label: "Spex on test",
    credentials: fileCredentialStore(home, host.url),
    ...(skew ? { now: () => Date.now() + skew.ms } : {}),
    onSignedOut: (kind) => signedOut.push(kind),
  });
  let closed = false;
  return {
    scratch,
    home,
    host,
    client,
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

/** Complete a browser sign-in as the system browser would: open the URL,
 * follow the host's redirect to the loopback. */
async function browserSignIn(client: GitHostClient): Promise<{ account: HostAccount; page: string }> {
  const flow = await client.startBrowserSignIn();
  const first = await fetch(flow.url, { redirect: "manual" });
  assert.equal(first.status, 302);
  const location = first.headers.get("location") ?? "";
  assert.ok(location.startsWith(flow.redirectUri));
  const back = await fetch(location);
  const page = await back.text();
  assert.equal(back.status, 200);
  return { account: await flow.done, page };
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
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "http://127.0.0.1:4100/" }, null), "http://127.0.0.1:4100");
  assert.equal(hostUrlFor({ SPEX_HOST_URL: "http://127.0.0.1:4200" }, "http://127.0.0.1:4100"), "http://127.0.0.1:4100");
  assert.equal(hostUrlFor({}, "https://spex.pub"), "https://spex.pub");
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
    assert.deepEqual(account, { id: "1001", login: "ada", displayName: "Ada Lovelace" });

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
    await other.write({ access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" });
    await browserSignIn(t.client);
    await t.client.signOut();
    assert.deepEqual(await other.read(), { access: "spexa_other", accessExpiresAt: 1, refresh: "spexr_other" });
    assert.equal(await t.client.signedIn(), false);
    assert.equal(mode(credentialsPath(t.home)), 0o600);

    writeFileSync(credentialsPath(t.home), "format: 2\nhosts: {}\n");
    await assert.rejects(other.read(), /format 2, which this version of Spex does not read/);
    await assert.rejects(other.write({ access: "a", accessExpiresAt: 1, refresh: "r" }), /format 2/);
    assert.equal(readFileSync(credentialsPath(t.home), "utf8"), "format: 2\nhosts: {}\n");
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
    assert.equal(first.remoteUrl, `${t.host.gitOrigin}/acme/a-spex.git`);
    assert.equal(first.webUrl, `${t.host.url}/acme/a-spex`);
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
    assert.equal(renamed?.remoteUrl, `${t.host.gitOrigin}/acme/bee-spex.git`);

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
    const bare = join(t.host.dir, "acme", "widget-spex.git");
    assert.equal(execFileSync("git", ["-C", bare, "ls-tree", "--name-only", "main"], { encoding: "utf8" }).trim(), "README.md");

    const own = await t.client.create({ groupId: null, name: "ada-spex", description: "Ada's own records" });
    assert.equal(own.status === "created" && own.repository.group.kind, "user");

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

test("git-host-8: members with the host's role names and members page", async () => {
  const t = await setup();
  try {
    const repo = t.host.script.addRepository({
      group: "acme",
      name: "team-spex",
      members: [{ id: "1002", login: "grace", displayName: "Grace Hopper", role: "Developer" }, { id: "1003", login: "alan", displayName: null, role: "Guest" }],
    });
    await browserSignIn(t.client);
    const { members, membersUrl } = await t.client.members(repo.id);
    assert.deepEqual(members.map((m) => [m.login, m.displayName, m.role]), [["ada", "Ada Lovelace", "Owner"], ["grace", "Grace Hopper", "Developer"], ["alan", null, "Guest"]]);
    assert.ok(members.every((m) => typeof m.id === "string" && m.url !== null));
    assert.equal(membersUrl, `${t.host.url}/acme/team-spex/-/project_members`);
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
    assert.deepEqual(await t.client.describe(), { displayName: "Stand-in Git host", gitOrigin: t.host.gitOrigin });
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
    const bare = join(t.host.dir, "acme", "push-spex.git");
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
  const t = await setup();
  try {
    await browserSignIn(t.client);
    const s = t.host.script;
    s.rateLimit(1, "30");
    await assert.rejects(t.client.groups(), hostError("rate_limited", { retryAfter: "30", words: "Too many requests to the Git host." }));
    s.unavailable(1);
    await assert.rejects(t.client.groups(), hostError("unreachable", { words: "The Git host did not answer." }));
    s.refuseHost(1, "Your account is blocked by GitLab.com: contact support.");
    await assert.rejects(t.client.groups(), hostError("host_refused", { words: "Your account is blocked by GitLab.com: contact support." }));
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
    assert.deepEqual(await describe.json(), { display_name: "Test Host", git_origin: `${host.url}/git` });
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
