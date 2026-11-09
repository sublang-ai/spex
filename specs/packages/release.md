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

The version in the released CLI package's `package.json` shall equal the `cli-v` tag's version, injected during release preparation rather than requiring a version-only source commit [[release-16](#release-16)] ([DR-220](../decisions/220-tags-own-release-versions.md)).

### Changelog

#### release-3

All notable changes to a release channel shall be documented in that channel's `CHANGELOG.md` following the Keep a Changelog [[2]] format — `packages/cli/CHANGELOG.md` for the CLI, and the repository root `CHANGELOG.md` for the app ([DR-040](../decisions/040-source-only-app-releases.md)).

#### release-4

When developing a release's changes, the developer/agent shall document notable changes in the channel's `[Unreleased]` section without requiring a new version-specific commit solely to publish [[release-5](#release-5)].

#### release-5

When assembling release notes, the release workflow shall use a non-empty exact-version changelog section if present, otherwise generate notes from commits since the most recently published same-channel ancestor release, linking the source commit and comparison range, without reusing `[Unreleased]` or treating draft releases and unpublished tags as release boundaries ([DR-220](../decisions/220-tags-own-release-versions.md)):

- without a published ancestor it identifies the first release on that channel's history and its source commit;
- with no new source commits it explicitly reports the empty range;
- an exact-version section is optional, and existing historical sections remain unchanged.

#### release-6

Changelog entries shall be grouped under these headings (in order): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

### Release Process

#### release-7

CLI releases shall be triggered by pushing a git tag matching the pattern `cli-vMAJOR.MINOR.PATCH` (e.g., `cli-v3.1.0`) ([DR-056](../decisions/056-release-naming.md)).

#### release-8

When a release tag is pushed, the release workflow shall prepare the tag's version [[release-16](#release-16)], validate and build that prepared tree [[release-18](#release-18)], verify the actual distributable's version against the tag, and publish only that verified artifact with the prepared notes [[release-5](#release-5)]:

- the CLI inspects the real packed archive and publishes that archive, rather than repacking the workspace;
- native app metadata and the archived app manifest must match the tag, with the packaged compiler gate reporting the latter version.

#### release-9

When the release workflow publishes to npm, it shall use the `--provenance` flag for supply chain security and authenticate via npm OIDC trusted publishing:

- provenance generates a signed attestation linking the package to its source repository and build;
- static npm tokens are not used.

#### release-10

When the release workflow publishes a scoped package, it shall use `--access public` to ensure public availability.

#### release-11

When the release workflow completes publishing, it shall create a GitHub release with the prepared notes [[release-5](#release-5)] and the channel's title ([DR-056](../decisions/056-release-naming.md)):

- CLI: `Spex CLI vMAJOR.MINOR.PATCH`.
- App: `Spex App vMAJOR.MINOR.PATCH`; a beta ([DR-087](../decisions/087-beta-app-releases.md)): `Spex App vMAJOR.MINOR.PATCH-beta.N`, created as a pre-release.
- An app release's notes point their repository-relative links at the tagged tree, so a record cited from the changelog opens from the release page.

#### release-18

When a release tag is pushed, its release workflow shall require a successful reusable CI invocation with `full: true` and its `app` or `cli` channel on the exact tagged tree with only deterministic release-version metadata preparation [[release-16](#release-16)] before publishing to npm or creating a release [[release-34](#release-34)] [[release-44](#release-44)] ([DR-199](../decisions/199-release-gated-full-validation.md)):

- publication depends directly on that invocation; failed, cancelled or skipped validation permits no publication;
- no prior CI run, local result or reduced pull-request result substitutes for that invocation;
- downstream release jobs retain package builds and validation but do not repeat the test suites that invocation completed.
- New release workflows contain no beta.26 exception or merge-parent/PR-status requirement; that historical tag retains its recorded waiver and workflow ([DR-220](../decisions/220-tags-own-release-versions.md)).

#### release-19

Where the repo hosts multiple release channels ([DR-002](../decisions/002-desktop-app-architecture.md)), release tags shall use disjoint namespaces per channel ([DR-056](../decisions/056-release-naming.md)):

- tags matching `cli-vMAJOR.MINOR.PATCH` release only the `@sublang/spex` package from `packages/cli`;
- tags matching `app-vMAJOR.MINOR.PATCH` release the app — source instructions for both shells and native desktop downloads [[release-39](#release-39)] ([DR-184](../decisions/184-native-desktop-tag-packages.md));
- tags matching `app-vMAJOR.MINOR.PATCH-beta.N`, `N` counting from 1 within one version, release a beta of the app with the same downloads and source instructions, marked pre-release ([DR-087](../decisions/087-beta-app-releases.md)); a tag carrying any other pre-release identifier is refused;
- historical `vMAJOR.MINOR.PATCH` CLI tags remain valid release-history evidence; published tags and their URLs are preserved when titles are normalized.

#### release-39

When an app tag passes the existing CI, prepared-version, notes and build/test gates [[release-18](#release-18)] [[release-8](#release-8)], the app release workflow shall publish a macOS Apple Silicon DMG and a Windows x64 per-user NSIS installer ([DR-177](../decisions/177-native-desktop-installers.md)) only after both native packaging jobs succeed ([DR-184](../decisions/184-native-desktop-tag-packages.md)):

- each job prepares the tag version, installs the tagged tree's locked dependencies, builds it on the target OS and uploads its verified versioned download, failing on a missing file;
- packaging commands do not publish; only the final job has release-write permission;
- the final job requires both downloads and writes their SHA-256 checksums before attaching all three files to the same release;
- a failed or missing platform build prevents release publication;
- the Mac job supplies private signing inputs from CI secrets only to the Mac path, removes them even on failure, requires the signed/notarized distribution command and its verification report [[app-shell-45](app-shell.md#app-shell-45)], and uploads public verification receipts beside the compiler check ([DR-219](../decisions/219-developer-id-macos-downloads.md)).

#### release-48

When a maintainer explicitly dispatches a release workflow on a branch with a valid unused candidate tag, the workflow shall run the same version preparation, full channel validation and artifact checks as a tag release, making a runner-local tag only for notes and retaining verified artifacts, while npm publishing and GitHub Release creation require an actual channel-tag push ([DR-220](../decisions/220-tags-own-release-versions.md)):

- native packaging may run in parallel with full validation, but final acceptance/publication still requires both;
- explicit app `build-only` dispatch diagnoses the native jobs with reusable validation skipped, checking real SLC module-scope loading on each native platform before packaging and making final acceptance/publication ineligible even if package jobs succeed; tag pushes always retain full validation;
- Windows full app validation includes the generated-module-scope regression alongside native storage checks.

### Package Hygiene

#### release-41

Before installing app-tag build dependencies, the release workflow shall require one checksum-locked public npm registry installation each of Cligent and Playbook, refusing local file, vendor, Git or other source dependencies for those runtimes in the app manifests and lockfile ([DR-184](../decisions/184-native-desktop-tag-packages.md)).

#### release-12

The released package's `package.json` shall keep the published tarball to runtime files and gate publishing on a green build:

- the `files` field excludes test files and build artifacts not required at runtime from the published tarball, keeping every module its `exports` field names;
- the `prepublishOnly` script builds and runs tests for standalone publication; the release workflow may bypass that lifecycle only after its full validation succeeds [[release-18](#release-18)] and it explicitly builds the same tagged CLI package.

#### release-13

Where the release workflow validates the package, it shall verify that the tarball contains no test files and no source files that are not required at runtime.

#### release-14

The published package shall include a `README.md` that documents what the tool does, how to install it, and how to use it, kept up to date with the current feature set before each release.

### Pre-release Checklist

#### release-15

When preparing a release tag, the developer/agent shall select an intended committed and pushed source revision, with full channel validation required after the tag is pushed and before publication [[release-18](#release-18)], without requiring a version-only PR, merge commit or prior CI run for that revision ([DR-220](../decisions/220-tags-own-release-versions.md)).

#### release-16

When preparing any release job that installs, validates or builds source, the release tooling shall take the version solely from a valid channel tag and set only the selected workspace manifests' and corresponding lockfile entries' versions before installation, consistently across reusable CI and packaging jobs ([DR-220](../decisions/220-tags-own-release-versions.md)):

- app tags prepare `apps/desktop` and `apps/server`; CLI tags prepare only `packages/cli`;
- source versions remain development defaults; no dependency resolution, lifecycle hooks, source commits or write-back occurs;
- malformed tags, channel mismatches and incomplete workspace metadata fail before preparation writes;
- an existing GitHub release, including a draft, or existing CLI npm version blocks publication without overwriting it; registry lookup errors block publication;
- the target tag must resolve to the checked-out source revision before notes are assembled.

#### release-17

When preparing a release tag, the developer/agent shall verify that the tarball contains only production files (e.g., via `npm pack --dry-run`).

#### release-20

When preparing a release tag, the developer/agent shall run the automated smoke (`npm run smoke`) ([DR-086](../decisions/086-tests-in-tiers.md)) and see it pass every stage — the build, the spec lint, the fresh install, and the CLI user pass, which packs the release tarball, installs it into an isolated prefix, and walks the published README's fresh-user and upgrading-user journeys through the installed `spex` bin:

- the fresh install clones the committed tree into a scratch directory, installs it with `npm ci` on an empty npm cache, and launches both shells by the README's own commands on a scratch Spex home: `npm run start:server`, given only the home and an ephemeral port, is walked over its printed token URL — the page served, the config seeded at your own group's spex repository's `config/playbook.config.yaml` and valid with every template playbook, the built-in catalog and the `/code` artifacts served, the readiness of the Captain's and each bound player's adapter reported, the compiler check naming the installed compiler, the Academy example seeded and its tree parsed — and stopped by SIGTERM; `npm start` renders the desktop in acceptance mode, its home storing English so the render's clicks by name hold on any system, and exits clean;
- the smoke refuses a working tree with uncommitted changes outside the release records under `docs/releases/` unless `--allow-dirty` is given: the build, the lint and the CLI user pass read the working tree while the fresh install clones the committed one, and a release's record is written while its gates run;
- the smoke re-runs neither the unit and integration suites nor the browser journeys: the release's full channel validation supplies that evidence before publication [[release-18](#release-18)];
- with `--live` ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)), a `live` stage follows the CLI user pass: the live desktop smoke [[release-22](#release-22)], its driver taken from the fresh install's clone and run inside it on the machine's signed-in agents and a scratch Spex home;
- a stage's scratch tree is removed on success and kept, its path printed, on failure or interrupt — under `--live`, the fresh install's tree passes to the `live` stage, which makes the app's scratch home, user data and project inside it, and the `live` stage's outcome decides;
- `--from=<stage>` resumes at a stage only after every earlier stage has passed on the current inputs, and under `--live` only at a stage up to the fresh install, whose clone the `live` stage needs;
- `--dry-run` names the stages a run would take, in order, and runs none.

#### release-21

When preparing a regular app release tag, the developer/agent shall complete the manual smoke checklist (`docs/release-smoke.md`) — the residue no automation sees: the native notification and the dock badge of a settled turn, the desktop releasing the home on `Ctrl+C` in `npm start` [[app-shell-39](app-shell.md#app-shell-39)], and the packaged app as a local option ([DR-184](../decisions/184-native-desktop-tag-packages.md)) — with a failing step blocking the tag until resolved:

- a CLI release tag is not gated on it: the checklist's only CLI step is the tarball inspection that [[release-17](#release-17)] already requires and [[release-23](#release-23)] verifies;
- a beta app release tag is not gated on it ([DR-087](../decisions/087-beta-app-releases.md));
- the checklist's local packaging pass is optional; both native packaging jobs remain publication gates [[release-39](#release-39)].

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

When preparing a beta app release tag (`app-vMAJOR.MINOR.PATCH-beta.N`) ([DR-087](../decisions/087-beta-app-releases.md)), the developer/agent shall select the intended committed and pushed revision [[release-15](#release-15)], run the smoke with its live stage [[release-20](#release-20)] [[release-22](#release-22)], and tag without the regression [[release-25](#release-25)] or the manual checklist [[release-21](#release-21)].

- The historical beta.26 preparation record retains its authorized reused evidence; this does not change future tags' gates.

#### release-27

When a beta app release tag is pushed ([DR-087](../decisions/087-beta-app-releases.md)), the app release workflow shall prepare both shells with that pre-release version [[release-16](#release-16)], require full app validation [[release-18](#release-18)] and create a GitHub pre-release titled by [[release-11](#release-11)], with prepared notes [[release-5](#release-5)] under a line identifying the beta and its base version, without asserting unrecorded smoke results or requiring a beta changelog edit ([DR-220](../decisions/220-tags-own-release-versions.md)).

### Merging into Main

#### release-29

When a pull request into `main` is ready, the maintainer shall ask for a merge on green, and the repository shall merge it with a merge commit once its CI `checks` result succeeds on the pull request's head [[release-44](#release-44)], requiring no re-run for a later move of `main` ([DR-145](../decisions/145-merge-on-green.md), [DR-199](../decisions/199-release-gated-full-validation.md)):

- `checks` is the sole required status check, with the branch not required to be up to date;
- a base branch is never deleted while a pull request still targets it;
- a conflicting pull request merges only once the branch merges `main` and its checks pass again on that head;
- where the repository can hold no protection, `npm run merge-on-green -- <number>` waits for the head's newest CI run and successful `checks` result, then merges naming the head it checked, refusing to act once that head moved or the gate is not green.

#### release-30

When a push reaches a pull request's branch, the CI workflow shall cancel the run of the head that push supersedes and run the new head once, while preserving explicitly requested and release validation runs ([DR-145](../decisions/145-merge-on-green.md), [DR-199](../decisions/199-release-gated-full-validation.md)).

#### release-34

The CI workflow shall offer validation for pull requests targeting `main`, reusable invocations and explicit manual requests, with no scheduled or automatic push-to-`main` run, selecting work by this plan ([DR-199](../decisions/199-release-gated-full-validation.md)):

| Invocation | Validation |
| --- | --- |
| Pull request changing documentation alone | CLI build and tests, plus spec lint |
| Other pull request | Build, type, catalog and spec gates; script tests and selected workspace suites on Linux Node 22; Windows Node 22 only where the selection reaches the CLI, UI or core, running the selected CLI/UI suites and core native-storage/platform coverage, and core store- and Git-removal, clone-move and credential-helper coverage on the Node the app's Electron ships |
| Full app, requested manually or by a reusable call with `full: true`, `channel: app` | On Linux and macOS, every workspace suite and script tests; on Windows, the CLI/UI suites, core native-storage/platform coverage and core store- and Git-removal, clone-move and credential-helper coverage on the Node the app's Electron ships; all browser journeys in three shards on Linux and macOS; native browser acceptance on Linux and macOS; privileged hub lane [[release-36](#release-36)] |
| Full CLI, requested manually or by a reusable call with `full: true`, `channel: cli` | CLI tests on every supported platform/Node row, with script tests on Linux and macOS only; no app journeys, native browser acceptance or hub lane |

- the full supported matrix is Linux and macOS on Node 22 and 24, and Windows on Node 22;
- a full invocation validates the exact tree named by its caller or manual ref, never a separately selected mutable branch;
- the classifier reads changed paths against the merge base with the comparison ref, `origin/main` locally, including staged, unstaged and untracked local files and both sides of renames;
- documentation is a path under `docs/` or `specs/`, or a Markdown file outside every workspace; documentation alone contains at least one changed path and no other kind;
- a workspace path, including its Markdown, selects its workspace and transitively every workspace that declares it among its dependencies, development, peer or optional dependencies;
- an exactly listed root tool selects its declared owners and their transitive dependents, or script tests alone where no owner is named, under the ownership table below; a missing named workspace, root dependency or localization configuration, or any unlisted non-documentation root path selects every workspace;
- Linux suite execution that selects the core requires Git LFS for real transport and materialization coverage, with no skip for its absence;
- the final result is evaluated by the shared `checks` gate [[release-44](#release-44)].

| Exact root paths | Owner seeds |
| --- | --- |
| `.github/workflows/ci.yml`, `.github/workflows/app-release.yml`, `.github/workflows/release.yml`, `.github/workflows/hub-lane.yml`, `.github/workflows/caches.yml`, `.github/actions/download-caches/action.yml` | Script tests alone |
| `scripts/affected-tests.mjs`, `scripts/affected-tests.test.mjs`, `scripts/ci-verdict.mjs`, `scripts/ci-workflow.test.mjs`, `scripts/app-release-workflow.test.mjs`, `scripts/prepush.sh`, `scripts/merge-on-green.sh`, `scripts/test-linux.sh`, `scripts/linux-ci/Dockerfile` | Script tests alone |
| `scripts/release-notes.mjs`, `scripts/release-notes.test.mjs`, `scripts/smoke.mjs`, `scripts/smoke.test.mjs`, `scripts/install-smoke.mjs`, `scripts/cli-smoke.mjs`, `scripts/desktop-smoke.mjs`, `scripts/migration-smoke.mjs` | Script tests alone |
| `scripts/desktop-runner.test.mjs`, `scripts/source-launch.integration.test.mjs`, `scripts/live-output.test.mjs`, `scripts/inspection-browser-cache.test.mjs`, `scripts/inspection-evidence.test.mjs`, `scripts/team-server-local.test.mjs` | Script tests alone |
| `scripts/start-desktop.mjs`, `scripts/desktop-runner.mjs` | `apps/desktop` |
| `scripts/start-server.mjs` | `apps/server` |
| `scripts/storage-git.mjs`, `scripts/native-approval-stage.mjs` | `packages/core` |
| `scripts/browser-preparation.ts` | `apps/desktop`, `e2e` |

#### release-44

When a CI invocation reaches its final result, its `checks` job shall evaluate the selected plan even after a dependency fails or is skipped, succeeding only when classification and every selected job succeeded and every unselected job was skipped [[release-34](#release-34)], with any failure, cancellation, missing result or unexpected skip blocking success and no stand-in job impersonating a suite ([DR-199](../decisions/199-release-gated-full-validation.md)).

#### release-36

When the privileged hub lane is invoked by full app validation [[release-34](#release-34)] or explicitly on request, it shall run as root on the Linux runner, the invocation's exact tree unpacked outside any home and the install script's own requirements met by the newest Node 22 placed under root's own directories [[hub-7](hub.md#hub-7)], keeping the lane's output as the run's artifact, with no scheduled, push or pull-request trigger ([DR-149](../decisions/149-the-privileged-lane-runs-on-ci.md), [DR-199](../decisions/199-release-gated-full-validation.md)).

#### release-35

When the developer/agent is about to push, they shall run `npm run prepush`, which refuses a tree holding a conflict marker and then runs `spex lint`, the catalogs' check and the type check, pushing only once it passes ([DR-145](../decisions/145-merge-on-green.md)).

#### release-43

When the developer/agent runs `npm run test:affected`, the repository shall execute the same changed-path selection used for pull requests [[release-34](#release-34)] on the local platform, running CLI tests and spec lint for documentation alone and otherwise script tests followed by the selected workspace suites, with untracked files included and no implicit journeys, native browser acceptance or privileged hub lane ([DR-199](../decisions/199-release-gated-full-validation.md)).

#### release-31

A suite shall be deterministic by construction ([DR-145](../decisions/145-merge-on-green.md)):

- an order it reads from Git's listings or from a directory listing is sorted on both sides of the comparison, or read from the source whose order its subject promises;
- a step is bounded by the event the behavior names, never by wall-clock time;
- a tool's calls are asserted by where they went, never by their exact count;
- a scripted fault outlasts every call that may consume it before the call under test.

#### release-32

When the developer/agent runs `npm run test:linux`, optionally naming a workspace and the test command's arguments, the repository shall run that workspace's tests in a Linux container holding the CI runners' Node and Git versions over a copy of the working tree, so a difference between the developer's platform and the CI platform shows before a push ([DR-145](../decisions/145-merge-on-green.md)).

### CI Downloads

#### release-49

When a CI or release job installs the app's dependencies, it shall first restore Electron's and dugite's Git archives from Actions caches keyed by the runner's platform and each package's locked version, fetching an archive from its GitHub release only on a miss ([DR-228](../decisions/228-ci-keeps-its-downloads.md)):

- a successful job saves what a miss fetched under that key;
- npm's package cache is saved only by a job that installs, so no job saves it empty under an install's key.

#### release-50

When the cache seed is triggered by a push to `main` changing the lockfile or the cache tooling, or by an explicit request, it shall install the dependencies and fetch Electron on Linux, macOS and Windows, saving npm's package cache and the archives [[release-49](#release-49)] under `main` for pull requests and releases to restore, while running no build, suite or check ([DR-228](../decisions/228-ci-keeps-its-downloads.md)).

### Shared Runtime Dependencies

#### release-37

When a root build, continuous integration or pre-push validation checks the app installation, the dependency gate shall reject it unless its lock and installed tree satisfy the shared-runtime contract ([DR-167](../decisions/167-the-compiler-shares-the-apps-engine.md)):

- the lock and physical tree each hold exactly one installed package for each of `@sublang/playbook`, `@sublang/cligent` and `xstate`, with installed versions and dependency declarations matching the lock;
- the compiler declares Playbook as a required peer satisfied by that installed engine, and npm's dependency validation accepts the declared ranges under strict peer checking;
- resolving the shared packages from each shell, the core, the compiler and Playbook reaches the same respective physical installations;
- violations name the package and conflicting locations or declarations and exit unsuccessfully, including duplicates whose versions and ABI declarations agree.

## Verification

### Shared Runtime Dependency Coverage

#### release-38

When the dependency integration suite checks the installed app and isolated installation fixtures, the suite shall verify the gate's acceptance and refusal cases [[release-37](#release-37)]:

- the clean locked application passes from both shells, the core and compiler;
- a duplicate shared package, a stale installed version or declaration, a missing or incompatible Playbook peer, and a compiler resolving another engine each fail;
- duplicates with the same version and ABI still fail.

### Release Checks

#### release-23

When a release candidate tarball is inspected via `npm pack --dry-run`, the inspection shall find no test files and no source files that are not required at runtime in the file list, asserting the runtime-files hygiene of the `files` field [[release-12](#release-12)] and the workflow's package validation [[release-13](#release-13)].

### Release Workflow

#### release-40

When the repository-system audit reads the app release workflow and desktop packaging commands, the test suite shall assert the tag-only trigger, full app validation prerequisite [[release-18](#release-18)], native macOS and Windows jobs installing and building the tagged tree, versioned artifact names and missing-file failures, non-publishing package commands and the final release's dependency on both builds, required files, checksums and exclusive release-write permission [[release-39](#release-39)] [[release-19](#release-19)].

#### release-42

When the dependency audit runs over isolated lockfile and manifest fixtures, the test suite shall verify that app releases accept checksum-locked public registry runtimes and refuse local archives, Git sources, alternate hosts, absent checksums and local manifest overrides before installation [[release-41](#release-41)].

#### release-28

When the release-notes integration suite runs the actual notes command over isolated Git histories and published-release records, the suite shall verify exact-version curated notes with pinned repository links, same-channel published ancestor commit ranges, exclusion of drafts/unpublished tags/unrelated branches and stale `[Unreleased]` text, empty ranges, first releases and rejection of a tag naming another revision [[release-5](#release-5)] [[release-16](#release-16)], as well as channel titles, beta identity and download/source instructions [[release-11](#release-11)] [[release-27](#release-27)].

### Merge Gate

#### release-33

When the repository-system audit reads the CI, release, hub and cache workflows, the download-caches action, merge script and selection commands and exercises them over repository and isolated Git fixtures, the suite shall assert this validation-plan matrix:

| Case | Assertions |
| --- | --- |
| Pull-request lifecycle | A newer head cancels its prior run; full/manual validation is not cancelled by that rule [[release-30](#release-30)]. |
| Documentation alone | CLI tests and spec lint run; the ordinary `checks` gate succeeds with unselected jobs skipped and no stand-in [[release-34](#release-34)] [[release-44](#release-44)]. |
| Workspace and root ownership | Changed workspace fixtures reach every declared transitive dependent; each exact root-tool mapping selects its specified owners; unknown paths, missing mapped owners and root dependency/localization configuration select all workspaces [[release-34](#release-34)]. |
| Local working-tree selection | Committed, staged, unstaged and untracked changes and both sides of renames contribute; documentation and code use the same selection and test commands as CI [[release-43](#release-43)]. |
| Pull-request matrix | Linux Node 22 runs the selected suites and fast gates; Windows Node 22 runs only for selected CLI/UI/core work; journeys, native browser acceptance and the hub lane are skipped [[release-34](#release-34)]. |
| Full app | The supported platform/Node suites, all journey shards, native browser acceptance and privileged hub lane are selected [[release-34](#release-34)] [[release-36](#release-36)]. |
| Full CLI | CLI suites run on every supported platform/Node row and script suites on Linux and macOS only, with app journeys, native browser acceptance and the hub lane skipped [[release-34](#release-34)]. |
| Final gate | Successful classification and selected jobs with expected skips pass; failed, cancelled, missing or unexpectedly skipped selected work fails, and the gate runs after failed dependencies [[release-44](#release-44)]. |
| Merge | Only successful `checks` on the newest run's exact head permits merge, with the sole required status named `checks` [[release-29](#release-29)]. |
| Automatic triggers | CI and the hub lane have no schedules or push-to-main trigger; the hub lane accepts only reusable full-app invocation or explicit requests [[release-34](#release-34)] [[release-36](#release-36)]. |
| Download caches | Every install restores Electron's and dugite's archives first, keyed by platform and locked version, from where the installed tools read them, and only installing jobs save npm's cache [[release-49](#release-49)]; the cache seed alone runs on `main`, for lockfile or cache-tooling changes or on request, installing and fetching on all three platforms and running nothing else [[release-50](#release-50)]. |
| Existing local gates | Prepush rejects conflict markers [[release-35](#release-35)], Linux parity names the runner's Node and Git versions [[release-32](#release-32)], and Linux suite execution selecting the core requires Git LFS [[release-34](#release-34)]. |

#### release-45

When the repository-system audit reads both channel release workflows and their reusable validation dependencies, the suite shall verify that each invokes full validation with its own channel on the exact tagged tree with identical metadata preparation [[release-16](#release-16)], without a mutable-ref override or conditional bypass, and that publication depends on successful validation, with no prior-run polling or downstream repetition of the completed suites [[release-18](#release-18)], while the CLI explicitly builds before bypassing the standalone publication lifecycle [[release-12](#release-12)].

#### release-46

When release metadata and artifact checks run over isolated fixtures and actual archives, the suite shall verify channel-only idempotent manifest/lock preparation, unchanged dependencies, invalid-tag and incomplete-metadata refusal, duplicate-release/npm-version and registry-error refusal [[release-16](#release-16)], and packed archive/native metadata/compiler-receipt version mismatches [[release-8](#release-8)], while workflow audits verify preparation before installs across reusable jobs and the archived hub tree [[release-18](#release-18)].

#### release-47

When workflow audits inspect branch verification, the suite shall assert an explicit dispatch input, validated runner-local candidate tag without pushing it, shared packaging/artifact validation and actual tag-push-only publication effects [[release-48](#release-48)].

## References

[1]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[2]: https://keepachangelog.com/en/1.1.0/ "Keep a Changelog 1.1.0"
