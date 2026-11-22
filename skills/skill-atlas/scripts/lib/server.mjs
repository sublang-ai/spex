// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The local viewer server: 127.0.0.1 only, Host-checked against DNS
// rebinding, and writing nothing but workflows.json (and its lock) in the state folder.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { viewerConfig, readWorkflowsState, saveWorkflows, LockBusyError, WORKFLOWS_MAX_BYTES } from './state.mjs';
import { canonicalTag, findTranslation } from './translations.mjs';
import { fileLanguage } from './language.mjs';

export const HOST = '127.0.0.1';
export const BODY_MAX_BYTES = WORKFLOWS_MAX_BYTES; // the save's own limit, refused here before the body is read whole
export const FILE_MAX_BYTES = 512 * 1024; // 512 KiB: larger files are not skill text worth showing
const MUTATION_HEADER = 'x-skill-atlas';
const REPLACE_INVALID_HEADER = 'x-skill-atlas-replace-invalid';

/**
 * Start the server.
 * @param {{ port:number, strictPort:boolean, stateDir:string, viewerFile:string, rescan:() => object, atlas:object,
 *   lang?:string|null, rulesFile?:string }} opts
 *   strictPort: fail when the port is busy instead of taking a free one; lang: the --lang the page opens in
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
export function startServer(opts) {
  let atlas = opts.atlas;
  let port = 0;
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => send(res, 500, { error: `internal error: ${err.message}` }));
  });

  async function handle(req, res) {
    const host = String(req.headers.host ?? '').toLowerCase();
    if (host !== `${HOST}:${port}` && host !== `localhost:${port}`) {
      return send(res, 403, { error: `Host "${req.headers.host ?? ''}" is not allowed; open http://${HOST}:${port}/` });
    }
    const url = new URL(req.url ?? '/', `http://${HOST}:${port}`);
    const route = `${req.method} ${url.pathname}`;
    if (req.method === 'PUT' || req.method === 'POST') {
      if (req.headers[MUTATION_HEADER] !== '1') return send(res, 403, { error: 'missing header X-Skill-Atlas: 1' });
      if (!/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] ?? ''))) {
        return send(res, 415, { error: 'Content-Type must be application/json' });
      }
    }
    switch (route) {
      case 'GET /':
      case 'GET /index.html': {
        let html;
        try {
          html = fs.readFileSync(opts.viewerFile, 'utf8');
        } catch (err) {
          return send(res, 500, { error: `cannot read the viewer ${opts.viewerFile}: ${err.message}` });
        }
        return sendText(res, 200, html, 'text/html; charset=utf-8');
      }
      case 'GET /api/atlas':
        return send(res, 200, atlas);
      case 'POST /api/rescan': {
        const body = await readBody(req, res);
        if (body === null) return undefined;
        try {
          atlas = opts.rescan();
        } catch (err) {
          return send(res, 500, { error: `rescan failed: ${err.message}` });
        }
        return send(res, 200, atlas);
      }
      case 'GET /api/workflows': {
        const cur = readWorkflowsState(opts.stateDir);
        if (!cur.valid) return send(res, 409, { error: 'invalid-workflows', message: `${cur.error}; replace it from the page or fix the file`, path: cur.file });
        return send(res, 200, cur.doc, { headers: { ETag: cur.etag } });
      }
      case 'PUT /api/workflows': {
        const body = await readBody(req, res);
        if (body === null) return undefined;
        let answer;
        try {
          // The check and the write as one step among every process sharing the state folder.
          answer = saveWorkflows(opts.stateDir, body, { ifMatch: req.headers['if-match'], replaceInvalid: req.headers[REPLACE_INVALID_HEADER] === '1' });
        } catch (err) {
          if (err instanceof LockBusyError) return send(res, 503, { error: 'busy', message: err.message }, { headers: { 'Retry-After': '1' } });
          return send(res, 500, { error: 'write-failed', message: `cannot save workflows.json in ${opts.stateDir}: ${err.message}` });
        }
        return send(res, answer.status, answer.value, { headers: answer.etag ? { ETag: answer.etag } : {} });
      }
      case 'GET /api/config':
        try {
          return send(res, 200, viewerConfig({ stateDir: opts.stateDir, isStatic: false, lang: opts.lang ?? null, rulesFile: opts.rulesFile }));
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      case 'GET /api/file':
        return serveSkillFile(res, atlas, url.searchParams.get('skill'), url.searchParams.get('path') ?? 'SKILL.md', url.searchParams.get('lang'), opts.stateDir);
      default:
        if (['/', '/index.html', '/api/atlas', '/api/rescan', '/api/workflows', '/api/config', '/api/file'].includes(url.pathname)) {
          return send(res, 405, { error: `${req.method} is not supported on ${url.pathname}` });
        }
        return send(res, 404, { error: `no route ${url.pathname}` });
    }
  }

  return new Promise((resolve, reject) => {
    const listen = (p) => {
      server.once('error', onError);
      server.listen(p, HOST, () => {
        server.off('error', onError);
        port = server.address().port;
        resolve({ server, port });
      });
    };
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && !opts.strictPort) return listen(0);
      reject(err);
    };
    listen(opts.port);
  });
}

// A skill's file as text. Asked in a language (`lang`), the answer is JSON:
// `{ language, path, stale, edited, text }` with the translation where there is one
// (data-model.md "Languages"), else the file itself with `language` null and
// `sourceLanguage` the language it is written in.
function serveSkillFile(res, atlas, skillId, rel, lang, stateDir) {
  const skill = atlas.skills.find((s) => s.id === skillId);
  if (!skill) return send(res, 404, { error: `no skill "${skillId ?? ''}"` });
  if (!rel || rel.includes('\0')) return send(res, 400, { error: 'path is required' });
  let want = null;
  if (lang !== null && lang !== '') {
    want = canonicalTag(lang);
    if (!want) return send(res, 400, { error: `lang "${lang}" is not a language tag such as zh-CN` });
  }
  // The file is named by the path asked (its translations, its language and the
  // path answered follow that name) and read from where a link there leads,
  // which must lie inside the skill's real folder too.
  const leaves = (rel_) => rel_ === '' || rel_.startsWith('..') || path.isAbsolute(rel_);
  const asked = path.relative(path.resolve(skill.dir), path.resolve(skill.dir, rel));
  if (leaves(asked)) return send(res, 403, { error: 'the path leaves the skill folder' });
  let base;
  let real;
  try {
    base = fs.realpathSync(skill.dir);
    real = fs.realpathSync(path.resolve(skill.dir, rel));
  } catch {
    return send(res, 404, { error: `no file "${rel}" in ${skillId}` });
  }
  if (leaves(path.relative(base, real))) return send(res, 403, { error: 'the path leaves the skill folder' });
  const askedPosix = asked.split(path.sep).join('/');
  let isFile = false;
  try { isFile = fs.statSync(real).isFile(); } catch { /* answered below */ }
  if (want && isFile) {
    const found = findTranslation(skill, askedPosix, want, stateDir);
    if (found) {
      const translated = readBoundedText(found.real, path.basename(found.abs), skillId);
      if (translated.error) return send(res, translated.status, { error: translated.error });
      const { stale, edited } = found;
      // The file shown, by its path in the skill's folder (or under translations/<skill id>/).
      const shown = path.posix.join(path.posix.dirname(askedPosix), path.basename(found.abs));
      return send(res, 200, { language: found.tag, path: shown, stale, edited, text: translated.text });
    }
  }
  const source = readBoundedText(real, rel, skillId);
  if (source.error) return send(res, source.status, { error: source.error });
  // The original's own language, told from its own text (a SKILL.md's declared one first).
  if (want) return send(res, 200, { language: null, sourceLanguage: fileLanguage(source.text, { skillFile: askedPosix === 'SKILL.md' }), path: askedPosix, stale: false, edited: false, text: source.text });
  return sendText(res, 200, source.text, 'text/plain; charset=utf-8');
}

