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

  writeSkill(path.join(CLAUDE, 'beta'), `${fm('beta', 'Beta has a pipeline list.')}
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
  // A group of three calling one another, whose shortest cycle holds two of them.
  writeSkill(path.join(CLAUDE, 'tri-a'), `${fm('tri-a', 'Tri A.')}\nInvoke the \`tri-b\` skill.\n`);
  writeSkill(path.join(CLAUDE, 'tri-b'), `${fm('tri-b', 'Tri B.')}\nInvoke the \`tri-a\` skill.\n\n## Then\n\nInvoke the \`tri-c\` skill.\n`);
  writeSkill(path.join(CLAUDE, 'tri-c'), `${fm('tri-c', 'Tri C.')}\nInvoke the \`tri-b\` skill.\n`);

  // Malformed frontmatter.
  writeSkill(path.join(CLAUDE, 'broken'), `---\nname: broken-name\ndescription: 'unclosed\n  still going\n---\nBody text.\n`);
  writeSkill(path.join(CLAUDE, 'unclosed'), `---\nname: unclosed\ndescription: never closed\nBody without a closing delimiter.\n`);

  // Duplicate name in three real folders, two of them in one root Codex loads, and one folder linked into two roots.
  writeSkill(path.join(CLAUDE, 'dup'), `${fm('dup', 'First copy.')}\nOne.\n`);
  writeSkill(path.join(P, '.codex', 'skills', 'dup'), `${fm('dup', 'Second copy.')}\nTwo.\n`);
  writeSkill(path.join(P, '.codex', 'skills', 'team', 'dup'), `${fm('dup', 'Third copy.')}\nThree.\n`);
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
  fs.writeFileSync(path.join(CLAUDE, 'zhlist', 'SKILL.en-US.md'), `${fm('zhlist', 'A skill with a pipeline list.')}${mdRecord(sha(path.join(CLAUDE, 'zhlist', 'SKILL.md')), '1'.repeat(64))}
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
    assert.deepEqual(dup.map((i) => i.skills), [['dup', 'dup@project-codex', 'dup@project-codex@team.dup']], 'one insight per name');
    assert.deepEqual(skillOf(atlas, 'dup').copies, []);
    assert.deepEqual(skillOf(atlas, 'dup').sameName, ['dup@project-codex', 'dup@project-codex@team.dup'], 'each differing skill of its name');
    assert.deepEqual(skillOf(atlas, 'dup@project-codex').sameName, ['dup', 'dup@project-codex@team.dup']);
    assert.deepEqual(skillOf(atlas, 'alpha').sameName, [], 'none where no other skill has the name');
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
    const codexDir = path.join(P, '.codex', 'skills');
    assert.deepEqual(one('duplicate-name', 'dup').params, { name: 'dup', copies: [
      { id: 'dup', path: path.join(CLAUDE, 'dup'), root: 'project-claude', rootLabel: 'Project · Claude Code' },
      { id: 'dup@project-codex', path: path.join(codexDir, 'dup'), root: 'project-codex', rootLabel: 'Project · Codex' },
      { id: 'dup@project-codex@team.dup', path: path.join(codexDir, 'team', 'dup'), root: 'project-codex', rootLabel: 'Project · Codex' },
    ] });
    assert.match(one('duplicate-name', 'dup').message, /^"dup" has 3 different versions in 3 folders: .*\. An agent that reads more than one of these folders picks one by its own rules\.$/);
    assert.deepEqual(one('unresolved-link', 'orchestrator').params, { name: 'missing-thing', from: 'orchestrator', kind: 'calls' });
    assert.deepEqual([...one('cycle', 'ping').params.path].sort(), ['ping', 'pong']);
    assert.match(one('cycle', 'ping').message, /for example ping \u2192 pong \u2192 ping$/);
    assert.equal(one('oversized', 'big').params.lines, skillOf(atlas, 'big').lines);
    assert.deepEqual(one('name-mismatch', 'other-name').params, { name: 'other-name', folder: 'folder-x' });
    assert.deepEqual(one('no-steps', 'plain').params, {});
  });

  test('gives each insight its level: a problem where the reader must act, else a note (skill-atlas-5)', () => {
    const NOTES = ['duplicate-name', 'oversized', 'missing-description', 'name-mismatch', 'no-steps'];
    const levels = new Map();
    for (const i of atlas.insights) {
      const note = NOTES.includes(i.kind) || (i.kind === 'unresolved-link' && i.params.kind === 'mentions');
      assert.equal(i.level, note ? 'note' : 'problem', `${i.kind} ${i.skills.join(', ')}`);
      levels.set(i.kind, i.level);
    }
    for (const k of ['cycle', 'invalid-frontmatter', 'stale-translation', 'edited-translation', 'translation-steps']) assert.equal(levels.get(k), 'problem', k);
    for (const k of NOTES) assert.equal(levels.get(k), 'note', k);
    assert.equal(levels.get('unresolved-link'), 'problem', 'an unresolved call');
  });

  test('reports a translation behind its source and one of other steps (skill-atlas-5)', () => {
    const stale = atlas.insights.filter((i) => i.kind === 'stale-translation');
    // Each insight's repair is in its params as data, the command its message gives included.
    const repair = (id, rel) => ({ file: rel, writeTo: `<state>/translations/${id}/${rel}`, own: path.join(CLAUDE, id, ...rel.split('/')) });
    const withoutCommand = ({ command, ...rest }) => rest;
    assert.deepEqual(withoutCommand(stale.find((i) => i.skills[0] === 'trans').params), { lang: 'zh-CN', files: ['references/guide.zh-CN.md'], repairs: [repair('trans', 'references/guide.zh-CN.md')] });
    assert.deepEqual(withoutCommand(stale.find((i) => i.skills[0] === 'delta').params), { lang: 'zh-CN', files: ['SKILL.zh-CN.md'], repairs: [repair('delta', 'SKILL.zh-CN.md')] });
    assert.ok(!stale.some((i) => i.skills[0] === 'alpha'), 'a translation recording no digest is not behind');
    const edited = atlas.insights.filter((i) => i.kind === 'edited-translation');
    assert.deepEqual(edited.map((i) => [i.skills, withoutCommand(i.params)]), [[['zhlist'], { lang: 'en-US', files: ['SKILL.en-US.md'], repairs: [{ file: 'SKILL.en-US.md', writeTo: null, own: path.join(CLAUDE, 'zhlist', 'SKILL.en-US.md') }] }]], 'one edited apart from its source, alone');
    for (const i of [...stale, ...edited]) {
      assert.match(i.params.command, /^node <skill-dir>\/scripts\/atlas\.mjs pin --state <state> \S/);
      assert.ok(i.message.includes(` run ${i.params.command}`), `${i.kind}: the command in params is the message's`);
    }
    const steps = atlas.insights.filter((i) => i.kind === 'translation-steps');
    assert.deepEqual(steps.map((i) => [i.skills, i.params]), [[['gamma'], { lang: 'zh-CN', steps: 3, expected: 2 }]]);
    for (const i of [...stale, ...edited]) assert.match(i.message, /run node <skill-dir>\/scripts\/atlas\.mjs pin --state <state> \S/, 'the command a message gives names the script by the skill folder, then its translations');
    assert.ok(stale.find((i) => i.skills[0] === 'delta').message.includes(` to <state>/translations/delta/SKILL.zh-CN.md and run node <skill-dir>/scripts/atlas.mjs pin `), 'the refresh written to the state folder');
    assert.ok(stale.find((i) => i.skills[0] === 'delta').message.endsWith(` --no-user --no-plugins <state>/translations/delta/SKILL.zh-CN.md, or, where the skill's folder is the user's own to edit, bring ${path.join(CLAUDE, 'delta', 'SKILL.zh-CN.md')} in line with its source there and pin it instead`),
      'the refreshed file named after the options, and the installed one where the folder is the user\'s');
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
    assert.equal(en.description, 'A skill with a pipeline list.');
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

  test('an annotation\'s words under zh-CN stand under zh-CN over a SKILL.zh.md translation\'s, never a zh-TW one\'s (skill-atlas-6, skill-atlas-29)', () => {
    const project = path.join(tmp, 'hans-project');
    const dir = path.join(project, '.claude', 'skills', 'hans');
    writeSkill(dir, `${fm('hans', 'Hans in English.')}\n## One\nDo it.\n`);
    fs.writeFileSync(path.join(dir, 'SKILL.zh.md'), `${fm('hans', '\u7B80\u4F53\u3002')}\n## \u4E00\n\u505A\u3002\n`);
    fs.writeFileSync(path.join(dir, 'SKILL.zh-TW.md'), `${fm('hans', '\u7E41\u9AD4\u3002')}\n## \u4E00\n\u505A\u3002\n`);
    fs.mkdirSync(path.join(project, 'state'), { recursive: true });
    fs.writeFileSync(path.join(project, 'state', 'annotations.json'), JSON.stringify({ version: 1, skills: { hans: { translations: { 'zh-CN': { summary: '\u6982\u8981\u3002', steps: [{ title: '\u7B2C\u4E00\u6B65' }] } } } } }));
    const { translations } = skillOf(scanJson(project).atlas, 'hans');
    assert.deepEqual(Object.keys(translations), ['zh', 'zh-CN', 'zh-TW'], 'the words under exactly their own tag');
    assert.deepEqual([translations['zh-CN'].origin, translations['zh-CN'].description, translations['zh-CN'].summary], ['skill', '\u7B80\u4F53\u3002', '\u6982\u8981\u3002'], 'over the Simplified file\'s fields');
    assert.deepEqual(translations['zh-CN'].steps.map((st) => st.title), ['\u7B2C\u4E00\u6B65']);
    assert.deepEqual([translations.zh.summary, translations.zh.steps.map((st) => st.title)], [null, ['\u4E00']], 'the file\'s own entry unchanged');
    assert.equal(translations['zh-TW'].summary, null, 'never the Traditional one');
  });

  test('reports a calls cycle, naming every skill of its group (skill-atlas-5)', () => {
    const cycles = atlas.insights.filter((i) => i.kind === 'cycle');
    assert.equal(cycles.length, 2, 'one insight per group');
    const c = cycles.find((i) => i.skills.includes('ping'));
    assert.deepEqual([...c.skills].sort(), ['ping', 'pong']);
    assert.ok(skillOf(atlas, 'ping').issues.includes('cycle'));
    const tri = cycles.find((i) => i.skills.includes('tri-a'));
    assert.deepEqual(tri.skills, ['tri-a', 'tri-b', 'tri-c'], 'every skill of the group');
    assert.equal(tri.params.path.length, 2, 'the example is one shortest cycle');
    assert.ok(tri.params.path.every((id) => tri.skills.includes(id)));
    assert.match(tri.message, /^tri-a, tri-b, tri-c call one another in a cycle, for example (tri-\w) \u2192 tri-\w \u2192 \1$/);
    for (const id of tri.skills) assert.ok(skillOf(atlas, id).issues.includes('cycle'), `${id} carries the cycle issue`);
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
    const b = skillOf(atlas, 'broken-name');
    assert.ok(b && path.basename(b.dir) === 'broken', 'the name that parsed stands beside a field in error');
    assert.equal(b.description, '', 'the field in error left out');
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
  assert.match(r.stdout, /; \d+ calls, \d+ mentions, 3 unresolved \(3 calls and 0 mentions\)\.\n/);
  assert.match(r.stdout, /\nUnresolved links \(3: 3 calls and 0 mentions\):\n {2}orchestrator step 3 calls missing-thing/);
  assert.match(r.stdout, /\nNames with different versions \(1\):\n {2}dup: 3 versions, in \S+ \[dup\], \S+ \[dup@project-codex\], \S+ \[dup@project-codex@team\.dup\]; an agent reading more than one of these folders picks one by its own rules\n\n/);
  assert.match(r.stdout, /\nCycles \(2\):\n( {2}.*\n)* {2}ping -> pong -> ping\n/);
  assert.match(r.stdout, /\nCycles \(2\):\n( {2}.*\n)* {2}tri-a, tri-b, tri-c: for example (tri-\w) -> tri-\w -> \2\n/);
  assert.match(r.stdout, /\n {2}no steps \(\d+\): .*plain/);
  assert.match(r.stdout, /\n {2}sections only \(\d+\): .*delta/);
  assert.match(r.stdout, /\nInstalled in several folders \(\d+\):\n(.*\n)* {2}same \(also installed in 1 other folder\): project-claude, project-gemini/);
  // The insights counted by level as the page counts them, and each not listed above under its level.
  const atlas = JSON.parse(run(['scan', '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(P, 'state')]).stdout);
  const problems = atlas.insights.filter((i) => i.level === 'problem').length;
  assert.ok(problems && problems < atlas.insights.length, 'the fixture has problems and notes');
  assert.match(r.stdout, new RegExp(`\\nInsights: ${problems} problems to act on, ${atlas.insights.length - problems} notes\\.\\n`));
  assert.match(r.stdout, /\nOther problems \(\d+\):\n(.*\n)* {2}edited-translation: /);
  assert.match(r.stdout, /\nOther notes \(\d+\):\n(.*\n)* {2}oversized: /);
  const section = (heading) => { const at = r.stdout.indexOf(`\n${heading} (`); return r.stdout.slice(at, r.stdout.indexOf('\n\n', at + 1) >>> 0); };
  assert.doesNotMatch(section('Other problems'), /^ {2}(oversized|missing-description|name-mismatch|no-steps|duplicate-name|cycle|unresolved-link): /m);
  assert.doesNotMatch(section('Other notes'), /^ {2}(invalid-frontmatter|stale-|edited-|translation-steps|no-steps|unresolved-link)/m);
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

test('links: each name steered per its place in the sentence (skill-atlas-3)', () => {
  const project = path.join(tmp, 'steer-project');
  const dir = path.join(project, '.claude', 'skills');
  for (const n of ['review', 'publish', 'lint-fix']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\nText.\n`);
  writeSkill(path.join(dir, 'instead'), `${fm('instead', 'Steers with instead of.')}\nUse \`/review\` instead of \`/publish\` here.\n`);
  writeSkill(path.join(dir, 'rather'), `${fm('rather', 'Steers with rather than.')}\nRun \`/review\` rather than \`/publish\` now.\n`);
  writeSkill(path.join(dir, 'bare'), `${fm('bare', 'Steers with a bare instead.')}\nUse \`/review\` instead.\n`);
  writeSkill(path.join(dir, 'notfor'), `${fm('notfor', 'Writes notes.')}\nNot for linting (use the \`lint-fix\` skill) or reviews (run \`/review\`).\n`);
  writeSkill(path.join(dir, 'insteadfirst'), `${fm('insteadfirst', 'Steers away first.')}\nInstead of \`/publish\`, use \`/review\` here.\n`);
  writeSkill(path.join(dir, 'ratherfirst'), `${fm('ratherfirst', 'Steers away first.')}\nRather than run \`/publish\`, run \`/review\` now.\n`);
  writeSkill(path.join(dir, 'plainnot'), `${fm('plainnot', 'Steers with a plain not.')}\nUse \`/review\`, not \`/publish\`.\n`);
  writeSkill(path.join(dir, 'butnot'), `${fm('butnot', 'Steers with but not.')}\nRun \`/review\` but not \`/publish\`.\n`);
  writeSkill(path.join(dir, 'steerlist'), `${fm('steerlist', 'Steers away from a list.')}\nDo not use \`/review\`, \`/publish\` or \`/lint-fix\` here.\n`);
  const dollar = {
    butinstead: 'Do not run $publish but instead run $review.',
    butinsteaduse: 'Never run $publish but instead use $review.',
    commainstead: 'Do not run $publish, instead run $review.',
    andnot: 'Run $review and not $publish.',
    andnever: 'Run $review and never $publish.',
    commanever: 'Run $review, never $publish.',
    listandnot: 'Run $lint-fix, $review and not $publish.',
  };
  for (const [n, text] of Object.entries(dollar)) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n${text}\n`);
  const { atlas } = scanJson(project);
  const kinds = (from) => Object.fromEntries(atlas.edges.filter((e) => e.from === from).map((e) => [e.to, e.kind]));
  assert.deepEqual(kinds('instead'), { review: 'calls', publish: 'mentions' }, 'the name after "instead of" is steered away, the one before it called');
  assert.deepEqual(kinds('rather'), { review: 'calls', publish: 'mentions' });
  assert.deepEqual(kinds('bare'), { review: 'mentions' }, 'a bare "instead" steers the whole sentence');
  assert.deepEqual(kinds('notfor'), { 'lint-fix': 'mentions', review: 'mentions' }, 'names after "Not for" are mentions');
  assert.deepEqual(kinds('insteadfirst'), { publish: 'mentions', review: 'calls' }, 'a clause opening with a verb of use ends "Instead of"');
  assert.deepEqual(kinds('ratherfirst'), { publish: 'mentions', review: 'calls' }, 'the verb right after "Rather than" is its own');
  assert.deepEqual(kinds('plainnot'), { review: 'calls', publish: 'mentions' }, '"X, not Y" steers away from Y');
  assert.deepEqual(kinds('butnot'), { review: 'calls', publish: 'mentions' });
  assert.deepEqual(kinds('steerlist'), { review: 'mentions', publish: 'mentions', 'lint-fix': 'mentions' }, 'a list after the steering words is steered whole');
  for (const n of ['butinstead', 'butinsteaduse', 'commainstead']) assert.deepEqual(kinds(n), { publish: 'mentions', review: 'calls' }, `${n}: a clause opening with "instead" and a verb of use ends the negation and steers nothing`);
  for (const n of ['andnot', 'andnever', 'commanever']) assert.deepEqual(kinds(n), { review: 'calls', publish: 'mentions' }, `${n}: the name after the negation steered away`);
  assert.deepEqual(kinds('listandnot'), { 'lint-fix': 'calls', review: 'calls', publish: 'mentions' }, 'a name joined by "and not" after a list steered away');
});

test('links: Skill(x) and "the `x` skill" naming no installed skill are unresolved, an agent command included (skill-atlas-3)', () => {
  const project = path.join(tmp, 'unresolved-project');
  writeSkill(path.join(project, '.claude', 'skills', 'lone'), `${fm('lone', 'Links to skills not installed.')}
Call Skill(review) next.
Then use the \`compact\` skill.
Type \`/help\` for the host's help, then type \`/clear\` to start over.
`);
  const { atlas } = scanJson(project);
  assert.deepEqual(atlas.unresolved.map((u) => u.name).sort(), ['compact', 'review'], 'only the backticked slash command of an agent command is exempt');
});

test('links: a backticked name before the word skill is unresolved whatever word precedes it (skill-atlas-3)', () => {
  const project = path.join(tmp, 'unresolved-any-word');
  writeSkill(path.join(project, '.claude', 'skills', 'lone'), `${fm('lone', 'Links to skills not installed.')}
Invoke \`gone-one\` skill first.
Then hand it to our \`gone-two\` skill.
`);
  const { atlas } = scanJson(project);
  assert.deepEqual(atlas.unresolved.map((u) => u.name).sort(), ['gone-one', 'gone-two']);
});

test('annotations: an entry recording another SKILL.md digest is not applied and is reported (skill-atlas-6, skill-atlas-5)', () => {
  const project = path.join(tmp, 'annotation-source');
  const dir = path.join(project, '.claude', 'skills');
  for (const n of ['same', 'other', 'plain', 'badsource']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n## Step 1: One\n\nDo it.\n\n## Step 2: Two\n\nDo more.\n`);
  const state = path.join(project, 'state');
  fs.mkdirSync(state, { recursive: true });
  const digest = sha(path.join(dir, 'same', 'SKILL.md'));
  fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills: {
    same: { source: { sha256: digest.toUpperCase() }, summary: 'Same text.' },
    other: { source: { sha256: '0'.repeat(64) }, summary: 'Written for another text.', addTags: [{ id: 'human.approval', step: 1 }], translations: { 'zh-CN': { summary: '\u53E6\u4E00\u4E2A\u3002' } } },
    plain: { summary: 'Records no digest.' },
    badsource: { source: 'nope', summary: 'Malformed source.' },
  } }));
  const { atlas, stderr } = scanJson(project, [], state);
  assert.equal(skillOf(atlas, 'same').digest, digest, 'each skill reports its SKILL.md digest');
  assert.equal(skillOf(atlas, 'same').summary, 'Same text.', 'an entry recording its skill\'s digest is applied');
  assert.equal(skillOf(atlas, 'plain').summary, 'Records no digest.', 'an entry recording none is applied');
  const other = skillOf(atlas, 'other');
  assert.equal(other.summary, null, 'an entry recording another digest is not applied');
  assert.ok(!other.tags.some((t) => t.id === 'human.approval'));
  assert.deepEqual(other.translations, {}, 'nor its words under a language');
  const stale = atlas.insights.filter((i) => i.kind === 'stale-annotation');
  assert.deepEqual(stale.map((i) => [i.skills, i.params]), [[['other'], {}]]);
  assert.match(stale[0].message, /another text of this skill/);
  assert.ok(other.issues.includes('stale-annotation'));
  assert.equal(skillOf(atlas, 'badsource').summary, null);
  assert.match(stderr, /"badsource".*"source" is not/);
});

test('copies: a link inside a folder is compared by its link text (skill-atlas-1)', (t) => {
  if (process.platform === 'win32') return t.skip('symbolic links need privileges on Windows');
  const project = path.join(tmp, 'copies-links');
  const at = (agent, name) => path.join(project, `.${agent}`, 'skills', name);
  const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  for (const agent of ['claude', 'gemini']) {
    for (const n of ['linkdir', 'linkfile', 'bothlinked', 'linktext']) {
      writeSkill(at(agent, n), `${fm(n, 'SKILL.md alike.')}\nText.\n`);
      put(at(agent, n), 'references/a.md', '# A\n');
    }
    // A linked reference folder in one copy only.
    if (agent === 'claude') fs.symlinkSync('references', path.join(at(agent, 'linkdir'), 'refs'));
    // A linked file in one, the same bytes as a file in the other.
    if (agent === 'claude') fs.symlinkSync('references/a.md', path.join(at(agent, 'linkfile'), 'b.md'));
    else put(at(agent, 'linkfile'), 'b.md', '# A\n');
    fs.symlinkSync('references', path.join(at(agent, 'bothlinked'), 'refs'));
    put(at(agent, 'linktext'), 'references/b.md', '# A\n');
    fs.symlinkSync(agent === 'claude' ? 'references/a.md' : 'references/b.md', path.join(at(agent, 'linktext'), 'c.md'));
  }
  const { atlas } = scanJson(project);
  const ids = (n) => atlas.skills.filter((s) => s.name === n).map((s) => s.id);
  assert.deepEqual(ids('linkdir'), ['linkdir', 'linkdir@project-gemini'], 'a linked folder in one copy only keeps them apart');
  assert.deepEqual(ids('linkfile'), ['linkfile', 'linkfile@project-gemini'], 'a link and a file of the same bytes differ');
  assert.deepEqual(ids('linktext'), ['linktext', 'linktext@project-gemini'], 'links of another text differ');
  assert.deepEqual(ids('bothlinked'), ['bothlinked'], 'the same link in both: one skill');
});

test('copies: one skill only where every file is the same, and a call from a copy\'s folder resolves to its sibling (skill-atlas-1, skill-atlas-3)', () => {
  const project = path.join(tmp, 'copies-project');
  const at = (agent, name) => path.join(project, `.${agent}`, 'skills', name);
  const put = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  for (const agent of ['claude', 'gemini']) {
    writeSkill(at(agent, 'twin'), `${fm('twin', 'Same everywhere.')}\nText.\n`);
    put(at(agent, 'twin'), 'references/a.md', '# A\n');
    put(at(agent, 'twin'), 'SKILL.zh-CN.md', `${fm('twin', '\u76F8\u540C\u3002')}\n\u6587\u3002\n`);
    writeSkill(at(agent, 'near'), `${fm('near', 'SKILL.md alike, a bundled file not.')}\nText.\n`);
    put(at(agent, 'near'), 'references/a.md', agent === 'claude' ? '# A\n' : '# A, edited\n');
    writeSkill(at(agent, 'worded'), `${fm('worded', 'SKILL.md alike, a translation not.')}\nText.\n`);
    put(at(agent, 'worded'), 'SKILL.zh-CN.md', `${fm('worded', agent === 'claude' ? '\u4E00\u3002' : '\u4E8C\u3002')}\n`);
    writeSkill(at(agent, 'extra'), `${fm('extra', 'SKILL.md alike, one more file in one.')}\nText.\n`);
    if (agent === 'gemini') put(at(agent, 'extra'), 'notes.txt', 'more\n');
    // Folders differing only in a dot-file or under node_modules are no copies either.
    writeSkill(at(agent, 'dotty'), `${fm('dotty', 'SKILL.md alike, a dot-file not.')}\nText.\n`);
    put(at(agent, 'dotty'), 'scripts/.env', agent === 'claude' ? 'A=1\n' : 'A=2\n');
    writeSkill(at(agent, 'nm'), `${fm('nm', 'SKILL.md alike, a file under node_modules not.')}\nText.\n`);
    put(at(agent, 'nm'), 'node_modules/x/index.js', agent === 'claude' ? 'one\n' : 'two\n');
    writeSkill(at(agent, 'dotsame'), `${fm('dotsame', 'Every file alike, dot-files included.')}\nText.\n`);
    put(at(agent, 'dotsame'), '.config.json', '{}\n');
  }
  // `helper` differs between .claude and .agents; the .agents one has an identical copy in .gemini, beside `caller`.
  writeSkill(at('claude', 'helper'), `${fm('helper', 'Helper one.')}\nOne.\n`);
  for (const agent of ['agents', 'gemini']) writeSkill(at(agent, 'helper'), `${fm('helper', 'Helper two.')}\nTwo.\n`);
  writeSkill(at('gemini', 'caller'), `${fm('caller', 'Calls its sibling.')}\nInvoke the \`helper\` skill.\n`);
  const { atlas } = scanJson(project);
  const named = (n) => atlas.skills.filter((s) => s.name === n);
  assert.equal(named('twin').length, 1, 'every file the same: one skill');
  assert.deepEqual(named('twin')[0].copies, [{ root: 'project-gemini', dir: at('gemini', 'twin') }]);
  assert.equal(named('dotsame').length, 1, 'alike dot-files included: one skill');
  for (const n of ['near', 'worded', 'extra', 'dotty', 'nm']) {
    assert.deepEqual(named(n).map((s) => s.id), [n, `${n}@project-gemini`], `${n}: a differing file keeps the folders apart`);
    assert.deepEqual(named(n)[0].sameName, [`${n}@project-gemini`], `${n}: each names the other`);
    assert.ok(atlas.insights.some((i) => i.kind === 'duplicate-name' && i.params.name === n));
  }
  assert.deepEqual(named('helper').map((s) => [s.id, s.copies.map((c) => c.root)]), [['helper', []], ['helper@project-agents', ['project-gemini']]]);
  assert.deepEqual(edge(atlas, 'caller', 'helper@project-agents').map((e) => e.kind), ['calls'], 'the call resolves to the copy in its own folder');
  assert.equal(edge(atlas, 'caller', 'helper').length, 0);
});

test('differing skills of one name are one fact: a note naming every folder, each skill naming the others, no agent in it, and a plugin\'s name its own (skill-atlas-33, skill-atlas-24, skill-atlas-5, skill-atlas-7)', () => {
  const home = path.join(tmp, 'same-name-home');
  const config = path.join(home, '.claude');
  const project = path.join(tmp, 'same-name-project');
  fs.mkdirSync(project, { recursive: true });
  const put = (dir, name, text, body = text) => writeSkill(path.join(dir, name), `${fm(name, text)}\n${body}\n`);
  put(path.join(home, '.agents', 'skills'), 'review', 'Shared.');
  put(path.join(config, 'skills'), 'review', 'Personal.');
  // Two plugins' skills of one bare name, and a plugin's beside a plain skill of it, are of different names.
  const plugins = {};
  for (const kit of ['kit-a', 'kit-b']) {
    const dir = path.join(config, 'plugins', 'cache', kit);
    put(path.join(dir, 'skills'), 'polish', `${kit}.`);
    plugins[`${kit}@m`] = [{ scope: 'user', installPath: dir }];
  }
  put(path.join(config, 'plugins', 'cache', 'kit-a', 'skills'), 'review', 'Plugin.');
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
  // An unresolved name in a sentence steering away from it, and one called.
  put(path.join(project, '.claude', 'skills'), 'asker', 'Asks.', 'Do not run the `/gone` command.\n\nInvoke the `away` skill.');
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
  const args = ['--cwd', project, '--state', path.join(tmp, 'same-name-state')];
  const r = run(['scan', ...args], { env });
  assert.equal(r.status, 0, r.stderr);
  const atlas = JSON.parse(r.stdout);
  const plain = atlas.skills.filter((s) => s.name === 'review' && !s.plugin);
  assert.deepEqual(plain.map((s) => s.root).sort(), ['user-agents', 'user-claude']);
  for (const s of plain) assert.deepEqual(s.sameName, plain.filter((o) => o !== s).map((o) => o.id), `${s.id} names the other version`);
  assert.deepEqual(atlas.skills.find((s) => s.plugin === 'kit-a' && s.name === 'review').sameName, [], "a plugin's skill shares no name outside its plugin");
  for (const s of atlas.skills.filter((x) => x.name === 'polish')) assert.deepEqual(s.sameName, [], 'two plugins\' skills are of two names');
  const dups = atlas.insights.filter((i) => i.kind === 'duplicate-name');
  assert.equal(dups.length, 1, 'one insight per name, none for the plugins');
  const [dup] = dups;
  assert.equal(dup.level, 'note', 'a fact, not a verdict');
  const folders = plain.map((s) => s.dir);
  assert.deepEqual(dup.params, { name: 'review', copies: plain.map((s) => ({ id: s.id, path: s.dir, root: s.root, rootLabel: atlas.roots.find((x) => x.id === s.root).label })) });
  assert.equal(dup.message, `"review" has 2 different versions in 2 folders: ${folders.join(', ')}. An agent that reads more than one of these folders picks one by its own rules.`);
  // No agent in what the atlas says of the name, beyond the folders' own paths and labels.
  const words = folders.reduce((m, f) => m.split(f).join('<folder>'), dup.message);
  assert.doesNotMatch(words, /claude|codex|cursor|gemini|agents\b|wins|override|conflict/i);
  assert.ok(!('agentNames' in atlas), 'no agent names');
  // An unresolved call is a problem; a name only mentioned runs nothing, a note (skill-atlas-5).
  assert.deepEqual(atlas.insights.filter((i) => i.kind === 'unresolved-link').map((i) => [i.params.name, i.params.kind, i.level, i.message.split('"')[0]]).sort(), [['away', 'calls', 'problem', 'asker calls '], ['gone', 'mentions', 'note', 'asker mentions ']]);
  const summary = run(['scan', '--summary', ...args], { env });
  assert.equal(summary.status, 0, summary.stderr);
  const listed = plain.map((s) => `${s.dir} [${s.id}]`).join(', ');
  assert.ok(summary.stdout.includes(`\nNames with different versions (1):\n  review: 2 versions, in ${listed}; an agent reading more than one of these folders picks one by its own rules\n`), summary.stdout);
});

test('a plugin\'s skill folder linked to a plain skill, or its skills folder linked to a scanned folder, is a copy of that skill going by `<plugin>:<name>` there (skill-atlas-33, skill-atlas-1, skill-atlas-3)', () => {
  for (const linked of ['skill', 'skills']) {
    const home = path.join(tmp, `kit-link-${linked}-home`);
    const config = path.join(home, '.claude');
    const project = path.join(tmp, `kit-link-${linked}-project`);
    const put = (dir, name, text, body = text) => writeSkill(path.join(dir, name), `${fm(name, text)}\n${body}\n`);
    put(path.join(config, 'skills'), 'review', 'Personal.');
    put(path.join(project, '.claude', 'skills'), 'review', 'Project.');
    put(path.join(home, '.agents', 'skills'), 'caller', 'Calls.', 'Invoke the `kit:review` skill.');
    const kit = path.join(config, 'plugins', 'cache', 'kit');
    fs.mkdirSync(path.join(kit, linked === 'skill' ? 'skills' : ''), { recursive: true });
    if (linked === 'skill') fs.symlinkSync(path.join(config, 'skills', 'review'), path.join(kit, 'skills', 'review'), 'junction');
    else fs.symlinkSync(path.join(config, 'skills'), path.join(kit, 'skills'), 'junction');
    fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'kit@m': [{ scope: 'user', installPath: kit }] } }));
    const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
    const scan = (...extra) => {
      const r = run(['scan', '--cwd', project, '--state', path.join(tmp, `kit-link-${linked}-state`), ...extra], { env });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };
    const atlas = scan();
    const ids = (a) => a.skills.map((s) => s.id).sort();
    assert.deepEqual(ids(atlas), ids(scan('--no-plugins')), `${linked}: the ids the skills have without the plugin`);
    const personal = atlas.skills.find((s) => s.root === 'user-claude' && s.name === 'review');
    assert.deepEqual(personal.copies, [{ root: 'plugin-kit.m', dir: path.join(kit, 'skills', 'review') }], `${linked}: the plugin's folder is a copy of the plain skill`);
    assert.deepEqual(edge(atlas, 'caller', personal.id).map((e) => e.kind), ['calls'], `${linked}: kit:review reaches the skill`);
    const dups = atlas.insights.filter((i) => i.kind === 'duplicate-name');
    assert.deepEqual(dups.map((i) => [i.params.name, i.params.copies.map((c) => c.path).sort()]),
      [['review', [path.join(config, 'skills', 'review'), path.join(project, '.claude', 'skills', 'review')].sort()]], `${linked}: one note for "review", the plugin's folder not in it`);
  }
});

