// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, startHome, startHost } = fixture;
test.after(() => fixture.dispose());

test("storage-55: registering real Git folders records portable GitHub identity and preserves their origin", async (t) => {
  const host = await startHost();
  const home = await startHome("portable-identities", { host, project: false });
  t.after(() => home.stop());
  const canonical = "https://github.com/owner/project.git";
  const cases: [string, string][] = [
    ["git@github.com:Owner/Project", canonical],
    ["git@GITHUB.COM:Owner/Project.git/", canonical],
    ["ssh://git@github.com/Owner/Project", canonical],
    ["ssh://git@github.com:22/Owner/Project.GIT/", canonical],
    ["https://GitHub.com/Owner/Project", canonical],
    ["https://github.com:443/Owner/Project.git/", canonical],
    ...[
      "git@github-company:Owner/Project.git",
      "git@example.test:Owner/Project.git",
      "ssh://git@github.com:2222/Owner/Project.git",
      "ssh://other@github.com/Owner/Project.git",
      "https://github.com:8443/Owner/Project.git",
      "http://github.com/Owner/Project.git",
      "https://github.com/Owner/Project.git?ref=main",
      "https://github.com/Owner/Project.git#main",
      "https://github.com/Owner/Project/tree/main",
    ].map((remote): [string, string] => [remote, remote]),
  ];
  for (const [index, [remote, expected]] of cases.entries()) {
    const folder = gitFolder(`identity-${index}`);
    git(folder, "remote", "add", "origin", remote);
    const { clone } = await addFolder(home, folder);
    assert.equal(JSON.parse(readFileSync(join(clone, "project.json"), "utf8")).remote, expected, remote);
    assert.equal(git(folder, "remote", "get-url", "origin"), remote, "registration leaves this folder's Git transport alone");
  }
  for (const [index, remote] of [
    "https://token@github.com/owner/project.git",
    "https://user:secret@github.com/owner/project.git",
    "ssh://git:secret@github.com/owner/project.git",
  ].entries()) {
    const folder = gitFolder(`credential-${index}`);
    git(folder, "remote", "add", "origin", remote);
    await home.client.expectError("project.register", { path: folder }, "invalid_request", /credential/i);
    assert.equal(git(folder, "remote", "get-url", "origin"), remote, "a refusal leaves the folder alone");
  }
});
