// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoreService } from "./service.js";
import { hasPrivatePermissions, makePrivateDirectory, prepareWindowsStorageDirectory, writeApplicationFile, writeVersionedBytes, fileVersion } from "@sublang/spex/files";
import { acquireRootLease } from "./root-lease.js";

test("core-service-90: real Windows private writes, repeated leases and unsafe-root refusal", { skip: process.platform !== "win32" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "spex-windows-storage-"));
  try {
    const home = join(root, "home");
    await prepareWindowsStorageDirectory(home);
    const file = join(home, "state.json");
    writeApplicationFile(file, { revision: 1 });
    writeVersionedBytes(file, JSON.stringify({ revision: 2 }), fileVersion(file));
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { revision: 2 });
    assert.equal(hasPrivatePermissions(file, lstatSync(file)), true);
    const machineIdentity = `machine-id:v1:${randomUUID()}`;
    for (let n = 0; n < 2; n++) {
      const lease = acquireRootLease(home, { machineIdentity });
      lease.release();
      assert.equal(existsSync(join(home, ".lease")), false);
    }
    const overbroad = join(root, "overbroad");
    makePrivateDirectory(overbroad);
    execFileSync("icacls.exe", [overbroad, "/grant", "*S-1-1-0:(OI)(CI)(R)"], { windowsHide: true });
    const configPath = join(root, "absent-config", "playbook.yaml");
    await assert.rejects(CoreService.start({ dataDir: overbroad, configPath, machineIdentity }), /private storage permissions cannot be verified/);
    assert.equal(existsSync(configPath), false);
    assert.equal(existsSync(join(overbroad, ".lease")), false);
    const outside = join(root, "outside");
    makePrivateDirectory(outside);
    writeFileSync(join(outside, "marker"), "preserve");
    const junction = join(root, "junction");
    symlinkSync(outside, junction, "junction");
    await assert.rejects(prepareWindowsStorageDirectory(junction), /private storage permissions cannot be verified|symlinked directory/);
    assert.equal(readFileSync(join(outside, "marker"), "utf8"), "preserve");
    assert.equal(existsSync(join(outside, ".lease")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
