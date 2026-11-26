// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: loading a reading, one reading's verdict on
 * a step, an example walked against a reading, and a sequence walked
 * through several readings.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Unstated,
  before,
  checkExample,
  checkExamples,
  forbids,
  judge,
  move,
  parseReading,
  reads,
  startState,
  walkSequence,
  type Reading,
} from "./reading.js";
import {
  GuardError,
  parseType,
  vocabulary,
  type Call,
  type Declaration,
  type Example,
  type Fields,
} from "./types.js";

const VOCAB = vocabulary({ package: ["acme/kit", "mid/kit", "zeta/kit"] });
const DECLARED: Declaration = {
  vocabulary: VOCAB,
  events: {
    install: {
      params: { selected: parseType("set of package", VOCAB), providing: parseType("set of package", VOCAB) },
      effect: { placed: parseType("package?", VOCAB), blocked: parseType("set of package", VOCAB) },
    },
    forget: { params: {}, effect: {} },
    add: { params: { by: parseType("int 0..5", VOCAB) }, effect: { total: parseType("int 0..100", VOCAB) } },
  },
};

const STANDING = `format: 1
state:
  standing: { type: package?, start: null }
events:
  install:
    then:
      standing: "effect.placed"
  forget:
    legal: "standing != none"
    then:
      standing: "none"
assertion:
  - on: install
    when: "standing != none and standing in selected and standing in providing"
    shall: "effect.placed == standing"
`;

/** Tracks the same thing as a set, and finds forget always legal. */
const HELD = `format: 1
state:
  held: { type: set of package, start: [] }
events:
  install:
    then:
      held: "{p in package: p == effect.placed}"
  forget:
    then:
      held: "{}"
assertion:
  - on: install
    when: "size(held intersect selected intersect providing) > 0"
    shall: "effect.placed in held"
`;

/** Its rule never applies. */
const NEVER = `format: 1
assertion:
  - on: install
    when: "false"
    shall: "false"
`;

/** Forbids every install that places nothing. */
const PLACES = `format: 1
assertion:
  - on: install
    shall: "effect.placed != none"
`;

const COUNT = `format: 1
state:
  count: { type: int 0..3, start: 0 }
events:
  add:
    legal: "by > 0"
    then:
      count: "count + by"
assertion:
  - on: add
    shall: "effect.total >= count"
`;

function reading(text: string, name = "standing"): Reading {
  return parseReading(text, name, `guards/g-1/readings/${name}.yaml`, DECLARED);
}

