<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PROJ: Projects

## Intent

This spec covers project management in the Spex desktop app — its
palette and Repo-tab behavior, the core-service implementation
behind it, and the integration coverage that verifies both.
Users register and create local git projects in the project
palette, and the workspace's Repo tab shows repository and GitHub
state: a project is a local git repository, with registry
persistence in the app-local SQLite store, repository state
collected from local git only, and forge access exclusively
through the forge adapter interface.
Integration coverage exercises registration and card state against
fixture repositories, the create-project flow, forge panels
against a stubbed gh CLI, and removal without touching the
repository on disk.

## External Behavior

### Registration

#### PROJ-1

When the user confirms, in the project palette, a directory that
is the top level of a git work tree, the palette shall register
the directory as a project and make it the workspace's current
project.

When the confirmed directory is inside a work tree below its top
level, the palette shall register nothing and show a message
naming the work tree's top-level path.
When the confirmed directory is no git work tree at all, the
palette shall initialize a git repository in it and register it as
a project, without further prompts.

#### PROJ-2

While a project is already registered for a path, when the user
confirms that same path in the project palette, the palette shall
switch to the existing project and shall not create a second
project entry.

### Creation

#### PROJ-3

Where the specs-scaffold option is backed by the spex scaffold
generator ([SCAF-1](scaffold.md#scaf-1)), when the user submits the
project palette's create action with a path and the scaffold option
on or off, the palette shall:

1. create the project directory under the parent directory,
2. initialize a git repository in it,
3. generate the spex specs scaffold in it when the scaffold option
   is on, and generate no scaffold when it is off,
4. create an initial commit containing the generated files, and
5. register the project and make it the workspace's current
   project.

When any step fails, the palette shall report the failure, shall
not register the project, and shall leave already-created files on
disk for inspection.

### The Repo Tab

#### PROJ-4

While a project is the workspace's current project, the Repo tab
shall show the repository state fields below:

| Field | Content |
| --- | --- |
| name | the project name |
| path | the absolute repository path |
| branch | the current branch name, or a detached-HEAD indicator |
| dirty | an indicator shown while the work tree has uncommitted changes, and hidden while it is clean |
| ahead/behind | commit counts relative to the upstream branch, hidden while no upstream is configured |

### Forge Binding

#### PROJ-5

Where a project's `origin` remote resolves to a GitHub repository,
the forge panel shall show the bound `owner/repo` derived from the
`origin` remote and the gh CLI authentication status: the
authenticated account, or a not-authenticated indication.

#### PROJ-6

Where a project is bound to a GitHub repository, while the gh CLI
is installed and authenticated, the forge panel shall show the
repository's open issues and open pull requests, each entry with
its number and title.

When the user activates an issue or pull-request entry, the forge
panel shall open that entry's GitHub page in the default browser.

#### PROJ-7

Where a project has no GitHub binding, or the gh CLI is not
installed or not authenticated, the forge panel shall show setup
guidance naming the specific unmet condition — no GitHub `origin`
remote, gh not installed, or gh not authenticated — instead of
issue and pull-request lists.

While the GitHub panel shows setup guidance, the Repo tab shall
keep showing repository state ([PROJ-4](#proj-4)), and its remove
control shall remain functional.

### Session and Removal

#### PROJ-8

When the user picks a project from the palette or opens one of its
sessions from the Dashboard, the workspace shall switch to that
project, restoring its last-active tab — except when a session in
it needs a human, in which case that session's tab shall be
focused, per [DR-011](../decisions/011-project-workspace.md).

#### PROJ-9

When the user confirms removal in the Repo tab, the workspace
shall forget the project and clear it from the project bar,
leaving the repository directory, its files, and its git state on
disk unmodified.

While the project has a live session, the Repo tab shall disable
removal, stating that sessions must be ended first.

### Labels and Vocabulary

#### PROJ-22

The project palette's path row shall offer distinct "Add" (an
existing repo) and "Create" (a new project) actions on the typed
path, and the palette shall list projects with filter-as-you-type
matching on name and path.

#### PROJ-23

While a project has running sessions or sessions needing a human,
its palette row shall show that state — a pulsing emerald dot with
the running count, and an amber (question) or red (failure) dot
with the needs-you count — with text labels alongside the colors
([DR-010](../decisions/010-interface-craft.md) §7/§8).

#### PROJ-24

Where the palette's create action offers the specs-scaffold
option, the option shall be labeled to say it applies when
creating, and the palette shall default it to on.

#### PROJ-25

User-facing copy in the palette and the Repo tab shall say
"GitHub" and shall not use the internal adapter term "forge"
([DR-010](../decisions/010-interface-craft.md) §2).

## Internal Behavior

### Registry

#### PROJ-10

Where the core service manages projects, the project registry shall
persist one entry per project — identifier, display name, absolute
repository path, and creation time — in the app-local SQLite store
([DR-004](../decisions/004-config-and-persistence.md)), and shall
restore all entries on core startup so registered projects survive
app restarts.

When a project is removed, the project registry shall delete only
that project's registry entries; it shall not delete or modify any
file under the repository path.

### Repository State

#### PROJ-11

Where project repository state is collected — current branch or
detached HEAD, dirty flag, ahead/behind counts, and `origin` remote
URL — the repo-state provider shall obtain it exclusively by
running local git commands against the project work tree.

The repo-state provider shall perform no network operation while
collecting state, so ahead/behind counts reflect the locally
recorded upstream ref.

#### PROJ-12

While projects are registered, when the app window gains focus,
and on a periodic interval bounded between 10 seconds and 5
minutes, the repo-state provider shall refresh the projects'
repository state.

When a refresh attempt fails for a project, the repo-state provider
shall keep that project's last successfully collected state
available, marked stale, and shall not terminate the core service.

### Forge Access

#### PROJ-13

Where a project's `origin` remote URL matches a GitHub HTTPS or SSH
remote form, the binding detector shall derive the bound
`owner/repo` from the URL.

Where a project has no `origin` remote, or its URL matches neither
form, the binding detector shall report the project as unbound
rather than guessing a binding.

#### PROJ-14

Where core code needs forge data or forge authentication status,
the core service shall obtain it exclusively through the forge
adapter interface of
[DR-006](../decisions/006-projects-and-forge.md); no module outside
adapter implementations shall invoke a forge CLI or forge HTTP API
directly, so further forges can be added without changing callers.

#### PROJ-15

Where the GitHub forge adapter performs an operation — auth status,
issue listing, or pull-request listing — it shall shell out to the
locally authenticated `gh` CLI [[1]] requesting machine-readable
JSON output, and parse that output.

The GitHub forge adapter shall never read, persist, or log tokens
or other credentials; authentication state shall remain solely in
gh's own storage.

#### PROJ-16

When a forge adapter operation fails — executable missing, not
authenticated, network failure, non-zero exit, or unparsable
output — the forge adapter shall return a typed failure carrying a
condition category and human-readable guidance.

The core service shall forward that guidance as the forge panel
state for the affected project and shall neither crash nor stop
serving the project's other state.

## Verification

### Registration and Card Coverage

#### PROJ-17
Where a fixture git repository exists with a named branch checked
out, an uncommitted change, and a local upstream remote that it is
ahead of and behind by known commit counts, when the repository is
registered through the registration flow ([PROJ-1](#proj-1)), the
test suite shall assert that a project card appears showing the
project name, the absolute path, the branch name, a dirty
indicator, and the expected ahead/behind counts
([PROJ-4](#proj-4)), collected without any network access
([PROJ-11](#proj-11)).

The test suite shall also assert that confirming the same path
again creates no duplicate entry ([PROJ-2](#proj-2)), that
confirming a directory inside a work tree below its top level is
rejected with a message and creates no project entry
([PROJ-1](#proj-1)), and that confirming a directory that is no
git work tree initializes a repository there and registers the
project ([PROJ-1](#proj-1)).

#### PROJ-18
Where a temporary parent directory exists, when the create-project
flow completes with the scaffold option on, the test suite shall
assert that the project directory exists, is the top level of a git
work tree, contains the generated specs scaffold, and has an
initial commit containing the generated files, and that a project
card for it appears ([PROJ-3](#proj-3)).

When the flow completes with the scaffold option off, the test
suite shall assert that the directory, git repository, initial
commit, and project card still result while no specs scaffold is
generated ([PROJ-3](#proj-3)).

### Forge Coverage

#### PROJ-19
Where a registered fixture repository's `origin` remote points at a
GitHub repository, and a stub `gh` executable on `PATH` reports an
authenticated account and returns fixture JSON for issue and
pull-request listings ([PROJ-15](#proj-15)), when the project's
forge panel is loaded, the test suite shall assert that the panel
shows the bound `owner/repo` derived from the remote
([PROJ-5](#proj-5), [PROJ-13](#proj-13)), the authenticated
account, and the fixture issues and pull requests with their
numbers and titles ([PROJ-6](#proj-6)), and that activating an
entry passes that entry's GitHub URL to the stubbed browser
opener.

#### PROJ-20
Where the stub `gh` reports a not-authenticated state, or `gh` is
absent from `PATH`, or the registered repository has no GitHub
`origin` remote, when the project's forge panel is loaded, the test
suite shall assert that setup guidance naming the specific unmet
condition is shown instead of issue and pull-request lists
([PROJ-7](#proj-7)), that the project card still shows repository
state, and that the core keeps serving subsequent commands
([PROJ-16](#proj-16)).

### Removal Coverage

#### PROJ-21
Where a fixture repository is registered, when the project is
removed and the core service is restarted, the test suite shall
assert that no project card or registry entry for it remains after
the restart ([PROJ-10](#proj-10)), and that the repository
directory's files and git state are identical to their state
before removal ([PROJ-9](#proj-9)).

### Label Coverage

#### PROJ-26

Where the Projects surface renders with one project holding a live
session and one without, the test suite shall assert that the mode
choices read "Add an existing repo" and "Create a new project"
with the submit label mirroring the selected mode
([PROJ-22](#proj-22)), that the live project's open control reads
"Open live session" and carries the pulsing status dot while the
other project's reads "Open session" ([PROJ-23](#proj-23)), and
that no user-facing string on the surface contains the word
"forge" ([PROJ-25](#proj-25)).

## References

[1]: https://cli.github.com/manual/ "GitHub CLI manual"
