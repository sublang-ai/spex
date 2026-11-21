// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Step detection, per data-model.md "Detection rules":
//   1. numbered headings (Step/Phase/Stage/Part N, or "N. Title") when two or more share a level;
//   2. the ordered list under a procedure heading, or the list opening the body;
//   3. otherwise the `##` sections (stepKind "section").

import { headings, sectionEnd, orderedItem, collectOrderedList, plainText, stripInline, clipText } from './markdown.mjs';

export const EXCERPT_MAX = 400; // data-model.md: excerpt is at most 400 characters
export const TITLE_MAX = 80; // a list step's title is at most 80 characters

const KEYWORD_HEADING = /^(step|phase|stage|part)\s+(\d+)[a-z]?\b\s*(?:[:.)\-\u2013\u2014]+\s*)?(.*)$/i;
const NUMBERED_HEADING = /^(\d+)[.)]\s+(.+)$/;
const PROCEDURE_HEADING = /\b(workflow|steps|process|procedure|instructions|how[ -]to|usage|quick ?start)\b/i;
const MIN_NUMBERED_HEADINGS = 2; // rule 1 needs two or more numbered headings on one level
const MIN_LIST_ITEMS = 2; // a one-item list is not a procedure

/**
 * Detect steps in a SKILL.md body.
 * @param {string[]} lines all file lines
 * @param {boolean[]} mask fenced-code mask over `lines`
 * @param {number} bodyStart 0-based index of the first body line
 * @returns {{ kind: 'step'|'section'|'none', steps: { title:string, start:number, end:number, excerpt:string }[] }}
 *   start/end are 0-based inclusive line indexes.
 */
export function detectSteps(lines, mask, bodyStart) {
  const body = lines.slice(bodyStart);
  const bodyMask = mask.slice(bodyStart);
  const heads = headings(body, bodyMask);
  const shift = (s) => ({ ...s, start: s.start + bodyStart, end: s.end + bodyStart });

  const byHeadings = numberedHeadingSteps(body, bodyMask, heads);
  if (byHeadings.length) return { kind: 'step', steps: byHeadings.map(shift) };

  const byList = listSteps(body, bodyMask, heads);
  if (byList.length) return { kind: 'step', steps: byList.map(shift) };

  const sections = heads
    .map((h, k) => ({ h, k }))
    .filter(({ h }) => h.level === 2)
    .map(({ h, k }) => headingStep(body, bodyMask, h, sectionEnd(heads, k, body.length), cleanTitle(h.text)));
  if (sections.length) return { kind: 'section', steps: sections.map(shift) };
  return { kind: 'none', steps: [] };
}

function numberedHeadingSteps(body, mask, heads) {
  const matches = [];
  heads.forEach((h, k) => {
    const text = stripInline(h.text);
    const kw = KEYWORD_HEADING.exec(text);
    if (kw) {
      const rest = kw[3].trim();
      matches.push({ h, k, family: kw[1].toLowerCase(), title: rest || `${capitalize(kw[1])} ${kw[2]}` });
      return;
    }
    const num = NUMBERED_HEADING.exec(text);
    if (num) matches.push({ h, k, family: 'number', title: num[2].trim() });
  });
  if (matches.length < MIN_NUMBERED_HEADINGS) return [];

  // The level holding most numbered headings wins; ties go to the higher level.
  const counts = new Map();
  for (const m of matches) counts.set(m.h.level, (counts.get(m.h.level) ?? 0) + 1);
  let level = null;
  for (const [lv, n] of counts) {
    if (n < MIN_NUMBERED_HEADINGS) continue;
    if (level === null || n > counts.get(level) || (n === counts.get(level) && lv < level)) level = lv;
  }
  if (level === null) return [];

  const chosen = matches.filter((m) => m.h.level === level);
  const families = new Set(chosen.map((m) => m.family));
  const ranges = chosen.map((m) => ({ ...m, end: sectionEnd(heads, m.k, body.length) }));
  // A heading of the same family on another level (a "## Phase 5" after
  // "### Phase 1-4") is a step too, unless it nests in or around a chosen one.
  for (const m of matches) {
    if (m.h.level === level || !families.has(m.family)) continue;
    const end = sectionEnd(heads, m.k, body.length);
    const inside = ranges.some((r) => m.h.index > r.h.index && m.h.index <= r.end);
    const around = ranges.some((r) => r.h.index > m.h.index && r.h.index <= end);
    if (!inside && !around) ranges.push({ ...m, end });
  }
  ranges.sort((a, b) => a.h.index - b.h.index);
  return ranges.map((r) => headingStep(body, mask, r.h, r.end, clipText(cleanTitle(r.title), TITLE_MAX)));
}

