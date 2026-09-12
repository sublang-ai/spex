// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring narration (DR-058): one fake-adapter script that plays
// the authoring agent for the core suite and the browser journeys —
// it writes a two-role `<id>.md` into its working directory and asks
// for a compile, fixes the source after a relayed failure, proposes
// the registration after a success, and proves a reseed reached it.

import type { FakeScript } from "./fake-adapter.js";

/** The source the fake writes: a two-role triage workflow. */
export const AUTHORING_SOURCE = `# <id>

Roles:

- Triager
- Verifier

When a new issue arrives, Captain shall prompt Triager:

> Read the issue and the repository's labels with gh.
> Propose up to two labels and say why.

When Triager has proposed, Captain shall prompt Verifier:

> Check the proposed labels against the issue.
> Apply every label but security with gh; leave security to the Boss.

Results:

- \`labeled\`: the labels were applied.
- \`needsBoss\`: a security label waits for the Boss.
`;

const COMPILE_BLOCK = "```spex\nkind: compile\n```";

/** A reply as an adapter streams it: the text in deltas — the prose,
 * then any directive block — and the same text as the done result,
 * so the transcript draws what the runner parses. */
function streamed(result: string): { deltas: string[]; result: string } {
  const at = result.indexOf("```spex");
  const deltas = at > 0 ? [result.slice(0, at), result.slice(at)] : [result];
  return { deltas, result };
}

export function registerBlock(players: Record<string, string>, command = "<id>", intent = "Triage a new issue into the repository's labels"): string {
  const lines = Object.entries(players).map(([role, player]) => `  ${role}: ${player}`);
  return ["```spex", "kind: register", `command: ${command}`, `intent: ${intent}`, "players:", ...lines, "```"].join("\n");
}

/**
 * The script, keyed on prompt substrings the runner's composition
 * guarantees (playbook-library-65). `players` is what the register
 * proposal names per role.
 */
export function authoringScript(
  players: Record<string, string> = { Triager: "dev.triager", Verifier: "dev.coder" },
): FakeScript {
  return {
    rules: [
      {
        match: "Conversation so far",
        response: streamed(
          "Picking up where we left off: the source on disk is the design we agreed on. Tell me what to change.",
        ),
      },
      {
        // A relayed failure: edit the source, ask for another compile.
        match: /(failed at|asks for clarification)/,
        response: {
          ...streamed(`The compiler rejected the duplicated result; I rewrote the \`Results:\` bullets. Asking for another compile.\n\n${COMPILE_BLOCK}`),
          writes: { "<id>.md": AUTHORING_SOURCE.replace("- `labeled`: the labels were applied.", "- `labeled`: every proposed label was applied.") },
          tools: [{ toolName: "Edit", input: { file_path: "<id>.md" }, output: "ok", durationMs: 120 }],
        },
      },
      {
        // The compile succeeded: propose the registration.
        match: "succeeded",
        response: streamed(`Registration proposal:\n\n${registerBlock(players)}`),
      },
      {
        // The first Boss message: write the source and ask to compile.
        match: "Boss: I want",
        response: {
          ...streamed(`I wrote \`<id>.md\`: Triager proposes labels, Verifier applies all but security. Compiling now.\n\n${COMPILE_BLOCK}`),
          writes: { "<id>.md": AUTHORING_SOURCE },
          tools: [
            { toolName: "Read", input: { file_path: "reference/sdlc/review.md" }, output: "…", durationMs: 80 },
            { toolName: "Write", input: { file_path: "<id>.md" }, output: "ok", durationMs: 140 },
          ],
        },
      },
    ],
    fallback: streamed("Noted. Say the word and I will compile."),
  };
}
