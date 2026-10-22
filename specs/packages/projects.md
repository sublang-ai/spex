<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# projects: Projects

## Intent

This spec covers project management in the Spex desktop app — its palette and Overview-tab behavior, the core-service implementation behind it, and the integration coverage that verifies both.
Users add and create local git projects in the project palette, and the workspace's Overview tab shows the project's ledger group under its repository and GitHub state: a project is a working folder paired with a spex repository holding its records ([DR-103](../decisions/103-the-home-and-its-groups.md)), the pair recorded in the home file, repository state collected from local git only, and forge access exclusively through the forge adapter interface.
Integration coverage exercises registration and card state against fixture repositories, the create-project flow, forge panels against a stubbed gh CLI, and removal without touching the repository on disk.

## External Behavior

### Registration

#### projects-1

When the user confirms a directory in the project palette, the palette shall resolve the confirmed directory by the cases below:

- The top level of a git work tree: the palette pairs the directory with a spex repository [[storage-6](storage.md#storage-6)] — while signed in to any instance, through the picker of each signed-in instance's matching spex repositories, your namespace there and its groups [[space-58](space.md#space-58)], else locally — the environment the directory holds at its root installed, or one written there [[storage-6](storage.md#storage-6)], and makes it the workspace's current project.
- Inside a work tree below its top level: the palette registers nothing and shows a message naming the work tree's top-level path.
- No git work tree at all: the palette registers nothing and shows a message naming the condition and pointing at the Create action [[projects-22](#projects-22)], which initializes the repository on the same path — an existing-repo action never initializes a repository on its own.

#### projects-2

While a project is already registered for a path, when the user confirms that same path in the project palette, the palette shall switch to the existing project and shall not create a second project entry.

### Creation

#### projects-3

Where the specs-scaffold option is backed by the spex scaffold generator [[scaffold-1](scaffold.md#scaffold-1)], when the user submits the project palette's create action with a path and the scaffold option on or off, the palette shall:

1. create the project directory under the parent directory,
2. initialize a git repository in it,
3. generate the spex specs scaffold in it with the scaffold command [[projects-31](#projects-31)] when the scaffold option is on, in the creating page's resolved interface language [[localization-2](localization.md#localization-2)] using the scaffold's localized templates [[scaffold-28](scaffold.md#scaffold-28)] — the scaffold pinning the creator's git identity as the project's copyright holder [[scaffold-58](scaffold.md#scaffold-58)] — and generate no scaffold when it is off,
4. create an initial commit containing the generated files, or an empty initial commit when scaffolding is off, and
5. pair the project with a spex repository as Add does [[projects-1](#projects-1)] and make it the workspace's current project.

- Any step failing: the palette reports the failed operation and its output — a failed scaffold naming the command that ran [[projects-31](#projects-31)], a failed initial commit in the app's own words with Git's beneath them [[projects-34](#projects-34)] — does not register the project, and leaves already-created files on disk for inspection.
- A target already containing its own Git repository: the palette changes nothing and directs the user to Add; where that repository has no initial commit, the guidance first directs the user to finish that commit in a terminal ([DR-099](../decisions/099-project-creation-preserves-existing-repositories.md)).

#### projects-31

When the create flow scaffolds a project [[projects-3](#projects-3)], the core shall run the scaffold command the shell named when starting it — the app's own copy of the scaffold CLI on the shell's own executable, under the variables that executable runs as Node with — or, with none named, the registry's `npx --yes @sublang/spex`, with `scaffold`, its language arguments, and the project path appended, in the project directory ([DR-096](../decisions/096-the-app-supplies-the-scaffold.md)):

- Scaffold exiting non-zero: the failure names the command that ran and its output, and, for the registry's, that the app's own CLI was not supplied.
- Language: `project.create` accepts an optional `scaffoldLanguage` of `en` or `zh`, passed as `--lang` to the scaffold; with none named, the core uses its own resolved interface language [[localization-2](localization.md#localization-2)] ([DR-100](../decisions/100-new-project-specs-follow-the-readers-language.md)).

#### projects-34

When the create flow's initial commit fails [[projects-3](#projects-3)], the palette shall report it in the core's own words, phrased in the home's interface language [[core-service-111](core-service.md#core-service-111)] — that Git could not make the first commit, the cause's key phrase where Git's output names one of the cases below, and that the generated files stay in the folder for the person to finish the initial commit in a terminal, then use Add — with Git's own output, carried whole as the refusal's `output` detail, shown beneath those words ([DR-099](../decisions/099-project-creation-preserves-existing-repositories.md)):

| Git's output names | The key phrase |
| --- | --- |
| a signing key it lacks (`user.signingkey` … `needs to be configured`) | commit signing is on, but no key is configured |
| a signing program that failed (`failed to sign`) | commit signing is on, but signing failed |
| no identity (`Please tell me who you are`, `Author identity unknown`, `Committer identity unknown`, `no email was given`, `empty ident name`) | no Git name and email are configured |
| anything else | none: the sentence stands alone |

#### projects-27

When the user invokes an Academy-example action ([DR-015](../decisions/015-reference-content.md), [DR-137](../decisions/137-reopen-the-removed-academy-example.md)), Spex shall make that project current, seeding the bundled corpus into a new or empty directory with one Git commit, or registering the unregistered existing repository if its root history identifies a prior Spex Academy seed:

- Existing seeded Academy: no corpus is copied over its current files or Git history.
- Other nonempty target: the action reports the refusal and registers nothing.
- Target already registered: the core's `conflict` names the registered path as a detail of the refusal, apart from its words, and the palette makes that project current.

### The Code's Clone

#### projects-37

When the core clones a project's code from the remote its `project.json` names [[storage-3](storage.md#storage-3)], it shall hand Git the credential that a signed-in instance of one of its spex repository's placements — one its clone holds [[storage-34](storage.md#storage-34)] or its placement files name [[storage-36](storage.md#storage-36)] — brokers [[git-host-9](git-host.md#git-host-9)] only where that remote lies under that instance's reported Git origin [[git-host-5](git-host.md#git-host-5)], the project's own instance [[storage-31](storage.md#storage-31)] first where several do, and name no helper of the app's for any other remote, one under the Git origin of an instance no placement is at included, so this device's own credentials serve it ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

### The Overview Tab

#### projects-4

While a project is the workspace's current project, the Overview tab shall show the project's ledger group — History, Now, Up next, and Sources exactly as the Dashboard draws it for that project [[dashboard-26](dashboard.md#dashboard-26)], with no project filter — under a repository header carrying the fields below ([DR-038](../decisions/038-history-is-done-work.md)):

| Field | Content |
| --- | --- |
| name | the project name |
| path | the absolute repository path |
| records | the spex repository's name with its group, and its state [[space-61](space.md#space-61)] |
| branch | the current branch name, or a detached-HEAD indicator |
| dirty | an indicator shown while the work tree has uncommitted changes, and hidden while it is clean |
| ahead/behind | commit counts relative to the upstream branch, hidden while no upstream is configured |

#### projects-36

When a client sends `project.status`, the core shall reply with the project's locally collected repository state [[projects-11](#projects-11)], carrying `originUrl` only once the home's default instance [[storage-2](storage.md#storage-2)] and each instance it lists have reported their Git origins [[git-host-5](git-host.md#git-host-5)] and the code's remote lies outside every one of them, with any HTTP(S) user removed ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)).

### Forge Binding

#### projects-5

Where a project's `origin` remote resolves to a GitHub repository, the forge panel shall show the bound `owner/repo` derived from the `origin` remote and the gh CLI authentication status: the authenticated account, or a not-authenticated indication.

#### projects-6

Where a project is bound to a GitHub repository, while the gh CLI is installed and authenticated, the forge panel shall show the repository's open issues and open pull requests in the row representation shared with the Dashboard's Sources rows [[forge-work-lists-1](forge-work-lists.md#forge-work-lists-1)] — each entry with its number, its title, its forge labels as tags, and a Queue control capturing the entry as an intent:

- Activating an entry's title opens that entry's GitHub page in the default browser.
- An entry whose issue or pull request already has an open intent shows that intent's state in place of the Queue control, and regains the control when that intent closes.

#### projects-7

Where a project has no GitHub binding, or the gh CLI is not installed or not authenticated, the forge panel shall show setup guidance naming the specific unmet condition instead of issue and pull-request lists:

| Unmet condition | Guidance |
| --- | --- |
| no `origin` remote | "No GitHub origin remote. Add one (git remote add origin …) to see issues and PRs." |
| an unbound `origin` remote under the reported Git origin [[git-host-5](git-host.md#git-host-5)] of the project's instance — its spex repository's [[storage-31](storage.md#storage-31)], or the home's default instance [[storage-2](storage.md#storage-2)] where it has none | "Issues and PRs come from GitHub; this project's code is on this instance." |
| any other unbound `origin` remote while the home's default instance or an instance it lists has not reported its Git origin [[git-host-5](git-host.md#git-host-5)], or under another instance's reported Git origin | "Issues and PRs come from GitHub; this project's code is on a remote." |
| any other `origin` remote not on GitHub | "Issues and PRs come from GitHub; this project's origin is at ⟨host⟩.", ⟨host⟩ being the remote's host name in its URL or scp-like form, or a local remote as written, and never a credential its URL carries |
| gh not installed | names that gh is not installed |
| gh not authenticated | names that gh is not authenticated |

- While the panel shows setup guidance, the Overview tab keeps showing repository state [[projects-4](#projects-4)] and its remove control remains functional.
- While the Sources band is folded, the Overview's header names the guidance beside the repository state, so the reason GitHub is empty is read without opening the band; an open band carries the guidance itself and the header repeats nothing ([DR-069](../decisions/069-key-phrases-not-sentences.md)).
- The guidance follows the current origin classification on every reply, a cached reply included, and names nothing behind any instance ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)).

### Session and Removal

#### projects-8

When the user picks a project from the palette or opens one of its sessions from the Dashboard, the workspace shall switch to that project, restoring its last-active tab — except when a session in it needs a human, in which case that session's tab shall be focused, per [DR-011](../decisions/011-project-workspace.md).

#### projects-9

When the user confirms removal in the Overview tab, the workspace shall forget the working folder, delete its spex repository's clone and clear it from the sidebar, leaving the working folder, its files — its `spex.yaml` and `spex.lock` among them, the code's own [[environments-26](environments.md#environments-26)] — and its git state on disk unmodified apart from the exported skills Spex removes with their exclude entries [[environments-8](environments.md#environments-8)], and nothing at any instance changed ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- While anything in the clone has reached no placement — a local-only spex repository, or a unit no placement's `spex` holds as the clone last fetched or pushed it [[space-12](space.md#space-12)] — the confirm says what would be lost and asks a second confirmation naming the count.

- While a session of the project has a turn in flight, the Overview tab disables removal, stating that the running turn must finish or be aborted first ([DR-051](../decisions/051-runtime-held-for-a-turn.md)).
- Removal confirms inline with Remove and Keep ([DR-010](../decisions/010-interface-craft.md) §4); Keep returns focus to the Remove control, and a completed removal moves focus to the sidebar's Dashboard entry — never to the page body.

### Labels and Vocabulary

#### projects-22

Where no native folder picker exists, the project palette's path row shall offer distinct "Add" (an existing repo) and "Create" (a new project) actions on the typed path, titled "Register this existing repository" and "Create a new repository at this path" and both disabled until a path is typed; where the native picker exists, the switcher shall offer its folder action for adding an existing repository and leave new-project creation to the local-project add form; in both shells the palette shall list projects with filter-as-you-type matching on name and path ([DR-139](../decisions/139-desktop-existing-projects-use-folder-picker.md)):

- With no project registered there is nothing to filter: the palette drops its filter and names itself an add flow; its ordinary entry opens with the path field focused and leads the list with the Academy-example action [[projects-27](#projects-27)], while the welcome page's "Add a local project" entry omits that repeated choice and separates an existing repository from creating a new one [[run-view-168](run-view.md#run-view-168)] ([DR-133](../decisions/133-the-first-project-picker-leads-with-a-folder.md));
- the palette is where projects are browsed, chosen and created; it is not the only place one is added, a Space repair adding the project it already names from the folder it has checked ([DR-065](../decisions/065-repairs-the-reader-answers.md)).

#### projects-42

When the welcome page's local-project action [[run-view-168](run-view.md#run-view-168)] or the sidebar's Projects plus [[run-view-67](run-view.md#run-view-67)] opens the add form, regardless of whether projects are registered, the palette shall show a clearly clickable but neutral existing-folder choice where the native picker exists, or an existing-repository path where it does not, and a separate expandable new-project path with its specs-scaffold option ([DR-133](../decisions/133-the-first-project-picker-leads-with-a-folder.md), [DR-134](../decisions/134-specs-first-welcome-and-distinct-project-paths.md), [DR-135](../decisions/135-welcome-flow-copy-and-scoped-academy-note.md), [DR-136](../decisions/136-quieter-welcome-flow-and-academy-choice.md), [DR-139](../decisions/139-desktop-existing-projects-use-folder-picker.md)):

- when the native folder picker is available, the folder choice shall receive initial focus;
- without a native folder picker, the existing-path field shall receive initial focus;
- where a folder picker is available, no manual existing-path control shall appear in either the add form or the switcher; opening the new-project path shall leave the folder action visible;
- the creation form shall have no bottom link back to adding an existing repository; its existing-folder action shall remain available above the form, or where no native folder picker exists, an alternative above the form shall reopen the existing-path field;
- the existing path shall name a Git repository already on disk, while the new path shall name a folder that Spex will create and initialize as a Git repository;
- adding an existing repository and creating a new one shall keep their distinct core actions [[projects-1](#projects-1)] [[projects-3](#projects-3)].

#### projects-23

While a project has sessions with a turn in flight or sessions needing a human, its palette row shall show that state — a pulsing emerald dot with the running count, and an amber (question) or red (failure) dot with the needs-you count — with text labels alongside the colors ([DR-010](../decisions/010-interface-craft.md) §7/§8).

#### projects-24

Where the palette's create action offers the specs-scaffold option, the option shall be labeled to say it applies when creating, appear once a path is typed beside the actions it qualifies, and default to on.

#### projects-25

User-facing copy in the palette and the Overview tab shall use plain words — "GitHub" for the forge, "Add" and "Create" for the path actions, sentence case throughout — and shall not use an internal term such as "forge", "stamp", or "ledger" ([DR-010](../decisions/010-interface-craft.md) §2).

### Surface Fit

#### projects-30

While the project palette is open, the palette shall stand inside the window at every window height ([DR-041](../decisions/041-chrome-that-fits.md) §9), the project list yielding so the path row, its options, and any failure message [[projects-1](#projects-1)] keep their place:

- the palette is a fixed overlay that nothing can scroll, so what falls outside the window is unreachable;
- the gap above the palette is a proportion of a tall window and stops growing in a short one.

## Internal Behavior

### Registry

#### projects-10

Where the core manages projects, the home file shall pair each working folder with its spex repository's key [[storage-2](storage.md#storage-2)], the key being the clone's path under `workspace/` and no identity Spex mints [[storage-6](storage.md#storage-6)] ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- removing a project forgets the pair and deletes the clone; the working folder remains;
- the removal is one step at its instant: every session of the clone held under Playbook's management lease — a lease another writer holds refusing it `busy` — then, with nothing awaited, a session that appeared meanwhile or a clone moved or replaced since refusing it as changed meanwhile, as a home file that no longer reads does [[storage-2](storage.md#storage-2)], the pair forgotten and the clone deleted; it waits for no other work ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- a clone no pair names, and a pair whose clone is missing, are reported as repairs without automatic pairing.

### Repository State

#### projects-11

Where project repository state is collected — current branch or detached HEAD, dirty flag, ahead/behind counts, and `origin` remote URL — the repo-state provider shall obtain it exclusively by running local git commands against the project work tree:

- The repo-state provider performs no network operation while collecting state, so ahead/behind counts reflect the locally recorded upstream ref.

#### projects-12

While projects are registered, when the app window gains focus, and on a periodic interval bounded between 10 seconds and 5 minutes, the repo-state provider shall refresh the projects' repository state:

- A failed refresh attempt for a project keeps that project's last successfully collected state available, marked stale, and does not terminate the core service.

### Forge Access

#### projects-13

Where a project's `origin` remote URL matches a GitHub HTTPS or SSH remote form, the binding detector shall derive the bound `owner/repo` from the URL:

- No `origin` remote, or a URL matching neither form: the binding detector reports the project as unbound rather than guessing a binding.

#### projects-14

Where core code needs forge data or forge authentication status, the core service shall obtain it exclusively through the forge adapter interface of [DR-006](../decisions/006-projects-and-forge.md); no module outside adapter implementations shall invoke a forge CLI or forge HTTP API directly, so further forges can be added without changing callers.

#### projects-15

Where the GitHub forge adapter performs an operation — auth status, issue listing, or pull-request listing — it shall shell out to the locally authenticated `gh` CLI [[1]] requesting machine-readable JSON output, and parse that output:

- The GitHub forge adapter never reads, persists, or logs tokens or other credentials; authentication state remains solely in gh's own storage.

#### projects-16

When a forge adapter operation fails — executable missing, not authenticated, network failure, non-zero exit, or unparsable output — the forge adapter shall return a typed failure carrying a condition category and human-readable guidance:

- The core service forwards that guidance as the forge panel state for the affected project, applying the origin presentation [[projects-7](#projects-7)], and neither crashes nor stops serving the project's other state.

## Verification

### Registration and Card Coverage

#### projects-17

Where a fixture git repository exists with a named branch checked out, an uncommitted change, and a local upstream remote that it is ahead of and behind by known commit counts, when the repository is registered through the registration flow [[projects-1](#projects-1)], the test suite shall assert that a project card appears showing the project name, the absolute path, the branch name, a dirty indicator, and the expected ahead/behind counts [[projects-4](#projects-4)], collected without any network access [[projects-11](#projects-11)], and shall assert the palette cases below:

- Confirming the same path again creates no duplicate entry [[projects-2](#projects-2)], the core's `conflict` carrying the registered path as a detail of its reply [[projects-27](#projects-27)].
- Pairing a repair's spex repository with a folder keeps its key; a clone no pair names prompts the repair without silently pairing anything [[projects-10](#projects-10)].
- Confirming a directory inside a work tree below its top level is rejected with a message and creates no project entry [[projects-1](#projects-1)].
- Confirming a directory that is no Git work tree registers nothing and points to the Create action [[projects-1](#projects-1)].
- Signed in to two stand-in instances each holding a group `acme`: the picker offers the `acme` of each, and picking the second's pairs the folder with a spex repository the second stand-in lists and the first does not [[projects-1](#projects-1)].

#### projects-18

Where a temporary parent directory exists, when the create-project flow completes, the test suite shall assert the scaffold option's cases below:

- Scaffold option on: the project directory exists, is the top level of a git work tree, contains the generated specs scaffold whose `specs/packages/licensing.md` names the repository's configured git identity as the copyright holder in `licensing-9`, and has an initial commit containing the generated files, and a project card for it appears [[projects-3](#projects-3)].
- Scaffold option on without a configured git identity: the scaffold's `licensing-9` keeps its `<holder>` placeholder and names no template holder; with Git requiring a configured identity, the initial commit fails, the refusal reads that Git could not make the first commit because no Git name and email are configured, with the guidance to finish the commit in a terminal, then Add, and Git's own words as its `output` detail, and no project is registered [[projects-3](#projects-3)] [[projects-34](#projects-34)].
- Scaffold language: the real CLI produces the language named by the request, or the core's resolved language when none is named, with its authoring-language declaration and generated files committed [[projects-31](#projects-31)].
- Scaffold option off: the directory, git repository, initial commit, and project card still result while no specs scaffold is generated [[projects-3](#projects-3)].
- Git staging or commit failure: the real Git refusal reaches the caller — staging's in the refusal's words, and a commit's, naming no case, as its `output` detail beneath the sentence alone — no project is registered, and the generated files remain available for inspection [[projects-3](#projects-3)] [[projects-34](#projects-34)].
- Commit signing required with no signing key configured, and again with a signing program that fails, each under an English and a Chinese core: the refusal reads, in that core's language, that Git could not make the first commit, the case's key phrase, and the terminal guidance, with Git's own line as its `output` detail [[projects-34](#projects-34)].
- An existing repository, with or without an initial commit: Create refuses before mutation and names the applicable recovery, preserving the repository's files, index, and HEAD [[projects-3](#projects-3)].

#### projects-32

Where the core starts with a scaffold command and its variables under a command runner that records what it is asked to run, when the test suite creates a project with the scaffold option on, the test suite shall assert the scaffold command's cases below:

- Command exiting zero: the runner ran that command with `scaffold`, `--lang` and the resolved language, and the project path appended, in the project directory, under those variables, and the project is registered [[projects-31](#projects-31)].
- Command exiting non-zero: the refusal names that command and its output, and the project is not registered [[projects-31](#projects-31)].
- No command named: the runner ran `npx --yes @sublang/spex`, and its failure names that command and that the app's own CLI was not supplied [[projects-31](#projects-31)].

### Forge Coverage

#### projects-19

Where a registered fixture repository's `origin` remote points at a GitHub repository, and a stub `gh` executable on `PATH` reports an authenticated account and returns fixture JSON for issue and pull-request listings [[projects-15](#projects-15)], when the project's forge panel is loaded, the test suite shall assert that the panel shows the bound `owner/repo` derived from the remote [[projects-5](#projects-5)] [[projects-13](#projects-13)], the authenticated account, and the fixture issues and pull requests with their numbers, titles, forge labels as tags, and Queue controls [[projects-6](#projects-6)], and that activating an entry's title passes that entry's GitHub URL to the stubbed browser opener [[projects-6](#projects-6)].

#### projects-20

Where the stub `gh` reports a not-authenticated state, or `gh` is absent from `PATH`, or the registered repository has no `origin` remote or one not on GitHub, when the project's forge panel is loaded, the test suite shall assert that setup guidance naming the specific unmet condition is shown instead of issue and pull-request lists [[projects-7](#projects-7)], that the project card still shows repository state, and that the core keeps serving subsequent commands [[projects-16](#projects-16)]:

- No `origin` remote: the guidance is the no-remote sentence exactly [[projects-7](#projects-7)].
- An `origin` remote before the instance has reported its Git origin: the guidance is the generic remote sentence, carrying no URL or hostname [[projects-7](#projects-7)].
- Code cloned from the instance's reported Git origin: fresh and cached guidance are the instance sentence [[projects-7](#projects-7)], `project.status` omits `originUrl` while retaining its local branch state [[projects-36](#projects-36)], and a restarted core awaiting its first host description serves the generic sentence from the same cache [[projects-7](#projects-7)], exposes no origin in initial metadata [[projects-36](#projects-36)], and triggers no host read for either local command [[projects-11](#projects-11)].
- Code outside the instance's reported Git origin: the guidance names that remote's host [[projects-7](#projects-7)] and `project.status` carries its credential-free URL [[projects-36](#projects-36)].

#### projects-38

Where a real core on a scratch home is signed in to two stand-in instances over distinct Git backends, the first being the home's default instance, with three projects at the first whose code is at the first's Git origin, at the second's, and at another origin, and a local-only project whose code is at the first's Git origin, when each project's forge panel and `project.status` are read once both instances have reported their Git origins, and again after a restart with the second signed out and the first read anew, the test suite shall assert the cases below:

| The project's code | Both reported | After the restart |
| --- | --- | --- |
| at the first's Git origin | the instance sentence [[projects-7](#projects-7)], no `originUrl` [[projects-36](#projects-36)] | the same |
| at the second's Git origin | the generic remote sentence [[projects-7](#projects-7)], no `originUrl` [[projects-36](#projects-36)] | the same |
| at another origin | that origin's host named [[projects-7](#projects-7)], its credential-free URL as `originUrl` [[projects-36](#projects-36)] | the generic remote sentence [[projects-7](#projects-7)], no `originUrl` [[projects-36](#projects-36)] |
| the local-only project's, at the first's Git origin | the instance sentence [[projects-7](#projects-7)], no `originUrl` [[projects-36](#projects-36)] | the same |

#### projects-29

Where the Overview tab renders a project whose GitHub binding names an unmet condition, when the reader folds its Sources band and opens it again, the test suite shall assert that the header names the guidance beside the repository state only while the band is folded, and that the open band carries the guidance while the header repeats nothing [[projects-7](#projects-7)].

### Code Clone Coverage

#### projects-39

Where a real core on a scratch home is signed in to two stand-in instances over distinct Git backends, each serving private code through its real HTTP Git transport and recording each credential it brokers, and the first lists two projects' spex repositories whose `project.json` names code at the first's Git origin and at the second's respectively, when the test suite joins each over the protocol with this device's Git holding no credential of its own, the test suite shall assert that the first's code clones with a credential the first instance brokered [[projects-37](#projects-37)], and that the second's is brokered by neither instance and fails, leaving no code cloned [[projects-37](#projects-37)].

#### projects-41

Where a real core on a scratch home is signed in to two stand-in instances over distinct Git backends, each serving private code and recording each credential it brokers, and the first lists a project's spex repository whose placement file names a placement at the second and whose `project.json` names code at the second's Git origin, when the test suite joins it at the first with this device's Git holding no credential of its own, the test suite shall assert that the code clones with a credential the second brokered [[projects-37](#projects-37)].

### Removal Coverage

#### projects-21

Where a fixture repository is registered with a local-only spex repository holding one session, when the project is removed — the first confirm answered, the second naming the units that never reached a host, the session among them — and the core service is restarted, the test suite shall assert that no project card or pair for it remains, the clone is gone [[projects-10](#projects-10)], and the repository directory's files, its `spex.yaml` and `spex.lock` at its root among them, and git state are identical to their state before removal [[projects-9](#projects-9)]; and that a project whose clone has reached the stand-in host is removed on the first confirm alone.

#### projects-40

Where a fixture repository is registered with a spex repository placed at two stand-in instances, when the project is removed once with every unit held by one placement or the other and once with a unit neither holds, the test suite shall assert that the first is removed on the first confirm alone and that the second asks the second confirmation naming that one unit [[projects-9](#projects-9)].

#### projects-33

Where a project's session is held under a management lease taken out of band and a compile of that project runs, the test suite shall assert that its removal is refused `busy` deleting nothing, as it is under a live lease of a session that has no record yet; that a session whose lease appears while the removal's own leasing is held refuses it as changed meanwhile, the clone standing; that a clone moved away while that leasing is held refuses it as changed meanwhile, nothing made where the clone stood and the moved clone keeping its session [[projects-10](#projects-10)]; that a home file deleted while that leasing is held refuses it as changed meanwhile as well, the clone standing and the file not written back; and that once every lease is released the removal completes with the compile still running [[projects-10](#projects-10)].

### Label Coverage

#### projects-26

Where the project palette renders with one project holding a live session and one without, the test suite shall assert that the path row offers "Add" titled "Register this existing repository" and "Create" titled "Create a new repository at this path" [[projects-22](#projects-22)] [[projects-25](#projects-25)], both disabled until a path is typed [[projects-22](#projects-22)], that the live project's row reads its running count beside a pulsing dot while the other's reads none [[projects-23](#projects-23)], and that no text, label or title on the surface contains the word "forge" [[projects-25](#projects-25)].

### Refusal Coverage

#### projects-35

Where the project palette renders with a Create action that refuses, the test suite shall assert that a refusal carrying an `output` detail shows its words with that detail whole beneath them, and that one carrying none shows its words alone [[projects-34](#projects-34)].

### Browser Journeys

#### projects-28

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with no project, the test suite shall assert the project journey through the page:

- the palette's Academy action seeds the example, which becomes the current project [[projects-27](#projects-27)];
- creating with scaffolding from a Chinese browser against an English core produces a Chinese spec tree and authoring-language declaration through the real bundled scaffold [[projects-3](#projects-3)] [[projects-31](#projects-31)];
- confirming a path that is no git work tree shows the guidance and registers nothing [[projects-1](#projects-1)];
- confirming an existing repository's path adds it and makes it current, its root holding `spex.yaml` and `spex.lock` afterwards, and confirming the same path again switches to it without a duplicate [[projects-1](#projects-1)] [[projects-2](#projects-2)];
- the Overview tab shows the repository's branch and, for a project with no `origin` remote, the setup guidance naming that condition in GitHub terms [[projects-4](#projects-4)] [[projects-7](#projects-7)] [[projects-25](#projects-25)];
- confirming removal in the Overview forgets the project, clears it from the sidebar, and leaves the directory in place [[projects-9](#projects-9)];
- in a 400-pixel-tall window, a path the palette refuses shows its message inside the window, the palette's own box ending inside it [[projects-30](#projects-30)].

## References

[1]: https://cli.github.com/manual/ "GitHub CLI manual"
