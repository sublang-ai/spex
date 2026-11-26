// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: the small language a reading's conditions
 * are written in. It is closed (no loops, definitions, input or
 * output) and total: every condition is type-checked when its file
 * loads, so working one out cannot fail on types, and the only thing
 * that can go wrong later is a number leaving the safe range.
 *
 *   expr    := implies
 *   implies := or ['implies' implies]
 *   or      := and {'or' and}
 *   and     := not {'and' not}
 *   not     := 'not' not | compare
 *   compare := member [('==' | '!=' | '<' | '<=' | '>' | '>=') member]
 *   member  := sets ['in' sets]
 *   sets    := meet {('union' | 'minus') meet}
 *   meet    := sum {'intersect' sum}
 *   sum     := product {('+' | '-') product}
 *   product := unary {'*' unary}
 *   unary   := '-' unary | index
 *   index   := primary {'[' expr ']'}
 *   primary := 'true' | 'false' | 'none' | int | 'value' | name
 *            | 'effect' '.' name | '(' expr ')'
 *            | ('size' | 'min' | 'max') '(' expr ')'
 *            | 'default' '(' expr ',' expr ')'
 *            | '{' '}' | '{' expr {',' expr} '}'
 *            | '{' name 'in' sets ':' expr '}'
 *            | 'if' expr 'then' expr 'else' expr
 *            | ('all' | 'any') name 'in' sets ':' expr
 *            | 'map' name 'in' name ':' expr
 *
 * `if`, `all`, `any` and `map` reach as far right as they can.
 */

import {
  GuardError,
  WORDS,
  inOrder,
  isValuesSet,
  nameFault,
  sameValue,
  showType,
  type Fields,
  type Type,
  type Value,
  type Vocabulary,
} from "./types.js";

// ---------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------

type Token =
  | { t: "int"; v: number; text: string }
  | { t: "value"; v: string; text: string }
  | { t: "name" | "word" | "sign" | "end"; text: string };

function tokens(source: string): Token[] {
  const out: Token[] = [];
  const re = /\s+|(\d+)|'([^']*)'|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<=|>=|[<>+\-*{}()[\],:.])/y;
  while (re.lastIndex < source.length) {
    const at = re.lastIndex;
    const match = re.exec(source);
    if (match === null) {
      throw new GuardError(
        source[at] === "'"
          ? `a quote mark is not closed in "${source}"`
          : `unexpected '${source[at]}' in "${source}"`,
      );
    }
    if (match[1] !== undefined) {
      const v = Number(match[1]);
      if (!Number.isSafeInteger(v)) {
        throw new GuardError(`the number ${match[1]} is beyond the safe range in "${source}"`);
      }
      out.push({ t: "int", v, text: match[1] });
    } else if (match[2] !== undefined) {
      out.push({ t: "value", v: match[2], text: `'${match[2]}'` });
    } else if (match[3] !== undefined) {
      out.push({ t: WORDS.has(match[3]) ? "word" : "name", text: match[3] });
    } else if (match[4] !== undefined) {
      out.push({ t: "sign", text: match[4] });
    }
  }
  out.push({ t: "end", text: "the end" });
  return out;
}

// ---------------------------------------------------------------
// Parser
// ---------------------------------------------------------------

type Node =
  | { n: "bool"; v: boolean }
  | { n: "int"; v: number }
  | { n: "none" }
  | { n: "value"; v: string }
  | { n: "name"; v: string }
  | { n: "effect"; f: string }
  | { n: "set"; items: Node[] }
  | { n: "not" | "neg"; e: Node }
  | { n: "bin"; op: string; l: Node; r: Node }
  | { n: "index"; m: Node; k: Node }
  | { n: "call"; f: "size" | "min" | "max"; e: Node }
  | { n: "default"; e: Node; d: Node }
  | { n: "if"; c: Node; a: Node; b: Node }
  | { n: "quant"; q: "all" | "any"; x: string; s: Node; e: Node }
  | { n: "filter"; x: string; s: Node; e: Node }
  | { n: "mapc"; x: string; set: string; e: Node };

const COMPARISONS = ["==", "!=", "<", "<=", ">", ">="];

