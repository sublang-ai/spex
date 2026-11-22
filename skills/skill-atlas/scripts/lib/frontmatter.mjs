// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A YAML-subset parser for SKILL.md frontmatter: `key: value`, quoted
// strings, `>`/`|` block scalars (with `-`/`+` chomping), inline `[a, b]`
// and block `- item` lists, flow mappings `{a: b}`, and one nested map level
// (as under `metadata:`), in the block and the flow form alike.
// It never throws: a malformed block yields `error` and whatever parsed.

const DELIMITER = /^---\s*$/;
const END_DELIMITER = /^(---|\.\.\.)\s*$/;
const KEY_LINE = /^([A-Za-z0-9_][\w.-]*)\s*:(?:\s+(.*)|\s*)$/;
const BLOCK_SCALAR = /^([|>])([+-]?)\s*(#.*)?$/;

/**
 * Split a SKILL.md text into frontmatter and body.
 * @param {string} text normalized to `\n` line endings, BOM removed
 * @returns {{ data: object, error: string|null, present: boolean,
 *   bodyStart: number, lines: string[], keyLines: Record<string, {start:number,end:number}> }}
 *   `bodyStart` is the 0-based index of the first body line; `keyLines`
 *   maps each top-level key to its 0-based inclusive line span.
 */
export function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (!DELIMITER.test(lines[0] ?? '')) {
    return { data: {}, error: 'no frontmatter (the file does not start with ---)', present: false, bodyStart: 0, lines, keyLines: {} };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (END_DELIMITER.test(lines[i])) { end = i; break; }
  }
  if (end < 0) {
    return { data: {}, error: 'frontmatter is not closed by a --- line', present: true, bodyStart: 0, lines, keyLines: {} };
  }
  const parsed = parseYamlSubset(lines.slice(1, end), 1);
  return { ...parsed, present: true, bodyStart: end + 1, lines };
}

/**
 * Parse frontmatter lines.
 * @param {string[]} lines the lines between the delimiters
 * @param {number} offset 0-based file line index of `lines[0]`
 */
export function parseYamlSubset(lines, offset = 0) {
  const data = {};
  const keyLines = {};
  let error = null;
  const fail = (i, message) => { if (!error) error = `line ${i + offset + 1}: ${message}`; };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (isBlankOrComment(raw)) { i++; continue; }
    if (/^\s/.test(raw)) { fail(i, 'unexpected indentation'); i++; continue; }
    const m = KEY_LINE.exec(raw);
    if (!m) { fail(i, `expected "key: value", found "${clip(raw)}"`); i++; continue; }
    const key = m[1];
    const rest = (m[2] ?? '').trim();
    const start = i;
    const { value, next, problem } = parseValue(lines, i, rest, 0);
    if (problem) fail(problem.line, problem.message);
    if (Object.prototype.hasOwnProperty.call(data, key)) fail(i, `duplicate key "${key}"`);
    data[key] = value;
    keyLines[key] = { start: start + offset, end: Math.max(start, next - 1) + offset };
    i = next;
  }
  return { data, error, keyLines };
}

// Parse the value of the key on line `i` whose inline remainder is `rest`;
// `indent` is the key's own indentation. Returns the index of the next
// unconsumed line.
function parseValue(lines, i, rest, indent) {
  const block = BLOCK_SCALAR.exec(rest);
  if (block) return parseBlockScalar(lines, i, block[1], block[2], indent);
  if (rest === '' || rest.startsWith('#')) return parseNested(lines, i, indent);
  if (rest.startsWith('"') || rest.startsWith("'")) return parseQuoted(lines, i, rest, indent);
  if (rest.startsWith('{')) return parseFlowMapping(lines, i, rest, indent);
  if (rest.startsWith('[')) {
    const list = parseInlineList(rest);
    if (list === null) return { value: rest, next: i + 1, problem: { line: i, message: 'unclosed inline list' } };
    return { value: list, next: i + 1 };
  }
  // A plain scalar may continue on more-indented lines (folded with spaces).
  let text = stripComment(rest);
  let j = i + 1;
  while (j < lines.length && !isBlank(lines[j]) && indentOf(lines[j]) > indent && !isBlankOrComment(lines[j])) {
    text += ' ' + stripComment(lines[j].trim());
    j++;
  }
  return { value: plainScalar(text), next: j };
}

