// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: reading a kept fault's patch and applying
 * it without git — at the stated line, at the nearest matching place,
 * to files with CRLF endings, and the two ways a patch fails to
 * count: it does not apply, or it changes nothing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { applyPatch, applyToText, parsePatch } from "./patch.js";
import { GuardError } from "./types.js";

const numbered = (count: number, from = 1): string =>
  Array.from({ length: count }, (_, index) => `line${index + from}\n`).join("");

const TEN = numbered(10);

const TWO_HUNKS = `Restore the old order.

It went to the first by name.
diff --git a/src/a.txt b/src/a.txt
index 95b4caf7..89ba6bbc 100644
--- a/src/a.txt
+++ b/src/a.txt
@@ -2,3 +2,3 @@ function x() {
 line2
-line3
+LINE3
 line4
@@ -8,3 +8,4 @@
 line8
 line9
+extra
 line10
`;

const TEN_PATCHED = TEN.replace("line3\n", "LINE3\n").replace("line10\n", "extra\nline10\n");

function message(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

function applied(text: string, patch: string): string {
  const parsed = parsePatch(patch);
  assert.equal(parsed.files.length, 1);
  const result = applyToText(text, parsed.files[0]);
  assert.ok("text" in result, `the patch did not apply: ${JSON.stringify(result)}`);
  return result.text;
}

function failedAt(text: string, patch: string): number {
  const result = applyToText(text, parsePatch(patch).files[0]);
  assert.ok("failedAt" in result, "the patch applied");
  return result.failedAt;
}

describe("guards-11: patch: reading a patch", () => {
  it("reads the description, the files and their changes", () => {
    const patch = parsePatch(TWO_HUNKS);
    assert.equal(patch.title, "Restore the old order.");
    assert.equal(patch.description, "Restore the old order.\n\nIt went to the first by name.");
    assert.deepEqual(patch.files.map((file) => file.path), ["src/a.txt"]);
    assert.deepEqual(patch.files[0].hunks.map((hunk) => hunk.line), [2, 8]);
    assert.deepEqual(patch.files[0].hunks[0].lines, [
      { kind: " ", text: "line2", noNewline: false },
      { kind: "-", text: "line3", noNewline: false },
      { kind: "+", text: "LINE3", noNewline: false },
      { kind: " ", text: "line4", noNewline: false },
    ]);
  });

  it("reads a patch with no description, several files, and no git header", () => {
    const patch = parsePatch(
      "--- a/one.txt\n+++ b/one.txt\n@@ -1 +1 @@\n-a\n+b\n--- two.txt\t2026-11-01 10:00:00\n+++ two.txt\t2026-11-01 10:00:01\n@@ -1,0 +2 @@\n+c\n",
    );
    assert.equal(patch.title, "");
    assert.deepEqual(patch.files.map((file) => file.path), ["one.txt", "two.txt"]);
    assert.deepEqual(patch.files[1].hunks[0], { line: 1, lines: [{ kind: "+", text: "c", noNewline: false }] });
  });

  it("reads the names under any one-character prefix folder git diff writes", () => {
    const body = "@@ -1 +1 @@\n-a\n+b\n";
    // a/ b/ by default; i/ w/, c/ w/, c/ i/ and o/ w/ with
    // diff.mnemonicPrefix; 1/ 2/ outside a repository.
    for (const [before, after] of [["a", "b"], ["i", "w"], ["c", "w"], ["c", "i"], ["o", "w"], ["c", "o"], ["1", "2"]]) {
      const patch = parsePatch(`diff --git ${before}/src/x.mjs ${after}/src/x.mjs\n--- ${before}/src/x.mjs\n+++ ${after}/src/x.mjs\n${body}`);
      assert.deepEqual(patch.files.map((file) => file.path), ["src/x.mjs"], `${before}/ and ${after}/`);
    }
    // Only the first folder goes, and only when it is one character long.
    assert.deepEqual(parsePatch(`--- src/x.mjs\n+++ src/x.mjs\n${body}`).files.map((file) => file.path), ["src/x.mjs"]);
    assert.deepEqual(parsePatch(`--- i/a/x.mjs\n+++ w/a/x.mjs\n${body}`).files.map((file) => file.path), ["a/x.mjs"]);
    assert.deepEqual(parsePatch(`--- ab/x.mjs\n+++ ab/x.mjs\n${body}`).files.map((file) => file.path), ["ab/x.mjs"]);
  });

  it("reads a patch saved with CRLF endings as the same patch", () => {
    assert.deepEqual(parsePatch(TWO_HUNKS.replace(/\n/g, "\r\n")), parsePatch(TWO_HUNKS));
  });

  it("keeps a removed line that looks like a file header inside its change", () => {
    const patch = parsePatch("--- a/x.md\n+++ b/x.md\n@@ -1,2 +1,2 @@\n--- old rule\n+++ new rule\n keep\n");
    assert.deepEqual(patch.files[0].hunks[0].lines.map((line) => `${line.kind}${line.text}`), [
      "--- old rule",
      "+++ new rule",
      " keep",
    ]);
  });

  it("marks a line with no newline at the end of the file", () => {
    const patch = parsePatch("--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n");
    assert.deepEqual(patch.files[0].hunks[0].lines.map((line) => line.noNewline), [false, true, true]);
  });

  const cases: [string, string, string][] = [
    ["text with no change", "Just words.\n", "no change found; a kept fault is a unified diff, as git diff writes it"],
    [
      "a new file",
      "diff --git a/n.txt b/n.txt\nnew file mode 100644\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1 @@\n+a\n",
      "line 2: it adds or removes a file; a kept fault changes existing files",
    ],
    [
      "a removed file",
      "--- a/n.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-a\n",
      "line 1: it adds or removes a file; a kept fault changes existing files",
    ],
    [
      "a rename",
      "diff --git a/a.txt b/b.txt\nsimilarity index 90%\nrename from a.txt\nrename to b.txt\n",
      "line 3: it renames or copies a file; a kept fault changes existing files",
    ],
    [
      "two names for one file",
      "--- a/a.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-a\n+b\n",
      "line 1: it renames a/a.txt to b/b.txt; a kept fault changes existing files",
    ],
    [
      "two names that differ after their prefix folders are dropped",
      "--- i/src/a.mjs\n+++ w/src/b.mjs\n@@ -1 +1 @@\n-a\n+b\n",
      "line 1: it renames i/src/a.mjs to w/src/b.mjs; a kept fault changes existing files",
    ],
    [
      "two names that differ in a folder longer than one character",
      "--- old/src/a.mjs\n+++ new/src/a.mjs\n@@ -1 +1 @@\n-a\n+b\n",
      "line 1: it renames old/src/a.mjs to new/src/a.mjs; a kept fault changes existing files",
    ],
    [
      "a binary file",
      "diff --git a/i.png b/i.png\nindex 1..2 100644\nBinary files a/i.png and b/i.png differ\n",
      "line 3: it changes a binary file; a kept fault changes text",
    ],
    [
      "a file named twice",
      "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n--- a/a.txt\n+++ b/a.txt\n@@ -3 +3 @@\n-c\n+d\n",
      "line 6: a.txt is named twice",
    ],
    [
      "a path that leaves the project",
      "--- a/../out.txt\n+++ b/../out.txt\n@@ -1 +1 @@\n-a\n+b\n",
      "line 1: the path ../out.txt does not stay inside the project",
    ],
    [
      "a path from the top of the disk",
      "--- /etc/hosts\n+++ /etc/hosts\n@@ -1 +1 @@\n-a\n+b\n",
      "line 1: the path /etc/hosts does not stay inside the project",
    ],
    [
      "a quoted path",
      '--- "a/caf\\303\\251.txt"\n+++ "b/caf\\303\\251.txt"\n@@ -1 +1 @@\n-a\n+b\n',
      'line 1: the path "a/caf\\303\\251.txt" has characters a kept fault\'s patch cannot name',
    ],
    ["a file with no change", "--- a/a.txt\n+++ b/a.txt\n", "line 1: no change follows the name of a.txt"],
    ["a '---' line with no '+++' line", "--- a/a.txt\n@@ -1 +1 @@\n-a\n+b\n", "line 2: expected a '+++ ' line after '--- '"],
    ["a change before any file", "diff --git a/a b/a\n@@ -1 +1 @@\n-a\n+b\n", "line 2: a change comes before its file is named"],
    ["a header that is none", "--- a/a.txt\n+++ b/a.txt\n@@ nonsense @@\n", "line 3: not a change header: @@ nonsense @@"],
    ["a change that ends early", "--- a/a.txt\n+++ b/a.txt\n@@ -1,3 +1,3 @@\n a\n-b\n", "line 6: the change ends early"],
    [
      "a change with a line that is none of its kinds",
      "--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n a\n*b\n",
      "line 5: expected a line starting with ' ', '-' or '+'",
    ],
    [
      "a change longer than its header says",
      "--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,2 @@\n-a\n-b\n+c\n+d\n",
      "line 5: the change has more lines than its header says",
    ],
    [
      "lines of a change after its header's counts ran out",
      "--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,1 @@\n-a\n+A\n-b\n+B\n",
      "line 6: the change has more lines than its header says",
    ],
    [
      "a kept line after its header's counts ran out",
      "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+A\n b\ndiff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-a\n+b\n",
      "line 6: the change has more lines than its header says",
    ],
    ["a line of a change before any file", "diff --git a/a b/a\n+a\n", "line 2: a change comes before its file is named"],
  ];
  for (const [name, text, expected] of cases) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => parsePatch(text)), expected);
    });
  }
});

