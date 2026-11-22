// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A self-contained viewer: the data inlined into the viewer's embed element.

import fs from 'node:fs';
import path from 'node:path';

const LS = '\u2028';
const LINE_SEPARATORS = /[\u2028\u2029]/g;

export const EMBED_MARKER = '<script id="atlas-embedded" type="application/json"></script>';

/**
 * Inline the data into the viewer HTML.
 * @throws {Error} when the viewer lacks the embed marker
 */
export function embed(html, data) {
  if (!html.includes(EMBED_MARKER)) {
    throw new Error(`the viewer has no ${EMBED_MARKER} element to fill; restore assets/viewer.html from the skill`);
  }
  // `<` escaped so no value can close the script element; U+2028/9 for old parsers.
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(LINE_SEPARATORS, (c) => (c === LS ? '\\u2028' : '\\u2029'));
  // Joined, not substituted: a replacement string would rewrite `$&`, `$$` or `$1` in the data.
  const close = '</script>';
  const filled = EMBED_MARKER.slice(0, -close.length) + json + close;
  const at = html.indexOf(EMBED_MARKER);
  return html.slice(0, at) + filled + html.slice(at + EMBED_MARKER.length);
}

export function writeExport(viewerFile, outFile, data) {
  let html;
  try {
    html = fs.readFileSync(viewerFile, 'utf8');
  } catch (err) {
    throw new Error(`cannot read the viewer ${viewerFile}: ${err.message}`);
  }
  const out = embed(html, data);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, out);
  return path.resolve(outFile);
}