// A key with nothing after the colon: a block list, a nested map, or null.
function parseNested(lines, i, indent) {
  let j = i + 1;
  while (j < lines.length && isBlankOrComment(lines[j])) j++;
  if (j >= lines.length || indentOf(lines[j]) <= indent) {
    // `- item` lists are commonly written at the key's own indentation.
    if (j < lines.length && indentOf(lines[j]) === indent && /^\s*-(\s|$)/.test(lines[j])) {
      return parseBlockList(lines, j, indent);
    }
    return { value: null, next: i + 1 };
  }
  const childIndent = indentOf(lines[j]);
  if (/^\s*-(\s|$)/.test(lines[j])) return parseBlockList(lines, j, childIndent);
  if (indent > 0) {
    // Only one nested map level is read; a deeper map is valid YAML kept opaque (null).
    return { value: null, next: skipIndented(lines, j, indent) };
  }
  const map = {};
  let problem = null;
  while (j < lines.length) {
    const raw = lines[j];
    if (isBlankOrComment(raw)) { j++; continue; }
    const ind = indentOf(raw);
    if (ind < childIndent) break;
    if (ind > childIndent) { problem ??= { line: j, message: 'unexpected indentation' }; j++; continue; }
    const m = KEY_LINE.exec(raw.trim());
    if (!m) { problem ??= { line: j, message: `expected "key: value", found "${clip(raw)}"` }; j++; continue; }
    const res = parseValue(lines, j, (m[2] ?? '').trim(), childIndent);
    if (res.problem) problem ??= res.problem;
    map[m[1]] = res.value;
    j = res.next;
  }
  return { value: map, next: j, problem };
}

function parseBlockList(lines, j, listIndent) {
  const items = [];
  let problem = null;
  while (j < lines.length) {
    const raw = lines[j];
    if (isBlankOrComment(raw)) { j++; continue; }
    if (indentOf(raw) !== listIndent || !/^\s*-(\s|$)/.test(raw)) break;
    const item = raw.trim().slice(1).trim();
    if (item.startsWith('"') || item.startsWith("'")) {
      const res = parseQuoted(lines, j, item, listIndent);
      if (res.problem) problem ??= res.problem;
      items.push(res.value);
      j = res.next;
    } else if (item.startsWith('[')) {
      items.push(parseInlineList(item) ?? item);
      j++;
    } else {
      items.push(plainScalar(stripComment(item)));
      j++;
    }
  }
  return { value: items, next: j, problem };
}

function parseBlockScalar(lines, i, style, chomp, indent) {
  let j = i + 1;
  const body = [];
  let blockIndent = -1;
  while (j < lines.length) {
    const raw = lines[j];
    if (isBlank(raw)) { body.push(''); j++; continue; }
    const ind = indentOf(raw);
    if (blockIndent < 0) {
      if (ind <= indent) break;
      blockIndent = ind;
    }
    if (ind < blockIndent) break;
    body.push(raw.slice(blockIndent));
    j++;
  }
  // Trailing blank lines belong to the scalar only for chomping purposes.
  let trailing = 0;
  while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
  // Give back trailing blank lines so line spans end at real content.
  j -= trailing;
  let text;
  if (style === '|') {
    text = body.join('\n');
  } else {
    // Folded: single newlines become spaces, blank lines become newlines,
    // and more-indented lines keep their line breaks.
    text = '';
    for (let k = 0; k < body.length; k++) {
      const line = body[k];
      if (k === 0) { text = line; continue; }
      const prev = body[k - 1];
      if (line === '') text += '\n';
      else if (prev === '' || /^\s/.test(line) || /^\s/.test(prev)) text += (prev === '' ? '' : '\n') + line;
      else text += ' ' + line;
    }
  }
  if (chomp === '+') text += '\n'.repeat(trailing + 1);
  else if (chomp !== '-' && text !== '') text += '\n';
  return { value: text, next: j };
}

