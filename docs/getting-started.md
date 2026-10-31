<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Start using Spex

Spex brings specs and AI workflows into one IDE. Specs describe how a
system should work and how to check it. A playbook coordinates AI work
and review through a workflow written in plain language.

A **spec package** shares a spec and related skills or playbooks as a
versioned package. Find and publish packages on
[Spex Space](https://spex.sublang.ai); install them from the IDE. Public
packages need no account to browse or install. Publishing and private
packages require a separate registry sign-in with access. Project-record sync is optional.

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

1. In **Playbooks**, select your project's side, then **Add from registry**.
2. Search for a public package, choose a version, and select **Add**. Spex resolves
   and installs it. Use **Install** if files are missing, or **Resolve
   again** if requests changed.
3. Find an installed playbook under **Not enabled**, choose a player for
   every role, and select **Enable**. Start a new task and type `/` to find
   its command. Installing a package alone does not enable it.

Private packages never appear in search. In **Playbooks → Package registry**,
choose **Sign in to registry** with access, then select
**Add from registry → Add by name**, and enter the known `org/name` and
an explicit version or range, such as `1.2.3`, `^1.2.3`, or `~1.2.3`, then
**Add**. This also works for known public packages. **Requested** confirms
the request was accepted; the environment shows installation or an error.

Skills need no role binding. Selected skills, and specs wrapped as skills,
are exported to `.claude/skills/` for Claude Code and `.agents/skills/` for
Codex, Gemini CLI, Kimi Code, and OpenCode. Use them through the native agent's
own skill discovery. A spec-only or skill-only package has no playbook to
enable. Generated playbook-launch skills are exported for Claude Code;
run enabled playbooks through Spex's `/` menu with other agents.

**Add from folder** lets you try an existing
package inside the project before publishing it.

## Use the package CLI

The Spex CLI runs independently with Node.js 22 or later and shares its
package-manager library and environment files with the IDE. Run it in your
project's folder; it needs no running app or project registration:

```sh
npm install -g @sublang/spex
cd /absolute/path/to/project
spex search toolkit
spex add my-org/toolkit@^1.0.0
spex install
spex update
spex list
```

Replace the example package name with a real one. Commit `spex.yaml` and
`spex.lock`; installed files under `.spex/` are ignored. A new manifest explicitly
selects the public registry as `registry: https://spex.sublang.ai`, independently
of an optional `space` binding for project records. Existing manifests without
`registry` keep their prior package source until you explicitly migrate them.
The lock retains each package's exact origin, version and checksum.

Public packages need no sign-in. For private packages or publishing:

```sh
spex login --registry https://spex.sublang.ai
spex whoami --registry https://spex.sublang.ai
```

Follow the verification URL and code. `--space <origin>` signs in to a Space
separately; it cannot be combined with `--registry`. Signing out of either
keeps the other signed in. For a package of your own, `spex new org/pkg --skill
<folder>` makes `spex-packages/org/pkg/`, requests it by path and installs it.
Run `spex publish org/pkg --dry-run` to inspect its destination and files,
then omit `--dry-run` to publish. Enable and run playbooks in the IDE as above.
See the [CLI guide](../packages/cli/README.md) for all commands and options.

## Open a project on a team server

In **Space**, choose a server under your group and read its contract before
opening a seat. Whoever runs the server can act with credentials you place
there. Admission signs that seat in to its Space only; your computer's registry
credentials and the administrator's shared agent sign-ins grant it no registry
access.

Public packages install without a registry sign-in. For private packages or
publishing, select the server's place in the IDE, then open **Playbooks → Package
registry → Sign in to registry**. Approve that seat's own sign-in. Its registry
credential stays on that server until removed or expired, independently of your
Space grant and execution lease. Sign out of the registry on that seat when you
want to remove that grant.

## Try a spec-first task

The bundled `sublang/playbooks` package supplies starter workflows. Open
**Specs** to read your project, then describe your goal or use a command:

```text
/decide Define a small local task list's behavior and acceptance checks.
```

Answer questions through Captain. Review the specs and Git changes before
implementing with `/code`. See [Approvals](approvals.md) for permissions.

## Publish specs, skills, and playbooks

Publishing needs a claimed org you can publish to; manage claims on
Space's [Your orgs](https://spex.sublang.ai/account/orgs) page.
If you do not own a first-level group, open **Space** in Spex and choose
**New group** under your signed-in publishing instance. Enter **Group name**
and a lowercase **Path** such as `team-tools`, choose **Create**, then claim
that **Path** in **Your orgs**. If **New group** is unavailable, ask the
instance administrator to provide a first-level group you own.
Your personal namespace alone does not qualify as an org. Choose **Private**
on a new claim when the packages should be private.

### Publish a spec or skill package

To publish a skill you already have, such as one Claude Code keeps under
`.claude/skills/`, make a package folder from it in your project's root,
using an org you can publish to:

```sh
npx @sublang/spex package init my-org/my-skill --skill .claude/skills/my-skill --move
```

It writes `spex-packages/my-skill/` with a manifest, README and your
project's license, and needs no running app. `--move` hands the skill to the
package; once the package is added, Spex exports it back to your agents.
For a spec, pass `--spec specs/packages/<name>.md` and name the package
`<org>/<name>`; `--description` and `--license` override what it reads.
To write a folder by hand, follow the
[package format](../specs/packages/environments.md#environments-1).

In **Playbooks → Add from folder**, enter its `org/name` and
`spex-packages/my-skill`, then **Add**. Sign in through **Space** to the
publishing instance. On the local package's row, select **Publish**, review
the destination, name, version, and upload files, then confirm **Publish**.
This uses your existing app sign-in; no playbook, compilation, or separate
API token is needed. With the app running, the CLI does the same:

```sh
spex package add my-org/my-skill --path spex-packages/my-skill
spex package publish spex-packages/my-skill --dry-run
```

Then run the publish command again without `--dry-run`.

### Publish a playbook

1. Open **Playbooks → New playbook**. Enter a lowercase id, **Org**, and
   **License**.
2. Describe what the workflow does, who does what, and when it is done.
   Inspect **Source**, or supply text with **Source → Paste → Use as source**.
3. Select the answering agent in the conversation header, then **Compile**.
   Its configured agent also runs the compiler unless the host overrides
   that choice. Check the phases, **Gears**, and **Machine**.
4. On **Enable**, choose the command and a player per role, then enable it
   for the project. Try its command in a new task and review its work.
5. Sign in through **Space** to the publishing instance. Return to the
   author's **Enable** tab and select **Publish**. Review the destination,
   package name, version, and upload files, then confirm **Publish**. Success
   shows the published version and package-page link.

Only declared package artifacts are published; your whole project and its
`specs/` directory are not uploaded automatically. Keep the authored package
with your code. Another project can find a public release through **Add
from registry**, then enable its playbooks or use its exported skills.
The [HTTP publishing guide](https://spex.sublang.ai/llms.txt) is also
available for automation.

## Show a page with an applet

A package can carry an applet: a small static web page at
`applets/<id>/index.html` with its scripts and styles beside it. Once the
package is installed, the project shows a tab named `<id>` with the page
in it, after Start, Specs and Overview. From the page, `./~/<path>` reads
one file of the project folder and `./~/<folder>/` lists a folder as JSON,
read-only, so a playbook can write a report into the project and the
applet can show it. The page runs in a sandbox: it reaches neither the
network nor Spex itself, and its frame stays at Spex's own address. Add
the folder and its `{ kind: applet }` entry in `meta.yaml` by hand;
`spex package init` does not add applets.

## Optionally sync project records

Package installation does not require placing project records in a group.
Before sharing records, check the address on **Space** and read the sharing
notice: group members can see records, including session attachments.
Current source defaults to `https://spex.sublang.ai`; older releases may
differ, and existing homes retain their saved addresses.
See [groups](groups.md) and [storage and sync](storage.md).
