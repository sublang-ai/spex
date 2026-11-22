// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The language a file is written in (data-model.md "Languages"): the one a
// SKILL.md's frontmatter names in `metadata.language`, else the one the
// script most of its text outside fenced code is in. The scan reports it for
// each skill and the server for each original file it returns, so the page
// keeps no rule of its own.

import { fenceMask } from './markdown.mjs';
import { splitFrontmatter } from './frontmatter.mjs';
import { canonicalTag } from './translations.mjs';

// Han, kana and hangul letters, each weighing as much as three letters of
// another script, outweighing the Latin ones make a text Japanese where kana
// are at least a tenth of the Han and kana, Korean where hangul are most, else
// Chinese; Latin letters most make it English; letters of any other script
// (Cyrillic, Arabic, Greek, Devanagari...) most make it unknown, `und`. So an
// English skill quoting a Chinese or Japanese example stays English.
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const KANA = /[\u3041-\u3096\u30A1-\u30FA\u31F0-\u31FF\uFF66-\uFF9D]/g; // letters only: no U+30FB middle dot or U+30FC prolonged sound mark
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g;
const LATIN = /\p{Script=Latin}/gu;
const OTHER = /[^\P{L}\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Common}\p{Script=Inherited}]/gu;
const CJK_WEIGHT = 3;
const DECLARED = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;
const count = (text, re) => (text.match(re) || []).length;

/** The language of a text by the script most of its letters are in: zh, ja, ko, en or und. */
export function textLanguage(text) {
  const han = count(text, HAN);
  const kana = count(text, KANA);
  const hangul = count(text, HANGUL);
  const cjk = CJK_WEIGHT * (han + kana + hangul);
  const latin = count(text, LATIN);
  const other = count(text, OTHER);
  if (other > latin && other > cjk) return 'und';
  if (cjk <= latin) return 'en';
  if (hangul > han + kana) return 'ko';
  return kana * 10 >= han + kana ? 'ja' : 'zh';
}

/** The tag a frontmatter's `metadata.language` names, in its canonical case where known, or null. */
export function declaredLanguage(data) {
  const meta = data && typeof data === 'object' ? data.metadata : null;
  const value = meta && typeof meta === 'object' && !Array.isArray(meta) && typeof meta.language === 'string' ? meta.language.trim() : '';
  if (!DECLARED.test(value)) return null;
  return canonicalTag(value) ?? value;
}

/**
 * The language a file is written in: for a SKILL.md (`skillFile`), the one its
 * frontmatter declares, else the language of its whole text outside fenced
 * code and HTML comments.
 * @param {string} text the file's text
 * @param {{ skillFile?: boolean }} [opts]
 */
export function fileLanguage(text, { skillFile = false } = {}) {
  const normalized = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  let bodyStart = 0;
  if (skillFile) {
    const fm = splitFrontmatter(normalized);
    const declared = declaredLanguage(fm.data); // a field in error leaves `metadata.language` standing [frontmatter.mjs]
    if (declared) return declared;
    bodyStart = fm.bodyStart;
  }
  const mask = fenceMask(lines);
  for (let i = 0; i < bodyStart; i++) mask[i] = false; // frontmatter is no fenced code
  const prose = lines.filter((_, i) => !mask[i]).join('\n').replace(/<!--[\s\S]*?-->/g, ' ');
  return textLanguage(prose);
}