function parse(source: string): Node {
  const toks = tokens(source);
  let at = 0;
  const bad = (cause: string): never => {
    throw new GuardError(`${cause} in "${source}"`);
  };
  const peek = (): Token => toks[at];
  /** The next token is this word or sign (never a quoted value). */
  const is = (text: string): boolean => {
    const token = toks[at];
    return (token.t === "word" || token.t === "sign") && token.text === text;
  };
  const take = (text: string): void => {
    if (!is(text)) bad(`expected '${text}' but found '${peek().text}'`);
    at += 1;
  };
  const name = (): string => {
    const token = peek();
    if (token.t !== "name") bad(`expected a name but found '${token.text}'`);
    at += 1;
    return token.text;
  };
  const left = (next: () => Node, ops: string[]) => (): Node => {
    let l = next();
    for (;;) {
      const op = ops.find(is);
      if (op === undefined) return l;
      at += 1;
      l = { n: "bin", op, l, r: next() };
    }
  };

  function primary(): Node {
    const token = toks[at];
    at += 1;
    if (token.t === "int") return { n: "int", v: token.v };
    if (token.t === "value") return { n: "value", v: token.v };
    if (token.t === "name") return { n: "name", v: token.text };
    if (token.t === "word") {
      switch (token.text) {
        case "true":
        case "false":
          return { n: "bool", v: token.text === "true" };
        case "none":
          return { n: "none" };
        case "effect":
          take(".");
          return { n: "effect", f: name() };
        case "size":
        case "min":
        case "max": {
          take("(");
          const e = expr();
          take(")");
          return { n: "call", f: token.text as "size" | "min" | "max", e };
        }
        case "default": {
          take("(");
          const e = expr();
          take(",");
          const d = expr();
          take(")");
          return { n: "default", e, d };
        }
        case "if": {
          const c = expr();
          take("then");
          const a = expr();
          take("else");
          return { n: "if", c, a, b: expr() };
        }
        case "all":
        case "any": {
          const x = name();
          take("in");
          const s = sets();
          take(":");
          return { n: "quant", q: token.text as "all" | "any", x, s, e: expr() };
        }
        case "map": {
          const x = name();
          take("in");
          const set = name();
          take(":");
          return { n: "mapc", x, set, e: expr() };
        }
      }
    }
    if (token.t === "sign" && token.text === "(") {
      const e = expr();
      take(")");
      return e;
    }
    if (token.t === "sign" && token.text === "{") {
      if (is("}")) {
        at += 1;
        return { n: "set", items: [] };
      }
      const after = toks[at + 1];
      if (peek().t === "name" && after.t === "word" && after.text === "in") {
        const x = name();
        at += 1;
        const s = sets();
        take(":");
        const e = expr();
        take("}");
        return { n: "filter", x, s, e };
      }
      const items = [expr()];
      while (is(",")) {
        at += 1;
        items.push(expr());
      }
      take("}");
      return { n: "set", items };
    }
    return bad(token.t === "end" ? "something is left out at the end" : `unexpected '${token.text}'`);
  }
  function index(): Node {
    let e = primary();
    while (is("[")) {
      at += 1;
      const k = expr();
      take("]");
      e = { n: "index", m: e, k };
    }
    return e;
  }
  function unary(): Node {
    if (is("-")) {
      at += 1;
      return { n: "neg", e: unary() };
    }
    return index();
  }
  const product = left(unary, ["*"]);
  const sum = left(product, ["+", "-"]);
  const meet = left(sum, ["intersect"]);
  const sets = left(meet, ["union", "minus"]);
  function member(): Node {
    const l = sets();
    if (!is("in")) return l;
    at += 1;
    return { n: "bin", op: "in", l, r: sets() };
  }
  function compare(): Node {
    const l = member();
    const op = COMPARISONS.find(is);
    if (op === undefined) return l;
    at += 1;
    const node: Node = { n: "bin", op, l, r: member() };
    if (COMPARISONS.some(is)) bad(`comparisons do not chain; use 'and' at '${peek().text}'`);
    return node;
  }
  function not(): Node {
    if (is("not")) {
      at += 1;
      return { n: "not", e: not() };
    }
    return compare();
  }
  const and = left(not, ["and"]);
  const or = left(and, ["or"]);
  function expr(): Node {
    const l = or();
    if (!is("implies")) return l;
    at += 1;
    return { n: "bin", op: "implies", l, r: expr() };
  }

  const root = expr();
  if (peek().t !== "end") bad(`unexpected '${peek().text}'`);
  return root;
}

