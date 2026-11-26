// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: binding.yaml and guard.yaml, and loading one
 * whole guard with every error naming the file or item and the cause.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "./approval.js";
import { listGuards, loadBinding, loadGuard, parseBinding, parseGuardFile } from "./files.js";
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
sample: { sequences: 50, events: 8, seed: 1, seconds: 30 }
examples:
  - item: entitlements-4
    kind: permitted
    steps:
      - { event: grant, params: { who: ann } }
      - { event: use, params: { who: ann }, effect: { ok: true } }
  - item: entitlements-5
    kind: forbidden
    steps:
      - { event: grant, params: { who: ann } }
      - { event: use, params: { who: ann }, effect: { ok: false } }
`;

const READING_A = `format: 1
state:
  held: { type: set of user, start: [] }
events:
  grant: { then: { held: "held union {who}" } }
  revoke: { then: { held: "held minus {who}" } }
assertion:
  - on: use
    when: "who in held"
    shall: "effect.ok"
`;

const READING_B = `format: 1
state:
  has: { type: map user to bool, start: { ann: false, bob: false } }
events:
  grant: { then: { has: "map u in user: has[u] or u == who" } }
  revoke: { then: { has: "map u in user: has[u] and u != who" } }
assertion:
  - on: use
    when: "has[who]"
    shall: "effect.ok"
