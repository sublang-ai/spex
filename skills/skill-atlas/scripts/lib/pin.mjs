// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `atlas.mjs pin`: record in each translation the SHA-256 of the file it
// translates and, in Markdown, its own, or with --check name each translation
// behind its source, edited apart from it or recording no digest, changing no
// file (data-model.md "Languages"). A translation in the state folder whose
// skill or source the scan does not find, a folder named holding no
// translation, a folder that cannot be read whole, a link in a folder named
// that cannot be followed, and one file reached as the translation of two
// different sources, or that is itself a source (of another translation, a
// translation beside it, or a skill's SKILL.md), are named and fail either
// command, before any file is written. A file its source links to, by a
// symbolic or a hard link, is that source itself: passed over in a folder,
// refused where named.

import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from './log.mjs';
import { TRANSLATIONS_DIR, parseTranslationName, sourceRelOf, listFilesBounded, fileInside, fileId, recordedDigests, recordsOwn, ownDigest, withRecordedDigest, sha256Hex } from './translations.mjs';

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
      if (!source) return { inState: true, why: `${skill.id} has no file ${src?.sourceRel ?? rest.join('/')} for it to translate` };
      return fileId(source) === fileId(real) ? { self: source, why: `it is ${source} itself, through a link, so it translates nothing` } : { source, sourceId: fileId(source), tag: parsed.tag };
    }
    const source = path.join(path.dirname(abs), parsed.sourceName);
    let isFile = false;
    try { isFile = fs.statSync(source).isFile(); } catch { /* no source */ }
    if (!isFile) return { why: `there is no ${parsed.sourceName} beside it for it to translate` };
    const sourceId = fileId(source);
    // A source linking to the file (SKILL.md to SKILL.en.md), symbolically or
    // hard, makes it the source itself: writing a record into it would change its source.
    if (sourceId === fileId(real)) return { self: source, why: `${parsed.sourceName} beside it is a link to it, so it is that file itself and translates nothing` };
    return { source, sourceId, tag: parsed.tag };
  };

  // Each translation once, by its file's identity [fileId], with every source it is reached as translating:
  // one file reached as the translation of two different sources is refused.
  const found = new Map(); // file id -> { abs, source, sources: Map(source file id -> source) }
  const add = (abs, src) => {
    const id = fileId(abs);
    const at = found.get(id);
    if (at) { if (!at.sources.has(src.sourceId)) at.sources.set(src.sourceId, src.source); return; }
    found.set(id, { abs, source: src.source, sources: new Map([[src.sourceId, src.source]]) });
  };
  const notOnes = new Map(); // real path -> { abs, why }: files their source links to, passed over
  const orphans = new Map(); // real path -> { abs, why }: state translations the scan finds no source for
  const empty = []; // { target, why }: folders holding no translation
  const partial = []; // { target, why }: folders that cannot be listed whole
  const broken = []; // links inside a folder named that cannot be followed
  for (const target of targets) {
    const abs = path.resolve(target);
    let stat;
    try { stat = fs.statSync(abs); } catch { throw new UsageError(`${target} does not exist; name a translation or a folder holding them`); }
    if (stat.isDirectory()) {
      let n = 0;
      let named = 0; // files named like a translation with no source beside them
      // A partial listing would pass over translations: the folder is named and fails the command.
      // Every depth is walked, hidden folders such as .agents and .claude and
      // linked ones (a skill linked in from elsewhere) included, each real
      // folder once; only .git and node_modules are passed over.
      const listing = listFilesBounded(abs, { strict: true, hidden: true, follow: true });
      if (!listing.complete) partial.push({ target, why: 'it cannot be read whole: it holds more files or folders than pin lists, or an entry that cannot be read' });
      for (const rel of listing.broken) broken.push(path.join(target, ...rel.split('/')));
      for (const rel of listing.files) {
        const file = path.join(abs, ...rel.split('/'));
        if (!parseTranslationName(path.basename(file))) continue;
        const src = sourceOf(file);
        if (src.self) { notOnes.set(fileId(file), { abs: file, why: src.why }); continue; }
        if (!src.source) {
          // Outside the state folder such a name is a file of its own; inside it, a translation of nothing found.
          if (src.inState) { orphans.set(fileId(file), { abs: file, why: src.why }); n++; } else named++;
          continue;
        }
        add(file, src);
        n++;
      }
      if (!n && listing.complete && !listing.broken.length) {
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
      add(abs, src);
    }
  }
  // Every translation's sources are known before any file is read or written.
  const shared = [...found.values()].filter((f) => f.sources.size > 1);
  // A translation that is itself a source, reached through a link, would
  // change that source when its record is written: refused, and never written.
  const sourceOfRun = new Map(); // source file id -> a translation of it in this run
  for (const f of found.values()) for (const id of f.sources.keys()) if (!sourceOfRun.has(id)) sourceOfRun.set(id, f.abs);
  for (const [id, f] of found) {
    if (f.sources.size > 1) continue;
    f.alsoSource = alsoSourceWhy(id, f.abs, sourceOfRun);
  }
  const sources = [...found.values()].filter((f) => f.alsoSource);

  const shown = (abs) => {
    const rel = path.relative(process.cwd(), abs);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
  };
  const lines = [];
  for (const { abs, why } of notOnes.values()) lines.push(`passed over ${shown(abs)} (${why})`);
  const sharedWhy = (f) => `it is one file translating ${[...f.sources.values()].map(shown).join(' and ')}; give each its own copy`;
  if (check) for (const f of shared) lines.push(`two sources ${shown(f.abs)} (${sharedWhy(f)})`);
  const sourceWhy = (f) => `${f.alsoSource(shown)}; writing its record would change that source, so give it a file of its own`;
  if (check) for (const f of sources) lines.push(`a source    ${shown(f.abs)} (${sourceWhy(f)})`);
  for (const { abs, why } of orphans.values()) {
    if (check) lines.push(`no skill    ${shown(abs)} (${why})`);
  }
  if (check) for (const { target, why } of empty) lines.push(`none        ${target} (${why})`);
  if (check) for (const { target, why } of partial) lines.push(`incomplete  ${target} (${why})`);
  if (check) for (const link of broken) lines.push(`broken link ${link} (it cannot be followed)`);
  let behind = 0;
  let edited = 0;
  let unpinned = 0;
  const writes = [];
  const failures = [];
  for (const { abs, source, sources: of, alsoSource } of found.values()) {
    if (of.size > 1 || alsoSource) continue; // named above, and never written
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
  if (!check) for (const f of shared) failures.push(`${f.abs}: ${sharedWhy(f)}`);
  if (!check) for (const f of sources) failures.push(`${f.abs}: ${sourceWhy(f)}`);
  if (!check) for (const { abs, why } of orphans.values()) failures.push(`${abs}: ${why}`);
  if (!check) for (const { target, why } of empty) failures.push(`${target}: ${why}`);
  if (!check) for (const { target, why } of partial) failures.push(`${target}: ${why}`);
  if (!check) for (const link of broken) failures.push(`${link}: it is a link that cannot be followed; mend or remove it`);
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
    if (shared.length) parts.push(`${shared.length} ${shared.length === 1 ? 'file translates' : 'files translate'} two or more sources; give each source its own translation`);
    if (sources.length) parts.push(`${sources.length} ${sources.length === 1 ? 'translation is' : 'translations are'} itself a source; give ${sources.length === 1 ? 'it' : 'each'} a file of its own`);
    if (orphans.size) parts.push(`${orphans.size} in the state folder translating no skill or file the scan finds; pass the --cwd, --root or --state that find it, or remove it`);
    if (empty.length) parts.push(`${empty.length} ${empty.length === 1 ? 'folder holds' : 'folders hold'} no translation`);
    if (partial.length) parts.push(`${partial.length} ${partial.length === 1 ? 'folder' : 'folders'} not read whole; name the translations in ${partial.length === 1 ? 'it' : 'them'}, or a smaller folder, or make ${partial.length === 1 ? 'it' : 'them'} readable`);
    if (broken.length) parts.push(`${broken.length} ${broken.length === 1 ? 'link' : 'links'} that cannot be followed; mend or remove ${broken.length === 1 ? 'it' : 'them'}`);
    lines.push(parts.length ? `pin --check: ${parts.join('; ')}` : `pin --check: ${total} translations up to date`);
  } else {
    lines.push(`pin: ${pinned} of ${total} translations recorded`);
  }
  return { lines, failed: check && (behind + edited + unpinned + shared.length + sources.length + orphans.size + empty.length + partial.length + broken.length) > 0 };
}

// Why the translation `abs` (file id `id`) is itself a source, as a function
// of how a path is shown, or null: the source of another translation pinned
// in this run, a skill's SKILL.md, or the file a translation beside its real
// place translates.
function alsoSourceWhy(id, abs, sourceOfRun) {
  if (sourceOfRun.has(id)) return (shown) => `it is the file ${shown(sourceOfRun.get(id))} translates`;
  const real = fs.realpathSync(abs);
  const name = path.basename(real);
  if (name === 'SKILL.md') return (shown) => `it is ${shown(real)}, a skill's SKILL.md`;
  let entries = [];
  try { entries = fs.readdirSync(path.dirname(real)); } catch { /* none read */ }
  for (const entry of entries.sort()) {
    if (parseTranslationName(entry)?.sourceName !== name) continue;
    const other = path.join(path.dirname(real), entry);
    let otherId = null;
    try { otherId = fileId(other); } catch { continue; }
    if (otherId !== id) return (shown) => `it is ${shown(real)}, the file ${shown(other)} translates`;
  }
  return null;
}
