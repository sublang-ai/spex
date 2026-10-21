<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-124: Skills Reach Every Agent

## Status

Accepted (2026-10-19) on the owner's direction that skills reach agents through the spec packages environments install.
Completes [DR-104](104-spec-package-format-and-client-environments.md) in its ask to Cligent: Cligent's DR-036 names the folders each agent reads and leaves copying into them to the host.
Amends [DR-104](104-spec-package-format-and-client-environments.md) in its exports: every paired working folder receives each agent's project-level folder whatever agents the device has, a user-level folder is written only for an agent the device has, and the skill generated for a playbook goes only to Claude Code's folders.
Amended by [DR-130](130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md) in where the table's project-level and user-level folders come from, Cligent's published native-skill support, and in which agents see the exports: Captain control and compiler calls no longer read them except where an agent offers no switch.

## Context

- Spex exports an environment's skills, playbook skills and specs into `.claude/skills` and `~/.claude/skills` alone, the one agent its table names until Cligent says where each agent reads skills.
- Cligent 0.34.0 leaves persistent installation to the host, which copies a skill into `.claude/skills` for Claude Code or `.agents/skills` for Codex, Gemini CLI, Kimi Code and OpenCode [[1]].
- Each of the four reads `.agents/skills` in the user's home as well as in the project: Codex from the working directory up to its repository's root, Kimi Code at its repository's root, Gemini CLI in a trusted working directory, and OpenCode up to its worktree's root, OpenCode reading `.claude/skills` too [[2]] [[3]] [[4]] [[5]].
- Gemini CLI denies a headless run's skill activation unless the run's approval mode is yolo, which Cligent maps from `auto` and `bypass`, the only modes Spex admits [[6]] [[7]].
- A player of the 2026-10-11 workshop followed a playbook skill written for a person's own agent, and Codex invokes a skill whose description matches without being asked [[2]].
- Codex, Kimi Code and OpenCode run a Captain's decision, Judge and reporting calls with their native tools, which those runtimes cannot restrict, so those calls read what the folders hold.
- An export deletes and rewrites each mirrored skill folder, so a run starting meanwhile can find a skill missing or half-written.
- The table drops an agent whose home folder is absent, and with it the project-level export.

## Decision

- **The folders.** Claude Code reads `.claude/skills` in a working folder and `~/.claude/skills`; Codex, Gemini CLI, Kimi Code and OpenCode read `.agents/skills` and `~/.agents/skills`. The table is Spex's own, follows Cligent's DR-036, and names every agent Spex drives. Two folders a link makes one are written once, with playbook skills where either takes them.
- **Project level.** A project's or another group's environment exports into both folders of every paired working folder, whatever agents the device has, each listed in the folder's `.git/info/exclude`.
- **User level.** Your own group's environment exports into `~/.claude/skills` where `~/.claude` exists, and into `~/.agents/skills` where the home folder of any of its readers exists; Spex never creates an agent's own home folder.
- **Playbook skills stay with Claude Code.** The skill generated for a playbook goes only into Claude Code's folders; skills and specs go into both.
- **An unchanged skill stays.** A mirrored skill folder whose files match is left as it is, and a changed one is replaced whole by renaming a complete copy into place, the replaced one restored where that rename fails.
- **Names are strings.** A generated or rewritten `name` is written as a YAML string, since four of the agents read a skill by that name.
- **One channel.** Spex passes no skills per run ([DR-123](123-playbook-17-10-1-cligent-0-34-0-slc-0-18-0-adoption.md)), so each skill reaches an agent through the folder it reads.

Considered and declined:

- Delivering an environment's skills per run through Cligent's option: a skill would arrive twice where the agent also reads the exported folder, Kimi Code's run copy sits in the code's checkout, session records would carry device paths, and a person's own agents would not see them.
- Playbook skills in `.agents/skills`: Codex would invoke them unasked, Codex and Kimi Code Captain calls would read them, and such a skill can only tell its reader to start a Spex session.
- Waiting for Cligent to publish the folders as data: its decision already names them.

## Consequences

- A skill or spec a spec package installs reaches the players of all five agents, a person's own agents on the device and authoring sessions, except Gemini CLI authoring, which runs below the working folder and reads only `~/.agents/skills`.
- Codex, Kimi Code and OpenCode Captain calls see the exported skills and specs, as OpenCode's already saw Claude Code's folder.
- Compiler agents see the exports where their runtime reads them, as Claude Code's and OpenCode's already did.
- A Gemini CLI player whose block names no permission mode discovers the skills but cannot activate them.
- Kimi Code reads a working folder's `.agents/skills` only where the folder is its repository's root.
- OpenCode finds each skill in both folders, keeps one of the two identical copies, and logs a duplicate name.
- A changed skill is absent from an agent folder for the moment between two renames, since Node's file system API offers no atomic exchange of two folders.
- Where a person links `.agents/skills` to `.claude/skills`, the playbook skills stand where all five agents read, since Claude Code's folder takes them; the link is the person's choice, and Spex keeps Claude Code's skills whole.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.34.0/specs/decisions/036-cross-agent-skill-installation.md "Cligent DR-036: Cross-agent skill installation"
[2]: https://learn.chatgpt.com/docs/build-skills "Codex skills"
[3]: https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills "Kimi Code Agent Skills"
[4]: https://geminicli.com/docs/cli/skills/ "Gemini CLI Agent Skills"
[5]: https://opencode.ai/docs/skills/ "OpenCode Agent Skills"
[6]: https://github.com/google-gemini/gemini-cli/blob/v0.61.0/packages/core/src/policy/policies/write.toml#L96-L108 "Gemini CLI 0.61.0 headless activate_skill denial"
[7]: https://github.com/google-gemini/gemini-cli/blob/v0.61.0/packages/core/src/policy/policies/yolo.toml "Gemini CLI 0.61.0 yolo allow"
