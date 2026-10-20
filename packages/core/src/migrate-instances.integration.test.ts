// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instances migration (DR-127), its home step: `home.yaml` in
// format 1 takes format 2 with its host as the recorded origin and, where
// it holds an account, the one instance; the app token is re-keyed to
// that origin in the same step; a restart finishes what remains, a
// divergent destination stops it unchanged, and a host URL the origin
// rule refuses stops it naming the URL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { StorageFormatError, sha256 } from "./files.js";
import { fileCredentialStore } from "./git-host.js";
import { Home } from "./home.js";
import { migrateInstances, needsInstancesMigration } from "./migrate-instances.js";
import { Store } from "./store.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const DEVICE = "71000000-0000-4000-8000-0000000000aa";
const ADA = { id: "1001", login: "ada", displayName: "Ada Lovelace" };

/** A home a Spex before DR-127 wrote: one host, as that Spex trimmed
 * the URL it was given, with the account signed in there. */
function formerHome(options: { url: string; account?: boolean; signedOut?: boolean; token?: boolean }): string {
  const root = scratchDir("spex-migrate-instances-");
  mkdirSync(join(root, "local"), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, "home.yaml"), stringifyYaml({
    format: 1, device: DEVICE,
    host: { url: options.url, clientId: "spex", ...(options.account !== false ? { account: ADA } : {}), ...(options.signedOut ? { signedOut: true } : {}) },
    own: "ada", folders: [{ path: join(root, "work"), repository: "ada/work-spex" }],
  }));
  writeFileSync(join(root, "local", "prefs.json"), JSON.stringify({ format: 1, prefs: { language: "en" } }));
  if (options.token !== false) {
    writeFileSync(join(root, "local", "credentials.yaml"), stringifyYaml({ format: 1, hosts: {
      "https://elsewhere.example": { access: "other", accessExpiresAt: 1, refresh: "other-refresh" },
      [options.url]: { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" },
    } }), { mode: 0o600 });
  }
  return root;
}