test('a folder two roots name by one path is one place, and one linked by one path one copy (skill-atlas-1, skill-atlas-5, skill-atlas-7)', () => {
  const home = path.join(tmp, 'one-place-home');
  const put = (dir, text) => writeSkill(path.join(dir, 'review'), `${fm('review', text)}\n${text}\n`);
  put(path.join(home, '.claude', 'skills'), 'A.');
  put(path.join(home, '.agents', 'skills'), 'B.');
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
  // --cwd the home folder: its project and home folder rows name the same paths.
  const args = ['--cwd', home, '--no-plugins', '--state', path.join(tmp, 'one-place-state')];
  const atlas = JSON.parse(run(['scan', ...args], { env }).stdout);
  for (const s of atlas.skills) assert.deepEqual(s.copies, [], `${s.id} lists its own folder once`);
  const [dup] = atlas.insights.filter((i) => i.kind === 'duplicate-name');
  assert.equal(dup.params.copies.length, 2, 'each version in its one folder');
  assert.match(run(['scan', '--summary', ...args], { env }).stdout, /^Skill Atlas: 2 skills in 2 folders;/);
  // .agents/skills linked to .claude/skills: both rows naming the link add one copy.
  fs.rmSync(path.join(home, '.agents', 'skills'), { recursive: true });
  fs.symlinkSync(path.join(home, '.claude', 'skills'), path.join(home, '.agents', 'skills'), 'junction');
  const linked = JSON.parse(run(['scan', ...args], { env }).stdout);
  assert.deepEqual(linked.skills.map((s) => s.copies.map((c) => c.dir)), [[path.join(home, '.agents', 'skills', 'review')]]);
});

test('removing a link by a name another skill has as its id removes only the link the name reaches (skill-atlas-6)', () => {
  const home = path.join(tmp, 'two-kits-home');
  const config = path.join(home, '.claude');
  const project = path.join(tmp, 'two-kits-project');
  fs.mkdirSync(project, { recursive: true });
  const put = (dir, name, text, body = text) => writeSkill(path.join(dir, name), `${fm(name, text)}\n${body}\n`);
  const plugins = {};
  for (const kit of ['alpha', 'beta']) {
    const dir = path.join(config, 'plugins', 'cache', kit);
    put(path.join(dir, 'skills'), 'review', `${kit}.`);
    plugins[`${kit}@m`] = [{ scope: 'user', installPath: dir }];
  }
  put(path.join(config, 'plugins', 'cache', 'beta', 'skills'), 'caller', 'Calls.', 'Invoke the `review` skill.\n\nInvoke the `alpha:review` skill.');
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
  const state = path.join(tmp, 'two-kits-state');
  fs.mkdirSync(state, { recursive: true });
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
  const scan = () => JSON.parse(run(['scan', '--cwd', project, '--state', state], { env }).stdout);
  const atlas = scan();
  const alpha = atlas.skills.find((s) => s.plugin === 'alpha').id;
  const beta = atlas.skills.find((s) => s.plugin === 'beta' && s.name === 'review').id;
  assert.equal(alpha, 'review', "alpha's skill has the name as its id");
  assert.deepEqual(atlas.edges.filter((e) => e.from === 'caller').map((e) => e.to), [beta, alpha], 'the sibling by its name, alpha\'s by its plugin\'s');
  fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills: { caller: { removeCalls: [{ to: 'review' }] } } }));
  assert.deepEqual(scan().edges.filter((e) => e.from === 'caller').map((e) => e.to), [alpha], 'only the sibling\'s link removed');
});

test('a link to a name several skills hold reaches the caller\'s sibling, else the first in the atlas\'s order, and `<plugin>:<name>` that plugin\'s (skill-atlas-3)', () => {
  const home = path.join(tmp, 'sibling-home');
  const config = path.join(home, '.claude');
  const project = path.join(tmp, 'sibling-project');
  fs.mkdirSync(project, { recursive: true });
  const put = (dir, name, text, body = text) => writeSkill(path.join(dir, name), `${fm(name, text)}\n${body}\n`);
  put(path.join(project, '.claude', 'skills'), 'helper', 'Project.');
  put(path.join(config, 'skills'), 'helper', 'Personal.');
  put(path.join(config, 'skills'), 'home-caller', 'Calls.', 'Invoke the `helper` skill.');
  put(path.join(project, '.claude', 'skills'), 'project-caller', 'Calls.', 'Invoke the `helper` skill.');
  put(path.join(home, '.agents', 'skills'), 'shared-caller', 'Calls.', 'Invoke the `helper` skill.\n\nInvoke the `kit:helper` skill.');
  const kit = path.join(config, 'plugins', 'cache', 'kit');
  put(path.join(kit, 'skills'), 'helper', 'Plugin.');
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'kit@m': [{ scope: 'user', installPath: kit }] } }));
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
  const r = run(['scan', '--cwd', project, '--state', path.join(tmp, 'sibling-state')], { env });
  assert.equal(r.status, 0, r.stderr);
  const atlas = JSON.parse(r.stdout);
  const helper = (root) => atlas.skills.find((s) => s.name === 'helper' && s.root === root).id;
  const to = (from) => atlas.edges.filter((e) => e.from === from).map((e) => e.to);
  assert.deepEqual(to('home-caller'), [helper('user-claude')], 'the sibling in the home folder');
  assert.deepEqual(to('project-caller'), [helper('project-claude')], 'the sibling in the project folder');
  const first = atlas.skills.find((s) => s.name === 'helper').id;
  const plugin = atlas.skills.find((s) => s.name === 'helper' && s.plugin === 'kit').id;
  assert.deepEqual(to('shared-caller'), [first, plugin], 'no sibling: the first in the atlas\'s order; `kit:helper` the plugin\'s');
  // An annotation naming a skill reaches the one a scanned link from the same skill reaches; an id names its own.
  const state = path.join(tmp, 'sibling-annotated');
  fs.mkdirSync(state, { recursive: true });
  const annotate = (skills) => fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills }));
  const rescan = () => JSON.parse(run(['scan', '--cwd', project, '--state', state], { env }).stdout);
  const sibling = helper('user-claude');
  assert.notEqual(sibling, first, 'the home caller\'s sibling is not the first of the name');
  annotate({ 'home-caller': { removeCalls: [{ to: 'helper' }] } });
  assert.deepEqual(rescan().edges.filter((e) => e.from === 'home-caller'), [], 'removeCalls by name drops the scanned link to the sibling');
  annotate({ 'shared-caller': { removeCalls: [{ to: 'helper' }, { to: 'kit:helper' }] }, 'home-caller': { addCalls: [{ to: 'helper' }] }, 'project-caller': { addCalls: [{ to: sibling }] } });
  const after = rescan();
  assert.deepEqual(after.edges.filter((e) => e.from === 'home-caller').map((e) => [e.to, e.source]), [[sibling, 'annotation']], 'addCalls by name adds the sibling');
  assert.deepEqual(after.edges.filter((e) => e.from === 'project-caller').map((e) => e.to).sort(), [helper('project-claude'), sibling].sort(), 'addCalls by id adds the skill named');
  assert.deepEqual(after.edges.filter((e) => e.from === 'shared-caller'), [], 'a plugin\'s name is removed alike');
});

test('steps: the list opening the body after quoted notes, comments and a full-width colon (skill-atlas-2)', () => {
  const project = path.join(tmp, 'quoted-project');
  const dir = path.join(project, '.claude', 'skills');
  writeSkill(path.join(dir, 'quoted'), `${fm('quoted', 'Opens with a note.')}
# Quoted

> This file is a translation for readers; agents load SKILL.md.
> It changes nothing.

<!--
A comment over two lines.
-->

1. Do the first thing.
2. Do the second thing.
`);
  writeSkill(path.join(dir, 'zhcolon'), `${fm('zhcolon', '\u4E2D\u6587\u5192\u53F7\u3002')}
> \u4EE3\u7406\u4F7F\u7528 SKILL.md\u3002

\u6309\u4EE5\u4E0B\u6B65\u9AA4\uFF1A

1. \u7B2C\u4E00\u4EF6\u4E8B\u3002
2. \u7B2C\u4E8C\u4EF6\u4E8B\u3002
`);
  const { atlas } = scanJson(project);
  assert.deepEqual(skillOf(atlas, 'quoted').steps.map((st) => st.title), ['Do the first thing', 'Do the second thing']);
  assert.deepEqual(skillOf(atlas, 'zhcolon').steps.map((st) => st.title), ['\u7B2C\u4E00\u4EF6\u4E8B', '\u7B2C\u4E8C\u4EF6\u4E8B']);
});