`;

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

While a user holds a grant, each use by that user shall succeed [[entitlements-1](#entitlements-1)].

### entitlements-4

When ann is granted and then uses, the use shall succeed [[entitlements-1](#entitlements-1)].

### entitlements-5

When ann is granted and then uses, the use shall never fail [[entitlements-1](#entitlements-1)].
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
  "guards/entitlements-3/readings/a.yaml": READING_A,
  "guards/entitlements-3/readings/b.yaml": READING_B,
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

  const HEAD = "format: 1\nvalues: { user: [ann] }\n";
  const TAIL = "files: [src]\n";
  const cases: [string, string, string][] = [
    ["another format", `format: 3\nevents: { tick: }\n${TAIL}`, "format must be 1"],
    ["an unknown key", `${HEAD}events: { tick: }\n${TAIL}controls: [clock]\n`, "unknown key 'controls'"],
    ["no events", `${HEAD}${TAIL}`, "events: expected a mapping, found nothing"],
    ["an empty events", `${HEAD}events: {}\n${TAIL}`, "events: a binding declares at least one event"],
    ["values that are no list", `format: 1\nvalues: { user: ann }\nevents: { tick: }\n${TAIL}`, `values user: expected a list of values, found "ann"`],
    ["a value in two sets", `format: 1\nvalues: { a: [x], b: [x] }\nevents: { tick: }\n${TAIL}`, "values b: 'x' is also in values a; a value belongs to one set"],
    ["an event named by a word", `${HEAD}events: { size: }\n${TAIL}`, "event size: 'size' is a word of the condition language"],
    ["an unknown key in an event", `${HEAD}events: { tick: { state: {} } }\n${TAIL}`, "event tick: unknown key 'state'"],
    ["an unknown type", `${HEAD}events: { tick: { params: { at: time } } }\n${TAIL}`, `event tick: params: at: 'time' is not a type or a values name in type "time"`],
    ["a type that is not text", `${HEAD}events: { tick: { effect: { ok: [bool] } } }\n${TAIL}`, `event tick: effect: ok: write the type as text, found ["bool"]`],
    ["a param named as a values set", `${HEAD}events: { tick: { params: { user: user } } }\n${TAIL}`, "event tick: params: user: this is also a values name; pick another"],
    ["an effect field named by a word", `${HEAD}events: { tick: { effect: { min: bool } } }\n${TAIL}`, "event tick: effect: min: 'min' is a word of the condition language"],
    ["no files", `${HEAD}events: { tick: }\n`, "files: expected a list of one or more paths to copy"],
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

  it("reads the binding's name, the bounds and each example's steps", () => {
    const seen: string[] = [];
    const file = parseGuardFile(GUARD, (name) => {
      seen.push(name);
      return declaration;
    });
    assert.deepEqual(seen, ["ents"]);
    assert.equal(file.binding, "ents");
    assert.deepEqual(file.sample, { sequences: 50, events: 8, seed: 1, seconds: 30 });
    assert.deepEqual(file.examples, [
      {
        item: "entitlements-4",
        kind: "permitted",
        steps: [
          { event: "grant", params: { who: "ann" }, effect: {} },
          { event: "use", params: { who: "ann" }, effect: { ok: true } },
        ],
      },
      {
        item: "entitlements-5",
        kind: "forbidden",
        steps: [
          { event: "grant", params: { who: "ann" }, effect: {} },
          { event: "use", params: { who: "ann" }, effect: { ok: false } },
        ],
      },
    ]);
  });

  const SAMPLE = "sample: { sequences: 50, events: 2, seed: 0, seconds: 30 }\n";
  const HEAD = `format: 1\nbinding: ents\n${SAMPLE}`;
  const PERMITTED = "  - { item: e-1, kind: permitted, steps: [{ event: grant, params: { who: ann } }] }\n";
  const FORBIDDEN = "  - { item: e-2, kind: forbidden, steps: [{ event: use, params: { who: ann }, effect: { ok: false } }] }\n";
  const cases: [string, string, string][] = [
    ["another format", `format: 0\nbinding: ents\n${SAMPLE}examples: []\n`, "format must be 1"],
    ["an unknown key", `${HEAD}checks: []\nexamples: []\n`, "unknown key 'checks'"],
    ["no binding", `format: 1\n${SAMPLE}examples: []\n`, "binding must be a binding's name, found nothing"],
    ["no sample", "format: 1\nbinding: ents\nexamples: []\n", "sample: expected a mapping, found nothing"],
    ["a sample with an unknown key", "format: 1\nbinding: ents\nsample: { sequences: 1, events: 1, seed: 1, seconds: 1, steps: 8 }\nexamples: []\n", "sample: unknown key 'steps'"],
    ["a sample with no seed", "format: 1\nbinding: ents\nsample: { sequences: 1, events: 1, seconds: 1 }\nexamples: []\n", "sample.seed must be a whole number, 0 to 2147483647, found nothing"],
    ["no sequences", "format: 1\nbinding: ents\nsample: { sequences: 0, events: 1, seed: 1, seconds: 1 }\nexamples: []\n", "sample.sequences must be a whole number, 1 or more, found 0"],
    ["a part of an event", "format: 1\nbinding: ents\nsample: { sequences: 1, events: 1.5, seed: 1, seconds: 1 }\nexamples: []\n", "sample.events must be a whole number, 1 or more, found 1.5"],
    ["a seed below 0", "format: 1\nbinding: ents\nsample: { sequences: 1, events: 1, seed: -1, seconds: 1 }\nexamples: []\n", "sample.seed must be a whole number, 0 to 2147483647, found -1"],
    ["seconds as text", "format: 1\nbinding: ents\nsample: { sequences: 1, events: 1, seed: 1, seconds: '30' }\nexamples: []\n", `sample.seconds must be a whole number, 1 or more, found "30"`],
    ["examples that are no list", `${HEAD}examples: {}\n`, "examples must be a list"],
    ["no forbidden example", `${HEAD}examples:\n${PERMITTED}`, "no forbidden example; a guard needs at least one"],
    ["no permitted example", `${HEAD}examples:\n${FORBIDDEN}`, "no permitted example; a guard needs at least one"],
    ["an example with an unknown key", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [], note: x }\n`, "example 1: unknown key 'note'"],
    ["an example with no item", `${HEAD}examples:\n  - { kind: permitted, steps: [] }\n`, "example 1: item must be a spec item's ID, found nothing"],
    ["an example listed twice", `${HEAD}examples:\n${PERMITTED}${PERMITTED}`, "example e-1: listed twice"],
    ["an example of no kind", `${HEAD}examples:\n  - { item: e-1, kind: allowed, steps: [] }\n`, `example e-1: kind must be permitted or forbidden, found "allowed"`],
    ["an example with no steps", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [] }\n`, "example e-1: steps must be a list of one or more steps"],
    [
      "an example longer than a sequence may be",
      `${HEAD}examples:\n  - item: e-1\n    kind: permitted\n    steps:\n      - { event: grant, params: { who: ann } }\n      - { event: grant, params: { who: bob } }\n      - { event: use, params: { who: bob } }\n`,
      "example e-1: it has 3 steps, more than sample.events allows (2)",
    ],
    ["a step with an unknown key", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: grant, params: { who: ann }, expect: {} }] }\n`, "example e-1: step 1: unknown key 'expect'"],
    ["a step of an undeclared event", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: renew }] }\n`, `example e-1: step 1: the binding declares no event "renew"`],
    ["a step with no event", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ params: {} }] }\n`, "example e-1: step 1: the binding declares no event nothing"],
    ["a step that leaves out a param", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: grant }] }\n`, "example e-1: step 1: params: no value for 'who'"],
    ["a step with a param of the wrong type", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: grant, params: { who: cat } }] }\n`, `example e-1: step 1: params: who: expected user, found "cat"`],
    ["a step with an undeclared param", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: grant, params: { who: ann, until: 3 } }] }\n`, "example e-1: step 1: params: 'until' is not declared"],
    ["a step with an effect field of the wrong type", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: use, params: { who: ann }, effect: { ok: yes } }] }\n`, `example e-1: step 1: effect: ok: expected bool, found "yes"`],
    ["a step with an undeclared effect field", `${HEAD}examples:\n  - { item: e-1, kind: permitted, steps: [{ event: grant, params: { who: ann }, effect: { ok: true } }] }\n`, "example e-1: step 1: effect: 'ok' is not declared"],
  ];
  for (const [name, text, expected] of cases) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => parse(text)), expected);
    });
  }
});

