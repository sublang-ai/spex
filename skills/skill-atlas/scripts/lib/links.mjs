// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Links between skills, per the data-model.md table. Generic names such as
// `code` or `review` are ordinary words, so only these forms count:
//   calls:    `/N` as a command (not a path: no word, `/`, `.`, `-`, `~`, `:`
//             or `@` before the slash, no path preposition or HTTP method
//             right before it, and a folder-like name only in a sentence
//             saying skill, command, slash or playbook); `Skill(N)`;
//             `skill: N` as a key (case-sensitive, at the line start or after
//             `{` or `,`); `$N` after a verb of use in its clause, and each
//             `$N` joined to it by `,`, "and", "or", or "not" or "never"
//             after `,`, "and" or "but"; N beside a
//             verb of use and the word skill or playbook, or the word command
//             when N is backticked or slashed;
//   mentions: any of those after words steering away from it in its
//             sentence ("instead of", "rather than", a negated verb of use
//             such as "do not run"), up to a clause opening with a verb of use,
//             after punctuation or "but" (or in a sentence holding a bare
//             "instead" opening no clause of use), or `N` in backticks when
//             the sentence says "skill" or N has a hyphen.
// A sentence is read over every name in it, installed or not, and only then
// is each name kept where it names a skill: whether a name is installed never
// changes how the names around it read. Sentences are read over the visible
// text of a paragraph or list item, its soft-wrapped lines joined and a
// Markdown link read as its text [proseUnits], so a link's form never depends
// on where a line breaks or on whether a name is linked.

import { clipText } from './markdown.mjs';

export const EVIDENCE_TEXT_MAX = 160; // characters of evidence text for a link

// Host commands that are not skills, so a `/x` naming one is no unresolved link.
export const BUILTIN_COMMANDS = new Set([
  'help', 'clear', 'compact', 'config', 'model', 'init', 'login', 'logout', 'memory', 'permissions',
  'agents', 'mcp', 'hooks', 'plugin', 'doctor', 'cost', 'status', 'resume', 'exit', 'fast', 'loop', 'goal',
  'add-dir', 'context', 'export', 'rewind', 'review', 'security-review', 'statusline', 'theme', 'usage', 'vim',
]);
// Top-level folders that read like `/x` commands but are paths.
const PATH_LIKE = new Set(['tmp', 'etc', 'usr', 'var', 'bin', 'opt', 'home', 'dev', 'proc', 'sys', 'root', 'mnt', 'src', 'lib', 'api', 'app', 'docs', 'users', 'private', 'volumes', 'workspace']);

