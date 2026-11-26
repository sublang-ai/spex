<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-249: A Skill's Version Rises With Its Content

## Status

Accepted (2026-11-24).
Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md).

## Context

- Each skill shipped from `skills/` declares `metadata.version` in its frontmatter, as the Agent Skills specification allows [[1]], and every one has said `1.0.0` since it was first shipped.
  `skill-atlas` alone changed in more than a dozen commits since, and the other three gained translations ([DR-245](245-skills-and-the-atlas-in-the-readers-language.md)).
- A person with two installed copies of one skill, from different revisions, saw the same version on both and could not tell which was newer; the atlas showed them as differing versions ([DR-248](248-the-atlas-shows-dependencies-and-differing-versions.md)) with nothing to order them by.
- The `skills` CLI [[2]] installs a skill by copying its folder from the repository; nothing in the copy says which revision it came from except what the skill declares.
- A change reaches users when it is merged into `main`; a branch is reviewed in several commits before that.
- Considered and declined:
  - a ledger of each version's content digest, checked without Git: every review round's commit would need a new version or a renewed digest, and a renewed digest is the very bump it should force;
  - a version derived from content or date: always distinct, but it says nothing of whether a user or a calling skill must adapt;
  - one version for all shipped skills: a change to one would mark the others changed when they are not.

## Decision

- Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in the form of a shipped skill, adding its version.
- Each shipped skill declares a semantic version [[3]] in `metadata.version` of its `SKILL.md`, and each translation of `SKILL.md` declares the same.
- A change to any file of a skill's folder raises that skill's version above the one it has on `main`, once per change merged, whatever number of commits the change holds:
  - major: something a user, their saved state or a calling skill relied on is removed or changed incompatibly;
  - minor: behavior is added, and what was relied on still holds;
  - patch: anything else, such as a fix, a wording or a translation.
- The repository's tests compare each skill's folder with its merge base with `origin/main` and fail where the folder differs and the version is not higher.
- The versions shipped so far are raised once for the changes since `1.0.0`:
  - `code`, `review` and `decide` to `1.1.0`, for their translations;
  - `skill-atlas` to `2.0.0`, as the exported page no longer edits pipelines and the setting for mentions is retired ([DR-248](248-the-atlas-shows-dependencies-and-differing-versions.md)).

## Consequences

- Two installed copies of one skill from revisions on either side of a merged change declare different versions, the later one higher.
- Commits on one branch share one bump; copies installed from two commits of an unmerged branch may still declare one version.
- A commit pushed to `main` directly is its own merge base and is not checked; the rule holds where changes arrive by pull request.
- The check needs `origin/main` and enough history to find the merge base, which the repository's CI fetches.
- Raising a version edits `SKILL.md` and its translation, so the translation's recorded digests are renewed with it ([DR-245](245-skills-and-the-atlas-in-the-readers-language.md)).

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://github.com/vercel-labs/skills "The skills CLI"
[3]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