describe("guards-18: files: one whole guard", () => {
  it("loads the items, the binding, the bounds, the examples, the readings and the kept faults", () => {
    withProject({}, (root) => {
      const guard = loadGuard(root, "entitlements-3");
      assert.equal(guard.name, "entitlements-3");
      assert.equal(guard.root, root);
      assert.equal(guard.folder, "guards/entitlements-3");
      assert.equal(guard.items.assertion.id, "entitlements-3");
      assert.equal(guard.items.behavior.id, "entitlements-1");
      assert.deepEqual(guard.items.examples.map((item) => item.id), ["entitlements-4", "entitlements-5"]);
      assert.deepEqual(guard.items.cited.map((item) => item.id), ["entitlements-2"]);
      assert.equal(guard.binding.name, "ents");
      assert.equal(guard.binding.folder, "guards/bindings/ents");
      assert.deepEqual(guard.binding.files, ["src", "package.json"]);
      assert.deepEqual(guard.binding.folderFiles, [
        "guards/bindings/ents/binding.mjs",
        "guards/bindings/ents/binding.yaml",
        "guards/bindings/ents/lib/helper.mjs",
      ]);
      assert.deepEqual(guard.sample, { sequences: 50, events: 8, seed: 1, seconds: 30 });
      assert.deepEqual(guard.examples.map((example) => [example.item, example.kind, example.steps.length]), [
        ["entitlements-4", "permitted", 2],
        ["entitlements-5", "forbidden", 2],
      ]);
      assert.deepEqual(guard.readings.map((reading) => [reading.name, reading.file]), [
        ["a", "guards/entitlements-3/readings/a.yaml"],
        ["b", "guards/entitlements-3/readings/b.yaml"],
      ]);
      assert.equal(guard.readings[0].events.grant.legal.source, "true");
      assert.deepEqual(guard.faults.map((fault) => [fault.name, fault.file, fault.title]), [
        ["always-false", "guards/entitlements-3/faults/always-false.patch", "Uses fail for everyone."],
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
        "file guards/entitlements-3/readings/a.yaml",
        "file guards/entitlements-3/readings/b.yaml",
        "item entitlements-1",
        "item entitlements-2",
        "item entitlements-3",
        "item entitlements-4",
        "item entitlements-5",
      ]);
      assert.equal(guard.inputs["file guards/entitlements-3/guard.yaml"], digest(GUARD));
      assert.equal(guard.inputs["file guards/bindings/ents/lib/helper.mjs"], digest("export const help = 1;\n"));
      assert.equal(guard.inputs["item entitlements-3"], digest(guard.items.assertion.text));
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
    ["a stray file in the guard's folder", { [`${G}/notes.md`]: "x" }, `${G}/notes.md: not part of a guard; its folder holds guard.yaml, readings/, faults/ and approval.json`],
    ["a binding that is not there", { [`${G}/guard.yaml`]: GUARD.replace("binding: ents", "binding: api") }, "guards/bindings/api: no such binding"],
    ["a binding name that is a path", { [`${G}/guard.yaml`]: GUARD.replace("binding: ents", "binding: ../ents") }, "'../ents' cannot be a binding's name"],
    ["a binding with no declaration", { "guards/bindings/ents/binding.yaml": null }, "guards/bindings/ents/binding.yaml: not found"],
    ["a binding with no module", { "guards/bindings/ents/binding.mjs": null }, "guards/bindings/ents/binding.mjs: not found"],
    ["a fault in the binding's declaration", { "guards/bindings/ents/binding.yaml": BINDING.replace("effect: { ok: bool }", "effect: { ok: boolean }") }, `guards/bindings/ents/binding.yaml: event use: effect: ok: 'boolean' is not a type or a values name in type "boolean"`],
    ["a binding naming a file that is not in the project", { "src/ents.mjs": null }, "guards/bindings/ents/binding.yaml: files: 'src' is not in the project"],
    [
      "a binding naming its own folder among its files",
      { "guards/bindings/ents/binding.yaml": BINDING.replace("  - src\n", "  - src\n  - guards/bindings/ents\n") },
      "guards/bindings/ents/binding.yaml: files: 'guards/bindings/ents' is under guards/; a binding's folder is copied by itself and is no code under test",
    ],
    [
      "a binding naming another guard's folder among its files",
      { "guards/bindings/ents/binding.yaml": BINDING.replace("  - src\n", "  - src\n  - guards/entitlements-3/readings\n") },
      "guards/bindings/ents/binding.yaml: files: 'guards/entitlements-3/readings' is under guards/; a binding's folder is copied by itself and is no code under test",
    ],
    ["an example step of the wrong type", { [`${G}/guard.yaml`]: GUARD.replace("effect: { ok: true }", "effect: { ok: 1 }") }, `${G}/guard.yaml: example entitlements-4: step 2: effect: ok: expected bool, found 1`],
    ["an assertion that is no spec item", { "specs/packages/entitlements.md": SPEC.replace("### entitlements-3", "### entitlements-9") }, "entitlements-3: no spec item has this ID"],
    ["an example that is no spec item", { [`${G}/guard.yaml`]: GUARD.replace("item: entitlements-5", "item: entitlements-50") }, "entitlements-50: no spec item has this ID"],
    ["an example that does not cite the behavior item", { "specs/packages/entitlements.md": SPEC.replace("never fail [[entitlements-1](#entitlements-1)]", "never fail [[entitlements-2](#entitlements-2)]") }, "entitlements-5: does not cite entitlements-1, the behavior item the guard protects"],
    ["no readings folder", { [`${G}/readings/a.yaml`]: null, [`${G}/readings/b.yaml`]: null }, `${G}/readings: no reading; a guard needs at least one`],
    ["a stray file among the readings", { [`${G}/readings/c.yml`]: READING_A }, `${G}/readings/c.yml: only <name>.yaml files are kept in this folder`],
    ["a fault in a reading", { [`${G}/readings/b.yaml`]: READING_B.replace("has[who]", "has[held]") }, `${G}/readings/b.yaml: rule 1: when: unknown name 'held' in "has[held]"`],
    ["a reading of an undeclared event", { [`${G}/readings/a.yaml`]: READING_A.replace("revoke:", "renew:") }, `${G}/readings/a.yaml: event renew: the binding declares no such event`],
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
    [
      "steps of two examples leaving out effect fields, each named once",
      { [`${G}/guard.yaml`]: GUARD.replace(", effect: { ok: false }", "").replace(", effect: { ok: true }", "") },
      `${G}/guard.yaml: example entitlements-4, step 2: reading a reads effect.ok, which the step does not state; example entitlements-5, step 2: reading a reads effect.ok, which the step does not state`,
    ],
    [
      "a step leaving out an effect field a reading reads",
      { [`${G}/guard.yaml`]: GUARD.replace(", effect: { ok: false }", "") },
      `${G}/guard.yaml: example entitlements-5, step 2: reading a reads effect.ok, which the step does not state`,
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

  it("lets a step leave out an effect field where no rule applies", () => {
    const guardFile = GUARD.replace(
      "      - { event: grant, params: { who: ann } }\n      - { event: use, params: { who: ann }, effect: { ok: true } }\n",
      "      - { event: use, params: { who: bob } }\n      - { event: grant, params: { who: ann } }\n      - { event: use, params: { who: ann }, effect: { ok: true } }\n",
    );
    withProject({ "guards/entitlements-3/guard.yaml": guardFile }, (root) => {
      assert.equal(loadGuard(root, "entitlements-3").examples[0].steps.length, 3);
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
      assert.deepEqual(Object.keys(binding.events), ["grant", "revoke", "use"]);
      assert.deepEqual(binding.events.use.effect, { ok: parseType("bool", binding.vocabulary) });
      assert.deepEqual(Object.keys(inputs), binding.folderFiles.map((path) => `file ${path}`));
      assert.equal(inputs["file guards/bindings/ents/binding.yaml"], digest(BINDING));
    });
  });
});
