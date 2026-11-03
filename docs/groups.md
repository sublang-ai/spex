<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Groups and collaboration

Use a Space to share project records with a team and work on team servers.
In the IDE, **Space** shows **Personal**, the groups you belong to, and
their projects. A Space sign-in is separate from the registry sign-in
used to publish packages or install private ones.

These controls follow the current source IDE. See
[Open the IDE and a project](getting-started.md#open-the-ide-and-a-project)
to run it; published app 0.9.0-beta.24 has earlier membership controls.

## Share a project

1. Open **Space** in the IDE and **Sign in** to the Space where your team
   works. Choose it from the list, or use **Other Space…** to enter its
   website address. Use **Add a Space…** if another Space is already listed.
2. Use a group you belong to, or choose **New group…** on the Space heading
   to create one where your Space permits it. To create a group inside
   another, open that parent’s **More → New group…**. The editor names
   the parent, its full path and Space, and explains that the parent’s
   members also gain access to the new group.
3. Open the group's **More → Members**, then **Invite members…** if you
   can manage its membership.
4. Enter **Usernames**, using Enter or commas between them, or paste a
   comma- or line-separated list. Each person needs an account at that
   Space. Remove any unwanted username token, then choose one **Role**
   for everyone listed, using its description to understand the access
   it grants. **Add member**, or **Add members** for several usernames,
   gives each person access as their addition succeeds, including access
   through the group to its projects and groups within it.
5. Create or add a project, then open **Add to a group…** on its Space
   row. Check the labelled **Space**, select the team under **Choose
   group**, then choose **Add to group**.
   Selecting a row alone changes nothing. **Personal** means your
   personal group. If the same project already appears in that Space,
   **Connect to an existing project** lets you review and combine its
   records with **Connect project**. The action uploads the records and
   continues to the server named in that form, without another confirmation.

If some additions fail, successful members appear in the list and only failed or unsent usernames remain in the form. Correct those entries and submit again; successful additions are not repeated. If the connection drops, reconnect before submitting the remaining usernames.

Sharing includes existing and future conversations, agent activity and
attachments. Removing someone's access cannot erase copies they already
saved. Public records can be read by anyone.

On another computer, sign in to the same Space and choose **Open here**
on the project. This downloads its records and code separately; access
to private code still needs that repository's permission and credentials.
Reading a session elsewhere does not move its running agents there.

On a project's Space row, **Open project** returns to its workspace.
The record status, such as **1 record to sync**, opens its Sync details.
The row's **More** menu holds **Sync records**, Members, Explore records
and other places to open the project.

Adding a local project to a group also opens it on the group's server.
With one available server, Spex chooses it; with several, choose one in the
same form. **Add to group** uploads the records and continues through the
connection and project opening. Its checklist checks off each completed
step, and the project appears under that server in the left sidebar.
There is no separate **Share**, **Continue** or **Open on** step.
A failed step shows its cause and **Try again**; a records conflict still
needs its actual differences resolved.

## Work on a team server

A project with a code remote can offer **More → Open on ⟨server⟩**.
**Code remote not configured** means Spex has no recorded remote address
for the project's code; its folder may already be a Git repository.
Publish the code to a Git repository and configure its address as the
project folder's `origin` remote, then choose **Sync records** to update
the recorded address. This prerequisite applies to opening the project's
code on a server; access to saved sessions follows their availability
and your membership permissions.

At Spex Space, Developer access or higher on the server's group or one of its
subgroups lets you use it, without granting access to the parent group's
records. Opening the project connects immediately without a separate
acknowledgement. Each member gets a separate seat; the administrator can
access its files and act with credentials used there. Private packages need a registry sign-in on that
seat too.

To run one, a group Owner registers the server through **Servers** on
the Space's website, then installs and starts it on the machine. Follow
[Run a server for your group](getting-started.md#run-a-server-for-your-group).

## Manage membership and groups

To remove a member, use **Remove** on their row and confirm. Membership inherited from another group is identified by **via <group>** and must be managed in that group.

To delete an empty group, open **More → Delete group** where your Space
permits it. The Space checks its current contents and names any projects,
groups, shared records or servers that prevent deletion. Members do not
make a group nonempty, and a newly created group is empty until content is
added. When the check finds no contents, review the group and Space, then
choose **Delete group** or **Cancel**. The Space checks again before
requesting deletion and refuses if that check finds contents.

The Space decides when deletion takes effect; its recovery period can mean
that deletion is not immediate. Scheduled groups move into **Scheduled for
deletion (N)** below the active groups. Open that section to revisit them
and choose **Restore group** where permitted. **Hide**, Escape or the
disclosure collapses it without cancelling deletion. A deletion you just
requested opens the section; revisiting the surface starts with it collapsed.

Use **Refresh** to check whether deletion has completed. Once the Space no
longer reports a group, it disappears; the section disappears when empty.
Keeping the app open does not itself refresh the Space. The app does not
assume a deletion deadline. For an unexpectedly long wait, ask the Space
administrator to check its retention policy and deletion processing.

## Publish packages separately

A Space group shares records and grants team-server access. Publishing
uses a namespace authorized by your registry account, whether personal
or an organization. At Spex Space, check
[Your orgs](https://spex.sublang.ai/account/orgs?scope=registry) for those
names. Creating a group here grants no publishing namespace there. See
[Publish specs, skills, and playbooks](getting-started.md#publish-specs-skills-and-playbooks).
