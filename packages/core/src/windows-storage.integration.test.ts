// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readOwnerAndDacl } from "@openclaw/fs-safe/permissions";
import { CoreService } from "./service.js";
import { hasPrivatePermissions, makePrivateDirectory, prepareWindowsStorageDirectory, writeApplicationFile, writePrivateVersionedBytes, fileVersion } from "@sublang/spex/files";
import { StateRootLeaseError, acquireRootLease } from "./root-lease.js";
import { Store } from "./store.js";

const windowsOnly = { skip: process.platform !== "win32" };
/** Everyone: the principal no private entry otherwise grants. */
const EVERYONE = "s-1-1-0";

/** Grant Everyone `rights` on `path`, inherited by what it holds. */
function grant(path: string, rights: string): void {
  execFileSync("icacls.exe", [path, "/grant", `*${EVERYONE.toUpperCase()}:${rights}`], { windowsHide: true });
}

/** The principals an entry's descriptor grants anything. */
function granted(path: string): string[] {
  const facts = readOwnerAndDacl(path);
  assert.equal(facts.status, "supported");
  if (facts.status !== "supported") return [];
  return facts.aces.filter((ace) => ace.aceType === "allow" && ace.mask !== 0).map((ace) => ace.sid.toLowerCase());
}

/** A real core on `dataDir`, touching nothing of the host's own. */
function startCore(root: string, dataDir: string, machineIdentity: string): Promise<CoreService> {
  return CoreService.start({
    dataDir,
    configPath: join(root, "config", "playbook.yaml"),
    machineIdentity,
    home: join(root, "user"),
    own: "tester",
    env: {},
    watchConfig: false,
    adapterRuntime: () => ({ usable: true }),
    agentSignIn: async () => ({ state: "signed-out" }),
  });
}

/** Whether no grant on `path` names Everyone. */
const trusted = (path: string): boolean => granted(path).every((sid) => sid !== EVERYONE);

