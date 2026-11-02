// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { readSignIn, runStatus } from "./local-credentials.js";

const exited = (code: number, stdout = "", stderr = "") => ({ ended: "exited" as const, code, stdout, stderr });

test("Claude's answer is the loggedIn its JSON states, anything else unconfirmed", () => {
  assert.deepEqual(readSignIn("claude", exited(0, '{"loggedIn": true, "authMethod": "oauth_token"}')), { state: "signed-in" });
  assert.deepEqual(readSignIn("claude", exited(1, '{"loggedIn": false, "authMethod": "none"}')), { state: "signed-out" });
  assert.equal(readSignIn("claude", exited(0, "Logged in")).state, "unconfirmed");
  assert.equal(readSignIn("claude", exited(1, "", "boom")).state, "unconfirmed");
  assert.equal(readSignIn("claude", exited(0, "null")).state, "unconfirmed");
});

test("Codex's answer is exit 0, or Not logged in on a failing exit; any other failure is unconfirmed", () => {
  assert.deepEqual(readSignIn("codex", exited(0, "Logged in using ChatGPT")), { state: "signed-in" });
  assert.deepEqual(readSignIn("codex", exited(1, "Not logged in")), { state: "signed-out" });
  assert.deepEqual(readSignIn("codex", exited(1, "", "Not logged in")), { state: "signed-out" });
  const keyring = readSignIn("codex", exited(1, "", "Error checking login status: failed to load CLI auth from keyring"));
  assert.equal(keyring.state, "unconfirmed");
  assert.ok(keyring.state === "unconfirmed" && !keyring.reason.includes("keyring"), "nothing the command said is reported");
  assert.equal(readSignIn("codex", exited(2)).state, "unconfirmed");
});

test("a command that cannot start or runs past its time is unconfirmed, never signed out", async () => {
  const unstarted = await runStatus("/nonexistent/spex-status", [], {});
  assert.deepEqual(unstarted, { ended: "unstarted" });
  assert.equal(readSignIn("claude", unstarted).state, "unconfirmed");
  if (process.platform === "win32") return;
  const slow = await runStatus("/bin/sh", ["-c", "sleep 5"], {}, 100);
  assert.deepEqual(slow, { ended: "timed-out" });
  assert.equal(readSignIn("codex", slow).state, "unconfirmed");
  // The command sees exactly the environment given, nothing of this process's.
  const seen = await runStatus("/bin/sh", ["-c", 'printf "%s|%s" "$HOME" "$SPEX_PROBE_LEAK"; exit 3'], { HOME: "/tmp/probe-home" });
  assert.deepEqual(seen, exited(3, "/tmp/probe-home|"));
});