test('--agent keeps .agents/skills for an agent that loads it and Codex\'s bundled skills, and leaves out the project\'s skills (skill-atlas-1)', () => {
  const home = path.join(tmp, 'agent-home');
  const project = path.join(tmp, 'agent-project');
  writeSkill(path.join(home, '.codex', 'skills', '.system', 'sys-skill'), `${fm('sys-skill', 'Ships with Codex.')}\nText.\n`);
  writeSkill(path.join(home, '.codex', 'skills', 'codex-user'), `${fm('codex-user', 'Codex, user.')}\nText.\n`);
  writeSkill(path.join(home, '.claude', 'skills', 'claude-user'), `${fm('claude-user', 'Claude, user.')}\nText.\n`);
  writeSkill(path.join(project, '.agents', 'skills', 'shared-one'), `${fm('shared-one', 'Shared.')}\nText.\n`);
  writeSkill(path.join(project, '.claude', 'skills', 'claude-project'), `${fm('claude-project', 'Claude, project.')}\nText.\n`);
  writeSkill(path.join(project, 'skills', 'source-one'), `${fm('source-one', 'A source.')}\nText.\n`);
  writeSkill(path.join(project, '.codex', 'skills', '.system', 'not-system'), `${fm('not-system', 'Codex ships nothing in a project.')}\nText.\n`);
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
  const scanWith = (...extra) => {
    const r = run(['scan', '--cwd', project, '--no-plugins', '--state', path.join(project, 'state'), ...extra], { env });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const names = (atlas) => atlas.skills.map((s) => s.name).sort();
  const all = scanWith();
  assert.deepEqual(names(all), ['claude-project', 'claude-user', 'codex-user', 'shared-one', 'source-one', 'sys-skill']);
  assert.equal(skillOf(all, 'sys-skill').root, 'user-codex-system');
  assert.deepEqual(names(scanWith('--agent', 'codex')), ['codex-user', 'shared-one', 'sys-skill'], 'Codex loads .agents/skills and its bundled skills, no agent the project\'s skills');
  assert.deepEqual(names(scanWith('--agent', 'gemini-cli')), ['shared-one']);
  assert.deepEqual(names(scanWith('--agent', 'universal')), ['shared-one'], '--agent universal keeps .agents/skills, not the project\'s skills');
  assert.deepEqual(names(scanWith('--agent', 'claude-code')), ['claude-project', 'claude-user'], 'Claude Code does not load .agents/skills');
  assert.deepEqual(names(scanWith('--agent', 'copilot', '--root', path.join(project, 'skills'))), ['shared-one', 'source-one'], '--root is kept under --agent');
  const moved = path.join(tmp, 'agent-codex-home');
  writeSkill(path.join(moved, 'skills', '.system', 'moved-sys'), `${fm('moved-sys', 'Under CODEX_HOME.')}\nText.\n`);
  const r = run(['scan', '--cwd', project, '--no-plugins', '--agent', 'codex', '--state', path.join(project, 'state')], { env: { ...env, CODEX_HOME: moved } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(names(JSON.parse(r.stdout)), ['moved-sys', 'shared-one'], '.system under CODEX_HOME');
});

test('the home folder\'s .config/agents, .config/goose, .copilot and .codeium/windsurf skills, each kept by its agents (skill-atlas-1)', () => {
  const home = path.join(tmp, 'more-roots-home');
  const project = path.join(tmp, 'more-roots-project');
  const rows = { '.config/agents/skills': 'u-one', '.config/goose/skills': 'goose-one', '.copilot/skills': 'copilot-one', '.codeium/windsurf/skills': 'windsurf-one' };
  for (const [dir, name] of Object.entries(rows)) {
    writeSkill(path.join(home, ...dir.split('/'), name), `${fm(name, `${name}.`)}\nText.\n`);
    writeSkill(path.join(project, ...dir.split('/'), `${name}-in-project`), `${fm(`${name}-in-project`, 'A home-only folder in a project.')}\nText.\n`);
  }
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', XDG_CONFIG_HOME: '' };
  const scanWith = (...extra) => {
    const r = run(['scan', '--cwd', project, '--no-plugins', '--state', path.join(project, 'state'), ...extra], { env });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const names = (atlas) => atlas.skills.map((s) => s.name).sort();
  const all = scanWith();
  assert.deepEqual(names(all), ['copilot-one', 'goose-one', 'u-one', 'windsurf-one'], 'found in the home folder alone');
  assert.equal(skillOf(all, 'u-one').root, 'user-agents-config');
  assert.deepEqual(names(scanWith('--agent', 'goose')), ['goose-one', 'u-one'], '.config/agents/skills loaded as .agents/skills is');
  assert.deepEqual(names(scanWith('--agent', 'copilot')), ['copilot-one', 'u-one']);
  assert.deepEqual(names(scanWith('--agent', 'windsurf')), ['u-one', 'windsurf-one']);
  assert.deepEqual(names(scanWith('--agent', 'claude-code')), [], 'Claude Code loads none of them');
  const xdg = path.join(tmp, 'more-roots-xdg');
  for (const [dir, name] of [['opencode/skills', 'xdg-opencode'], ['agents/skills', 'xdg-agents'], ['goose/skills', 'xdg-goose']]) {
    writeSkill(path.join(xdg, ...dir.split('/'), name), `${fm(name, `${name}.`)}\nText.\n`);
  }
  const r = run(['scan', '--cwd', project, '--no-plugins', '--state', path.join(project, 'state')], { env: { ...env, XDG_CONFIG_HOME: xdg } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(names(JSON.parse(r.stdout)), ['copilot-one', 'windsurf-one', 'xdg-agents', 'xdg-goose', 'xdg-opencode'], 'the home folder\'s .config is XDG_CONFIG_HOME where it is set');
});

test('the project is --cwd\'s folder and each folder above it up to its repository\'s root, the nearer first, each with its skills source (skill-atlas-1)', () => {
  const outer = path.join(tmp, 'up-outer');
  const repo = path.join(outer, 'repo');
  const cwd = path.join(repo, 'sub', 'deep');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  writeSkill(path.join(outer, '.agents', 'skills', 'above-repo'), `${fm('above-repo', 'Outside the repository.')}\nText.\n`);
  writeSkill(path.join(repo, '.agents', 'skills', 'at-root'), `${fm('at-root', 'At the root.')}\nText.\n`);
  writeSkill(path.join(repo, '.agents', 'skills', 'shared'), `${fm('shared', 'The root\'s.')}\nText.\n`);
  writeSkill(path.join(repo, 'skills', 'root-source'), `${fm('root-source', 'A source at the root.')}\nText.\n`);
  writeSkill(path.join(repo, 'sub', '.claude', 'skills', 'in-sub'), `${fm('in-sub', 'In sub.')}\nText.\n`);
  writeSkill(path.join(repo, 'sub', 'skills', 'sub-source'), `${fm('sub-source', 'A source in sub.')}\nText.\n`);
  writeSkill(path.join(cwd, '.agents', 'skills', 'near'), `${fm('near', 'Near.')}\nText.\n`);
  writeSkill(path.join(cwd, '.agents', 'skills', 'shared'), `${fm('shared', 'The near one\'s.')}\nText.\n`);
  const { atlas } = scanJson(cwd, [], path.join(tmp, 'up-state'));
  assert.deepEqual(atlas.skills.map((s) => s.id), ['near', 'shared@project-agents.sub.deep', 'in-sub', 'sub-source', 'at-root', 'shared', 'root-source'],
    'the nearer folder first, up to the root and not above it, each folder\'s skills source looked for, the root\'s skill keeping its name');
  const roots = Object.fromEntries(atlas.roots.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(roots), ['project-agents.sub.deep', 'project-claude.sub', 'project-source.sub', 'project-agents', 'project-source'], 'each id names its folder\'s place in the repository');
  assert.equal(roots['project-agents'].path, path.join(repo, '.agents', 'skills'));
  assert.deepEqual(['project-agents.sub.deep', 'project-claude.sub', 'project-agents'].map((id) => roots[id].label), ['Project (sub/deep) \u00B7 Universal', 'Project (sub) \u00B7 Claude Code', 'Project \u00B7 Universal'],
    'each folder told apart by its path in the repository');
  const alone = path.join(tmp, 'up-no-repo', 'inner');
  writeSkill(path.join(tmp, 'up-no-repo', '.agents', 'skills', 'parent-one'), `${fm('parent-one', 'Above, with no repository.')}\nText.\n`);
  writeSkill(path.join(alone, '.agents', 'skills', 'inner-one'), `${fm('inner-one', 'In --cwd.')}\nText.\n`);
  const noRepo = scanJson(alone, [], path.join(tmp, 'up-state')).atlas;
  assert.deepEqual(noRepo.skills.map((s) => s.id), ['inner-one'], 'with no repository, --cwd alone');
  assert.deepEqual(noRepo.roots.map((r) => r.id), ['project-agents'], 'with no repository, --cwd\'s rows keep the plain ids');
});

test('a repository scanned from its root and from a folder in it gives the folders both cover the same root and skill ids (skill-atlas-1)', () => {
  const repo = path.join(tmp, 'stable-ids');
  const sub = path.join(repo, 'packages', 'UI kit');
  // A segment other than lowercase words is its slug and its own digest.
  const kit = `packages.ui-kit_${crypto.createHash('sha256').update('UI kit').digest('hex').slice(0, 8)}`;
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  writeSkill(path.join(repo, '.claude', 'skills', 'review'), `${fm('review', 'The Claude one.')}\nText.\n`);
  writeSkill(path.join(repo, '.agents', 'skills', 'review'), `${fm('review', 'The shared one.')}\nText.\n`);
  writeSkill(path.join(repo, '.agents', 'skills', 'lint'), `${fm('lint', 'Lints.')}\nText.\n`);
  writeSkill(path.join(sub, '.agents', 'skills', 'ui-only'), `${fm('ui-only', 'In the package.')}\nText.\n`);
  writeSkill(path.join(sub, '\u65E5\u672C', '.agents', 'skills', 'deeper'), `${fm('deeper', 'Below a folder of other letters.')}\nText.\n`);
  // A name the root and folders below it each hold, differing, and one a
  // folder below holds both as a copy of the root's and as another text.
  writeSkill(path.join(repo, 'skills', 'alpha'), `${fm('alpha', 'The root\'s.')}\nText.\n`);
  writeSkill(path.join(sub, 'skills', 'alpha'), `${fm('alpha', 'The package\'s.')}\nText.\n`);
  writeSkill(path.join(sub, '\u65E5\u672C', '.agents', 'skills', 'alpha'), `${fm('alpha', 'The deeper one\'s.')}\nText.\n`);
  writeSkill(path.join(repo, '.agents', 'skills', 'beta'), `${fm('beta', 'The root\'s.')}\nText.\n`);
  writeSkill(path.join(sub, '.claude', 'skills', 'beta'), `${fm('beta', 'A copy below, preferred there.')}\nText.\n`);
  writeSkill(path.join(sub, '.agents', 'skills', 'beta'), `${fm('beta', 'The root\'s.')}\nText.\n`);
  const state = path.join(tmp, 'stable-ids-state');
  const atRoot = scanJson(repo, [], state).atlas;
  const fromSub = scanJson(sub, [], state).atlas;
  const fromDeeper = scanJson(path.join(sub, '\u65E5\u672C'), [], state).atlas;
  for (const atlas of [atRoot, fromSub, fromDeeper]) {
    assert.equal(skillOf(atlas, 'alpha')?.dir, path.join(repo, 'skills', 'alpha'), 'the root\'s skill keeps the plain name whatever a folder below holds');
    assert.equal(skillOf(atlas, 'beta')?.description, 'The root\'s.', 'a skill with a copy below keeps the root\'s name');
  }
  assert.equal(skillOf(fromSub, `alpha@project-source.${kit}`)?.dir, path.join(sub, 'skills', 'alpha'));
  assert.equal(skillOf(fromDeeper, `alpha@project-source.${kit}`)?.dir, path.join(sub, 'skills', 'alpha'), 'and the package\'s its id from a folder below it');
  assert.equal(skillOf(fromDeeper, `beta@project-claude.${kit}`)?.description, 'A copy below, preferred there.');
  assert.equal(skillOf(fromSub, `beta@project-claude.${kit}`)?.description, 'A copy below, preferred there.');
  assert.equal(fromSub.skills.findIndex((s) => s.id === `beta@project-claude.${kit}`) < fromSub.skills.findIndex((s) => s.id === 'beta'), true,
    'the skills still listed nearer first');
  // A working folder reached through a link inside the repository is named by its own place there.
  const linked = path.join(repo, 'ui-link');
  fs.symlinkSync(sub, linked, 'dir');
  const fromLink = scanJson(linked, [], state).atlas;
  assert.equal(fromLink.roots.find((r) => r.id.startsWith('project-agents.'))?.id, `project-agents.${kit}`, 'the same id through a link');
  assert.equal(skillOf(fromLink, 'alpha')?.dir, path.join(repo, 'skills', 'alpha'));
  fs.rmSync(linked);
  const byPath = (atlas) => new Map(atlas.roots.map((r) => [r.path, r.id]));
  for (const other of [fromSub, fromDeeper]) {
    for (const [dir, id] of byPath(atRoot)) assert.equal(byPath(other).get(dir), id, `${dir}: the same id from a folder below`);
  }
  assert.equal(byPath(fromDeeper).get(path.join(sub, '.agents', 'skills')), byPath(fromSub).get(path.join(sub, '.agents', 'skills')));
  assert.equal(byPath(fromSub).get(path.join(sub, '.agents', 'skills')), `project-agents.${kit}`);
  assert.equal(new Set(fromDeeper.roots.map((r) => r.id)).size, fromDeeper.roots.length, 'ids unique, a folder of other letters included');
  for (const atlas of [atRoot, fromSub, fromDeeper]) {
    assert.deepEqual(['review', 'review@project-agents', 'lint'].map((id) => skillOf(atlas, id)?.dir),
      [path.join(repo, '.claude', 'skills', 'review'), path.join(repo, '.agents', 'skills', 'review'), path.join(repo, '.agents', 'skills', 'lint')], 'the same skill ids');
  }
  assert.deepEqual(fromSub.roots.map((r) => r.id).slice(0, 1), [`project-claude.${kit}`], 'the nearer folder first');
});

test('a working folder reached through a link walks up from its real place, finding the same folders and ids as its real path (skill-atlas-1)', () => {
  const config = path.join(tmp, 'link-cwd-config');
  const repo = path.join(tmp, 'link-cwd');
  const app = path.join(repo, 'packages', 'app');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  writeSkill(path.join(app, '.agents', 'skills', 'in-app'), `${fm('in-app', 'In the app.')}\nText.\n`);
  writeSkill(path.join(repo, 'packages', '.agents', 'skills', 'in-packages'), `${fm('in-packages', 'In packages.')}\nText.\n`);
  writeSkill(path.join(repo, '.agents', 'skills', 'at-root'), `${fm('at-root', 'At the root.')}\nText.\n`);
  // A plugin installed for the repository, disabled by the settings of packages/ alone.
  const plugin = path.join(config, 'plugins', 'cache', 'm', 'tool');
  writeSkill(path.join(plugin, 'skills', 'tool-skill'), `${fm('tool-skill', 'A plugin skill.')}\nText.\n`);
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'tool@m': [{ scope: 'project', installPath: plugin, projectPath: repo }] } }));
  fs.mkdirSync(path.join(repo, 'packages', '.claude'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages', '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'tool@m': false } }));
  const ui = path.join(repo, 'ui');
  fs.symlinkSync(app, ui, 'junction');
  const scan = (cwd) => {
    const r = run(['scan', '--cwd', cwd, '--no-user', '--state', path.join(tmp, 'link-cwd-state')], { env: { CLAUDE_CONFIG_DIR: config } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  for (const [cwd, atlas] of [[app, scan(app)], [ui, scan(ui)]]) {
    assert.deepEqual(atlas.skills.map((s) => s.id), ['in-app', 'in-packages', 'at-root'], `${cwd}: the folders above its real place, packages/ included`);
    assert.deepEqual(atlas.roots.map((r) => r.id), ['project-agents.packages.app', 'project-agents.packages', 'project-agents'], `${cwd}: the same ids`);
    assert.ok(!atlas.skills.some((s) => s.plugin), `${cwd}: the settings of packages/ applied`);
  }
  assert.equal(scan(ui).roots[0].path, path.join(ui, '.agents', 'skills'), 'the working folder spelled as given');
});

test('an id is a function of its own folder: distinct folders never share one, and no other folder, alias, install or --root order changes it (skill-atlas-1)', () => {
  const repo = path.join(tmp, 'distinct-ids');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  const dash = path.join(repo, 'packages', 'ui-kit');
  const nested = path.join(repo, 'packages', 'ui', 'kit');
  const state = path.join(tmp, 'distinct-ids-state');
  const idOf = (atlas, dir) => atlas.roots.find((r) => r.path === path.join(dir, '.agents', 'skills'))?.id;
  // The reviewer's case: a skill below ui-kit, qualified by its root's id, and
  // saved in a pipeline, keeps its id when an empty packages/ui/kit appears.
  writeSkill(path.join(repo, '.agents', 'skills', 'kit-tool'), `${fm('kit-tool', 'At the root.')}\nText.\n`);
  writeSkill(path.join(dash, '.agents', 'skills', 'kit-tool'), `${fm('kit-tool', 'In ui-kit.')}\nText.\n`);
  const before = scanJson(dash, [], state).atlas;
  fs.mkdirSync(nested, { recursive: true });
  const after = scanJson(dash, [], state).atlas;
  assert.equal(idOf(before, dash), 'project-agents.packages.ui-kit');
  assert.equal(idOf(after, dash), idOf(before, dash), 'an empty packages/ui/kit beside packages/ui-kit renames nothing');
  assert.deepEqual(after.skills.filter((s) => s.name === 'kit-tool').map((s) => s.id).sort(), ['kit-tool', 'kit-tool@project-agents.packages.ui-kit']);
  for (const dir of [dash, nested]) writeSkill(path.join(dir, '.agents', 'skills', `in-${path.basename(path.dirname(dir))}`), `${fm(`in-${path.basename(path.dirname(dir))}`, 'Here.')}\nText.\n`);
  fs.mkdirSync(path.join(dash, 'deep'), { recursive: true });
  writeSkill(path.join(repo, 'packages', 'ui', '.agents', 'skills', 'in-ui'), `${fm('in-ui', 'In ui.')}\nText.\n`);
  const fromDash = scanJson(dash, [], state).atlas;
  const fromNested = scanJson(nested, [], state).atlas;
  const dashId = idOf(fromDash, dash);
  const nestedId = idOf(fromNested, nested);
  assert.deepEqual([dashId, nestedId], ['project-agents.packages.ui-kit', 'project-agents.packages.ui.kit'], 'each segment its own word, so two folders never share an id');
  assert.equal(idOf(scanJson(path.join(dash, 'deep'), [], state).atlas, dash), dashId, 'the same id from a folder below');
  assert.equal(idOf(fromNested, path.join(repo, 'packages', 'ui')), 'project-agents.packages.ui');
  // One folder's whole skills folder linked to its parent's: the parent's ids stand.
  const parent = path.join(tmp, 'alias-ids');
  const child = path.join(parent, 'packages', 'app');
  fs.mkdirSync(path.join(parent, '.git'), { recursive: true });
  writeSkill(path.join(parent, '.claude', 'skills', 'review'), `${fm('review', 'The Claude one.')}\nText.\n`);
  writeSkill(path.join(parent, '.agents', 'skills', 'review'), `${fm('review', 'The shared one.')}\nText.\n`);
  writeSkill(path.join(parent, '.agents', 'skills', 'lint'), `${fm('lint', 'Lints.')}\nText.\n`);
  fs.mkdirSync(path.join(child, '.agents'), { recursive: true });
  fs.symlinkSync(path.join(parent, '.agents', 'skills'), path.join(child, '.agents', 'skills'), 'junction');
  const ids = (atlas) => atlas.skills.map((s) => `${s.id} ${s.root}`).sort();
  const atRoot = scanJson(parent, [], state).atlas;
  const fromChild = scanJson(child, [], state).atlas;
  assert.deepEqual(ids(fromChild), ids(atRoot), 'the skill and root ids the parent\'s folder has without the alias');
  assert.deepEqual(ids(atRoot), ['lint project-agents', 'review project-claude', 'review@project-agents project-agents']);
  // Scanned once, as the folder it leads to, and listed with its skills as copies.
  assert.equal(fromChild.roots.find((r) => r.id === 'project-agents.packages.app')?.skillCount, 2, 'the alias listed with the skills it reaches');
  assert.deepEqual(skillOf(fromChild, 'lint').copies, [{ root: 'project-agents.packages.app', dir: path.join(child, '.agents', 'skills', 'lint') }], 'each skill there a copy at the alias');
  // A plugin keeps its id whichever other installs this project enables.
  const config = path.join(tmp, 'plugin-ids-config');
  const install = (n) => { const dir = path.join(config, 'plugins', 'cache', n, 'tool'); writeSkill(path.join(dir, 'skills', `tool-${n}`), `${fm(`tool-${n}`, 'A tool.')}\nText.\n`); return dir; };
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: {
    'tool@a': [{ scope: 'project', installPath: install('a'), projectPath: parent }],
    'tool@b': [{ scope: 'user', installPath: install('b') }],
  } }));
  const pluginIds = (cwd) => {
    const r = run(['scan', '--cwd', cwd, '--no-user', '--state', state], { env: { CLAUDE_CONFIG_DIR: config } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).roots.filter((x) => x.scope === 'plugin').map((x) => `${x.id} ${x.path}`);
  };
  const forParent = `project_${crypto.createHash('sha256').update(path.resolve(parent)).digest('hex').slice(0, 8)}`;
  assert.deepEqual(pluginIds(parent), [`plugin-tool.a.${forParent} ${path.join(install('a'), 'skills')}`, `plugin-tool.b ${path.join(install('b'), 'skills')}`],
    'the name and marketplace of its key, and a project install\'s scope and project');
  assert.deepEqual(pluginIds(repo), [`plugin-tool.b ${path.join(install('b'), 'skills')}`], 'the user\'s install keeps its id where the project\'s is not enabled');
  // --root folders, named by their own name and real path, in either order.
  const extraA = path.join(tmp, 'extra-ids', 'skills');
  const extraB = path.join(tmp, 'extra-ids', 'More Skills');
  for (const [dir, n] of [[extraA, 'extra-a'], [extraB, 'extra-b']]) writeSkill(path.join(dir, n), `${fm(n, 'Extra.')}\nText.\n`);
  const extraIds = (...dirs) => scanJson(parent, dirs.flatMap((d) => ['--root', d]), state).atlas.roots.filter((r) => r.scope === 'extra').map((r) => `${r.id} ${r.path}`).sort();
  const digest8 = (dir) => crypto.createHash('sha256').update(fs.realpathSync.native(dir)).digest('hex').slice(0, 8);
  const more = `more-skills_${crypto.createHash('sha256').update('More Skills').digest('hex').slice(0, 8)}`;
  assert.deepEqual(extraIds(extraA, extraB), [`extra-${more}_${digest8(extraB)} ${extraB}`, `extra-skills_${digest8(extraA)} ${extraA}`].sort());
  assert.deepEqual(extraIds(extraB, extraA), extraIds(extraA, extraB), 'the order of --root changes no id');
  assert.deepEqual(extraIds(extraB), [`extra-${more}_${digest8(extraB)} ${extraB}`], 'nor another --root left out');
  // However the folder is spelled: through a link, in another letter case, or twice.
  const linkA = path.join(tmp, 'extra-ids', 'link-a');
  fs.symlinkSync(extraA, linkA, 'junction');
  const idsOnly = (...dirs) => extraIds(...dirs).map((x) => x.split(' ')[0]);
  const idA = idsOnly(extraA);
  assert.deepEqual(idsOnly(linkA), idA, 'a --root reached through a link has the folder\'s id');
  const upper = path.join(tmp, 'extra-ids', 'SKILLS');
  if (fs.existsSync(upper)) assert.deepEqual(idsOnly(upper), idA, 'and spelled in another letter case');
  assert.deepEqual(idsOnly(extraA, linkA), idA, 'one folder named twice is one root');
  assert.deepEqual(idsOnly(linkA, extraA), idA);
  // Skills of one name in two --roots, and in two plugins: their ids follow no option's or key's order.
  const r1 = path.join(tmp, 'extra-ids', 'r1');
  const r2 = path.join(tmp, 'extra-ids', 'r2');
  writeSkill(path.join(r1, 'same'), `${fm('same', 'In r1.')}\nText.\n`);
  writeSkill(path.join(r2, 'same'), `${fm('same', 'In r2.')}\nText.\n`);
  const sameIds = (...dirs) => scanJson(parent, dirs.flatMap((d) => ['--root', d]), state).atlas.skills.filter((x) => x.name === 'same').map((x) => `${x.id} ${x.description}`).sort();
  assert.deepEqual(sameIds(r2, r1), sameIds(r1, r2), 'the order of --root gives no skill another id');
  const write = (keys) => fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: Object.fromEntries(keys.map((k) => [`kit@${k}`, [{ scope: 'user', installPath: (() => { const dir = path.join(config, 'plugins', 'cache', `kit-${k}`); writeSkill(path.join(dir, 'skills', 'kit'), `${fm('kit', `From ${k}.`)}\nText.\n`); return dir; })() }]])) }));
  const kitIds = () => {
    const r = run(['scan', '--cwd', repo, '--no-user', '--state', state], { env: { CLAUDE_CONFIG_DIR: config } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).skills.filter((x) => x.name === 'kit').map((x) => `${x.id} ${x.description}`).sort();
  };
  write(['m1', 'm2']);
  const kits = kitIds();
  assert.deepEqual(kits, ['kit From m1.', 'kit@plugin-kit.m2 From m2.'], 'the first by its plugin\'s id');
  write(['m2', 'm1']);
  assert.deepEqual(kitIds(), kits, 'whatever the order of installed_plugins.json');
});

test('a --root or CLAUDE_CONFIG_DIR naming a project folder below the repository\'s root changes no id (skill-atlas-1)', () => {
  const repo = path.join(tmp, 'alias-roots');
  const app = path.join(repo, 'packages', 'app');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  writeSkill(path.join(app, '.claude', 'skills', 'foo'), `${fm('foo', 'Foo.')}\nText.\n`);
  writeSkill(path.join(repo, '.claude', 'skills', 'bar'), `${fm('bar', 'Bar.')}\nText.\n`);
  const state = path.join(tmp, 'alias-roots-state');
  const ids = (args, env = {}) => {
    const r = run(['scan', '--cwd', app, '--no-plugins', '--state', state, ...args], { env: { HOME: path.join(tmp, 'alias-roots-home'), ...env } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).skills.map((s) => `${s.id} ${s.root}`).sort();
  };
  const plain = ids(['--no-user']);
  assert.deepEqual(plain, ['bar project-claude', 'foo project-claude.packages.app']);
  assert.deepEqual(ids(['--no-user', '--root', path.join(app, '.claude', 'skills')]), plain, 'the --root naming it changes no id');
  assert.deepEqual(ids([], { CLAUDE_CONFIG_DIR: path.join(app, '.claude') }), plain, 'CLAUDE_CONFIG_DIR naming it changes no id');
  assert.deepEqual(ids(['--no-user'], { CLAUDE_CONFIG_DIR: path.join(app, '.claude') }), plain);
  // A project's folder that is a link to a shared one keeps its id when a --root names it, by either path.
  const shared = path.join(tmp, 'alias-roots-shared');
  writeSkill(path.join(shared, 'foo'), `${fm('foo', 'The shared foo.')}\nText.\n`);
  fs.mkdirSync(path.join(app, '.agents'), { recursive: true });
  fs.symlinkSync(shared, path.join(app, '.agents', 'skills'), 'junction');
  const linked = ids(['--no-user']);
  assert.ok(linked.some((x) => x.endsWith(' project-agents.packages.app')), linked.join(', '));
  assert.deepEqual(ids(['--no-user', '--root', path.join(app, '.agents', 'skills')]), linked, 'a --root naming the link changes no id');
  assert.deepEqual(ids(['--no-user', '--root', shared]), linked, 'nor one naming the folder it leads to');
});

test('a second skill of a name is named by its own name, root and folder in it, and a name no folder can hold by its digest (skill-atlas-1)', () => {
  const project = path.join(tmp, 'qualified-ids');
  const agents = path.join(project, '.agents', 'skills');
  writeSkill(path.join(project, '.claude', 'skills', 'foo'), `${fm('foo', 'The first.')}\nText.\n`);
  writeSkill(path.join(agents, 'foo'), `${fm('foo', 'In its own folder.')}\nText.\n`);
  for (const ns of ['a', 'b']) writeSkill(path.join(agents, ns, 'foo'), `${fm('foo', `Under ${ns}.`)}\nText.\n`);
  writeSkill(path.join(agents, 'odd'), `${fm('x@y/z', 'An odd name.')}\nText.\n`);
  const ids = () => scanJson(project).atlas.skills.map((s) => s.id).sort();
  const odd = `x-y-z_${crypto.createHash('sha256').update('x@y/z').digest('hex').slice(0, 8)}`;
  assert.deepEqual(ids(), ['foo', 'foo@project-agents', 'foo@project-agents@a.foo', 'foo@project-agents@b.foo', odd].sort());
  fs.rmSync(path.join(agents, 'a'), { recursive: true });
  fs.rmSync(path.join(agents, 'foo'), { recursive: true });
  assert.deepEqual(ids(), ['foo', 'foo@project-agents@b.foo', odd].sort(), 'removing other skills of the name but the first changes no id');
  fs.rmSync(path.join(project, '.claude', 'skills', 'foo'), { recursive: true });
  assert.deepEqual(ids(), ['foo', odd].sort(), 'removing the first gives the name to the next');
  // Names differing in letter case alone never share an id a folder could hold.
  writeSkill(path.join(project, '.claude', 'skills', 'Upper'), `${fm('Foo', 'In capitals.')}\nText.\n`);
  const cased = ids();
  assert.equal(new Set(cased.map((id) => id.toLowerCase())).size, cased.length, 'ids differ apart from letter case');
  assert.ok(cased.includes('Foo') && cased.includes('foo@project-agents@b.foo'), 'the first of the two names, letter case aside, takes its name');
});

test('annotations: a name holding several entries applies the one recording its digest, else one recording none (skill-atlas-6, skill-atlas-5)', () => {
  const project = path.join(tmp, 'annotation-list');
  const dir = path.join(project, '.claude', 'skills');
  for (const n of ['matched', 'undated', 'none-apply']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n## Step 1: One\n\nDo it.\n`);
  const state = path.join(project, 'state');
  fs.mkdirSync(state, { recursive: true });
  const other = { sha256: 'a'.repeat(64) };
  fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills: {
    matched: [{ source: other, summary: 'Another text.' }, { summary: 'Records none.' }, { source: { sha256: sha(path.join(dir, 'matched', 'SKILL.md')) }, summary: 'This text.' }],
    undated: [{ source: other, summary: 'Another text.' }, { summary: 'Records none.' }],
    'none-apply': [{ source: other, summary: 'One text.' }, { source: { sha256: 'b'.repeat(64) }, summary: 'Another.' }],
  } }));
  const { atlas } = scanJson(project, [], state);
  assert.equal(skillOf(atlas, 'matched').summary, 'This text.', 'the entry recording the skill\'s digest');
  assert.equal(skillOf(atlas, 'undated').summary, 'Records none.', 'else the one recording none');
  assert.equal(skillOf(atlas, 'none-apply').summary, null);
  assert.deepEqual(atlas.insights.filter((i) => i.kind === 'stale-annotation').map((i) => i.skills), [['none-apply']], 'stale only where no entry applies');
});

