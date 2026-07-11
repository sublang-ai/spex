<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PROJ: User-Facing Projects Behavior

## Intent

This spec defines user-visible behavior of project management in
the Spex desktop app: registering and creating local git projects
in the project palette, and showing repository and GitHub state in
the workspace's Repo tab, per
[DR-011](../decisions/011-project-workspace.md).
Project identity, forge binding, and removal semantics follow
[DR-006](../decisions/006-projects-and-forge.md).

## Registration

### PROJ-1

When the user confirms, in the project palette, a directory that
is the top level of a git work tree, the palette shall register
the directory as a project and make it the workspace's current
project.

When the confirmed directory is inside a work tree below its top
level, the palette shall register nothing and show a message
naming the work tree's top-level path; a directory that is no git
work tree at all is initialized silently per
[RUN-27](run-view.md#run-27).

### PROJ-2

While a project is already registered for a path, when the user
confirms that same path in the project palette, the palette shall
switch to the existing project and shall not create a second
project entry.

## Creation

### PROJ-3

When the user submits the project palette's create action with a
path and the specs-scaffold option on or off, the palette shall:

1. create the project directory under the parent directory,
2. initialize a git repository in it,
3. generate the spex specs scaffold
   ([SCAF-1](scaffold.md#scaf-1)) in it when the scaffold option is
   on, and generate no scaffold when it is off,
4. create an initial commit containing the generated files, and
5. register the project and make it the workspace's current
   project.

When any step fails, the palette shall report the failure, shall
not register the project, and shall leave already-created files on
disk for inspection.

## The Repo Tab

### PROJ-4

While a project is the workspace's current project, the Repo tab
shall show the repository state fields below:

| Field | Content |
| --- | --- |
| name | the project name |
| path | the absolute repository path |
| branch | the current branch name, or a detached-HEAD indicator |
| dirty | an indicator shown while the work tree has uncommitted changes, and hidden while it is clean |
| ahead/behind | commit counts relative to the upstream branch, hidden while no upstream is configured |

## Forge Binding

### PROJ-5

Where a project's `origin` remote resolves to a GitHub repository,
the forge panel shall show the bound `owner/repo` derived from the
`origin` remote and the gh CLI authentication status: the
authenticated account, or a not-authenticated indication.

### PROJ-6

Where a project is bound to a GitHub repository, while the gh CLI
is installed and authenticated, the forge panel shall show the
repository's open issues and open pull requests, each entry with
its number and title.

When the user activates an issue or pull-request entry, the forge
panel shall open that entry's GitHub page in the default browser.

### PROJ-7

Where a project has no GitHub binding, or the gh CLI is not
installed or not authenticated, the forge panel shall show setup
guidance naming the specific unmet condition — no GitHub `origin`
remote, gh not installed, or gh not authenticated — instead of
issue and pull-request lists.

While the GitHub panel shows setup guidance, the Repo tab shall
keep showing repository state ([PROJ-4](#proj-4)), and its remove
control shall remain functional.

## Session and Removal

### PROJ-8

When the user picks a project from the palette or opens one of its
sessions from the Dashboard, the workspace shall switch to that
project, restoring its last-active tab — except when a session in
it needs a human, in which case that session's tab shall be
focused, per [DR-011](../decisions/011-project-workspace.md).

### PROJ-9

When the user confirms removal in the Repo tab, the workspace
shall forget the project and clear it from the project bar,
leaving the repository directory, its files, and its git state on
disk unmodified.

While the project has a live session, the Repo tab shall disable
removal, stating that sessions must be ended first.

## Labels and Vocabulary

### PROJ-22

The project palette's path row shall offer distinct "Add" (an
existing repo) and "Create" (a new project) actions on the typed
path, and the palette shall list projects with filter-as-you-type
matching on name and path.

### PROJ-23

While a project has running sessions or sessions needing a human,
its palette row shall show that state — a pulsing emerald dot with
the running count, and an amber (question) or red (failure) dot
with the needs-you count — with text labels alongside the colors
([DR-010](../decisions/010-interface-craft.md) §7/§8).

### PROJ-24

Where the palette's create action offers the specs-scaffold
option, the option shall be labeled to say it applies when
creating, and the palette shall default it to on.

### PROJ-25

User-facing copy in the palette and the Repo tab shall say
"GitHub" and shall not use the internal adapter term "forge"
([DR-010](../decisions/010-interface-craft.md) §2).