// A file's text under the bounds every served file meets: a regular file of
// at most FILE_MAX_BYTES holding no NUL byte.
function readBoundedText(real, rel, skillId) {
  let stat;
  try { stat = fs.statSync(real); } catch { return { status: 404, error: `no file "${rel}" in ${skillId}` }; }
  if (!stat.isFile()) return { status: 404, error: `"${rel}" is not a file` };
  if (stat.size > FILE_MAX_BYTES) return { status: 415, error: `"${rel}" is over ${FILE_MAX_BYTES / 1024} KiB` };
  const buf = fs.readFileSync(real);
  if (buf.includes(0)) return { status: 415, error: `"${rel}" is a binary file` };
  return { text: buf.toString('utf8') };
}

// Resolves to the body text, or null after answering 413.
function readBody(req, res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > BODY_MAX_BYTES) {
        over = true;
        send(res, 413, { error: `the body is over ${BODY_MAX_BYTES / 1024 / 1024} MiB` }, { close: true });
        req.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function headers(type, extra = {}) {
  return { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra };
}

function send(res, status, value, { close = false, headers: extra = {} } = {}) {
  if (res.headersSent) return;
  const body = JSON.stringify(value);
  res.writeHead(status, headers('application/json; charset=utf-8', { ...extra, ...(close ? { Connection: 'close' } : {}) }));
  res.end(body);
}

function sendText(res, status, text, type) {
  res.writeHead(status, headers(type));
  res.end(text);
}