const VERBS = String.raw`invoke[sd]?|invoking|call(?:s|ed|ing)?|run(?:s|ning)?|ran|use[sd]?|using|load(?:s|ed|ing)?|delegat(?:e|es|ed|ing) to|hand(?:s|ed|ing)? (?:it )?off to|follow(?:s|ed|ing)?|start(?:s|ed|ing)?|trigger(?:s|ed|ing)?|launch(?:es|ed|ing)?`;
const NOUNS = String.raw`skill|playbook`; // "command" needs a backticked or slashed name
// Words steering away from the names after them in their sentence: "use X
// instead of Y" calls X and mentions Y. Their reach ends at a clause opening
// with a verb of use, so "instead of Y, use X" calls X too; "X, not Y",
// "X but not Y", "X and not Y" and "X and never Y" steer away from Y; "but"
// opens a clause of its own, so "never run X but run Y" and "never run X but
// instead run Y" call Y. A bare "instead" ("use `/x` instead") points away
// from the skill itself, so it steers the whole sentence, unless it opens a
// clause of use ("instead run Y"), which then calls Y.
// A verb of use negated ("do not run", "never invoke", "don't call", "can't
// use", "cannot load", "do not ever run") steers too, every verb of VERBS alike.
const NEGATION = String.raw`(?:(?:do|does|did|should|must|can|could|would|wo|ca|need)n['\u2019]t|cannot|not|never)\s+(?:(?:ever|always|directly)\s+)?`;
const STEER_AWAY_BEFORE = new RegExp(String.raw`\b(?:not for|${NEGATION}(?:${VERBS})|instead of|rather than|see also)\b|(?:,|\bbut|\band)\s+(?:not|never)\b`, 'gi');
const CLAUSE_OF_USE = new RegExp(String.raw`(?:[,:\u2013\u2014]\s*(?:(?:and|but|then|so|instead)\s+)?|\bbut\s+(?:instead\s+)?)(?:please\s+)?(?:${VERBS})\b`, 'i');
const STEER_AWAY_SENTENCE = new RegExp(String.raw`\binstead\b(?!\s+of\b)(?!\s+(?:please\s+)?(?:${VERBS})\b)`, 'i');
const SAYS_SKILL = /\bskills?\b/i;
const SAYS_COMMAND = /\b(skills?|commands?|slash|playbooks?)\b/i;
const CONTEXT_FOR_UNRESOLVED = /\b(skills?|commands?|slash|type[sd]?|typing)\b/i;
// Words after which a slash starts a path, not a command.
const PATH_LEAD = String.raw`(?<!\b(?:[Uu]nder|[Ii]n|[Ii]nto|[Aa]t|[Tt]o|[Ff]rom|[Oo]f|GET|POST|PUT|PATCH|DELETE|HEAD)\s+)`;
const NAME_CHARS = String.raw`[a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*)?`;
// After a name: not more of a word or path. A period or colon ends the name
// only when no word character follows it (sentence punctuation, not `.md`).
const NAME_END = String.raw`(?![\w/-]|[.:]\w)`;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build matchers from every discovered skill. Each skill is registered under
 * its own root and under every copy's, so a skill in a copy's folder resolves
 * to it as a sibling, and as `<plugin>:<name>` where a copy sits in a plugin.
 * @param {{ id:string, name:string, plugin:string|null, root:string, copies?:{ root:string }[] }[]} skills in preference order
 * @param {Map<string, string|null>} [pluginOfRoot] root id -> its plugin's name
 */
export function buildLinkMatcher(skills, pluginOfRoot = new Map()) {
  const targets = new Map(); // text form -> [{ id, root }], in preference order
  const add = (key, id, root) => {
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key).push({ id, root });
  };
  for (const s of skills) {
    const places = [{ root: s.root, plugin: s.plugin }, ...(s.copies ?? []).map((c) => ({ root: c.root, plugin: pluginOfRoot.get(c.root) ?? null }))];
    for (const { root, plugin } of places) {
      add(s.name, s.id, root);
      if (plugin) add(`${plugin}:${s.name}`, s.id, root);
    }
  }
  const keys = [...targets.keys()].sort((a, b) => b.length - a.length);
  if (!keys.length) return { targets, forms: [], strong: strongForms() };
  const ALT = keys.map(escape).join('|');
  const before = String.raw`(?<![\w/.~:@-])(?<!\]\()`;
  const forms = [
    { kind: 'calls', re: new RegExp(String.raw`${before}${PATH_LEAD}/(${ALT})${NAME_END}`, 'g'), slash: true },
    { kind: 'calls', re: new RegExp(String.raw`\bSkill\(\s*["'\x60]?(${ALT})["'\x60]?\s*[,)]`, 'g') },
    { kind: 'calls', re: new RegExp(String.raw`(?:^\s*(?:-\s+)?|[{,]\s*)["']?skill["']?\s*:\s*["'\x60]?(${ALT})${NAME_END}`, 'gm') },
    // `$N` after a verb of use in its clause (no `,` between), as Codex writes a skill's name; never inside a path or URL.
    // Each `$N` joined to it after that one verb ("run $a, $b or $c", "run $a, not $b", "run $a and never $b") is a call too [chain], steered where its joining words steer.
    // Both read every `$N`, a skill's or not, so a name no skill has neither hides nor joins the names after it [findLinks].
    { kind: 'calls', re: new RegExp(String.raw`(?<![\w$/.~:@-])[\x60"']?(?=\$)(?<=\b(?:${VERBS})\b[^.!?;,]{0,41})\$(${ALT}|${NAME_CHARS})${NAME_END}`, 'gi'),
      chain: new RegExp(String.raw`[\x60"']?(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+|\s*,\s*(?:not|never)\s+|\s*,?\s+(?:and|but)\s+(?:not|never)\s+)[\x60"']?\$(${ALT}|${NAME_CHARS})${NAME_END}`, 'iy') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;]{0,40}?(?<![\w/.:-])[\x60"']?/?(${ALT})[\x60"']?\s+(?:${NOUNS})s?\b`, 'gi') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;]{0,40}?\b(?:${NOUNS})\s+[\x60"']?/?(${ALT})${NAME_END}`, 'gi') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;]{0,40}?(?<![\w/.:-])(?:\x60/?|/)(${ALT})\x60?\s+commands?\b`, 'gi') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;]{0,40}?\bcommands?\s+(?:\x60/?|/)(${ALT})${NAME_END}`, 'gi') },
    { kind: 'mentions', re: new RegExp(String.raw`\x60/?(${ALT})\x60`, 'g'), needsSkillWord: true },
  ];
  return { targets, forms, strong: strongForms() };
}

// A name held by several skills resolves to the copy in the caller's own
// root (a sibling), else to the preferred copy.
function resolve(matcher, name, fromRoot) {
  const list = matcher.targets.get(name);
  if (!list) return null;
  return (list.find((t) => t.root === fromRoot) ?? list[0]).id;
}

// Strong forms that name a skill even when it is not installed.
function strongForms() {
  return [
    new RegExp(String.raw`\x60/(${NAME_CHARS})(?:\s[^\x60]*)?\x60`, 'g'),
    new RegExp(String.raw`\x60(${NAME_CHARS})\x60\s+skill\b`, 'gi'), // "the `x` skill", "our `x` skill", "Invoke `x` skill"
    new RegExp(String.raw`\bSkill\(\s*["'\x60]?(${NAME_CHARS})["'\x60]?\s*[,)]`, 'g'),
  ];
}