test('annotations: an entry listing other files applies only where each has the digest it records, and digest prints them (skill-atlas-6, skill-atlas-32)', () => {
  const project = path.join(tmp, 'annotation-files');
  const dir = path.join(project, '.claude', 'skills');
  for (const n of ['same', 'changed', 'missing', 'outside', 'plain']) {
    writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n## Step 1: One\n\nRead references/steps.md.\n`);
    fs.mkdirSync(path.join(dir, n, 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, n, 'references', 'steps.md'), '# Steps\n\r\nRead.\n');
  }
  fs.writeFileSync(path.join(project, 'elsewhere.md'), 'Elsewhere.\n');
  const printed = run(['digest', path.join(dir, 'same', 'SKILL.md'), path.join(dir, 'same', 'references', 'steps.md')]);
  assert.equal(printed.status, 0, printed.stderr);
  const lines = printed.stdout.trim().split('\n');
  assert.deepEqual(lines, [`${sha(path.join(dir, 'same', 'SKILL.md'))}  ${path.join(dir, 'same', 'SKILL.md')}`, `${sha(path.join(dir, 'same', 'references', 'steps.md'))}  ${path.join(dir, 'same', 'references', 'steps.md')}`],
    'one line per file, the digest of its bytes exactly');
  const missingFile = run(['digest', path.join(dir, 'nope.md')]);
  assert.notEqual(missingFile.status, 0);
  assert.match(missingFile.stderr, /nope\.md/);
  const stepsHex = lines[1].split('  ')[0];
  const entry = (n, files) => ({ source: { sha256: sha(path.join(dir, n, 'SKILL.md')), files }, summary: `${n} read.` });
  fs.writeFileSync(path.join(dir, 'changed', 'references', 'steps.md'), '# Steps\nChanged.\n');
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  fs.writeFileSync(path.join(project, 'state', 'annotations.json'), JSON.stringify({ version: 1, skills: {
    same: entry('same', { 'references/steps.md': stepsHex.toUpperCase() }),
    changed: entry('changed', { 'references/steps.md': stepsHex }),
    missing: entry('missing', { 'references/gone.md': stepsHex }),
    outside: entry('outside', { '../../../elsewhere.md': sha(path.join(project, 'elsewhere.md')) }),
    plain: entry('plain', undefined),
  } }));
  const { atlas } = scanJson(project);
  assert.deepEqual(['same', 'changed', 'missing', 'outside', 'plain'].map((n) => skillOf(atlas, n).summary), ['same read.', null, null, null, 'plain read.'],
    'applied only where SKILL.md and every file listed match; a missing file or one outside the folder never does');
  assert.deepEqual(atlas.insights.filter((i) => i.kind === 'stale-annotation').flatMap((i) => i.skills).sort(), ['changed', 'missing', 'outside']);
});

test('annotations: a name\'s entries apply to each differing skill of that name by the digest it records (skill-atlas-6, skill-atlas-5)', () => {
  const project = path.join(tmp, 'annotation-same-name');
  const first = path.join(project, '.claude', 'skills');
  const second = path.join(project, '.agents', 'skills');
  for (const [dir, text] of [[first, 'First.'], [second, 'Second.']]) {
    for (const n of ['foo', 'bar', 'baz', 'own', 'qux']) writeSkill(path.join(dir, n), `${fm(n, text)}\n## One\n\n${text}\n`);
  }
  const digest = (dir, n) => sha(path.join(dir, n, 'SKILL.md'));
  const state = path.join(project, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills: {
    foo: [{ source: { sha256: digest(second, 'foo') }, summary: 'B.' }, { source: { sha256: digest(first, 'foo') }, summary: 'A.' }],
    bar: [{ source: { sha256: digest(second, 'bar') }, summary: 'B.' }],
    baz: [{ source: { sha256: '0'.repeat(64) }, summary: 'Neither.' }, { summary: 'Undated.' }],
    own: [{ source: { sha256: digest(second, 'own') }, summary: 'By name.' }],
    'own@project-agents': { summary: 'By its own key.' },
    qux: [{ source: { sha256: '0'.repeat(64) }, summary: 'Neither.' }],
  } }));
  const { atlas } = scanJson(project, [], state);
  const summary = (id) => skillOf(atlas, id).summary;
  assert.deepEqual([summary('foo'), summary('foo@project-agents')], ['A.', 'B.'], 'each skill of the name the entry recording its digest');
  assert.deepEqual([summary('bar'), summary('bar@project-agents')], [null, 'B.'], 'an entry for the second applies to it alone');
  assert.deepEqual([summary('baz'), summary('baz@project-agents')], ['Undated.', null], 'an entry recording none stays with the first');
  assert.deepEqual([summary('own'), summary('own@project-agents')], [null, 'By its own key.'], 'a differing skill\'s own key over its name\'s entries');
  assert.equal(summary('qux'), null);
  assert.deepEqual(atlas.insights.filter((i) => i.kind === 'stale-annotation').map((i) => i.skills).sort(), [['baz@project-agents'], ['qux'], ['qux@project-agents']],
    'each skill of the name judged on its own: stale where none applies and an entry records a digest no skill of the name has');
});

test('annotations: of the entries recording a skill\'s digest the last supersedes the earlier, stale where a file it lists changed, and each skill of a name is stale on its own (skill-atlas-6, skill-atlas-5)', () => {
  const project = path.join(tmp, 'annotation-most-files');
  const dirs = ['.claude', '.agents', '.codex'].map((d) => path.join(project, d, 'skills'));
  for (const [n, dir] of dirs.entries()) {
    for (const name of ['corrected', 'reverted', 'revived', 'proc']) {
      writeSkill(path.join(dir, name), `${fm(name, `Copy ${n}.`)}\n## One\n\nRead references/steps.md.\n`);
      fs.mkdirSync(path.join(dir, name, 'references'), { recursive: true });
      fs.writeFileSync(path.join(dir, name, 'references', 'steps.md'), `# Steps ${n}\n`);
    }
  }
  const [first, second] = dirs;
  const source = (dir, name, files) => ({ sha256: sha(path.join(dir, name, 'SKILL.md')), ...(files ? { files: { 'references/steps.md': sha(path.join(dir, name, 'references', 'steps.md')) } } : {}) });
  const state = path.join(project, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills: {
    corrected: [{ source: source(first, 'corrected', false), summary: 'Old.' }, { source: source(first, 'corrected', true), summary: 'Corrected.' }],
    reverted: [{ source: source(first, 'reverted', true), summary: 'Superseded.' }, { source: source(first, 'reverted', false), summary: 'Correction.' }],
    revived: [{ source: source(first, 'revived', false), summary: 'Old.' }, { source: source(first, 'revived', true), summary: 'Corrected.' }],
    proc: [{ source: source(first, 'proc', true), summary: 'First read.' }, { source: source(second, 'proc', true), summary: 'Second read.' }],
  } }));
  // The second skill's procedure file changes after its entry was written, and
  // so does the file the correction of `revived` lists (the reviewer's case).
  fs.writeFileSync(path.join(second, 'proc', 'references', 'steps.md'), '# Changed\n');
  fs.writeFileSync(path.join(first, 'revived', 'references', 'steps.md'), '# Changed\n');
  const { atlas } = scanJson(project, [], state);
  const summary = (id) => skillOf(atlas, id).summary;
  assert.equal(summary('corrected'), 'Corrected.', 'the later entry supersedes the earlier');
  assert.equal(summary('reverted'), 'Correction.', 'whichever records more files');
  assert.equal(summary('revived'), null, 'a correction whose listed file changed is stale, the entry it superseded not revived');
  assert.deepEqual(['proc', 'proc@project-agents', 'proc@project-codex'].map(summary), ['First read.', null, null]);
  assert.deepEqual(atlas.insights.filter((i) => i.kind === 'stale-annotation').map((i) => i.skills).sort(), [['proc@project-agents'], ['revived']],
    'the skill its entry was written for is stale, the first current and the third, for which none was written, not');
});

test('annotations: skills of one name sharing their SKILL.md are told apart by a key of each one\'s id (skill-atlas-6, skill-atlas-5)', () => {
  const project = path.join(tmp, 'annotation-same-skill-md');
  const r5 = path.join(project, 'r5');
  const r6 = path.join(project, 'r6');
  const text = `${fm('proc', 'Proc.')}\n## One\n\nRead references/a.md.\n`;
  for (const [dir, guide] of [[r5, 'guide A'], [r6, 'guide B']]) {
    writeSkill(path.join(dir, 'proc'), text);
    fs.mkdirSync(path.join(dir, 'proc', 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'proc', 'references', 'a.md'), `${guide}\n`);
  }
  const state = path.join(project, 'state');
  fs.mkdirSync(state, { recursive: true });
  const entry = (dir, summary) => ({ source: { sha256: sha(path.join(dir, 'proc', 'SKILL.md')), files: { 'references/a.md': sha(path.join(dir, 'proc', 'references', 'a.md')) } }, summary });
  const roots = ['--root', r5, '--root', r6];
  const second = scanJson(project, roots, state).atlas.skills.find((x) => x.name === 'proc' && x.id !== 'proc').id;
  const write = (skills) => fs.writeFileSync(path.join(state, 'annotations.json'), JSON.stringify({ version: 1, skills }));
  const read = () => {
    const { atlas } = scanJson(project, roots, state);
    return [skillOf(atlas, 'proc').summary, skillOf(atlas, second).summary, atlas.insights.filter((i) => i.kind === 'stale-annotation').map((i) => i.skills[0])];
  };
  write({ proc: [entry(r5, 'A summary'), entry(r6, 'B summary')] });
  assert.deepEqual(read(), [null, 'B summary', ['proc']], 'under the name, the last entry recording their SKILL.md is both skills\', stale where its files differ');
  write({ proc: entry(r5, 'A summary'), [second]: entry(r6, 'B summary') });
  assert.deepEqual(read(), ['A summary', 'B summary', []], 'under each one\'s id, each its own');
});

test('annotations: words under a tag stand under exactly that tag, over its own entry, else a copy of a file\'s of the same language and script, else alone (skill-atlas-6)', () => {
  const project = path.join(tmp, 'annotation-words');
  const dir = path.join(project, '.claude', 'skills', 'words');
  writeSkill(dir, `${fm('words', 'Words.')}\n## One\nDo it.\n`);
  fs.writeFileSync(path.join(dir, 'SKILL.zh-TW.md'), `${fm('words', '\u7E41\u9AD4\u3002')}\n## \u4E00\n\u505A\u3002\n`);
  fs.writeFileSync(path.join(dir, 'SKILL.en.md'), `${fm('words', 'In English.')}\n## First\nDo it.\n`);
  fs.writeFileSync(path.join(dir, 'SKILL.fr.md'), `${fm('words', 'En fran\u00E7ais.')}\n## Un\nFais-le.\n`);
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  fs.writeFileSync(path.join(project, 'state', 'annotations.json'), JSON.stringify({ version: 1, skills: { words: { translations: {
    'en-US': { summary: 'US.' }, 'en-GB': { summary: 'GB.' }, 'zh-Hant': { summary: '\u6982\u8981\u3002' }, fr: { summary: 'R\u00E9sum\u00E9.' }, de: { summary: 'Kurz.' },
  } } } }));
  const { translations } = skillOf(scanJson(project).atlas, 'words');
  assert.deepEqual(Object.keys(translations), ['de', 'en', 'en-GB', 'en-US', 'fr', 'zh-Hant', 'zh-TW'], 'each tag\'s words under exactly it');
  const words = (t) => [translations[t].origin, translations[t].description, translations[t].summary];
  assert.deepEqual(words('en'), ['skill', 'In English.', null], 'the file\'s own entry never changed by words for another tag');
  assert.deepEqual(words('en-US'), ['skill', 'In English.', 'US.'], 'a copy of the file\'s entry with the tag\'s own words');
  assert.deepEqual(words('en-GB'), ['skill', 'In English.', 'GB.']);
  assert.deepEqual(words('zh-Hant'), ['skill', '\u7E41\u9AD4\u3002', '\u6982\u8981\u3002'], 'zh-Hant over the zh-TW file\'s fields');
  assert.equal(translations['zh-TW'].summary, null);
  assert.deepEqual(words('fr'), ['skill', 'En fran\u00E7ais.', 'R\u00E9sum\u00E9.'], 'over the tag\'s own file entry');
  assert.deepEqual(words('de'), ['annotation', null, 'Kurz.'], 'an entry of its own where no file is of the language');
});

test('annotations: replaced steps leave one link per target at the skill, calls before mentions (skill-atlas-6)', () => {
  const project = path.join(tmp, 'annotation-links');
  const dir = path.join(project, '.claude', 'skills');
  writeSkill(path.join(dir, 'review'), `${fm('review', 'Reviews.')}\nText.\n`);
  writeSkill(path.join(dir, 'twice'), `${fm('twice', 'Links twice.')}
## Step 1: First

See the \`review\` skill. Call Skill(gone) here.

## Step 2: Second

Run \`/review\` now. Call Skill(gone) again.
`);
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  fs.writeFileSync(path.join(project, 'state', 'annotations.json'), JSON.stringify({ version: 1, skills: { twice: { steps: [{ title: 'Only', summary: 'One step.' }] } } }));
  const { atlas } = scanJson(project);
  assert.deepEqual(edge(atlas, 'twice', 'review').map((e) => [e.fromStep, e.kind]), [[null, 'calls']], 'one link, the call');
  assert.deepEqual(atlas.unresolved.filter((u) => u.from === 'twice').map((u) => [u.fromStep, u.name]), [[null, 'gone']], 'one unresolved link per name');
});

test('a name not installed, first mentioned and later called by one skill, stays a call with the call\'s line, in the insight, under replaced steps and in the digest (skill-atlas-5, skill-atlas-6, skill-atlas-7)', () => {
  const project = path.join(tmp, 'mention-then-call');
  const dir = path.join(project, '.claude', 'skills');
  const text = `${fm('later', 'Mentions, then calls.')}
## Step 1: First

Do not run the \`/gone\` command yet.

## Step 2: Second

Invoke the \`gone\` skill now.
`;
  writeSkill(path.join(dir, 'later'), text);
  writeSkill(path.join(dir, 'kept'), text.replace(/later/g, 'kept'));
  const callLine = text.split('\n').findIndex((l) => l.startsWith('Invoke')) + 1;
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  fs.writeFileSync(path.join(project, 'state', 'annotations.json'), JSON.stringify({ version: 1, skills: { later: { steps: [{ title: 'Only', summary: 'One step.' }] } } }));
  const { atlas } = scanJson(project);
  assert.deepEqual(atlas.unresolved.filter((u) => u.from === 'later').map((u) => [u.fromStep, u.kind, u.evidence.line]), [[null, 'calls', callLine]], 'under replaced steps: the call, with its line');
  assert.deepEqual(atlas.unresolved.filter((u) => u.from === 'kept').map((u) => [u.fromStep, u.kind]), [['kept#1', 'mentions'], ['kept#2', 'calls']], 'each step keeps its own');
  const insight = atlas.insights.find((i) => i.kind === 'unresolved-link' && i.skills.includes('kept'));
  assert.equal(insight.params.kind, 'calls');
  assert.match(insight.message, new RegExp(`^kept calls "gone", which is not installed \\(line ${callLine}\\)$`), 'the call\'s line, not the mention\'s');
  const r = run(['scan', '--summary', '--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')]);
  assert.match(r.stdout, /, 3 unresolved \(2 calls and 1 mention\)\.\n/);
  assert.match(r.stdout, /\nUnresolved links \(3: 2 calls and 1 mention\):\n(.*\n)* {2}kept step 1 mentions gone /);
});

test('links: `$name` after a verb of use in its clause calls the skill; with no verb, or naming no skill, it is nothing (skill-atlas-3)', () => {
  const project = path.join(tmp, 'dollar-project');
  const dir = path.join(project, '.agents', 'skills');
  for (const n of ['review', 'lint-fix']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\nText.\n`);
  const cases = {
    plain: 'Run $review before returning.',
    ticked: 'Then use `$review` on the change.',
    hyphen: 'Invoke $lint-fix first.',
    noverb: 'The $review output is long.',
    clause: 'Run the tests, then $review the diff.',
    unknown: 'Run $nosuch next. Use $HOME as the folder.',
    steered: 'Do not use $review here.',
    joined: 'Run $review and $lint-fix, then stop.',
    listed: 'run $lint-fix, `$review` or $nosuch next.',
    negated: 'Do not run $review here. Never invoke `/lint-fix` alone.',
    path: 'Run the script at bin/$review today. Open https://host/$review now. Use ~/$review or a.$review.',
  };
  for (const [n, text] of Object.entries(cases)) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n${text}\n`);
  const { atlas } = scanJson(project);
  const kinds = (from) => Object.fromEntries(atlas.edges.filter((e) => e.from === from).map((e) => [e.to, e.kind]));
  assert.deepEqual(kinds('plain'), { review: 'calls' });
  assert.deepEqual(kinds('ticked'), { review: 'calls' });
  assert.deepEqual(kinds('hyphen'), { 'lint-fix': 'calls' });
  assert.deepEqual(kinds('noverb'), {}, 'no verb of use before it');
  assert.deepEqual(kinds('clause'), {}, 'the verb in another clause');
  assert.deepEqual(kinds('unknown'), {});
  assert.ok(!atlas.unresolved.some((u) => u.from === 'unknown'), 'a $ before a name no skill has is no unresolved link');
  assert.deepEqual(kinds('steered'), { review: 'mentions' }, 'steered as the other forms are');
  assert.deepEqual(kinds('joined'), { review: 'calls', 'lint-fix': 'calls' }, 'each $name joined after one verb of use');
  assert.deepEqual(kinds('listed'), { review: 'calls', 'lint-fix': 'calls' }, 'a list joined by commas and "or"');
  assert.deepEqual(kinds('negated'), { review: 'mentions', 'lint-fix': 'mentions' }, 'every verb of use negated steers, for every form');
  assert.deepEqual(kinds('path'), {}, 'a $name inside a path or URL is no link');
});

test('links: a negated verb of use steers the names after it, whichever verb and form (skill-atlas-3)', () => {
  const project = path.join(tmp, 'negated-project');
  const dir = path.join(project, '.agents', 'skills');
  writeSkill(path.join(dir, 'review'), `${fm('review', 'Reviews.')}\nText.\n`);
  const cases = {
    call: 'Don\'t call the `review` skill.',
    load: 'Never load the review skill.',
    trigger: 'Do not trigger /review here.',
    start: 'You should not start the review playbook.',
    curly: 'Don\u2019t run the `review` skill.',
    shouldnt: 'You shouldn\'t run $review.',
    cant: 'You can\'t use the review skill here.',
    wont: 'This skill won\'t call $review.',
    doesnt: 'It doesn\u2019t invoke /review.',
    mustnt: 'You mustn\'t load the review skill.',
    cannot: 'You cannot start the review playbook.',
    ever: 'Do not ever run $review.',
    use: 'Use the review skill.',
  };
  for (const [n, text] of Object.entries(cases)) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n${text}\n`);
  const { atlas } = scanJson(project);
  const kind = (from) => edge(atlas, from, 'review').map((e) => e.kind);
  for (const n of ['call', 'load', 'trigger', 'start', 'curly', 'shouldnt', 'cant', 'wont', 'doesnt', 'mustnt', 'cannot', 'ever']) assert.deepEqual(kind(n), ['mentions'], n);
  assert.deepEqual(kind('use'), ['calls']);
});

test('links: a sentence is read over a paragraph\'s or list item\'s visible text, wherever its lines break and whether its names are linked (skill-atlas-3)', () => {
  const project = path.join(tmp, 'wrap-project');
  const dir = path.join(project, '.agents', 'skills');
  for (const n of ['lint', 'review']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\nText.\n`);
  const cases = {
    oneLine: 'Run $lint and $review.',
    wrapped: 'Run $lint and\n$review.',
    wrappedItem: '- Run $lint and\n  $review.',
    wrappedQuote: '> Run $lint and\n> $review.',
    lazyQuote: '> Run $lint and\n$review now.',
    inlineTag: 'Run $lint for the style and then\n<kbd>$review</kbd> the result.',
    autolink: 'Run the\n<https://localhost/x> review skill.',
    longParagraph: `${Array.from({ length: 39 }, () => 'x'.repeat(100)).join('\n')}\n${'y'.repeat(46)}\nRun $lint and\n$review now.`, // past 4,000 characters at the break
    linked: 'Run [$lint](../lint/SKILL.md) and [$review](../review/SKILL.md).',
    linkedSkill: 'Use the [review skill](../review/SKILL.md), then run [`/lint`](../lint/SKILL.md "Lint").',
    wrappedVerb: 'When done, run\n$review.',
    negatedSequence: 'Do not run $lint and then run $review.',
    negatedWrapped: 'Never run $lint and\nnever $review.',
    negatedBut: 'Do not run `$lint`, but run `$review`.',
    newItem: '- Never run $lint.\n- Run $review.',
    newItemNoStop: '- Never run $lint\n- run $review',
    newParagraph: 'Never run $lint\n\nrun $review',
  };
  for (const [n, text] of Object.entries(cases)) writeSkill(path.join(dir, n.toLowerCase()), `${fm(n.toLowerCase(), `${n}.`)}\n${text}\n`);
  const { atlas } = scanJson(project);
  const kinds = (from) => ['lint', 'review'].map((to) => edge(atlas, from.toLowerCase(), to).map((e) => e.kind).join() || '-');
  for (const n of ['oneLine', 'wrapped', 'wrappedItem', 'wrappedQuote', 'lazyQuote', 'inlineTag', 'linked', 'linkedSkill', 'longParagraph']) assert.deepEqual(kinds(n), ['calls', 'calls'], n);
  assert.deepEqual(kinds('autolink'), ['-', 'calls'], 'an autolink starting a line continues its paragraph');
  assert.deepEqual(kinds('wrappedVerb'), ['-', 'calls'], 'a verb of use at a line\'s end reaches the name after the break');
  assert.deepEqual(kinds('negatedSequence'), ['mentions', 'mentions'], 'a negation holds over a sequence to its sentence\'s end');
  assert.deepEqual(kinds('negatedWrapped'), ['mentions', 'mentions']);
  assert.deepEqual(kinds('negatedBut'), ['mentions', 'calls'], 'unless a clause of use follows');
  for (const n of ['newItem', 'newItemNoStop', 'newParagraph']) assert.deepEqual(kinds(n), ['mentions', 'calls'], `${n}: a list item or paragraph is a text of its own`);
  // Evidence quotes and numbers the line the name is on.
  const [wrapped] = edge(atlas, 'wrapped', 'review');
  assert.deepEqual(wrapped.evidence, { line: 7, text: '$review.' });
  assert.deepEqual(edge(atlas, 'wrapped', 'lint')[0].evidence, { line: 6, text: 'Run $lint and' });
  assert.deepEqual(edge(atlas, 'linked', 'review')[0].evidence, { line: 6, text: 'Run [$lint](../lint/SKILL.md) and [$review](../review/SKILL.md).' });
});

