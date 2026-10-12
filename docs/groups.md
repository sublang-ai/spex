<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Set up a team or a workshop

Spex keeps every record in Git repositories on a Git host that a spex.pub instance manages for you.
Each instance owns one group on that host — on the internal instance, `spex-internal` on GitLab.com — and every group you make lives inside it.
You make groups in Spex, never on the host's own pages.

1. **Sign in** on Groups. The page names the host and the instance's group; your own group is yours alone until you share a project.
2. **Join the instance's group.** This is the one thing you cannot do yourself: if you are not a member yet, ask the group's owner to share it with you at Maintainer. A Maintainer may create groups and projects beneath it.
3. **New group** makes your workshop's or team's group as a private subgroup of the instance's group. **New subgroup** on it makes one group per team.
4. **Share** the group with each team's representative at Maintainer, so they may add projects and subgroups beneath it, and with everyone else at Developer or Reporter. Roles are the host's own; Spex shows exactly what the host lets each person do.
5. **Add a working folder** and pick the team's group. Spex creates `<name>-spex` there and pushes it; the group's members see its records on their own Groups page.
6. **Publish** a spec package under the org the New playbook form offers for the project's group. The registry names the org; you do not make a group for it.

Open the host's own pages only to undo: change a group's visibility, transfer it, or delete it.
Nothing here needs a top-level group of your own, and if you happen to own one, it is not where the workshop goes.