// ---------------------------------------------------------------
// Types of conditions
// ---------------------------------------------------------------

/** The type the checker gives a condition. It keeps no int range
 * (ranges are checked on values); a set or optional `of: null` is the
 * empty set `{}` or `none`, which fit any set or optional type. */
export type ExprType =
  | { kind: "bool" }
  | { kind: "int" }
  | { kind: "value"; set: string }
  | { kind: "set"; of: ExprType | null }
  | { kind: "map"; key: string; to: ExprType }
  | { kind: "optional"; of: ExprType | null };

const BOOL: ExprType = { kind: "bool" };
const INT: ExprType = { kind: "int" };

/** A declared type as the checker sees it. */
export function exprType(type: Type): ExprType {
  switch (type.kind) {
    case "bool":
      return BOOL;
    case "int":
      return INT;
    case "value":
      return type;
    case "set":
      return { kind: "set", of: exprType(type.of) };
    case "map":
      return { kind: "map", key: type.key, to: exprType(type.to) };
    case "optional":
      return { kind: "optional", of: exprType(type.of) };
  }
}

/** A checker type in words for a message. */
export function showExprType(type: ExprType): string {
  switch (type.kind) {
    case "bool":
      return "bool";
    case "int":
      return "int";
    case "value":
      return type.set;
    case "set":
      return type.of === null ? "{}" : `set of ${showExprType(type.of)}`;
    case "map":
      return `map ${type.key} to ${showExprType(type.to)}`;
    case "optional":
      if (type.of === null) return "none";
      return type.of.kind === "map" ? `(${showExprType(type.of)})?` : `${showExprType(type.of)}?`;
  }
}

function optional(of: ExprType | null): ExprType {
  return of !== null && of.kind === "optional" ? of : { kind: "optional", of };
}

/** The smallest type both fit, or null when they do not go together. */
function join(a: ExprType, b: ExprType): ExprType | null {
  if (a.kind === "optional" || b.kind === "optional") {
    const left = a.kind === "optional" ? a.of : a;
    const right = b.kind === "optional" ? b.of : b;
    if (left === null) return optional(right);
    if (right === null) return optional(left);
    const inner = join(left, right);
    return inner === null ? null : optional(inner);
  }
  if (a.kind === "set" && b.kind === "set") {
    if (a.of === null) return b;
    if (b.of === null) return a;
    const inner = join(a.of, b.of);
    return inner === null ? null : { kind: "set", of: inner };
  }
  if (a.kind === "map" && b.kind === "map") {
    const inner = a.key === b.key ? join(a.to, b.to) : null;
    return inner === null ? null : { kind: "map", key: a.key, to: inner };
  }
  if (a.kind === "value" && b.kind === "value") return a.set === b.set ? a : null;
  return a.kind === b.kind && (a.kind === "bool" || a.kind === "int") ? a : null;
}

/** Whether a condition of type `from` may be stored where `to` is
 * declared. Int ranges are left to the value. */
export function fits(from: ExprType, to: Type): boolean {
  if (to.kind === "optional") {
    if (from.kind === "optional") return from.of === null || fits(from.of, to.of);
    return fits(from, to.of);
  }
  if (from.kind === "optional") return false;
  if (to.kind === "set") return from.kind === "set" && (from.of === null || fits(from.of, to.of));
  if (to.kind === "map") return from.kind === "map" && from.key === to.key && fits(from.to, to.to);
  if (to.kind === "value") return from.kind === "value" && from.set === to.set;
  return from.kind === to.kind;
}

// ---------------------------------------------------------------
// Checking
// ---------------------------------------------------------------

/** What a condition may read: the vocabulary, the names in reach
 * (state variables and the event's params) and the event's effect
 * fields, or `effect: null` where the effect cannot be read. */
export type Scope = {
  vocabulary: Vocabulary;
  names: Record<string, Type>;
  effect: Record<string, Type> | null;
};

type CheckScope = {
  vocabulary: Vocabulary;
  names: Record<string, ExprType>;
  effect: Record<string, Type> | null;
};

