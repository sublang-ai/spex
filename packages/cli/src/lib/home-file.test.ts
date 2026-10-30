// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home file's instances changed in one step: a home made where none
// stands, an entry added, signed out, renamed and forgotten, and a write
// refused where another writer changed the file meanwhile.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

import { StorageFormatError, VersionConflictError } from "./files.js";
import {
  accountAt, defaultInstanceOf, homeFilePath, InstanceRefused, readHomeFile, updateHomeFile,
  withDisplayName, withoutInstance, withSignIn, withSignOut,
} from "./home-file.js";

const ada = { id: "1", login: "ada", displayName: "Ada" };
const env = { SPEX_HOST_URL: "https://spex.pub" } as NodeJS.ProcessEnv;

test("home file: a home is made where none stands, and each instance change is one versioned write", () => {
  const root = join(mkdtempSync(join(tmpdir(), "spex-home-file-")), "home");
  assert.equal(readHomeFile(root), null);
  const file = homeFilePath(root);
  const first = updateHomeFile(root, (home) => withSignIn(home, "HTTPS://Spex.Pub/", ada, file), { env });
  assert.equal(first.origin, "https://spex.pub");
  assert.deepEqual(first.instances, [{ origin: "https://spex.pub", clientId: "spex", account: ada }]);
  assert.deepEqual(parse(readFileSync(file, "utf8")), first);
  assert.deepEqual(accountAt(first), ada);

  const named = updateHomeFile(root, (home) => withDisplayName(home, "https://spex.pub", "Spex Space"));
  assert.equal(defaultInstanceOf(named).displayName, "Spex Space");
  const out = updateHomeFile(root, (home) => withSignOut(home));
  assert.equal(accountAt(out), null);
  assert.equal(readHomeFile(root)?.instances[0]?.signedOut, true);
  const again = updateHomeFile(root, (home) => withSignIn(home, "https://spex.pub", ada, file));
  assert.equal(again.instances[0]?.displayName, "Spex Space", "a sign-in keeps the display name as last read");
  assert.throws(() => updateHomeFile(root, (home) => withSignIn(home, "https://spex.pub", { ...ada, id: "2" }, file)),
    (error: unknown) => error instanceof InstanceRefused && error.reason === "another-account");
  assert.throws(() => updateHomeFile(root, (home) => withoutInstance(home, "https://spex.pub")),
    (error: unknown) => error instanceof InstanceRefused && error.reason === "signed-in");
  updateHomeFile(root, (home) => withSignOut(home, "https://spex.pub"));
  const forgotten = updateHomeFile(root, (home) => withoutInstance(home, "https://spex.pub"));
  assert.deepEqual(forgotten.instances, []);
  const before = readFileSync(file, "utf8");
  assert.deepEqual(updateHomeFile(root, (home) => withoutInstance(home, "https://spex.pub")), forgotten, "forgetting an instance not listed changes nothing");
  assert.equal(readFileSync(file, "utf8"), before);
});

test("home file: a change overtaken by another writer is refused and leaves that writer's file", () => {
  const root = mkdtempSync(join(tmpdir(), "spex-home-file-"));
  const file = homeFilePath(root);
  updateHomeFile(root, (home) => home, { env });
  assert.throws(() => updateHomeFile(root, (home) => {
    writeFileSync(file, `${readFileSync(file, "utf8")}# another writer\n`);
    return withSignIn(home, "https://spex.pub", ada, file);
  }), VersionConflictError);
  assert.match(readFileSync(file, "utf8"), /# another writer/);
  assert.deepEqual(readHomeFile(root)?.instances, []);
});

test("home file: a file another format or a URL that is no origin is refused, never guessed", () => {
  const root = mkdtempSync(join(tmpdir(), "spex-home-file-"));
  writeFileSync(homeFilePath(root), "format: 1\n");
  assert.throws(() => readHomeFile(root), (error: unknown) => error instanceof StorageFormatError && /instances migration has not run/.test(error.reason));
  assert.throws(() => updateHomeFile(mkdtempSync(join(tmpdir(), "spex-home-file-")), (home) => home, { env: { SPEX_HOST_URL: "ftp://spex.pub" } }),
    (error: unknown) => error instanceof StorageFormatError && error.reason === "ftp://spex.pub is not an instance's origin");
});