test('links: a sentence is read over every name in it before the names no skill has are dropped (skill-atlas-3)', () => {
  const project = path.join(tmp, 'clause-project');
  const dir = path.join(project, '.agents', 'skills');
  for (const n of ['lint', 'review']) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\nText.\n`);
  const cases = {
    gap: 'Run $lint, $optional, and $review.',
    first: 'Run $optional and $review.',
    but: 'Never run $lint but run $review.',
    not: 'Run $lint, not $review.',
    butnot: 'Run $lint but not $review.',
    args: 'Use $ARGUMENTS with $review.',
  };
  for (const [n, text] of Object.entries(cases)) writeSkill(path.join(dir, n), `${fm(n, `${n}.`)}\n${text}\n`);
  const { atlas } = scanJson(project);
  const kinds = (from) => Object.fromEntries(atlas.edges.filter((e) => e.from === from).map((e) => [e.to, e.kind]));
  assert.deepEqual(kinds('gap'), { lint: 'calls', review: 'calls' }, 'a name no skill has keeps the list joined');
  assert.deepEqual(kinds('first'), { review: 'calls' });
  assert.deepEqual(kinds('but'), { lint: 'mentions', review: 'calls' }, 'a clause opening with "but" and a verb of use ends the negation');
  assert.deepEqual(kinds('not'), { lint: 'calls', review: 'mentions' }, '", not" joins a name steered away from');
  assert.deepEqual(kinds('butnot'), { lint: 'calls', review: 'mentions' });
  assert.deepEqual(kinds('args'), { review: 'calls' }, 'a name no skill has before it in the clause');
});

test('scan: each skill\'s language, its declared one else its text\'s outside fenced code (skill-atlas-29)', () => {
  const project = path.join(tmp, 'language-project');
  const dir = path.join(project, '.claude', 'skills');
  const fence = '```\n' + '\u4E2D\u6587\u4EE3\u7801\u793A\u4F8B'.repeat(20) + '\n```\n';
  const skills = {
    english: `${fm('english', 'Writes things.')}\nWrite the report.\n${fence}`,
    chinese: `${fm('chinese', '\u5199\u62A5\u544A\u3002')}\n\u5199\u4E00\u4EFD\u62A5\u544A\uFF0C\u7136\u540E\u505C\u4E0B\u3002\n`,
    japanese: `${fm('japanese', '\u5831\u544A\u3092\u66F8\u304F\u3002')}\n\u5831\u544A\u66F8\u3092\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\u3002\n`,
    korean: `${fm('korean', '\uBCF4\uACE0\uC11C\uB97C \uC4F4\uB2E4.')}\n\uBCF4\uACE0\uC11C\uB97C \uC791\uC131\uD558\uC138\uC694.\n`,
    russian: `${fm('russian', '\u041F\u0438\u0448\u0435\u0442 \u043E\u0442\u0447\u0451\u0442.')}\n${'\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u0442\u0447\u0451\u0442. '.repeat(3)}\n`,
    declared: `${fm('declared', 'Writes things.', 'metadata:\n  language: zh-hant\n')}\nWrite the report.\n`,
    flow: `${fm('flow', 'Writes things.', 'metadata: {language: zh-hant}\n')}\nWrite the report.\n`,
    'flow-quoted': `${fm('flow-quoted', 'Writes things.', 'metadata: { owner: "a, b", language: \'zh-Hant\', tags: [x, "y"], more: {deep: 1} }\n')}\nWrite the report.\n`,
    // Over several lines with a comment after a pair, an empty value and a map below the first level.
    'flow-lines': `${fm('flow-lines', 'Writes things.', 'metadata: {\n  owner: "a # b",  # who\n  empty: ,\n  # a line of its own\n  language: zh-Hant, more: {deep: 1}\n  }\n')}\nWrite the report.\n`,
    'block-lines': `${fm('block-lines', 'Writes things.', 'metadata:\n  owner: "a # b"  # who\n  empty:\n  # a line of its own\n  language: zh-Hant\n  more:\n    deep: 1\n')}\nWrite the report.\n`,
  };
  for (const [n, text] of Object.entries(skills)) writeSkill(path.join(dir, n), text);
  const { atlas } = scanJson(project);
  assert.deepEqual(Object.fromEntries(atlas.skills.map((s) => [s.id, s.language])), {
    'block-lines': 'zh-Hant', chinese: 'zh', declared: 'zh-Hant', english: 'en', flow: 'zh-Hant', 'flow-lines': 'zh-Hant', 'flow-quoted': 'zh-Hant', japanese: 'ja', korean: 'ko', russian: 'und',
  }, 'a flow mapping declares as the block form does');
  assert.deepEqual(skillOf(atlas, 'flow-quoted').frontmatter.metadata, { owner: 'a, b', language: 'zh-Hant', tags: ['x', 'y'], more: null }, 'quoted values, several pairs, a flow sequence, and a map below the first level kept opaque as in the block form');
  assert.deepEqual(skillOf(atlas, 'flow-lines').frontmatter.metadata, { owner: 'a # b', empty: null, language: 'zh-Hant', more: null }, 'comments on its lines dropped, an empty value null');
  assert.deepEqual(skillOf(atlas, 'flow-lines').frontmatter.metadata, skillOf(atlas, 'block-lines').frontmatter.metadata, 'the same data as the block form, line by line');
  assert.deepEqual(skillOf(atlas, 'flow').frontmatter.metadata, skillOf(atlas, 'declared').frontmatter.metadata, 'the same data as the block form');
});

test('frontmatter: a flow collection closing at its key\'s column reads, and a field in error leaves every other field standing (skill-atlas-1, skill-atlas-29)', () => {
  const project = path.join(tmp, 'frontmatter-fields');
  const dir = path.join(project, '.claude', 'skills');
  const head = (folder, extra) => `---\nname: ${folder}-name\ndescription: Kept.\n${extra}---\nBody.\n`;
  const skills = {
    closing: 'metadata: {\n  language: zh-Hant\n}\nallowed-tools: [\n  Read,\n  Write\n]\n',
    unclosed: 'metadata: {\n  language: zh-Hant\nother: x\n',
    quote: 'other: "never closed\n',
    after: 'other: "a" b\n',
    twice: 'other: one\nother: two\n',
    nested: 'metadata:\n  bad: \'open\n  language: zh-Hant\n',
    beside: 'metadata:\n  language: zh-Hant\nother: "unclosed\n',
  };
  for (const [folder, extra] of Object.entries(skills)) writeSkill(path.join(dir, folder), head(folder, extra));
  writeSkill(path.join(dir, 'noname'), '---\nname: "open\ndescription: Kept.\n---\nBody.\n');
  const { atlas } = scanJson(project);
  const read = (folder) => atlas.skills.find((s) => path.basename(s.dir) === folder);
  const closing = read('closing');
  assert.equal(closing.language, 'zh-Hant', 'the mapping closed at its key\'s column declares the language');
  assert.deepEqual([closing.frontmatter.metadata, closing.frontmatter['allowed-tools'], closing.issues.includes('invalid-frontmatter')], [{ language: 'zh-Hant' }, ['Read', 'Write'], false]);
  const named = (s) => atlas.insights.find((i) => i.kind === 'invalid-frontmatter' && i.skills.includes(s.id))?.params.named;
  for (const folder of ['unclosed', 'quote', 'after', 'twice', 'nested', 'beside']) {
    const s = read(folder);
    assert.deepEqual([s.name, s.description, s.issues.includes('invalid-frontmatter')], [`${folder}-name`, 'Kept.', true], `${folder}: the name and description stand beside the field in error`);
    assert.equal(named(s), true, `${folder}: the insight says its name reads`);
    if (folder !== 'unclosed' && folder !== 'nested') assert.ok(!('other' in s.frontmatter), `${folder}: the field in error left out`);
  }
  assert.deepEqual([read('unclosed').frontmatter.other, 'metadata' in read('unclosed').frontmatter], ['x', false], 'an unclosed mapping left out, swallowing no key after it');
  assert.deepEqual(read('nested').frontmatter.metadata, { language: 'zh-Hant' }, 'a member in error left out of its map alone');
  for (const folder of ['nested', 'beside']) assert.equal(read(folder).language, 'zh-Hant', `${folder}: the declared language stands beside a field in error`);
  assert.deepEqual([read('noname').id, read('noname').description, named(read('noname'))], ['noname', 'Kept.', false], 'a name in error leaves the folder naming the skill, and the insight says so');
});

test('translations: the skill folder\'s first, the state folder\'s where only the skill\'s is behind its source (skill-atlas-27)', () => {
  const project = path.join(tmp, 'precedence-project');
  const state = path.join(project, 'state');
  const names = ['own-fresh', 'own-behind', 'both-behind', 'state-unpinned'];
  for (const n of names) {
    const dir = path.join(project, '.claude', 'skills', n);
    writeSkill(dir, `${fm(n, 'English.')}\n## One\nDo it.\n`);
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'references', 'a.md'), '# A\n');
    const stateDir = path.join(state, 'translations', n);
    fs.mkdirSync(path.join(stateDir, 'references'), { recursive: true });
    for (const [rel, src] of [['SKILL.zh-CN.md', 'SKILL.md'], ['references/a.zh-CN.md', 'references/a.md']]) {
      const hex = sha(path.join(dir, ...src.split('/')));
      const ownHex = n === 'own-fresh' ? hex : '0'.repeat(64);
      const stateHex = n === 'both-behind' ? '1'.repeat(64) : hex;
      fs.writeFileSync(path.join(dir, ...rel.split('/')), `${fm(n, '\u81EA\u5DF1\u7684\u3002')}${record(ownHex)}\n`);
      fs.writeFileSync(path.join(stateDir, ...rel.split('/')), `${fm(n, '\u72B6\u6001\u7684\u3002')}${n === 'state-unpinned' ? '' : record(stateHex)}\n`);
    }
  }
  const { atlas } = scanJson(project, [], state);
  const got = (n) => { const t = skillOf(atlas, n).translations['zh-CN']; return [t.origin, t.description, t.stale]; };
  assert.deepEqual(got('own-fresh'), ['skill', '\u81EA\u5DF1\u7684\u3002', false], 'the skill folder\'s first');
  assert.deepEqual(got('own-behind'), ['state', '\u72B6\u6001\u7684\u3002', false], 'the state folder\'s where only the skill\'s is behind');
  assert.deepEqual(got('both-behind'), ['skill', '\u81EA\u5DF1\u7684\u3002', true], 'the skill folder\'s where both are behind');
  assert.deepEqual(got('state-unpinned'), ['skill', '\u81EA\u5DF1\u7684\u3002', true], 'a state translation recording no digest never displaces the skill\'s own');
  const staleFiles = (n) => atlas.insights.filter((i) => i.kind === 'stale-translation' && i.skills.includes(n)).flatMap((i) => i.params.files);
  assert.deepEqual(staleFiles('own-behind'), [], 'no mark for the translation not chosen');
  assert.deepEqual(staleFiles('both-behind').sort(), ['SKILL.zh-CN.md', 'references/a.zh-CN.md']);
});

test('pipelines reads the stored document with its version and --put writes it as the server\'s save does (skill-atlas-31)', () => {
  const state = path.join(tmp, 'cli-pipelines-state');
  const wf = (name) => JSON.stringify({ version: 1, active: null, pipelines: [{ id: 'w', name, phases: [{ id: 'p', name: 'P', skills: ['alpha'] }] }] });
  const file = path.join(tmp, 'cli-pipelines.json');
  const read = () => {
    const r = run(['pipelines', '--state', state]);
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const empty = read();
  assert.deepEqual(empty, { etag: '"none"', doc: { version: 1, active: null, pipelines: [] } }, 'an empty document where there is no file');
  fs.writeFileSync(file, wf('First'));
  const put = run(['pipelines', '--put', file, '--if-match', empty.etag, '--state', state]);
  assert.equal(put.status, 0, put.stderr);
  const stored = fs.readFileSync(path.join(state, 'pipelines.json'));
  assert.equal(put.stdout.trim(), `"${crypto.createHash('sha256').update(stored).digest('hex')}"`, 'the new etag');
  assert.deepEqual(read(), { etag: put.stdout.trim(), doc: JSON.parse(stored.toString('utf8')) });
  const stale = spawnSync(process.execPath, [CLI, 'pipelines', '--put', '-', '--if-match', empty.etag, '--state', state], { input: wf('Stale'), encoding: 'utf8', timeout: CLI_TIMEOUT_MS });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /changed since it was read; read it again/);
  fs.writeFileSync(file, JSON.stringify({ version: 1, active: 'nope', pipelines: [] }));
  const invalid = run(['pipelines', '--put', file, '--if-match', put.stdout.trim(), '--state', state]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /invalid pipelines document/);
  assert.deepEqual(fs.readFileSync(path.join(state, 'pipelines.json')), stored, 'a refused put leaves the stored file');
  fs.writeFileSync(path.join(state, 'pipelines.json.lock'), '{}');
  try {
    fs.writeFileSync(file, wf('Locked'));
    const locked = run(['pipelines', '--put', file, '--if-match', put.stdout.trim().slice(1, -1), '--state', state]);
    assert.notEqual(locked.status, 0, 'a held lock refuses the put, as it does a server\'s save');
    assert.match(locked.stderr, /is held/);
  } finally {
    fs.rmSync(path.join(state, 'pipelines.json.lock'));
  }
  // A document holding a field "error" of its own saves: the outcome is the save's, never a field of the document.
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(wf('Errorish')), error: 'changed' }));
  const errorish = run(['pipelines', '--put', file, '--if-match', put.stdout.trim(), '--state', state]);
  assert.equal(errorish.status, 0, errorish.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(state, 'pipelines.json'), 'utf8')).error, 'changed', 'written');
  const after = read();
  assert.equal(errorish.stdout.trim(), after.etag, 'the new etag printed');
  // A document over the limit the page's save takes is refused alike, the limit named.
  const big = JSON.parse(wf('Big'));
  big.pipelines[0].phases[0].note = 'x'.repeat(1024 * 1024);
  fs.writeFileSync(file, JSON.stringify(big));
  const tooLarge = run(['pipelines', '--put', file, '--if-match', after.etag, '--state', state]);
  assert.notEqual(tooLarge.status, 0);
  assert.match(tooLarge.stderr, /over the 1 MiB limit/);
  assert.equal(read().etag, after.etag, 'the stored file stands');
  fs.writeFileSync(path.join(state, 'pipelines.json'), '{ broken');
  const broken = run(['pipelines', '--state', state]);
  assert.notEqual(broken.status, 0);
  assert.ok(broken.stderr.includes(path.join(state, 'pipelines.json')), 'names the file');
});

test('a workflows.json an earlier atlas kept is read as the stored pipelines until the first save (skill-atlas-40)', () => {
  const state = path.join(tmp, 'cli-legacy-state');
  fs.mkdirSync(state, { recursive: true });
  const legacy = path.join(state, 'workflows.json');
  const pipelines = [{ id: 'w', name: 'Delivery', phases: [{ id: 'p', name: 'Build', note: '', skills: ['alpha'] }] }];
  fs.writeFileSync(legacy, JSON.stringify({ version: 1, active: 'w', workflows: pipelines }));
  const legacyBytes = fs.readFileSync(legacy);
  const read = () => {
    const r = run(['pipelines', '--state', state]);
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const first = read();
  assert.deepEqual(first, { etag: '"none"', doc: { version: 1, active: 'w', pipelines } }, 'its pipelines, as the document of no file');
  const file = path.join(tmp, 'cli-legacy-put.json');
  fs.writeFileSync(file, JSON.stringify(first.doc));
  const put = run(['pipelines', '--put', file, '--if-match', first.etag, '--state', state]);
  assert.equal(put.status, 0, put.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(state, 'pipelines.json'), 'utf8')).pipelines, pipelines, 'the first put writes them to pipelines.json');
  assert.deepEqual(fs.readFileSync(legacy), legacyBytes, 'workflows.json is never written');
  assert.equal(read().etag, put.stdout.trim(), 'pipelines.json is read from then on');

  const unreadable = path.join(tmp, 'cli-legacy-unreadable');
  fs.mkdirSync(unreadable, { recursive: true });
  fs.writeFileSync(path.join(unreadable, 'workflows.json'), '{ broken');
  const r = run(['pipelines', '--state', unreadable]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { etag: '"none"', doc: { version: 1, active: null, pipelines: [] } }, 'one that cannot be read gives no document');
  assert.equal(fs.readFileSync(path.join(unreadable, 'workflows.json'), 'utf8'), '{ broken', 'and is left as it is');
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
      'local@m': [{ scope: 'user', installPath: install('local') }],
    },
  }));
  // The project's settings disable `here` and enable `off` over the user's; its local ones re-enable `local`.
  fs.writeFileSync(path.join(project, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'here@m': false, 'off@m': true, 'local@m': false } }));
  fs.writeFileSync(path.join(project, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { 'local@m': true } }));
  // A plugin's skill copied, every file the same, into the project's folder: of another name there [skill-atlas-33].
  writeSkill(path.join(project, '.agents', 'skills', 'tools-skill'), fs.readFileSync(path.join(config, 'plugins', 'cache', 'm', 'tools', 'skills', 'tools-skill', 'SKILL.md'), 'utf8'));
  fs.mkdirSync(path.join(config, 'plugins', 'marketplaces', 'm', 'skills', 'market-skill'), { recursive: true });
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'off@m': false, 'local@m': false } }));
  const r = run(['scan', '--cwd', path.join(project, '.claude'), '--no-user', '--state', path.join(project, 'state')], { env: { CLAUDE_CONFIG_DIR: config } });
  assert.equal(r.status, 0, r.stderr);
  const atlas = JSON.parse(r.stdout);
  const plugin = atlas.skills.filter((s) => s.plugin).map((s) => `${s.plugin}/${s.name}`).sort();
  assert.deepEqual(plugin, ['here/here-skill', 'tools/tools-skill'], 'a project install counts inside its project; disabled and other-project installs do not');
  const r2 = run(['scan', '--cwd', project, '--no-user', '--state', path.join(project, 'state')], { env: { CLAUDE_CONFIG_DIR: config } });
  assert.equal(r2.status, 0, r2.stderr);
  const atlas2 = JSON.parse(r2.stdout);
  assert.deepEqual(atlas2.roots.filter((r) => r.scope === 'plugin').map((r) => r.plugin).sort(), ['local', 'off', 'tools'],
    'the project\'s settings over the user\'s, and its local ones over both');
  const tools = atlas2.skills.filter((s) => s.name === 'tools-skill');
  assert.deepEqual(tools.map((s) => [s.root, s.plugin, s.copies.map((c) => c.root)]), [['project-agents', null, ['plugin-tools.m']]], 'the copy in the plugin joins the project\'s');
  assert.ok(atlas2.edges.some((e) => e.from === 'caller' && e.to === 'tools-skill' && e.kind === 'calls'), '<plugin>:<name> resolves to a copy in the plugin');
});

test('plugin skills: enabled by the settings of each of the project\'s folders, the nearer over the farther and local over shared (skill-atlas-1)', () => {
  const config = path.join(tmp, 'claude-config-up');
  const repo = path.join(tmp, 'plugin-up-repo');
  const cwd = path.join(repo, 'a', 'b');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  const names = ['rootoff', 'nearon', 'localoff', 'useroff', 'plain'];
  const plugins = {};
  for (const name of names) {
    const dir = path.join(config, 'plugins', 'cache', 'm', name);
    writeSkill(path.join(dir, 'skills', `${name}-skill`), `${fm(`${name}-skill`, `${name} skill.`)}\nText.\n`);
    plugins[`${name}@m`] = [{ scope: 'project', installPath: dir, projectPath: repo }];
  }
  fs.writeFileSync(path.join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
  const settings = (dir, file, map) => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', file), JSON.stringify({ enabledPlugins: map }));
  };
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'useroff@m': false } }));
  settings(repo, 'settings.json', { 'rootoff@m': false, 'nearon@m': false, 'localoff@m': true });
  settings(repo, 'settings.local.json', { 'localoff@m': false });
  settings(cwd, 'settings.json', { 'nearon@m': true });
  const r = run(['scan', '--cwd', cwd, '--no-user', '--state', path.join(tmp, 'plugin-up-state')], { env: { CLAUDE_CONFIG_DIR: config } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).roots.filter((x) => x.scope === 'plugin').map((x) => x.plugin).sort(), ['nearon', 'plain'],
    'the repository root\'s settings disable a plugin for a subfolder; a nearer folder\'s value wins; local over shared');
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

