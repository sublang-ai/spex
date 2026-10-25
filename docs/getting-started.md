<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Start using Spex

Spex brings your project's specs, AI conversations, and workflows into one
IDE. Specs describe how the system should work and how to check it. A
playbook coordinates AI work and review through a workflow written in
plain language.

You can begin locally. Your coding agent's sign-in is separate from
**Spex Space**, the optional service for sharing settings and project
records with your groups.

## Install from source

Use macOS or Linux with Git, Node.js 22.19 or later, and a native build
toolchain: Xcode Command Line Tools on macOS; Python 3, `make`, and `g++`
on Linux. The first installation and launch need the network.

```sh
git clone --depth=1 https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm start
```

These commands use current `main`. For a released version, choose an
`app-v*` tag from [app releases](https://github.com/sublang-ai/spex/releases)
and add `--branch <tag>` to the clone command. App releases provide
source to build locally. For browser access to a Spex server, see the
[README](../README.md#getting-started).

## Choose a project

Configure your Git name and email before creating a project or running
workflows that commit changes.

On the welcome page, choose **Add a local project**. Select an existing
Git repository, or expand **Create a new project…** to create one. Keep
the specs option enabled to start with a `specs/` scaffold. To explore
an included sample instead, choose **Open the Academy example**.

## Make your agents ready

Open **Settings → Agents**. Check the Captain and the players used by
your playbooks. Follow the readiness instructions for your chosen
adapter: for example, sign in through `claude` or `codex` in a terminal,
or set the corresponding API key. The SDKs installed with Spex do not
sign you in.

Choose the adapter and model, save, and check readiness again. The
Captain handles your conversation; players carry out the playbook's
roles, such as writing and reviewing changes.

## Try a spec-first task

In your project, tell the Captain what you want and how you will judge
completion. For example: “Help me define a small task list. Start by
asking about its users and expected behavior.” Open **Specs** to read
your project's specifications.

Type `/` in the task field to see enabled playbooks and their
descriptions. A first task might be:

```text
/decide Define the expected behavior of a small local task list, with acceptance checks.
```

Follow the conversation and answer questions through the Captain.
Review the resulting specs and Git changes before continuing to
implementation with `/code`. Use `/review` when you want a review of
work. See [Approvals and human decisions](approvals.md) for tool
permissions and workflow questions.

## Share when ready

Open **Space**, check the instance address, and choose **Sign in** to
continue in your browser. Current source uses
[Spex Space](https://spex.sublang.ai) as the default for a new home;
`app-v0.9.0-beta.16` uses an earlier default. Existing homes keep their
saved addresses.

Read the sharing notice before placing project records in a group:
its members can see those records, including session attachments.
Continue with [teams and workshops](groups.md) and
[local storage and sync](storage.md).
