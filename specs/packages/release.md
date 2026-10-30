<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# release: Release Workflow

## Intent

This spec defines release workflow rules for the project.

## External Behavior

### Versioning

#### release-1

The project shall follow Semantic Versioning [[1]]: `MAJOR.MINOR.PATCH` where MAJOR indicates breaking changes, MINOR indicates new features, and PATCH indicates bug fixes.

#### release-2

The version in the released package's `package.json` (`packages/cli/package.json`) shall match the git tag (without the `cli-v` prefix):

- The release workflow verifies this match before publishing [[release-8](#release-8)].

### Changelog

#### release-3

All notable changes to a release channel shall be documented in that channel's `CHANGELOG.md` following the Keep a Changelog [[2]] format — `packages/cli/CHANGELOG.md` for the CLI, and the repository root `CHANGELOG.md` for the app ([DR-040](../decisions/040-source-only-app-releases.md)).

#### release-4

When preparing a release, the developer/agent shall review all commits since the last release and ensure all notable changes are documented in the `[Unreleased]` section of `CHANGELOG.md`.

#### release-5

When creating a regular release tag — a CLI tag, or an app tag carrying no pre-release version ([DR-087](../decisions/087-beta-app-releases.md)) — the developer/agent shall move items from `[Unreleased]` to a new version section in `CHANGELOG.md` with the release date, and update the comparison links at the bottom of the file.

#### release-6

Changelog entries shall be grouped under these headings (in order): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

### Release Process

#### release-7

CLI releases shall be triggered by pushing a git tag matching the pattern `cli-vMAJOR.MINOR.PATCH` (e.g., `cli-v3.1.0`) ([DR-056](../decisions/056-release-naming.md)).

#### release-8

When a release tag is pushed, the release workflow shall verify the tag version matches `package.json` version, build and validate the package, and extract release notes from `CHANGELOG.md`.

#### release-9

When the release workflow publishes to npm, it shall use the `--provenance` flag for supply chain security and authenticate via npm OIDC trusted publishing:

- provenance generates a signed attestation linking the package to its source repository and build;
- static npm tokens are not used.

#### release-10

When the release workflow publishes a scoped package, it shall use `--access public` to ensure public availability.

#### release-11

When the release workflow completes publishing, it shall create a GitHub release with the extracted changelog notes and the channel's title ([DR-056](../decisions/056-release-naming.md)):

- CLI: `Spex CLI vMAJOR.MINOR.PATCH`.
- App: `Spex App vMAJOR.MINOR.PATCH`; a beta ([DR-087](../decisions/087-beta-app-releases.md)): `Spex App vMAJOR.MINOR.PATCH-beta.N`, created as a pre-release.
- An app release's notes point their repository-relative links at the tagged tree, so a record cited from the changelog opens from the release page.

#### release-18

When a release tag is pushed, the release workflow shall confirm the CI workflow concluded `success` for the tagged commit before publishing to npm or creating a GitHub release, waiting up to a bounded timeout for the CI workflow to complete:

- the CI workflow concludes `success` — publishing proceeds;
- the CI workflow concludes with any other result, or the timeout elapses without a successful conclusion — the release workflow fails without publishing to npm or creating a GitHub release.

#### release-19

Where the repo hosts multiple release channels ([DR-002](../decisions/002-desktop-app-architecture.md)), release tags shall use disjoint namespaces per channel ([DR-056](../decisions/056-release-naming.md)):

- tags matching `cli-vMAJOR.MINOR.PATCH` release only the `@sublang/spex` package from `packages/cli`;
- tags matching `app-vMAJOR.MINOR.PATCH` release the app — the desktop and server shells — as source ([DR-040](../decisions/040-source-only-app-releases.md));
- tags matching `app-vMAJOR.MINOR.PATCH-beta.N`, `N` counting from 1 within one version, release a beta of the app — the same source release, marked pre-release ([DR-087](../decisions/087-beta-app-releases.md)); a tag carrying any other pre-release identifier is refused;
- historical `vMAJOR.MINOR.PATCH` CLI tags remain valid release-history evidence; published tags and their URLs are preserved when titles are normalized.

### Package Hygiene

#### release-12

The released package's `package.json` shall keep the published tarball to runtime files and gate publishing on a green build:

- the `files` field excludes test files and build artifacts not required at runtime from the published tarball, keeping every module its `exports` field names;
- the `prepublishOnly` script builds and runs tests before publishing.

#### release-13

Where the release workflow validates the package, it shall verify that the tarball contains no test files and no source files that are not required at runtime.

#### release-14

The published package shall include a `README.md` that documents what the tool does, how to install it, and how to use it, kept up to date with the current feature set before each release.

### Pre-release Checklist

#### release-15

When preparing a release tag, the developer/agent shall verify that all changes are committed and pushed to `main` and that the CI workflow concluded `success` for the commit to be tagged:

- a local test run is not that verification: CI covers platforms and versions a developer's machine does not, and [[release-18](#release-18)] fails the release on a red commit, so tagging one only defers the failure.

#### release-16

When preparing a release tag, the developer/agent shall verify that the channel's `package.json` version is bumped — `packages/cli` for a CLI tag; `apps/desktop` and `apps/server` together for an app tag — and that the channel's `CHANGELOG.md` [[release-3](#release-3)] carries the release's notes:

- for a regular tag, the notes stand in a new section with the new version and date [[release-5](#release-5)];
- for a beta app tag ([DR-087](../decisions/087-beta-app-releases.md)), both shell manifests carry the tag's pre-release version `MAJOR.MINOR.PATCH-beta.N` verbatim, and `[Unreleased]` stays in place, non-empty, carrying the beta's notes [[release-27](#release-27)].

#### release-17

When preparing a release tag, the developer/agent shall verify that the tarball contains only production files (e.g., via `npm pack --dry-run`).

#### release-20

When preparing a release tag, the developer/agent shall run the automated smoke (`npm run smoke`) ([DR-086](../decisions/086-tests-in-tiers.md)) and see it pass every stage — the build, the spec lint, the fresh install, and the CLI user pass, which packs the release tarball, installs it into an isolated prefix, and walks the published README's fresh-user and upgrading-user journeys through the installed `spex` bin:

- the fresh install clones the committed tree into a scratch directory, installs it with `npm ci` on an empty npm cache, and launches both shells by the README's own commands on a scratch Spex home: `npm run start:server`, given only the home and an ephemeral port, is walked over its printed token URL — the page served, the config seeded at your own group's spex repository's `config/playbook.config.yaml` and valid with every template playbook, the built-in catalog and the `/code` artifacts served, the readiness of the Captain's and each bound player's adapter reported, the compiler check naming the installed compiler, the Academy example seeded and its tree parsed — and stopped by SIGTERM; `npm start` renders the desktop in acceptance mode, its home storing English so the render's clicks by name hold on any system, and exits clean;
- the smoke refuses a working tree with uncommitted changes outside the release records under `docs/releases/` unless `--allow-dirty` is given: the build, the lint and the CLI user pass read the working tree while the fresh install clones the committed one, and a release's record is written while its gates run;
- the smoke re-runs neither the unit and integration suites nor the browser journeys: CI's success for the tagged commit [[release-15](#release-15)] is that evidence, and a local repeat adds none;
- with `--live` ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)), a `live` stage follows the CLI user pass: the live desktop smoke [[release-22](#release-22)], its driver taken from the fresh install's clone and run inside it on the machine's signed-in agents and a scratch Spex home;
- a stage's scratch tree is removed on success and kept, its path printed, on failure or interrupt — under `--live`, the fresh install's tree passes to the `live` stage, which makes the app's scratch home, user data and project inside it, and the `live` stage's outcome decides;
- `--from=<stage>` resumes at a stage only after every earlier stage has passed on the current inputs, and under `--live` only at a stage up to the fresh install, whose clone the `live` stage needs;
- `--dry-run` names the stages a run would take, in order, and runs none.

#### release-21

When preparing a regular app release tag, the developer/agent shall complete the manual smoke checklist (`docs/release-smoke.md`) — the residue no automation sees: the native notification and the dock badge of a settled turn, the desktop releasing the home on `Ctrl+C` in `npm start` [[app-shell-39](app-shell.md#app-shell-39)], and the packaged app as a local option ([DR-040](../decisions/040-source-only-app-releases.md)) — with a failing step blocking the tag until resolved:

- a CLI release tag is not gated on it: the checklist's only CLI step is the tarball inspection that [[release-17](#release-17)] already requires and [[release-23](#release-23)] verifies;
- a beta app release tag is not gated on it ([DR-087](../decisions/087-beta-app-releases.md));
- the checklist's packaging pass is a local option, not a gate: an app release ships no binaries.

#### release-22

When preparing an app release tag — beta or regular ([DR-087](../decisions/087-beta-app-releases.md)) — the developer/agent shall run the live desktop smoke — the real desktop app walking config, example seeding, session, live playbook dispatch, and abort with signed-in agents ([DR-020](../decisions/020-desktop-live-smoke.md)) — in the installed shape, as the smoke's `live` stage (`npm run smoke -- --live`) [[release-20](#release-20)] ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)), and record its outcome with the tag:

- a provider-side failure — a refusal, a quota, an outage — may be retried or waived with the reason recorded;
- any other failure blocks the tag;
- `npm run smoke:desktop` runs the same smoke from the developer tree during development and is not this gate.

#### release-24

When preparing a CLI release tag, the developer/agent shall run the live migration smoke (`npm run smoke:migration`) — a real coding agent migrating the bundled previous-generation fixture with the packed CLI's printed prompt ([DR-022](../decisions/022-prompt-based-migration.md)) — and record its outcome with the tag:

- the run gates on `spex lint` clean, every fixture item surviving under its new id, intent-record checkbox states preserved, and no `compositions/` directory remaining;
- a provider-side failure may be retried or waived with the reason recorded;
- a failure of the CLI, the prompt-driven migration, or the gates blocks the tag.

#### release-25

When preparing a regular app release tag, the developer/agent shall run the regression (`npm run regression`) — the browser journeys' live lane on the machine's signed-in agents ([DR-086](../decisions/086-tests-in-tiers.md), [DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)): the app's own example source pasted, compiled for real, registered on the Register form's prefill and run to a finished turn with both players engaged; the chat-authored two-role playbook compiled, registered and run; and a project created from the palette with specs scaffolded, developed through a `/decide` intent and a `/code` intent queued behind it with the queue handing off between them; in every run, a player's question answered through the Captain — and record its outcome with the tag, each failure judged by its class:

- the playbooks compile on the roster player the journey picks as the draft's agent, bound to `gpt-6-astra` at `xhigh`; the players that run playbooks and the Captain run on `claude`;
- a provider-side failure — a refusal, a quota, an outage — may be retried or waived with the reason recorded;
- the bundled compiler refusing the app's own example on its first compile blocks the tag, the relay then letting the agent change the source;
- the compiler refusing the chat-authored source after the bounded relay, a model outcome, may be waived with the compiler's output attached and an issue filed against `slc`;
- any other app-side failure blocks the tag;
- a beta app release tag is not gated on it ([DR-087](../decisions/087-beta-app-releases.md)).

#### release-26

When preparing a beta app release tag (`app-vMAJOR.MINOR.PATCH-beta.N`) ([DR-087](../decisions/087-beta-app-releases.md)), the developer/agent shall verify CI green for the commit to be tagged [[release-15](#release-15)], run the smoke with its live stage [[release-20](#release-20)] [[release-22](#release-22)], and tag without the regression [[release-25](#release-25)] or the manual checklist [[release-21](#release-21)].

#### release-27

When a beta app release tag is pushed ([DR-087](../decisions/087-beta-app-releases.md)), the app release workflow shall confirm CI green for the tagged commit as for any app tag [[release-18](#release-18)], verify that both shell manifests carry the tag's pre-release version [[release-16](#release-16)], take the release notes from the app changelog's `[Unreleased]` section — refusing empty notes — under a line naming the beta and the release it leads to, and create the GitHub release as a pre-release titled by [[release-11](#release-11)], its run-from-source instructions followed by a line stating that a beta ran the smoke and the live smoke but not the regression:

- a tag whose pre-release identifier is not `beta.N` is refused without a release;
- the changelog gains no section for a beta [[release-3](#release-3)]: the regular release that follows moves `[Unreleased]` into its version section [[release-5](#release-5)], folding the betas' notes into it.

### Merging into Main

#### release-29

When a pull request into `main` is ready, the maintainer shall ask GitHub to merge it on green, and the repository shall merge it with a merge commit once every job of the CI workflow has passed on the pull request's head, requiring no job to be re-run for a later move of `main` ([DR-145](../decisions/145-merge-on-green.md)):

- `main` is a protected branch whose required status checks are exactly the jobs a pull request's run holds [[release-34](#release-34)], with the branch not required to be up to date;
- a base branch is never deleted while a pull request still targets it.
- a conflicting pull request merges only once the branch merges `main` and its checks pass again on that head;
- where the repository can hold no protection, `npm run merge-on-green -- <number>` waits for the checks of the head's newest run — a commit status among them judged by its state — and merges the moment they are green, naming the head it checked so that no other head merges, refusing to act once the head moved or one of them is not green.

#### release-30

When a push reaches a pull request's branch, the CI workflow shall cancel the run of the head that push supersedes and run the new head once, cancelling no run of a push to `main` ([DR-145](../decisions/145-merge-on-green.md)).

#### release-34

When the CI workflow runs for a pull request, it shall first classify the pull request's changed paths in a `changes` job that is itself a required check, then run the `test` jobs on Linux and Windows with `journeys` and `desktop-browser` on Linux, each only where the classifier succeeded and found more than documentation, and when it runs for a push to `main` or on its nightly schedule, every job of the full matrix with macOS ([DR-145](../decisions/145-merge-on-green.md), [DR-166](../decisions/166-pull-requests-run-without-macos.md)):

- documentation alone is a pull request whose every changed path lies under `docs/` or `specs/` or is a Markdown file; the classifier then runs the CLI package's tests and `spex lint` itself, and the suites report skipped, which the merge rule takes as green [[release-29](#release-29)];
- a push to `main` and the nightly schedule never count as documentation alone.

#### release-36

When the hub lane workflow runs — on its nightly schedule, on a push to `main` that touches `apps/hub/` or `apps/server/`, on a pull request that changes the workflow itself, or on request — it shall run the hub's privileged lane as root on the Linux runner, the commit's tree unpacked outside any home and the install script's own requirements met by the newest Node 22 placed under root's own directories [[hub-7](hub.md#hub-7)], keep the lane's output as the run's artifact, and be no required check of a pull request ([DR-149](../decisions/149-the-privileged-lane-runs-on-ci.md)).

#### release-35

When the developer/agent is about to push, they shall run `npm run prepush`, which refuses a tree holding a conflict marker and then runs `spex lint`, the catalogs' check and the type check, pushing only once it passes ([DR-145](../decisions/145-merge-on-green.md)).

#### release-31

A suite shall be deterministic by construction ([DR-145](../decisions/145-merge-on-green.md)):

- an order it reads from Git's listings or from a directory listing is sorted on both sides of the comparison, or read from the source whose order its subject promises;
- a step is bounded by the event the behavior names, never by wall-clock time;
- a tool's calls are asserted by where they went, never by their exact count;
- a scripted fault outlasts every call that may consume it before the call under test.

#### release-32

When the developer/agent runs `npm run test:linux`, optionally naming a workspace and the test command's arguments, the repository shall run that workspace's tests in a Linux container holding the CI runners' Node and Git versions over a copy of the working tree, so a difference between the developer's platform and the CI platform shows before a push ([DR-145](../decisions/145-merge-on-green.md)).

## Verification

### Release Checks

#### release-23

When a release candidate tarball is inspected via `npm pack --dry-run`, the inspection shall find no test files and no source files that are not required at runtime in the file list, asserting the runtime-files hygiene of the `files` field [[release-12](#release-12)] and the workflow's package validation [[release-13](#release-13)].

### Release Workflow

#### release-28

When the app release workflow's tag check and notes assembly run, as the workflow runs them, over a checkout holding a changelog and both shell manifests, the test suite shall assert:

- an `app-vMAJOR.MINOR.PATCH` tag over manifests at its version is a regular release titled `Spex App vMAJOR.MINOR.PATCH` [[release-19](#release-19)] [[release-11](#release-11)], whose notes are its version's section alone — no neighbouring section, no link definition — with repository-relative links pointed at the tagged tree and other links left as they are [[release-11](#release-11)];
- an `app-vMAJOR.MINOR.PATCH-beta.N` tag over manifests at its pre-release version is a beta titled with that version [[release-11](#release-11)], whose notes are the `[Unreleased]` section under the line naming the beta and the release it leads to, and end with the line naming the gates a beta skips [[release-27](#release-27)];
- `beta.0`, `beta.01`, `rc.1`, build metadata, a leading zero, a two-part version or another channel's prefix is refused without outputs or notes [[release-19](#release-19)] [[release-27](#release-27)];
- a beta tag over manifests off its pre-release version refuses the release [[release-27](#release-27)];
- a beta's `[Unreleased]` holding only headings and blank lines, its lines ending in LF or CRLF, is refused as empty notes [[release-27](#release-27)].

### Merge Gate

#### release-33

When the repository-system audit reads the CI workflow, the hub lane workflow and the Linux parity script, it shall assert that the workflow's concurrency groups a pull request's runs by its number and cancels the run in progress for a pull request and not for a push to `main` [[release-30](#release-30)], that the required checks the repository's merge rule names are exactly the jobs a pull request's run holds [[release-29](#release-29)] [[release-34](#release-34)], that the matrix narrows for a pull request and is whole for a push to `main` and for the nightly schedule [[release-34](#release-34)], that `npm run prepush` refuses a conflict marker [[release-35](#release-35)], that `npm run merge-on-green` merges only a head whose newest run's checks are all green, a commit status judged by its state, naming the head it checked to the merge [[release-29](#release-29)], that `npm run test:linux` names the runners' Node and Git versions [[release-32](#release-32)], and that the hub lane workflow runs on its nightly schedule, on a push to `main` touching the hub or the server shell, on a pull request changing the workflow itself and on request, on no other pull request, running the lane's script as root and keeping its output as an artifact [[release-36](#release-36)].

## References

[1]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[2]: https://keepachangelog.com/en/1.1.0/ "Keep a Changelog 1.1.0"