test('pin and pin --check fail on a state translation of a skill not reported, one under no skill id folder, and a folder holding none (skill-atlas-28)', () => {
  const project = path.join(tmp, 'pin-orphan');
  const state = path.join(project, 'state');
  const skill = path.join(project, '.claude', 'skills', 'kept');
  writeSkill(skill, `${fm('kept', 'Kept.')}\nText.\n`);
  const keptZh = path.join(state, 'translations', 'kept', 'SKILL.zh-CN.md');
  const ghostZh = path.join(state, 'translations', 'ghost', 'SKILL.zh-CN.md');
  for (const f of [keptZh, ghostZh]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${fm('x', '\u8BD1\u672C\u3002')}\n\u6587\u3002\n`); }
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', state];
  const untouched = contents(state);
  let r = run(['pin', '--check', path.join(state, 'translations'), ...scope], { cwd: project });
  assert.equal(r.status, 1);
  assert.ok(r.stdout.split('\n').some((l) => l.startsWith('no skill') && l.includes(path.join('ghost', 'SKILL.zh-CN.md')) && l.includes('"ghost"')), r.stdout);
  r = run(['pin', path.join(state, 'translations'), ...scope], { cwd: project });
  assert.equal(r.status, 1, 'pin fails too');
  assert.match(r.stderr, /ghost.*SKILL\.zh-CN\.md.*no scanned skill has the id "ghost".*no translation was changed/);
  assert.deepEqual(contents(state), untouched, 'nothing is written');
  // With the ghost gone, a translation directly under translations/ names no skill: both commands fail on it.
  fs.rmSync(path.dirname(ghostZh), { recursive: true });
  const looseZh = path.join(state, 'translations', 'SKILL.zh-CN.md');
  fs.writeFileSync(looseZh, `${fm('x', '\u8BD1\u672C\u3002')}\n\u6587\u3002\n`);
  const withLoose = contents(state);
  r = run(['pin', '--check', path.join(state, 'translations'), ...scope], { cwd: project });
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.split('\n').some((l) => l.startsWith('no skill') && l.includes(path.join('translations', 'SKILL.zh-CN.md')) && l.includes('no skill id folder')), r.stdout);
  r = run(['pin', path.join(state, 'translations'), ...scope], { cwd: project });
  assert.equal(r.status, 1, 'pin fails on it too');
  assert.match(r.stderr, /SKILL\.zh-CN\.md: it lies directly under translations\/ of the state folder and names no skill id folder.*no translation was changed/);
  assert.deepEqual(contents(state), withLoose, 'nothing is written');
  // With it gone too, the rest pins.
  fs.rmSync(looseZh);
  assert.equal(run(['pin', path.join(state, 'translations'), ...scope], { cwd: project }).status, 0);
  assert.equal(run(['pin', '--check', path.join(state, 'translations'), ...scope], { cwd: project }).status, 0);

  const empty = path.join(project, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  r = run(['pin', '--check', empty, ...scope], { cwd: project });
  assert.equal(r.status, 1, 'a folder holding no translation fails the check');
  assert.match(r.stdout, /holds no translation/);
  r = run(['pin', empty, ...scope], { cwd: project });
  assert.equal(r.status, 1, 'pin fails on it too');
  assert.match(r.stderr, /empty: it holds no translation/);
  // A state translation pinned without its --state: the folder's files are named like translations with no source beside them.
  r = run(['pin', path.join(state, 'translations', 'kept'), '--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'other-state')], { cwd: project });
  assert.equal(r.status, 1, 'pin without the --state the translation is in fails');
  assert.match(r.stderr, /1 file is named like one, with no source beside it and outside the state folder .*other-state.*pass its --state/);
  assert.match(run(['--help']).stdout, /pin <path>\.\.\. \[--state <dir>\] \[--cwd <dir>\] \[--root <dir>\]/);
});

test('pin and pin --check fail, named, on a folder that cannot be read whole (skill-atlas-28)', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return t.skip('needs a folder its owner cannot read');
  const project = path.join(tmp, 'pin-partial');
  const skill = path.join(project, '.claude', 'skills', 'part');
  writeSkill(skill, `${fm('part', 'Part.')}\nText.\n`);
  fs.writeFileSync(path.join(skill, 'SKILL.zh-CN.md'), `${fm('part', '\u90E8\u5206\u3002')}\n\u6587\u3002\n`);
  const locked = path.join(skill, 'references');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'a.md'), '# A\n');
  fs.writeFileSync(path.join(locked, 'a.zh-CN.md'), '# A\n');
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')];
  const untouched = fs.readFileSync(path.join(skill, 'SKILL.zh-CN.md'));
  fs.chmodSync(locked, 0o000);
  try {
    let r = run(['pin', '--check', skill, ...scope], { cwd: project });
    assert.equal(r.status, 1, 'the check fails on a partial listing');
    assert.ok(r.stdout.split('\n').some((l) => l.startsWith('incomplete') && l.includes(skill) && /cannot be read whole/.test(l)), r.stdout);
    r = run(['pin', skill, ...scope], { cwd: project });
    assert.equal(r.status, 1, 'pin fails too');
    assert.match(r.stderr, /part: it cannot be read whole.*no translation was changed/);
    assert.deepEqual(fs.readFileSync(path.join(skill, 'SKILL.zh-CN.md')), untouched, 'nothing is written');
  } finally {
    fs.chmodSync(locked, 0o755);
  }
  assert.equal(run(['pin', skill, ...scope], { cwd: project }).status, 0, 'read whole, it pins');
});

test('pin walks a folder at every depth, hidden folders included, passing over .git and node_modules alone (skill-atlas-28)', () => {
  const project = path.join(tmp, 'pin-hidden');
  const placed = (base) => {
    const dir = path.join(project, ...base.split('/'));
    writeSkill(dir, `${fm('h', 'Hidden.')}\nText.\n`);
    fs.writeFileSync(path.join(dir, 'SKILL.zh-CN.md'), `${fm('h', 'Hidden zh.')}\nText zh.\n`);
    return path.join(dir, 'SKILL.zh-CN.md');
  };
  const walked = ['.agents/skills/h', '.claude/skills/deep/er/h', '.codex/skills/h', '__pycache__/h'].map(placed);
  const passed = ['.git/skills/h', 'node_modules/pkg/skills/h'].map(placed);
  const before = passed.map((f) => fs.readFileSync(f));
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')];
  const check = run(['pin', '--check', project, ...scope], { cwd: project });
  assert.equal(check.status, 1);
  assert.equal(check.stdout.split('\n').filter((l) => l.startsWith('no digest')).length, walked.length, check.stdout);
  const r = run(['pin', project, ...scope], { cwd: project });
  assert.equal(r.status, 0, r.stderr);
  for (const f of walked) assert.ok(/skill-atlas:source sha256=/.test(fs.readFileSync(f, 'utf8')), `${f} pinned`);
  assert.deepEqual(passed.map((f) => fs.readFileSync(f)), before, '.git and node_modules passed over');
});

test('pin walks a linked folder too, each real folder once, and fails naming a link it cannot follow (skill-atlas-28)', (t) => {
  const project = path.join(tmp, 'pin-linked');
  const elsewhere = path.join(tmp, 'pin-linked-source', 'h');
  writeSkill(elsewhere, `${fm('h', 'Linked.')}\nText.\n`);
  const translation = path.join(elsewhere, 'SKILL.zh-CN.md');
  fs.writeFileSync(translation, `${fm('h', 'Linked zh.')}\nText zh.\n`);
  fs.mkdirSync(path.join(project, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(project, '.agents', 'skills'), { recursive: true });
  try {
    fs.symlinkSync(elsewhere, path.join(project, '.claude', 'skills', 'h'), 'dir');
    fs.symlinkSync(elsewhere, path.join(project, '.agents', 'skills', 'h'), 'dir');
    fs.symlinkSync(path.join(project, '.claude'), path.join(project, '.claude', 'skills', 'loop'), 'dir');
  } catch (err) {
    t.skip(`cannot make links here (${err.code})`);
    return;
  }
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')];
  const check = run(['pin', '--check', project, ...scope], { cwd: project });
  assert.equal(check.status, 1);
  assert.equal(check.stdout.split('\n').filter((l) => l.startsWith('no digest')).length, 1, `one translation, through either link, the loop ended: ${check.stdout}`);
  const r = run(['pin', project, ...scope], { cwd: project });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(translation, 'utf8'), /skill-atlas:source sha256=/, 'the translation found through a link pinned');
  assert.equal(run(['pin', '--check', project, ...scope], { cwd: project }).status, 0);
  fs.symlinkSync(path.join(tmp, 'pin-linked-nowhere'), path.join(project, '.agents', 'skills', 'gone'), 'dir');
  const dangling = run(['pin', '--check', project, ...scope], { cwd: project });
  assert.equal(dangling.status, 1);
  assert.match(dangling.stdout, /^broken link .*gone \(it cannot be followed\)$/m, 'the link named');
  const refused = run(['pin', project, ...scope], { cwd: project });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /gone: it is a link that cannot be followed/);
});

test('the repair command a translation insight gives runs as given, from another folder, for a skill found through --root (skill-atlas-5, skill-atlas-28)', (t) => {
  if (process.platform === 'win32') return t.skip('the command is a POSIX shell command');
  const home = path.join(tmp, 'repair-home');
  const project = path.join(tmp, 'repair-project');
  const elsewhere = path.join(tmp, 'repair-elsewhere');
  const extra = path.join(tmp, 'repair extra');
  const state = path.join(project, 'state');
  const skill = path.join(extra, 'fixme');
  writeSkill(skill, `${fm('fixme', 'Fix me.')}\nText.\n`);
  fs.mkdirSync(path.join(skill, 'references'), { recursive: true });
  fs.writeFileSync(path.join(skill, 'references', 'a.md'), '# A\n');
  fs.writeFileSync(path.join(skill, 'references', 'my file.md'), '# B\n');
  fs.writeFileSync(path.join(skill, 'SKILL.zh-CN.md'), `${fm('fixme', '\u4FEE\u3002')}${record('0'.repeat(64))}\n\u6587\u3002\n`);
  fs.writeFileSync(path.join(skill, 'references', 'a.zh-CN.md'), `${mdRecord(sha(path.join(skill, 'references', 'a.md')), '1'.repeat(64))}\n# A\n`);
  const inState = path.join(state, 'translations', 'fixme', 'references', 'my file.ja.md');
  fs.mkdirSync(path.dirname(inState), { recursive: true });
  fs.writeFileSync(inState, `${record('2'.repeat(64))}\n# B\n`);
  for (const dir of [home, elsewhere, project]) fs.mkdirSync(dir, { recursive: true });
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
  const insights = () => {
    const r = run(['scan', '--cwd', project, '--root', extra, '--no-plugins', '--state', state], { cwd: elsewhere, env });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).insights.filter((i) => i.kind === 'stale-translation' || i.kind === 'edited-translation');
  };
  const quote = (p) => `'${p.replace(/'/g, `'\\''`)}'`;
  const found = insights();
  assert.equal(found.length, 3, 'behind in the skill\'s folder, edited there, and behind in the state folder');
  const shipped = fs.readFileSync(path.join(skill, 'SKILL.zh-CN.md'), 'utf8');
  for (const i of found) {
    const [command, instead] = i.message.slice(i.message.lastIndexOf(' run ') + ' run '.length).split(', or, where the skill\'s folder is the user\'s own to edit, ');
    assert.ok(command.startsWith('node <skill-dir>/scripts/atlas.mjs pin --state <state> '), command);
    if (i.kind === 'stale-translation') {
      // The refresh is written where the message says, and that file alone pinned.
      for (const rel of i.params.files) {
        const refreshed = path.join(state, 'translations', 'fixme', ...rel.split('/'));
        const word = `translations/fixme/${rel}`;
        assert.ok(command.endsWith(` <state>/${/^[\w@%+=:,./-]+$/.test(word) ? word : quote(word)}`), `pins the refreshed file: ${command}`);
        if (!fs.existsSync(refreshed)) {
          assert.equal(instead, `bring ${quote(path.join(skill, ...rel.split('/')))} in line with its source there and pin it instead`, 'the installed file named as the alternative');
          fs.mkdirSync(path.dirname(refreshed), { recursive: true });
          fs.copyFileSync(path.join(skill, ...rel.split('/')), refreshed);
        } else assert.equal(instead, undefined, 'no alternative for a translation already in the state folder');
      }
    }
    assert.ok(command.includes(` --cwd ${project} `) && command.includes(` --root ${quote(extra)} `) && command.includes(' --no-plugins '), `the scan's own options: ${command}`);
    // Run in a shell exactly as given, with only <skill-dir> and <state> filled in.
    const given = command.replaceAll('<skill-dir>', quote(path.dirname(path.dirname(CLI)))).replaceAll('<state>', quote(state));
    const r = spawnSync('/bin/sh', ['-c', given], { cwd: elsewhere, encoding: 'utf8', timeout: CLI_TIMEOUT_MS, env: { ...process.env, ...env } });
    assert.equal(r.status, 0, `${i.message}\n${r.stdout}${r.stderr}`);
  }
  assert.deepEqual(insights(), [], 'each command pinned its translation');
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.zh-CN.md'), 'utf8'), shipped, 'the installed translation left as it was, its refresh in the state folder standing in its place');
});

test('--help names the script by a path that runs from the user\'s project', () => {
  const elsewhere = path.join(tmp, 'help-project');
  fs.mkdirSync(elsewhere, { recursive: true });
  const r = run(['--help'], { cwd: elsewhere });
  assert.equal(r.status, 0, r.stderr);
  const usage = /^Usage: node (.+) <command> \[options\]$/m.exec(r.stdout);
  assert.ok(usage, r.stdout.split('\n')[0]);
  assert.ok(path.isAbsolute(usage[1]) && fs.statSync(usage[1]).isFile(), `the usage line names the script itself: ${usage[1]}`);
  const again = spawnSync(process.execPath, [usage[1], '--help'], { cwd: elsewhere, encoding: 'utf8' });
  assert.equal(again.status, 0, 'the usage line\'s command runs from the project');
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

test('digest prints every readable file\'s line whole through a pipe before failing on one it cannot read (skill-atlas-32)', () => {
  const dir = path.join(tmp, 'digest-many');
  fs.mkdirSync(dir, { recursive: true });
  const files = Array.from({ length: 1500 }, (_, i) => path.join(dir, `file-${String(i).padStart(4, '0')}.md`));
  files.forEach((f, i) => fs.writeFileSync(f, `${i}\n`));
  const missing = path.join(dir, 'missing.md');
  const r = run(['digest', ...files, missing]); // stdout is a pipe
  assert.ok(Buffer.byteLength(r.stdout) > 64 * 1024, 'more than one pipe buffer of output');
  assert.deepEqual(r.stdout.split('\n'), [...files.map((f) => `${sha(f)}  ${f}`), ''], 'every readable file\'s line, whole');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes(missing), 'the unreadable file named on stderr');
});

// A pipelines document of phases with no note, as large as fits in `max` bytes sent compact.
function notelessPipelines(max) {
  const phases = [];
  const doc = { version: 1, active: null, pipelines: [{ id: 'w', name: 'W', phases }] };
  let size = JSON.stringify(doc).length;
  for (;;) {
    const phase = { id: `p${phases.length}`, name: '', skills: [] };
    const more = JSON.stringify(phase).length + (phases.length ? 1 : 0);
    if (size + more > max) return doc;
    phases.push(phase);
    size += more;
  }
}

test('a pipelines document over the limit as stored is refused, and a stored one over it reported (skill-atlas-31, skill-atlas-12)', () => {
  const state = path.join(tmp, 'cli-pipelines-size-state');
  const file = path.join(tmp, 'cli-pipelines-size.json');
  const read = () => run(['pipelines', '--state', state]);
  // Phases with no note, sent compact just under 1 MiB: stored with every note filled in and indented, it is over.
  const doc = notelessPipelines(1024 * 1024);
  fs.writeFileSync(file, JSON.stringify(doc));
  assert.ok(fs.statSync(file).size <= 1024 * 1024);
  const put = run(['pipelines', '--put', file, '--if-match', 'none', '--state', state]);
  assert.notEqual(put.status, 0, 'refused, so no document read can be over the limit when saved again');
  assert.match(put.stderr, /bytes as stored, over the 1 MiB limit/);
  assert.ok(!fs.existsSync(path.join(state, 'pipelines.json')), 'nothing written');
  // A valid stored file over the limit as a save stores it is reported, never offered for edits no save takes.
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'pipelines.json'), JSON.stringify(doc));
  const big = read();
  assert.notEqual(big.status, 0);
  assert.ok(big.stderr.includes(path.join(state, 'pipelines.json')) && /over the 1 MiB limit/.test(big.stderr), big.stderr);
});

test('pin passes over a file its source links to, refuses it named, and writes nothing into it (skill-atlas-28)', (t) => {
  const project = path.join(tmp, 'pin-self');
  const dir = path.join(project, 'self');
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  const own = path.join(dir, 'SKILL.en.md');
  fs.writeFileSync(own, `${fm('self', 'Written in English.')}\nText.\n`);
  fs.writeFileSync(path.join(dir, 'references', 'r.md'), '# R\n');
  fs.writeFileSync(path.join(dir, 'references', 'r.zh-CN.md'), '# R zh\n');
  try {
    fs.symlinkSync('SKILL.en.md', path.join(dir, 'SKILL.md'));
  } catch (err) {
    t.skip(`cannot make links here (${err.code})`);
    return;
  }
  const before = fs.readFileSync(own);
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')];
  const pinned = run(['pin', dir, ...scope]);
  assert.equal(pinned.status, 0, pinned.stderr);
  assert.match(pinned.stdout, /passed over .*SKILL\.en\.md \(SKILL\.md beside it is a link to it/);
  assert.match(pinned.stdout, /pinned {6}.*r\.zh-CN\.md/, 'the folder\'s translation pinned');
  assert.deepEqual(fs.readFileSync(own), before, 'the source itself is never written');
  const check = run(['pin', '--check', dir, ...scope]);
  assert.equal(check.status, 0, `nothing behind: ${check.stdout}`);
  const named = run(['pin', own, ...scope]);
  assert.notEqual(named.status, 0);
  assert.match(named.stderr, /is not a translation: SKILL\.md beside it is a link to it/);
  assert.deepEqual(fs.readFileSync(own), before);
});

test('pin passes over a file hard-linked to its source and fails on a translation that is itself a source, writing nothing (skill-atlas-28)', (t) => {
  const project = path.join(tmp, 'pin-sources');
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')];
  const hard = path.join(project, 'hard');
  fs.mkdirSync(hard, { recursive: true });
  fs.writeFileSync(path.join(hard, 'SKILL.md'), `${fm('hard', 'Written in English.')}\n# H\n`);
  fs.writeFileSync(path.join(hard, 'SKILL.zh-CN.md'), `${fm('hard', '中文。')}\n# 中\n`);
  // One skill's SKILL.ja.md leading to its own guide, and another's to a third skill's SKILL.md.
  const one = path.join(project, 'one');
  fs.mkdirSync(path.join(one, 'references'), { recursive: true });
  fs.writeFileSync(path.join(one, 'SKILL.md'), `${fm('one', 'One.')}\n# One\n`);
  fs.writeFileSync(path.join(one, 'references', 'guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(one, 'references', 'guide.zh-CN.md'), '# 指南\n');
  const [x, y] = ['x', 'y'].map((n) => path.join(project, n));
  for (const dir of [x, y]) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'SKILL.md'), `${fm(path.basename(dir), 'A skill.')}\n# S\n`); }
  fs.writeFileSync(path.join(y, 'SKILL.zh-CN.md'), `${fm('y', '技能。')}\n# 技\n`);
  try {
    fs.linkSync(path.join(hard, 'SKILL.md'), path.join(hard, 'SKILL.en.md'));
    fs.symlinkSync(path.join('references', 'guide.md'), path.join(one, 'SKILL.ja.md'));
    fs.symlinkSync(path.join('..', 'y', 'SKILL.md'), path.join(x, 'SKILL.ja.md'));
  } catch (err) {
    t.skip(`cannot make links here (${err.code})`);
    return;
  }
  const sources = [path.join(hard, 'SKILL.md'), path.join(one, 'references', 'guide.md'), path.join(y, 'SKILL.md')];
  const bytes = () => sources.map((f) => fs.readFileSync(f, 'utf8'));
  const before = bytes();
  const hardPin = run(['pin', hard, ...scope]);
  assert.equal(hardPin.status, 0, hardPin.stderr);
  assert.match(hardPin.stdout, /passed over .*SKILL\.en\.md \(SKILL\.md beside it is a link to it/, 'a hard link to its source is that source itself');
  assert.match(hardPin.stdout, /pin: 1 of 1 translations recorded/);
  assert.equal(run(['pin', '--check', hard, ...scope]).status, 0, 'nothing behind once pinned');
  const hardNamed = run(['pin', path.join(hard, 'SKILL.en.md'), ...scope]);
  assert.match(hardNamed.stderr, /is not a translation: SKILL\.md beside it is a link to it/);
  for (const targets of [[one], [y, x], [x]]) {
    const pinned = run(['pin', ...targets, ...scope]);
    assert.notEqual(pinned.status, 0, `${targets}: ${pinned.stdout}`);
    assert.match(pinned.stderr, /SKILL\.ja\.md: it is the same file as .*, no translation of .*; writing its record would change/);
    assert.match(pinned.stderr, /no translation was changed/);
    const check = run(['pin', '--check', ...targets, ...scope]);
    assert.equal(check.status, 1);
    assert.match(check.stdout, /^same file {3}.*SKILL\.ja\.md/m);
    assert.doesNotMatch(check.stdout, /^behind/m, 'no source changed under its translation');
  }
  assert.match(run(['pin', x, ...scope]).stderr, /the same file as \S*y[\\/]SKILL\.md/, 'the other skill\'s SKILL.md named');
  assert.deepEqual(bytes(), before, 'no source written');
});

test('pin and pin --check fail, naming both, on one file reached as the translation of two sources, writing nothing (skill-atlas-28)', (t) => {
  const project = path.join(tmp, 'pin-shared');
  const shared = path.join(project, 'shared', 'doc.zh-CN.md');
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  fs.writeFileSync(shared, '# 文档\n');
  for (const n of ['b', 'c']) {
    fs.mkdirSync(path.join(project, n), { recursive: true });
    fs.writeFileSync(path.join(project, n, 'doc.md'), `# ${n}\n`);
  }
  const other = path.join(project, 'b', 'other.zh-CN.md');
  fs.writeFileSync(path.join(project, 'b', 'other.md'), '# Other\n');
  fs.writeFileSync(other, '# 其他\n');
  try {
    for (const n of ['b', 'c']) fs.symlinkSync(path.join('..', 'shared', 'doc.zh-CN.md'), path.join(project, n, 'doc.zh-CN.md'));
  } catch (err) {
    t.skip(`cannot make links here (${err.code})`);
    return;
  }
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state')];
  const bytes = () => [fs.readFileSync(shared, 'utf8'), fs.readFileSync(other, 'utf8')];
  const before = bytes();
  const pinned = run(['pin', path.join(project, 'b'), path.join(project, 'c'), ...scope]);
  assert.notEqual(pinned.status, 0);
  assert.ok(pinned.stderr.includes(path.join(project, 'b', 'doc.md')) && pinned.stderr.includes(path.join(project, 'c', 'doc.md')), `both sources named: ${pinned.stderr}`);
  assert.match(pinned.stderr, /no translation was changed/);
  assert.deepEqual(bytes(), before, 'no file written, the other translation included');
  const check = run(['pin', '--check', path.join(project, 'b'), path.join(project, 'c'), ...scope]);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /^two sources .*doc\.zh-CN\.md/m);
  assert.deepEqual(bytes(), before);
});

