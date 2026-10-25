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
packages require access. Project-record sync is optional.

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

Private packages never appear in search. Sign in with access, select
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

Commit the project's `spex.yaml` and `spex.lock` with its code to retain
chosen package versions. **Add from folder** lets you try an existing
package inside the project before publishing it.

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
If you do not own a first-level group in Space, create one there, then
claim its name. Your personal namespace alone does not qualify as an
org. Choose **Private** on a new claim when the packages should be private.

### Publish a spec or skill package

Prepare a valid package folder inside your project using the
[package format](../specs/packages/environments.md#environments-1), including
its description, license, and an org you can publish to. In **Playbooks →
Add from folder**, enter its `org/name` and project-relative folder path,
then **Add**. Sign in through **Space** to the publishing instance. On the
local package's row, select **Publish**, review the name, version, and
upload files, then confirm **Publish**. This uses your existing app sign-in;
no playbook, compilation, or separate API token is needed.

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
   author's **Enable** tab and select **Publish**. Review the package name,
   version, and upload files, then confirm **Publish**. Success shows the
   published version and package-page link.

Only declared package artifacts are published; your whole project and its
`specs/` directory are not uploaded automatically. Keep the authored package
with your code. Another project can find a public release through **Add
from registry**, then enable its playbooks or use its exported skills.
The [HTTP publishing guide](https://spex.sublang.ai/llms.txt) is also
available for automation.

## Optionally sync project records

Package installation does not require placing project records in a group.
Before sharing records, check the address on **Space** and read the sharing
notice: group members can see records, including session attachments.
Current source defaults to `https://spex.sublang.ai`; older releases may
differ, and existing homes retain their saved addresses.
See [groups](groups.md) and [storage and sync](storage.md).