describe("guards-11: patch: applying to text", () => {
  it("applies every change at its stated line", () => {
    assert.equal(applied(TEN, TWO_HUNKS), TEN_PATCHED);
  });

  it("finds a change that moved down, and the next one after it", () => {
    const moved = numbered(23, 100) + TEN;
    assert.equal(applied(moved, TWO_HUNKS), numbered(23, 100) + TEN_PATCHED);
  });

  it("finds a change that moved up", () => {
    const patch = "--- a/x\n+++ b/x\n@@ -40,3 +40,3 @@\n line2\n-line3\n+LINE3\n line4\n";
    assert.equal(applied(TEN, patch), TEN.replace("line3\n", "LINE3\n"));
  });

  it("finds changes that moved by different amounts", () => {
    const text = numbered(5) + "new\nnew\n" + numbered(5, 6);
    assert.equal(
      applied(text, TWO_HUNKS),
      text.replace("line3\n", "LINE3\n").replace("line10\n", "extra\nline10\n"),
    );
  });

  it("takes the nearest matching place, the earlier of two equally near", () => {
    const text = "a\nb\nc\nx\na\nb\nc\n";
    const at = (line: number): string => `--- a/x\n+++ b/x\n@@ -${line},3 +${line},3 @@\n a\n-b\n+B\n c\n`;
    assert.equal(applied(text, at(1)), "a\nB\nc\nx\na\nb\nc\n");
    assert.equal(applied(text, at(5)), "a\nb\nc\nx\na\nB\nc\n");
    assert.equal(applied(text, at(4)), "a\nb\nc\nx\na\nB\nc\n");
    assert.equal(applied(text, at(3)), "a\nB\nc\nx\na\nb\nc\n");
    assert.equal(applied(text, at(90)), "a\nb\nc\nx\na\nB\nc\n");
  });

  it("never places a later change before an earlier one", () => {
    const text = "a\nb\na\nb\n";
    const patch = "--- a/x\n+++ b/x\n@@ -3,2 +3,2 @@\n a\n-b\n+B\n@@ -4,2 +4,2 @@\n a\n-b\n+C\n";
    assert.equal(failedAt(text, patch), 4);
    const ordered = "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -1,2 +1,2 @@\n a\n-b\n+C\n";
    assert.equal(applied(text, ordered), "a\nB\na\nC\n");
  });

  it("keeps a CRLF file's own line endings, also on the lines it adds", () => {
    const crlf = TEN.replace(/\n/g, "\r\n");
    const result = applied(crlf, TWO_HUNKS);
    assert.equal(result, TEN_PATCHED.replace(/\n/g, "\r\n"));
    assert.ok(!/[^\r]\n/.test(result), "every line ends with CRLF");
  });

  it("applies a patch written with CRLF endings to a file with LF endings", () => {
    assert.equal(applied(TEN, TWO_HUNKS.replace(/\n/g, "\r\n")), TEN_PATCHED);
  });

  it("leaves untouched lines of a file with mixed endings as they were", () => {
    const mixed = "line1\nline2\r\nline3\nline4\r\nline5\n";
    const patch = "--- a/x\n+++ b/x\n@@ -2,3 +2,3 @@\n line2\n-line3\n+LINE3\n line4\n";
    assert.equal(applied(mixed, patch), "line1\nline2\r\nLINE3\nline4\r\nline5\n");
  });

  it("says which change matches nowhere", () => {
    assert.equal(failedAt(TEN.replace("line9", "line nine"), TWO_HUNKS), 8);
    assert.equal(failedAt(TEN.replace("line3", "line three"), TWO_HUNKS), 2);
    assert.equal(failedAt("", TWO_HUNKS), 2);
  });

  it("applies a change that changes nothing and gives back the same text", () => {
    const same = "--- a/x\n+++ b/x\n@@ -2,3 +2,3 @@\n line2\n-line3\n+line3\n line4\n";
    assert.equal(applied(TEN, same), TEN);
  });

  it("puts in lines where a change has no old lines", () => {
    const patch = "--- a/x\n+++ b/x\n@@ -2,0 +3,2 @@\n+new1\n+new2\n";
    assert.equal(applied("a\nb\nc\n", patch), "a\nb\nnew1\nnew2\nc\n");
    assert.equal(applied("", "--- a/x\n+++ b/x\n@@ -0,0 +1 @@\n+first\n"), "first\n");
  });

  it("takes out lines", () => {
    const patch = "--- a/x\n+++ b/x\n@@ -1,3 +1 @@\n-a\n-b\n c\n";
    assert.equal(applied("a\nb\nc\nd\n", patch), "c\nd\n");
  });

  it("reads an empty line inside a change as an empty kept line", () => {
    const patch = "--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n\n-c\n+C\n";
    assert.equal(applied("a\n\nc\n", patch), "a\n\nC\n");
  });

  it("handles a file whose last line has no newline", () => {
    const keep = "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n+A\n b\n\\ No newline at end of file\n";
    assert.equal(applied("a\nb", keep), "A\nb");
    const add = "--- a/x\n+++ b/x\n@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n";
    assert.equal(applied("a\nb", add), "a\nb\nc\n");
    const drop = "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+B\n\\ No newline at end of file\n";
    assert.equal(applied("a\nb\n", drop), "a\nB");
    const after = "--- a/x\n+++ b/x\n@@ -1,2 +1,3 @@\n a\n b\n+c\n";
    assert.equal(applied("a\nb", after), "a\nb\nc\n");
  });
});

