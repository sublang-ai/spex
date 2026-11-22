#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Skill Atlas command line: scan installed agent skills, serve the viewer,
// export a standalone copy, or pin translations to their sources.
// See ../SKILL.md and ../references/data-model.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scan } from './lib/scan.mjs';
import { summarize } from './lib/summary.mjs';
import { startServer } from './lib/server.mjs';
import { writeExport } from './lib/export.mjs';
import { BUNDLED, viewerConfig, readWorkflowsState, readLocales } from './lib/state.mjs';
import { canonicalTag, matchingTag } from './lib/translations.mjs';
import { pin } from './lib/pin.mjs';
import { UsageError, warn } from './lib/log.mjs';

const DEFAULT_PORT = 4173;
const MAX_PORT = 65535;

// This script's own path, so the usage line runs from any folder, the user's project included.
const SCRIPT = fileURLToPath(import.meta.url);

const HELP = `Usage: node ${SCRIPT} <command> [options]

Commands:
  scan                 Print atlas.json (or --out <file>); --summary prints a digest instead
  serve                Scan and serve the viewer on 127.0.0.1; prints one JSON line with the URL
  export --out <file>  Write a standalone viewer with the data inlined
  pin <path>... [--state <dir>] [--cwd <dir>] [--root <dir>]
                       Record in each translation (a file such as SKILL.zh-CN.md beside its
                       source, or under <state>/translations/<skill id>/) the SHA-256 of the
                       file it translates and, in Markdown, its own; a folder stands for
                       every translation in it. Markdown gets a line
                       <!-- skill-atlas:source sha256=<hex> own=<hex> -->, text the same
                       line without own=, YAML a line # skill-atlas:source sha256=<hex>,
                       JSON a top-level "translationOf": { "sha256": "<hex>" }; an existing
                       record is rewritten, and nothing is written where one cannot be.
                       --state, --cwd and --root (and --no-user, --no-plugins, --agent)
                       find the skills that translations under <state>/translations/
                       belong to; one whose skill or source is not found, a folder
                       holding no translation, and a folder that cannot be read whole,
                       fail the command
  pin --check <path>... [--state <dir>] [--cwd <dir>] [--root <dir>]
                       Change no file; name each translation behind its source, edited
                       apart from it, recording no digest, or in the state folder with no
                       skill or source found, each folder holding no translation and each
                       one that cannot be read whole, and exit 1 where there is one

Options:
  --cwd <dir>          Project to scan (default: the current folder)
  --root <dir>         An extra skill folder; repeatable
  --agent <id>         Only folders this agent loads (claude-code, codex, universal, ...)
                       and --root's; repeatable
  --no-user            Skip skill folders in the home folder
  --no-plugins         Skip Claude Code plugin skills
  --state <dir>        Folder of workflows.json, annotations.json and translations/
                       (default: ~/.skill-atlas)
  --rules <file>       Tag rules (default: the bundled references/tag-rules.json)
  --out <file>         Output file (scan, export)
  --summary            scan: print the plain-text digest
  --port <n>           serve: port (default ${DEFAULT_PORT}; a free one if that is busy)
  --no-open            serve: do not open the browser
  --viewer <file>      serve, export: viewer HTML (default: the bundled assets/viewer.html)
  --lang <tag>         serve, export: the language the page opens in until the reader picks
                       one, such as en-US or zh-CN (default: the browser's)
  --check              pin: check the recorded digests instead of writing them
  --help               Show this help
`;

const COMMANDS = new Set(['scan', 'serve', 'export', 'pin']);
const VALUE_OPTIONS = new Set(['--cwd', '--root', '--agent', '--state', '--rules', '--out', '--port', '--viewer', '--lang']);
const FLAG_OPTIONS = new Set(['--no-user', '--no-plugins', '--summary', '--no-open', '--check', '--help', '-h']);
const REPEATABLE = new Set(['--root', '--agent']);

