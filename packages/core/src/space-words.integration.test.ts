// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core says each case in the person's words (core-service-145,
// DR-172): no message of its English catalog names a seat, a ticket, the
// home, a placement, an origin, a unit, a device or a spex repository,
// and a Space's address carrying more than the address is answered with
// one phrase, nothing written.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Home } from "./home.js";
import { createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { startHome } = fixture;
test.after(() => fixture.dispose());

/** The words no message of the core says (core-service-145). */
const NEVER_SAID = ["seat", "ticket", "home", "placement", "origin", "unit", "device", "spex repository"];

/** Every message id of a PO catalog, its continuation lines joined. */
function messageIds(catalog: string): string[] {
  const ids: string[] = [];
  for (const entry of catalog.split(/\n\s*\n/)) {
    const lines = entry.split("\n");
    const start = lines.findIndex((line) => line.startsWith("msgid "));
    if (start < 0) continue;
    let id = "";
    for (const line of lines.slice(start)) {
      if (line !== lines[start] && !line.startsWith("\"")) break;
      const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
      if (quoted) id += quoted[1].replace(/\\"/g, "\"").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
    }
    if (id.length > 0) ids.push(id);
  }
  return ids;
}

test("core-service-146: no message of the core's English catalog says seat, ticket, home, placement, origin, unit, device or spex repository as a word", () => {
  const catalog = readFileSync(new URL("../src/locales/en/messages.po", import.meta.url), "utf8");
  const ids = messageIds(catalog);
  assert.ok(ids.length > 100, `the catalog reads as messages: ${ids.length}`);
  // A placeholder's name is the translator's, never the reader's: what
  // stands in it is a value, not a word of the message.
  const said = ids.flatMap((id) => {
    const words = id.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, "");
    const found = NEVER_SAID.filter((word) => new RegExp(`\\b${word}s?\\b`, "i").test(words));
    return found.length > 0 ? [`${found.join(", ")}: ${id}`] : [];
  });
  assert.deepEqual(said, [], "every message names things as the surfaces do (core-service-145)");
});

test("core-service-146: space.signin.start naming https://spex.sublang.ai/path is refused with the one address phrase, writing nothing", async (t) => {
  const home = await startHome("address-only", { project: false });
  t.after(() => home.stop());
  const from = home.client.mark();
  const message = await home.client.expectError("space.signin.start", { url: "https://spex.sublang.ai/path" }, "invalid_request",
    /^Enter just the Space's address, like https:\/\/spex\.sublang\.ai$/);
  assert.ok(!message.includes("/path"), message);
  // Nothing ran and nothing was written: no sign-in, no instance listed,
  // no credential stored (core-service-145, git-host-2).
  const ran = home.client.messages.slice(from).filter((sent) => sent.type === "space.state" && sent.state.signIn.phase !== "idle");
  assert.deepEqual(ran, [], "no sign-in ran");
  assert.deepEqual((await home.client.expectOk("space.get", {})).signIn, { phase: "idle" });
  assert.deepEqual(Home.load(home.dataDir).instances(), [], "no instance is listed");
  assert.equal(existsSync(join(home.dataDir, "local", "credentials.yaml")), false, "no credential is stored");
});
