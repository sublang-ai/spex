// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `atlas.mjs pin`: record in each translation the SHA-256 of the file it
// translates and, in Markdown, its own, or with --check name each translation
// behind its source, edited apart from it or recording no digest, changing no
// file (data-model.md "Languages"). What a translation translates is told from
// the name it is reached by, as the scan and the server read it; whether it may
// be written, from the file it is: one that is, through any link, the same file
// as a file of a folder the run involves that is no translation of its source,
// or as a source of the run, or that has a hard link pin finds in none of the
// folders it reads, is named with that file and fails either command before
// any file is written [sameFiles]. A file its source links to is that
// source itself: passed over in a folder, refused where named. A translation in
// the state folder whose skill or source the scan does not find, a folder named
// holding no translation, a folder that cannot be read whole, a link in a
// folder named that cannot be followed, and one file reached as the
// translation of two different sources fail either command alike.

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
  const reals = new Map();
  const realOf = (p) => {
    if (!reals.has(p)) { let r = null; try { r = fs.realpathSync(p); } catch { /* none */ } reals.set(p, r); }
    return reals.get(p);
  };
  const idOf = (p) => { try { return fileId(p); } catch { return null; } };
  // Where `abs`, by the path it is reached by, lies below the state folder's
  // translations/ (a folder above it leading there): that folder and the path below it, or null.
  const inStateOf = (abs) => {
    if (!stateRoot) return null;
    for (let dir = path.dirname(abs); ; dir = path.dirname(dir)) {
      if (realOf(dir) === stateRoot) return { base: dir, rel: path.relative(dir, abs) };
      if (path.dirname(dir) === dir) return null;
    }
  };

  // What `abs` translates, told from the name it is reached by, or null (with `why`) where it is no translation.
  const sourceOf = (abs) => {
    const parsed = parseTranslationName(path.basename(abs));
    if (!parsed) return { why: 'its name has no language tag before the extension (such as SKILL.zh-CN.md)' };
    const inState = inStateOf(abs);
    if (inState) {
      if (!inState.rel.includes(path.sep)) return { inState: true, why: `it lies directly under ${TRANSLATIONS_DIR}/ of the state folder and names no skill id folder; move it into ${TRANSLATIONS_DIR}/<skill id>/` };
      const [id, ...rest] = inState.rel.split(path.sep);
      const skill = skillById(id);
      if (!skill) return { inState: true, why: `it lies under ${TRANSLATIONS_DIR}/${id}/ of the state folder, and no scanned skill has the id "${id}"; pass the --cwd, --root or --state that find it` };
      // As the scan and the server read it: a file inside translations/<skill id>/, its source inside the skill's folder.
      const own = realOf(path.join(inState.base, id));
      if (!own || !fileInside(own, abs)) return { inState: true, why: `it leads out of ${TRANSLATIONS_DIR}/${id}/ of the state folder, where the scan does not read it` };
      const src = sourceRelOf(rest.join('/'));
      const skillReal = realOf(skill.dir);
      const source = src && skillReal ? fileInside(skillReal, path.join(skill.dir, ...src.sourceRel.split('/'))) : null;
      if (!source) return { inState: true, why: `${skill.id} has no file ${src?.sourceRel ?? rest.join('/')} for it to translate` };
      const sourceId = fileId(source);
      return sourceId === idOf(abs) ? { self: source, why: `it is ${source} itself, through a link, so it translates nothing` } : { source, sourceId, tag: parsed.tag, skillDir: skill.dir };
    }
    const source = path.join(path.dirname(abs), parsed.sourceName);
    let isFile = false;
    try { isFile = fs.statSync(source).isFile(); } catch { /* no source */ }
    if (!isFile) return { why: `there is no ${parsed.sourceName} beside it for it to translate` };
    const sourceId = fileId(source);
    // A source linking to the file (SKILL.md to SKILL.en.md), symbolically or
    // hard, makes it the source itself: writing a record into it would change its source.
    if (sourceId === idOf(abs)) return { self: source, why: `${parsed.sourceName} beside it is a link to it, so it is that file itself and translates nothing` };
    return { source, sourceId, tag: parsed.tag };
  };

  // Each translation once, by its file's identity [fileId], with every source it is reached as translating:
  // one file reached as the translation of two different sources is refused.
  const found = new Map(); // file id -> { abs, source, skillDir, sources: Map(source file id -> source) }
  const add = (abs, src) => {
    const id = fileId(abs);
    const at = found.get(id);
    if (at) { if (!at.sources.has(src.sourceId)) at.sources.set(src.sourceId, src.source); return; }
    found.set(id, { abs, source: src.source, skillDir: src.skillDir ?? null, sources: new Map([[src.sourceId, src.source]]) });
  };
  const notOnes = new Map(); // file id -> { abs, why }: files their source links to, passed over
  const orphans = new Map(); // file id -> { abs, why }: state translations the scan finds no source for
  const empty = []; // { target, why }: folders holding no translation
  const partial = []; // { target, why }: folders that cannot be listed whole
  const broken = []; // links inside a folder named that cannot be followed
  const walked = new Map(); // folder -> its listing, each walked once
  // Every depth is walked, hidden folders such as .agents and .claude and
  // linked ones (a skill linked in from elsewhere) included, each real folder
  // once; only .git and node_modules are passed over.
  const listing = (dir) => {
    if (!walked.has(dir)) walked.set(dir, listFilesBounded(dir, { strict: true, hidden: true, follow: true }));
    return walked.get(dir);
  };
  for (const target of targets) {
    const abs = path.resolve(target);
    let stat;
    try { stat = fs.statSync(abs); } catch { throw new UsageError(`${target} does not exist; name a translation or a folder holding them`); }
    if (stat.isDirectory()) {
      let n = 0;
      let named = 0; // files named like a translation with no source beside them
      // A partial listing would pass over translations: the folder is named and fails the command.
      const listed = listing(abs);
      if (!listed.complete) partial.push({ target, why: 'it cannot be read whole: it holds more files or folders than pin lists, or an entry that cannot be read' });
      for (const rel of listed.broken) broken.push(path.join(target, ...rel.split('/')));
      for (const rel of listed.files) {
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
      if (!n && listed.complete && !listed.broken.length) {
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
  // A translation is written only where no file of a skill folder the run
  // involves that is not a translation of its source is that same file.
  const same = sameFiles(found, { listing, realOf, idOf, sourceOf, inStateOf, partial, targets, skills });

  const shown = (abs) => {
    const rel = path.relative(process.cwd(), abs);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
  };
  const lines = [];
  for (const { abs, why } of notOnes.values()) lines.push(`passed over ${shown(abs)} (${why})`);
  const sharedWhy = (f) => `it is one file translating ${[...f.sources.values()].map(shown).join(' and ')}; give each its own copy`;
  if (check) for (const f of shared) lines.push(`two sources ${shown(f.abs)} (${sharedWhy(f)})`);
  const sameWhy = (f) => {
    const { paths, unseen } = same.get(f);
    const named = paths.length ? `the same file as ${paths.map(shown).join(' and ')}, no translation of ${shown(f.source)}` : '';
    const elsewhere = unseen ? `${unseen === 1 ? 'a hard link' : `${unseen} hard links`} to a file pin does not find in the folders it reads` : '';
    return `it is ${[named, elsewhere].filter(Boolean).join(', and ')}; writing its record would change ${paths.length + unseen > 1 ? 'them' : 'that file'}, so give it a file of its own`;
  };
  if (check) for (const f of same.keys()) lines.push(`same file   ${shown(f.abs)} (${sameWhy(f)})`);
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
  for (const f of found.values()) {
    const { abs, source, sources: of } = f;
    if (of.size > 1 || same.has(f)) continue; // named above, and never written
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
  if (!check) for (const f of same.keys()) failures.push(`${f.abs}: ${sameWhy(f)}`);
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
    if (same.size) parts.push(`${same.size} ${same.size === 1 ? 'translation is' : 'translations are'} the same file as a file that is no translation of its source; give ${same.size === 1 ? 'it' : 'each'} a file of its own`);
    if (orphans.size) parts.push(`${orphans.size} in the state folder translating no skill or file the scan finds; pass the --cwd, --root or --state that find it, or remove it`);
    if (empty.length) parts.push(`${empty.length} ${empty.length === 1 ? 'folder holds' : 'folders hold'} no translation`);
    if (partial.length) parts.push(`${partial.length} ${partial.length === 1 ? 'folder' : 'folders'} not read whole; name the translations in ${partial.length === 1 ? 'it' : 'them'}, or a smaller folder, or make ${partial.length === 1 ? 'it' : 'them'} readable`);
    if (broken.length) parts.push(`${broken.length} ${broken.length === 1 ? 'link' : 'links'} that cannot be followed; mend or remove ${broken.length === 1 ? 'it' : 'them'}`);
    lines.push(parts.length ? `pin --check: ${parts.join('; ')}` : `pin --check: ${total} translations up to date`);
  } else {
    lines.push(`pin: ${pinned} of ${total} translations recorded`);
  }
  return { lines, failed: check && (behind + edited + unpinned + shared.length + same.size + orphans.size + empty.length + partial.length + broken.length) > 0 };
}

// Of the translations `found`, each that is the same file (by identity [fileId])
// as a file it may not change: { paths, unseen }, the paths of those files
// found and the number of its other names (hard links) found nowhere. A file
// it may not change is a source of the run, or a file of a folder the run
// involves that is no translation of that translation's source, as its own
// name tells, a file of the state folder's translations/ whose name names no
// translation being no skill's. The folders involved are the folders named, the skill folder a
// state translation belongs to, the skill folder holding each translation and
// the folder holding it, by the path it is reached by and by where it leads,
// and, where a translation has a name in none of them, every scanned skill's
// folder. A translation with more names than are found is never written,
// whatever the names it has outside them. A skill folder that cannot be read
// whole is added to `partial`, so the run fails rather than write past a file
// it did not see.
function sameFiles(found, { listing, realOf, idOf, sourceOf, inStateOf, partial, targets, skills }) {
  const out = new Map(); // translation -> { paths, unseen }
  const single = [...found.values()].filter((f) => f.sources.size === 1);
  if (!single.length) return out;
  // file id -> [{ path, translates: source file id or null, hard: a name of its own, not a symbolic
  // link, free: a file of the state folder's translations/ its name names no translation of, no skill's }]
  const guarded = new Map();
  const seenPath = new Set(); // each place once, however it is reached
  const guard = (file) => {
    const place = path.join(realOf(path.dirname(file)) ?? path.dirname(file), path.basename(file));
    if (seenPath.has(place)) return;
    seenPath.add(place);
    const id = idOf(file);
    if (!id) return;
    let hard = false;
    try { hard = !fs.lstatSync(place).isSymbolicLink(); } catch { /* none */ }
    const src = parseTranslationName(path.basename(file)) ? sourceOf(file) : null;
    if (!guarded.has(id)) guarded.set(id, []);
    guarded.get(id).push({ path: file, translates: src?.sourceId ?? null, hard, free: !src && !!inStateOf(file) });
  };
  const deep = new Set(targets.map((t) => path.resolve(t)).filter((t) => { try { return fs.statSync(t).isDirectory(); } catch { return false; } }));
  const shallow = new Set();
  const skillFolderOf = (file) => {
    for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
      try { if (fs.statSync(path.join(dir, 'SKILL.md')).isFile()) return dir; } catch { /* not a skill folder */ }
      if (path.dirname(dir) === dir) return null;
    }
  };
  for (const f of single) {
    if (f.skillDir) deep.add(f.skillDir);
    for (const p of [f.abs, realOf(f.abs)].filter(Boolean)) {
      const skillDir = skillFolderOf(p);
      if (skillDir) deep.add(skillDir);
      shallow.add(path.dirname(p));
    }
  }
  const walk = (dirs, why) => {
    for (const dir of dirs) {
      const listed = listing(dir);
      if (why && !listed.complete && !targets.some((t) => path.resolve(t) === dir)) partial.push({ target: dir, why });
      for (const rel of listed.files) guard(path.join(dir, ...rel.split('/')));
    }
  };
  walk(deep, 'it is a skill folder a translation named lies in or translates from, and it cannot be read whole, so pin cannot tell that writing the translation changes no other file of it');
  for (const dir of shallow) {
    let entries = [];
    try { entries = fs.readdirSync(dir).sort(); } catch { /* none read */ }
    for (const name of entries) {
      const file = path.join(dir, name);
      try { if (fs.statSync(file).isFile()) guard(file); } catch { /* none */ }
    }
  }
  const links = (id) => { try { return Number(fs.statSync(found.get(id).abs, { bigint: true }).nlink); } catch { return 1; } };
  const unseenOf = (id) => Math.max(0, links(id) - (guarded.get(id) ?? []).filter((g) => g.hard).length);
  // A name the folders read do not hold is looked for in every scanned skill's folder.
  if ([...found.keys()].some((id) => found.get(id).sources.size === 1 && unseenOf(id) > 0)) {
    // A name still not found keeps the translation unwritten, so a folder read in part fails nothing more.
    walk((skills ? skills() : []).map((sk) => sk.dir), null);
  }
  const sources = new Map(); // source file id -> the source's path
  for (const f of single) for (const [id, p] of f.sources) if (!sources.has(id)) sources.set(id, p);
  for (const [id, f] of found) {
    if (f.sources.size !== 1) continue;
    const [sourceId] = f.sources.keys();
    const others = new Set();
    if (sources.has(id)) others.add(sources.get(id));
    for (const g of guarded.get(id) ?? []) if (!g.free && g.translates !== sourceId) others.add(g.path);
    const unseen = unseenOf(id);
    if (others.size || unseen) out.set(f, { paths: [...others].sort(), unseen });
  }
  return out;
}
