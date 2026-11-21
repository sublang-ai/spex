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

  // Annotations.
  fs.mkdirSync(path.join(P, 'state'), { recursive: true });
  fs.writeFileSync(path.join(P, 'state', 'annotations.json'), JSON.stringify({
    version: 1,
    skills: {
      delta: {
        summary: 'Delta explains its rules.',
        addTags: [{ id: 'human.approval', step: 2, note: 'rules need sign-off' }, { id: 'output.custom-thing' }],
        addCalls: [{ to: 'review', step: 1, note: 'after the background' }],
      },
      annotated: {
        steps: [{ title: 'Decide the plan', summary: 'Pick one plan.', tags: ['human.choice'], calls: ['review'] }, { title: 'Write it down', summary: 'Record it.' }],
        addTags: [{ id: 'output.files', step: 2, note: 'writes the plan' }],
        addCalls: [{ to: 'lint-fix', step: 2, note: 'lints the plan' }],
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
      { path: 'references/guide.md', kind: 'reference', linked: true },
      { path: 'scripts/run.sh', kind: 'script', linked: false },
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
    for (const k of ['duplicate-name', 'unresolved-link', 'cycle', 'oversized', 'missing-description', 'name-mismatch', 'invalid-frontmatter', 'no-steps']) {
      assert.ok(kinds.has(k), `insight ${k}`);
    }
    assert.ok(skillOf(atlas, 'big').issues.includes('oversized'));
    assert.ok(skillOf(atlas, 'other-name').issues.includes('name-mismatch'));
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
    child = spawn(process.execPath, [path.join(copy, 'scripts', 'atlas.mjs'), 'serve', '--no-open', '--port', '0', '--cwd', P, '--no-user', '--no-plugins', '--state', state, '--viewer', viewer], { stdio: ['ignore', 'pipe', 'pipe'] });
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
            else assert.ok(targets.has(`${rel}/${e.name}`), `${rel}/${e.name} is linked from SKILL.md itself`);
          }
        };
        walk(refs, 'references');
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
