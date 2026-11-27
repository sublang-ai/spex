// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-1, guards-3, guards-10, guards-18), DR-252:
 * binding.yaml and guard.yaml, and loading one whole guard with every
 * error naming the file or item and the cause.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "./approval.js";
import { caseSteps, listGuards, loadBinding, loadGuard, parseBinding, parseGuardFile } from "./files.js";
import { GuardError, parseType, type Declaration } from "./types.js";

const BINDING = `# SPDX-License-Identifier: Apache-2.0
format: 1
values:
  user: [ann, bob]
events:
  grant:
    params: { who: user }
  revoke:
    params: { who: user }
  use:
    params: { who: user }
    effect: { ok: bool }
files:
  - src
  - ./package.json
commands:
  - [node, -e, "process.exit(0)"]
`;

const GUARD = `format: 1
binding: ents
limits: { seconds: 30 }
cases:
  - case: a granted use fails
    steps:
      - { event: grant, params: { who: ann } }
      - { event: use, params: { who: ann }, effect: { ok: false } }
  - case: a granted user uses
    steps:
      - { event: grant, params: { who: ann } }
      - { event: use, params: { who: ann }, effect: { ok: true } }
`;

const TRANSLATION_A = `---- MODULE a ----
EXTENDS Declaration
Start == {}
Legal(s, e) == TRUE
Effect(s, e) == IF e.event = "use" THEN [ok |-> e.who \\in s] ELSE <<>>
After(s, e) == IF e.event = "grant" THEN s \\cup {e.who} ELSE IF e.event = "revoke" THEN s \\ {e.who} ELSE s
When(e) == e.event = "use"
While(s, e) == e.who \\in s
Shall(s, e, f) == f.ok
====
`;

const TRANSLATION_B = TRANSLATION_A.replace("MODULE a", "MODULE b").replace("Start == {}", "\\* The users who hold a grant.\nStart == {}");

const FAULT = `Uses fail for everyone.
--- a/src/ents.mjs
+++ b/src/ents.mjs
@@ -1,2 +1,2 @@
 export const use = (held, user) =>
-  held.has(user);
+  false;
`;

const SPEC = `# entitlements

## Intent

Who may use what.

## External Behavior

### entitlements-1

While a grant stands, a use shall succeed [[entitlements-2](#entitlements-2)].

### entitlements-2

A grant shall last until it is revoked.

## Verification

### entitlements-3

When \`spex verify\` checks uses, it shall find that each use by a user who holds a grant succeeds [[entitlements-1](#entitlements-1)], in these cases:

- permitted \u2014 a granted user uses: ann is granted and then uses, and the use succeeds;
- forbidden \u2014 a granted use fails: ann is granted and then uses, and the use fails.

### entitlements-4

Another test shall pass [[entitlements-2](#entitlements-2)].
`;

const PROJECT: Record<string, string> = {
  "package.json": `{ "type": "module" }\n`,
  "src/ents.mjs": "export const use = (held, user) =>\n  held.has(user);\n",
  "specs/packages/entitlements.md": SPEC,
  "guards/bindings/ents/binding.yaml": BINDING,
  "guards/bindings/ents/binding.mjs": "export function start() { return new Set(); }\nexport const events = {};\n",
  "guards/bindings/ents/lib/helper.mjs": "export const help = 1;\n",
  "guards/bindings/ents/node_modules/dep/index.js": "module.exports = 1;\n",
  "guards/entitlements-3/guard.yaml": GUARD,
  "guards/entitlements-3/translations/a.tla": TRANSLATION_A,
  "guards/entitlements-3/translations/b.tla": TRANSLATION_B,
  "guards/entitlements-3/faults/always-false.patch": FAULT,
};

