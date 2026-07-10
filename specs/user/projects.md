<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PROJ: User-Facing Projects Behavior

## Intent

This spec defines user-visible behavior of the Projects surface of
the Spex desktop app: registering and creating local git projects,
showing repository and forge state on project cards, and opening or
removing projects.
The Projects surface is the concept-model surface of
[DR-002](../decisions/002-desktop-app-architecture.md); project
identity, forge binding, and removal semantics follow
[DR-006](../decisions/006-projects-and-forge.md).

## Registration

### PROJ-1

Where the Projects surface offers registration of an existing
repository, when the user confirms, in the registration picker, a
directory that is the top level of a git work tree, the Projects
surface shall register the directory as a project and show its
project card.

When the confirmed directory is not the top level of a git work
tree, the Projects surface shall register nothing and show a
message naming the failed check; when the directory lies inside a
work tree below its top level, the message shall name the work
tree's top-level path.

### PROJ-2

While a project is already registered for a path, when the user
confirms that same path in the registration picker, the Projects
surface shall focus the existing project card and shall not create
a second project entry.

## Creation

### PROJ-3

Where the Projects surface offers creation of a new project, when
the user submits the creation form with a project name, a parent
directory, and the specs-scaffold option on or off, the Projects
surface shall:

1. create the project directory under the parent directory,
2. initialize a git repository in it,
3. generate the spex specs scaffold
   ([SCAF-1](scaffold.md#scaf-1)) in it when the scaffold option is
   on, and generate no scaffold when it is off,
4. create an initial commit containing the generated files, and
5. register the project and show its project card.

When any step fails, the Projects surface shall report the failure,
shall not register the project, and shall leave already-created
files on disk for inspection.

## Project Cards

### PROJ-4

While a project is registered, the project card shall show the
repository state fields below:

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

While the forge panel shows setup guidance, the project card shall
keep showing repository state ([PROJ-4](#proj-4)), and its open and
remove controls shall remain functional.

## Session and Removal

### PROJ-8

When the user activates the open control on a project card, the
Projects surface shall bring that project's session view into
focus, opening the view when the project has none.

When the user activates the open control again, the Projects
surface shall focus the same view and shall never open a second
session view for the same project, per the
one-live-session-per-project rule of
[DR-002](../decisions/002-desktop-app-architecture.md).

### PROJ-9

When the user confirms removal of a project, the Projects surface
shall remove the project card and forget the project, leaving the
repository directory, its files, and its git state on disk
unmodified.

While the project has a live session, the Projects surface shall
refuse removal with a message stating that the session must be
finished or closed first.
