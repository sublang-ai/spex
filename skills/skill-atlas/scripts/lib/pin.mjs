// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `atlas.mjs pin`: record in each translation the SHA-256 of the file it
// translates and, in Markdown, its own, or with --check name each translation
// behind its source, edited apart from it or recording no digest, changing no
// file (data-model.md "Languages"). A translation in the state folder whose
// skill or source the scan does not find, and a folder named holding no
// translation, are named and fail either command.

import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from './log.mjs';
import { TRANSLATIONS_DIR, parseTranslationName, sourceRelOf, listFiles, fileInside, recordedDigests, recordsOwn, ownDigest, withRecordedDigest, sha256Hex } from './translations.mjs';

/**
 * @param {{ targets:string[], check:boolean, stateDir:string, skills:() => { id:string, dir:string }[] }} opts
 *   skills: the scanned skills, asked for only when a target lies in the state folder's translations/
 * @returns {{ lines:string[], failed:boolean }}
 */
export function pin({ targets, check, stateDir, skills }) {
  if (!targets.length) throw new UsageError('pin needs at least one translation or folder; see --help');
  let stateRoot = null;
  try { stateRoot = fs.realpathSync(path.join(stateDir, TRANSLATIONS_DIR)); } catch { /* no state translations */ }
  let byId = null;
  const skillById = (id) => {
    byId ??= new Map(skills().map((s) => [s.id, s]));
    return byId.get(id) ?? null;
  };

  // The source of a translation, or null (with `why`) where `abs` is none.
  const sourceOf = (abs) => {
    const parsed = parseTranslationName(path.basename(abs));
    if (!parsed) return { why: 'its name has no language tag before the extension (such as SKILL.zh-CN.md)' };
    const real = fs.realpathSync(abs);
    const inState = stateRoot ? path.relative(stateRoot, real) : '..';
    if (inState && !inState.startsWith('..') && !path.isAbsolute(inState)) {
      if (!inState.includes(path.sep)) return { inState: true, why: `it lies directly under ${TRANSLATIONS_DIR}/ of the state folder and names no skill id folder; move it into ${TRANSLATIONS_DIR}/<skill id>/` };
      const [id, ...rest] = inState.split(path.sep);
      const skill = skillById(id);
      if (!skill) return { inState: true, why: `it lies under ${TRANSLATIONS_DIR}/${id}/ of the state folder, and no scanned skill has the id "${id}"; pass the --cwd, --root or --state that find it` };
      const src = sourceRelOf(rest.join('/'));
      const source = src ? fileInside(fs.realpathSync(skill.dir), path.join(skill.dir, ...src.sourceRel.split('/'))) : null;
      return source ? { source, tag: parsed.tag } : { inState: true, why: `${skill.id} has no file ${src?.sourceRel ?? rest.join('/')} for it to translate` };
    }
    const source = path.join(path.dirname(abs), parsed.sourceName);
    let isFile = false;
    try { isFile = fs.statSync(source).isFile(); } catch { /* no source */ }
    return isFile ? { source, tag: parsed.tag } : { why: `there is no ${parsed.sourceName} beside it for it to translate` };
  };

  const found = new Map(); // real path -> { abs, source }
  const orphans = new Map(); // real path -> { abs, why }: state translations the scan finds no source for
  const empty = []; // { target, why }: folders holding no translation
  for (const target of targets) {
    const abs = path.resolve(target);
    let stat;
    try { stat = fs.statSync(abs); } catch { throw new UsageError(`${target} does not exist; name a translation or a folder holding them`); }
    if (stat.isDirectory()) {
      let n = 0;
      let named = 0; // files named like a translation with no source beside them
      for (const rel of listFiles(abs)) {
        const file = path.join(abs, ...rel.split('/'));
        if (!parseTranslationName(path.basename(file))) continue;
        const src = sourceOf(file);
        if (!src.source) {
          // Outside the state folder such a name is a file of its own; inside it, a translation of nothing found.
          if (src.inState) { orphans.set(fs.realpathSync(file), { abs: file, why: src.why }); n++; } else named++;
          continue;
        }
        found.set(fs.realpathSync(file), { abs: file, source: src.source });
        n++;
      }
      if (!n) {
        empty.push({
          target,
          why: named
            ? `it holds no translation: ${named} ${named === 1 ? 'file is' : 'files are'} named like one, with no source beside ${named === 1 ? 'it' : 'them'} and outside the state folder ${stateDir}; for translations under translations/<skill id>/ of another state folder, pass its --state`
            : 'it holds no translation',
        });
      }
    } else {
      const src = sourceOf(abs);
      if (!src.source) throw new UsageError(`${target} is not a translation: ${src.why}`);
      found.set(fs.realpathSync(abs), { abs, source: src.source });
    }
  }

  const shown = (abs) => {
    const rel = path.relative(process.cwd(), abs);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
  };
  const lines = [];
  for (const { abs, why } of orphans.values()) {
    if (check) lines.push(`no skill    ${shown(abs)} (${why})`);
  }
  if (check) for (const { target, why } of empty) lines.push(`none        ${target} (${why})`);
  let behind = 0;
  let edited = 0;
  let unpinned = 0;
  const writes = [];
  const failures = [];
  for (const { abs, source } of found.values()) {
    const ext = path.extname(abs).toLowerCase();
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch (err) { throw new UsageError(`cannot read ${abs}: ${err.message}`); }
    const hex = sha256Hex(fs.readFileSync(source));
    const recorded = recordedDigests(text, ext);
    const own = recordsOwn(ext) ? ownDigest(text, ext) : null;
    if (check) {
      if (recorded.source === null) { unpinned++; lines.push(`no digest   ${shown(abs)}`); continue; }
      if (recorded.source !== hex) { behind++; lines.push(`behind      ${shown(abs)} (source ${shown(source)} changed)`); }
      if (recorded.own !== null && recorded.own !== own) { edited++; lines.push(`edited      ${shown(abs)} (changed apart from its source)`); }
      if (own !== null && recorded.own === null) { unpinned++; lines.push(`no digest   ${shown(abs)} (its own digest is not recorded)`); }
      continue;
    }
    if (recorded.source === hex && recorded.own === own) { lines.push(`up to date  ${shown(abs)}`); continue; }
    try {
      writes.push({ abs, next: withRecordedDigest(text, ext, hex) });
    } catch (err) {
      failures.push(`${abs}: ${err.message}`);
    }
  }
  if (!check) for (const { abs, why } of orphans.values()) failures.push(`${abs}: ${why}`);
  if (!check) for (const { target, why } of empty) failures.push(`${target}: ${why}`);
  // Every record is made before any is written, so a refusal changes no file.
  if (failures.length) throw new UsageError(`cannot record the digest in ${failures.join('; ')}; no translation was changed`);
  let pinned = 0;
  for (const { abs, next } of writes) {
    try { fs.writeFileSync(abs, next); } catch (err) {
      const done = writes.slice(0, pinned).map((w) => shown(w.abs));
      throw new UsageError(`cannot write ${abs}: ${err.message}; ${pinned ? `recorded before it: ${done.join(', ')}` : 'no translation was changed'}`);
    }
    pinned++;
    lines.push(`pinned      ${shown(abs)}`);
  }
  const total = found.size + orphans.size;
  if (check) {
    const parts = [];
    if (behind || edited || unpinned) parts.push(`${behind} of ${total} translations behind their source, ${edited} edited apart from it, ${unpinned} with no digest; carry the change across, then run pin`);
    if (orphans.size) parts.push(`${orphans.size} in the state folder translating no skill or file the scan finds; pass the --cwd, --root or --state that find it, or remove it`);
    if (empty.length) parts.push(`${empty.length} ${empty.length === 1 ? 'folder holds' : 'folders hold'} no translation`);
    lines.push(parts.length ? `pin --check: ${parts.join('; ')}` : `pin --check: ${total} translations up to date`);
  } else {
    lines.push(`pin: ${pinned} of ${total} translations recorded`);
  }
  return { lines, failed: check && (behind + edited + unpinned + orphans.size + empty.length) > 0 };
}