function fixture(files: Record<string, string | null>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-files-")));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

/** The project with some files replaced, added, or (null) left out. */
function withProject<T>(changes: Record<string, string | null>, work: (root: string) => T): T {
  const root = fixture({ ...PROJECT, ...changes });
  try {
    return work(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function message(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

describe("guards-3: files: binding.yaml", () => {
  it("reads values, events in declared order, files and commands", () => {
    const binding = parseBinding(BINDING);
    assert.deepEqual(binding.vocabulary.sets, { user: ["ann", "bob"] });
    assert.deepEqual(Object.keys(binding.events), ["grant", "revoke", "use"]);
    assert.deepEqual(binding.events.use, {
      params: { who: { kind: "value", set: "user" } },
      effect: { ok: { kind: "bool" } },
    });
    assert.deepEqual(binding.events.grant.effect, {});
    assert.deepEqual(binding.files, ["src", "package.json"]);
    assert.deepEqual(binding.commands, [["node", "-e", "process.exit(0)"]]);
  });

  it("takes a binding with no values, params, effect or commands", () => {
    const binding = parseBinding("format: 1\nevents:\n  tick:\nfiles: [src/]\n");
    assert.deepEqual(binding.events, { tick: { params: {}, effect: {} } });
    assert.deepEqual(binding.files, ["src"]);
    assert.deepEqual(binding.commands, []);
  });

  it("takes a declaration that names no files", () => {
    assert.deepEqual(parseBinding("format: 1\nevents:\n  tick:\n").files, []);
    assert.deepEqual(parseBinding("format: 1\nevents:\n  tick:\nfiles: []\n").files, []);
  });

  const HEAD = "format: 1\nvalues: { user: [ann] }\n";
  const TAIL = "files: [src]\n";
  const cases: [string, string, string][] = [
    ["another format", `format: 3\nevents: { tick: }\n${TAIL}`, "format must be 1"],
    ["an unknown key", `${HEAD}events: { tick: }\n${TAIL}controls: [clock]\n`, "unknown key 'controls'"],
    ["no events", `${HEAD}${TAIL}`, "events: expected a mapping, found nothing"],
    ["an empty events", `${HEAD}events: {}\n${TAIL}`, "events: a binding declares at least one event"],
    ["values that are no list", `format: 1\nvalues: { user: ann }\nevents: { tick: }\n${TAIL}`, `values user: expected a list of values, found "ann"`],
    ["a value in two sets", `format: 1\nvalues: { a: [x], b: [x] }\nevents: { tick: }\n${TAIL}`, "values b: 'x' is also in values a; a value belongs to one set"],
    ["an event that is no name", `${HEAD}events: { "a b": }\n${TAIL}`, "event a b: 'a b' is not a name (a letter, then letters, digits and _)"],
    ["an unknown key in an event", `${HEAD}events: { tick: { state: {} } }\n${TAIL}`, "event tick: unknown key 'state'"],
    ["an unknown type", `${HEAD}events: { tick: { params: { at: time } } }\n${TAIL}`, `event tick: params: at: 'time' is not a type or a values name in type "time"`],
    ["a type that is not text", `${HEAD}events: { tick: { effect: { ok: [bool] } } }\n${TAIL}`, `event tick: effect: ok: write the type as text, found ["bool"]`],
    ["a param named event", `${HEAD}events: { tick: { params: { event: user } } }\n${TAIL}`, "event tick: params: 'event' names the event itself; pick another name"],
    ["an effect field that is no name", `${HEAD}events: { tick: { effect: { Ok: bool } } }\n${TAIL}`, "event tick: effect: Ok: 'Ok' is not a name (a lowercase letter, then letters and digits)"],
    ["a values set TLA+ could not name", `format: 1\nvalues: { seq: [x] }\nevents: { tick: }\n${TAIL}`, "values: 'seq' cannot name a values set: the declaration in TLA+ would define Seq, which is taken"],
    ["a values set whose names another takes", `format: 1\nvalues: { user: [x], userRank: [y] }\nevents: { tick: }\n${TAIL}`, "values: 'userRank' cannot name a values set: the declaration in TLA+ would define UserRank, as values user does"],
    ["a value that is not printable ASCII", `format: 1\nvalues: { user: ["an\u00e9"] }\nevents: { tick: }\n${TAIL}`, `values user: "an\u00e9" cannot be a value (printable ASCII, no space at either end)`],
    ["files that are no list", `${HEAD}events: { tick: }\nfiles: src\n`, "files: expected a list of paths to copy"],
    ["a path out of the project", `${HEAD}events: { tick: }\nfiles: [../other]\n`, "files: '../other' must be a path inside the project, written with '/'"],
    ["a path from the top of the disk", `${HEAD}events: { tick: }\nfiles: [/etc]\n`, "files: '/etc' must be a path inside the project, written with '/'"],
    ["the whole project", `${HEAD}events: { tick: }\nfiles: [.]\n`, "files: '.' must be a path inside the project, written with '/'"],
    ["a path with a backslash", `${HEAD}events: { tick: }\nfiles: ['src\\lib']\n`, "files: 'src\\lib' must be a path inside the project, written with '/'"],
    ["a node_modules path", `${HEAD}events: { tick: }\nfiles: [node_modules/x]\n`, "files: 'node_modules/x' is in a node_modules or .git folder, which a run never copies"],
    [
      "its own folder among the files",
      `${HEAD}events: { tick: }\nfiles: [src, guards/bindings/ents]\n`,
      "files: 'guards/bindings/ents' is under guards/; a binding's folder is copied by itself and is no code under test",
    ],
    [
      "the guards folder among the files",
      `${HEAD}events: { tick: }\nfiles: [./guards/]\n`,
      "files: './guards/' is under guards/; a binding's folder is copied by itself and is no code under test",
    ],
    ["a path twice", `${HEAD}events: { tick: }\nfiles: [src, ./src/]\n`, "files: './src/' is listed twice"],
    ["a path that is no text", `${HEAD}events: { tick: }\nfiles: [1]\n`, "files: expected a path, found 1"],
    ["a command that is one string", `${HEAD}events: { tick: }\n${TAIL}commands: [npm run build]\n`, `commands: command 1 must be a list of words, the program first, found "npm run build"`],
    ["an empty command", `${HEAD}events: { tick: }\n${TAIL}commands: [[node], []]\n`, "commands: command 2 must be a list of words, the program first, found []"],
  ];
  for (const [name, text, expected] of cases) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => parseBinding(text)), expected);
    });
  }
});