test('pin tells what a translation translates by the name it is reached by, and writes none that is the same file as a file of a skill it involves (skill-atlas-28)', (t) => {
  const project = path.join(tmp, 'pin-identity');
  const state = path.join(project, 'state');
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', state];
  const skills = path.join(project, '.claude', 'skills');
  // A reference's translation hard-linked to the skill's SKILL.md, its source beside it.
  const ident = path.join(skills, 'ident');
  writeSkill(ident, `${fm('ident', 'Ident.')}\n## One\nDo it.\n`);
  fs.mkdirSync(path.join(ident, 'references'), { recursive: true });
  fs.writeFileSync(path.join(ident, 'references', 'guide.md'), '# Guide\n');
  const guideZh = path.join(ident, 'references', 'guide.zh.md');
  // One translation hard-linked to the translation of another source.
  const pair = path.join(skills, 'pair');
  writeSkill(pair, `${fm('pair', 'Pair.')}\n## One\nDo it.\n`);
  fs.mkdirSync(path.join(pair, 'references'), { recursive: true });
  for (const n of ['a', 'b']) fs.writeFileSync(path.join(pair, 'references', `${n}.md`), `# ${n}\n`);
  const aZh = path.join(pair, 'references', 'a.zh-CN.md');
  fs.writeFileSync(aZh, '# 甲\n');
  const bZh = path.join(pair, 'references', 'b.zh-CN.md');
  // A state folder's translation reached by its tagged name through a link to a file of another name there.
  const stately = path.join(skills, 'stately');
  writeSkill(stately, `${fm('stately', 'Stately.')}\n## One\nDo it.\n`);
  const id = scanJson(project, [], state).atlas.skills.find((s) => s.name === 'stately').id;
  const stateDir = path.join(state, 'translations', id);
  fs.mkdirSync(stateDir, { recursive: true });
  const body = path.join(stateDir, 'body.md');
  fs.writeFileSync(body, `${fm('stately', '庄重。')}\n## 一\nDo it.\n`);
  try {
    fs.linkSync(path.join(ident, 'SKILL.md'), guideZh);
    fs.linkSync(aZh, bZh);
    fs.symlinkSync('body.md', path.join(stateDir, 'SKILL.zh-CN.md'));
  } catch (err) {
    t.skip(`cannot make links here (${err.code})`);
    return;
  }
  const skillMd = fs.readFileSync(path.join(ident, 'SKILL.md'), 'utf8');
  for (const target of [ident, guideZh]) {
    const pinned = run(['pin', target, ...scope]);
    assert.notEqual(pinned.status, 0, pinned.stdout);
    assert.match(pinned.stderr, /guide\.zh\.md: it is the same file as \S*ident[\\/]SKILL\.md, no translation of \S*guide\.md/, 'both files named');
    assert.match(pinned.stderr, /no translation was changed/);
    assert.equal(fs.readFileSync(path.join(ident, 'SKILL.md'), 'utf8'), skillMd, 'the skill\'s instructions never written');
  }
  const check = run(['pin', '--check', ident, ...scope]);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /^same file {3}.*guide\.zh\.md/m);
  const pairPin = run(['pin', bZh, ...scope]);
  assert.notEqual(pairPin.status, 0);
  assert.match(pairPin.stderr, /b\.zh-CN\.md: it is the same file as \S*a\.zh-CN\.md/, 'a translation of another source is a file it may not change');
  assert.equal(fs.readFileSync(aZh, 'utf8'), '# 甲\n');
  // The state folder's: what the scan reads it as, pin writes it as.
  const statePin = run(['pin', stateDir, ...scope]);
  assert.equal(statePin.status, 0, statePin.stderr);
  assert.match(statePin.stdout, /pinned {6}.*SKILL\.zh-CN\.md/);
  assert.ok(fs.readFileSync(body, 'utf8').includes(`sha256=${sha(path.join(stately, 'SKILL.md'))}`), 'the digest of the SKILL.md its name translates');
  const tr = scanJson(project, [], state).atlas.skills.find((s) => s.name === 'stately').translations['zh-CN'];
  assert.deepEqual([tr.origin, tr.stale], ['state', false], 'the scan reads it as pinned');
  assert.equal(run(['pin', '--check', path.join(stateDir, 'SKILL.zh-CN.md'), ...scope]).status, 0);
});

test('pin writes no translation hard-linked to a file of another skill, of a folder it passes over, outside every folder it reads, or to a state translation of another source (skill-atlas-28)', (t) => {
  const project = path.join(tmp, 'pin-hard-links');
  const state = path.join(project, 'state');
  const scope = ['--cwd', project, '--no-user', '--no-plugins', '--state', state];
  const skills = path.join(project, '.claude', 'skills');
  const alpha = path.join(skills, 'alpha');
  const beta = path.join(skills, 'beta');
  for (const [dir, name] of [[alpha, 'alpha'], [beta, 'beta']]) {
    writeSkill(dir, `${fm(name, `${name}.`)}\n## One\nDo it.\n`);
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'references', 'guide.md'), '# Guide\n');
  }
  fs.writeFileSync(path.join(alpha, 'README.md'), '# Alpha\n');
  const guideZh = path.join(alpha, 'references', 'guide.zh.md');
  const hidden = path.join(alpha, 'scripts', 'node_modules', 'x');
  fs.mkdirSync(hidden, { recursive: true });
  fs.writeFileSync(path.join(hidden, 'README.md'), '# Package\n');
  const outside = path.join(tmp, 'pin-hard-links-outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'notes.md'), '# Notes\n');
  const stateDir = path.join(state, 'translations', 'alpha');
  fs.mkdirSync(stateDir, { recursive: true });
  const readmeZh = path.join(stateDir, 'README.zh.md');
  fs.writeFileSync(readmeZh, '# 甲\n');
  const unchanged = (file, text) => assert.equal(fs.readFileSync(file, 'utf8'), text, `${file} unchanged`);
  const cases = [
    [path.join(beta, 'SKILL.md'), /beta[\\/]SKILL\.md, no translation of/, 'another scanned skill\'s SKILL.md, named'],
    [path.join(hidden, 'README.md'), /a hard link to a file pin does not find/, 'a file under node_modules, which pin does not read'],
    [path.join(outside, 'notes.md'), /a hard link to a file pin does not find/, 'a file outside every folder pin reads'],
  ];
  for (const [other, said, why] of cases) {
    const text = fs.readFileSync(other, 'utf8');
    fs.rmSync(guideZh, { force: true });
    try { fs.linkSync(other, guideZh); } catch (err) { t.skip(`cannot make hard links here (${err.code})`); return; }
    for (const target of [alpha, guideZh]) {
      const pinned = run(['pin', target, ...scope]);
      assert.notEqual(pinned.status, 0, `${why}: ${pinned.stdout}`);
      assert.match(pinned.stderr, said, why);
      assert.match(pinned.stderr, /no translation was changed/);
      unchanged(other, text);
    }
    const check = run(['pin', '--check', guideZh, ...scope]);
    assert.equal(check.status, 1, why);
    assert.match(check.stdout, /^same file {3}.*guide\.zh\.md/m, why);
  }
  fs.rmSync(guideZh);
  // A state translation that is the same file as a state translation of another source.
  const skillZh = path.join(stateDir, 'SKILL.zh.md');
  fs.linkSync(readmeZh, skillZh);
  const statePin = run(['pin', skillZh, ...scope]);
  assert.notEqual(statePin.status, 0, statePin.stdout);
  assert.match(statePin.stderr, /SKILL\.zh\.md: it is the same file as \S*README\.zh\.md, no translation of \S*SKILL\.md/, 'both named');
  unchanged(readmeZh, '# 甲\n');
  // Two names translating one source are one translation, written once.
  fs.rmSync(skillZh);
  const twin = path.join(alpha, 'README.zh.md');
  fs.linkSync(readmeZh, twin);
  const both = run(['pin', readmeZh, ...scope]);
  assert.equal(both.status, 0, both.stderr);
  assert.ok(fs.readFileSync(twin, 'utf8').includes(`sha256=${sha(path.join(alpha, 'README.md'))}`));
});

