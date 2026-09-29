// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The substitute agents behind a compiled playbook's run
// (playbook-library-87, DR-089): the real Captain shell runs a machine
// the real `slc` compiled, and only provider replies are substituted.
// The machine is the compiler's, so its outcome names are too, and a
// fixture recompiled for a new engine generation may rename them: the
// hidden judge therefore reads the outcomes each prompt declares and
// picks the one that goes straight on — no question for the Boss, no
// finding raised, nothing blocked — rather than naming a guard.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FakeScript } from "./fake-adapter.js";

/** The run's task, the players' answers and the Captain's closing
 * reply: the coder commits one file, the reviewer finds nothing. */
export const COMPILED_RUN = {
  task: "Add a NOTES.md naming what this repository is for, and commit it.",
  done: "Added NOTES.md naming the repository's purpose and committed it.",
  review: "No findings: the commit adds NOTES.md as the task asks and changes nothing else.",
  closing: "The workflow finished: NOTES.md is committed and its review raised nothing.",
} as const;

/** One outcome a governed judgment declares (Playbook's
 * `renderGovernedOutcomeContract`): its guard, its meaning, and the
 * members its reply carries. */
interface DeclaredOutcome {
  guard: string;
  meaning: string;
  members: string[];
}

const OUTCOME = /^- `([^`]+)`(?: — (.*))?\n {2}Reply exactly: \{ (.*) \}$/gmu;
const MEMBER = /"([^"]+)":/gu;

/** The outcomes a judge prompt declares, in their order. */
export function declaredOutcomes(prompt: string): DeclaredOutcome[] {
  const at = prompt.indexOf("Pick exactly one declared");
  const tail = at < 0 ? prompt : prompt.slice(at);
  return [...tail.matchAll(OUTCOME)].map(([, guard, meaning, members]) => ({
    guard,
    meaning: meaning ?? "",
    members: [...members.matchAll(MEMBER)].map(([, name]) => name),
  }));
}

/** A guard's name and meaning as lower-case words: `noFindings` reads
 * "no findings". */
const words = (outcome: DeclaredOutcome): string =>
  `${outcome.guard.replace(/([a-z])([A-Z])/gu, "$1 $2")} ${outcome.meaning}`.toLowerCase();

/** An outcome that turns aside: to the Boss, a block, a failure, a
 * disagreement. */
const DETOUR =
  /\b(boss|question|questions|clarif\w*|block\w*|fail\w*|abort\w*|disagree\w*|argu\w*|reject\w*|cannot|unable|incomplete)\b|could not/u;

/** An outcome that raises findings, as against one that raises none. */
const raisesFindings = (text: string): boolean =>
  /\bfindings?\b/u.test(text) && !/\bno\b[^.;]*\bfindings?\b|\bfindings?\b[^.;]*\bnone\b/u.test(text);

/**
 * The substitute judge's reply to a governed judgment: the first
 * declared outcome that goes straight on, preferring one whose reply
 * carries the guard alone, its other semantic members given the
 * player's output; a blocked reply when none does, which parks the run
 * where a journey sees it.
 */
export function judgeDeclaredOutcome(prompt: string): string {
  const outcomes = declaredOutcomes(prompt);
  const straight = outcomes.filter((outcome) => {
    const text = words(outcome);
    return !DETOUR.test(text) && !raisesFindings(text);
  });
  const chosen = straight.find((outcome) => outcome.members.length === 1) ?? straight[0];
  if (!chosen) {
    return JSON.stringify({
      blocked: `the substitute judge found no straight outcome among ${outcomes.map((o) => o.guard).join(", ") || "none"}`,
    });
  }
  const output = /just produced this output:\n\n```\n([\s\S]*?)\n```/u.exec(prompt)?.[1] ?? "";
  const reply: Record<string, string> = { guard: chosen.guard };
  for (const member of chosen.members) {
    if (member !== "guard") reply[member] = output || "Done.";
  }
  return JSON.stringify(reply);
}

/**
 * The fake adapter's script for a compiled playbook's run: the hidden
 * judgments answered by `judgeDeclaredOutcome`, the Captain's closing
 * reply, the coder — the one prompt carrying the task — writing and
 * committing NOTES.md, and every other call, the reviewer's among them,
 * answered with a review that finds nothing. Each player call stays in
 * flight `delayMs`.
 */
export function compiledRunScript(options: { delayMs?: number } = {}): FakeScript {
  const delay = options.delayMs ?? 1;
  return {
    rules: [
      { match: "Pick exactly one declared", response: { result: "", resultFor: judgeDeclaredOutcome } },
      { match: "An action just settled for the current Boss turn", response: { result: COMPILED_RUN.closing } },
      {
        match: COMPILED_RUN.task,
        response: {
          deltas: [COMPILED_RUN.done],
          tools: [
            { toolName: "Write", input: { file_path: "NOTES.md" } },
            { toolName: "Bash", input: { command: "git commit -m 'Add NOTES.md'" } },
          ],
          result: COMPILED_RUN.done,
          delayMs: delay,
          // Identity rides the command, so the host's global Git config
          // never decides whether the scratch repository can commit.
          effect: (cwd) => {
            writeFileSync(join(cwd, "NOTES.md"), "This repository holds the Academy example.\n");
            execFileSync("git", ["-C", cwd, "add", "NOTES.md"]);
            execFileSync("git", [
              "-C", cwd,
              "-c", "user.name=Spex Test",
              "-c", "user.email=spex@example.test",
              "-c", "commit.gpgsign=false",
              "commit", "-q", "-m", "Add NOTES.md",
            ]);
          },
        },
      },
    ],
    fallback: {
      deltas: [COMPILED_RUN.review],
      tools: [{ toolName: "Bash", input: { command: "git show --stat HEAD" } }],
      result: COMPILED_RUN.review,
      delayMs: delay,
    },
  };
}
