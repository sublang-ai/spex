<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-217: Write a Playbook Before Publishing

## Status

Accepted (2026-11-03) under the owner's request to fix the creation layout and remove premature org selection.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in the creation form's fields and words, [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md) in creation identity timing, [DR-200](200-publishing-names-need-registry-authority.md) in moving publishing-name guidance to publication, and [DR-202](202-registry-guidance-keeps-account-scope.md) in where the IDE's claim link appears; amends [DR-216](216-registry-and-space-accounts-stay-apart.md) in deferring registry-only namespace selection until publication and permitting local authoring and one-shot compilation without a namespace grant.

## Context

Creating a local playbook asked for a registry org and license before there was a workflow to write or try.
Publishing-rights guidance made an optional future action feel like setup debt, and its multiline text raised the Org input above its neighbours.
An implicit group-derived publishing identity would recreate the authoring trap DR-200 addressed.

## Decision

- Creation asks only for Command and offers Start writing, with the command preview and a brief explanation that publication comes later.
  It creates a local package without inventing a license or consulting registry authority.
- Authoring, compilation and Add remain available without publication or registry sign-in.
  A one-shot compile uses `local` when no registry namespace default is available, and never a Space-derived identity.
- Publish opens a viewport-bounded dialog for the publishing org and license, with authorized-name suggestions and the existing registry-account claim link.
  Preview shows the resulting package name, version, license, account, destination and files before explicit confirmation.
- Publication uses a validated release snapshot with the chosen metadata.
  The local source package, folder, environment requests, authoring identity and runnable command remain stable.
  Registry authorization applies to the chosen release identity, never to a local placeholder.
- A local package row opens the same publishing setup, including after its authoring session is deleted.
- Creation and publishing forms keep each field's help below its input, align actions with inputs and stack at narrow widths.
  Cancelling setup or review uploads nothing and preserves the preceding context.

## Consequences

Authors can create and try a workflow before deciding whether or how to share it.
Publication has its own identity without silently renaming local work or choosing a public license.
Real-core coverage verifies the snapshot and preserved local state; browser journeys verify creation, publishing and English/Chinese layouts at desktop and 320 pixels.