describe("guards-10: files: guard.yaml", () => {
  const declaration: Declaration = parseBinding(BINDING);
  const parse = (text: string) => parseGuardFile(text, () => declaration);

  it("reads the binding's name, the limits and each entry's steps, in the file's order", () => {
    const seen: string[] = [];
    const file = parseGuardFile(GUARD, (name) => {
      seen.push(name);
      return declaration;
    });
    assert.deepEqual(seen, ["ents"]);
    assert.equal(file.binding, "ents");
    assert.deepEqual(file.limits, { seconds: 30 });
    assert.deepEqual(file.entries, [
      {
        label: "a granted use fails",
        steps: [
          { event: "grant", params: { who: "ann" }, effect: {} },
          { event: "use", params: { who: "ann" }, effect: { ok: false } },
        ],
      },
      {
        label: "a granted user uses",
        steps: [
          { event: "grant", params: { who: "ann" }, effect: {} },
          { event: "use", params: { who: "ann" }, effect: { ok: true } },
        ],
      },
    ]);
  });

  it("gives each case of the item its steps, in the item's order and with the item's kind", () => {
    const file = parse(GUARD);
    const cases = caseSteps(
      [
        { kind: "permitted", label: "a granted user uses", words: "it succeeds" },
        { kind: "forbidden", label: "a granted use fails", words: "it fails" },
      ],
      file.entries,
    );
    assert.deepEqual(cases.map((entry) => [entry.label, entry.kind, entry.words, entry.steps[1].effect.ok]), [
      ["a granted user uses", "permitted", "it succeeds", true],
      ["a granted use fails", "forbidden", "it fails", false],
    ]);
  });

  it("names a case with no entry and an entry for no case by its label", () => {
    const file = parse(GUARD);
    const one = { kind: "permitted" as const, label: "a granted user uses", words: "it succeeds" };
    const two = { kind: "forbidden" as const, label: "a granted use fails", words: "it fails" };
    const three = { kind: "forbidden" as const, label: "a third", words: "it fails" };
    assert.equal(message(() => caseSteps([one, two, three], file.entries)), "a case with no entry: a third");
    assert.equal(message(() => caseSteps([one], file.entries)), "an entry for no case: a granted use fails");
    assert.equal(
      message(() => caseSteps([one, { ...two, label: "A granted use fails" }], file.entries)),
      "an entry for no case: a granted use fails",
      "a label is compared as written",
    );
  });

  const LIMITS = "limits: { seconds: 30 }\n";
  const HEAD = `format: 1\nbinding: ents\n${LIMITS}`;
  const ONE = "  - { case: one, steps: [{ event: grant, params: { who: ann } }] }\n";
  const cases: [string, string, string][] = [
    ["another format", `format: 0\nbinding: ents\n${LIMITS}cases: []\n`, "format must be 1"],
    ["an unknown key", `${HEAD}checks: []\ncases: []\n`, "unknown key 'checks'"],
    ["no binding", `format: 1\n${LIMITS}cases: []\n`, "binding must be a binding's name, found nothing"],
    ["no limits", "format: 1\nbinding: ents\ncases: []\n", "limits: expected a mapping, found nothing"],
    ["limits with an unknown key", "format: 1\nbinding: ents\nlimits: { seconds: 1, runs: 8 }\ncases: []\n", "limits: unknown key 'runs'"],
    ["no time limit", "format: 1\nbinding: ents\nlimits: {}\ncases: []\n", "limits.seconds must be a whole number from 1 to 2147483, found nothing"],
    ["no second at all", "format: 1\nbinding: ents\nlimits: { seconds: 0 }\ncases: []\n", "limits.seconds must be a whole number from 1 to 2147483, found 0"],
    ["a part of a second", "format: 1\nbinding: ents\nlimits: { seconds: 1.5 }\ncases: []\n", "limits.seconds must be a whole number from 1 to 2147483, found 1.5"],
    ["more seconds than a timer runs", "format: 1\nbinding: ents\nlimits: { seconds: 2147484 }\ncases: []\n", "limits.seconds must be a whole number from 1 to 2147483, found 2147484"],
    ["seconds as text", "format: 1\nbinding: ents\nlimits: { seconds: '30' }\ncases: []\n", `limits.seconds must be a whole number from 1 to 2147483, found "30"`],
    ["cases that are no list", `${HEAD}cases: {}\n`, "cases must be a list"],
    ["an entry with an unknown key", `${HEAD}cases:\n  - { case: one, kind: permitted, steps: [] }\n`, "cases entry 1: unknown key 'kind'"],
    ["an entry with no label", `${HEAD}cases:\n  - { steps: [] }\n`, "cases entry 1: case must be the label of a case of the guard item, found nothing"],
    ["a case entered twice", `${HEAD}cases:\n${ONE}${ONE}`, "a case entered twice: one"],
    ["a case with no steps", `${HEAD}cases:\n  - { case: one, steps: [] }\n`, "case 'one': steps must be a list of one or more steps"],
    ["a step with an unknown key", `${HEAD}cases:\n  - { case: one, steps: [{ event: grant, params: { who: ann }, expect: {} }] }\n`, "case 'one': step 1: unknown key 'expect'"],
    ["a step of an undeclared event", `${HEAD}cases:\n  - { case: one, steps: [{ event: renew }] }\n`, `case 'one': step 1: the binding declares no event "renew"`],
    ["a step with no event", `${HEAD}cases:\n  - { case: one, steps: [{ params: {} }] }\n`, "case 'one': step 1: the binding declares no event nothing"],
    ["a step that leaves out a param", `${HEAD}cases:\n  - { case: one, steps: [{ event: grant }] }\n`, "case 'one': step 1: params: no value for 'who'"],
    ["a step with a param of the wrong type", `${HEAD}cases:\n  - { case: one, steps: [{ event: grant, params: { who: cat } }] }\n`, `case 'one': step 1: params: who: expected user, found "cat"`],
    ["a step with an undeclared param", `${HEAD}cases:\n  - { case: one, steps: [{ event: grant, params: { who: ann, until: 3 } }] }\n`, "case 'one': step 1: params: 'until' is not declared"],
    ["a step with an effect field of the wrong type", `${HEAD}cases:\n  - { case: one, steps: [{ event: use, params: { who: ann }, effect: { ok: yes } }] }\n`, `case 'one': step 1: effect: ok: expected bool, found "yes"`],
    ["a step with an undeclared effect field", `${HEAD}cases:\n  - { case: one, steps: [{ event: grant, params: { who: ann }, effect: { ok: true } }] }\n`, "case 'one': step 1: effect: 'ok' is not declared"],
  ];
  for (const [name, text, expected] of cases) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => parse(text)), expected);
    });
  }
});