function headingStep(body, mask, h, end, title) {
  const last = trimTrailingBlank(body, h.index, end);
  return { title, start: h.index, end: last, excerpt: excerpt(body, mask, h.index + 1, last) };
}

function listSteps(body, mask, heads) {
  // A procedure heading's own content (up to its next heading of any level).
  for (let k = 0; k < heads.length; k++) {
    if (!PROCEDURE_HEADING.test(stripInline(heads[k].text))) continue;
    const from = heads[k].index + 1;
    const to = k + 1 < heads.length ? heads[k + 1].index : body.length;
    for (let i = from; i < to; i++) {
      if (mask[i]) continue;
      const item = orderedItem(body[i]);
      if (item && item.indent <= 3) {
        const steps = itemsToSteps(body, mask, collectOrderedList(body, mask, i, to));
        if (steps.length) return steps;
        break;
      }
    }
  }
  // The ordered list that opens the body: after an optional `#` title and at
  // most one introductory paragraph ending in a colon.
  let i = 0;
  const skipBlank = () => { while (i < body.length && (body[i].trim() === '' || /^\s*<!--.*-->\s*$/.test(body[i]))) i++; };
  skipBlank();
  if (i < body.length && !mask[i] && /^ {0,3}#\s/.test(body[i])) { i++; skipBlank(); }
  if (i < body.length && !mask[i] && !orderedItem(body[i])) {
    let j = i;
    while (j < body.length && body[j].trim() !== '' && !mask[j]) j++;
    if (!/:\s*$/.test(body[j - 1] ?? '')) return [];
    i = j;
    skipBlank();
  }
  if (i < body.length && !mask[i] && orderedItem(body[i])) {
    const limit = heads.find((h) => h.index > i)?.index ?? body.length;
    return itemsToSteps(body, mask, collectOrderedList(body, mask, i, limit));
  }
  return [];
}

function itemsToSteps(body, mask, items) {
  if (items.length < MIN_LIST_ITEMS) return [];
  return items.map((it) => ({
    title: clipText(itemTitle(body, mask, it), TITLE_MAX),
    start: it.start,
    end: it.end,
    excerpt: excerpt(body, mask, it.start, it.end),
  }));
}

// The item's leading bold text, or else its first sentence. Bold that runs
// on into the sentence ("**Audit** the codebase") is emphasis, not a label,
// so the sentence is the title then.
function itemTitle(body, mask, it) {
  const bold = /^\s*(\*\*|__)(.+?)\1(.*)$/.exec(it.text);
  if (bold && (/[.:!?]$/.test(bold[2].trim()) || /^\s*([:.(\-\u2013\u2014]|$)/.test(bold[3]))) return cleanTitle(stripInline(bold[2]));
  // The first paragraph of the item: its text line and lazy continuations.
  let text = it.text;
  for (let i = it.start + 1; i <= it.end && !mask[i] && body[i].trim() !== '' && !orderedItem(body[i]) && !/^\s*[-*+]\s/.test(body[i]); i++) {
    text += ' ' + body[i].trim();
  }
  const plain = stripInline(text);
  const sentence = /^(.+?[.!?])(?=\s|$)/.exec(plain);
  return cleanTitle(sentence ? sentence[1] : plain);
}

function cleanTitle(text) {
  return stripInline(text).replace(/[\s:\u2013\u2014-]+$/, '').replace(/\.$/, '').trim();
}

function excerpt(body, mask, from, to) {
  let text = from <= to ? plainText(body, mask, from, to) : '';
  if (!text && from <= to) text = plainText(body, mask, from, to, { keepCode: true });
  return clipText(text, EXCERPT_MAX);
}

function trimTrailingBlank(body, start, end) {
  let e = end;
  while (e > start && body[e].trim() === '') e--;
  return e;
}

function capitalize(s) { return s[0].toUpperCase() + s.slice(1).toLowerCase(); }
