// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-12, guards-28), DR-252: the copy a run
 * checks, made outside the project and removed without touching it.
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { makeCopy, removeCopies, removeCopy } from "./copy.js";

const made: string[] = [];

/** A project folder holding `files`. */
function projectOf(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spex-copy-test-")));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

const FILES = {
  "pkg/src/a.mjs": "export const a = 1;\n",
  "pkg/src/deep/b.mjs": "export const b = 2;\n",
  "pkg/src/node_modules/inner/index.js": "inner\n",
  "pkg/src/.git/config": "git\n",
  "pkg/package.json": "{}\n",
  "pkg/node_modules/near/index.js": "near\n",
  "node_modules/dep/index.js": "dep\n",
  "guards/bindings/x/binding.mjs": "export {};\n",
  "other/skipped.txt": "not copied\n",
};

after(() => {
  removeCopies();
  for (const root of made) rmSync(root, { recursive: true, force: true });
});

describe("guards-12: copy: the files a run copies", () => {
  it("copies each path to the place it has in the project, under the OS temp folder", () => {
    const root = projectOf(FILES);
    const copy = makeCopy(root, ["pkg/src", "pkg/package.json", "guards/bindings/x"]);
    assert.ok(copy.folder.startsWith(realpathSync(tmpdir())), "[guards-12] the copy is under the OS temp folder");
    assert.ok(!copy.folder.startsWith(root), "[guards-12] and outside the project");
    assert.equal(readFileSync(join(copy.folder, "pkg", "src", "a.mjs"), "utf8"), FILES["pkg/src/a.mjs"]);
    assert.equal(readFileSync(join(copy.folder, "pkg", "src", "deep", "b.mjs"), "utf8"), FILES["pkg/src/deep/b.mjs"]);
    assert.equal(readFileSync(join(copy.folder, "pkg", "package.json"), "utf8"), "{}\n");
    assert.ok(existsSync(join(copy.folder, "guards", "bindings", "x", "binding.mjs")), "[guards-12] the binding's folder is copied");
    assert.equal(existsSync(join(copy.folder, "other")), false, "[guards-12] nothing else is");
    assert.deepEqual(readdirSync(copy.scratch), [], "the copy's own temp folder starts empty");
    removeCopy(copy);
  });

  it("leaves out every node_modules and .git folder, and links the project's node_modules instead", () => {
    const root = projectOf(FILES);
    const copy = makeCopy(root, ["pkg/src"]);
    assert.equal(existsSync(join(copy.folder, "pkg", "src", ".git")), false, "[guards-12] no .git folder is copied");
    for (const [folder, name] of [["", "dep"], ["pkg", "near"], ["pkg/src", "inner"]]) {
      const linked = join(copy.folder, ...folder.split("/").filter((part) => part !== ""), "node_modules");
      assert.ok(lstatSync(linked).isSymbolicLink(), `[guards-12] ${folder || "the root"}'s node_modules is a link`);
      assert.equal(realpathSync(linked), join(root, ...folder.split("/").filter((part) => part !== ""), "node_modules"), "[guards-12] to the project's own");
      assert.ok(existsSync(join(linked, name, "index.js")), "[guards-12] so the copy uses the installed dependencies");
    }
    removeCopy(copy);
  });

  it("follows a link to a file and to a folder", { skip: process.platform === "win32" }, () => {
    const root = projectOf(FILES);
    symlinkSync(join(root, "other", "skipped.txt"), join(root, "pkg", "src", "linked.txt"));
    symlinkSync(join(root, "other"), join(root, "pkg", "src", "linked"));
    const copy = makeCopy(root, ["pkg/src"]);
    assert.ok(lstatSync(join(copy.folder, "pkg", "src", "linked.txt")).isFile(), "[guards-12] a linked file is copied as a file");
    assert.equal(readFileSync(join(copy.folder, "pkg", "src", "linked", "skipped.txt"), "utf8"), "not copied\n", "[guards-12] a linked folder is copied whole");
    removeCopy(copy);
  });

  it("refuses a link back to a folder that holds it, leaving no folder behind", { skip: process.platform === "win32" }, () => {
    const root = projectOf(FILES);
    symlinkSync(join(root, "pkg"), join(root, "pkg", "src", "loop"));
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("spex-guard-"));
    assert.throws(() => makeCopy(root, ["pkg/src"]), /pkg\/src\/loop\/src links back to a folder that holds it/);
    assert.deepEqual(readdirSync(tmpdir()).filter((name) => name.startsWith("spex-guard-")), before, "[guards-28] a copy that fails is removed");
  });

  it("takes one digest over the sorted paths and the bytes of everything copied", () => {
    const first = makeCopy(projectOf(FILES), ["pkg/src", "pkg/package.json"]);
    const again = makeCopy(projectOf(FILES), ["pkg/package.json", "pkg/src"]);
    assert.match(first.digest, /^[0-9a-f]{64}$/);
    assert.equal(again.digest, first.digest, "[guards-12] the same files give the same digest, whatever the order they are named in");
    const edited = makeCopy(projectOf({ ...FILES, "pkg/src/a.mjs": "export const a = 2;\n" }), ["pkg/src", "pkg/package.json"]);
    assert.notEqual(edited.digest, first.digest, "[guards-12] a changed byte changes it");
    const { "pkg/src/a.mjs": moved, ...rest } = FILES;
    const renamed = makeCopy(projectOf({ ...rest, "pkg/src/c.mjs": moved }), ["pkg/src", "pkg/package.json"]);
    assert.notEqual(renamed.digest, first.digest, "[guards-12] a changed path changes it");
    const dependency = makeCopy(projectOf({ ...FILES, "node_modules/dep/index.js": "other\n" }), ["pkg/src", "pkg/package.json"]);
    assert.equal(dependency.digest, first.digest, "[guards-12] what is linked, not copied, is no part of it");
    for (const copy of [first, again, edited, renamed, dependency]) removeCopy(copy);
  });
});

describe("guards-28: copy: removing a copy", () => {
  it("removes the copy and leaves the project, its node_modules included, as it was", () => {
    const root = projectOf(FILES);
    const copy = makeCopy(root, ["pkg/src"]);
    writeFileSync(join(copy.scratch, "left-behind.txt"), "x");
    writeFileSync(join(copy.folder, "pkg", "src", "a.mjs"), "changed in the copy\n");
    removeCopy(copy);
    assert.equal(existsSync(copy.home), false, "[guards-12] the folder is removed");
    for (const [path, text] of Object.entries(FILES)) {
      assert.equal(readFileSync(join(root, ...path.split("/")), "utf8"), text, `[guards-28] ${path} is as it was`);
    }
  });

  it("removes every copy still standing at once", () => {
    const root = projectOf(FILES);
    const copies = [makeCopy(root, ["pkg/src"]), makeCopy(root, ["pkg/package.json"])];
    removeCopies();
    for (const copy of copies) assert.equal(existsSync(copy.home), false, "[guards-28] no copy outlives its run");
    assert.ok(existsSync(join(root, "node_modules", "dep", "index.js")), "[guards-28] the project's dependencies stay");
  });
});