test("instances migration: home.yaml takes format 2 with its host as the recorded origin and its one instance, the app token re-keyed to that origin in the same step", async () => {
  const root = formerHome({ url: "HTTPS://Spex.Pub:443" });
  const homeBefore = readFileSync(join(root, "home.yaml"));
  const credentialsBefore = readFileSync(join(root, "local", "credentials.yaml"));
  assert.equal(needsInstancesMigration(root), true);
  // A store opened without Store.open refuses to migrate in its constructor.
  assert.throws(() => new Store({ machineIdentity, dir: root }), /open it with Store\.open to migrate/);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeBefore, "nothing written before the migration runs");

  const receipt = migrateInstances(root);
  assert.equal(needsInstancesMigration(root), false);
  const file = parseYaml(readFileSync(join(root, "home.yaml"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(file, {
    format: 2, device: DEVICE, origin: "https://spex.pub",
    instances: [{ url: "https://spex.pub", clientId: "spex", account: ADA }],
    own: "ada", folders: [{ path: join(root, "work"), repository: "ada/work-spex" }],
  });
  // The token under the origin, every other instance's kept, owner-only.
  const credentials = parseYaml(readFileSync(join(root, "local", "credentials.yaml"), "utf8")) as { format: number; hosts: Record<string, unknown> };
  assert.deepEqual(credentials, { format: 1, hosts: {
    "https://elsewhere.example": { access: "other", accessExpiresAt: 1, refresh: "other-refresh" },
    "https://spex.pub": { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" },
  } });
  assert.equal(statSync(join(root, "local", "credentials.yaml")).mode & 0o777, 0o600);
  assert.deepEqual(await fileCredentialStore(root, "https://spex.pub/").read(), { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" });
  // The receipt: every input's digest, the originals kept but the token's.
  const receiptDir = join(root, "local", "migrations", receipt.id);
  assert.deepEqual(JSON.parse(readFileSync(join(receiptDir, "receipt.json"), "utf8")), receipt);
  assert.equal(receipt.kind, "instances");
  assert.equal(receipt.complete, true);
  assert.deepEqual(receipt.deferred, []);
  assert.deepEqual(receipt.inputs.map((input) => [input.path, input.kept]), [["home.yaml", true], ["local/prefs.json", true], ["local/credentials.yaml", false]]);
  assert.deepEqual(readFileSync(join(receiptDir, "inputs", "0")), homeBefore);
  assert.equal(receipt.inputs[2].sha256, sha256(credentialsBefore));
  assert.equal(existsSync(join(receiptDir, "inputs", "2")), false, "the app token is never kept");
  assert.deepEqual(receipt.steps, [{
    step: "home", origin: "https://spex.pub", written: true,
    credentials: { from: sha256(credentialsBefore), to: sha256(readFileSync(join(root, "local", "credentials.yaml"))) },
  }]);

  // The store opens the migrated home signed in at its one instance.
  const store = await Store.open({ machineIdentity, dir: root });
  try {
    assert.equal(store.home.host.url, "https://spex.pub");
    assert.deepEqual(store.home.account(), ADA);
    assert.deepEqual(store.storageDiagnostics().filter((entry) => entry.blocking), []);
  } finally { store.close(); }
});

test("instances migration: Store.open migrates a home in format 1; one never signed in records its origin and no instance, one signed out its instance signed out", async () => {
  const fresh = formerHome({ url: "http://127.0.0.1:4100", account: false, token: false });
  const store = await Store.open({ machineIdentity, dir: fresh });
  try {
    assert.deepEqual(Home.load(fresh).file.instances, []);
    assert.equal(Home.load(fresh).origin, "http://127.0.0.1:4100");
    assert.equal(store.home.account(), null);
    assert.equal(existsSync(join(fresh, "local", "credentials.yaml")), false);
  } finally { store.close(); }

  const out = formerHome({ url: "https://spex.pub", signedOut: true, token: false });
  migrateInstances(out);
  assert.deepEqual(Home.load(out).instances(), [{ url: "https://spex.pub", clientId: "spex", account: ADA, signedOut: true }]);
  assert.equal(Home.load(out).account(), null);
});

test("instances migration: a restart finishes what remains, verifying its own writes, and a destination that diverged stops it unchanged", () => {
  const root = formerHome({ url: "https://Spex.pub" });
  const homeBefore = readFileSync(join(root, "home.yaml"));
  const receipt = migrateInstances(root);
  const receiptFile = join(root, "local", "migrations", receipt.id, "receipt.json");
  const homeAfter = readFileSync(join(root, "home.yaml"));
  const credentialsAfter = readFileSync(join(root, "local", "credentials.yaml"));

  // Interrupted once the token moved, before home.yaml was written.
  const interrupted = (): void => {
    writeFileSync(join(root, "home.yaml"), homeBefore);
    writeFileSync(receiptFile, JSON.stringify({ ...receipt, complete: false, steps: [{ ...receipt.steps[0], written: false }] }));
  };
  interrupted();
  assert.equal(needsInstancesMigration(root), true);
  const resumed = migrateInstances(root);
  assert.equal(resumed.id, receipt.id, "the interrupted receipt resumes");
  assert.equal(resumed.complete, true);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeAfter);
  assert.deepEqual(readFileSync(join(root, "local", "credentials.yaml")), credentialsAfter, "the token is not moved twice");

  // Another writer's credentials since the plan: stopped, nothing written.
  interrupted();
  const theirs = stringifyYaml({ format: 1, hosts: { "https://Spex.pub": { access: "theirs", accessExpiresAt: 3, refresh: "theirs" } } });
  writeFileSync(join(root, "local", "credentials.yaml"), theirs);
  assert.throws(() => migrateInstances(root), (error: unknown) => error instanceof StorageFormatError &&
    error.file === join(root, "local", "credentials.yaml") && error.reason === "migration destination diverged; preserved unchanged");
  assert.equal(readFileSync(join(root, "local", "credentials.yaml"), "utf8"), theirs);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeBefore);

  // An editor's home.yaml since the migration began: stopped likewise.
  writeFileSync(join(root, "local", "credentials.yaml"), credentialsAfter);
  const edited = homeBefore.toString("utf8").replace("own: ada", "own: ada\n# edited");
  writeFileSync(join(root, "home.yaml"), edited);
  assert.throws(() => migrateInstances(root), (error: unknown) => error instanceof StorageFormatError &&
    error.file === join(root, "home.yaml") && error.reason === "migration destination diverged; preserved unchanged");
  assert.equal(readFileSync(join(root, "home.yaml"), "utf8"), edited);
  assert.equal(needsInstancesMigration(root), true, "it runs again at the next start");
});

test("instances migration: a host URL the origin rule refuses stops it naming the URL, every file left as it stood", async () => {
  const root = formerHome({ url: "http://spex.example" });
  const homeBefore = readFileSync(join(root, "home.yaml"));
  const credentialsBefore = readFileSync(join(root, "local", "credentials.yaml"));
  await assert.rejects(Store.open({ machineIdentity, dir: root }), (error: unknown) => error instanceof StorageFormatError &&
    error.file === join(root, "home.yaml") && error.reason === "http://spex.example is not an instance's origin");
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeBefore);
  assert.deepEqual(readFileSync(join(root, "local", "credentials.yaml")), credentialsBefore);
  assert.equal(needsInstancesMigration(root), true);
});
