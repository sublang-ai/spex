// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalCodeRemote } from "./code-remote.js";

test("recognized GitHub transports share one portable code address", () => {
  for (const remote of [
    "git@github.com:Owner/Project",
    "git@GITHUB.COM:Owner/Project.git/",
    "ssh://git@github.com/Owner/Project",
    "ssh://git@GitHub.com:22/Owner/Project.GIT/",
    "https://github.com/Owner/Project",
    "HTTPS://GITHUB.COM:443/Owner/Project.git/",
    "https://github.com/owner/project.git",
  ]) {
    assert.equal(canonicalCodeRemote(remote), "https://github.com/owner/project.git", remote);
  }
  assert.equal(canonicalCodeRemote("git@github.com:owner/repo.name-with_underscores.git"), "https://github.com/owner/repo.name-with_underscores.git");
});

test("custom transports, credentials and ambiguous repository paths stay as given", () => {
  for (const remote of [
    "git@github-company:owner/project.git",
    "git@example.test:owner/project.git",
    "git@github.com.example.test:owner/project.git",
    "ssh://git@github.com:2222/owner/project.git",
    "ssh://other@github.com/owner/project.git",
    "ssh://GIT@github.com/owner/project.git",
    "https://github.com:8443/owner/project.git",
    "http://github.com/owner/project.git",
    "git://github.com/owner/project.git",
    "https://user:secret@github.com/owner/project.git",
    "https://token@github.com/owner/project.git",
    "https://@github.com/owner/project.git",
    "ssh://git:secret@github.com/owner/project.git",
    "https://github.com/owner/project.git?ref=main",
    "https://github.com/owner/project.git#main",
    "https://github.com/owner/project/tree/main",
    "https://github.com//project.git",
    "https://github.com/owner/.git",
    "https://github.com/owner/..",
    "https://github.com/./project.git",
    "https://github.com/owner/project//",
    "https://github.com/owner/%70roject.git",
    "git@github.com:owner/project.git\n",
    "/code/owner/project.git",
    "file:///code/owner/project.git",
  ]) assert.equal(canonicalCodeRemote(remote), remote, remote);
});
