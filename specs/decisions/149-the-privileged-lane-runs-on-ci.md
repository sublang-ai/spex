<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-149: The Privileged Lane Runs on CI

## Status

Accepted (2026-10-24) on the owner's question whether a check needing a Linux host belongs on CI, which already runs on Linux.
Extends [DR-086](086-tests-in-tiers.md) in its tiers: the hub's privileged lane joins the checks' platform as a tier of its own, run by CI on its own schedule and gating no merge.
Extends [DR-145](145-merge-on-green.md) in what a pull request's run holds: the lane is no required check.

## Context

- The hub's privileged lane proves on a real Linux host with systemd and sudo what no hermetic suite can: the install script, the helper run through sudo, the units, the seats' isolation, the stop at a lease's end and, since [DR-148](148-a-lapsed-seat-is-stopped-by-a-sweep.md), the sweep [[hub-10](../packages/hub.md#hub-10)].
- It has run by hand once, in a Multipass virtual machine on a developer's machine, recorded in `apps/hub/deploy/LANE.md`; the sweep's phase has run nowhere, and the developer's machine has no virtual machine tool today.
- GitHub's Ubuntu runner is a disposable Linux host booted by systemd with passwordless sudo, which is exactly the host the lane asks for; its own Node lives under the runner account's toolcache, which the install script refuses for root's use.
- [DR-145](145-merge-on-green.md) keeps a pull request's run lean and names its jobs as the required checks; the lane takes a quarter of an hour and changes the host's accounts, units and policy.
- The install script itself checks the sweep on every host it installs on ([DR-148](148-a-lapsed-seat-is-stopped-by-a-sweep.md)), so no lane run gates shipping.

## Decision

- A workflow of its own, the hub lane, runs the privileged lane as root on the Ubuntu runner: on a nightly schedule, on a push to `main` that touches the hub or the server shell the seats run, on a pull request that changes the workflow itself — so a change to the lane's own run is exercised before it merges, and a workflow new to the repository can run at all — and on request.
- The runner is prepared as `LANE.md` prepares a host: the newest Node 22 from nodejs.org, checked against its sums, under root's own directories and linked where the units and sudo's path look; the commit's tree unpacked outside any home.
- The lane's output, which redacts every secret, is kept as the run's artifact; the run's own log shows the PASS and FAIL lines.
- The lane is no required check of a pull request and cancels no other run; a red lane is read on `main` within a day, as the nightly matrix is.
- `LANE.md` keeps the by-hand procedure as the fallback and records the lane's first green run on CI; the by-hand record stands as history.

### Considered and declined

- The lane on every pull request touching the hub, required or not: a quarter of an hour of privileged system changes on every push to a branch, against DR-145's lean run, and `merge-on-green` waiting on it; a push to `main` touching the hub runs it within the hour instead.
- The lane inside the CI workflow as another job: the CI workflow's audit names a pull request's jobs exactly, and the lane's triggers differ from the checks'.
- The runner's own Node: it belongs to the runner account, which the install script refuses for a program root and every seat run.

## Consequences

- `release` gains the lane's tier and the audit of its workflow; `hub-10` is unchanged; `LANE.md` names the workflow and records its first green run.
- The tiers of [DR-086](086-tests-in-tiers.md) read: checks, the lane, smoke, live smoke, regression.