function parseQuoted(lines, i, rest, indent) {
  const quote = rest[0];
  let src = rest;
  let j = i + 1;
  // A quoted scalar may span lines; join until the closing quote is found.
  while (findClosingQuote(src, quote) < 0 && j < lines.length && (isBlank(lines[j]) || indentOf(lines[j]) > indent)) {
    src += isBlank(lines[j]) ? '\n' : ' ' + lines[j].trim();
    j++;
  }
  const close = findClosingQuote(src, quote);
  if (close < 0) return { value: src.slice(1), next: j, problem: { line: i, message: `unclosed ${quote === '"' ? 'double' : 'single'}-quoted string` } };
  const inner = src.slice(1, close);
  const after = src.slice(close + 1).trim();
  const problem = after && !after.startsWith('#') ? { line: i, message: `unexpected text after the closing quote: "${clip(after)}"` } : null;
  const value = quote === "'" ? inner.replace(/''/g, "'") : unescapeDouble(inner);
  return { value: value.replace(/ *\n */g, '\n'), next: j, problem };
}

function findClosingQuote(src, quote) {
  for (let k = 1; k < src.length; k++) {
    const c = src[k];
    if (quote === '"' && c === '\\') { k++; continue; }
    if (c === quote) {
      if (quote === "'" && src[k + 1] === "'") { k++; continue; }
      return k;
    }
  }
  return -1;
}

const DOUBLE_ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', b: '\b', f: '\f', ' ': ' ' };

function unescapeDouble(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (all, e) => {
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return DOUBLE_ESCAPES[e] ?? all;
  });
}

/** Parse `[a, "b, c", 'd']`; null when the bracket is not closed. */
function parseInlineList(src) {
  const items = [];
  let plain = '';
  let quotedText = null; // the item's text when it was quoted; quoted items stay strings
  let quote = null;
  for (let k = 1; k < src.length; k++) {
    const c = src[k];
    if (quote) {
      if (c === '\\' && quote === '"') { quotedText += unescapeDouble(src.slice(k, k + 2)); k++; continue; }
      if (c === "'" && quote === "'" && src[k + 1] === "'") { quotedText += "'"; k++; continue; }
      if (c === quote) { quote = null; continue; }
      quotedText += c;
      continue;
    }
    if ((c === '"' || c === "'") && plain.trim() === '') { quote = c; quotedText = ''; continue; }
    if (c === ',' || c === ']') {
      if (quotedText !== null) items.push(quotedText);
      else if (plain.trim() !== '') items.push(plainScalar(plain));
      plain = ''; quotedText = null;
      if (c === ']') return items;
      continue;
    }
    if (quotedText === null) plain += c;
  }
  return null;
}

// A flow mapping `{a: b, "c": 'd', e: [f, g]}`, read as the same keys and
// values written as a block map; it may continue on more-indented lines, each
// line's comment dropped. As in the block form, one nested map level is read:
// a map deeper than that is kept opaque (null).
function parseFlowMapping(lines, i, rest, indent) {
  let { text: src, quote } = dropFlowComment(rest, null);
  let j = i + 1;
  let res = readFlow(src, 0);
  while (res === null && j < lines.length && (isBlank(lines[j]) || indentOf(lines[j]) > indent)) {
    const line = dropFlowComment(lines[j].trim(), quote);
    src += ' ' + line.text;
    quote = line.quote;
    j++;
    res = readFlow(src, 0);
  }
  if (res === null || res.error) return { value: rest, next: j, problem: { line: i, message: res?.error ?? 'unclosed flow mapping' } };
  const after = src.slice(res.end).trim();
  const problem = after && !after.startsWith('#') ? { line: i, message: `unexpected text after the flow mapping: "${clip(after)}"` } : null;
  let value = res.value;
  if (indent > 0) value = null;
  else for (const [k, v] of Object.entries(value)) if (v && typeof v === 'object' && !Array.isArray(v)) value[k] = null;
  return { value, next: j, problem };
}