describe("guards-18: files: one whole guard", () => {
  it("loads the items, the binding, the limits, the cases, the translations and the kept faults", () => {
    withProject({}, (root) => {
      const guard = loadGuard(root, "entitlements-3");
      assert.equal(guard.name, "entitlements-3");
      assert.equal(guard.root, root);
      assert.equal(guard.folder, "guards/entitlements-3");
      assert.equal(guard.items.guard.id, "entitlements-3");
      assert.equal(guard.items.behavior.id, "entitlements-1");
      assert.deepEqual(guard.items.cited.map((item) => item.id), ["entitlements-2"]);
      assert.equal(guard.binding.name, "ents");
      assert.equal(guard.binding.folder, "guards/bindings/ents");
      assert.deepEqual(guard.binding.files, ["src", "package.json"]);
      assert.deepEqual(guard.binding.folderFiles, [
        "guards/bindings/ents/binding.mjs",
        "guards/bindings/ents/binding.yaml",
        "guards/bindings/ents/lib/helper.mjs",
      ]);
      assert.equal(guard.binding.module, true);
      assert.deepEqual(guard.limits, { seconds: 30 });
      assert.deepEqual(
        guard.cases.map((entry) => [entry.label, entry.kind, entry.words, entry.steps.length]),
        [
          ["a granted user uses", "permitted", "ann is granted and then uses, and the use succeeds", 2],
          ["a granted use fails", "forbidden", "ann is granted and then uses, and the use fails", 2],
        ],
        "in the item's order, though the guard file enters them in another",
      );
      assert.deepEqual(guard.translations.map((translation) => [translation.name, translation.file]), [
        ["a", "guards/entitlements-3/translations/a.tla"],
        ["b", "guards/entitlements-3/translations/b.tla"],
      ]);
      assert.equal(guard.translations[0].text, TRANSLATION_A, "a translation's text is kept as written");
      assert.deepEqual(guard.faults.map((fault) => [fault.name, fault.file]), [
        ["always-false", "guards/entitlements-3/faults/always-false.patch"],
      ]);
      assert.deepEqual(guard.faults[0].patch.files.map((file) => file.path), ["src/ents.mjs"]);
    });
  });

  it("digests every approval input, the same on every load", () => {
    withProject({}, (root) => {
      const guard = loadGuard(root, "entitlements-3");
      assert.deepEqual(Object.keys(guard.inputs), [
        "file guards/bindings/ents/binding.mjs",
        "file guards/bindings/ents/binding.yaml",
        "file guards/bindings/ents/lib/helper.mjs",
        "file guards/entitlements-3/faults/always-false.patch",
        "file guards/entitlements-3/guard.yaml",
        "file guards/entitlements-3/translations/a.tla",
        "file guards/entitlements-3/translations/b.tla",
        "item entitlements-1",
        "item entitlements-2",
        "item entitlements-3",
      ]);
      assert.equal(guard.inputs["file guards/entitlements-3/guard.yaml"], digest(GUARD));
      assert.equal(guard.inputs["file guards/bindings/ents/lib/helper.mjs"], digest("export const help = 1;\n"));
      assert.equal(guard.inputs["item entitlements-3"], digest(guard.items.guard.text));
      assert.equal(
        guard.inputs["item entitlements-2"],
        digest("### entitlements-2\n\nA grant shall last until it is revoked."),
      );
      assert.deepEqual(loadGuard(root, "entitlements-3").inputs, guard.inputs);
      assert.deepEqual(loadGuard(root, "entitlements-3", undefined), guard);
    });
  });

  it("gives a CRLF checkout the same digests", () => {
    const crlf: Record<string, string> = {};
    for (const [path, text] of Object.entries(PROJECT)) crlf[path] = text.replace(/\n/g, "\r\n");
    const lf = withProject({}, (root) => loadGuard(root, "entitlements-3").inputs);
    assert.deepEqual(withProject(crlf, (root) => loadGuard(root, "entitlements-3").inputs), lf);
  });

  it("changes only the digest of the input that changed", () => {
    const before = withProject({}, (root) => loadGuard(root, "entitlements-3").inputs);
    const edited = withProject(
      { "specs/packages/entitlements.md": SPEC.replace("until it is revoked", "until someone revokes it") },
      (root) => loadGuard(root, "entitlements-3").inputs,
    );
    const changed = Object.keys(before).filter((label) => before[label] !== edited[label]);
    assert.deepEqual(changed, ["item entitlements-2"]);
    assert.deepEqual(Object.keys(edited), Object.keys(before));
  });

  it("writes nothing into the project", () => {
    withProject({}, (root) => {
      const before = readFileSync(join(root, "guards/entitlements-3/guard.yaml"), "utf8");
      loadGuard(root, "entitlements-3");
      assert.equal(readFileSync(join(root, "guards/entitlements-3/guard.yaml"), "utf8"), before);
      assert.deepEqual(listGuards(root), ["entitlements-3"]);
    });
  });

  it("changes the guard item's digest with one word of a case's plain words", () => {
    const before = withProject({}, (root) => loadGuard(root, "entitlements-3").inputs);
    const edited = withProject(
      { "specs/packages/entitlements.md": SPEC.replace("and the use fails.", "and the use is refused.") },
      (root) => loadGuard(root, "entitlements-3").inputs,
    );
    assert.deepEqual(
      Object.keys(before).filter((label) => before[label] !== edited[label]),
      ["item entitlements-3"],
    );
  });

  it("loads a guard whose binding's folder holds no binding.mjs", () => {
    withProject({ "guards/bindings/ents/binding.mjs": null }, (root) => {
      const guard = loadGuard(root, "entitlements-3");
      assert.equal(guard.binding.module, false);
      assert.ok(!Object.hasOwn(guard.inputs, "file guards/bindings/ents/binding.mjs"));
    });
  });

  it("loads a guard whose declaration names no files, with or without a kept fault", () => {
    const noFiles = BINDING.replace("files:\n  - src\n  - ./package.json\n", "");
    withProject({ "guards/bindings/ents/binding.yaml": noFiles }, (root) => {
      const guard = loadGuard(root, "entitlements-3");
      assert.deepEqual(guard.binding.files, []);
      assert.equal(guard.faults.length, 1);
    });
    withProject(
      { "guards/bindings/ents/binding.yaml": noFiles, "guards/entitlements-3/faults/always-false.patch": null },
      (root) => assert.deepEqual(loadGuard(root, "entitlements-3").faults, []),
    );
  });

  it("refuses, with a declaration that names no files, a kept fault under guards/ or node_modules alone", () => {
    const noFiles = BINDING.replace("files:\n  - src\n  - ./package.json\n", "");
    for (const path of ["guards/bindings/ents/binding.mjs", "src/node_modules/dep/index.js"]) {
      withProject(
        {
          "guards/bindings/ents/binding.yaml": noFiles,
          "guards/entitlements-3/faults/always-false.patch": FAULT.replaceAll("src/ents.mjs", path),
        },
        (root) =>
          assert.equal(
            message(() => loadGuard(root, "entitlements-3")),
            `guards/entitlements-3/faults/always-false.patch: ${path} is not among the binding's files`,
          ),
      );
    }
  });

  it("lists translations and kept faults in name order, by the name without its extension", () => {
    // `_` sorts after `.`, so by file name `a_b.tla` would come last all the same;
    // `a.tla` comes before it by its name.
    withProject(
      {
        "guards/entitlements-3/translations/a_b.tla": TRANSLATION_B.replace("MODULE b", "MODULE a_b"),
        "guards/entitlements-3/faults/always-false-2.patch": FAULT,
      },
      (root) => {
        const guard = loadGuard(root, "entitlements-3");
        assert.deepEqual(guard.translations.map((translation) => translation.name), ["a", "a_b", "b"]);
        assert.deepEqual(guard.faults.map((fault) => fault.name), ["always-false", "always-false-2"]);
      },
    );
  });

  it("takes a guard with no kept fault", () => {
    withProject({ "guards/entitlements-3/faults/always-false.patch": null }, (root) => {
      assert.deepEqual(loadGuard(root, "entitlements-3").faults, []);
    });
  });

  it("does not read the approval record", () => {
    withProject({ "guards/entitlements-3/approval.json": "not json" }, (root) => {
      const guard = loadGuard(root, "entitlements-3");
      assert.ok(!Object.keys(guard.inputs).some((label) => label.endsWith("approval.json")));
    });
  });

  const G = "guards/entitlements-3";
  const cases: [string, Record<string, string | null>, string][] = [
    ["a guard file that is not there", { [`${G}/guard.yaml`]: null }, `${G}/guard.yaml: not found`],
    ["a guard file that does not parse", { [`${G}/guard.yaml`]: "format: {1\n" }, `${G}/guard.yaml: not readable as YAML — `],
    ["a guard file with an unknown key", { [`${G}/guard.yaml`]: `${GUARD}tools: []\n` }, `${G}/guard.yaml: unknown key 'tools'`],
    ["a stray file in the guard's folder", { [`${G}/notes.md`]: "x" }, `${G}/notes.md: not part of a guard; its folder holds guard.yaml, translations/, faults/ and approval.json`],
    ["a binding that is not there", { [`${G}/guard.yaml`]: GUARD.replace("binding: ents", "binding: api") }, "guards/bindings/api: no such binding"],
    ["a binding name that is a path", { [`${G}/guard.yaml`]: GUARD.replace("binding: ents", "binding: ../ents") }, "'../ents' cannot be a binding's name"],
    ["a binding with no declaration", { "guards/bindings/ents/binding.yaml": null }, "guards/bindings/ents/binding.yaml: not found"],
    ["a fault in the binding's declaration", { "guards/bindings/ents/binding.yaml": BINDING.replace("effect: { ok: bool }", "effect: { ok: boolean }") }, `guards/bindings/ents/binding.yaml: event use: effect: ok: 'boolean' is not a type or a values name in type "boolean"`],
    ["a binding naming a file that is not in the project", { "src/ents.mjs": null }, "guards/bindings/ents/binding.yaml: files: 'src' is not in the project"],
    [
      "a binding naming its own folder among its files",
      { "guards/bindings/ents/binding.yaml": BINDING.replace("  - src\n", "  - src\n  - guards/bindings/ents\n") },
      "guards/bindings/ents/binding.yaml: files: 'guards/bindings/ents' is under guards/; a binding's folder is copied by itself and is no code under test",
    ],
    [
      "a binding naming another guard's folder among its files",
      { "guards/bindings/ents/binding.yaml": BINDING.replace("  - src\n", "  - src\n  - guards/entitlements-3/translations\n") },
      "guards/bindings/ents/binding.yaml: files: 'guards/entitlements-3/translations' is under guards/; a binding's folder is copied by itself and is no code under test",
    ],
    ["a step of the wrong type", { [`${G}/guard.yaml`]: GUARD.replace("effect: { ok: true }", "effect: { ok: 1 }") }, `${G}/guard.yaml: case 'a granted user uses': step 2: effect: ok: expected bool, found 1`],
    ["a guard named for no spec item", { "specs/packages/entitlements.md": SPEC.replace("### entitlements-3", "### entitlements-9") }, "entitlements-3: no spec item has this ID"],
    ["a guard item that cites no behavior item", { "specs/packages/entitlements.md": SPEC.replace("succeeds [[entitlements-1](#entitlements-1)], in", "succeeds, in") }, "entitlements-3: cites no behavior item of its own file; a guard checks one"],
    ["a guard item with no forbidden case", { "specs/packages/entitlements.md": SPEC.replace("- forbidden \u2014", "- refused \u2014") }, "entitlements-3: no forbidden case; a guard item has at least one, written '- forbidden \u2014 <label>: <the case in plain words>'"],
    ["an entry for no case of the item", { [`${G}/guard.yaml`]: GUARD.replace("case: a granted use fails", "case: a granted use is refused") }, `${G}/guard.yaml: an entry for no case: a granted use is refused`],
    ["a case of the item with no entry", { "specs/packages/entitlements.md": SPEC.replace("uses, and the use fails.", "uses, and the use fails;\n- forbidden \u2014 a third: it fails.") }, `${G}/guard.yaml: a case with no entry: a third`],
    ["a case entered twice", { [`${G}/guard.yaml`]: GUARD.replace("case: a granted use fails", "case: a granted user uses") }, `${G}/guard.yaml: a case entered twice: a granted user uses`],
    ["no translations folder", { [`${G}/translations/a.tla`]: null, [`${G}/translations/b.tla`]: null }, `${G}/translations: no translation; a guard needs two or more`],
    ["a stray file among the translations", { [`${G}/translations/c.yaml`]: TRANSLATION_A }, `${G}/translations/c.yaml: only <name>.tla files are kept in this folder`],
    ["a translation named with an upper-case letter", { [`${G}/translations/Ab.tla`]: TRANSLATION_A }, `${G}/translations/Ab.tla: a translation's name is a lowercase letter, then lowercase letters, digits and _`],
    ["a translation named as a file TLC loads", { [`${G}/translations/tlc.tla`]: TRANSLATION_A }, `${G}/translations/tlc.tla: 'tlc' is the name of a file TLC or Spex loads; pick another`],
    ["a translation named as one of Spex's own files", { [`${G}/translations/spexmodel.tla`]: TRANSLATION_A }, `${G}/translations/spexmodel.tla: 'spexmodel' is the name of a file TLC or Spex loads; pick another`],
    ["a kept fault that is no patch", { [`${G}/faults/always-false.patch`]: "Just words.\n" }, `${G}/faults/always-false.patch: no change found; a kept fault is a unified diff, as git diff writes it`],
    ["a stray file among the kept faults", { [`${G}/faults/README.md`]: "x" }, `${G}/faults/README.md: only <name>.patch files are kept in this folder`],
    [
      "a kept fault whose change has more lines than its header says",
      { [`${G}/faults/always-false.patch`]: `${FAULT}-extra\n` },
      `${G}/faults/always-false.patch: line 8: the change has more lines than its header says`,
    ],
    [
      "a kept fault that adds a file",
      { [`${G}/faults/always-false.patch`]: "--- /dev/null\n+++ b/src/new.mjs\n@@ -0,0 +1 @@\n+export {};\n" },
      `${G}/faults/always-false.patch: line 1: it adds or removes a file; a kept fault changes existing files`,
    ],
    [
      "a kept fault naming a file outside the binding's files",
      { [`${G}/faults/always-false.patch`]: FAULT.replaceAll("src/ents.mjs", "lib/ents.mjs") },
      `${G}/faults/always-false.patch: lib/ents.mjs is not among the binding's files`,
    ],
    [
      "a kept fault naming a file whose name only starts as one of the binding's files",
      { [`${G}/faults/always-false.patch`]: FAULT.replaceAll("src/ents.mjs", "src2/ents.mjs") },
      `${G}/faults/always-false.patch: src2/ents.mjs is not among the binding's files`,
    ],
    [
      "a kept fault naming the binding's own module",
      { [`${G}/faults/always-false.patch`]: FAULT.replaceAll("src/ents.mjs", "guards/bindings/ents/binding.mjs") },
      `${G}/faults/always-false.patch: guards/bindings/ents/binding.mjs is not among the binding's files`,
    ],
    [
      "a kept fault naming a file in a node_modules folder",
      { [`${G}/faults/always-false.patch`]: FAULT.replaceAll("src/ents.mjs", "src/node_modules/dep/index.js") },
      `${G}/faults/always-false.patch: src/node_modules/dep/index.js is not among the binding's files`,
    ],
    [
      "a kept fault naming a file in a .git folder",
      { [`${G}/faults/always-false.patch`]: FAULT.replaceAll("src/ents.mjs", "src/.git/config") },
      `${G}/faults/always-false.patch: src/.git/config is not among the binding's files`,
    ],
    ["a name that is a path", {}, "'../x' cannot be a guard's name"],
  ];
  for (const [name, changes, expected] of cases) {
    it(`refuses ${name}`, () => {
      withProject(changes, (root) => {
        const guardName = expected.startsWith("'../x'") ? "../x" : "entitlements-3";
        const found = message(() => loadGuard(root, guardName));
        if (expected.endsWith("— ")) assert.ok(found.startsWith(expected), found);
        else assert.equal(found, expected);
      });
    });
  }

  it("refuses a binding whose files reach its own folder through a link", { skip: process.platform === "win32" }, () => {
    withProject({ "guards/bindings/ents/binding.yaml": BINDING.replace("  - src\n", "  - src\n  - linked\n") }, (root) => {
      symlinkSync(join(root, "guards", "bindings", "ents"), join(root, "linked"), "dir");
      assert.equal(
        message(() => loadGuard(root, "entitlements-3")),
        "guards/bindings/ents/binding.yaml: files: 'linked' is under guards/; a binding's folder is copied by itself and is no code under test",
      );
    });
  });

  it("takes a kept fault naming one of the binding's files, or a file under one", () => {
    const onListed = "--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-{ \"type\": \"module\" }\n+{}\n";
    const onMissing = FAULT.replaceAll("src/ents.mjs", "src/deep/gone.mjs");
    withProject(
      { "guards/entitlements-3/faults/listed.patch": onListed, "guards/entitlements-3/faults/missing.patch": onMissing },
      (root) => {
        const faults = loadGuard(root, "entitlements-3").faults;
        assert.deepEqual(faults.map((fault) => fault.patch.files[0].path), ["src/ents.mjs", "package.json", "src/deep/gone.mjs"]);
      },
    );
  });

  it("loads a translation without reading what its text means", () => {
    withProject({ "guards/entitlements-3/translations/b.tla": "not TLA+ at all\n" }, (root) => {
      assert.equal(loadGuard(root, "entitlements-3").translations[1].text, "not TLA+ at all\n");
    });
  });
});

