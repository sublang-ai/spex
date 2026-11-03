<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# TAG-driven publishing

After the required release preparation, select an intended committed and pushed
source revision and an unused tag. No manifest bump or version-only PR is needed.
The workflow definition must already exist at that revision.

| Tag | Published output |
| --- | --- |
| `app-vX.Y.Z` | Mac arm64 DMG and Windows x64 installer |
| `app-vX.Y.Z-beta.N` (`N >= 1`) | Same downloads, GitHub pre-release |
| `cli-vX.Y.Z` | `@sublang/spex@X.Y.Z` on npm |

For example, substituting a real unused version and intended revision:

```sh
git tag -s app-vX.Y.Z-beta.N <source-commit> -m 'Spex App X.Y.Z-beta.N'
git push origin app-vX.Y.Z-beta.N
# Or for the npm channel:
git tag -s cli-vX.Y.Z <source-commit> -m 'Spex CLI X.Y.Z'
git push origin cli-vX.Y.Z
```

CI prepares the selected workspace versions and their lockfile entries before
installation, validation and packaging. It never writes those changes back to
Git, resolves new dependencies or changes the other channel's version. Full
channel validation still gates publication. Mac downloads require signing and
notarization; both native builds and packaged strict compiler checks must pass.

An existing exact-version changelog section supplies curated notes. Otherwise CI
generates the commit range since the previous published same-channel ancestor,
with source/compare links. Stale `[Unreleased]` text, drafts and unpublished tags
are not release notes or release boundaries. Historical changelogs stay intact.

The actual npm tarball, archived app version and native product metadata must
match the tag; CI publishes the exact inspected archive/downloads. Existing
GitHub releases (including drafts), npm versions and registry lookup errors stop
publication. Diagnose a partial failure rather than moving an existing tag or
expecting the workflow to overwrite a release.

To reproduce version preparation locally, use a scratch checkout:

```sh
node scripts/release-version.mjs prepare --tag=app-vX.Y.Z-beta.N
npm ci
npm run build
```

Source manifests retain development defaults. The helper's `check` command only
validates tag syntax/channel, while `verify` checks prepared manifest/lock versions.
The local smoke and manual acceptance scopes remain in
[the release checklist](../release-smoke.md).

## Local verification (2026-11-03)

- Focused tag preparation, notes, workflow and Mac distribution regression suites:
  45 tests passed. Spec lint: zero errors, one pre-existing core-service warning.
- A real isolated CLI tarball prepared as `cli-v5.0.999` contained the matching
  manifest and its extracted executable returned `spex 5.0.999`. No version was
  published. The snapshot reused the installed locked local dependencies.
- Actual offline `npm ci` accepted both channel preparations in a dependency-free
  workspace fixture; this was not a fresh whole-repository dependency install.
- The updated hook ran on the existing signed beta.26 Mac App: 222 declarations
  came from its physical dependency tree, valid strict compilation and registry
  loading passed, and invalid types and a mismatched expected version failed.
  The native plist, archived manifest and existing notarized DMG receipt/hash
  matched. This was a check of an existing artifact, not a new signed build.
- Windows metadata paths were checked with fixtures and workflow audits; no new
  Windows native build or real APP UI acceptance was run in this change.
- No tag, GitHub Actions release run, merge, npm publication or Apple submission
  was performed for this local verification.

## Branch verification without publication

Dispatch `app-release.yml` or `release.yml` at the candidate branch and pass an
unused channel tag through the required `tag` input. The tag exists only in the
preparation runner for notes assembly and is never pushed. Version injection,
full validation, native signing/notarization, packing and actual artifact checks
use the production jobs; native packaging runs alongside full validation.
Both must pass for final acceptance. Checked installers/checksums and the CLI
tarball remain Actions artifacts. npm publish and GitHub Release creation require
an actual channel-tag push, so manual dispatch cannot publish them.

For targeted native-package repair, an app branch dispatch may explicitly set
`build-only: true`. This runs the native generated-module-scope regression before packaging,
skips reusable CI for that diagnostic run and leaves
the final publication/checksum job ineligible. It is package evidence only;
normal branch dispatch and every actual tag push still require full validation.