function check(node: Node, scope: CheckScope, reads: Set<string>): ExprType {
  const show = showExprType;
  const fail = (cause: string): never => {
    throw new GuardError(cause);
  };
  const sub = (child: Node): ExprType => check(child, scope, reads);
  const bound = (x: string, type: ExprType, body: Node): ExprType => {
    const fault = nameFault(x);
    if (fault !== null) fail(fault);
    if (Object.hasOwn(scope.names, x) || isValuesSet(scope.vocabulary, x)) {
      fail(`'${x}' is already a name here; pick another`);
    }
    return check(body, { ...scope, names: { ...scope.names, [x]: type } }, reads);
  };
  const members = (set: ExprType, what: string): ExprType => {
    if (set.kind !== "set") return fail(`${what} needs a set after 'in', found ${show(set)}`);
    if (set.of === null) return fail(`${what} cannot tell what {} holds`);
    return set.of;
  };
  const condition = (type: ExprType): void => {
    if (type.kind !== "bool") fail(`the condition after ':' must be bool, found ${show(type)}`);
  };

  switch (node.n) {
    case "bool":
      return BOOL;
    case "int":
      return INT;
    case "none":
      return { kind: "optional", of: null };
    case "value": {
      const home = scope.vocabulary.home.get(node.v);
      if (home === undefined) return fail(`'${node.v}' is in no values set`);
      return { kind: "value", set: home.set };
    }
    case "name":
      if (Object.hasOwn(scope.names, node.v)) return scope.names[node.v];
      if (isValuesSet(scope.vocabulary, node.v)) {
        return { kind: "set", of: { kind: "value", set: node.v } };
      }
      return fail(`unknown name '${node.v}'`);
    case "effect":
      if (scope.effect === null) {
        return fail(`effect.${node.f} cannot be read here, before the event happens`);
      }
      if (!Object.hasOwn(scope.effect, node.f)) {
        return fail(`the event has no effect field '${node.f}'`);
      }
      reads.add(node.f);
      return exprType(scope.effect[node.f]);
    case "not": {
      const type = sub(node.e);
      if (type.kind !== "bool") fail(`'not' needs bool, found ${show(type)}`);
      return BOOL;
    }
    case "neg": {
      const type = sub(node.e);
      if (type.kind !== "int") fail(`'-' needs int, found ${show(type)}`);
      return INT;
    }
    case "set": {
      let of: ExprType | null = null;
      for (const item of node.items) {
        const type = sub(item);
        if (type.kind !== "int" && type.kind !== "value") {
          fail(`a set holds ints or named values, not ${show(type)}`);
        }
        if (of !== null && join(of, type) === null) {
          fail(`a set of ${show(of)} cannot hold ${show(type)}`);
        }
        of = type;
      }
      return { kind: "set", of };
    }
    case "index": {
      const map = sub(node.m);
      if (map.kind !== "map") return fail(`'[ ]' needs a map before it, found ${show(map)}`);
      const key = sub(node.k);
      if (key.kind !== "value" || key.set !== map.key) {
        fail(`the key in '[ ]' must be ${map.key}, found ${show(key)}`);
      }
      return map.to;
    }
    case "call": {
      const set = sub(node.e);
      if (set.kind !== "set") return fail(`'${node.f}' needs a set, found ${show(set)}`);
      return node.f === "size" ? INT : optional(set.of);
    }
    case "default": {
      const value = sub(node.e);
      const other = sub(node.d);
      if (value.kind !== "optional") {
        return fail(`'default' needs a value that may be missing first, found ${show(value)}`);
      }
      if (other.kind === "optional") {
        return fail(`'default' needs a value that is always there second, found ${show(other)}`);
      }
      if (value.of === null) return other;
      return (
        join(value.of, other) ?? fail(`'default': ${show(value)} and ${show(other)} do not go together`)
      );
    }
    case "if": {
      const test = sub(node.c);
      if (test.kind !== "bool") fail(`'if' needs bool before 'then', found ${show(test)}`);
      const a = sub(node.a);
      const b = sub(node.b);
      return join(a, b) ?? fail(`'if': ${show(a)} and ${show(b)} do not go together`);
    }
    case "quant": {
      const of = members(sub(node.s), `'${node.q}'`);
      condition(bound(node.x, of, node.e));
      return BOOL;
    }
    case "filter": {
      const set = sub(node.s);
      const of = members(set, "'{ in : }'");
      condition(bound(node.x, of, node.e));
      return set;
    }
    case "mapc": {
      if (!isValuesSet(scope.vocabulary, node.set)) {
        return fail(`'map' needs a values name after 'in', found '${node.set}'`);
      }
      return { kind: "map", key: node.set, to: bound(node.x, { kind: "value", set: node.set }, node.e) };
    }
    case "bin": {
      const l = sub(node.l);
      const r = sub(node.r);
      const op = node.op;
      const found = `found ${show(l)} and ${show(r)}`;
      if (op === "and" || op === "or" || op === "implies") {
        if (l.kind !== "bool" || r.kind !== "bool") fail(`'${op}' needs bool on both sides, ${found}`);
        return BOOL;
      }
      if (op === "+" || op === "-" || op === "*") {
        if (l.kind !== "int" || r.kind !== "int") fail(`'${op}' needs int on both sides, ${found}`);
        return INT;
      }
      if (op === "==" || op === "!=") {
        if (join(l, r) === null) fail(`'${op}' cannot compare ${show(l)} with ${show(r)}`);
        return BOOL;
      }
      if (op === "<" || op === "<=" || op === ">" || op === ">=") {
        const ints = l.kind === "int" && r.kind === "int";
        const values = l.kind === "value" && r.kind === "value" && l.set === r.set;
        if (!ints && !values) fail(`'${op}' needs two ints or two values of one set, ${found}`);
        return BOOL;
      }
      if (op === "in") {
        if (r.kind !== "set") return fail(`'in' needs a set on the right, found ${show(r)}`);
        const one = l.kind === "optional" ? l.of : l;
        if (one !== null && one.kind !== "int" && one.kind !== "value") {
          fail(`'in' needs an int or a named value on the left, found ${show(l)}`);
        }
        if (one !== null && r.of !== null && join(one, r.of) === null) {
          fail(`'in': ${show(l)} is never in ${show(r)}`);
        }
        return BOOL;
      }
      // union, minus, intersect
      if (l.kind !== "set" || r.kind !== "set") return fail(`'${op}' needs sets on both sides, ${found}`);
      return join(l, r) ?? fail(`'${op}': ${show(l)} and ${show(r)} do not go together`);
    }
  }
}