describe("guards-1: files: finding guards and bindings", () => {
  it("lists every folder under guards/ other than bindings, in name order, with or without a guard.yaml", () => {
    withProject(
      {
        "guards/billing-12/guard.yaml": GUARD,
        "guards/zz-1/guard.yaml": GUARD,
        "guards/drafts/readme.md": "not a guard",
        "guards/bindings/guard.yaml": "ignored",
        "guards/notes.txt": "x",
      },
      (root) => {
        assert.deepEqual(listGuards(root), ["billing-12", "drafts", "entitlements-3", "zz-1"]);
        assert.equal(message(() => loadGuard(root, "drafts")), "guards/drafts/guard.yaml: not found");
      },
    );
  });

  it("lists nothing where there is no guards folder", () => {
    const root = fixture({ "README.md": "x" });
    try {
      assert.deepEqual(listGuards(root), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads a binding on its own, with the digest of every file in its folder", () => {
    withProject({}, (root) => {
      const { binding, inputs } = loadBinding(root, "ents");
      assert.equal(binding.name, "ents");
      assert.equal(binding.module, true);
      assert.deepEqual(Object.keys(binding.events), ["grant", "revoke", "use"]);
      assert.deepEqual(binding.events.use.effect, { ok: parseType("bool", binding.vocabulary) });
      assert.deepEqual(Object.keys(inputs), binding.folderFiles.map((path) => `file ${path}`));
      assert.equal(inputs["file guards/bindings/ents/binding.yaml"], digest(BINDING));
    });
  });
});
