// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Skill Atlas integration tests: the real CLI run as a child process against
// skill folders built in a temporary directory, and its server over HTTP.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'skills', 'skill-atlas', 'scripts', 'atlas.mjs');
const CLI_TIMEOUT_MS = 30_000; // a scan of a few fixture skills takes well under a second
const SERVER_START_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000; // a local request answers in milliseconds
const EMBED_MARKER = '<script id="atlas-embedded" type="application/json"></script>';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-atlas-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(args, { cwd = REPO, env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: CLI_TIMEOUT_MS, env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function scanJson(project, extra = [], state = path.join(project, 'state')) {
  const r = run(['scan', '--cwd', project, '--no-user', '--no-plugins', '--state', state, ...extra]);
  assert.equal(r.status, 0, `scan failed: ${r.stderr}`);
  return { atlas: JSON.parse(r.stdout), stderr: r.stderr };
}

function writeSkill(dir, text) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
}

function fm(name, description, extra = '') {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n`;
}

const skillOf = (atlas, id) => atlas.skills.find((s) => s.id === id);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const record = (hex) => `<!-- skill-atlas:source sha256=${hex} -->`;
// A Markdown translation's own digest: its text without a byte order mark, with LF ends and its record line left out.
const ownOf = (text) => crypto.createHash('sha256').update(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').filter((l) => !/^\s*<!--\s*skill-atlas:source\s/.test(l)).join('\n')).digest('hex');
const mdRecord = (hex, own) => `<!-- skill-atlas:source sha256=${hex} own=${own} -->`;
// A translation's name: a language tag before the extension of a text file.
const TRANSLATION_NAME = /^(.+)\.([a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)\.(md|json|txt|yaml|yml)$/;
const isTranslation = (file) => {
  const m = TRANSLATION_NAME.exec(path.basename(file));
  return !!m && fs.existsSync(path.join(path.dirname(file), `${m[1]}.${m[3]}`));
};
const edge = (atlas, from, to) => atlas.edges.filter((e) => e.from === from && e.to === to);

// One fixture project for the scan tests.
const P = path.join(tmp, 'project');
const CLAUDE = path.join(P, '.claude', 'skills');

before(() => {
  writeSkill(path.join(CLAUDE, 'alpha'), `${fm('alpha', 'Alpha builds things.')}
# Alpha

Intro paragraph.

## Step 1: Gather

Read the config files.

\`\`\`markdown
## Step 9: Not a step
\`\`\`

## Step 2: Build

Run the command.
`);

  writeSkill(path.join(CLAUDE, 'phased'), `${fm('phased', 'Phases on two levels.')}
## Workflow

### Phase 1: Trace
Trace it.

### Phase 2: Measure
Measure it.

## Phase 3: Codebase
Look at the code.

### Detail
More detail.

## Output Format
Present findings.
`);

  writeSkill(path.join(CLAUDE, 'beta'), `${fm('beta', 'Beta has a workflow list.')}
## Common issues

1. Stale commands
2. Missing dependencies

## Workflow

1. **Collect inputs** - gather everything.
   Nested detail line.
2. Write the report. Then stop.
`);

  writeSkill(path.join(CLAUDE, 'gamma'), `${fm('gamma', 'Gamma opens with a list.')}
Follow these steps:

1. Do the first thing. It matters.
2. Do the second thing.
`);

  writeSkill(path.join(CLAUDE, 'delta'), `${fm('delta', 'Delta has sections.')}
## Background

Some context.

## Rules

Some rules.
`);

  writeSkill(path.join(CLAUDE, 'plain'), `${fm('plain', 'Plain prose only.')}
Just one paragraph of prose with no headings.
`);

  // Link targets with generic names.
  writeSkill(path.join(CLAUDE, 'code'), `${fm('code', 'Writes code.')}
Write code.
`);
  writeSkill(path.join(CLAUDE, 'review'), `${fm('review', 'Reviews commits.')}
Review the commits.
`);
  writeSkill(path.join(CLAUDE, 'lint-fix'), `${fm('lint-fix', 'Fixes lint.')}
Fix lint.
`);

  writeSkill(path.join(CLAUDE, 'orchestrator'), `${fm('orchestrator', 'Orchestrates work; use the review skill at the end.')}
# Orchestrator

## Step 1: Review

Invoke the \`review\` skill once.

## Step 2: Lint

Then run /lint-fix on the tree.
Call Skill(code) to start.

## Step 3: Notes

Do not use the \`code\` skill here.
Write code in src/code/x and keep the code clean.
See https://example.com/review and ~/review for more.
Use the \`missing-thing\` skill when it exists.
Type \`/ghost-cmd\` to start it.
Hand it to Skill(phantom) later.
Type \`/help\` for the host's help.
Call \`/health\` to check the server.
`);

  // Tags.
  writeSkill(path.join(CLAUDE, 'tagged'), `${fm('tagged', 'Tagged skill.', 'allowed-tools: Bash Read mcp__github__get_issue\n')}
## Step 1: Ask

Ask the user which branch to use.

## Step 2: Run

\`\`\`bash
make build
\`\`\`

Post updates with mcp__slack__post_message when done.
Never ask the user to paste a secret.
Never push without approval from the owner.
`);

  // Cycle.
  writeSkill(path.join(CLAUDE, 'ping'), `${fm('ping', 'Ping.')}
Invoke the \`pong\` skill.
`);
  writeSkill(path.join(CLAUDE, 'pong'), `${fm('pong', 'Pong.')}
Invoke the \`ping\` skill.
`);

  // Malformed frontmatter.
  writeSkill(path.join(CLAUDE, 'broken'), `---\nname: broken-name\ndescription: 'unclosed\n  still going\n---\nBody text.\n`);
  writeSkill(path.join(CLAUDE, 'unclosed'), `---\nname: unclosed\ndescription: never closed\nBody without a closing delimiter.\n`);

  // Duplicate name in two real folders, and one folder linked into two roots.
  writeSkill(path.join(CLAUDE, 'dup'), `${fm('dup', 'First copy.')}\nOne.\n`);
  writeSkill(path.join(P, '.codex', 'skills', 'dup'), `${fm('dup', 'Second copy.')}\nTwo.\n`);
  writeSkill(path.join(P, '.agents', 'skills', 'shared'), `${fm('shared', 'Shared via a link.')}\nShared.\n`);
  try {
    fs.symlinkSync(path.join(P, '.agents', 'skills', 'shared'), path.join(CLAUDE, 'shared'), 'junction');
  } catch {
    // Without symlink rights (some Windows hosts) the de-duplication test skips.
  }

  // The same skill copied byte for byte into another agent's folder.
  const same = `${fm('same', 'Copied into two agents.')}\nSame text.\n`;
  writeSkill(path.join(CLAUDE, 'same'), same);
  writeSkill(path.join(P, '.gemini', 'skills', 'same'), same);

  // More insight kinds.
  writeSkill(path.join(CLAUDE, 'big'), `${fm('big', 'A long skill.')}\n## Body\n\n${'Line of text.\n'.repeat(510)}`);
  writeSkill(path.join(CLAUDE, 'folder-x'), `${fm('other-name', 'Its name differs from its folder.')}\n## Body\nText.\n`);
  writeSkill(path.join(CLAUDE, 'annotated'), `${fm('annotated', 'Steps come from an annotation.')}\n## Only\nAsk the user which plan to follow.\n`);

  // A namespaced layout: a skill one folder below a scanned folder.
  writeSkill(path.join(CLAUDE, 'team', 'inner'), `${fm('inner', 'One folder down.')}\nInner.\n`);

  // Valid YAML with a map two levels deep.
  writeSkill(path.join(CLAUDE, 'deepmeta'), `---\nname: deepmeta\ndescription: Valid YAML two levels deep.\nmetadata:\n  hermes:\n    tags: [a, b]\n---\nText.\n`);

  // Bundled files, and a link leading out of the skill folder.
  writeSkill(path.join(CLAUDE, 'bundled'), `${fm('bundled', 'Has bundled files.')}\nSee [the guide](references/guide.md).\n`);
  fs.mkdirSync(path.join(CLAUDE, 'bundled', 'references'), { recursive: true });
  fs.writeFileSync(path.join(CLAUDE, 'bundled', 'references', 'guide.md'), '# Guide\n');
  fs.mkdirSync(path.join(CLAUDE, 'bundled', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(CLAUDE, 'bundled', 'scripts', 'run.sh'), 'echo hi\n');
  try { fs.symlinkSync(path.join(CLAUDE, 'beta'), path.join(CLAUDE, 'bundled', 'up'), 'junction'); } catch { /* no symlink rights */ }

  // Tag rules tuned for precision.
  writeSkill(path.join(CLAUDE, 'precise'), `${fm('precise', 'Precision cases.')}
Write and run the checks.
It costs $5 per run.
Proceed without asking anyone.
`);

  // MCP names with underscores.
  writeSkill(path.join(CLAUDE, 'mcpnames'), `${fm('mcpnames', 'MCP names.')}\nUse mcp__foo__bar and mcp__my_server__do.\n`);

  // Skipped folders.
  writeSkill(path.join(CLAUDE, '.trash', 'old'), `${fm('old', 'Trashed.')}\n`);
  writeSkill(path.join(CLAUDE, 'node_modules', 'pkg'), `${fm('pkg', 'A dependency.')}\n`);

  // Steps from Chinese headings (skill-atlas-2).
  writeSkill(path.join(CLAUDE, 'zhong'), `${fm('zhong', '\u5206\u90E8\u5206\u7684\u6280\u80FD\u3002')}
## \u7B2C 1 \u90E8\u5206\uFF1A\u51C6\u5907

\u51C6\u5907\u3002

## \u7B2C 2 \u90E8\u5206\uFF1A\u6267\u884C

\u6267\u884C\u3002
`);
  writeSkill(path.join(CLAUDE, 'zhstep'), `${fm('zhstep', '\u5206\u6B65\u9AA4\u7684\u6280\u80FD\u3002')}
# \u6807\u9898

### \u6B65\u9AA4 1\uFF1A\u626B\u63CF

\u626B\u63CF\u3002

### \u6B65\u9AA4 2 \u2014 \u6253\u5F00

\u6253\u5F00\u3002
`);
  writeSkill(path.join(CLAUDE, 'zhlist'), `${fm('zhlist', '\u6709\u6D41\u7A0B\u5217\u8868\u7684\u6280\u80FD\u3002')}
## \u5E38\u89C1\u95EE\u9898

1. \u547D\u4EE4\u8FC7\u65F6
2. \u7F3A\u5C11\u4F9D\u8D56

## \u5DE5\u4F5C\u6D41\u7A0B

1. **\u6536\u96C6\u8F93\u5165**\uFF1A\u6C47\u603B\u4E00\u5207\u3002
2. \u5199\u62A5\u544A\u3002\u7136\u540E\u505C\u6B62\u3002
`);

  // Translations (skill-atlas-27): the skill's folder's, the state folder's,
  // one of other steps and ones behind their source.
  const trans = path.join(CLAUDE, 'trans');
  writeSkill(trans, `${fm('trans', 'Translated skill.')}
## Step 1: Gather

Read the [guide](references/guide.md).

## Step 2: Build

Build it.
`);
  fs.mkdirSync(path.join(trans, 'references'), { recursive: true });
  fs.writeFileSync(path.join(trans, 'references', 'guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(trans, 'references', 'guide.zh-CN.md'), `${record('0'.repeat(64))}\n# \u6307\u5357\n`);
  fs.writeFileSync(path.join(trans, 'SKILL.zh-CN.md'), `${fm('trans', '\u5DF2\u7FFB\u8BD1\u7684\u6280\u80FD\u3002')}${record(sha(path.join(trans, 'SKILL.md')))}
## \u6B65\u9AA4 1\uFF1A\u6536\u96C6

\u9605\u8BFB[\u6307\u5357](references/guide.zh-CN.md)\u3002
Invoke the \`code\` skill. Ask the user which branch to use.

## \u7B2C 2 \u6B65\uFF1A\u6784\u5EFA

\u6784\u5EFA\u3002
`);
  const stateTrans = (id, rel, text) => {
    const file = path.join(P, 'state', 'translations', id, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  stateTrans('trans', 'SKILL.zh-CN.md', `${fm('trans', 'STATE COPY')}## \u6B65\u9AA4 1\uFF1AX\n\n## \u6B65\u9AA4 2\uFF1AY\n`);
  stateTrans('trans', 'SKILL.ja.md', `${fm('trans', 'Japanese words.')}## Step 1: A\n\n## Step 2: B\n`);
  stateTrans('trans', 'references/guide.ja.md', '# Guide in ja\n');
  stateTrans('alpha', 'SKILL.zh-CN.md', `${fm('alpha', '\u963F\u5C14\u6CD5\u3002')}## \u7B2C 1 \u9636\u6BB5 \u2014 \u6536\u96C6\n\n\u8BFB\u914D\u7F6E\u3002\n\n## \u7B2C 2 \u9636\u6BB5 \u2014 \u6784\u5EFA\n\n\u8FD0\u884C\u3002\n`);
  fs.writeFileSync(path.join(CLAUDE, 'gamma', 'SKILL.zh-CN.md'), `${fm('gamma', '\u4F3D\u9A6C\u3002')}## \u5DE5\u4F5C\u6D41\u7A0B\n\n1. \u4E00\u3002\n2. \u4E8C\u3002\n3. \u4E09\u3002\n`);
  // A translation edited apart from its source: the source's digest matches, its own does not.
  fs.writeFileSync(path.join(CLAUDE, 'zhlist', 'SKILL.en-US.md'), `${fm('zhlist', 'A skill with a workflow list.')}${mdRecord(sha(path.join(CLAUDE, 'zhlist', 'SKILL.md')), '1'.repeat(64))}
## Workflow

1. **Gather input**: everything.
2. Write the report. Then stop.
`);
  fs.writeFileSync(path.join(CLAUDE, 'delta', 'SKILL.zh-CN.md'), `${fm('delta', '\u5FB7\u5C14\u5854\u3002')}${record('f'.repeat(64))}\n## \u80CC\u666F\n\n\u80CC\u666F\u3002\n\n## \u89C4\u5219\n\n\u89C4\u5219\u3002\n`);

  // Annotations.
  fs.mkdirSync(path.join(P, 'state'), { recursive: true });
  fs.writeFileSync(path.join(P, 'state', 'annotations.json'), JSON.stringify({
    version: 1,
    skills: {
      delta: {
        summary: 'Delta explains its rules.',
        addTags: [{ id: 'human.approval', step: 2, note: 'rules need sign-off' }, { id: 'output.custom-thing' }],
        addCalls: [{ to: 'review', step: 1, note: 'after the background' }],
        translations: { 'zh-CN': { summary: '\u5FB7\u5C14\u5854\u89E3\u91CA\u5B83\u7684\u89C4\u5219\u3002' } },
      },
      annotated: {
        steps: [{ title: 'Decide the plan', summary: 'Pick one plan.', tags: ['human.choice'], calls: ['review'] }, { title: 'Write it down', summary: 'Record it.' }],
        addTags: [{ id: 'output.files', step: 2, note: 'writes the plan' }],
        addCalls: [{ to: 'lint-fix', step: 2, note: 'lints the plan' }],
        translations: { 'zh-CN': { summary: '\u51B3\u5B9A\u5E76\u8BB0\u5F55\u8BA1\u5212\u3002', steps: [{ title: '\u51B3\u5B9A\u8BA1\u5212', summary: '\u9009\u4E00\u4E2A\u8BA1\u5212\u3002' }, { title: '\u5199\u4E0B\u6765' }] } },
      },
      orchestrator: { removeCalls: [{ to: 'lint-fix' }], removeTags: [{ id: 'output.files' }] },
      'not-installed': { summary: 'ignored' },
    },
  }));
});

// Every file under a folder with its content, to prove a scan changes none.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) out[full] = `link:${fs.readlinkSync(full)}`;
      else if (e.isDirectory()) walk(full);
      else out[full] = `${fs.statSync(full).mtimeMs}:${fs.readFileSync(full, 'utf8')}`;
    }
  };
  for (const sub of ['.claude', '.agents', '.codex', '.gemini']) walk(path.join(dir, sub));
  return out;
}

// skill-atlas-24: the command run against skill folders built for the test.
describe('scan (skill-atlas-24)', () => {
  let atlas;
  let stderr;
  let beforeScan;
  before(() => {
    beforeScan = snapshot(P);
    ({ atlas, stderr } = scanJson(P));
  });

  test('changes no file in the skill folders', () => {
    assert.deepEqual(snapshot(P), beforeScan);
  });

  test('detects numbered heading steps and ignores headings in fenced code', () => {
    const s = skillOf(atlas, 'alpha');
    assert.equal(s.stepKind, 'step');
    assert.deepEqual(s.steps.map((st) => st.title), ['Gather', 'Build']);
    assert.equal(s.steps[0].id, 'alpha#1');
    assert.ok(s.steps[0].line < s.steps[0].endLine && s.steps[0].endLine < s.steps[1].line);
    assert.ok(!s.steps[0].excerpt.includes('Not a step'), 'fenced heading text stays out of the excerpt');
  });

  test('takes a same-family numbered heading on another level as a step', () => {
    const s = skillOf(atlas, 'phased');
    assert.deepEqual(s.steps.map((st) => st.title), ['Trace', 'Measure', 'Codebase']);
    assert.ok(s.steps[2].excerpt.includes('More detail'), 'a step keeps its nested sections');
  });

  test('takes the list under a procedure heading, not an incidental list', () => {
    const s = skillOf(atlas, 'beta');
    assert.equal(s.stepKind, 'step');
    assert.deepEqual(s.steps.map((st) => st.title), ['Collect inputs', 'Write the report']);
    assert.ok(s.steps[0].excerpt.includes('Nested detail line'));
  });

  test('takes the ordered list that opens the body', () => {
    const s = skillOf(atlas, 'gamma');
    assert.deepEqual(s.steps.map((st) => st.title), ['Do the first thing', 'Do the second thing']);
  });

  test('falls back to sections, then to no steps', () => {
    const d = skillOf(atlas, 'delta');
    assert.equal(d.stepKind, 'section');
    assert.deepEqual(d.steps.map((st) => st.title), ['Background', 'Rules']);
    const p = skillOf(atlas, 'plain');
    assert.equal(p.stepKind, 'none');
    assert.deepEqual(p.steps, []);
    assert.ok(p.issues.includes('no-steps'));
  });

  test('finds calls and mentions with their steps, and no false links for generic words', () => {
    const review = edge(atlas, 'orchestrator', 'review');
    const orchLines = fs.readFileSync(path.join(CLAUDE, 'orchestrator', 'SKILL.md'), 'utf8').split('\n');
    const invokeLine = orchLines.indexOf('Invoke the `review` skill once.') + 1;
    assert.ok(review.some((e) => e.kind === 'calls' && e.fromStep === 'orchestrator#1' && e.evidence.line === invokeLine && e.evidence.text.includes('`review` skill')));
    assert.ok(skillOf(atlas, 'orchestrator').steps[0].line < invokeLine && invokeLine <= skillOf(atlas, 'orchestrator').steps[0].endLine);
    assert.ok(review.some((e) => e.kind === 'calls' && e.fromStep === null), 'the description links too');
    const code = edge(atlas, 'orchestrator', 'code');
    assert.ok(code.some((e) => e.kind === 'calls' && e.fromStep === 'orchestrator#2'), 'Skill(code)');
    assert.ok(code.some((e) => e.kind === 'mentions' && e.fromStep === 'orchestrator#3'), 'a steering-away sentence mentions');
    assert.equal(code.length, 2, 'bare "code" and src/code/x add no edge');
    const step3 = skillOf(atlas, 'orchestrator').steps[2];
    assert.deepEqual(step3.calls, ['code'], 'step 3 links only to code: the URL, ~/review and the bare words add none');
    assert.ok(!atlas.edges.some((e) => e.from === e.to), 'no self-links');
  });

  test('reports each unresolved form but not host built-ins or a backticked path', () => {
    const u = atlas.unresolved.filter((x) => x.from === 'orchestrator');
    assert.deepEqual(u.map((x) => x.name), ['missing-thing', 'ghost-cmd', 'phantom'], 'the `x` skill, `/x` in a sentence saying type, Skill(x)');
    assert.ok(u.every((x) => x.fromStep === 'orchestrator#3'));
    assert.ok(!u.some((x) => x.name === 'help' || x.name === 'health'), 'a built-in and `/health` with no command word are no unresolved link');
    assert.ok(atlas.insights.some((i) => i.kind === 'unresolved-link' && i.skills.includes('orchestrator')));
  });

  test('tags steps with evidence, allowed-tools and MCP servers', () => {
    const s = skillOf(atlas, 'tagged');
    const tag = (list, id) => list.find((t) => t.id === id);
    const q = tag(s.steps[0].tags, 'human.question');
    assert.equal(q.source, 'rule');
    assert.equal(q.evidence[0].text, 'Ask the user which branch to use.');
    assert.equal(q.evidence[0].line, s.steps[0].line + 2);
    assert.ok(tag(s.tags, 'human.question'), 'step tags roll up to the skill');
    assert.ok(tag(s.tags, 'tool.mcp-slack'), 'an MCP tool name in the text rolls up');
    assert.ok(tag(s.steps[1].tags, 'tool.shell'), 'a ```bash fence is shell use');
    const slack = tag(s.steps[1].tags, 'tool.mcp-slack');
    assert.equal(slack.label, 'MCP: slack');
    assert.equal(tag(s.tags, 'input.files').source, 'frontmatter');
    assert.equal(tag(s.tags, 'tool.mcp-github').source, 'frontmatter');
    assert.equal(tag(s.tags, 'tool.shell').source, 'rule', 'a rule hit outranks the frontmatter mapping');
    assert.ok(!tag(s.tags, 'human.handoff'), 'a negated sentence is no evidence');
    assert.ok(tag(s.steps[1].tags, 'human.approval'), 'a rule with "negatable": false counts after a negation');
    const p = skillOf(atlas, 'precise');
    assert.ok(!tag(p.tags, 'tool.edit'), 'prose "Write and run" is no file-editing tool');
    assert.ok(!tag(p.tags, 'input.arguments'), '"$5 per run" is no positional argument');
    assert.ok(!tag(p.tags, 'human.approval'), 'a bare "without asking" is no approval');
    for (const id of ['tool.mcp-slack', 'tool.mcp-github', 'human.question']) {
      assert.ok(atlas.tagCatalog.some((t) => t.id === id), `${id} is in the catalog`);
    }
    for (const t of s.tags) assert.ok(t.evidence.length <= 3);
    const mcp = skillOf(atlas, 'mcpnames').tags.filter((t) => t.id.startsWith('tool.mcp-'));
    assert.deepEqual(mcp.map((t) => [t.id, t.label]), [['tool.mcp-foo', 'MCP: foo'], ['tool.mcp-my-server', 'MCP: my_server']]);
    for (const t of mcp) assert.equal(atlas.tagCatalog.find((c) => c.id === t.id).label, t.label, 'the catalog label is the hit label');
  });

  test('finds a skill one folder below a scanned folder and keeps valid nested frontmatter', () => {
    const inner = skillOf(atlas, 'inner');
    assert.equal(inner.dir, path.join(CLAUDE, 'team', 'inner'));
    const deep = skillOf(atlas, 'deepmeta');
    assert.equal(deep.description, 'Valid YAML two levels deep.');
    assert.ok(!deep.issues.includes('invalid-frontmatter'));
  });

  test('lists bundled files inside the skill folder only', () => {
    assert.deepEqual(skillOf(atlas, 'bundled').files, [
      { path: 'references/guide.md', kind: 'reference', linked: true, translations: [] },
      { path: 'scripts/run.sh', kind: 'script', linked: false, translations: [] },
    ], 'a link leading out of the folder lists nothing');
  });

  test('keeps one record for a linked folder and an identical copy, and reports differing ones', (t) => {
    const dup = atlas.insights.filter((i) => i.kind === 'duplicate-name');
    assert.deepEqual(dup.map((i) => i.skills), [['dup', 'dup@project-codex']], 'only differing skills of one name');
    assert.deepEqual(skillOf(atlas, 'dup').copies, []);
    const same = atlas.skills.filter((s) => s.name === 'same');
    assert.equal(same.length, 1);
    assert.deepEqual(same[0].copies, [{ root: 'project-gemini', dir: path.join(P, '.gemini', 'skills', 'same') }]);
    assert.equal(atlas.roots.find((r) => r.id === 'project-gemini').skillCount, 1, 'a root counts the copies present in it');
    if (!fs.existsSync(path.join(CLAUDE, 'shared'))) return t.skip('no symlink rights');
    const shared = atlas.skills.filter((s) => s.name === 'shared');
    assert.equal(shared.length, 1);
    assert.equal(shared[0].root, 'project-claude', 'the first root in table order wins');
    assert.deepEqual(shared[0].copies, [{ root: 'project-agents', dir: path.join(P, '.agents', 'skills', 'shared') }]);
    assert.equal(atlas.roots.find((r) => r.id === 'project-agents').skillCount, 1);
  });

  test('skips dot-folders and node_modules', () => {
    assert.ok(!atlas.skills.some((s) => s.name === 'old' || s.name === 'pkg'));
  });

  test('reports every insight kind', () => {
    const kinds = new Set(atlas.insights.map((i) => i.kind));
    for (const k of ['duplicate-name', 'unresolved-link', 'cycle', 'oversized', 'missing-description', 'name-mismatch', 'invalid-frontmatter', 'no-steps', 'stale-translation', 'edited-translation', 'translation-steps']) {
      assert.ok(kinds.has(k), `insight ${k}`);
    }
    assert.ok(skillOf(atlas, 'big').issues.includes('oversized'));
    assert.ok(skillOf(atlas, 'other-name').issues.includes('name-mismatch'));
    // Every insight carries the values its message is built from.
    for (const i of atlas.insights) assert.ok(i.params && typeof i.params === 'object', `${i.kind} has params`);
    const one = (kind, id) => atlas.insights.find((i) => i.kind === kind && i.skills.includes(id));
    assert.deepEqual(one('duplicate-name', 'dup').params, { name: 'dup' });
    assert.deepEqual(one('unresolved-link', 'orchestrator').params, { name: 'missing-thing', from: 'orchestrator' });
    assert.deepEqual([...one('cycle', 'ping').params.path].sort(), ['ping', 'pong']);
    assert.equal(one('oversized', 'big').params.lines, skillOf(atlas, 'big').lines);
    assert.deepEqual(one('name-mismatch', 'other-name').params, { name: 'other-name', folder: 'folder-x' });
    assert.deepEqual(one('no-steps', 'plain').params, {});
  });

  test('reports a translation behind its source and one of other steps (skill-atlas-5)', () => {
    const stale = atlas.insights.filter((i) => i.kind === 'stale-translation');
    assert.deepEqual(stale.find((i) => i.skills[0] === 'trans').params, { lang: 'zh-CN', files: ['references/guide.zh-CN.md'] });
    assert.deepEqual(stale.find((i) => i.skills[0] === 'delta').params, { lang: 'zh-CN', files: ['SKILL.zh-CN.md'] });
    assert.ok(!stale.some((i) => i.skills[0] === 'alpha'), 'a translation recording no digest is not behind');
    const edited = atlas.insights.filter((i) => i.kind === 'edited-translation');
    assert.deepEqual(edited.map((i) => [i.skills, i.params]), [[['zhlist'], { lang: 'en-US', files: ['SKILL.en-US.md'] }]], 'one edited apart from its source, alone');
    const steps = atlas.insights.filter((i) => i.kind === 'translation-steps');
    assert.deepEqual(steps.map((i) => [i.skills, i.params]), [[['gamma'], { lang: 'zh-CN', steps: 3, expected: 2 }]]);
    assert.ok(skillOf(atlas, 'trans').issues.includes('stale-translation'));
    assert.ok(skillOf(atlas, 'gamma').issues.includes('translation-steps'));
  });

  test('detects steps from Chinese headings and a Chinese procedure heading (skill-atlas-2)', () => {
    const zhong = skillOf(atlas, 'zhong');
    assert.equal(zhong.stepKind, 'step');
    assert.deepEqual(zhong.steps.map((st) => st.title), ['\u51C6\u5907', '\u6267\u884C']);
    assert.deepEqual(skillOf(atlas, 'zhstep').steps.map((st) => st.title), ['\u626B\u63CF', '\u6253\u5F00']);
    const list = skillOf(atlas, 'zhlist');
    assert.equal(list.stepKind, 'step');
    assert.deepEqual(list.steps.map((st) => st.title), ['\u6536\u96C6\u8F93\u5165', '\u5199\u62A5\u544A'], 'the list under the procedure heading, its titles cut at the Chinese full stop');
  });

  test('reports translations from the skill\'s folder, then the state folder, as words alone (skill-atlas-27)', () => {
    const t = skillOf(atlas, 'trans');
    const zh = t.translations['zh-CN'];
    assert.equal(zh.origin, 'skill', 'the skill folder\'s translation comes first');
    assert.equal(zh.file, path.join(CLAUDE, 'trans', 'SKILL.zh-CN.md'));
    assert.equal(zh.description, '\u5DF2\u7FFB\u8BD1\u7684\u6280\u80FD\u3002');
    assert.deepEqual(zh.frontmatter, { name: 'trans', description: '\u5DF2\u7FFB\u8BD1\u7684\u6280\u80FD\u3002' }, 'the translation\'s frontmatter, as the skill\'s own');
    assert.equal(zh.summary, null);
    assert.deepEqual(zh.steps.map((st) => st.title), ['\u6536\u96C6', '\u6784\u5EFA']);
    assert.match(zh.steps[0].excerpt, /\u9605\u8BFB\u6307\u5357/);
    assert.equal(zh.stale, false);
    assert.equal(zh.edited, false);
    const ja = t.translations.ja;
    assert.equal(ja.origin, 'state');
    assert.equal(ja.file, path.join(P, 'state', 'translations', 'trans', 'SKILL.ja.md'));
    assert.equal(ja.description, 'Japanese words.');
    assert.deepEqual(ja.steps.map((st) => st.title), ['A', 'B']);
    assert.deepEqual(Object.keys(t.translations), ['ja', 'zh-CN']);

    const a = skillOf(atlas, 'alpha').translations['zh-CN'];
    assert.equal(a.origin, 'state');
    assert.deepEqual(a.steps.map((st) => st.title), ['\u6536\u96C6', '\u6784\u5EFA']);
    assert.equal(a.stale, false, 'one recording no digest is not behind');
    const g = skillOf(atlas, 'gamma').translations['zh-CN'];
    assert.equal(g.description, '\u4F3D\u9A6C\u3002');
    assert.equal(g.steps, null, 'steps numbering otherwise than the skill\'s are not reported');
    assert.equal(skillOf(atlas, 'delta').translations['zh-CN'].stale, true, 'a translation behind its source is marked');
    assert.equal(skillOf(atlas, 'delta').translations['zh-CN'].edited, false, 'one recording no own digest is not edited');
    const en = skillOf(atlas, 'zhlist').translations['en-US'];
    assert.deepEqual([en.stale, en.edited], [false, true], 'a translation edited apart from its source is marked');
    assert.equal(en.description, 'A skill with a workflow list.');
    assert.deepEqual(skillOf(atlas, 'beta').translations, {}, 'a skill with none has an empty map');

    // A translation is no file, no skill, and adds no link and no tag.
    assert.deepEqual(t.files, [{ path: 'references/guide.md', kind: 'reference', linked: true, translations: ['ja', 'zh-CN'] }]);
    assert.ok(atlas.skills.every((s) => path.basename(s.file) === 'SKILL.md'), 'no translation is a skill');
    assert.ok(atlas.skills.every((s) => s.files.every((f) => !/\.(zh-CN|ja)\.md$/.test(f.path))), 'no translation is listed as a file');
    assert.deepEqual(t.steps.map((st) => st.title), ['Gather', 'Build'], 'steps come from SKILL.md');
    assert.ok(!atlas.edges.some((e) => e.from === 'trans'), 'a link in a translation is no link');
    assert.ok(!t.tags.some((tg) => tg.id === 'human.question'), 'a tag rule matching a translation adds no tag');
  });

  test('applies an annotation\'s words under a language\'s tag (skill-atlas-6)', () => {
    const a = skillOf(atlas, 'annotated').translations['zh-CN'];
    assert.deepEqual(a, {
      origin: 'annotation', file: null, frontmatter: null, description: null, summary: '\u51B3\u5B9A\u5E76\u8BB0\u5F55\u8BA1\u5212\u3002',
      steps: [{ title: '\u51B3\u5B9A\u8BA1\u5212', excerpt: '\u9009\u4E00\u4E2A\u8BA1\u5212\u3002' }, { title: '\u5199\u4E0B\u6765', excerpt: 'Record it.' }],
      stale: false, edited: false,
    });
    const d = skillOf(atlas, 'delta').translations['zh-CN'];
    assert.equal(d.origin, 'skill', 'an annotation\'s summary joins the translation file\'s words');
    assert.equal(d.summary, '\u5FB7\u5C14\u5854\u89E3\u91CA\u5B83\u7684\u89C4\u5219\u3002');
    assert.deepEqual(d.steps.map((st) => st.title), ['\u80CC\u666F', '\u89C4\u5219']);
  });

  test('reports a calls cycle', () => {
    const c = atlas.insights.find((i) => i.kind === 'cycle');
    assert.deepEqual([...c.skills].sort(), ['ping', 'pong']);
    assert.ok(skillOf(atlas, 'ping').issues.includes('cycle'));
  });

  test('applies annotations and reports unknown skills', () => {
    const d = skillOf(atlas, 'delta');
    assert.equal(d.summary, 'Delta explains its rules.');
    const approval = d.steps[1].tags.find((t) => t.id === 'human.approval');
    assert.equal(approval.source, 'annotation');
    assert.ok(d.tags.some((t) => t.id === 'output.custom-thing' && t.label === 'custom-thing'));
    const added = edge(atlas, 'delta', 'review');
    assert.equal(added.length, 1);
    assert.equal(added[0].source, 'annotation');
    assert.equal(added[0].fromStep, 'delta#1');
    assert.deepEqual(d.steps[0].calls, ['review']);
    assert.equal(edge(atlas, 'orchestrator', 'lint-fix').length, 0, 'removeCalls drops the scanned edge');
    assert.ok(!skillOf(atlas, 'orchestrator').tags.some((t) => t.id === 'output.files'), 'removeTags drops a tag the scan found');
    const plain = scanJson(P, [], path.join(tmp, 'no-annotations-state')).atlas;
    assert.ok(skillOf(plain, 'orchestrator').tags.some((t) => t.id === 'output.files'), 'without annotations the scan finds output.files');
    assert.ok(edge(plain, 'orchestrator', 'lint-fix').length > 0, 'without annotations the scan finds the lint-fix link');
    assert.ok(skillOf(plain, 'annotated').tags.some((t) => t.id === 'human.question'));
    assert.match(stderr, /"not-installed" is not installed/);
    const a = skillOf(atlas, 'annotated');
    assert.deepEqual(a.steps.map((st) => st.title), ['Decide the plan', 'Write it down']);
    assert.equal(a.steps[0].excerpt, 'Pick one plan.');
    assert.equal(a.steps[0].tags[0].id, 'human.choice');
    assert.equal(a.steps[0].tags[0].source, 'annotation');
    assert.deepEqual(a.steps[0].calls, ['review']);
    assert.ok(edge(atlas, 'annotated', 'review').every((e) => e.source === 'annotation' && e.fromStep === 'annotated#1'));
    assert.equal(a.steps[0].line, null);
    assert.equal(a.steps[0].endLine, null);
    assert.ok(a.steps[1].tags.some((t) => t.id === 'output.files' && t.source === 'annotation' && t.evidence[0].text === 'writes the plan'), 'addTags applies to a replaced step');
    assert.deepEqual(a.steps[1].calls, ['lint-fix'], 'addCalls applies to a replaced step');
    const kept = a.tags.find((t) => t.id === 'human.question');
    assert.ok(kept && kept.source === 'rule', 'the replaced steps\' scanned tags stay on the skill');
  });

  test('survives malformed frontmatter', () => {
    const b = skillOf(atlas, 'broken');
    assert.ok(b, 'falls back to the folder name');
    assert.equal(b.description, '');
    assert.ok(b.issues.includes('invalid-frontmatter'));
    assert.ok(b.issues.includes('missing-description'));
    const u = skillOf(atlas, 'unclosed');
    assert.ok(u.issues.includes('invalid-frontmatter'));
  });

  test('emits relative forward-slash file paths and root counts', () => {
    const root = atlas.roots.find((r) => r.id === 'project-claude');
    assert.equal(root.skillCount, atlas.skills.filter((s) => s.root === 'project-claude').length);
    assert.equal(root.label, 'Project \u00B7 Claude Code');
  });
});

test('scan --summary prints the digest (skill-atlas-24, skill-atlas-7)', () => {
  const r = run(['scan', '--summary', '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(P, 'state')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Skill Atlas: \d+ skills \(plus \d+ cop(y|ies) in other folders\) in \d+ folders;/);
  assert.match(r.stdout, /\nFolders \(skills present, copies included\):\n {2}project-claude +\d+ /);
  assert.match(r.stdout, /\nMost linked:\n {2}\S+: /);
  assert.match(r.stdout, /\nUnresolved links \(3\):\n {2}orchestrator step 3 -> missing-thing/);
  assert.match(r.stdout, /\nDuplicate names, differing SKILL\.md \(1\):\n {2}dup \[project-claude\], dup@project-codex \[project-codex\]/);
  assert.match(r.stdout, /\nCycles \(1\):\n {2}ping -> pong -> ping/);
  assert.match(r.stdout, /\n {2}no steps \(\d+\): .*plain/);
  assert.match(r.stdout, /\n {2}sections only \(\d+\): .*delta/);
  assert.match(r.stdout, /\nInstalled in several folders \(\d+\):\n(.*\n)* {2}same \(also installed in 1 other folder\): project-claude, project-gemini/);
});

test('an unreadable annotations file is warned of and skipped', () => {
  const project = path.join(tmp, 'dir-annotations');
  writeSkill(path.join(project, '.claude', 'skills', 'one'), `${fm('one', 'One.')}\n## A\nText.\n`);
  fs.mkdirSync(path.join(project, 'state', 'annotations.json'), { recursive: true });
  const { atlas, stderr } = scanJson(project);
  assert.equal(atlas.skills.length, 1);
  assert.match(stderr, /cannot read .*annotations\.json/);
});

test('links: paths, HTTP routes, a plain command word and a prose "Skill:" are no calls; "instead of" keeps a call', () => {
  const project = path.join(tmp, 'links-project');
  const dir = path.join(project, '.claude', 'skills');
  for (const n of ['docs', 'run', 'test', 'review', 'dev']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\nText.\n`);
  writeSkill(path.join(dir, 'caller'), `${fm('caller', 'Links in prose.')}
Write the page under /docs and commit it. Then POST /run to start.
Run the test command and wait.
Skill: review the code
For reviews, use the \`review\` skill instead of reading by hand.
Mount it at /dev for now.
Then run the \`/test\` command.
Type /dev to start the dev command.
`);
  const { atlas } = scanJson(project);
  const from = (to) => edge(atlas, 'caller', to);
  assert.equal(from('docs').length, 0, 'a path after "under"');
  assert.equal(from('run').length, 0, 'an HTTP route');
  assert.deepEqual(from('test').map((e) => [e.kind, e.evidence.line]), [['calls', 11]], 'only the backticked `/test` command');
  assert.deepEqual(from('review').map((e) => e.kind), ['calls'], '"use X instead of Y" is a call, and "Skill: review the code" adds none');
  assert.equal(from('review')[0].evidence.line, 9);
  assert.deepEqual(from('dev').map((e) => e.evidence.line), [12], 'a folder-like name needs a sentence about a command');
});

test('a very long line is scanned in bounded time', () => {
  const project = path.join(tmp, 'long-line');
  const dir = path.join(project, '.claude', 'skills');
  writeSkill(path.join(dir, 'pr'), `${fm('pr', 'PR.')}\nText.\n`);
  writeSkill(path.join(dir, 'long'), `${fm('long', 'Long.')}\n${'use the pr skill '.repeat(20000)}\n`);
  const started = Date.now();
  const { atlas } = scanJson(project);
  const LONG_LINE_BUDGET_MS = 10_000; // unbounded, this line took about 8 s; bounded, well under one
  assert.ok(Date.now() - started < LONG_LINE_BUDGET_MS);
  assert.equal(edge(atlas, 'long', 'pr')[0].kind, 'calls');
});

test('an invalid annotations file is reported and skipped', () => {
  const project = path.join(tmp, 'bad-annotations');
  writeSkill(path.join(project, '.claude', 'skills', 'one'), `${fm('one', 'One.')}\n## A\nText.\n`);
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  fs.writeFileSync(path.join(project, 'state', 'annotations.json'), '{ not json');
  const { atlas, stderr } = scanJson(project);
  assert.equal(atlas.skills.length, 1);
  assert.match(stderr, /annotations\.json is not valid JSON/);
});

test('an edited rules file applies on the next scan, and a bad user regex is reported and skipped', () => {
  const rules = path.join(tmp, 'rules.json');
  const write = (patterns) => fs.writeFileSync(rules, JSON.stringify({ version: 1, tags: [{ id: 'tool.x', category: 'tool', label: 'X', patterns }] }));
  const project = path.join(tmp, 'rules-project');
  writeSkill(path.join(project, '.claude', 'skills', 'w'), `${fm('w', 'W.')}\nUse the widget.\n`);
  write(['\\bgadget\\b']);
  assert.ok(!skillOf(scanJson(project, ['--rules', rules]).atlas, 'w').tags.some((t) => t.id === 'tool.x'));
  write(['(unclosed', '\\bwidget\\b']);
  const { atlas, stderr } = scanJson(project, ['--rules', rules]);
  assert.match(stderr, /not a valid regular expression/);
  assert.ok(skillOf(atlas, 'w').tags.some((t) => t.id === 'tool.x'));
});

test('plugin skills: installed for this project, enabled, and linkable as plugin:name', () => {
  const config = path.join(tmp, 'claude-config');
  const project = path.join(tmp, 'plugin-project');
  const install = (name) => {
    const dir = path.join(config, 'plugins', 'cache', 'm', name);
    writeSkill(path.join(dir, 'skills', `${name}-skill`), `${fm(`${name}-skill`, `${name} skill.`)}\nText.\n`);
    return dir;
  };
  writeSkill(path.join(project, '.claude', 'skills', 'caller'), `${fm('caller', 'Calls a plugin skill.')}\nRun \`/tools:tools-skill\` first.\n`);
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: {
      'tools@m': [{ scope: 'user', installPath: install('tools') }],
      'here@m': [{ scope: 'project', installPath: install('here'), projectPath: project }],
      'elsewhere@m': [{ scope: 'project', installPath: install('elsewhere'), projectPath: path.join(tmp, 'other-project') }],
      'off@m': [{ scope: 'user', installPath: install('off') }],
    },
  }));
  fs.mkdirSync(path.join(config, 'plugins', 'marketplaces', 'm', 'skills', 'market-skill'), { recursive: true });
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'off@m': false } }));
  const r = run(['scan', '--cwd', path.join(project, '.claude'), '--no-user', '--state', path.join(project, 'state')], { env: { CLAUDE_CONFIG_DIR: config } });
  assert.equal(r.status, 0, r.stderr);
  const atlas = JSON.parse(r.stdout);
  const plugin = atlas.skills.filter((s) => s.plugin).map((s) => `${s.plugin}/${s.name}`).sort();
  assert.deepEqual(plugin, ['here/here-skill', 'tools/tools-skill'], 'a project install counts inside its project; disabled and other-project installs do not');
  const r2 = run(['scan', '--cwd', project, '--no-user', '--state', path.join(project, 'state')], { env: { CLAUDE_CONFIG_DIR: config } });
  const atlas2 = JSON.parse(r2.stdout);
  assert.ok(atlas2.edges.some((e) => e.from === 'caller' && e.to === 'tools-skill' && e.kind === 'calls'));
});