// One line of a flow collection without its comment: a `#` at the line's
// start or after a space, outside quotes. `quote` is the quote still open
// from the line before, if any; returns the one open at the line's end.
function dropFlowComment(line, quote) {
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (quote === '"') {
      if (c === '\\') k++;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'" && line[k + 1] === "'") k++;
      else if (c === "'") quote = null;
    } else if ((c === '"' || c === "'") && (k === 0 || /[\s{[,:]/.test(line[k - 1]))) {
      quote = c;
    } else if (c === '#' && (k === 0 || /\s/.test(line[k - 1]))) {
      return { text: line.slice(0, k).trimEnd(), quote };
    }
  }
  return { text: line, quote };
}

// One flow node of `src` at `k`: `{ value, end }`, `{ error }` where it is
// malformed, or null where it is not closed before the text ends.
function readFlow(src, k) {
  const ws = () => { while (k < src.length && /\s/.test(src[k])) k++; };
  const node = () => {
    ws();
    if (k >= src.length) return null;
    const c = src[k];
    if (c === '{' || c === '[') {
      const map = c === '{';
      const out = map ? {} : [];
      k++;
      for (;;) {
        ws();
        if (k >= src.length) return null;
        if (src[k] === (map ? '}' : ']')) { k++; return { value: out }; }
        if (!map) {
          const item = node();
          if (!item || item.error) return item;
          out.push(item.value);
        } else {
          const key = node();
          if (!key || key.error) return key;
          ws();
          let value = { value: null };
          if (src[k] === ':') {
            k++;
            value = node();
            if (!value || value.error) return value;
          }
          if (Object.prototype.hasOwnProperty.call(out, String(key.value))) return { error: `duplicate key "${key.value}" in a flow mapping` };
          out[String(key.value)] = value.value;
        }
        ws();
        if (k >= src.length) return null;
        if (src[k] === ',') { k++; continue; }
        if (src[k] !== (map ? '}' : ']')) return { error: `expected "," or "${map ? '}' : ']'}" in a flow ${map ? 'mapping' : 'sequence'}` };
      }
    }
    if (c === '"' || c === "'") {
      const close = findClosingQuote(src.slice(k), c);
      if (close < 0) return null;
      const inner = src.slice(k + 1, k + close);
      k += close + 1;
      return { value: c === "'" ? inner.replace(/''/g, "'") : unescapeDouble(inner) };
    }
    // A plain scalar ends at `,` `]` `}`, or at a `:` before a space or one of those.
    const start = k;
    while (k < src.length && !/[,\]}]/.test(src[k]) && !(src[k] === ':' && /[\s,\]}]/.test(src[k + 1] ?? ' '))) k++;
    if (k >= src.length) return null;
    const text = src.slice(start, k);
    if (c === '#' || /\s#/.test(text)) return { error: 'a comment inside a flow collection' };
    // An empty value reads as null, as `key:` does in the block form.
    return { value: text.trim() === '' ? null : plainScalar(text) };
  };
  const res = node();
  if (!res || res.error) return res;
  return { value: res.value, end: k };
}

function plainScalar(text) {
  const t = text.trim();
  if (t === '' || t === '~' || t === 'null') return t === '' ? '' : null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t) && Number.isSafeInteger(Number(t))) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  return t;
}

function stripComment(s) {
  // A comment starts at " #" outside quotes in a plain scalar.
  const k = s.search(/\s#/);
  return k >= 0 ? s.slice(0, k).trimEnd() : s;
}

function skipIndented(lines, j, indent) {
  while (j < lines.length && (isBlank(lines[j]) || indentOf(lines[j]) > indent)) j++;
  return j;
}

function indentOf(line) { return line.length - line.trimStart().length; }
function isBlank(line) { return line.trim() === ''; }
function isBlankOrComment(line) { const t = line.trim(); return t === '' || t.startsWith('#'); }
function clip(s) { const t = s.trim(); return t.length > 40 ? t.slice(0, 39) + '\u2026' : t; }
