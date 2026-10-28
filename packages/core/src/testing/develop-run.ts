// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The substitute agents behind a real /dev run that decides before it
// codes (run-view-193, DR-159): the real Captain shell starts the built-in
// `dev`, whose analyst picks the decide-then-code path; `decide` asks the
// coder and the reviewer for proposals in parallel, the coder merges
// them into one commit, the nested review passes, and `code` commits
// the page with its own review passing. Only provider replies are
// substituted, so every trace record the run view folds is Playbook's.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { declaredOutcomes } from "./compiled-run.js";
import type { FakeResponse, FakeScript } from "./fake-adapter.js";

/** The run's request, each player's answer, and the Captain's closing
 * reply. */
export const DEVELOP_RUN = {
  request: "Add a 404 page",
  plan: "Decide first: the specs leave open what a 404 page must say.",
  coderProposal: "Coder proposal: one spec item for the 404 page's copy.",
  reviewerProposal: "Reviewer proposal: one spec item and a link home.",
  merged: "Added DR-001 for the 404 page and committed it as one commit.",
  review: "No findings: the commit does what the request asks.",
  built: "Added the 404 page and committed it.",
  closing: "The 404 page is decided, built and reviewed.",
} as const;

/** A commit the player makes in its working folder, with an identity
 * on the command so the host's own Git config never decides it. */
function commit(file: string, text: string, message: string): (cwd: string) => void {
  return (cwd) => {
    writeFileSync(join(cwd, file), text);
    execFileSync("git", ["-C", cwd, "add", "-A"]);
    execFileSync("git", [
      "-C", cwd,
      "-c", "user.name=Spex Test",
      "-c", "user.email=spex@example.test",
      "-c", "commit.gpgsign=false",
      "commit", "-q", "-m", message,
    ]);
  };
}

/** The judge's reply naming `guard`, each other member it declares
 * carrying the judged output. */
function judgeAs(guard: string): (prompt: string) => string {
  return (prompt) => {
    const outcome = declaredOutcomes(prompt).find((entry) => entry.guard === guard);
    const output = /just produced this output:\n\n```\n([\s\S]*?)\n```/u.exec(prompt)?.[1] ?? "";
    const reply: Record<string, string> = { guard };
    for (const member of outcome?.members ?? []) {
      if (member !== "guard") reply[member] = output || "Done.";
    }
    return JSON.stringify(reply);
  };
}

/** A judgment of the output carrying `text`. */
const judged = (text: string): RegExp =>
  new RegExp(`just produced this output:[\\s\\S]*${text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[\\s\\S]*Pick exactly one declared`, "u");

export interface DevelopRunOptions {
  /** How long each player call stays in flight. */
  delayMs?: number;
  /** How long the reviewer's proposal stays in flight, so the two
   * parallel calls end apart. */
  reviewerDelayMs?: number;
  /** Hold this call in flight until the turn is aborted. */
  hold?: "reviewerProposal" | "merge";
}

/** The fake adapter's script for the decide-then-code /dev run. */
export function developRunScript(options: DevelopRunOptions = {}): FakeScript {
  const delay = options.delayMs ?? 1;
  const held = (name: DevelopRunOptions["hold"]): Partial<FakeResponse> =>
    options.hold === name ? { untilAborted: true } : {};
  return {
    rules: [
      { match: /"action"/, response: { result: JSON.stringify({ action: "start", playbookId: "dev", input: DEVELOP_RUN.request }) } },
      { match: "An action just settled for the current Boss turn", response: { result: DEVELOP_RUN.closing } },
      { match: judged(DEVELOP_RUN.plan), response: { result: "", resultFor: judgeAs("decideThenCode") } },
      { match: judged(DEVELOP_RUN.coderProposal), response: { result: "", resultFor: judgeAs("proposed") } },
      { match: judged(DEVELOP_RUN.reviewerProposal), response: { result: "", resultFor: judgeAs("proposed") } },
      { match: judged(DEVELOP_RUN.merged), response: { result: "", resultFor: judgeAs("committed") } },
      { match: judged(DEVELOP_RUN.review), response: { result: "", resultFor: judgeAs("noFindings") } },
      { match: judged(DEVELOP_RUN.built), response: { result: "", resultFor: judgeAs("directCommit") } },
      { match: /^Role: analyst/u, response: { deltas: [DEVELOP_RUN.plan], result: DEVELOP_RUN.plan, delayMs: delay } },
      {
        match: "Synthesize your independent proposal",
        response: {
          deltas: [DEVELOP_RUN.merged],
          result: DEVELOP_RUN.merged,
          delayMs: delay,
          ...held("merge"),
          effect: commit("DR-001.md", "# 404 page\n", "docs: decide the 404 page"),
        },
      },
      { match: /^Role: coder[\s\S]*Propose your design/u, response: { deltas: [DEVELOP_RUN.coderProposal], result: DEVELOP_RUN.coderProposal, delayMs: delay } },
      {
        match: /^Role: reviewer[\s\S]*Propose your design/u,
        response: {
          deltas: [DEVELOP_RUN.reviewerProposal],
          result: DEVELOP_RUN.reviewerProposal,
          delayMs: options.reviewerDelayMs ?? delay,
          ...held("reviewerProposal"),
        },
      },
      { match: /^Role: reviewer/u, response: { deltas: [DEVELOP_RUN.review], result: DEVELOP_RUN.review, delayMs: delay } },
      {
        match: "Original request:",
        response: {
          deltas: [DEVELOP_RUN.built],
          result: DEVELOP_RUN.built,
          delayMs: delay,
          effect: commit("404.html", "<h1>Not found</h1>\n", "feat: add the 404 page"),
        },
      },
    ],
    fallback: { result: "Done." },
  };
}

/** The configuration the run reads: the analyst, coder and reviewer
 * players and every playbook the path reaches bound to them. */
export const DEVELOP_CONFIG = `captain:
  adapter: claude
  model: claude-opus-5-5
players:
  dev.analyst:
    adapter: claude
    model: claude-opus-5-5
  dev.coder:
    adapter: claude
    model: claude-opus-5-5
  dev.reviewer:
    adapter: codex
    model: gpt-6-sol
playbooks:
  dev:
    roles:
      analyst: dev.analyst
  decide:
    roles:
      coder: dev.coder
      reviewer: dev.reviewer
  code:
    roles:
      coder: dev.coder
  review:
    roles:
      coder: dev.coder
      reviewer: dev.reviewer
`;
