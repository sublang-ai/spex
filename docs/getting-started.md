<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Start using Spex

Spex brings specs and AI workflows into one IDE. Specs describe how a
system should work and how to check it. A playbook coordinates AI work
and review through a workflow written in plain language.

A **spec package** shares specs, skills, playbooks or applets as a
versioned bundle. Packages come from a registry, and
[Spex Space](https://spex.sublang.ai) is the public one: find and publish
packages there, and add them from a project's **Packages** tab, from
**Playbooks** for every project of yours, or with the `spex` command
line. Public packages need no account to browse or install. Publishing
and private packages need a registry sign-in, separate from any Space
sign-in. Syncing a project's records is optional.

The command-line workflows use Spex CLI 5.0, installed with
`npm install -g @sublang/spex` and Node.js 22 or later. The IDE controls
follow current source and are newer than desktop app 0.9.0-beta.24;
use the source setup below for those controls.

## Open the IDE and a project

Use Git and Node.js 22.19 or later. Source builds also need Xcode Command
Line Tools on macOS, or Python 3, `make`, and `g++` on Linux. Native
Windows uses the bundled Node SQLite and skips that native-module rebuild.
The first installation and launch need the network:

```sh
git clone --depth=1 https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm start
```

Desktop downloads are also available on
[GitHub Releases](https://github.com/sublang-ai/spex/releases): the macOS
M-series DMG or the Windows x86-64 installer. Those releases currently
have earlier controls; use the documentation at their release tag.
See the [README](../README.md#getting-started) for platform details.

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
To use another registry, open that chooser and select **Other…**, then
enter its website address. The choice updates `registry` in this
project's `spex.yaml`; it does not change your Space sign-in.

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
3. **Run its playbooks.** A playbook the package provides runs in the
   project at once, for everyone who pulls `spex.yaml`. Each role is
   played by the player named after it; one you have not set up plays
   on the Captain's agent until you add it in **Settings**. The
   project's **Playbooks** tab lists the project's playbooks under its
   name, and the global ones, which run in every project of yours,
   under **Global**. Choose ✎ on a role to give it another player.
   Start a new task and type `/` to find its command.
4. **Publish your own.** See
   [Publish specs, skills, and playbooks](#publish-specs-skills-and-playbooks).

Skills and specs take effect at once too. Spex places skills in
`.claude/skills/` for Claude Code and `.agents/skills/` for Codex,
Gemini CLI, Kimi Code, and OpenCode, so each agent finds them its own
way. Playbook launch skills are placed for Claude Code alone; with other
agents, run playbooks from Spex's `/` menu. A package's spec is
placed in `specs/packages/<pkg>.md`, beside your own specs, and agents
and `spex lint` read it as any spec. Its first line names the package
and version; once you edit it, it is yours: Spex leaves it, and a newer
version waits. The spec's line in the package row says where it stands.
A global package's spec reaches your agents as a skill instead.

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
**Remove** stands in a package row's overflow; once you commit
`spex.yaml`, its playbooks leave the project for everyone.

**Playbooks**, beside **Space** and **Settings**, holds your global
packages: their playbooks run in every project of yours. Its **Add…**
works as the **Packages** tab's, **New playbook** starts a global
playbook, and ✎ on a role chooses its player everywhere. The built-in
playbooks, `sublang/playbooks`, are a global package Spex adds when it
first starts: you can remove it and add it again like any other, and
it offers **Update to ⟨version⟩** when the app ships a newer release.
On a project's **Playbooks** tab, ✎ on a role under **Global** gives it
another player in that project alone, **Same as global** sets it back,
and a dot marks a role that differs.

**Add… → Folder** adds a package folder inside the project, such as
`spex-packages/<org>/<pkg>`, used in place, so you can try a package
before you publish it; `spex add <org>/<pkg> --path <folder>` does the
same.

## Use the CLI

Spex CLI 5.0 manages the same package files as the IDE without a running
app. Install it with Node.js 22 or later, then run `spex` in your
project's folder:

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
browser: open the address it prints and enter the code. To use another
registry, edit `registry` in `spex.yaml`, preserving the rest of the file,
then sign in there. `spex login --registry <url>` signs in at that
address without changing the project's registry; `search`, `add` and
`publish` use the file's choice and take no `--registry` flag.
`spex login --space <url>` signs in to a Space instead. The two sign-ins
are separate, and signing out of one keeps the other. See the
[CLI guide](../packages/cli/README.md) for every command, sign-in and exit
codes.

## Open a project on a team server

Sign in to the Space where the server is registered. At Spex Space,
Developer access or higher in the server's group or one of its subgroups
lets you use it; this does not give you access to records in the parent
group. The project's code needs a remote repository the server can read.

On **Space**, choose **Open on ⟨server⟩** on the project's row; use the
arrow beside its opening button to choose another location.
The connection starts immediately, including the first time, and Spex
shows its progress. No separate acknowledgement is needed. Your seat
starts with a Space sign-in. The server's administrator can access its
files and act with credentials you put there.
Private packages and publishing require a separate registry sign-in on
that seat; your computer's registry account and shared agent credentials
do not supply it.

Public packages install there without a registry sign-in. For private
packages or publishing, open the project's **Packages** tab on that
server, choose **Sign in** beside its registry, and approve with the code
in your browser. That sign-in stays on the server, apart from your Space
sign-in, until you sign out there or it expires.

When you add a local project to a group, its available server is part of
that same form. One server is chosen automatically; if there are several,
choose one before **Add to group**. Spex uploads the records, connects and
opens the project there, checking off each step and listing it under the
server in the sidebar. No separate sharing acknowledgement or opening
command is needed.

## Run a server for your group

You need a Linux machine running systemd, sudo access, Node.js 22.19 or
later installed system-wide under root-owned directories and runnable by
every account, and a public HTTPS address with a TLS certificate and key.
Use Node.js 23.6 or later if members will compile
playbooks on the server. The installer builds Spex from source, so the
machine also needs Git, npm and the Linux build tools described above.

1. On your Space's website, open **Servers** and register a name and the
   HTTPS address for a group you own. Save the server ID and the token
   shown once. Registration does not install or start the server.
2. Check out a [Spex release](https://github.com/sublang-ai/spex/releases)
   on the server outside the installation directory, for example under
   `/usr/local/src/spex`. From that checkout, run:

   ```sh
   sudo apps/hub/deploy/install.sh
   ```

   The default installation is `/opt/spex`. The installer checks its
   requirements, builds the hub and seats, and prints the exact file
   ownership, permissions and commands for the next steps.
3. Follow those instructions to write `/etc/spex/server.env` with the
   Space address, server ID and name. Put the token in
   `/etc/spex/server.token` using an editor, and make the certificate and
   key readable by the `spex-hub` account. Keep
   `/etc/spex/agents.env` empty unless you want to supply shared agent
   sign-ins. Preserve the ownership and permissions the installer names.
4. Attach the registered server, replacing the example values with yours:

   ```sh
   sudo -u spex-hub /opt/spex/bin/spex-hub attach \
     --instance https://your-space.example \
     --server-id YOUR_SERVER_ID \
     --address https://your-server.example \
     --tls-cert /absolute/path/to/certificate.pem \
     --tls-key /absolute/path/to/private-key.pem \
     --token-file /etc/spex/server.token
   sudo systemctl enable --now spex-hub
   sudo -u spex-hub /opt/spex/bin/spex-hub status
   ```

5. Make the registered HTTPS address reachable by your members. They can
   now use **Open on ⟨server⟩** in the IDE. Each gets a separate seat and
   signs in to private code and the package registry there as needed.

The [installer](../apps/hub/deploy/install.sh) documents its requirements
and update procedure. Install updates while no seat is running; restarting
the hub alone does not stop existing seats. Registering and retiring a
server requires ownership of its group, even when subgroup membership
allows someone to use it.

## Try a spec-first task

The built-in playbooks, `sublang/playbooks`, come with Spex as a global
package and supply starter workflows to every project. Open **Specs** to
read your project, then describe your goal or use a command:

```text
/decide Define a small local task list's behavior and acceptance checks.
```

Answer questions through Captain. Review the specs and Git changes before
implementing with `/code`. See [Approvals](approvals.md) for permissions.

## Publish specs, skills, and playbooks

Publishing needs a namespace your registry account can use. It is the
first part of `namespace/package`, called **Org** in the CLI and IDE.
At Spex Space, sign in to your
[registry account](https://spex.sublang.ai/account?scope=registry), then
check [Your orgs](https://spex.sublang.ai/account/orgs?scope=registry).
Your sign-in name becomes a personal namespace when it is valid and
available; you can also claim an organization you own. Use a name listed
there, rather than assuming a local username or a Space group grants it.

Packages are public by default. **Private packages** restricts a
namespace's packages to its personal owner or organization members.
Space groups control project records and servers, separately from
registry namespaces. For another registry, check its account page and
publishing rules.

### Publish a spec or skill package

To publish a skill you already have, such as one Claude Code keeps under
`.claude/skills/`, sign in to the registry, then build a package from the
skill in your project's folder, under an org of yours:

```sh
spex login
spex export my-org/my-skill --skill .claude/skills/my-skill
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
spex publish my-org/my-skill --dry-run
spex publish my-org/my-skill
```

The dry run shows the registry, the name, the version and the files, and
publishes nothing. When signed in, it also checks that your account can
publish under the namespace; an unsigned dry run explicitly leaves those
rights unchecked. Exporting works offline and checks no publishing rights.
The publish prints the package's page at the registry. A published version
cannot be replaced: refresh the exported files and raise `version` in
`meta.yaml` before publishing another release.

Or publish from the IDE. On the **Packages** tab, choose **Add… →
Folder** and pick `spex-packages/<org>/<name>`, the folder `spex export`
built or one you made another way; Spex reads its name and version from
its `meta.yaml`. Open the package row's overflow and choose
**Publish**, which reads **Sign in to publish** while you are signed out.
Review "Publish ⟨org⟩/⟨name⟩ ⟨version⟩ to Spex Space", the files it will
publish and the account, then confirm **Publish**. No playbook, compile or
API token is needed.

### Publish a playbook

1. Choose **New playbook** on the project's **Playbooks** tab for a
   playbook of the project, or on **Playbooks** for a global one. Enter
   a lowercase id, **Org**, and **License**.
2. Describe what the workflow does, who does what, and when it is done.
   Inspect **Source**, or supply text with **Source → Paste → Use as source**.
3. Select the answering agent in the conversation header, then **Compile**.
   The same agent runs the compiler, unless Spex was started with
   `SLC_AGENT`, `SLC_MODEL`, `SLC_EFFORT` or `SLC_FAST_MODE` set. Check
   the phases, **Gears**, and **Machine**.
4. On **Add**, check the command, the intent and a player per role, then
   choose **Add**: the playbook runs where you created it. Try its
   command in a new task and review its work.
5. Still on **Add**, choose **Publish**, which reads **Sign in to
   publish** while you are signed out. Review the registry, the package's
   name and version, the files and the account, then confirm **Publish**.
   Success shows the published version and a link to its page; **Its
   package** opens its row on the **Packages** tab.

Only what `meta.yaml` declares is published; your project and its
`specs/` directory are not. Commit a project playbook's package folder
with your code, so the team runs it too; a global one's stays with your
settings. Another project adds a public release through **Add…** on its
**Packages** tab, and its playbooks run there at once. The
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

Packages need no group. To sync a project's records, open **Space** and
sign in to the Space where your team works. Choose a listed Space, or
**Other Space…** to enter its address. Use **Add to a group…** on the
project's row, select a group and choose **Add to group**. That action
syncs its records and opens it on the server named in the same form,
with a checklist showing progress and no separate sharing confirmation.

On another computer, sign in to that Space and choose **Open here** on
the project. Code and records are cloned separately; membership does not
grant access to a separate private code repository. See
[Groups and collaboration](groups.md) and [storage and sync](storage.md).
