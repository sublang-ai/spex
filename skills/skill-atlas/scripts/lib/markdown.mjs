// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Markdown structure for step and link detection: fenced-code masks,
// ATX headings, ordered-list items and plain-text stripping.

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const ORDERED_ITEM = /^(\s*)(\d{1,9})[.)](?:[ \t]+(.*)|[ \t]*$)/;
const BULLET_ITEM = /^(\s*)[-*+][ \t]+/;

/**
 * Mark the lines that belong to fenced code (delimiters included).
 *
 * CommonMark closes a fence only with a bare fence at least as long; skill
 * authors often nest a ```lang fence inside a ``` one (a markdown example
 * holding a diff). For fences of exactly three characters, a nested fence
 * with an info string opens a level and a bare fence closes one, so the
 * outer block ends where the author meant it to.
 * @param {string[]} lines
 * @returns {boolean[]}
 */
export function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = null; // { char, len, depth }
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (!open) {
      if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
        open = { char: m[2][0], len: m[2].length, depth: 1 };
        mask[i] = true;
      }
      continue;
    }
    mask[i] = true;
    if (!m || m[2][0] !== open.char || m[2].length < open.len) continue;
    const info = m[3].trim();
    if (info === '') {
      open.depth--;
      if (open.depth === 0) open = null;
    } else if (open.len === 3 && m[2].length === 3) {
      open.depth++;
    }
  }
  return mask;
}

/**
 * ATX headings outside fenced code.
 * @returns {{ index:number, level:number, text:string }[]} index is 0-based into `lines`
 */
export function headings(lines, mask) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = HEADING.exec(lines[i]);
    if (m) out.push({ index: i, level: m[1].length, text: m[2].trim() });
  }
  return out;
}

/** The 0-based index of the last line of the heading's section (before the next heading of the same or a higher level). */
export function sectionEnd(heads, k, lineCount) {
  const h = heads[k];
  for (let j = k + 1; j < heads.length; j++) {
    if (heads[j].level <= h.level) return heads[j].index - 1;
  }
  return lineCount - 1;
}

export function orderedItem(line) {
  const m = ORDERED_ITEM.exec(line);
  if (!m) return null;
  return { indent: m[1].replace(/\t/g, '    ').length, number: Number(m[2]), text: m[3] ?? '' };
}

export function isBulletItem(line) { return BULLET_ITEM.test(line); }
export function isHeadingLine(line) { return HEADING.test(line); }

export function indentOf(line) {
  const lead = /^\s*/.exec(line)[0];
  return lead.replace(/\t/g, '    ').length;
}

/**
 * Collect an ordered list starting at line `start`, stopping before `limit`
 * (exclusive). Items keep their nested content, fenced code included.
 * @returns {{ start:number, end:number, number:number, text:string }[]}
 */
export function collectOrderedList(lines, mask, start, limit) {
  const first = orderedItem(lines[start]);
  if (!first) return [];
  const indent = first.indent;
  const items = [];
  let cur = null;
  let prevBlank = false;
  for (let i = start; i < limit; i++) {
    const line = lines[i];
    if (mask[i]) {
      if (cur) cur.end = i;
      prevBlank = false;
      continue;
    }
    if (line.trim() === '') { prevBlank = true; continue; }
    if (HEADING.test(line)) break;
    const item = orderedItem(line);
    const ind = indentOf(line);
    if (item && item.indent === indent) {
      cur = { start: i, end: i, number: item.number, text: item.text };
      items.push(cur);
    } else if (ind > indent) {
      cur.end = i;
    } else if (item || isBulletItem(line)) {
      break;
    } else if (!prevBlank) {
      // Lazy continuation: an unindented line directly under the item text.
      cur.end = i;
    } else {
      break;
    }
    prevBlank = false;
  }
  return items;
}

/** Markdown to plain text, line by line; fenced lines are dropped unless `keepCode`. */
export function plainText(lines, mask, from, to, { keepCode = false } = {}) {
  const parts = [];
  for (let i = from; i <= to; i++) {
    if (mask[i]) {
      if (keepCode && !FENCE.test(lines[i])) parts.push(lines[i].trim());
      continue;
    }
    const t = stripInline(lines[i]);
    if (t) parts.push(t);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Strip block markers and inline markdown from one line. */
export function stripInline(line) {
  let s = line;
  if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(s)) return ''; // table rule
  s = s.replace(/<!--.*?-->/g, '');
  s = s.replace(/^\s{0,3}#{1,6}\s+/, '');
  s = s.replace(/^\s*>\s?/, '');
  s = s.replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+(\[[ xX]\]\s+)?/, '');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, '');
  s = s.replace(/`+([^`]*)`+/g, '$1');
  s = s.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2');
  s = s.replace(/(^|[\s(])\*(?=\S)([^*]+?)(?<=\S)\*/g, '$1$2');
  s = s.replace(/(^|[\s(])_(?=\S)([^_]+?)(?<=\S)_(?=[\s.,;:!?)]|$)/g, '$1$2');
  s = s.replace(/\s*\|\s*/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Cut text to `max` characters at a word boundary when one is near, ending in an ellipsis. */
export function clipText(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  // Prefer a word boundary unless it would discard more than a fifth of the budget.
  const end = space > max * 0.8 ? space : max - 1;
  return cut.slice(0, end).trimEnd() + '\u2026';
}