// Every file under the folders with its content, to prove a command changes none.
function contents(...dirs) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out[full] = `${fs.statSync(full).mtimeMs}:${fs.readFileSync(full, 'utf8')}`;
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

test('pin records each translation\'s source digest, and pin --check names those behind or unpinned (skill-atlas-28)', () => {
  const project = path.join(tmp, 'pin-project');
  const state = path.join(project, 'state');
  const skill = path.join(project, '.claude', 'skills', 'pinned');
  writeSkill(skill, `${fm('pinned', 'Pinned.')}\n## Step 1: A\nA.\n\n## Step 2: B\nB.\n`);
  const SPDX = '<!-- SPDX-License-Identifier: Apache-2.0 -->';
  fs.writeFileSync(path.join(skill, 'SKILL.zh-CN.md'), `${fm('pinned', '\u5DF2\u56FA\u5B9A\u3002')}\n${SPDX}\n\n## \u6B65\u9AA4 1\uFF1AA\nA\u3002\n\n## \u6B65\u9AA4 2\uFF1AB\nB\u3002\n`);
  fs.mkdirSync(path.join(skill, 'references'), { recursive: true });
  const ref = path.join(skill, 'references', 'a.md');
  fs.writeFileSync(ref, '# A\n');
  const refZh = path.join(skill, 'references', 'a.zh-CN.md');
  fs.writeFileSync(refZh, `${SPDX}\n<!-- SPDX-FileCopyrightText: 2026 Test -->\n\n# A\u6587\n`);
  const labels = path.join(skill, 'references', 'labels.json');
  fs.writeFileSync(labels, '{\n  "version": 1,\n  "title": "Labels"\n}\n');
  const labelsZh = path.join(skill, 'references', 'labels.zh-CN.json');
  fs.writeFileSync(labelsZh, '{\n  "version": 1,\n  "title": "\u6807\u7B7E"\n}\n');
  // Names whose infix is no language tag: files, not translations.
  const plain = { 'app.dev.yaml': 'dev: true\n', 'data.min.json': '{"a":1}\n', 'notes.bak.md': '# old\n' };
  for (const [f, text] of Object.entries(plain)) {
    fs.writeFileSync(path.join(skill, 'references', f.replace(/\.[a-z]+(\.[a-z]+)$/, '$1')), text);
    fs.writeFileSync(path.join(skill, 'references', f), text);
  }
  const stateJa = path.join(state, 'translations', 'pinned', 'references', 'a.ja.md');
  fs.mkdirSync(path.dirname(stateJa), { recursive: true });
  fs.writeFileSync(stateJa, '# A in ja\n');
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', state];

  const untouched = contents(skill, state);
  let r = run(['pin', '--check', skill, path.join(state, 'translations'), ...scope], { cwd: project });
  assert.equal(r.status, 1, 'unpinned translations fail the check');
  const named = r.stdout.split('\n').filter((l) => l.startsWith('no digest'));
  assert.equal(named.length, 4, r.stdout);
  for (const f of ['SKILL.zh-CN.md', 'a.zh-CN.md', 'labels.zh-CN.json', 'a.ja.md']) assert.ok(named.some((l) => l.endsWith(f)), `${f} is named`);
  assert.deepEqual(contents(skill, state), untouched, 'the check changes no file');

  r = run(['pin', skill, path.join(state, 'translations', 'pinned'), ...scope], { cwd: project });
  assert.equal(r.status, 0, r.stderr);
  const skillLines = fs.readFileSync(path.join(skill, 'SKILL.zh-CN.md'), 'utf8').split('\n');
  const skillZhText = fs.readFileSync(path.join(skill, 'SKILL.zh-CN.md'), 'utf8');
  assert.deepEqual(skillLines.slice(3, 7), ['---', '', SPDX, mdRecord(sha(path.join(skill, 'SKILL.md')), ownOf(skillZhText))], 'after the frontmatter and the SPDX line following it, with its own digest');
  const refLines = fs.readFileSync(refZh, 'utf8').split('\n');
  assert.equal(refLines[2], mdRecord(sha(ref), ownOf(fs.readFileSync(refZh, 'utf8'))), 'at the top after the SPDX lines');
  assert.equal(fs.readFileSync(labelsZh, 'utf8'), `{\n  "translationOf": { "sha256": "${sha(labels)}" },\n  "version": 1,\n  "title": "\u6807\u7B7E"\n}\n`, 'a top-level key, the formatting kept');
  assert.equal(fs.readFileSync(stateJa, 'utf8').split('\n')[0], mdRecord(sha(ref), ownOf(fs.readFileSync(stateJa, 'utf8'))), 'a state translation records its skill\'s file');
  for (const f of ['app.dev.yaml', 'data.min.json', 'notes.bak.md']) assert.equal(fs.readFileSync(path.join(skill, 'references', f), 'utf8'), plain[f], `${f} is no translation and is left unchanged`);

  r = run(['pin', '--check', skill, path.join(state, 'translations'), ...scope], { cwd: project });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /4 translations up to date/);

  fs.writeFileSync(ref, '# A, changed\n');
  const pinnedState = contents(skill, state);
  r = run(['pin', '--check', skill], { cwd: project });
  assert.equal(r.status, 1, 'a translation behind its source fails the check');
  const behind = r.stdout.split('\n').filter((l) => l.startsWith('behind'));
  assert.equal(behind.length, 1, r.stdout);
  assert.match(behind[0], /a\.zh-CN\.md/);
  assert.deepEqual(contents(skill, state), pinnedState, 'the check changes no file');
  fs.writeFileSync(ref, '# A\n');

  // A Markdown translation edited after it was pinned is named as edited.
  fs.appendFileSync(refZh, '\u8865\u5145\u3002\n');
  const editedState = contents(skill, state);
  r = run(['pin', '--check', skill], { cwd: project });
  assert.equal(r.status, 1, 'a translation edited apart from its source fails the check');
  const editedLines = r.stdout.split('\n').filter((l) => l.startsWith('edited'));
  assert.equal(editedLines.length, 1, r.stdout);
  assert.match(editedLines[0], /a\.zh-CN\.md/);
  assert.ok(!r.stdout.split('\n').some((l) => l.startsWith('behind')), r.stdout);
  assert.deepEqual(contents(skill, state), editedState, 'the check changes no file');
  const atlasEdited = scanJson(project, [], state).atlas;
  assert.ok(atlasEdited.insights.some((i) => i.kind === 'edited-translation' && i.params.files.includes('references/a.zh-CN.md')));
  fs.writeFileSync(ref, '# A, changed\n');
  const atlasBehind = scanJson(project, [], state).atlas;
  assert.ok(atlasBehind.insights.some((i) => i.kind === 'stale-translation' && i.params.files.includes('references/a.zh-CN.md')));

  r = run(['pin', refZh], { cwd: project });
  assert.equal(r.status, 0, r.stderr);
  const again = fs.readFileSync(refZh, 'utf8').split('\n');
  assert.equal(again.filter((l) => l.includes('skill-atlas:source')).length, 1, 'the record is rewritten in place');
  assert.equal(again[2], mdRecord(sha(ref), ownOf(again.join('\n'))));
  const pinnedJson = JSON.parse(fs.readFileSync(labelsZh, 'utf8'));
  fs.writeFileSync(labels, '{ "version": 1, "title": "Changed" }\n');
  assert.equal(run(['pin', labelsZh]).status, 0);
  assert.notEqual(JSON.parse(fs.readFileSync(labelsZh, 'utf8')).translationOf.sha256, pinnedJson.translationOf.sha256, 'the JSON record is rewritten in place');
  assert.equal(fs.readFileSync(labelsZh, 'utf8').split('translationOf').length, 2, 'one key');

  const { atlas } = scanJson(project, [], state);
  const s = skillOf(atlas, 'pinned');
  assert.equal(s.translations['zh-CN'].stale, false);
  assert.deepEqual(s.files.find((f) => f.path === 'references/a.md').translations, ['ja', 'zh-CN']);

  const notOne = run(['pin', path.join(skill, 'SKILL.md')]);
  assert.equal(notOne.status, 1);
  assert.match(notOne.stderr, /is not a translation/);

  // Pinning rewrites only the record line, every other line keeping its own end.
  const mixedSrc = path.join(skill, 'references', 'mixed.md');
  fs.writeFileSync(mixedSrc, '# M\n');
  const mixed = path.join(skill, 'references', 'mixed.zh-CN.md');
  fs.writeFileSync(mixed, '# T\nline1\r\nline2\nline3\n');
  assert.equal(run(['pin', mixed]).status, 0);
  const mixedText = fs.readFileSync(mixed, 'utf8');
  assert.equal(mixedText, `${mdRecord(sha(mixedSrc), ownOf(mixedText))}\n# T\nline1\r\nline2\nline3\n`);

  // A translation that cannot hold a record refuses the whole pin, changing no file.
  fs.writeFileSync(path.join(skill, 'references', 'list.json'), '[1]\n');
  fs.writeFileSync(path.join(skill, 'references', 'list.zh-CN.json'), '[1, 2]\n');
  fs.writeFileSync(ref, '# A, changed again\n');
  const beforeRefused = contents(skill, state);
  const refused = run(['pin', skill], { cwd: project });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /list\.zh-CN\.json/);
  assert.match(refused.stderr, /no translation was changed/);
  assert.deepEqual(contents(skill, state), beforeRefused, 'no translation is written');
});