// ---------------------------------------------------------------
// A checked condition
// ---------------------------------------------------------------

/** A condition that parsed and type-checked. `reads` are the effect
 * fields it mentions, in name order. */
export type Expr = {
  source: string;
  type: ExprType;
  reads: string[];
  /** For this module only. */
  root: unknown;
  vocabulary: Vocabulary;
};

/**
 * Parse and type-check one condition. A YAML `true`, `false` or whole
 * number stands for its text. Throws a GuardError whose message ends
 * with the condition: `<cause> in "<source>"`.
 */
export function compile(source: unknown, scope: Scope): Expr {
  let text: string;
  if (typeof source === "string") text = source;
  else if (typeof source === "boolean" || (typeof source === "number" && Number.isSafeInteger(source))) {
    text = String(source);
  } else {
    throw new GuardError(
      source === null
        ? `write the condition as text ('none' for the missing value), found nothing`
        : `write the condition as text, found ${JSON.stringify(source)}`,
    );
  }
  const root = parse(text);
  const names: Record<string, ExprType> = {};
  for (const [name, type] of Object.entries(scope.names)) names[name] = exprType(type);
  const reads = new Set<string>();
  let type: ExprType;
  try {
    type = check(root, { vocabulary: scope.vocabulary, names, effect: scope.effect }, reads);
  } catch (error) {
    if (error instanceof GuardError) throw new GuardError(`${error.message} in "${text}"`, error.kind);
    throw error;
  }
  return { source: text, type, reads: [...reads].sort(), root, vocabulary: scope.vocabulary };
}

/** Compile a condition that must be bool. */
export function compileBool(source: unknown, scope: Scope): Expr {
  const expr = compile(source, scope);
  if (expr.type.kind !== "bool") {
    throw new GuardError(`must be bool, found ${showExprType(expr.type)} in "${expr.source}"`);
  }
  return expr;
}

/** Compile a condition whose value is stored as `type`. */
export function compileAs(source: unknown, scope: Scope, type: Type): Expr {
  const expr = compile(source, scope);
  if (!fits(expr.type, type)) {
    throw new GuardError(
      `must be ${showType(type)}, found ${showExprType(expr.type)} in "${expr.source}"`,
    );
  }
  return expr;
}