const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
// The start of an HTML block that can end a paragraph, as CommonMark has it
// (kinds 1 to 6): raw text, a comment, a declaration and a block-level tag.
// An inline tag or an autolink (`<kbd>`, `<https://example.com>`) is text of its paragraph.
const HTML_BLOCK = new RegExp(String.raw`^\s{0,3}<(?:(?:script|pre|style|textarea)(?:[\s>]|$)|!--|\?|![A-Za-z]|!\[CDATA\[|\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[\s>]|\/>|$))`, 'i');
// Lines that are a unit of their own: a heading, a table row, an HTML block's
// start, and a rule or a setext heading's underline.
const ALONE = new RegExp(String.raw`^\s{0,3}#{1,6}(?:[ \t]|$)|^\s*\||${HTML_BLOCK.source}|^\s*(?:[-*_=][ \t]*){3,}$`, 'i');
const QUOTE = /^\s*>/;
const QUOTE_LEAD = /^\s*(?:>[ \t]?)*[ \t]*/;
// An inline or reference Markdown link or image, read as its visible text.
const MD_LINK = /!?\[([^[\]\n]*)\](?:\((?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)|\[[^[\]\n]*\])/g;

/**
 * Prose lines as the texts their sentences are read over: each paragraph or
 * list item one text, its consecutive lines of one step joined by a line
 * break with their indent (and a quote's `>`) left out, a line without `>`
 * continuing a quote's paragraph as Markdown reads it, and every Markdown
 * link or image as its visible text. A blank line, a heading, a list item's
 * start, a table row, an HTML block's start, a rule and a gap left by fenced
 * code each end a text, however long it is. Each text keeps where its
 * characters came from, so a link is quoted from and numbered by its own
 * line [locate].
 * @param {{ line:number, text:string, step:string|null }[]} lines in order
 * @param {{ whole?:boolean }} [opts] whole: only blank lines end a text (a frontmatter value)
 * @returns {{ text:string, step:string|null, pieces:{ at:number, col:number, line:number, src:string }[] }[]}
 */
export function proseUnits(lines, { whole = false } = {}) {
  const units = [];
  let cur = null;
  for (const l of lines) {
    if (!l.text.trim()) { cur = null; continue; }
    const alone = !whole && ALONE.test(l.text);
    const quote = !whole && QUOTE.test(l.text);
    const joins = cur && !cur.alone && !alone && !(!whole && LIST_ITEM.test(l.text)) && cur.last === l.line - 1
      && cur.step === l.step && (cur.quote === quote || cur.quote);
    if (joins) {
      const lead = (quote ? QUOTE_LEAD : /^\s*/).exec(l.text)[0].length;
      cur.text += '\n';
      readVisible(cur, l, lead);
    } else {
      cur = { text: '', step: l.step, pieces: [], alone, quote, last: l.line };
      units.push(cur);
      readVisible(cur, l, 0);
    }
    cur.last = l.line;
  }
  return units.map(({ text, step, pieces }) => ({ text, step, pieces }));
}

// Append line `l` from column `from` to the unit, each Markdown link as its visible text.
function readVisible(unit, l, from) {
  const copy = (start, end) => {
    if (end <= start) return;
    unit.pieces.push({ at: unit.text.length, col: start, line: l.line, src: l.text });
    unit.text += l.text.slice(start, end);
  };
  let pos = from;
  MD_LINK.lastIndex = from;
  for (let m; (m = MD_LINK.exec(l.text));) {
    copy(pos, m.index);
    const open = m.index + m[0].indexOf('[') + 1;
    copy(open, open + m[1].length);
    pos = m.index + m[0].length;
  }
  copy(pos, l.text.length);
}

// The source line and its column of offset `at` in a unit's text.
function locate(unit, at) {
  const { pieces } = unit;
  let lo = 0;
  for (let hi = pieces.length - 1; lo < hi;) {
    const mid = (lo + hi + 1) >> 1;
    if (pieces[mid].at <= at) lo = mid; else hi = mid - 1;
  }
  const p = pieces[lo];
  return { line: p.line, src: p.src, col: p.col + (at - p.at) };
}

/**
 * Find links in a skill's prose.
 * @param {object} matcher from buildLinkMatcher
 * @param {{ id:string, root:string }} from the skill scanned
 * @param {ReturnType<typeof proseUnits>} units prose (fenced code removed) as proseUnits reads it
 * @returns {{ edges: object[], unresolved: object[] }}
 */
export function findLinks(matcher, from, units) {
  const fromId = from.id;
  const best = new Map(); // keepLink's key -> edge
  const unresolved = new Map();
  for (const unit of units) {
    const { text, step } = unit;
    if (!text.trim()) continue;
    const where = (i) => { const loc = locate(unit, i); return { line: loc.line, text: evidence(loc.src, loc.col) }; };
    const sentences = sentencesOf(text);
    // The name found at `at` by `form`, kept as a link unless its sentence rules it out.
    const consider = (form, name, at) => {
      const to = resolve(matcher, name, from.root);
      if (!to || to === fromId) return; // no skill's (or case differs, in a case-insensitive form), or a self-link
      const sentence = sentences.at(at);
      let kind = form.kind;
      if (form.needsSkillWord && !sentence.says(SAYS_SKILL) && !name.includes('-')) return;
      if (form.slash && PATH_LIKE.has(name.toLowerCase()) && !sentence.says(SAYS_COMMAND)) return;
      if (steeredAway(text.slice(Math.max(sentence.start, at - STEER_REACH), at)) || sentence.says(STEER_AWAY_SENTENCE)) kind = 'mentions';
      keepLink(best, { from: fromId, fromStep: step, to, kind, source: 'scan', evidence: where(at) });
    };
    for (const form of matcher.forms) {
      form.re.lastIndex = 0;
      for (const m of text.matchAll(form.re)) {
        consider(form, m[1], m.index + m[0].lastIndexOf(m[1]));
        if (!form.chain) continue;
        for (let pos = m.index + m[0].length; ;) {
          form.chain.lastIndex = pos;
          const c = form.chain.exec(text);
          if (!c) break;
          consider(form, c[1], c.index + c[0].lastIndexOf(c[1]));
          pos = form.chain.lastIndex;
        }
      }
    }
    for (const re of matcher.strong) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const name = m[1];
        if (matcher.targets.has(name)) continue;
        const at = m.index + m[0].indexOf(name);
        if (m[0].startsWith('`/')) {
          // A backticked `/x` is a command only in a sentence saying skill,
          // command, slash or type, and no skill where the agent itself has
          // that command; `Skill(x)` and "`x` skill" name a skill whatever x is.
          if (BUILTIN_COMMANDS.has(name) || PATH_LIKE.has(name.toLowerCase()) || !sentences.at(at).says(CONTEXT_FOR_UNRESOLVED)) continue;
        }
        const key = `${step}\0${name}`;
        if (!unresolved.has(key)) unresolved.set(key, { from: fromId, fromStep: step, name, evidence: where(at) });
      }
    }
  }
  return { edges: [...best.values()], unresolved: [...unresolved.values()] };
}