/** A scratch root for one test, removed after it. */
async function inScratch(prefix: string, run: (root: string, machineIdentity: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try { await run(root, `machine-id:v1:${randomUUID()}`); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("storage-58: beneath a folder granting Everyone read access, what the store creates grants nothing to Everyone", windowsOnly, () => inScratch("spex-windows-create-", async (root, machineIdentity) => {
  const open = join(root, "open");
  mkdirSync(open);
  grant(open, "(OI)(CI)(R)");
  const home = join(open, "home");
  await prepareWindowsStorageDirectory(home);
  const file = join(home, "state.json");
  writeApplicationFile(file, { revision: 1 });
  writePrivateVersionedBytes(file, JSON.stringify({ revision: 2 }), fileVersion(file));
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { revision: 2 });
  assert.ok(trusted(home), "[storage-57] a created folder holds a protected descriptor");
  assert.ok(trusted(file), "[storage-57] a created file holds a protected descriptor");
  assert.equal(hasPrivatePermissions(file, lstatSync(file)), true);
  for (let n = 0; n < 2; n++) {
    acquireRootLease(home, { machineIdentity }).release();
    assert.equal(existsSync(join(home, ".lease")), false);
  }
  // A real core's home made there: its root and local/.
  const made = join(open, "made");
  await (await startCore(root, made, machineIdentity)).stop();
  assert.ok(trusted(made), "[storage-57] the root a real core creates holds a protected descriptor");
  assert.ok(trusted(join(made, "local")), "[storage-57] local/ is created owner-only");
}));

test("storage-58: in an existing home granting Everyone read access, local/ made first by a store or a migration grants nothing to Everyone", windowsOnly, () => inScratch("spex-windows-local-", async (root, machineIdentity) => {
  const widened = join(root, "widened");
  makePrivateDirectory(widened);
  grant(widened, "(OI)(CI)(RX)");
  new Store({ dir: widened, machineIdentity }).close();
  assert.ok(granted(widened).includes(EVERYONE), "the home stands widened");
  assert.ok(trusted(join(widened, "local")), "[storage-57] local/ made first by a store holds a protected descriptor");
  // A former format: the migrations make local/ before their receipts.
  const former = join(root, "former");
  makePrivateDirectory(former);
  writeFileSync(join(former, "home.yaml"), `format: 1\ndevice: ${randomUUID()}\nhost:\n  url: http://127.0.0.1:4100\n  clientId: spex\nown: ada\nfolders: []\n`);
  grant(former, "(OI)(CI)(RX)");
  (await Store.open({ dir: former, machineIdentity })).close();
  assert.ok(existsSync(join(former, "local", "migrations")), "the instances migration left its receipt");
  assert.ok(trusted(join(former, "local")), "[storage-57] local/ made first by a migration holds a protected descriptor");
}));

test("storage-58: a home granting Everyone read access before a real core starts admits the start and a restart", windowsOnly, () => inScratch("spex-windows-before-", async (root, machineIdentity) => {
  const home = join(root, "home");
  makePrivateDirectory(home);
  grant(home, "(OI)(CI)(RX)");
  const core = await startCore(root, home, machineIdentity);
  assert.ok(existsSync(join(home, ".lease", "owner.json")), "[storage-57] a home granting a read starts and leases");
  await core.stop();
  await (await startCore(root, home, machineIdentity)).stop();
}));

test("storage-58: a home granted Everyone read access while a real core runs admits its writes and a restart", windowsOnly, () => inScratch("spex-windows-during-", async (root, machineIdentity) => {
  // As the Codex sandbox grants every entry of the user profile.
  const home = join(root, "home");
  const core = await startCore(root, home, machineIdentity);
  const plain = join(home, "plain");
  mkdirSync(plain);
  grant(home, "(OI)(CI)(RX)");
  assert.ok(granted(home).includes(EVERYONE) && granted(plain).includes(EVERYONE), "the grant reached the home and a folder it inherits into");
  const written = join(plain, "probe.json");
  writeApplicationFile(written, { written: true });
  writePrivateVersionedBytes(written, JSON.stringify({ written: 2 }), fileVersion(written));
  assert.deepEqual(JSON.parse(readFileSync(written, "utf8")), { written: 2 }, "[storage-57] the core's writes stand after the grant");
  await core.stop();
  await (await startCore(root, home, machineIdentity)).stop();
}));

test("storage-58: a lease owner record another principal may read is read; one another principal may change refuses", windowsOnly, () => inScratch("spex-windows-lease-", async (root, machineIdentity) => {
  const dead = () => ({ state: "dead" as const, code: "ESRCH" });
  const owner = (dir: string): string => {
    makePrivateDirectory(join(dir, ".lease"));
    const record = join(dir, ".lease", "owner.json");
    writeFileSync(record, JSON.stringify({ pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID() }));
    return record;
  };
  const readable = join(root, "readable");
  makePrivateDirectory(readable);
  grant(owner(readable), "(R)");
  acquireRootLease(readable, { machineIdentity, probe: dead }).release();
  assert.equal(existsSync(join(readable, ".lease")), false, "[storage-26] a dead owner read with a read grant is retired");
  const changeable = join(root, "changeable");
  makePrivateDirectory(changeable);
  grant(owner(changeable), "(M)");
  assert.throws(() => acquireRootLease(changeable, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /the owner record is malformed/, "[storage-26] an owner record another principal may change refuses");
    return true;
  });
  assert.equal(existsSync(join(changeable, ".lease.retired")), false, "nothing was retired");
}));

test("core-service-90: a real Windows home granting every principal read access starts, creating config and leasing it", windowsOnly, async () => {
  const root = mkdtempSync(join(tmpdir(), "spex-windows-start-"));
  try {
    const home = join(root, "home");
    makePrivateDirectory(home);
    grant(home, "(OI)(CI)(R)");
    const machineIdentity = `machine-id:v1:${randomUUID()}`;
    const core = await startCore(root, home, machineIdentity);
    assert.ok(existsSync(join(root, "config", "playbook.yaml")), "[core-service-89] config created");
    assert.ok(existsSync(join(home, ".lease", "owner.json")), "[core-service-89] the home leased");
    await core.stop();

    // A linked root is still refused, its target untouched.
    const outside = join(root, "outside");
    makePrivateDirectory(outside);
    writeFileSync(join(outside, "marker"), "preserve");
    const junction = join(root, "junction");
    symlinkSync(outside, junction, "junction");
    await assert.rejects(prepareWindowsStorageDirectory(junction), /not a directory, or a link|symlinked directory/);
    assert.equal(readFileSync(join(outside, "marker"), "utf8"), "preserve");
    assert.equal(existsSync(join(outside, ".lease")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