// ---------------------------------------------------------------
// Working a condition out
// ---------------------------------------------------------------

type Env = { names: Fields; effect: Fields; vocabulary: Vocabulary; source: string };

function rank(value: Value, vocab: Vocabulary): number {
  return typeof value === "number" ? value : (vocab.home.get(value as string)?.rank ?? 0);
}

function safe(result: number, env: Env): number {
  if (!Number.isSafeInteger(result)) {
    throw new GuardError(`a number went beyond the safe range in "${env.source}"`, "reading");
  }
  return result;
}

function run(node: Node, env: Env): Value {
  const sub = (child: Node): Value => run(child, env);
  const each = (x: string, body: Node) => (member: Value): Value =>
    run(body, { ...env, names: { ...env.names, [x]: member } });
  switch (node.n) {
    case "bool":
    case "int":
    case "value":
      return node.v;
    case "none":
      return null;
    case "name":
      return Object.hasOwn(env.names, node.v) ? env.names[node.v] : [...env.vocabulary.sets[node.v]];
    case "effect":
      return env.effect[node.f];
    case "not":
      return !sub(node.e);
    case "neg":
      return safe(-(sub(node.e) as number), env);
    case "set":
      return inOrder([...new Set(node.items.map(sub))], env.vocabulary);
    case "index":
      return (sub(node.m) as { [key: string]: Value })[sub(node.k) as string];
    case "call": {
      const set = sub(node.e) as Value[];
      if (node.f === "size") return set.length;
      if (set.length === 0) return null;
      return node.f === "min" ? set[0] : set[set.length - 1];
    }
    case "default": {
      const value = sub(node.e);
      return value === null ? sub(node.d) : value;
    }
    case "if":
      return sub(node.c) === true ? sub(node.a) : sub(node.b);
    case "quant": {
      const set = sub(node.s) as Value[];
      const holds = each(node.x, node.e);
      return node.q === "all" ? set.every((m) => holds(m) === true) : set.some((m) => holds(m) === true);
    }
    case "filter": {
      const holds = each(node.x, node.e);
      return (sub(node.s) as Value[]).filter((m) => holds(m) === true);
    }
    case "mapc": {
      const value = each(node.x, node.e);
      const map: { [key: string]: Value } = {};
      for (const key of env.vocabulary.sets[node.set]) map[key] = value(key);
      return map;
    }
    case "bin": {
      const op = node.op;
      if (op === "and") return sub(node.l) === true && sub(node.r) === true;
      if (op === "or") return sub(node.l) === true || sub(node.r) === true;
      if (op === "implies") return sub(node.l) !== true || sub(node.r) === true;
      const l = sub(node.l);
      const r = sub(node.r);
      switch (op) {
        case "+":
          return safe((l as number) + (r as number), env);
        case "-":
          return safe((l as number) - (r as number), env);
        case "*":
          return safe((l as number) * (r as number), env);
        case "==":
          return sameValue(l, r);
        case "!=":
          return !sameValue(l, r);
        case "<":
          return rank(l, env.vocabulary) < rank(r, env.vocabulary);
        case "<=":
          return rank(l, env.vocabulary) <= rank(r, env.vocabulary);
        case ">":
          return rank(l, env.vocabulary) > rank(r, env.vocabulary);
        case ">=":
          return rank(l, env.vocabulary) >= rank(r, env.vocabulary);
        case "in":
          return l !== null && (r as Value[]).includes(l);
        case "union":
          return inOrder([...new Set([...(l as Value[]), ...(r as Value[])])], env.vocabulary);
        case "intersect":
          return (l as Value[]).filter((m) => (r as Value[]).includes(m));
        default:
          return (l as Value[]).filter((m) => !(r as Value[]).includes(m));
      }
    }
  }
}

/**
 * Work out a checked condition. `names` holds a value for every name
 * of the scope it was compiled in; `effect` a value for every field
 * in `expr.reads`. The only failure is a GuardError of kind `reading`
 * when a number leaves the safe range.
 */
export function evaluate(expr: Expr, names: Fields, effect: Fields = {}): Value {
  return run(expr.root as Node, { names, effect, vocabulary: expr.vocabulary, source: expr.source });
}