/**
 * Keep one link per (skill, step, target) in `best`: the first found, unless
 * it mentions and this one calls. Every place the scan or an annotation
 * gathers links keeps them by this rule.
 * @param {Map<string, object>} best
 * @param {{ from:string, fromStep:string|null, to:string, kind:string }} edge
 */
export function keepLink(best, edge) {
  const key = `${edge.from}\0${edge.fromStep}\0${edge.to}`;
  const prev = best.get(key);
  if (prev && (prev.kind === 'calls' || edge.kind === 'mentions')) return;
  best.set(key, edge);
}

/** `edges` with one link per (skill, step, target) by keepLink, in the order first found. */
export function oneLinkEach(edges) {
  const best = new Map();
  for (const e of edges) keepLink(best, e);
  return [...best.values()];
}

// Whether the last steering words before a name still reach it: no clause
// opening with a verb of use stands between them and the name. A verb right
// after them is theirs ("rather than run X").
function steeredAway(before) {
  let last = null;
  STEER_AWAY_BEFORE.lastIndex = 0;
  for (const m of before.matchAll(STEER_AWAY_BEFORE)) last = m;
  if (!last) return false;
  return !CLAUSE_OF_USE.test(before.slice(last.index + last[0].length));
}

// How far before a name its sentence is searched for steering words, so a
// text with no sentence end costs a bounded read per name.
const STEER_REACH = 4000;