describe("guards-11: patch: applying to a folder", () => {
  function folder(files: Record<string, string | Buffer>): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-patch-")));
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    return dir;
  }
  const TWO_FILES = `${TWO_HUNKS}diff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-old\n+new\n`;

  it("changes every file the patch names", () => {
    const dir = folder({ "src/a.txt": TEN, "b.txt": "old\n", "c.txt": "kept\n" });
    try {
      assert.deepEqual(applyPatch(dir, parsePatch(TWO_FILES)), { applies: true, changed: true });
      assert.equal(readFileSync(join(dir, "src/a.txt"), "utf8"), TEN_PATCHED);
      assert.equal(readFileSync(join(dir, "b.txt"), "utf8"), "new\n");
      assert.equal(readFileSync(join(dir, "c.txt"), "utf8"), "kept\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not apply, and writes nothing, when a file is not there", () => {
    const dir = folder({ "src/a.txt": TEN });
    try {
      assert.deepEqual(applyPatch(dir, parsePatch(TWO_FILES)), {
        applies: false,
        cause: "b.txt is not among the copied files",
      });
      assert.equal(readFileSync(join(dir, "src/a.txt"), "utf8"), TEN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not apply, and writes nothing, when a change matches nowhere", () => {
    const dir = folder({ "src/a.txt": TEN, "b.txt": "other\n" });
    try {
      assert.deepEqual(applyPatch(dir, parsePatch(TWO_FILES)), {
        applies: false,
        cause: "the change at line 1 of b.txt matches nowhere in the file",
      });
      assert.equal(readFileSync(join(dir, "src/a.txt"), "utf8"), TEN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not apply to a folder or to a file that is not text", () => {
    const dir = folder({ "src/a.txt/inner": "x", "b.txt": Buffer.from([0x6f, 0x6c, 0x64, 0xff, 0x0a]) });
    try {
      assert.deepEqual(applyPatch(dir, parsePatch(TWO_HUNKS)), {
        applies: false,
        cause: "src/a.txt is not among the copied files",
      });
      assert.deepEqual(applyPatch(dir, parsePatch("--- a/b.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-old\n+new\n")), {
        applies: false,
        cause: "b.txt is not text",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not apply, and writes nothing, to a file a link leads to outside the folder", () => {
    const dir = folder({ "copy/src/a.txt": TEN, "real/modules/b.txt": "old\n" });
    try {
      // As in a copy: its node_modules is a link to the project's own.
      symlinkSync(join(dir, "real", "modules"), join(dir, "copy", "node_modules"), "junction");
      const patch = TWO_FILES.replaceAll("b.txt", "node_modules/b.txt");
      assert.deepEqual(applyPatch(join(dir, "copy"), parsePatch(patch)), {
        applies: false,
        cause: "node_modules/b.txt is outside the copy",
      });
      assert.equal(readFileSync(join(dir, "real/modules/b.txt"), "utf8"), "old\n", "the file outside is as it was");
      assert.equal(readFileSync(join(dir, "copy/src/a.txt"), "utf8"), TEN, "and nothing else was written");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says a patch that leaves every file as it was changes nothing", () => {
    const dir = folder({ "src/a.txt": TEN });
    try {
      const same = "--- a/src/a.txt\n+++ b/src/a.txt\n@@ -2,3 +2,3 @@\n line2\n-line3\n+line3\n line4\n";
      assert.deepEqual(applyPatch(dir, parsePatch(same)), { applies: true, changed: false });
      assert.equal(readFileSync(join(dir, "src/a.txt"), "utf8"), TEN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a CRLF file's bytes apart from the change", () => {
    const dir = folder({ "src/a.txt": TEN.replace(/\n/g, "\r\n") });
    try {
      assert.deepEqual(applyPatch(dir, parsePatch(TWO_HUNKS)), { applies: true, changed: true });
      assert.equal(readFileSync(join(dir, "src/a.txt"), "utf8"), TEN_PATCHED.replace(/\n/g, "\r\n"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
