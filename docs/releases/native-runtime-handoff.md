# Native desktop runtime release handoff

The native desktop implementation spans three repositories:

- [Cligent #88](https://github.com/sublang-ai/cligent/pull/88): Windows Codex transport, final response and incidental shell-cache handling.
- [Playbook #91](https://github.com/sublang-ai/playbook/pull/91): Windows private session storage through the existing permission mechanism.
- [SPEX #315](https://github.com/sublang-ai/spex/pull/315): native desktop integration, installers and app-tag publication.

SPEX #315 stays draft until its temporary runtime dependencies are replaced by published npm versions. Merging source code alone does not publish a package. The Cligent and Playbook repositories already publish through their version tags and npm OIDC workflows; maintainers must complete those releases before the SPEX adoption commit can be finalized. Existing public versions 0.36.1 and 18.1.0 do not contain these patches and must not be republished.

## Required order

1. Review/merge the two runtime PRs and publish new official npm versions using their existing release preparation and tag workflows. Choose compatible ranges across Playbook, Cligent and SLC; use the dependency closure gate to detect duplicates or incompatible peers.
2. In SPEX, replace the Cligent and Playbook `file:` declarations in `packages/core/package.json` and `apps/desktop/package.json` with those actual published versions. Align the root/server declarations if their ranges do not admit the chosen versions. Regenerate `package-lock.json` from the real npm registry, keeping registry URLs and integrity values produced by npm. Never invent future version metadata or reuse a locally packed artifact's integrity as a registry lock.
3. Remove the superseded tracked runtime archives/patches from the final SPEX change after preserving their provenance through the linked upstream PRs and the immutable beta.22 history. Do not touch unrelated untracked archives in a developer's worktree.
4. Verify `node scripts/dependency-closure.mjs --registry-only`, the normal dependency/prepush gates, CI and the small native installer/workflow regression. Mark SPEX ready for review only after registry adoption and those checks pass, then merge it through review.
5. Push a new version-matching `app-v*` tag on the accepted commit. The existing workflow waits for CI, checks the registry runtime lock before `npm ci`, builds on macOS arm64 and Windows x64, and publishes the DMG, NSIS installer and SHA256SUMS only after both platform jobs pass. No local package creation, vendor upload or manual build-artifact upload is an input.

The runtime release tags and the app release tag are separate releases. This handoff creates neither, and does not authorize an automatic merge or npm publication.

## Verification boundary

The previously accepted beta.22 installer uses the explicit historical file snapshots at commit `11753c81`; its tag and artifacts remain unchanged. The new app-tag guard deliberately refuses that dependency form for future tags. It has a passing registry fixture and rejection coverage for file/Git/alternate-host/missing-integrity/local-override inputs. Its actual refusal of the current snapshots was also observed.

This guard is a release gate, not proof that the as-yet-unpublished source fixes can already be installed from npm. A new registry-only native Tag build remains pending those upstream releases. Prior Windows startup latency and native-permission fallback observations remain recorded in the PRs; no permission/evidence requirement is disabled by this handoff.
