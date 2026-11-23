// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startGitHttpHost } from "./testing/git-http-host.js";
import { clonePath, createSpaceHarness, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, startHome, startHost, signIn } = fixture;
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

test("projects-44, projects-45: opening personal project records clones public GitHub code over HTTPS and preserves an existing checkout", async (t) => {
  const root = mkdtempSync(join(scratch, "public-clone-"));
  const existing = gitFolder("public");
  writeFileSync(join(existing, "README.md"), "Public project\n");
  git(existing, "add", "README.md");
  git(existing, "commit", "-qm", "Public project");
  git(existing, "remote", "add", "origin", SSH);
  git(root, "clone", "-q", "--bare", existing, "public.git");
  const head = git(existing, "rev-parse", "HEAD");
  const transport = await startGitHttpHost({ root, username: "", password: "", anonymous: true });
  t.after(() => transport.close());

  const host = await startHost();
  const cases = [
    { name: "legacy", remote: SSH, folder: join(root, "from-ssh") },
    { name: "canonical", remote: HTTPS, folder: join(root, "from-https") },
    { name: "existing", remote: HTTPS, folder: existing },
  ].map((entry) => ({
    ...entry,
    records: host.script.addRepository({
      group: host.script.person.login, name: `${entry.name}-spex`,
      project: { format: 1, name: entry.name, remote: entry.remote },
    }),
  }));
  // Only the canonical HTTPS address reaches the local Git HTTP backend.
  // An SSH clone or an attempt to contact GitHub directly fails offline.
  const home = await startHome("public-clone", {
    host, project: false,
    env: {
      GIT_ALLOW_PROTOCOL: "http:file",
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_1: `url.${transport.url}/.insteadOf`,
      GIT_CONFIG_VALUE_1: "https://github.com/acme/",
    },
  });
  t.after(() => home.stop());
  await signIn(home, host);

  for (const { name, folder, records } of cases) {
    const key = hostKey(host, `${host.script.person.login}/${name}-spex`);
    const from = home.client.mark();
    await home.client.expectOk("space.join", { instance: host.url, hostId: records.id, folder });
    const joined = await home.client.waitRepository(from, key, (row) => row.folder !== null || row.sync.phase === "stopped");
    assert.equal(joined.folder, folder, JSON.stringify(joined.sync));
    assert.equal(git(folder, "rev-parse", "HEAD"), head);
    assert.equal(git(folder, "config", "--local", "--get", "remote.origin.url"), folder === existing ? SSH : HTTPS);
  }
  assert.equal(transport.credentialed, 0);
});
