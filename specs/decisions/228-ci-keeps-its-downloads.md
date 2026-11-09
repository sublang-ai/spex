<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-228: CI Keeps Its Downloads

## Status

Accepted (2026-11-09) after GitHub's release-asset timeouts of 2026-11-08 failed the required checks of pull requests whose tests all passed.
Amends [DR-199](199-release-gated-full-validation.md) in its runs after a push to `main`: the cache seed runs there, validating nothing.

## Context

- Every install downloads dugite's Git, and the jobs running Electron download it, from GitHub releases without authentication; during the timeouts five jobs failed on those downloads, and reruns failed the same way.
- A pull request restores only caches saved under its own merge ref or under `main`.
  Since CI runs on no push to `main` ([DR-199](199-release-gated-full-validation.md)), `main` holds no current caches, each pull request saves its own copies, and the repository's caches exceed their 10 GB limit and are evicted.
- The classifier job saved npm's cache without installing, so every Linux install restored an empty cache under its key.

## Decision

- Every CI and release install first restores Electron's and dugite's Git archives from caches keyed by the runner's platform and the locked package version.
  A miss downloads as before, and a successful job saves what it fetched.
- Electron's archive is restored to the default download cache, which Electron's installer and electron-builder both read when neither names another; a cache of CI's own would leave packaging downloading the archive again.
- Only a job that installs saves npm's package cache.
- A cache seed workflow runs on a push to `main` that changes the lockfile or the cache tooling, and on request.
  On Linux, macOS and Windows it installs the dependencies and fetches Electron, saving npm's cache and both archives under `main`; it runs no build, suite or check.

## Consequences

- A pull request's first run restores the archives seeded under `main`, so a release-asset outage fails only installs whose locked versions were never seeded.
- A cache unused for seven days expires; until the seed runs again, runs download as before.
- Each lockfile change on `main` costs three short seed jobs; validation scope, the merge gate and release validation are unchanged.
