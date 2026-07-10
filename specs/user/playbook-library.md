<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PBLIB: User-Facing Playbook Library Behavior

## Intent

This spec defines user-visible behavior of the Spex Library
surface: browsing and enabling configured playbooks, mapping
playbook roles to player profiles, and compiling new playbooks.

The Library is a workspace surface of the Spex desktop app
([DR-002](../decisions/002-desktop-app-architecture.md)).
Playbook entries live in the shared playbook config file, which
remains the source of truth
([DR-004](../decisions/004-config-and-persistence.md)).
Compilation runs the external `slc` toolchain
([DR-005](../decisions/005-compilation-integration.md)).

## Playbook List

### PBLIB-1

When the Library surface is opened, the Library shall list every
playbook configured in the shared config's `playbooks` map
([DR-004](../decisions/004-config-and-persistence.md)), showing
for each entry its id, command, intent, required roles, per-role
player-profile mapping, and enabled state.

### PBLIB-2

Where a configured playbook entry fails the fail-closed config
validation ([DR-004](../decisions/004-config-and-persistence.md))
— for example, an unresolved required role or a duplicate
command — the Library shall list the entry marked invalid with
the specific validation failure, rather than hiding it.

## Enable and Disable

### PBLIB-3

When the user toggles a playbook's enabled state, the Library
shall persist the new state to that playbook's entry in the
shared config file (state encoding per
[DR-004](../decisions/004-config-and-persistence.md)), shall
modify no other entry, and shall reflect the new state in the
list. Disabling shall not remove the playbook's entry or its
role-profile mapping from the shared config.

## Role Mapping

### PBLIB-4

Where the shared config defines a `profiles` map
([DR-004](../decisions/004-config-and-persistence.md)), when the
user edits a playbook's per-role player mapping, the Library
shall offer each configured profile id and each supported adapter
shorthand as mapping choices, shall reject a mapping that leaves
a required role unresolved or that references an undefined
profile — naming the affected role — and shall write only
accepted mappings to the playbook's `players` map in the shared
config.

## Compile Flow

### PBLIB-5

When the user starts the compile flow, the Library shall accept
the playbook source as either a picked markdown file or in-app
markdown text, and shall require the playbook's role names before
compilation starts. The Library shall reject a role name that
does not match `^[a-z][a-z0-9_-]*$` before starting compilation.

### PBLIB-6

While a compile is running, the Library shall display each phase
of the compile pipeline
([DR-005](../decisions/005-compilation-integration.md)) with its
name and live status — running, succeeded, or failed — updating
as phases complete.

### PBLIB-7

When the compile pipeline succeeds, the Library shall present a
registry form with fields for command, intent, and summary
policy, prefilled where derivable from the playbook source and
compiled output. When the form is submitted and passes registry
validation ([PBLIB-15](../dev/playbook-library.md#pblib-15)), the
Library shall register the playbook by writing its entry —
including the role-profile mapping per [PBLIB-4](#pblib-4) —
into the shared config's `playbooks` map. A rejected submission
shall name the violated rule and shall cause no config write.

### PBLIB-8

Where the compile toolchain cannot be resolved — no `slc`, or no
Node.js meeting the version floor
([PBLIB-11](../dev/playbook-library.md#pblib-11)) — the Library
shall mark the compile flow unavailable, shall show guidance
naming each missing prerequisite and how to install or configure
it, and shall not start a compile.

### PBLIB-9

While a compile is running, when a pipeline phase fails, the
Library shall mark that phase failed, shall surface that phase's
captured output, shall write nothing to the shared config, and
shall allow the user to retry the compile after editing the
source.

### PBLIB-10

When a compiled playbook is registered, the Library shall list it
with its registry fields and enabled state, and shall indicate
that project sessions started before registration must be
restarted before the playbook is available in them.
