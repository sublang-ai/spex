// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clonePath, createSpaceHarness, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

const SSH = "git@github.com:acme/public.git";
const HTTPS = "https://github.com/acme/public.git";

test("storage-3, space-1, projects-44: canonical and legacy uppercase GitHub code addresses match the same personal project", async (t) => {
  const host = await startHost();
  host.script.addRepository({ group: "ada", name: "public-spex", project: { format: 1, name: "public", remote: "git@GITHUB.COM:ACME/PUBLIC.git" } });
  const listedKey = hostKey(host, "ada/public-spex");
  const home = await startHome("public-matching", { host, project: false, env: { GIT_SSH_COMMAND: "false" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const work = gitFolder("public");
  git(work, "remote", "add", "origin", SSH);
  const localKey = (await home.client.expectOk("project.register", { path: work })).id;
  assert.equal(JSON.parse(readFileSync(join(clonePath(home.dataDir, localKey), "project.json"), "utf8")).remote, HTTPS);

  const state = await home.client.expectOk("space.get", {});
  const listed = repositoryOf(state, listedKey);
  const local = repositoryOf(state, localKey);
  // The Sync destination picker compares code, codeKind and the project name with the
  // records suffix removed. The core supplies the same display value
  // for older SSH metadata and a new canonical registration.
  const matchingInputs = (repository: typeof listed) => [
    repository.code,
    repository.codeKind,
    repository.name.replace(/-spex$/i, "").toLowerCase(),
  ];
  assert.deepEqual(matchingInputs(listed), ["Code: github.com", "elsewhere", "public"]);
  assert.deepEqual(matchingInputs(local), matchingInputs(listed));
  assert.equal(git(work, "config", "--local", "--get", "remote.origin.url"), SSH);
});