// The sentences of `text` (each ending at . ! ? ; before a space), found
// once: `at(i)` gives the one holding offset `i`, its start and whether it
// says what a pattern matches, each pattern tried once per sentence.
function sentencesOf(text) {
  const ends = [];
  for (const m of text.matchAll(/[.!?;](?=\s|$)/g)) ends.push(m.index);
  const cache = new Map();
  return {
    at(i) {
      let lo = 0;
      for (let hi = ends.length; lo < hi;) { const mid = (lo + hi) >> 1; if (ends[mid] >= i) hi = mid; else lo = mid + 1; }
      if (!cache.has(lo)) {
        const start = lo ? ends[lo - 1] + 1 : 0;
        const end = lo < ends.length ? ends[lo] + 1 : text.length;
        const said = new Map();
        cache.set(lo, {
          start,
          says(re) { if (!said.has(re)) said.set(re, re.test(text.slice(start, end))); return said.get(re); },
        });
      }
      return cache.get(lo);
    },
  };
}

function evidence(text, at) {
  const t = text.trim();
  if (t.length <= EVIDENCE_TEXT_MAX) return t;
  const offset = text.length - text.trimStart().length;
  const half = Math.floor(EVIDENCE_TEXT_MAX / 2);
  const start = Math.max(0, Math.min(at - offset - half, t.length - EVIDENCE_TEXT_MAX + 1));
  const clipped = clipText(t.slice(start), EVIDENCE_TEXT_MAX - (start > 0 ? 1 : 0));
  return (start > 0 ? '\u2026' : '') + clipped;
}
