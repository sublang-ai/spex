<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-108: A Home Signed In to Several Instances

## Status

In progress (2026-10-20).

## Intent

Implement [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md): instances by origin in `home.yaml`, keys and folders naming the instance, each clone recording its instance, the Groups surface per instance, the registry by instance, and the instances migration.

## Deliverables

- [x] The `storage`, `git-host`, `space`, `projects`, `environments`, `playbook-library`, `core-service` and `app-shell` packages state DR-127, and DR-127 reads Accepted.
- [x] `home.yaml` format 2 with its instances and default instance, origin canonicalization, `@<host>` keys and folders, the clone's remote named by its instance, and the instances migration with its receipt.
- [x] A client per instance: sign-in by origin, sign-out and Forget per instance, reads per instance, the credential by the clone's instance, the shared-origin rule and the follow, your namespace per instance, and the stand-in run as several instances.
- [x] The Groups surface with a heading per instance, Pick and Move per instance, and the browser opened at any instance; the journeys over two stand-ins.
- [ ] The registry, Git sources and publishing by instance with the default instance, the Org default, and the intent's author.

## Tasks

1. Update the spec packages under DR-127 and accept it.
2. Implement the home file, keys, the clone's instance and the migration in the core's storage layer.
3. Implement the clients, sign-in, reads, the follow and the Groups state per instance in the core's service layer, with the stand-in instances.
4. Implement the surface per instance in the UI and the shells, with the browser journeys.
5. Implement the registry, Git sources, publishing, the Org default and the intent's author by instance.

## Verification

- The root build, `npx @sublang/spex lint`, every package's tests and the browser journeys pass after each task; UI tests touching browser storage also run under Node 22.
- A one-instance home migrates on a scratch home against the stand-in, and the production and internal instances sign in to one home.
