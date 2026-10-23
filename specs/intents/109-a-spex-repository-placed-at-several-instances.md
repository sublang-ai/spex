<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-109: A Spex Repository Placed at Several Instances

## Status

In progress (2026-10-22); every deliverable is ticked, and two gaps between [[space-1](../packages/space.md#space-1)] and the code remain: the core lists no line naming your own group's own repository in your namespace at its first placement's instance, and a row's opened tabs and focus stay on its former key when a Leave moves its clone while the left instance still lists that host repository.

## Intent

Implement [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md): placements as remotes per instance named in tracked files, the sync placement by placement, sharing per placement, and the acts that place, leave and attach.

## Deliverables

- [x] The `storage`, `space`, `git-host`, `environments` and `projects` packages state DR-128, and DR-128 reads Accepted.
- [x] Placements in the clone's configuration and the placement files as units, `placements/` among Spex's own paths, the first sync after the migration writing them.
- [x] The sync over placements with its catch-up, choices and notice per placement, Stop, the apply's version per placement, and the storage Git tool with the remote named.
- [x] Members, Share, removing a member and Move per placement; Place, Leave and Attach as operations; your own group placed at every instance; Forget and Leave on shared placements.
- [x] The surface's rows with a line per placement, the controls within their label budget, and the browser journeys over two stand-ins.

## Tasks

1. Update the spec packages under DR-128 and accept it.
2. Implement placements, their files and the key rule in the core's storage layer.
3. Implement the sync over placements and the storage Git tool's named remote.
4. Implement the acts, sharing per placement and your own group's placements in the core's service layer.
5. Implement the surface and the browser journeys.

## Verification

- The root build, `npx @sublang/spex lint`, every package's tests and the browser journeys pass after each task.
- A project placed at two stand-in instances syncs through a device holding both, and a second device attaches from the placement's file.
