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

test("storage-58: real Windows storage creates owner-only, admits read grants however they came, and refuses a lease another principal may change", windowsOnly, async () => {
  const root = mkdtempSync(join(tmpdir(), "spex-windows-storage-"));
  try {
    // A folder granting Everyone read access shares nothing of it with
    // what the store creates inside it.
    const open = join(root, "open");
    mkdirSync(open);
    grant(open, "(OI)(CI)(R)");
    const home = join(open, "home");
    await prepareWindowsStorageDirectory(home);
    const file = join(home, "state.json");
    writeApplicationFile(file, { revision: 1 });
    writePrivateVersionedBytes(file, JSON.stringify({ revision: 2 }), fileVersion(file));
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { revision: 2 });
    const trusted = (path: string) => granted(path).every((sid) => sid !== EVERYONE);
    assert.ok(trusted(home), "[storage-57] a created folder holds a protected descriptor");
    assert.ok(trusted(file), "[storage-57] a created file holds a protected descriptor");
    assert.equal(hasPrivatePermissions(file, lstatSync(file)), true);
    const machineIdentity = `machine-id:v1:${randomUUID()}`;
    for (let n = 0; n < 2; n++) {
      const lease = acquireRootLease(home, { machineIdentity });
      lease.release();
      assert.equal(existsSync(join(home, ".lease")), false);
    }

    // A home granting Everyone read access before the start.
    const before = join(root, "before");
    makePrivateDirectory(before);
    grant(before, "(OI)(CI)(RX)");
    let core = await startCore(root, before, machineIdentity);
    assert.ok(existsSync(join(before, ".lease", "owner.json")), "[storage-57] a home granting a read starts and leases");
    await core.stop();
    core = await startCore(root, before, machineIdentity);
    await core.stop();

    // A home granted read access while the core runs, as the Codex
    // sandbox grants every entry of the user profile.
    const during = join(root, "during");
    core = await startCore(root, during, machineIdentity);
    const plain = join(during, "plain");
    mkdirSync(plain);
    grant(during, "(OI)(CI)(RX)");
    assert.ok(granted(during).includes(EVERYONE) && granted(plain).includes(EVERYONE), "the grant reached the home and a folder it inherits into");
    const written = join(plain, "probe.json");
    writeApplicationFile(written, { written: true });
    writePrivateVersionedBytes(written, JSON.stringify({ written: 2 }), fileVersion(written));
    assert.deepEqual(JSON.parse(readFileSync(written, "utf8")), { written: 2 }, "[storage-57] the core's writes stand after the grant");
    await core.stop();
    core = await startCore(root, during, machineIdentity);
    await core.stop();

    // A dead owner's record another principal may read is read and
    // retired; one another principal may change is malformed.
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
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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
    await assert.rejects(prepareWindowsStorageDirectory(junction), /unsafe destination parent|symlinked directory/);
    assert.equal(readFileSync(join(outside, "marker"), "utf8"), "preserve");
    assert.equal(existsSync(join(outside, ".lease")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