function parseArgs(argv) {
  const opts = { command: null, root: [], agent: [], paths: [] };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let value;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    if (eq > 0) { value = arg.slice(eq + 1); arg = arg.slice(0, eq); }
    if (VALUE_OPTIONS.has(arg)) {
      if (value === undefined) {
        value = argv[++i];
        if (value === undefined) throw new UsageError(`${arg} needs a value; see --help`);
      }
      const key = arg.slice(2);
      if (REPEATABLE.has(arg)) opts[key].push(value);
      else if (opts[key] !== undefined) throw new UsageError(`${arg} was given twice; give it once`);
      else opts[key] = value;
    } else if (FLAG_OPTIONS.has(arg)) {
      if (value !== undefined) throw new UsageError(`${arg} takes no value`);
      opts[arg === '-h' ? 'help' : arg.slice(2)] = true;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option ${arg}; see --help`);
    } else if (!opts.command) {
      if (!COMMANDS.has(arg)) throw new UsageError(`unknown command "${arg}"; use scan, serve, export or pin (see --help)`);
      opts.command = arg;
    } else if (opts.command === 'pin') {
      opts.paths.push(arg);
    } else {
      throw new UsageError(`unexpected argument "${arg}"; see --help`);
    }
  }
  return opts;
}

function scanOptions(opts) {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  let stat;
  try { stat = fs.statSync(cwd); } catch { stat = null; }
  if (!stat?.isDirectory()) throw new UsageError(`--cwd ${cwd} is not a folder; pass an existing project folder`);
  const rulesFile = opts.rules ? path.resolve(opts.rules) : BUNDLED.rules;
  return {
    cwd,
    home: os.homedir(),
    user: !opts['no-user'],
    plugins: !opts['no-plugins'],
    extra: opts.root,
    agents: opts.agent,
    rulesFile,
    stateDir: path.resolve(opts.state ?? path.join(os.homedir(), '.skill-atlas')),
  };
}

function writeOut(file, text) {
  try {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, text);
  } catch (err) {
    throw new UsageError(`cannot write ${file}: ${err.message}; choose another --out`);
  }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', (err) => warn(`could not open a browser (${err.message}); open ${url} yourself`));
    child.unref();
  } catch (err) {
    warn(`could not open a browser (${err.message}); open ${url} yourself`);
  }
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.command) {
    process.stdout.write(HELP);
    if (!opts.help) process.exitCode = 2;
    return;
  }
  if (opts.check && opts.command !== 'pin') throw new UsageError('--check is an option of pin; see --help');
  const sopts = scanOptions(opts);
  const viewerFile = opts.viewer ? path.resolve(opts.viewer) : BUNDLED.viewer;
  let lang = null;
  if (opts.lang !== undefined) {
    lang = canonicalTag(opts.lang);
    if (!lang) throw new UsageError(`--lang ${opts.lang} is not a language tag; pass one such as en-US or zh-CN`);
    if (!matchingTag(lang, ['en-US', ...Object.keys(readLocales(BUNDLED.locales))])) {
      warn(`--lang ${lang} has no catalog in assets/locales/; the page shows the browser's language where it is offered, else English`);
    }
  }

  if (opts.command === 'pin') {
    const result = pin({ targets: opts.paths, check: !!opts.check, stateDir: sopts.stateDir, skills: () => scan(sopts).skills });
    process.stdout.write(result.lines.join('\n') + '\n');
    if (result.failed) process.exitCode = 1;
    return;
  }

  if (opts.command === 'scan') {
    const atlas = scan(sopts);
    const text = opts.summary ? summarize(atlas) : JSON.stringify(atlas, null, 2) + '\n';
    if (opts.out) writeOut(opts.out, text);
    else process.stdout.write(text);
    return;
  }

  if (opts.command === 'export') {
    if (!opts.out) throw new UsageError('export needs --out <file.html>');
    const atlas = scan(sopts);
    // Only a valid stored document is embedded; an invalid one stays on disk untouched.
    const stored = readWorkflowsState(sopts.stateDir);
    if (!stored.valid) warn(`${stored.error}; exporting with no workflows`);
    const workflows = stored.valid ? stored.doc : { version: 1, active: null, workflows: [] };
    const config = viewerConfig({ stateDir: sopts.stateDir, isStatic: true, lang, rulesFile: sopts.rulesFile });
    const file = writeExport(viewerFile, opts.out, { atlas, workflows, config });
    process.stderr.write(`skill-atlas: wrote ${file}\n`);
    return;
  }

  // serve
  let port = DEFAULT_PORT;
  const strictPort = opts.port !== undefined;
  if (strictPort) {
    port = Number(opts.port);
    if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) throw new UsageError(`--port ${opts.port} is not a port number (0-${MAX_PORT})`);
  }
  if (!fs.existsSync(viewerFile)) throw new UsageError(`the viewer ${viewerFile} is missing; reinstall the skill-atlas skill`);
  const atlas = scan(sopts);
  let started;
  try {
    started = await startServer({ port, strictPort, stateDir: sopts.stateDir, viewerFile, atlas, lang, rulesFile: sopts.rulesFile, rescan: () => scan(sopts) });
  } catch (err) {
    if (err.code === 'EADDRINUSE') throw new UsageError(`port ${port} is in use; pass another --port, or omit it to take a free one`);
    throw new UsageError(`cannot listen on 127.0.0.1:${port}: ${err.message}`);
  }
  const url = `http://127.0.0.1:${started.port}/`;
  process.stdout.write(JSON.stringify({ url, state: sopts.stateDir, skills: atlas.skills.length }) + '\n');
  if (!opts['no-open']) openBrowser(url);
  const stop = () => {
    started.server.close();
    started.server.closeAllConnections?.();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main(process.argv.slice(2)).catch((err) => {
  const message = err instanceof UsageError ? err.message : `${err.message}`;
  process.stderr.write(`skill-atlas: error: ${message}\n`);
  process.exit(1);
});