test('the page chooses a catalog and label files by the rule the server chooses a file\'s translation by (skill-atlas-29, skill-atlas-10)', () => {
  // The page's own rule, read from the shipped viewer, checked against the case where file
  // name order and tag order differ: `zh-Hans.json` sorts before `zh.json`, `zh` before `zh-Hans`.
  const html = fs.readFileSync(path.join(REPO, 'skills', 'skill-atlas', 'assets', 'viewer.html'), 'utf8');
  const code = /\n {2}const primary = [\s\S]*?\n {2}function matchTag\([\s\S]*?\n {2}\}\n/.exec(html);
  assert.ok(code, 'the page defines matchTag after primary');
  const matchTag = new Function('str', `${code[0]}; return matchTag;`)((v) => (v == null ? '' : String(v)));
  assert.equal(matchTag('zh-SG', ['en-US', 'zh-Hans', 'zh']), 'zh', 'the first of the same language and script in order of the tags');
  assert.equal(matchTag('zh-CN', ['zh-TW', 'zh-Hant']), null, 'never another script');
  assert.equal(matchTag('zh-hans', ['zh', 'zh-Hans']), 'zh-Hans', 'the tag itself first');
  // The catalogs and label files the page is handed, from a copy of the skill holding both tags.
  const copy = path.join(tmp, 'tag-order-skill');
  fs.cpSync(path.dirname(path.dirname(CLI)), copy, { recursive: true });
  const zh = fs.readFileSync(path.join(copy, 'assets', 'locales', 'zh-CN.json'), 'utf8');
  const labels = fs.readFileSync(path.join(copy, 'references', 'view-settings.zh-CN.json'), 'utf8');
  for (const tag of ['zh-Hans', 'zh']) {
    fs.writeFileSync(path.join(copy, 'assets', 'locales', `${tag}.json`), zh);
    fs.writeFileSync(path.join(copy, 'references', `view-settings.${tag}.json`), labels);
  }
  const out = path.join(tmp, 'tag-order.html');
  const r = spawnSync(process.execPath, [path.join(copy, 'scripts', 'atlas.mjs'), 'export', '--out', out, '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(tmp, 'tag-order-state')], { encoding: 'utf8', timeout: CLI_TIMEOUT_MS });
  assert.equal(r.status, 0, r.stderr);
  const { config } = JSON.parse(/<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(out, 'utf8'))[1]);
  assert.deepEqual(Object.keys(config.locales).filter((k) => k.startsWith('zh')), ['zh', 'zh-CN', 'zh-Hans'], 'catalogs in order of their tags');
  assert.equal(matchTag('zh-SG', ['en-US', ...Object.keys(config.locales).filter((k) => k !== 'zh-CN')]), 'zh', 'a zh-SG reader gets the zh catalog');
  assert.equal(matchTag('zh-SG', Object.keys(config.labels).filter((k) => k !== 'zh-CN')), 'zh', 'and the zh label files');
});

test('the page reads each label file under its own tag, so one file\'s tag never hides another\'s (skill-atlas-29, skill-atlas-23)', () => {
  const html = fs.readFileSync(path.join(REPO, 'skills', 'skill-atlas', 'assets', 'viewer.html'), 'utf8');
  const tagRule = /\n {2}const primary = [\s\S]*?\n {2}function matchTag\([\s\S]*?\n {2}\}\n/.exec(html);
  const choice = /\n {2}function applyLang\(tag\) \{[\s\S]*?\n {2}const labelText = [^\n]*\n/.exec(html);
  assert.ok(tagRule && choice, 'the page defines matchTag, applyLang and labelsOf');
  // Custom tag rules with a zh label file beside them, the shipped zh-CN presets and view settings.
  const dir = path.join(tmp, 'rules-zh');
  fs.mkdirSync(dir, { recursive: true });
  const refs = path.join(REPO, 'skills', 'skill-atlas', 'references');
  fs.copyFileSync(path.join(refs, 'tag-rules.json'), path.join(dir, 'rules.json'));
  const zh = JSON.parse(fs.readFileSync(path.join(refs, 'tag-rules.zh-CN.json'), 'utf8'));
  const id = zh.tags[0].id;
  zh.tags[0].label = 'ZH-CUSTOM';
  fs.writeFileSync(path.join(dir, 'rules.zh.json'), JSON.stringify(zh));
  const out = path.join(tmp, 'rules-zh.html');
  const r = run(['export', '--out', out, '--lang', 'zh-CN', '--rules', path.join(dir, 'rules.json'), '--cwd', P, '--no-user', '--no-plugins', '--state', path.join(tmp, 'rules-zh-state')]);
  assert.equal(r.status, 0, r.stderr);
  const { config } = JSON.parse(/<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(out, 'utf8'))[1]);
  assert.deepEqual(Object.keys(config.labels.zh), ['tags'], 'a tag holds the fields of its own label files alone');
  const page = new Function('labels', `const SOURCE_LANG = 'en-US'; const str = (v) => (v == null ? '' : String(v));
    const own = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
    const document = { documentElement: {} }; const i18n = { locales: {}, labels };
    ${tagRule[0]}${choice[0]}; return { applyLang, labelsOf };`)(config.labels);
  page.applyLang('zh-CN');
  assert.equal(page.labelsOf('tags')[id], 'ZH-CUSTOM', 'the tag rules\' labels under zh');
  assert.deepEqual(page.labelsOf('presets'), config.labels['zh-CN'].presets, 'the presets\' under zh-CN');
  assert.equal(page.labelsOf('title'), config.labels['zh-CN'].title);
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

  const WF = () => path.join(state, 'pipelines.json');
  const wfDoc = (name) => ({ version: 1, active: 'w', pipelines: [{ id: 'w', name, phases: [{ id: 'p1', name: 'One', skills: ['alpha', 'gone'] }] }] });
  const put = (doc, extra = {}) => request({ method: 'PUT', pathname: '/api/pipelines', headers: { ...json, ...extra }, body: typeof doc === 'string' ? doc : JSON.stringify(doc) });

  test('saves pipelines only against the version last read', async () => {
    const first = await request({ pathname: '/api/pipelines' });
    assert.equal(first.status, 200);
    assert.equal(first.headers.etag, '"none"', 'no stored file');
    assert.deepEqual(JSON.parse(first.text), { version: 1, active: null, pipelines: [] });

    assert.equal((await put(wfDoc('W'))).status, 428, 'a save without If-Match');
    assert.ok(!fs.existsSync(WF()));

    const saved = await put(wfDoc('W'), { 'If-Match': first.headers.etag });
    assert.equal(saved.status, 200, saved.text);
    const bytes = fs.readFileSync(WF());
    const stored = JSON.parse(bytes.toString('utf8'));
    assert.equal(saved.headers.etag, `"${crypto.createHash('sha256').update(bytes).digest('hex')}"`);
    assert.equal(stored.pipelines[0].phases[0].note, '', 'a missing note is stored as ""');
    assert.deepEqual(stored.pipelines[0].phases[0].skills, ['alpha', 'gone'], 'an id with no skill is kept');
    if (process.platform !== 'win32') assert.equal(fs.statSync(state).mode & 0o777, 0o700);

    const again = await request({ pathname: '/api/pipelines' });
    assert.deepEqual(JSON.parse(again.text), stored);
    assert.equal(again.headers.etag, saved.headers.etag);

    const stale = await put(wfDoc('Stale'), { 'If-Match': first.headers.etag });
    assert.equal(stale.status, 412);
    assert.equal(JSON.parse(stale.text).error, 'changed');
    assert.equal(stale.headers.etag, saved.headers.etag, 'the refusal names the current version');
    assert.deepEqual(fs.readFileSync(WF()), bytes, 'nothing written');

    const ifMatch = { 'If-Match': saved.headers.etag };
    const bad = await put({ version: 1, active: 'nope', pipelines: [] }, ifMatch);
    assert.equal(bad.status, 400);
    assert.match(JSON.parse(bad.text).message, /active/);
    assert.equal((await put({ version: 2, active: null, pipelines: [] }, ifMatch)).status, 400, 'another version');
    assert.equal((await put('{ nope', ifMatch)).status, 400);
    assert.deepEqual(fs.readFileSync(WF()), bytes, 'a refused document leaves the stored one');
    assert.equal((await put(wfDoc('W'), { 'X-Skill-Atlas-Replace-Invalid': '1' })).status, 409, 'a valid file is not replaced as invalid');
  });

  test('reports an unreadable stored file and replaces it only on request, keeping it', async () => {
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(WF(), '{ broken');
    fs.writeFileSync(path.join(state, 'pipelines.invalid-1.json'), 'an earlier one');
    const got = await request({ pathname: '/api/pipelines' });
    assert.equal(got.status, 409);
    const body = JSON.parse(got.text);
    assert.equal(body.error, 'invalid-pipelines');
    assert.equal(body.path, WF());
    assert.equal((await put(wfDoc('W'), { 'If-Match': '"none"' })).status, 409, 'an ordinary save does not overwrite it');
    assert.equal(fs.readFileSync(WF(), 'utf8'), '{ broken');

    fs.writeFileSync(WF(), JSON.stringify({ version: 1, active: null, pipelines: 'nope' }));
    assert.equal((await request({ pathname: '/api/pipelines' })).status, 409, 'a file of the wrong shape is invalid too');

    const replaced = await put(wfDoc('Fresh'), { 'X-Skill-Atlas-Replace-Invalid': '1' });
    assert.equal(replaced.status, 200, replaced.text);
    assert.equal(JSON.parse(fs.readFileSync(WF(), 'utf8')).pipelines[0].name, 'Fresh');
    assert.equal(fs.readFileSync(path.join(state, 'pipelines.invalid-1.json'), 'utf8'), 'an earlier one');
    assert.match(fs.readFileSync(path.join(state, 'pipelines.invalid-2.json'), 'utf8'), /"nope"/, 'the invalid file kept beside it');
    assert.equal(replaced.headers.etag, (await request({ pathname: '/api/pipelines' })).headers.etag);
  });

  test('returns edited presets and view settings on the next read', async () => {
    const presetsFile = path.join(copy, 'references', 'pipeline-presets.json');
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
    write(path.join(refs, 'pipeline-presets.zh-CN.json'), { version: 1, presets: [{ id: 'sdlc', name: 'S-ZH', description: 'D-ZH', phases: [{ name: 'P1', keywords: ['x'] }, { name: 'P2' }] }] });
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

  test('returns a translation under a tag of the same language and script where none is under the tag asked (skill-atlas-10)', async () => {
    const lang = async (rel, tag) => JSON.parse((await request({ pathname: `/api/file?skill=alpha&path=${encodeURIComponent(rel)}&lang=${tag}` })).text);
    const dir = path.join(CLAUDE, 'alpha');
    const made = ['notes.md', 'notes.zh.md', 'notes.zh-Hant.md'].map((n) => path.join(dir, n));
    for (const f of made) fs.writeFileSync(f, `# ${path.basename(f)}\n`);
    try {
      for (const tag of ['zh-CN', 'zh-SG', 'zh-Hans']) {
        const got = await lang('notes.md', tag);
        assert.deepEqual([got.language, got.path], ['zh', 'notes.zh.md'], `${tag} takes zh`);
      }
      for (const tag of ['zh-TW', 'zh-HK']) assert.equal((await lang('notes.md', tag)).language, 'zh-Hant', `${tag} takes zh-Hant, never zh`);
      assert.equal((await lang('notes.md', 'ja')).language, null, 'another language: the original');
      const exact = path.join(dir, 'notes.zh-CN.md');
      made.push(exact);
      fs.writeFileSync(exact, '# exact\n');
      assert.deepEqual([(await lang('notes.md', 'zh-CN')).language, (await lang('notes.md', 'zh-SG')).language], ['zh-CN', 'zh'], 'the tag asked first, then the first compatible in name order');
    } finally {
      for (const f of made) fs.rmSync(f, { force: true });
    }
  });

  test('returns the state folder\'s translation where only the skill folder\'s is behind its source (skill-atlas-10, skill-atlas-27)', async () => {
    const ask = async (rel) => JSON.parse((await request({ pathname: `/api/file?skill=gamma&path=${encodeURIComponent(rel)}&lang=zh-CN` })).text);
    const dir = path.join(CLAUDE, 'gamma');
    const stateDir = path.join(state, 'translations', 'gamma');
    const own = path.join(dir, 'SKILL.zh-CN.md');
    const theirs = path.join(stateDir, 'SKILL.zh-CN.md');
    const ownZh = path.join(dir, 'SKILL.zh.md');
    const theirsHans = path.join(stateDir, 'SKILL.zh-Hans.md');
    fs.mkdirSync(stateDir, { recursive: true });
    const hex = sha(path.join(dir, 'SKILL.md'));
    try {
      fs.writeFileSync(own, `${record('0'.repeat(64))}\n# own\n`);
      fs.writeFileSync(theirs, `${record(hex)}\n# state\n`);
      const got = await ask('SKILL.md');
      assert.deepEqual([got.text.endsWith('# state\n'), got.stale], [true, false], 'the state folder\'s, not behind');
      fs.writeFileSync(theirs, `${record('1'.repeat(64))}\n# state\n`);
      const both = await ask('SKILL.md');
      assert.deepEqual([both.text.endsWith('# own\n'), both.stale], [true, true], 'the skill folder\'s where both are behind');
      fs.writeFileSync(theirs, '# state, recording no digest\n');
      fs.writeFileSync(own, `${record('0'.repeat(64))}\n# own\n`);
      assert.deepEqual([(await ask('SKILL.md')).text.endsWith('# own\n')], [true], 'a state translation recording no digest never displaces the skill\'s own');
      fs.writeFileSync(own, `${record(hex)}\n# own\n`);
      fs.writeFileSync(theirs, `${record(hex)}\n# state\n`);
      assert.ok((await ask('SKILL.md')).text.endsWith('# own\n'), 'the skill folder\'s first');
      // Under two tags of the language and script, none the one asked: the first tag, then a folder within it alone.
      fs.rmSync(own);
      fs.rmSync(theirs);
      fs.writeFileSync(ownZh, `${record('0'.repeat(64))}\n# own zh\n`);
      fs.writeFileSync(theirsHans, `${record(hex)}\n# state zh-Hans\n`);
      const across = await ask('SKILL.md');
      assert.deepEqual([across.path, across.language, across.stale, across.text.endsWith('# own zh\n')], ['SKILL.zh.md', 'zh', true, true],
        'the first tag in order, behind as it is, never a current one under a later tag');
      const theirsZh = path.join(stateDir, 'SKILL.zh.md');
      fs.writeFileSync(theirsZh, `${record(hex)}\n# state zh\n`);
      const scanned = JSON.parse((await request({ method: 'POST', pathname: '/api/rescan', headers: json, body: '{}' })).text);
      const served = await ask('SKILL.md');
      assert.deepEqual([served.path, served.stale, served.text.endsWith('# state zh\n')], ['SKILL.zh.md', false, true], 'within that tag, the state folder\'s where the skill\'s is behind');
      const entry = scanned.skills.find((sk) => sk.id === 'gamma').translations.zh;
      assert.deepEqual([entry.origin, entry.file, entry.stale], ['state', theirsZh, served.stale], 'the scan\'s entry for the tag is the file served');
    } finally {
      fs.rmSync(ownZh, { force: true });
      fs.rmSync(own, { force: true });
      fs.rmSync(stateDir, { recursive: true, force: true });
      await request({ method: 'POST', pathname: '/api/rescan', headers: json, body: '{}' });
    }
  });

  test('says the language of the original it returns, a file judged by its own text (skill-atlas-29)', async () => {
    const dir = path.join(CLAUDE, 'alpha');
    const zh = path.join(dir, 'notes-zh.md');
    fs.writeFileSync(zh, '# \u7B14\u8BB0\n\n\u8FD9\u662F\u4E00\u4EFD\u4E2D\u6587\u7B14\u8BB0\u3002\n');
    try {
      const ask = async (rel, tag) => JSON.parse((await request({ pathname: `/api/file?skill=alpha&path=${encodeURIComponent(rel)}&lang=${tag}` })).text);
      assert.deepEqual([(await ask('SKILL.md', 'zh-CN')).sourceLanguage, (await ask('notes-zh.md', 'en-US')).sourceLanguage], ['en', 'zh']);
      const atlasNow = JSON.parse((await request({ pathname: '/api/atlas' })).text);
      assert.ok(atlasNow.skills.every((s) => typeof s.language === 'string'), 'every skill carries its language');
      assert.equal(skillOf(atlasNow, 'alpha').language, 'en');
    } finally {
      fs.rmSync(zh, { force: true });
    }
  });

  test('refuses a foreign Host and unmarked mutations', async () => {
    const foreign = await request({ pathname: '/api/atlas', headers: { Host: `evil.example:${port}` } });
    assert.equal(foreign.status, 403);
    const noHeader = await request({ method: 'PUT', pathname: '/api/pipelines', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    const wrongType = await request({ method: 'POST', pathname: '/api/rescan', headers: { 'X-Skill-Atlas': '1', 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415);
    const huge = await request({ method: 'PUT', pathname: '/api/pipelines', headers: json, body: 'x'.repeat(1024 * 1024 + 1) });
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

  test('names a file by the path asked, a link there read where it leads, and takes no file its source links to as a translation (skill-atlas-10, skill-atlas-27)', async (t) => {
    const readme = path.join(CLAUDE, 'readme', 'README.md');
    const self = path.join(CLAUDE, 'selflink');
    fs.mkdirSync(path.dirname(readme), { recursive: true });
    fs.mkdirSync(self, { recursive: true });
    fs.writeFileSync(readme, `---\nname: readme\ndescription: Read me.\nmetadata:\n  language: ja\n---\nPlain English text.\n`);
    fs.writeFileSync(path.join(CLAUDE, 'readme', 'SKILL.zh-CN.md'), '# skill zh\n');
    fs.writeFileSync(path.join(CLAUDE, 'readme', 'README.zh-CN.md'), '# readme zh\n');
    fs.writeFileSync(path.join(self, 'SKILL.en.md'), `${fm('selflink', 'Self.')}\nText.\n`);
    try {
      try {
        fs.symlinkSync('README.md', path.join(CLAUDE, 'readme', 'SKILL.md'));
        fs.symlinkSync('SKILL.en.md', path.join(self, 'SKILL.md'));
      } catch (err) {
        t.skip(`cannot make links here (${err.code})`);
        return;
      }
      const rescanned = JSON.parse((await request({ method: 'POST', pathname: '/api/rescan', headers: json, body: '{}' })).text);
      const ask = async (skill, rel, lang) => JSON.parse((await request({ pathname: `/api/file?skill=${skill}&path=${encodeURIComponent(rel)}&lang=${lang}` })).text);
      const skill = await ask('readme', 'SKILL.md', 'zh-CN');
      assert.deepEqual([skill.language, skill.path, skill.text], ['zh-CN', 'SKILL.zh-CN.md', '# skill zh\n'], 'SKILL.md\'s translation, as the card has it, not README.md\'s');
      assert.ok(skillOf(rescanned, 'readme').translations['zh-CN'], 'the card\'s');
      const original = await ask('readme', 'SKILL.md', 'de');
      assert.deepEqual([original.language, original.sourceLanguage, original.path], [null, 'ja', 'SKILL.md'], 'the original in the language SKILL.md declares, under its own name');
      assert.equal((await ask('readme', 'README.md', 'zh-CN')).path, 'README.zh-CN.md', 'README.md asked by its own name keeps its own');
      const selfAsked = await ask('selflink', 'SKILL.md', 'en');
      assert.deepEqual([selfAsked.language, selfAsked.path], [null, 'SKILL.md'], 'a file SKILL.md links to is SKILL.md itself, no translation of it');
      assert.deepEqual(Object.keys(skillOf(rescanned, 'selflink').translations), [], 'nor in the scan');
    } finally {
      fs.rmSync(path.join(CLAUDE, 'readme'), { recursive: true, force: true });
      fs.rmSync(self, { recursive: true, force: true });
      await request({ method: 'POST', pathname: '/api/rescan', headers: json, body: '{}' });
    }
  });

  test('refuses a document over the limit as stored, so a document read can always be saved again (skill-atlas-12)', async () => {
    const cur = await request({ pathname: '/api/pipelines' });
    assert.equal(cur.status, 200, cur.text);
    const doc = notelessPipelines(1024 * 1024);
    const { phases } = doc.pipelines[0];
    const before = fs.existsSync(WF()) ? fs.readFileSync(WF()) : null;
    const big = await put(doc, { 'If-Match': cur.headers.etag });
    assert.equal(big.status, 413, 'a body under 1 MiB whose stored form is over it');
    assert.match(JSON.parse(big.text).message, /as stored/);
    assert.deepEqual(fs.existsSync(WF()) ? fs.readFileSync(WF()) : null, before, 'the stored file stands');
    phases.length = Math.floor(phases.length / 4);
    const saved = await put(doc, { 'If-Match': cur.headers.etag });
    assert.equal(saved.status, 200, saved.text);
    const read = await request({ pathname: '/api/pipelines' });
    assert.equal((await put(read.text, { 'If-Match': read.headers.etag })).status, 200, 'the document as read saves again');
  });

  test('the page keeps a document the server accepts as it was served, so a document at the limit saves again from the page (skill-atlas-12)', async () => {
    // The page's own reading of the document, taken from the shipped viewer.
    const html = fs.readFileSync(path.join(REPO, 'skills', 'skill-atlas', 'assets', 'viewer.html'), 'utf8');
    const helpers = ['\n  const arr = ', '\n  const str = ', '\n  function slugify(', '\n  function uniqueId('].map((head) => {
      const at = html.indexOf(head);
      assert.ok(at >= 0, `the page defines ${head.trim()}`);
      return html.slice(at, html.indexOf('\n', at + 1));
    });
    const code = /\n {2}function normalizePipelines\(doc\) \{[\s\S]*?\n {2}\}\n/.exec(html);
    assert.ok(code, 'the page defines normalizePipelines');
    const normalize = new Function(`${helpers.join('')}${code[0]}; return normalizePipelines;`)();
    // As stored: each phase holding its note, two spaces deep.
    const stored = (doc) => Buffer.byteLength(JSON.stringify({ ...doc, pipelines: doc.pipelines.map((w) => ({ ...w, phases: w.phases.map((ph) => ({ ...ph, note: ph.note ?? '' })) })) }, null, 2)) + 1;
    const limit = 1024 * 1024;
    const doc = notelessPipelines(limit);
    doc.extra = { kept: true };
    doc.pipelines[0].name = '';
    doc.pipelines.push({ id: 'second', name: 'Second', phases: [{ id: 'a', name: 'A', note: 'n', skills: ['x', 'x', ''] }], own: 1 });
    const all = doc.pipelines[0].phases;
    let [lo, hi] = [0, all.length]; // the most phases whose document fits as stored
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      doc.pipelines[0].phases = all.slice(0, mid);
      if (stored(doc) <= limit) lo = mid; else hi = mid - 1;
    }
    doc.pipelines[0].phases = all.slice(0, lo);
    assert.ok(stored(doc) > limit - 64, `a document at the limit as stored: ${stored(doc)}`);
    const cur = await request({ pathname: '/api/pipelines' });
    const saved = await put(doc, { 'If-Match': cur.headers.etag });
    assert.equal(saved.status, 200, saved.text);
    for (const active of [null, 'second']) {
      if (active) assert.equal((await put({ ...JSON.parse((await request({ pathname: '/api/pipelines' })).text), active }, { 'If-Match': (await request({ pathname: '/api/pipelines' })).headers.etag })).status, 200);
      const read = await request({ pathname: '/api/pipelines' });
      const body = JSON.stringify(normalize(JSON.parse(read.text)));
      assert.equal(body, read.text, `the page sends what it was served, active ${active}`);
      assert.equal((await put(body, { 'If-Match': read.headers.etag })).status, 200, 'and it saves again');
    }
    // A stored file whose phases hold no note, written there by hand, is served and kept so too.
    fs.writeFileSync(path.join(state, 'pipelines.json'), `${JSON.stringify({ ...doc, active: null }, null, 2)}\n`);
    const read = await request({ pathname: '/api/pipelines' });
    assert.equal(read.status, 200, read.text);
    assert.ok(JSON.parse(read.text).pipelines[0].phases.every((ph) => !('note' in ph)), 'served with no notes');
    const body = JSON.stringify(normalize(JSON.parse(read.text)));
    assert.equal(body, read.text, 'the page sends a noteless document as it was served');
    assert.equal((await put(body, { 'If-Match': read.headers.etag })).status, 200, 'and it saves again');
  });
});

// skill-atlas-25 (export) and skill-atlas-22.
// Starts `atlas.mjs serve` and resolves to its port and a request function.
async function startServe(args) {
  const child = spawn(process.execPath, [CLI, 'serve', '--no-open', '--port', '0', '--no-user', '--no-plugins', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const info = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('server did not start in time')), SERVER_START_TIMEOUT_MS);
    child.stdout.on('data', (d) => {
      buf += d;
      const nl = buf.indexOf('\n');
      if (nl >= 0) { clearTimeout(timer); resolve(JSON.parse(buf.slice(0, nl))); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${code}`)); });
  });
  const port = Number(new URL(info.url).port);
  const request = ({ method = 'GET', pathname, headers = {}, body }) => new Promise((resolve, reject) => {
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
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((r) => child.once('exit', r));
    child.kill('SIGTERM');
    await exited;
  };
  return { request, stop };
}

describe('servers sharing a state folder (skill-atlas-25)', () => {
  const state = path.join(tmp, 'shared-state');
  const viewer = path.join(tmp, 'shared-viewer.html');
  let servers = [];
  before(async () => {
    fs.writeFileSync(viewer, `<!doctype html><title>t</title>${EMBED_MARKER}\n`);
    servers = await Promise.all([0, 1, 2].map(() => startServe(['--cwd', P, '--state', state, '--viewer', viewer])));
  });
  after(async () => { await Promise.all(servers.map((s) => s.stop())); });
  const json = { 'X-Skill-Atlas': '1', 'Content-Type': 'application/json' };
  const doc = (name) => JSON.stringify({ version: 1, active: null, pipelines: [{ id: 'w', name, phases: [] }] });
  const put = (server, name, etag) => server.request({ method: 'PUT', pathname: '/api/pipelines', headers: { ...json, 'If-Match': etag }, body: doc(name) });
  const lock = () => path.join(state, 'pipelines.json.lock');

  test('of two saves against one version, exactly one is written (skill-atlas-12)', async () => {
    for (let n = 0; n < 20; n++) {
      const etag = (await servers[0].request({ pathname: '/api/pipelines' })).headers.etag;
      assert.equal((await servers[1].request({ pathname: '/api/pipelines' })).headers.etag, etag, 'both read one version');
      const answers = await Promise.all([put(servers[0], `A${n}`, etag), put(servers[1], `B${n}`, etag)]);
      assert.deepEqual(answers.map((a) => a.status).sort(), [200, 412], `round ${n}: ${answers.map((a) => a.text).join(' | ')}`);
      const won = answers.find((a) => a.status === 200);
      assert.equal(won.headers.etag, `"${sha(path.join(state, 'pipelines.json'))}"`, 'the stored file is the one saved');
      assert.ok(!fs.existsSync(lock()), 'the lock is released');
    }
  });

  test('a lock left behind is broken once stale, and a held one answers 503 (skill-atlas-12)', async () => {
    const etag = (await servers[0].request({ pathname: '/api/pipelines' })).headers.etag;
    fs.writeFileSync(lock(), JSON.stringify({ pid: 999999, time: new Date().toISOString(), token: 'held' }));
    const busy = await put(servers[0], 'Busy', etag);
    assert.equal(busy.status, 503, busy.text);
    assert.match(JSON.parse(busy.text).message, /another skill-atlas server/);
    assert.equal((await servers[0].request({ pathname: '/api/pipelines' })).headers.etag, etag, 'nothing written');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lock(), old, old);
    const saved = await put(servers[1], 'After a stale lock', etag);
    assert.equal(saved.status, 200, saved.text);
    assert.ok(!fs.existsSync(lock()), 'the stale lock is gone');
  });

  test('of three saves against one version over a stale lock, exactly one is written (skill-atlas-12)', async () => {
    for (let n = 0; n < 40; n++) {
      const etag = (await servers[0].request({ pathname: '/api/pipelines' })).headers.etag;
      fs.writeFileSync(lock(), JSON.stringify({ pid: 999999, time: new Date().toISOString(), token: 'left' }));
      const old = new Date(Date.now() - 60_000);
      fs.utimesSync(lock(), old, old);
      const answers = await Promise.all(servers.map((server, i) => put(server, `S${n}.${i}`, etag)));
      assert.deepEqual(answers.map((a) => a.status).sort(), [200, 412, 412], `round ${n}: ${answers.map((a) => a.text).join(' | ')}`);
      assert.equal(answers.find((a) => a.status === 200).headers.etag, `"${sha(path.join(state, 'pipelines.json'))}"`, 'the stored file is the one saved');
      assert.deepEqual(fs.readdirSync(state).filter((f) => f.includes('.lock')), [], 'no lock or breaker left');
    }
  });
});

describe('export', () => {
  test('embeds the data with < escaped', () => {
    const project = path.join(tmp, 'export-project');
    writeSkill(path.join(project, '.claude', 'skills', 'html'), `${fm('html', '"Breaks </script> tags"')}\nText.\n`);
    writeSkill(path.join(project, '.claude', 'skills', 'dollars'), `${fm('dollars', '"Keeps $& and $$ and $1 and $\' as written"')}\nText.\n`);
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
    assert.deepEqual(data.pipelines, { version: 1, active: null, pipelines: [] });
    assert.equal(skillOf(data.atlas, 'html').description, 'Breaks </script> tags');
    assert.equal(skillOf(data.atlas, 'dollars').description, 'Keeps $& and $$ and $1 and $\' as written', 'no replacement pattern rewrites the data');
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

  test('embeds only a valid stored pipelines file', () => {
    const project = path.join(tmp, 'export-invalid');
    writeSkill(path.join(project, '.claude', 'skills', 'one'), `${fm('one', 'One.')}\nText.\n`);
    fs.mkdirSync(path.join(project, 'state'), { recursive: true });
    fs.writeFileSync(path.join(project, 'state', 'pipelines.json'), '{ broken');
    const viewer = path.join(tmp, 'export-viewer.html');
    const out = path.join(tmp, 'export-invalid.html');
    const r = run(['export', '--out', out, '--cwd', project, '--no-user', '--no-plugins', '--state', path.join(project, 'state'), '--viewer', viewer]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /pipelines\.json is not valid JSON.*exporting with no pipelines/);
    const m = /<script id="atlas-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(JSON.parse(m[1]).pipelines, { version: 1, active: null, pipelines: [] });
    assert.equal(fs.readFileSync(path.join(project, 'state', 'pipelines.json'), 'utf8'), '{ broken', 'the file stands');
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
test('the zh-CN catalog holds every text the page looks up, and no other (skill-atlas-25, skill-atlas-29)', () => {
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
  // And no entry for a text the page no longer shows.
  assert.deepEqual(Object.keys(catalog.messages).filter((k) => !keys.has(k)), [], 'zh-CN entries the page never looks up');
});

// agent-skills-7, agent-skills-8 and agent-skills-14 (specs/packages/agent-skills.md).
describe('the repository\'s skills', () => {
  const SKILLS = path.join(REPO, 'skills');
  const DESCRIPTION_MAX = 1024; // Agent Skills specification: description at most 1024 characters
  const BODY_MAX_LINES = 500; // Agent Skills specification: SKILL.md body at most 500 lines
  const SHIPPED = ['code', 'review', 'decide', 'skill-atlas', 'guard'];
  const folders = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  // The repository's skills/ alone: an empty project, no home folder, no plugins and a state folder of its own,
  // so nothing installed on this machine can change what is reported.
  const isolated = path.join(tmp, 'repo-skills-cwd');
  const repoState = path.join(tmp, 'repo-state');
  const alone = ['--cwd', isolated, '--no-user', '--no-plugins', '--root', SKILLS, '--state', repoState];
  let atlas;
  before(() => {
    fs.mkdirSync(isolated, { recursive: true });
    const r = run(['scan', ...alone], { cwd: isolated });
    assert.equal(r.status, 0, `scan failed: ${r.stderr}`);
    atlas = JSON.parse(r.stdout);
  });
  const byName = (n) => atlas.skills.find((s) => s.name === n);

  test('the scan of skills/ alone reports code, review, decide, skill-atlas and guard (agent-skills-8, agent-skills-14)', () => {
    assert.ok(atlas.roots.every((r) => r.scope === 'extra'), `only skills/ is scanned: ${atlas.roots.map((r) => r.id)}`);
    for (const n of SHIPPED) {
      const skill = byName(n);
      assert.ok(skill, `${n} is reported`);
      assert.equal(skill.dir, path.join(SKILLS, n));
    }
  });
  // The text of a step, read from SKILL.md over the step's line span.
  const stepText = (skill, st) => fs.readFileSync(skill.file, 'utf8').split('\n').slice(st.line - 1, st.endLine).join('\n');
  const callsTo = (from, to) => atlas.edges.some((e) => e.from === from.id && e.to === to.id && e.kind === 'calls');

  for (const name of folders) {
    test(`${name}: name, description, body length, links and references`, () => {
      const skill = byName(name);
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
      const skill = byName(name);
      assert.ok(skill, `${name} is found by the scan`);
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

      const checked = run(['pin', '--check', dir, ...alone], { cwd: isolated });
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
      const body = zhText.replace(/\r\n/g, '\n').slice(zhFront[0].length).split('\n').filter((l) => l.trim() && !/^\s*<!--.*-->\s*$/.test(l));
      const quoted = body.slice(0, Math.max(0, body.findIndex((l) => !/^\s{0,3}>/.test(l)))).join('\n');
      assert.match(quoted, /SKILL\.md/, 'it opens with a quoted note saying agents load SKILL.md');

      const zhTargets = linkTargets(dir, zhFile);
      for (const target of zhTargets) assert.ok(fs.existsSync(path.join(dir, target)), `link ${target} in SKILL.zh-CN.md names a file`);
      for (const target of linkTargets(dir, path.join(dir, 'SKILL.md'))) {
        const translated = withTag(target, 'zh-CN');
        if (all.includes(translated)) assert.ok(zhTargets.includes(translated), `SKILL.zh-CN.md links ${translated} where SKILL.md links ${target}`);
      }
    });
  }

  // A skill's version: metadata.version in a SKILL file's frontmatter, as written.
  const versionOf = (text) => {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
    const metadata = front && /^metadata:[ \t]*\n((?:[ \t]+.*(?:\n|$))*)/m.exec(front[1]);
    const version = metadata && /^[ \t]+version:[ \t]*(?:"([^"]*)"|'([^']*)'|(\S+))[ \t]*$/m.exec(metadata[1]);
    return version ? (version[1] ?? version[2] ?? version[3]) : undefined;
  };
  // Semantic Versioning 2.0.0, its recommended expression.
  const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  // Semantic Versioning precedence: below zero where a precedes b.
  const compareVersions = (a, b) => {
    const [ma, mb] = [SEMVER.exec(a), SEMVER.exec(b)];
    for (let i = 1; i <= 3; i++) if (Number(ma[i]) !== Number(mb[i])) return Number(ma[i]) - Number(mb[i]);
    if (!ma[4] || !mb[4]) return (ma[4] ? -1 : 0) - (mb[4] ? -1 : 0);
    const [pa, pb] = [ma[4].split('.'), mb[4].split('.')];
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] === pb[i]) continue;
      const [na, nb] = [/^\d+$/.test(pa[i]), /^\d+$/.test(pb[i])];
      if (na && nb) return Number(pa[i]) - Number(pb[i]);
      if (na !== nb) return na ? -1 : 1;
      return pa[i] < pb[i] ? -1 : 1;
    }
    return pa.length - pb.length;
  };
  const git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  // The merge base with origin/main the CI fetches with full history.
  let mergeBase;
  before(() => {
    const r = git(['merge-base', 'origin/main', 'HEAD']);
    mergeBase = r.status === 0 ? r.stdout.trim() : undefined;
  });

  for (const name of folders) {
    test(`${name}: one semantic version in SKILL.md and its translations, raised where the folder changed since origin/main`, () => {
      const dir = path.join(SKILLS, name);
      const version = versionOf(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'));
      assert.ok(version !== undefined, 'SKILL.md declares metadata.version');
      assert.match(version, SEMVER, `${version} is a semantic version`);
      for (const file of fs.readdirSync(dir).filter((f) => f !== 'SKILL.md' && isTranslation(path.join(dir, f)) && f.startsWith('SKILL.'))) {
        assert.equal(versionOf(fs.readFileSync(path.join(dir, file), 'utf8')), version, `${file} declares the version of SKILL.md`);
      }

      assert.ok(mergeBase, 'origin/main and its merge base with HEAD are fetched (git fetch origin main with full history)');
      const rel = `skills/${name}`;
      if (git(['cat-file', '-e', `${mergeBase}:${rel}/SKILL.md`]).status !== 0) return; // a new skill: its first version is not compared
      const diff = git(['diff', '--quiet', mergeBase, '--', rel]);
      assert.ok(diff.status === 0 || diff.status === 1, `git diff ran: ${diff.stderr}`);
      const untracked = git(['ls-files', '--others', '--exclude-standard', '--', rel]).stdout.trim();
      if (diff.status === 0 && !untracked) return; // unchanged since the merge base
      const before = versionOf(git(['show', `${mergeBase}:${rel}/SKILL.md`]).stdout);
      assert.ok(before === undefined || !SEMVER.test(before) || compareVersions(version, before) > 0,
        `${rel} changed since ${mergeBase.slice(0, 8)} on origin/main, so its version ${version} must be higher than ${before} there`);
    });
  }

  test('what the scan reads from code, review and decide (agent-skills-8)', () => {
    const [code, review, decide] = ['code', 'review', 'decide'].map(byName);
    assert.ok(code && review && decide, 'the three pipeline skills are reported');

    assert.deepEqual(code.steps.map((st) => st.title), ['Run the first phase', 'Judge the phase', 'Run the next IR task', 'Have the change reviewed once', 'Return the result']);
    assert.deepEqual(code.steps[3].calls, [review.id], 'code\'s review step calls review');
    assert.ok(callsTo(code, review));
    assert.ok(code.steps.some((st) => st.tags.some((tg) => tg.id === 'human.question')), 'a code step asks the user');

    assert.deepEqual(review.steps.map((st) => st.title), ['Fix the scope', 'Run a Reviewer round', 'Judge the Reviewer\'s reply', 'Get the Coder\'s disposition', 'Return the result']);
    assert.ok(!atlas.edges.some((e) => e.from === review.id && e.kind === 'calls'), 'review calls no other skill');
    assert.ok(review.steps.some((st) => /\bat most three\b[^.]*\brounds\b/i.test(stepText(review, st))), 'the three-round bound is stated in a step');
    const outcomes = stepText(review, review.steps[4]).split('\n').filter((l) => /^- \*\*(Passed|Unsettled)\*\*:/.test(l));
    assert.equal(outcomes.length, 2, 'review returns a passed and an unsettled outcome');
    for (const l of outcomes) assert.match(l, /\breturn that exact revision\b/, `each outcome returns the evaluated revision: ${l}`);

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

  test('what the scan reads from guard (agent-skills-14)', () => {
    const guard = byName('guard');
    assert.ok(guard, 'the guard skill is reported');
    assert.deepEqual(guard.steps.map((st) => st.title), ['Write the items and the declaration', 'Have the readings drafted', 'Settle each disagreement by an example', 'Write the binding and a kept fault', 'Check, then ask for approval']);
    assert.ok(!atlas.edges.some((e) => e.from === guard.id && e.kind === 'calls'), 'guard calls no other skill');

    const [, readings, disagreement, , check] = guard.steps.map((st) => stepText(guard, st));
    assert.match(readings, /\bindependent agents\b/, 'the readings come from independent agents');
    assert.match(readings, /\bfrom the items and the declaration alone\b/, 'a reading is drafted from the items and the declaration alone');
    assert.match(readings, /\bbefore any agent reads the code\b/, 'the readings are drafted before any agent reads the code');
    assert.match(readings, /\bthe readings were not independent\b/, 'the second step says when the report names the readings as not independent');
    assert.ok(guard.steps[2].tags.some((tg) => tg.id === 'human.question'), 'the third step asks the user');
    assert.match(disagreement, /\bpermitted or forbidden\b/, 'the person marks the sequence permitted or forbidden');
    assert.match(disagreement, /\bNever edit a reading\b/, 'a contradicted reading is dropped, never edited');
    assert.match(check, /`spex verify <guard>`/, 'the last step runs spex verify');
    assert.match(check, /`spex approve <guard>` only when the person says so\b/, 'spex approve runs only when the person says so');

    const text = fs.readFileSync(guard.file, 'utf8');
    assert.match(text, /\bWithout subagents\b[^.]*\bthe readings were not independent\b/, 'guard names the fallback without subagents');
    assert.match(text, /\bWhen an item of the guard changes\b[^\n]*\bDraft the readings again\b[^\n]*\bbefore you ask for approval\b/, 'a changed item has the readings drafted again');
    assert.match(String(guard.frontmatter.compatibility), /\bRequires the spex command\b/, 'the compatibility field says the skill needs the spex command');
  });
});
