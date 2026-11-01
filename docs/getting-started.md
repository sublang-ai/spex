<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Start using Spex

Spex brings specs and AI workflows into one IDE. Specs describe how a
system should work and how to check it. A playbook coordinates AI work
and review through a workflow written in plain language.

A **spec package** shares a spec and related skills or playbooks as a
versioned package. Packages come from a registry, and
[Spex Space](https://spex.sublang.ai) is the public one: find and publish
packages there, and add them from a project's **Packages** tab or the
`spex` command line. Public packages need no account to browse or
install. Publishing and private packages need a registry sign-in,
separate from any Space sign-in. Syncing a project's records is optional.

## Open the IDE and a project

Use macOS or Linux with Git, Node.js 22.19 or later, and a native build
toolchain: Xcode Command Line Tools on macOS; Python 3, `make`, and `g++`
on Linux. The first installation and launch need the network.

```sh
git clone --depth=1 https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm start
```

These commands follow current `main`. For tagged app releases and server
access, see the [README](../README.md#getting-started).

Choose **Add a local project** for an existing Git repository, or expand
**Create a new project…** and keep the specs scaffold enabled. **Open the
Academy example** opens the included sample. Configure your Git name and
email before creating projects or running workflows that commit changes.

Open **Settings → Agents**. Choose the Captain's adapter and model, save,
and follow its readiness instructions. Check the players your playbooks
use too. Coding-agent sign-in is separate from Space sign-in. Captain
coordinates; players inspect files, implement, and review through playbooks.

## Install and use a package

A project's packages come from the registry its `spex.yaml` names; a new
project's is Spex Space. The project's **Packages** tab shows it at the
top as **Registry: Spex Space**, with your sign-in there beside it.

1. **Find a package.** On the project's **Packages** tab, choose
   **Add…** and search on **Registry**. On the command line, run
   `spex search <words>` in the project's folder.
2. **Add it.** Pick a version — "1.2.0 and newer 1.x" takes later fixes
   and features, "1.2.0 exactly" stays put — and choose **Add**. On the
   command line, `spex add <org>/<pkg>` adds the newest. Spex writes the
   package into `spex.yaml` and its exact version into `spex.lock`, and
   installs it. Commit both files, and a spec it places, with your code
   so everyone on the project installs the same packages; until you do,
   the tab shows **spex.yaml, spex.lock not committed**.
3. **Enable its playbooks.** Adding a package installs it but enables
   nothing. Open the **Playbooks** tab, find the playbook under
   **Available**, choose a player for each role and select **Enable**.
   **Enable** also stands on the receipt after **Add** and on the
   playbook's line in the package's row. Start a new task and type `/`
   to find its command.
4. **Publish your own.** See
   [Publish specs, skills, and playbooks](#publish-specs-skills-and-playbooks).

Skills and specs need no enabling. Spex places skills in
`.claude/skills/` for Claude Code and `.agents/skills/` for Codex,
Gemini CLI, Kimi Code, and OpenCode, so each agent finds them its own
way. Playbook launch skills are placed for Claude Code alone; with other
agents, run enabled playbooks from Spex's `/` menu. A package's spec is
placed in `specs/packages/<pkg>.md`, beside your own specs, and agents
and `spex lint` read it as any spec. Its first line names the package
and version; once you edit it, it is yours: Spex leaves it, and a newer
version waits. The spec's line in the package row says where it stands.
Your **Personal** packages' specs reach your agents as skills instead.

Private packages never appear in search. Choose **Sign in** beside the
registry and approve in your browser, or run `spex login`, which signs
you in with a code in your browser. Then type the package's `org/name`
on **Add… → Registry**: its row reads "not listed publicly". Enter a
version such as `1.2.3`, `^1.2.3` or `~1.2.3` and choose **Add**, or run
`spex add <org>/<pkg>@<version>`. This also works for known public
packages. A package the registry would not give you reads
**Not installed · private**, with **Sign in**.

When `spex.yaml` changes — after a pull, or an edit by hand — the tab
shows **spex.yaml changed** with **Update**, which moves to the newest
versions `spex.yaml` allows and installs them; `spex update` does the
same. A row reading **Files missing** offers **Install**, which puts
back what `spex.lock` records, as `spex install` does after a clone.
**Remove** stands in a package row's overflow. The built-in playbooks
stand as one quiet line, **Built-in playbooks** with their version: they
come with Spex, are never removed, and offer **Update to ⟨version⟩**
when the app ships a newer release.

**Add… → Folder** adds a package folder inside the project, such as
`spex-packages/<org>/<pkg>`, used in place, so you can try a package
before you publish it; `spex add <org>/<pkg> --path <folder>` does the
same.

## Use the CLI

The `spex` command line is the **Packages** tab without the app: the
same verbs on the same files. It needs Node.js 22 or later and no
running app. Run it in your project's folder, or put `npx @sublang/spex`
in place of `spex`:

```sh
npm install -g @sublang/spex
cd /absolute/path/to/project
spex search toolkit
spex add my-org/toolkit
spex list
```

Replace the example name with a real one. `spex list` shows what is
added, installed, and placed for your agents and in `specs/`. Open the
same folder in the IDE and its **Packages** tab shows the same packages;
what either changes, the other reads.

Public packages need no sign-in. For private packages or publishing:

```sh
spex login
spex whoami
```

`spex login` signs in to the project's registry with a code in your
browser: open the address it prints and enter the code. `--space <url>`
signs in to a Space instead. The two sign-ins are separate, and signing
out of one keeps the other. See the [CLI guide](../packages/cli/README.md)
for every command, sign-in and exit codes.

## Open a project on a team server

On **Space**, a project of your group offers **Open on ⟨server⟩**. The
first time, Spex lists the server's terms — among them that whoever runs
the server can act with credentials you put there — and opens it once
you choose **I understand**. The server is signed in to the Space and
nothing more: your registry sign-in on this computer, and the agent
sign-ins its administrator shares, give it no registry access.

Public packages install there without a registry sign-in. For private
packages or publishing, open the project's **Packages** tab on that
server, choose **Sign in** beside its registry, and approve with the code
in your browser. That sign-in stays on the server, apart from your Space
sign-in, until you sign out there or it expires.

## Try a spec-first task

The built-in playbooks, `sublang/playbooks`, come with Spex and supply
starter workflows. Open **Specs** to read your project, then describe
your goal or use a command:

```text
/decide Define a small local task list's behavior and acceptance checks.
```

Answer questions through Captain. Review the specs and Git changes before
implementing with `/code`. See [Approvals](approvals.md) for permissions.

## Publish specs, skills, and playbooks

Publishing needs an org that is yours at the registry. Sign in to the
registry, then claim one on [Your orgs](https://spex.sublang.ai/account/orgs)
at Spex Space: any name your registry account may claim, with no Space
group needed. Choose **Private** on a new claim when its packages should
be private.

### Publish a spec or skill package

To publish a skill you already have, such as one Claude Code keeps under
`.claude/skills/`, sign in to the registry, then build a package from the
skill in your project's folder, under an org of yours:

```sh
npx @sublang/spex login
npx @sublang/spex export my-org/my-skill --skill .claude/skills/my-skill
```

`spex login` signs in with a code in your browser: open the address it
prints, enter the code and approve. `spex export` writes
`spex-packages/my-org/my-skill/` with its `meta.yaml`, a README and your
project's license, copying the skill, which stays in `.claude/skills/`
for your agent; it adds nothing to `spex.yaml`. After you edit the skill,
run `spex export my-org/my-skill` again to refresh the copy. For a spec,
pass `--spec specs/packages/<name>.md` and name the package
`<org>/<name>`: a citation of another package's spec becomes its
address, and one the package cannot carry is dropped with a warning.
`--description` and `--license` override what it reads. To write a
folder by hand, follow the
[package format](../specs/packages/environments.md#environments-1).

Check what will be published, then publish it:

```sh
npx @sublang/spex publish my-org/my-skill --dry-run
npx @sublang/spex publish my-org/my-skill
```

The dry run shows the registry, the name, the version and the files, and
publishes nothing. The publish prints the package's page at the registry.

Or publish from the IDE. On the **Packages** tab, choose **Add… →
Folder** and pick `spex-packages/<org>/<name>`, the folder `spex export`
built or one you made another way; Spex reads its name and version from
its `meta.yaml`. Open the package row's overflow and choose
**Publish**, which reads **Sign in to publish** while you are signed out.
Review "Publish ⟨org⟩/⟨name⟩ ⟨version⟩ to Spex Space", the files it will
publish and the account, then confirm **Publish**. No playbook, compile or
API token is needed.

### Publish a playbook

1. On the **Playbooks** tab, choose **New playbook**. Enter a lowercase
   id, **Org**, and **License**.
2. Describe what the workflow does, who does what, and when it is done.
   Inspect **Source**, or supply text with **Source → Paste → Use as source**.
3. Select the answering agent in the conversation header, then **Compile**.
   The same agent runs the compiler, unless Spex was started with
   `SLC_AGENT`, `SLC_MODEL`, `SLC_EFFORT` or `SLC_FAST_MODE` set. Check
   the phases, **Gears**, and **Machine**.
4. On **Enable**, choose the command and a player per role, then enable
   it for the project. Try its command in a new task and review its work.
5. Still on **Enable**, choose **Publish**, which reads **Sign in to
   publish** while you are signed out. Review the registry, the package's
   name and version, the files and the account, then confirm **Publish**.
   Success shows the published version and a link to its page; **Its
   package** opens its row on the **Packages** tab.

Only what `meta.yaml` declares is published; your project and its
`specs/` directory are not. Keep the package folder with your
code. Another project finds a public release through **Add…** on its
**Packages** tab, then enables its playbooks or uses its skills. The
[HTTP publishing guide](https://spex.sublang.ai/llms.txt) serves
automation.

## Show a page with an applet

A package can carry an applet: a small static web page at
`applets/<id>/index.html` with its scripts and styles beside it. Once the
package is installed, the project shows a tab named `<id>` with the page
in it, after Specs, Playbooks, Packages and Overview. From the page,
`./~/<path>` reads one file of the project folder and `./~/<folder>/`
lists a folder as JSON, read-only, so a playbook can write a report into
the project and the applet can show it. The page runs in a sandbox: it
reaches neither the network nor Spex itself, and its frame stays at
Spex's own address. Add the folder and its `{ kind: applet }` entry in
`meta.yaml` by hand; `spex export` does not add applets, and leaves them
as they are.

## Optionally sync project records

Packages need no group: a project's records sync only once you choose
**Add to a group…** on its row on **Space**. Before you share, check the
Space's name there and read the sharing notice: the group's members see
the records, session attachments included. Sign-in offers Spex Space,
`https://spex.sublang.ai`, by default; a Space an earlier release saved
stays as saved. See [groups](groups.md) and [storage and sync](storage.md).