function failure(work: () => unknown): GuardError {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

const install = (selected: string[], providing: string[] = selected): Call => ({
  event: "install",
  params: { selected, providing },
});
const FORGET: Call = { event: "forget", params: {} };
const placed = (pkg: string | null, blocked: string[] = []): Fields => ({ placed: pkg, blocked });

describe("guards-6: reading: loading", () => {
  it("loads state, events and rules, with every declared event present", () => {
    const loaded = reading(STANDING);
    assert.equal(loaded.name, "standing");
    assert.equal(loaded.file, "guards/g-1/readings/standing.yaml");
    assert.deepEqual(loaded.state, [{ name: "standing", type: parseType("package?", VOCAB), start: null }]);
    assert.deepEqual(Object.keys(loaded.events), ["install", "forget", "add"]);
    assert.equal(loaded.events.install.legal.source, "true");
    assert.equal(loaded.events.forget.legal.source, "standing != none");
    assert.deepEqual(loaded.events.install.reads, ["placed"]);
    assert.deepEqual(loaded.events.add.then, []);
    assert.equal(loaded.rules.length, 1);
    assert.deepEqual(loaded.rules[0].on, ["install"]);
    assert.equal(loaded.rules[0].shall, "effect.placed == standing");
    assert.deepEqual(startState(loaded), { standing: null });
  });

  it("takes a reading with no state, and bare true and false for conditions", () => {
    const loaded = reading("format: 1\nevents:\n  forget: { legal: false }\nassertion:\n  - { on: forget, shall: true }\n", "bare");
    assert.deepEqual(loaded.state, []);
    assert.equal(loaded.events.forget.legal.source, "false");
    assert.equal(loaded.rules[0].when, "true");
    assert.deepEqual(startState(loaded), {});
  });

  it("checks a rule on several events against each event's params", () => {
    const loaded = reading(
      "format: 1\nassertion:\n  - on: [install, forget]\n    shall: \"true\"\n",
      "both",
    );
    assert.deepEqual(Object.keys(loaded.rules[0].checks), ["install", "forget"]);
    assert.equal(
      failure(() =>
        reading("format: 1\nassertion:\n  - on: [install, forget]\n    when: \"size(selected) > 0\"\n    shall: \"true\"\n"),
      ).message,
      `guards/g-1/readings/standing.yaml: rule 1: when on forget: unknown name 'selected' in "size(selected) > 0"`,
    );
  });

  const FILE = "guards/g-1/readings/standing.yaml";
  const RULE = "assertion:\n  - { on: forget, shall: \"true\" }\n";
  const cases: [string, string, string][] = [
    ["YAML that does not parse", "format: [1\n", `${FILE}: not readable as YAML — `],
    ["an unknown key", `format: 1\nnotes: x\n${RULE}`, `${FILE}: unknown key 'notes'`],
    ["another format", `format: 2\n${RULE}`, `${FILE}: format must be 1`],
    ["no format", RULE, `${FILE}: format must be 1`],
    ["no assertion", "format: 1\n", `${FILE}: assertion must be a list of one or more rules`],
    ["an empty assertion", "format: 1\nassertion: []\n", `${FILE}: assertion must be a list of one or more rules`],
    [
      "a state variable named as a param",
      `format: 1\nstate:\n  selected: { type: bool, start: true }\n${RULE}`,
      `${FILE}: state selected: this is also a param of event install; pick another`,
    ],
    [
      "a state variable named as a values set",
      `format: 1\nstate:\n  package: { type: bool, start: true }\n${RULE}`,
      `${FILE}: state package: this is also a values name; pick another`,
    ],
    [
      "a state variable named by a word",
      `format: 1\nstate:\n  size: { type: bool, start: true }\n${RULE}`,
      `${FILE}: state size: 'size' is a word of the condition language`,
    ],
    ["a state variable with no type", `format: 1\nstate:\n  x: { start: 1 }\n${RULE}`, `${FILE}: state x: no type`],
    ["a state variable with no start", `format: 1\nstate:\n  x: { type: bool }\n${RULE}`, `${FILE}: state x: no start`],
    [
      "a state variable with an unknown key",
      `format: 1\nstate:\n  x: { type: bool, start: true, note: hi }\n${RULE}`,
      `${FILE}: state x: unknown key 'note'`,
    ],
    [
      "an unknown type",
      `format: 1\nstate:\n  x: { type: text, start: a }\n${RULE}`,
      `${FILE}: state x: 'text' is not a type or a values name in type "text"`,
    ],
    [
      "a start outside its type",
      `format: 1\nstate:\n  x: { type: int 0..3, start: 4 }\n${RULE}`,
      `${FILE}: state x: start: expected int 0..3, found 4`,
    ],
    [
      "a start written as a condition",
      `format: 1\nstate:\n  x: { type: package?, start: none }\n${RULE}`,
      `${FILE}: state x: start: expected package?, found "none"`,
    ],
    ["state that is no mapping", `format: 1\nstate: [x]\n${RULE}`, `${FILE}: state: expected a mapping, found ["x"]`],
    [
      "an event the binding does not declare",
      `format: 1\nevents:\n  remove: {}\n${RULE}`,
      `${FILE}: event remove: the binding declares no such event`,
    ],
    [
      "an unknown key in an event",
      `format: 1\nevents:\n  forget: { when: "true" }\n${RULE}`,
      `${FILE}: event forget: unknown key 'when'`,
    ],
    [
      "legal that is not bool",
      `format: 1\nevents:\n  add: { legal: "by + 1" }\n${RULE}`,
      `${FILE}: event add: legal: must be bool, found int in "by + 1"`,
    ],
    [
      "legal that reads the effect",
      `format: 1\nevents:\n  add: { legal: "effect.total > 0" }\n${RULE}`,
      `${FILE}: event add: legal: effect.total cannot be read here, before the event happens in "effect.total > 0"`,
    ],
    [
      "legal that reads another event's param",
      `format: 1\nevents:\n  forget: { legal: "by > 0" }\n${RULE}`,
      `${FILE}: event forget: legal: unknown name 'by' in "by > 0"`,
    ],
    [
      "then for what is no state variable",
      `format: 1\nevents:\n  add: { then: { total: "1" } }\n${RULE}`,
      `${FILE}: event add: then total: not a state variable`,
    ],
    [
      "then of the wrong type",
      `format: 1\nstate:\n  x: { type: int 0..3, start: 0 }\nevents:\n  install: { then: { x: "effect.placed" } }\n${RULE}`,
      `${FILE}: event install: then x: must be int 0..3, found package? in "effect.placed"`,
    ],
    [
      "then that is not text",
      `format: 1\nstate:\n  x: { type: package?, start: null }\nevents:\n  install: { then: { x: null } }\n${RULE}`,
      `${FILE}: event install: then x: write the condition as text ('none' for the missing value), found nothing`,
    ],
    [
      "a rule with an unknown key",
      "format: 1\nassertion:\n  - { on: forget, shall: \"true\", while: \"true\" }\n",
      `${FILE}: rule 1: unknown key 'while'`,
    ],
    ["a rule with no on", "format: 1\nassertion:\n  - { shall: \"true\" }\n", `${FILE}: rule 1: on must be an event name or a list of event names`],
    ["a rule on no event", "format: 1\nassertion:\n  - { on: [], shall: \"true\" }\n", `${FILE}: rule 1: on must be an event name or a list of event names`],
    ["a rule on an unknown event", "format: 1\nassertion:\n  - { on: remove, shall: \"true\" }\n", `${FILE}: rule 1: on: the binding declares no event remove`],
    ["a rule on an event twice", "format: 1\nassertion:\n  - { on: [forget, forget], shall: \"true\" }\n", `${FILE}: rule 1: on names an event twice`],
    ["a rule with no shall", "format: 1\nassertion:\n  - { on: forget }\n", `${FILE}: rule 1: no shall`],
    [
      "when that reads the effect",
      "format: 1\nassertion:\n  - { on: add, when: \"effect.total > 0\", shall: \"true\" }\n",
      `${FILE}: rule 1: when: effect.total cannot be read here, before the event happens in "effect.total > 0"`,
    ],
    [
      "shall that is not bool",
      "format: 1\nassertion:\n  - { on: forget, shall: \"true\" }\n  - { on: add, shall: \"effect.total\" }\n",
      `${FILE}: rule 2: shall: must be bool, found int in "effect.total"`,
    ],
    ["a rule that is no mapping", "format: 1\nassertion:\n  - forget\n", `${FILE}: rule 1: expected a mapping, found "forget"`],
  ];
  for (const [name, text, expected] of cases) {
    it(`refuses ${name}`, () => {
      const error = failure(() => reading(text));
      if (expected.endsWith("— ")) assert.ok(error.message.startsWith(expected), error.message);
      else assert.equal(error.message, expected);
    });
  }
});

describe("guards-7: reading: one step", () => {
  const standing = reading(STANDING);

  it("finds an event legal or not from the state and params", () => {
    assert.deepEqual(before(standing, { standing: null }, FORGET), { legal: false, applying: [] });
    assert.deepEqual(before(standing, { standing: "mid/kit" }, FORGET), { legal: true, applying: [] });
    assert.deepEqual(before(standing, { standing: null }, install(["zeta/kit"])), { legal: true, applying: [] });
  });

  it("finds a rule applying only when its when holds", () => {
    const state = { standing: "zeta/kit" };
    assert.deepEqual(before(standing, state, install(["acme/kit", "zeta/kit"])).applying, [0]);
    assert.deepEqual(before(standing, state, install(["acme/kit"])).applying, []);
    assert.deepEqual(before(standing, state, install(["zeta/kit"], ["acme/kit"])).applying, []);
  });

  it("forbids an effect that breaks an applying rule, and moves the state by the observed effect", () => {
    const state = { standing: "zeta/kit" };
    const call = install(["acme/kit", "zeta/kit"]);
    assert.deepEqual(judge(standing, state, call, placed("acme/kit", ["zeta/kit"])), {
      legal: true,
      applying: [0],
      applies: true,
      forbidden: true,
      broken: [0],
      next: { standing: "acme/kit" },
    });
    assert.deepEqual(judge(standing, state, call, placed("zeta/kit", ["acme/kit"])), {
      legal: true,
      applying: [0],
      applies: true,
      forbidden: false,
      broken: [],
      next: { standing: "zeta/kit" },
    });
    assert.deepEqual(state, { standing: "zeta/kit" }, "the state before is left as it was");
  });

  it("never forbids where no rule applies", () => {
    const judged = judge(standing, { standing: null }, install(["zeta/kit"]), placed("zeta/kit"));
    assert.equal(judged.applies, false);
    assert.equal(judged.forbidden, false);
    assert.deepEqual(judged.next, { standing: "zeta/kit" });
  });

  it("keeps a variable an event does not name, and reads the state before for every change", () => {
    const swap = reading(
      "format: 1\nstate:\n  a: { type: int 0..9, start: 1 }\n  b: { type: int 0..9, start: 2 }\n  c: { type: bool, start: true }\n" +
        "events:\n  forget:\n    then: { a: \"b\", b: \"a\" }\nassertion:\n  - { on: forget, shall: \"true\" }\n",
      "swap",
    );
    assert.deepEqual(judge(swap, startState(swap), FORGET, {}).next, { a: 2, b: 1, c: true });
  });

  it("lists the effect fields a step reads: then, and shall of the applying rules", () => {
    const two = reading(
      "format: 1\nassertion:\n  - on: install\n    when: \"size(selected) > 1\"\n    shall: \"size(effect.blocked) > 0\"\n",
      "two",
    );
    assert.deepEqual(reads(two, install(["zeta/kit"]), []), []);
    assert.deepEqual(reads(two, install(["acme/kit", "zeta/kit"]), [0]), ["blocked"]);
    assert.deepEqual(reads(standing, install(["zeta/kit"]), []), ["placed"]);
    assert.deepEqual(reads(standing, install(["zeta/kit"]), [], false), [], "then is not read where the state does not move");
    assert.deepEqual(reads(two, install(["acme/kit", "zeta/kit"]), [0], false), ["blocked"]);
  });

  it("finds an effect forbidden without working out the next state", () => {
    const count = reading(COUNT, "count");
    const call: Call = { event: "add", params: { by: 2 } };
    // The next state would be 4, outside int 0..3.
    assert.deepEqual(forbids(count, { count: 2 }, call, { total: 1 }, [0]), { forbidden: true, broken: [0] });
    assert.deepEqual(forbids(count, { count: 2 }, call, { total: 2 }, [0]), { forbidden: false, broken: [] });
    assert.deepEqual(move(count, { count: 0 }, call, { total: 2 }), { count: 2 });
    assert.equal(failure(() => move(count, { count: 2 }, call, { total: 1 })).kind, "reading");
  });

  it("reports a new state value outside its declared type as a reading error", () => {
    const count = reading(COUNT, "count");
    const call: Call = { event: "add", params: { by: 2 } };
    const first = judge(count, startState(count), call, { total: 2 });
    assert.deepEqual(first.next, { count: 2 });
    const error = failure(() => judge(count, first.next, call, { total: 4 }));
    assert.equal(error.kind, "reading");
    assert.equal(error.message, "reading count: after add, count would be 4, outside int 0..3");
  });

  it("reports a number beyond the safe range as a reading error", () => {
    const big = reading(
      "format: 1\nstate:\n  big: { type: int 0..9007199254740991, start: 9007199254740991 }\n" +
        "events:\n  add: { legal: \"big + by > 0\" }\nassertion:\n  - { on: add, shall: \"effect.total * big >= 0\" }\n",
      "big",
    );
    const error = failure(() => before(big, startState(big), { event: "add", params: { by: 1 } }));
    assert.equal(error.kind, "reading");
    assert.equal(error.message, `reading big: a number went beyond the safe range in "big + by > 0"`);
    const later = failure(() => forbids(big, startState(big), { event: "add", params: { by: 0 } }, { total: 2 }, [0]));
    assert.equal(later.message, `reading big: a number went beyond the safe range in "effect.total * big >= 0"`);
  });

  it("refuses an event the binding does not declare", () => {
    assert.equal(
      failure(() => before(standing, { standing: null }, { event: "remove", params: {} })).message,
      "reading standing: the binding declares no event remove",
    );
  });
});

describe("guards-20: reading: an example against a reading", () => {
  const standing = reading(STANDING);
  const example = (kind: Example["kind"], steps: [Call, Fields][], item = "ex-1"): Example => ({
    item,
    kind,
    steps: steps.map(([call, effect]) => ({ ...call, effect })),
  });
  const BOTH = install(["acme/kit", "zeta/kit"]);
  const ZETA = install(["zeta/kit"]);

  it("finds a permitted example as stated, and that it shows the behavior", () => {
    const check = checkExample(
      standing,
      example("permitted", [
        [ZETA, placed("zeta/kit")],
        [BOTH, placed("zeta/kit", ["acme/kit"])],
      ]),
    );
    assert.deepEqual(check, {
      example: "ex-1",
      kind: "permitted",
      reading: "standing",
      steps: [
        { legal: true, applies: false, forbidden: false },
        { legal: true, applies: true, forbidden: false },
      ],
      failures: [],
      shows: true,
    });
  });

  it("finds a permitted example with a forbidden step", () => {
    const check = checkExample(
      standing,
      example("permitted", [
        [ZETA, placed("zeta/kit")],
        [BOTH, placed("acme/kit", ["zeta/kit"])],
      ]),
    );
    assert.deepEqual(check.failures, [
      { example: "ex-1", reading: "standing", step: 2, found: "step 2 is forbidden" },
    ]);
  });

  it("finds a forbidden example as stated", () => {
    const check = checkExample(
      standing,
      example("forbidden", [
        [ZETA, placed("zeta/kit")],
        [BOTH, placed("acme/kit", ["zeta/kit"])],
      ]),
    );
    assert.deepEqual(check.failures, []);
    assert.deepEqual(check.steps[1], { legal: true, applies: true, forbidden: true });
  });

  it("finds a forbidden example whose last step is not forbidden", () => {
    const check = checkExample(
      standing,
      example("forbidden", [
        [ZETA, placed("zeta/kit")],
        [BOTH, placed("zeta/kit", ["acme/kit"])],
      ]),
    );
    assert.deepEqual(check.failures, [
      { example: "ex-1", reading: "standing", step: 2, found: "the last step is not forbidden" },
    ]);
  });

  it("finds a forbidden example with a step forbidden before the last", () => {
    const check = checkExample(
      standing,
      example("forbidden", [
        [ZETA, placed("zeta/kit")],
        [BOTH, placed("acme/kit", ["zeta/kit"])],
        [BOTH, placed("zeta/kit", ["acme/kit"])],
      ]),
    );
    assert.deepEqual(check.failures, [
      { example: "ex-1", reading: "standing", step: 2, found: "step 2 is forbidden before the last step" },
    ]);
    assert.equal(check.steps.length, 3);
  });

  it("stops at a step that is not legal", () => {
    for (const kind of ["permitted", "forbidden"] as const) {
      const check = checkExample(
        standing,
        example(kind, [
          [FORGET, {}],
          [ZETA, placed("zeta/kit")],
        ]),
      );
      assert.deepEqual(check.failures, [
        { example: "ex-1", reading: "standing", step: 1, found: "step 1 is not legal" },
      ]);
      assert.deepEqual(check.steps, [{ legal: false, applies: false, forbidden: false }]);
    }
  });

  it("lists a reading error as what was found, and stops", () => {
    const count = reading(COUNT, "count");
    const add: Call = { event: "add", params: { by: 2 } };
    const check = checkExample(
      count,
      example("permitted", [
        [add, { total: 2 }],
        [add, { total: 4 }],
        [add, { total: 6 }],
      ]),
    );
    assert.deepEqual(check.failures, [
      {
        example: "ex-1",
        reading: "count",
        step: 2,
        found: "step 2: after add, count would be 4, outside int 0..3",
      },
    ]);
    assert.deepEqual(check.steps, [
      { legal: true, applies: true, forbidden: false },
      { legal: true, applies: true, forbidden: false },
    ]);
  });

  it("names the reading once in a reading error's failure", () => {
    const count = reading(COUNT, "count");
    const add: Call = { event: "add", params: { by: 2 } };
    const [failed] = checkExample(count, example("permitted", [[add, { total: 2 }], [add, { total: 4 }], [add, { total: 6 }]])).failures;
    assert.ok(!failed.found.includes("reading count"), failed.found);
    assert.equal(failed.reading, "count");
  });

  it("reads no next state after the last step, so a forbidden last step is as stated whatever would follow", () => {
    const count = reading(COUNT, "count");
    const add: Call = { event: "add", params: { by: 2 } };
    // After the second add the count would be 4, outside int 0..3.
    const forbidden = checkExample(count, example("forbidden", [[add, { total: 2 }], [add, { total: 1 }]]));
    assert.deepEqual(forbidden.failures, []);
    assert.deepEqual(forbidden.steps[1], { legal: true, applies: true, forbidden: true });
    const permitted = checkExample(count, example("permitted", [[add, { total: 2 }], [add, { total: 4 }]]));
    assert.deepEqual(permitted.failures, []);
  });

  it("finds a step forbidden before its next state gives a reading error", () => {
    const count = reading(COUNT, "count");
    const add: Call = { event: "add", params: { by: 2 } };
    const check = checkExample(count, example("permitted", [[add, { total: 2 }], [add, { total: 1 }], [add, { total: 9 }]]));
    assert.deepEqual(check.failures.map((failure) => failure.found), [
      "step 2 is forbidden",
      "step 2: after add, count would be 4, outside int 0..3",
    ]);
  });

  it("lets a step leave out an effect field no reading reads", () => {
    const check = checkExample(standing, example("permitted", [[ZETA, { placed: "zeta/kit" }]]));
    assert.deepEqual(check.failures, []);
  });

  it("refuses a step that leaves out an effect field the reading reads", () => {
    const error = failure(() =>
      checkExample(standing, example("permitted", [[ZETA, { blocked: [] }], [ZETA, placed("zeta/kit")]])),
    );
    assert.ok(error instanceof Unstated);
    assert.equal(error.kind, "files");
    assert.equal(
      error.message,
      "example ex-1, step 1: reading standing reads effect.placed, which the step does not state",
    );
    assert.deepEqual([error.example, error.step, error.fields], ["ex-1", 1, ["placed"]]);
  });

  it("names every field a step leaves out, and asks for none only then reads at the last step", () => {
    const both = reading(
      "format: 1\nstate:\n  standing: { type: package?, start: null }\nevents:\n  install:\n    then:\n      standing: \"effect.placed\"\n" +
        "assertion:\n  - on: install\n    shall: \"size(effect.blocked) == 0\"\n",
      "both",
    );
    assert.equal(
      failure(() => checkExample(both, example("permitted", [[ZETA, {}], [ZETA, placed("zeta/kit")]]))).message,
      "example ex-1, step 1: reading both reads effect.blocked and effect.placed, which the step does not state",
    );
    // The last step moves no state, so only its rule's field is read.
    assert.deepEqual(checkExample(both, example("permitted", [[ZETA, { blocked: [] }]])).failures, []);
    assert.equal(
      failure(() => checkExample(both, example("permitted", [[ZETA, { placed: "zeta/kit" }]]))).message,
      "example ex-1, step 1: reading both reads effect.blocked, which the step does not state",
    );
  });

  it("asks for a field only shall reads just where its rule applies", () => {
    const two = reading(
      "format: 1\nassertion:\n  - on: install\n    when: \"size(selected) > 1\"\n    shall: \"size(effect.blocked) > 0\"\n",
      "two",
    );
    assert.deepEqual(checkExample(two, example("permitted", [[ZETA, {}]])).failures, []);
    assert.equal(
      failure(() => checkExample(two, example("permitted", [[ZETA, {}], [BOTH, { placed: "zeta/kit" }]]))).message,
      "example ex-1, step 2: reading two reads effect.blocked, which the step does not state",
    );
  });

  it("checks every example against every reading and says which show the behavior", () => {
    const held = reading(HELD, "held");
    const never = reading(NEVER, "never");
    const shown = example("permitted", [[ZETA, placed("zeta/kit")], [BOTH, placed("zeta/kit", ["acme/kit"])]], "ex-1");
    const plain = example("permitted", [[ZETA, placed("zeta/kit")]], "ex-2");
    const bad = example("forbidden", [[ZETA, placed("zeta/kit")], [BOTH, placed("acme/kit", ["zeta/kit"])]], "ex-3");

    const agreed = checkExamples([standing, held], [shown, plain, bad]);
    assert.deepEqual(agreed.checks.map((check) => `${check.example}/${check.reading}`), [
      "ex-1/standing", "ex-1/held", "ex-2/standing", "ex-2/held", "ex-3/standing", "ex-3/held",
    ]);
    assert.deepEqual(agreed.failures, []);
    assert.deepEqual(agreed.shows, ["ex-1"]);

    const split = checkExamples([standing, never], [shown, bad]);
    assert.deepEqual(split.shows, []);
    assert.deepEqual(split.failures, [
      { example: "ex-3", reading: "never", step: 2, found: "the last step is not forbidden" },
      {
        example: null,
        reading: null,
        step: null,
        found: "no permitted example has a step at which the assertion applies under every reading",
      },
    ]);

    assert.deepEqual(checkExamples([standing], [bad]).shows, [], "a forbidden example does not count as showing it");
  });
});

describe("guards-22: reading: a sequence through every reading", () => {
  const standing = reading(STANDING);
  const held = reading(HELD, "held");
  const never = reading(NEVER, "never");
  const places = reading(PLACES, "places");

  /** Code under test, in two forms: the standing copy keeps its path,
   * or the first package by name takes it. */
  function code(kind: "right" | "first-by-name") {
    let standingNow: string | null = null;
    const calls: [string, number][] = [];
    const cause = (call: Call, index: number): Fields => {
      calls.push([call.event, index]);
      if (call.event === "forget") {
        standingNow = null;
        return {};
      }
      const selected = call.params.selected as string[];
      const providing = call.params.providing as string[];
      const able = selected.filter((p) => providing.includes(p));
      const keeps = kind === "right" && standingNow !== null && able.includes(standingNow);
      const winner = keeps ? standingNow : (able[0] ?? null);
      standingNow = winner;
      return { placed: winner, blocked: able.filter((p) => p !== winner) };
    };
    return { cause, calls };
  }

  const ZETA = install(["zeta/kit"]);
  const BOTH = install(["acme/kit", "zeta/kit"]);

  it("causes every event all readings find legal and judges each step", async () => {
    const { cause, calls } = code("right");
    const walk = await walkSequence([standing, held], [ZETA, BOTH, FORGET, BOTH], cause);
    assert.deepEqual(calls, [["install", 0], ["install", 1], ["forget", 2], ["install", 3]]);
    assert.equal(walk.violation, null);
    assert.deepEqual(walk.undecided, []);
    assert.equal(walk.stopped, null);
    assert.equal(walk.applied, true);
    assert.deepEqual(walk.steps.map((step) => [step.legal, step.caused, step.applies, step.forbidden]), [
      ["all", true, "none", "none"],
      ["all", true, "all", "none"],
      ["all", true, "none", "none"],
      ["all", true, "none", "none"],
    ]);
    assert.deepEqual(walk.steps[1].effect, { placed: "zeta/kit", blocked: ["acme/kit"] });
    assert.deepEqual(walk.steps[1].call, BOTH);
    assert.deepEqual(walk.steps[1].readings, [
      { legal: true, applies: true, forbidden: false },
      { legal: true, applies: true, forbidden: false },
    ]);
  });

  it("ends at the step every reading forbids", async () => {
    const { cause, calls } = code("first-by-name");
    const walk = await walkSequence([standing, held], [ZETA, BOTH, ZETA, BOTH], cause);
    assert.equal(walk.violation, 1);
    assert.equal(walk.steps.length, 2);
    assert.deepEqual(calls, [["install", 0], ["install", 1]]);
    assert.equal(walk.steps[1].forbidden, "all");
    assert.deepEqual(walk.steps[1].effect, { placed: "acme/kit", blocked: ["zeta/kit"] });
    assert.deepEqual(walk.undecided, []);
  });

  it("skips an event no reading finds legal, and goes on", async () => {
    const { cause, calls } = code("right");
    const walk = await walkSequence([standing], [FORGET, ZETA, FORGET], cause);
    assert.deepEqual(calls, [["install", 1], ["forget", 2]]);
    assert.deepEqual(walk.steps.map((step) => [step.legal, step.caused]), [
      ["none", false],
      ["all", true],
      ["all", true],
    ]);
    assert.deepEqual(walk.steps[0], {
      call: FORGET,
      legal: "none",
      caused: false,
      effect: null,
      applies: null,
      forbidden: null,
      readings: [{ legal: false, applies: false, forbidden: false }],
    });
    assert.deepEqual(walk.undecided, []);
    assert.equal(walk.applied, false);
  });

  it("does not cause an event the readings split on, names it, and goes on", async () => {
    const { cause, calls } = code("right");
    const walk = await walkSequence([standing, held], [FORGET, ZETA], cause);
    assert.deepEqual(calls, [["install", 1]]);
    assert.deepEqual(walk.undecided, [0]);
    assert.equal(walk.steps[0].legal, "split");
    assert.equal(walk.steps[0].caused, false);
    assert.deepEqual(walk.steps[0].readings.map((verdict) => verdict.legal), [false, true]);
    assert.equal(walk.steps[1].caused, true);
    assert.equal(walk.violation, null);
  });

  it("names a step the readings split on as applying, and goes on", async () => {
    const { cause } = code("right");
    const walk = await walkSequence([standing, never], [ZETA, BOTH, install(["acme/kit"])], cause);
    assert.deepEqual(walk.undecided, [1]);
    assert.equal(walk.steps[1].applies, "split");
    assert.equal(walk.steps[1].forbidden, "none");
    assert.equal(walk.steps.length, 3);
    assert.equal(walk.applied, false, "one reading never applied");
  });

  it("names a step the readings split on as forbidden, and no violation", async () => {
    const { cause } = code("first-by-name");
    const walk = await walkSequence([standing, never], [ZETA, BOTH, ZETA], cause);
    assert.equal(walk.violation, null);
    assert.deepEqual(walk.undecided, [1]);
    assert.equal(walk.steps[1].forbidden, "split");
    assert.deepEqual(walk.steps[1].readings, [
      { legal: true, applies: true, forbidden: true },
      { legal: true, applies: false, forbidden: false },
    ]);
    assert.equal(walk.steps.length, 3);
  });

  it("finds a violation where rules differ but every reading forbids", async () => {
    const { cause } = code("right");
    const walk = await walkSequence([places], [install(["zeta/kit"], [])], cause);
    assert.equal(walk.violation, 0);
    assert.equal(walk.applied, true);
  });

  it("causes every event of an example run on the code, legal or not", async () => {
    const { cause, calls } = code("right");
    const walk = await walkSequence([standing, held], [FORGET, ZETA], cause, { example: true });
    assert.deepEqual(calls, [["forget", 0], ["install", 1]]);
    assert.equal(walk.steps[0].caused, true);
    assert.equal(walk.steps[0].legal, "split");
    assert.deepEqual(walk.steps[0].effect, {});
    assert.deepEqual(walk.undecided, [0]);

    const alone = await walkSequence([standing], [FORGET], code("right").cause, { example: true });
    assert.equal(alone.steps[0].legal, "none");
    assert.equal(alone.steps[0].caused, true);
    assert.deepEqual(alone.undecided, []);
  });

  it("takes an effect that comes later", async () => {
    const { cause } = code("right");
    const walk = await walkSequence([standing], [ZETA, BOTH], async (call, index) => {
      await new Promise((resolve) => setImmediate(resolve));
      return cause(call, index);
    });
    assert.equal(walk.applied, true);
    assert.equal(walk.steps.length, 2);
  });

  it("stops at a reading error and says where", async () => {
    const count = reading(COUNT, "count");
    const add: Call = { event: "add", params: { by: 2 } };
    let total = 0;
    const walk = await walkSequence([count, never], [add, add, add], (call) => {
      total += call.params.by as number;
      return { total };
    });
    assert.deepEqual(walk.stopped, { at: 1, cause: "reading count: after add, count would be 4, outside int 0..3" });
    assert.equal(walk.steps.length, 2);
    assert.deepEqual(walk.steps[1].effect, { total: 4 });
    assert.equal(walk.steps[1].forbidden, "none", "the step was judged before its next state was read");
    assert.equal(walk.violation, null);
    assert.equal(total, 4, "the third event was not caused");
  });

  it("finds the step every reading forbids though a reading's next state would leave its range", async () => {
    const add: Call = { event: "add", params: { by: 2 } };
    // The second add is forbidden (1 is less than the count, 2), and
    // after it the count would be 4, outside int 0..3.
    const totals = [2, 1, 9];
    const walk = await walkSequence([reading(COUNT, "count"), reading(COUNT, "again")], [add, add, add], (_call, index) => ({
      total: totals[index],
    }));
    assert.equal(walk.violation, 1);
    assert.equal(walk.stopped, null, "no next state is read after a violation");
    assert.equal(walk.steps.length, 2);
    assert.equal(walk.steps[1].forbidden, "all");
  });

  it("reads no next state after the last step of an example run on the code", async () => {
    const add: Call = { event: "add", params: { by: 2 } };
    const cause = (_call: Call, index: number): Fields => ({ total: [2, 4][index] });
    const example = await walkSequence([reading(COUNT, "count")], [add, add], cause, { example: true });
    assert.equal(example.stopped, null);
    assert.equal(example.steps.length, 2);
    const sampled = await walkSequence([reading(COUNT, "count")], [add, add], cause);
    assert.deepEqual(sampled.stopped, { at: 1, cause: "reading count: after add, count would be 4, outside int 0..3" });
  });

  it("passes on an error from whatever causes the events", async () => {
    const thrown = new Error("the binding failed");
    await assert.rejects(
      walkSequence([standing], [ZETA], () => {
        throw thrown;
      }),
      (error) => error === thrown,
    );
  });

  it("needs at least one reading, and walks an empty sequence to nothing", async () => {
    await assert.rejects(walkSequence([], [ZETA], code("right").cause), /a sequence needs at least one reading/);
    assert.deepEqual(await walkSequence([standing], [], code("right").cause), {
      steps: [],
      violation: null,
      undecided: [],
      applied: false,
      stopped: null,
    });
  });
});