test('a CLI failure is one line on stderr and a non-zero exit', () => {
  const r = run(['scan', '--cwd', path.join(tmp, 'no-such-folder')]);
  assert.notEqual(r.status, 0);
  assert.equal(r.stderr.trim().split('\n').length, 1);
  assert.match(r.stderr, /is not a folder/);
  const u = run(['scan', '--bogus']);
  assert.notEqual(u.status, 0);
  assert.match(u.stderr, /unknown option --bogus/);
});

// skill-atlas-25: the server started on a free port. It runs a copy of the
// skill so the test can edit the copy's references/ files.
describe('serve (skill-atlas-25)', () => {
  const state = path.join(tmp, 'serve-state');
  const viewer = path.join(tmp, 'viewer.html');
  const copy = path.join(tmp, 'skill-copy');
  let child;
  let info;
  let port;

  before(async () => {
    fs.writeFileSync(viewer, `<!doctype html><title>t</title>${EMBED_MARKER}\n`);
    fs.cpSync(path.dirname(path.dirname(CLI)), copy, { recursive: true });
    child = spawn(process.execPath, [path.join(copy, 'scripts', 'atlas.mjs'), 'serve', '--no-open', '--port', '0', '--lang', 'zh-CN', '--cwd', P, '--no-user', '--no-plugins', '--state', state, '--viewer', viewer], { stdio: ['ignore', 'pipe', 'pipe'] });
    info = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('server did not start in time')), SERVER_START_TIMEOUT_MS);
      child.stdout.on('data', (d) => {
        buf += d;
        const nl = buf.indexOf('\n');
        if (nl >= 0) { clearTimeout(timer); resolve(JSON.parse(buf.slice(0, nl))); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
    });
    port = Number(new URL(info.url).port);
  });

  after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      await exited;
    }
  });

  function request({ method = 'GET', pathname, headers = {}, body }) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { text += d; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      });
      req.on('error', reject);
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`${method} ${pathname} timed out`)));
      if (body !== undefined) req.write(body);
      req.end();
    });
  }
  const json = { 'X-Skill-Atlas': '1', 'Content-Type': 'application/json' };

  test('prints one JSON line with the URL, state and skill count', () => {
    assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(info.state, state);
    assert.ok(info.skills > 10);
  });

  test('serves the viewer and the atlas with safe headers', async () => {
    const page = await request({ pathname: '/' });
    assert.equal(page.status, 200);
    assert.ok(page.text.includes(EMBED_MARKER));
    const r = await request({ pathname: '/api/atlas' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.ok(JSON.parse(r.text).skills.some((s) => s.id === 'orchestrator'));
    const cfg = JSON.parse((await request({ pathname: '/api/config' })).text);
    assert.equal(cfg.static, false);
    assert.ok(Array.isArray(cfg.presets) && cfg.presets.length > 0);
    assert.equal(cfg.stateDir, state);
  });

  const WF = () => path.join(state, 'workflows.json');
  const wfDoc = (name) => ({ version: 1, active: 'w', workflows: [{ id: 'w', name, phases: [{ id: 'p1', name: 'One', skills: ['alpha', 'gone'] }] }] });
  const put = (doc, extra = {}) => request({ method: 'PUT', pathname: '/api/workflows', headers: { ...json, ...extra }, body: typeof doc === 'string' ? doc : JSON.stringify(doc) });

  test('saves workflows only against the version last read', async () => {
    const first = await request({ pathname: '/api/workflows' });
    assert.equal(first.status, 200);
    assert.equal(first.headers.etag, '"none"', 'no stored file');
    assert.deepEqual(JSON.parse(first.text), { version: 1, active: null, workflows: [] });

    assert.equal((await put(wfDoc('W'))).status, 428, 'a save without If-Match');
    assert.ok(!fs.existsSync(WF()));

    const saved = await put(wfDoc('W'), { 'If-Match': first.headers.etag });
    assert.equal(saved.status, 200, saved.text);
    const bytes = fs.readFileSync(WF());
    const stored = JSON.parse(bytes.toString('utf8'));
    assert.equal(saved.headers.etag, `"${crypto.createHash('sha256').update(bytes).digest('hex')}"`);
    assert.equal(stored.workflows[0].phases[0].note, '', 'a missing note is stored as ""');
    assert.deepEqual(stored.workflows[0].phases[0].skills, ['alpha', 'gone'], 'an id with no skill is kept');
    if (process.platform !== 'win32') assert.equal(fs.statSync(state).mode & 0o777, 0o700);

    const again = await request({ pathname: '/api/workflows' });
    assert.deepEqual(JSON.parse(again.text), stored);
    assert.equal(again.headers.etag, saved.headers.etag);

    const stale = await put(wfDoc('Stale'), { 'If-Match': first.headers.etag });
    assert.equal(stale.status, 412);
    assert.equal(JSON.parse(stale.text).error, 'changed');
    assert.equal(stale.headers.etag, saved.headers.etag, 'the refusal names the current version');
    assert.deepEqual(fs.readFileSync(WF()), bytes, 'nothing written');

    const ifMatch = { 'If-Match': saved.headers.etag };
    const bad = await put({ version: 1, active: 'nope', workflows: [] }, ifMatch);
    assert.equal(bad.status, 400);
    assert.match(JSON.parse(bad.text).message, /active/);
    assert.equal((await put({ version: 2, active: null, workflows: [] }, ifMatch)).status, 400, 'another version');
    assert.equal((await put('{ nope', ifMatch)).status, 400);
    assert.deepEqual(fs.readFileSync(WF()), bytes, 'a refused document leaves the stored one');
    assert.equal((await put(wfDoc('W'), { 'X-Skill-Atlas-Replace-Invalid': '1' })).status, 409, 'a valid file is not replaced as invalid');
  });

  test('reports an unreadable stored file and replaces it only on request, keeping it', async () => {
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(WF(), '{ broken');
    fs.writeFileSync(path.join(state, 'workflows.invalid-1.json'), 'an earlier one');
    const got = await request({ pathname: '/api/workflows' });
    assert.equal(got.status, 409);
    const body = JSON.parse(got.text);
    assert.equal(body.error, 'invalid-workflows');
    assert.equal(body.path, WF());
    assert.equal((await put(wfDoc('W'), { 'If-Match': '"none"' })).status, 409, 'an ordinary save does not overwrite it');
    assert.equal(fs.readFileSync(WF(), 'utf8'), '{ broken');

    fs.writeFileSync(WF(), JSON.stringify({ version: 1, active: null, workflows: 'nope' }));
    assert.equal((await request({ pathname: '/api/workflows' })).status, 409, 'a file of the wrong shape is invalid too');

    const replaced = await put(wfDoc('Fresh'), { 'X-Skill-Atlas-Replace-Invalid': '1' });
    assert.equal(replaced.status, 200, replaced.text);
    assert.equal(JSON.parse(fs.readFileSync(WF(), 'utf8')).workflows[0].name, 'Fresh');
    assert.equal(fs.readFileSync(path.join(state, 'workflows.invalid-1.json'), 'utf8'), 'an earlier one');
    assert.match(fs.readFileSync(path.join(state, 'workflows.invalid-2.json'), 'utf8'), /"nope"/, 'the invalid file kept beside it');
    assert.equal(replaced.headers.etag, (await request({ pathname: '/api/workflows' })).headers.etag);
  });

  test('returns edited presets and view settings on the next read', async () => {
    const presetsFile = path.join(copy, 'references', 'workflow-presets.json');
    const viewFile = path.join(copy, 'references', 'view-settings.json');
    const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf8'));
    presets.presets.push({ id: 'mine', name: 'Mine', description: 'Added.', phases: [{ name: 'Only', keywords: [] }] });
    fs.writeFileSync(presetsFile, JSON.stringify(presets));
    const view = JSON.parse(fs.readFileSync(viewFile, 'utf8'));
    view.title = 'Edited title';
    fs.writeFileSync(viewFile, JSON.stringify(view));
    const cfg = JSON.parse((await request({ pathname: '/api/config' })).text);
    assert.ok(cfg.presets.some((p) => p.id === 'mine'));
    assert.equal(cfg.view.title, 'Edited title');
  });

  test('returns edited label files and catalogs on the next read, with --lang (skill-atlas-23)', async () => {
    const refs = path.join(copy, 'references');
    const write = (file, doc) => fs.writeFileSync(file, JSON.stringify(doc, null, 2));
    write(path.join(refs, 'tag-rules.zh-CN.json'), { version: 1, tags: [{ id: 'tool.shell', category: 'tool', label: 'SHELL-ZH', patterns: ['ignored'] }] });
    write(path.join(refs, 'workflow-presets.zh-CN.json'), { version: 1, presets: [{ id: 'sdlc', name: 'S-ZH', description: 'D-ZH', phases: [{ name: 'P1', keywords: ['x'] }, { name: 'P2' }] }] });
    write(path.join(refs, 'view-settings.zh-CN.json'), { version: 1, title: 'T-ZH', categories: { input: { label: 'I-ZH', color: '#000' } } });
    fs.mkdirSync(path.join(copy, 'assets', 'locales'), { recursive: true });
    const catalog = path.join(copy, 'assets', 'locales', 'zh-CN.json');
    write(catalog, { version: 1, language: 'zh-CN', name: '\u7B80\u4F53\u4E2D\u6587', messages: { Rescan: 'R-ZH' } });
    let cfg = JSON.parse((await request({ pathname: '/api/config' })).text);
    assert.equal(cfg.lang, 'zh-CN', 'the --lang the command was given');
    assert.deepEqual(cfg.labels['zh-CN'], {
      title: 'T-ZH',
      categories: { input: 'I-ZH' },
      tags: { 'tool.shell': 'SHELL-ZH' },
      presets: { sdlc: { name: 'S-ZH', description: 'D-ZH', phases: ['P1', 'P2'] } },
    }, 'labels alone, by id and by position');
    assert.deepEqual(cfg.locales['zh-CN'], { name: '\u7B80\u4F53\u4E2D\u6587', messages: { Rescan: 'R-ZH' } });
    write(catalog, { version: 1, language: 'zh-CN', name: '\u7B80\u4F53\u4E2D\u6587', messages: { Rescan: 'R2-ZH' } });
    write(path.join(refs, 'tag-rules.zh-CN.json'), { version: 1, tags: [{ id: 'tool.shell', label: 'SHELL2-ZH' }] });
    cfg = JSON.parse((await request({ pathname: '/api/config' })).text);
    assert.equal(cfg.locales['zh-CN'].messages.Rescan, 'R2-ZH', 'an edited catalog');
    assert.equal(cfg.labels['zh-CN'].tags['tool.shell'], 'SHELL2-ZH', 'an edited label file');
  });

  test('returns a file asked in a language as its translation, else the original (skill-atlas-10)', async () => {
    const ask = async (skill, rel, lang) => {
      const r = await request({ pathname: `/api/file?skill=${skill}&path=${encodeURIComponent(rel)}&lang=${lang}` });
      assert.equal(r.status, 200, r.text);
      assert.match(r.headers['content-type'], /^application\/json/);
      return JSON.parse(r.text);
    };
    const own = await ask('trans', 'SKILL.md', 'zh-CN');
    assert.equal(own.language, 'zh-CN');
    assert.equal(own.path, 'SKILL.zh-CN.md', 'named as the file it is');
    assert.equal(own.stale, false);
    assert.equal(own.text, fs.readFileSync(path.join(CLAUDE, 'trans', 'SKILL.zh-CN.md'), 'utf8'), 'the skill folder\'s translation');
    const behind = await ask('trans', 'references/guide.md', 'zh-CN');
    assert.equal(behind.language, 'zh-CN');
    assert.equal(behind.path, 'references/guide.zh-CN.md');
    assert.equal(behind.stale, true, 'said to be behind its source');
    const stateFile = path.join(state, 'translations', 'beta', 'SKILL.zh-CN.md');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, '# \u8D1D\u5854\n');
    const fromState = await ask('beta', 'SKILL.md', 'zh-CN');
    assert.deepEqual(fromState, { language: 'zh-CN', path: 'SKILL.zh-CN.md', stale: false, edited: false, text: '# \u8D1D\u5854\n' }, 'the state folder\'s translation');
    const edited = await ask('zhlist', 'SKILL.md', 'en-US');
    assert.deepEqual([edited.language, edited.stale, edited.edited], ['en-US', false, true], 'said to be edited apart from its source');
    // A translation that is a link out of its folder, or a folder, is none: the original is returned.
    const outside = path.join(tmp, 'outside.zh-CN.md');
    fs.writeFileSync(outside, '# outside\n');
    const link = path.join(CLAUDE, 'alpha', 'SKILL.zh-CN.md');
    const folder = path.join(CLAUDE, 'trans', 'references', 'guide.ja.md');
    fs.symlinkSync(outside, link);
    fs.mkdirSync(folder);
    try {
      const viaLink = await ask('alpha', 'SKILL.md', 'zh-CN');
      assert.deepEqual([viaLink.language, viaLink.text], [null, fs.readFileSync(path.join(CLAUDE, 'alpha', 'SKILL.md'), 'utf8')], 'a link leading out is no translation');
      assert.equal((await ask('trans', 'references/guide.md', 'ja')).language, null, 'a folder is no translation');
    } finally {
      fs.rmSync(link);
      fs.rmSync(folder, { recursive: true });
    }
    const original = await ask('alpha', 'SKILL.md', 'zh-CN');
    assert.equal(original.language, null, 'the original where there is none');
    assert.equal(original.path, 'SKILL.md', 'named as the original');
    assert.equal(original.text, fs.readFileSync(path.join(CLAUDE, 'alpha', 'SKILL.md'), 'utf8'));
    assert.equal((await ask('alpha', 'SKILL.md', 'en-US')).language, null);
    assert.equal((await request({ pathname: '/api/file?skill=alpha&path=SKILL.md&lang=not!a!tag' })).status, 400);
    assert.equal((await request({ pathname: `/api/file?skill=trans&path=${encodeURIComponent('../alpha/SKILL.md')}&lang=zh-CN` })).status, 403, 'a path outside the folder is refused in a language too');
  });

  test('refuses a foreign Host and unmarked mutations', async () => {
    const foreign = await request({ pathname: '/api/atlas', headers: { Host: `evil.example:${port}` } });
    assert.equal(foreign.status, 403);
    const noHeader = await request({ method: 'PUT', pathname: '/api/workflows', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    const wrongType = await request({ method: 'POST', pathname: '/api/rescan', headers: { 'X-Skill-Atlas': '1', 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415);
    const huge = await request({ method: 'PUT', pathname: '/api/workflows', headers: json, body: 'x'.repeat(1024 * 1024 + 1) });
    assert.equal(huge.status, 413);
  });

  test('serves skill files and refuses escapes', async () => {
    const ok = await request({ pathname: '/api/file?skill=alpha&path=SKILL.md' });
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /^text\/plain; charset=utf-8/);
    assert.ok(ok.text.includes('# Alpha'));
    const escape = await request({ pathname: `/api/file?skill=alpha&path=${encodeURIComponent('../beta/SKILL.md')}` });
    assert.equal(escape.status, 403);
    const abs = await request({ pathname: `/api/file?skill=alpha&path=${encodeURIComponent(path.join(CLAUDE, 'beta', 'SKILL.md'))}` });
    assert.equal(abs.status, 403);
    assert.equal((await request({ pathname: '/api/file?skill=nope&path=SKILL.md' })).status, 404);
    assert.equal((await request({ pathname: '/api/nothing' })).status, 404);
  });

  test('answers at localhost too, and at the printed URL', async () => {
    assert.equal((await request({ pathname: '/api/atlas', headers: { Host: `localhost:${port}` } })).status, 200);
    assert.equal((await request({ pathname: new URL(info.url).pathname })).status, 200);
  });

  test('rescans on request', async () => {
    writeSkill(path.join(CLAUDE, 'late'), `${fm('late', 'Added after start.')}\nLate.\n`);
    const r = await request({ method: 'POST', pathname: '/api/rescan', headers: json, body: '{}' });
    assert.equal(r.status, 200);
    assert.ok(JSON.parse(r.text).skills.some((s) => s.id === 'late'));
    fs.rmSync(path.join(CLAUDE, 'late'), { recursive: true });
  });
});

// skill-atlas-25 (export) and skill-atlas-22.
describe('export', () => {
  test('embeds the data with < escaped', () => {
    const project = path.join(tmp, 'export-project');
    writeSkill(path.join(project, '.claude', 'skills', 'html'), `${fm('html', '"Breaks </script> tags"')}\nText.\n`);
    const viewer = path.join(tmp, 'export-viewer.html');
    fs.writeFileSync(viewer, `<html><body>\n${EMBED_MARKER}\n</body></html>\n`);
    const out = path.join(tmp, 'out', 'atlas.html');
    const r = run(['export', '--out', out, '--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state'), '--viewer', viewer]);
    assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(out, 'utf8');
    const m = /<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'the embed element holds data');
    assert.ok(!m[1].includes('<'), 'no raw < inside the element');
    const data = JSON.parse(m[1]);
    assert.equal(data.config.static, true);
    assert.deepEqual(data.workflows, { version: 1, active: null, workflows: [] });
    assert.equal(data.atlas.skills[0].description, 'Breaks </script> tags');
  });

  test('embeds the config with its catalogs and --lang\'s language (skill-atlas-22)', () => {
    const copy = path.join(tmp, 'export-skill-copy');
    fs.cpSync(path.dirname(path.dirname(CLI)), copy, { recursive: true });
    fs.mkdirSync(path.join(copy, 'assets', 'locales'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'assets', 'locales', 'zh-CN.json'), JSON.stringify({ version: 1, language: 'zh-CN', name: 'ZH', messages: { Rescan: '</script><b>R</b>' } }));
    fs.writeFileSync(path.join(copy, 'references', 'view-settings.zh-CN.json'), JSON.stringify({ title: 'T-ZH' }));
    const viewer = path.join(tmp, 'export-viewer.html');
    fs.writeFileSync(viewer, `<html><body>\n${EMBED_MARKER}\n</body></html>\n`);
    const out = path.join(tmp, 'export-lang.html');
    const r = spawnSync(process.execPath, [path.join(copy, 'scripts', 'atlas.mjs'), 'export', '--lang', 'zh-CN', '--out', out, '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(P, 'state'), '--viewer', viewer], { encoding: 'utf8', timeout: CLI_TIMEOUT_MS });
    assert.equal(r.status, 0, r.stderr);
    const m = /<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(out, 'utf8'));
    assert.ok(!m[1].includes('<'), 'no text can close the data element');
    const data = JSON.parse(m[1]);
    assert.equal(data.config.lang, 'zh-CN');
    assert.deepEqual(data.config.locales['zh-CN'], { name: 'ZH', messages: { Rescan: '</script><b>R</b>' } });
    assert.equal(data.config.labels['zh-CN'].title, 'T-ZH');
    assert.equal(data.config.static, true);
    assert.ok(skillOf(data.atlas, 'trans').translations['zh-CN'], 'the atlas holds the translations');
    const bad = run(['export', '--lang', 'zh_CN!', '--out', out, '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(P, 'state'), '--viewer', viewer]);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /--lang zh_CN! is not a language tag/);
  });

  test('works with the bundled viewer', (t) => {
    const bundled = path.join(REPO, 'skills', 'skill-atlas', 'assets', 'viewer.html');
    if (!fs.existsSync(bundled)) return t.skip('assets/viewer.html is not present');
    assert.ok(fs.readFileSync(bundled, 'utf8').includes(EMBED_MARKER), 'the bundled viewer holds the marker');
    const out = path.join(tmp, 'bundled-export.html');
    const r = run(['export', '--out', out, '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(P, 'state')]);
    assert.equal(r.status, 0, r.stderr);
    const m = /<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(out, 'utf8'));
    assert.ok(JSON.parse(m[1]).atlas.skills.some((s) => s.id === 'orchestrator'));
  });

  test('embeds only a valid stored workflows file', () => {
    const project = path.join(tmp, 'export-invalid');
    writeSkill(path.join(project, '.claude', 'skills', 'one'), `${fm('one', 'One.')}\nText.\n`);
    fs.mkdirSync(path.join(project, 'state'), { recursive: true });
    fs.writeFileSync(path.join(project, 'state', 'workflows.json'), '{ broken');
    const viewer = path.join(tmp, 'export-viewer.html');
    const out = path.join(tmp, 'export-invalid.html');
    const r = run(['export', '--out', out, '--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state'), '--viewer', viewer]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /workflows\.json is not valid JSON.*exporting with no workflows/);
    const m = /<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(JSON.parse(m[1]).workflows, { version: 1, active: null, workflows: [] });
    assert.equal(fs.readFileSync(path.join(project, 'state', 'workflows.json'), 'utf8'), '{ broken', 'the file stands');
  });

  test('fails clearly when the viewer has no marker', () => {
    const viewer = path.join(tmp, 'no-marker.html');
    fs.writeFileSync(viewer, '<html></html>');
    const r = run(['export', '--out', path.join(tmp, 'x.html'), '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(P, 'state'), '--viewer', viewer]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /has no <script id="atlas-embedded"/);
  });
});

// skill-atlas-25: every text the page looks up is in the zh-CN catalog.
test('the zh-CN catalog holds every text the page looks up (skill-atlas-25, skill-atlas-29)', () => {
  const viewerFile = path.join(REPO, 'skills', 'skill-atlas', 'assets', 'viewer.html');
  const catalogFile = path.join(REPO, 'skills', 'skill-atlas', 'assets', 'locales', 'zh-CN.json');
  const html = fs.readFileSync(viewerFile, 'utf8');
  const unescape = (body) => body.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (all, cp, u4, x2, ch) => {
    if (cp || u4 || x2) return String.fromCodePoint(parseInt(cp ?? u4 ?? x2, 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' }[ch] ?? ch;
  });
  const keys = new Set();
  for (const m of html.matchAll(/(?<![\w$.])t\(\s*(['"])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/g)) keys.add(unescape(m[2]));
  assert.ok(keys.size > 0, 'the page looks up its text through t()');
  assert.ok(fs.existsSync(catalogFile), 'assets/locales/zh-CN.json exists');
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  assert.equal(catalog.language, 'zh-CN');
  const missing = [...keys].filter((k) => !Object.prototype.hasOwnProperty.call(catalog.messages ?? {}, k));
  assert.deepEqual(missing, [], 'texts with no zh-CN entry');
});

// agent-skills-7 and agent-skills-8 (specs/packages/agent-skills.md).
describe('the repository\'s skills', () => {
  const SKILLS = path.join(REPO, 'skills');
  const DESCRIPTION_MAX = 1024; // Agent Skills specification: description at most 1024 characters
  const BODY_MAX_LINES = 500; // Agent Skills specification: SKILL.md body at most 500 lines
  const folders = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  let atlas;
  before(() => ({ atlas } = scanJson(REPO, [], path.join(tmp, 'repo-state'))));
  const byDir = (n) => atlas.skills.find((s) => s.dir === path.join(SKILLS, n));
  // The text of a step, read from SKILL.md over the step's line span.
  const stepText = (skill, st) => fs.readFileSync(skill.file, 'utf8').split('\n').slice(st.line - 1, st.endLine).join('\n');
  const callsTo = (from, to) => atlas.edges.some((e) => e.from === from.id && e.to === to.id && e.kind === 'calls');

  for (const name of folders) {
    test(`${name}: name, description, body length, links and references`, () => {
      const skill = byDir(name);
      assert.ok(skill, `${name} is found by the scan`);
      assert.ok(!skill.issues.includes('invalid-frontmatter'), `frontmatter parses: ${skill.issues}`);
      assert.equal(skill.frontmatter.name, name, 'name equals the folder');
      const description = skill.frontmatter.description;
      assert.equal(typeof description, 'string');
      assert.ok(description.trim().length > 0, 'description present');
      assert.ok(description.length <= DESCRIPTION_MAX, `description is ${description.length} characters`);
      assert.match(description, /\bwhen\b/i, 'the description says when to use the skill');

      const text = fs.readFileSync(skill.file, 'utf8');
      const lines = text.replace(/\n$/, '').split('\n');
      const close = lines.indexOf('---', 1);
      assert.ok(close > 0);
      assert.ok(lines.length - close - 1 <= BODY_MAX_LINES, `body is ${lines.length - close - 1} lines`);

      const targets = new Set();
      for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1].split('#')[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // a URL or an anchor
        const resolved = path.resolve(skill.dir, decodeURI(target));
        const rel = path.relative(skill.dir, resolved);
        assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), `link ${target} stays in the skill folder`);
        assert.ok(fs.existsSync(resolved), `link ${target} names a file`);
        targets.add(rel.split(path.sep).join('/'));
      }
      const refs = path.join(skill.dir, 'references');
      if (fs.existsSync(refs)) {
        const walk = (dir, rel) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/${e.name}`);
            else if (!isTranslation(path.join(dir, e.name))) assert.ok(targets.has(`${rel}/${e.name}`), `${rel}/${e.name} is linked from SKILL.md itself`);
          }
        };
        walk(refs, 'references');
      }
    });
  }

  // Relative link targets of a Markdown file, as paths relative to the skill folder.
  const linkTargets = (skillDir, file) => {
    const out = [];
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      out.push(path.relative(skillDir, path.resolve(path.dirname(file), decodeURI(target))).split(path.sep).join('/'));
    }
    return out;
  };
  const LABEL_KEYS = new Set(['title', 'label', 'name', 'description']);
  const holdsLabels = (value) => (Array.isArray(value) ? value.some(holdsLabels)
    : value && typeof value === 'object' ? Object.entries(value).some(([k, v]) => (LABEL_KEYS.has(k) && typeof v === 'string') || holdsLabels(v)) : false);
  const withTag = (rel, tag) => rel.replace(/(\.[a-z]+)$/, `.${tag}$1`);

  for (const name of folders) {
    test(`${name}: each translation present and pinned to its source, SKILL.zh-CN.md keeping name and steps and linking translations`, () => {
      const skill = byDir(name);
      const dir = skill.dir;
      const all = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else all.push(path.relative(dir, full).split(path.sep).join('/'));
        }
      };
      walk(dir);
      const sources = all.filter((rel) => !isTranslation(path.join(dir, rel)) && (rel.endsWith('.md')
        || (rel.startsWith('references/') && rel.endsWith('.json') && holdsLabels(JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'))))));
      assert.ok(sources.includes('SKILL.md'));
      for (const rel of sources) assert.ok(all.includes(withTag(rel, 'zh-CN')), `${rel} has a zh-CN translation beside it`);

      const checked = run(['pin', '--check', dir]);
      assert.equal(checked.status, 0, `every translation records its source's digest:\n${checked.stdout}${checked.stderr}`);
      for (const rel of all.filter((r) => r.endsWith('.zh-CN.md'))) {
        const text = fs.readFileSync(path.join(dir, rel), 'utf8');
        assert.match(text, /^<!-- skill-atlas:source sha256=[0-9a-f]{64} own=([0-9a-f]{64}) -->$/m, `${rel} records its source's digest and its own`);
        assert.equal(/ own=([0-9a-f]{64}) -->$/m.exec(text)[1], ownOf(text), `${rel}'s own digest is its own`);
      }

      const zhFile = path.join(dir, 'SKILL.zh-CN.md');
      const zhText = fs.readFileSync(zhFile, 'utf8');
      const zhFront = /^---\n([\s\S]*?)\n---\n/.exec(zhText.replace(/\r\n/g, '\n'));
      assert.ok(zhFront, 'SKILL.zh-CN.md has frontmatter');
      assert.match(zhFront[1], new RegExp(`^name: ${name}$`, 'm'), 'the name is kept');
      const zh = skill.translations['zh-CN'];
      assert.ok(zh && zh.origin === 'skill', 'the scan reads the translation');
      assert.ok(zh.description && zh.description !== skill.description, 'the description is translated');
      assert.ok(Array.isArray(zh.steps), `the translation's steps number as the skill's ${skill.steps.length}`);
      assert.equal(zh.steps.length, skill.steps.length);
      const opening = zhText.replace(/\r\n/g, '\n').slice(zhFront[0].length).split('\n').filter((l) => l.trim() && !/^\s*<!--.*-->\s*$/.test(l)).slice(0, 3).join('\n');
      assert.match(opening, /SKILL\.md/, 'it opens by saying agents load SKILL.md');

      const zhTargets = linkTargets(dir, zhFile);
      for (const target of zhTargets) assert.ok(fs.existsSync(path.join(dir, target)), `link ${target} in SKILL.zh-CN.md names a file`);
      for (const target of linkTargets(dir, path.join(dir, 'SKILL.md'))) {
        const translated = withTag(target, 'zh-CN');
        if (all.includes(translated)) assert.ok(zhTargets.includes(translated), `SKILL.zh-CN.md links ${translated} where SKILL.md links ${target}`);
      }
    });
  }

  test('what the scan reads from code, review and decide', (t) => {
    const names = ['code', 'review', 'decide'];
    if (!names.every((n) => fs.existsSync(path.join(SKILLS, n, 'SKILL.md')))) return t.skip('skills/code, review and decide are not all present');
    const [code, review, decide] = names.map(byDir);
    assert.ok(code && review && decide);

    assert.deepEqual(code.steps.map((st) => st.title), ['Run the first phase', 'Judge the phase', 'Run the next IR task', 'Have the change reviewed once', 'Return the result']);
    assert.deepEqual(code.steps[3].calls, [review.id], 'code\'s review step calls review');
    assert.ok(callsTo(code, review));
    assert.ok(code.steps.some((st) => st.tags.some((tg) => tg.id === 'human.question')), 'a code step asks the user');

    assert.deepEqual(review.steps.map((st) => st.title), ['Fix the scope', 'Run a Reviewer round', 'Judge the Reviewer\'s reply', 'Get the Coder\'s disposition', 'Return the result']);
    assert.ok(!atlas.edges.some((e) => e.from === review.id && e.kind === 'calls'), 'review calls no other skill');
    assert.ok(review.steps.some((st) => /\bat most three\b[^.]*\brounds\b/i.test(stepText(review, st))), 'the three-round bound is stated in a step');

    assert.deepEqual(decide.steps.map((st) => st.title), ['Collect two independent proposals', 'Synthesize and commit', 'Have the decision reviewed', 'Return the result']);
    assert.deepEqual(decide.steps[2].calls, [review.id], 'decide\'s review step calls review');

    for (const skill of [code, review, decide]) {
      const text = fs.readFileSync(skill.file, 'utf8');
      assert.match(text, /\bCaptain\b/, `${skill.name} names the Captain`);
      assert.match(text, /\bCoder\b/, `${skill.name} names the Coder`);
      assert.match(text, /\bWithout (parallel )?subagents\b/i, `${skill.name} names the fallback without subagents`);
      assert.ok(skill.steps.some((st) => /`git rev-parse HEAD`/.test(stepText(skill, st))), `${skill.name} reads the revision from the repository`);
      assert.ok(skill.steps.some((st) => /\bfrom the repository\b|\bread the repository\b/i.test(stepText(skill, st))), `${skill.name} reads commits from the repository, not the reply`);
    }
  });
});
