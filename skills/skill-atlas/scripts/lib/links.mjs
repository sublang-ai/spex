// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Links between skills, per the data-model.md table. Generic names such as
// `code` or `review` are ordinary words, so only these forms count:
//   calls:    `/N` as a command (not a path: no word, `/`, `.`, `-`, `~`, `:`
//             or `@` before the slash, no path preposition or HTTP method
//             right before it, and a folder-like name only in a sentence
//             saying skill, command, slash or playbook); `Skill(N)`;
//             `skill: N` as a key (case-sensitive, at the line start or after
//             `{` or `,`); N beside a verb of use and the word skill or
//             playbook, or the word command when N is backticked or slashed;
//   mentions: any of those after words steering away from it in its
//             sentence, up to a clause opening with a verb of use (or in a
//             sentence holding a bare "instead"), or `N` in backticks when the
//             sentence says "skill" or N has a hyphen.

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
// with a verb of use, so "instead of Y, use X" calls X too; "X, not Y" and
// "X but not Y" steer away from Y. A bare "instead" ("use `/x` instead")
// points away from the skill itself, so it steers the whole sentence.
const STEER_AWAY_BEFORE = /\b(?:not for|do not use|don't use|never use|instead of|rather than|see also)\b|(?:,|\bbut)\s+not\b/gi;
const CLAUSE_OF_USE = new RegExp(String.raw`[,:\u2013\u2014]\s*(?:(?:and|but|then|so|instead)\s+)?(?:please\s+)?(?:${VERBS})\b`, 'i');
const STEER_AWAY_SENTENCE = /\binstead\b(?!\s+of\b)/i;
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
    { kind: 'calls', re: new RegExp(String.raw`(?:^\s*(?:-\s+)?|[{,]\s*)["']?skill["']?\s*:\s*["'\x60]?(${ALT})${NAME_END}`, 'g') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;\n]{0,40}?(?<![\w/.:-])[\x60"']?/?(${ALT})[\x60"']?\s+(?:${NOUNS})s?\b`, 'gi') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;\n]{0,40}?\b(?:${NOUNS})\s+[\x60"']?/?(${ALT})${NAME_END}`, 'gi') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;\n]{0,40}?(?<![\w/.:-])(?:\x60/?|/)(${ALT})\x60?\s+commands?\b`, 'gi') },
    { kind: 'calls', re: new RegExp(String.raw`\b(?:${VERBS})\b[^.!?;\n]{0,40}?\bcommands?\s+(?:\x60/?|/)(${ALT})${NAME_END}`, 'gi') },
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

/**
 * Find links in a skill's lines.
 * @param {object} matcher from buildLinkMatcher
 * @param {{ id:string, root:string }} from the skill scanned
 * @param {{ line:number, text:string, step:string|null }[]} lines prose lines (fenced code removed)
 * @returns {{ edges: object[], unresolved: object[] }}
 */
export function findLinks(matcher, from, lines) {
  const fromId = from.id;
  const best = new Map(); // `${fromStep}\0${to}` -> edge
  const unresolved = new Map();
  for (const { line, text, step } of lines) {
    if (!text.trim()) continue;
    for (const form of matcher.forms) {
      form.re.lastIndex = 0;
      for (const m of text.matchAll(form.re)) {
        const name = m[1];
        const to = resolve(matcher, name, from.root);
        if (!to || to === fromId) continue; // case differs (case-insensitive form) or a self-link
        const at = m.index + m[0].lastIndexOf(name);
        const span = sentenceSpan(text, at);
        const sentence = text.slice(span.start, span.end);
        let kind = form.kind;
        if (form.needsSkillWord && !SAYS_SKILL.test(sentence) && !name.includes('-')) continue;
        if (form.slash && PATH_LIKE.has(name.toLowerCase()) && !SAYS_COMMAND.test(sentence)) continue;
        if (steeredAway(text.slice(span.start, at)) || STEER_AWAY_SENTENCE.test(sentence)) kind = 'mentions';
        const key = `${step}\0${to}`;
        const prev = best.get(key);
        if (prev && (prev.kind === 'calls' || kind === 'mentions')) continue;
        best.set(key, { from: fromId, fromStep: step, to, kind, source: 'scan', evidence: { line, text: evidence(text, at) } });
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
          if (BUILTIN_COMMANDS.has(name) || PATH_LIKE.has(name.toLowerCase()) || !CONTEXT_FOR_UNRESOLVED.test(sentenceAt(text, at))) continue;
        }
        const key = `${step}\0${name}`;
        if (!unresolved.has(key)) unresolved.set(key, { from: fromId, fromStep: step, name, evidence: { line, text: evidence(text, at) } });
      }
    }
  }
  return { edges: [...best.values()], unresolved: [...unresolved.values()] };
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

// The sentence of `text` around index `at` (sentences end at . ! ? ; before a space).
function sentenceAt(text, at) {
  const { start, end } = sentenceSpan(text, at);
  return text.slice(start, end);
}

// The [start, end) offsets of that sentence in `text`.
function sentenceSpan(text, at) {
  const ends = /[.!?;](?=\s|$)/g;
  let start = 0;
  for (const m of text.matchAll(ends)) {
    if (m.index >= at) return { start, end: m.index + 1 };
    start = m.index + 1;
  }
  return { start, end: text.length };
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
