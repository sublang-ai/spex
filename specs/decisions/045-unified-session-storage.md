<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-045: One Durable Session Across Desktop and CLI

## Status

Accepted (2026-09-05).
Amends [DR-036](036-file-state-store.md), [DR-037](037-playbook-12-adoption.md), [DR-038](038-history-is-done-work.md).
Amended by [DR-047](047-explicit-session-recovery.md), [DR-050](050-shared-storage-cutover.md), [DR-057](057-space-surface.md), [DR-097](097-media-and-browser-tools-across-hosts.md), [DR-103](103-the-home-and-its-groups.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-108](108-the-root-lease-names-the-machine.md), [DR-111](111-the-core-coordinates-as-git-does.md), [DR-144](144-bounded-session-storage.md).

## Context

- The owner asked why an ended session could not take a new message, and why a session run from the terminal could not be deleted from the app.
- Desktop and CLI shared replay but used separate recovery lifecycles; only CLI persisted recovery evidence before external effects.
- History lacked graph definitions and complete CLI player metadata; provider conversations remained external.
- Goal: shared management and portable storage with minimal mechanisms and explicit assumptions.
- The [storage catalog](../../docs/storage.md) describes the shared layout and links its owning definitions.

## Decision

- Amends [DR-036](036-file-state-store.md) in storage ownership, default locations, local data and Git synchronization.
- Amends [DR-037](037-playbook-12-adoption.md) in host integration and effect-ledger durability.
- Amends [DR-038](038-history-is-done-work.md): a session the other interface wrote is deletable.

### Ownership and format

- **Spex home** is the application data directory, defaulting to `~/.spex` or the value of `SPEX_HOME`. Explicit configuration and session-store paths replace their respective defaults.
- Spex owns application data; Playbook owns session formats, validation, migration, continuation and deletion for desktop and CLI.
- One core serves each Spex home; one writer owns each session. Writes, migration and deletion require the corresponding lease.

| Session part | Contents |
| --- | --- |
| Manifest | Identity, `cwd`, versioned checkpoint, recovery journal, uncertain work, effect ledger and replay boundary/completeness |
| Replay stream | Ordered presentation records, visibility, roles and execution context in the v1 envelope |

- Playbook stores these as bounded files ([DR-144](144-bounded-session-storage.md)); with the session's owned assets ([DR-097](097-media-and-browser-tools-across-hosts.md)) they form one **session bundle**, validated, copied, selected and deleted as one unit.
- Persist recovery evidence before external effects; reconcile interruptions independently of transcript completeness.
- Bind each checkpoint to an exact durable replay prefix by sequence and digest; recording failures preserve uncertainty.
- Retain recovery journals, snapshots and effect evidence independently of replay; defer ledger compaction.
- Derive summaries, usage and graph activity from records; determine liveness from leases and runtime.
- History remains readable and deletable without executable modules or supported checkpoints; older writers preserve unknown versions unchanged.
- At migration, stop old writers, convert sidecars to manifests once, retain originals and retire sidecar writers. Both interfaces write sessions into the home's records layout ([DR-103](103-the-home-and-its-groups.md)).
- CLI schemas 2–5 and incompatible desktop checkpoints remain history only.

### Portability

- Before Git tracking, Playbook converts supported CLI manifests and desktop sidecars to validated bundles without provider tokens in recovery fields. Legacy tokens cannot prove checkpoint continuity and are not reused as hints; originals remain ignored. Git history starts after migration.
- Both interfaces record `cwd`; CLI needs no registry access. Spex resolves it through the home's local working-folder bindings and rescans after registration or rebinding. Aliases associate history with projects but do not authorize execution at changed paths.
- Assume each recorded `cwd` identifies one project across devices; unresolved or conflicting bindings require explicit selection. Rebinding preserves the project's identity and assigns the local path.
- Only Playbook-defined relocation may change checkpoint paths; never substitute paths inside opaque snapshots or effect receipts. Unsupported relocation permits history only.
- Browser layout preferences stay in browser storage. Core viewed markers stay in the ignored local folder and reset when history is replaced.

### Replay compatibility

- The frozen v1 envelope contains an opaque JSON `record`; `type` and `timestamp` are optional.
- Count valid unknown kinds and headerless legacy records in sequence and digest checks; skip unsupported presentation without reporting damage.
- New execution-context records require a string `type` and finite numeric `timestamp`; unsupported context required for recovery permits history only.
- Both interfaces adopt shared framing and compatible readers before writers emit new kinds.

### Presentation and provider continuity

- Store immutable Captain/player identities, roster, settings, bindings and graph definitions as replay context records. Checkpoints and events reference them so history renders without installed playbook modules.
- Either interface continues a session either wrote where its bundle is complete and its checkpoint supported; an engagement parked on a question resumes with its frames, so the reply lands where the question waited.
- Provider tokens are disposable local hints bound to participant and exact checkpoint. Delete and sync each hint before use. Deferred operations retain player/operation identity and receipts without provider tokens.
- Missing hints start fresh conversations. Definite rejection before execution invalidates the hint and permits one fresh attempt within the same logical call.
- Cligent classifies rejection; Playbook supplies the Captain's recovery journal or the player's complete task prompt, preserves effect authority and records the reset.
- Ambiguous execution failures never retry automatically; provider-only knowledge is unrecoverable.
- Repositories, provider credentials and provider histories remain external.

### Git synchronization

- Each spex repository's records sync on its `spex` branch ([DR-103](103-the-home-and-its-groups.md)); the app syncs with each placement, the core performing every Git operation ([DR-057](057-space-surface.md)), and the command line keeps per-device branches merged to or from shared ancestry.
- The command line stops local writers during commit, checkout and merge; the app replaces a unit only where its pre-write check finds it as Save committed it ([DR-111](111-the-core-coordinates-as-git-does.md)). Both preserve exact file bytes. Reopening tightens session permissions before strict validation and rejects unsafe paths. Execute each session on one device at a time; leases are local.
- Ignore `local/`, provider hints, lease directories, caches and migration inputs/receipts. Files stored outside the Git repository do not participate.
- Compare complete session bundles at both pre-merge revisions with their common ancestor; absence means deletion:

| Changes | Selection |
| --- | --- |
| Neither changed, or both agree | Agreed session or deletion |
| One side changed | That session or deletion |
| Both changed differently | Explicit whole-session choice, even after a clean text merge |

- Select every file of a bundle from the same revision or delete them all. Git's per-file merges and hunk preferences do not enforce this relationship.
- Apply the same rule per structured file, including intents. Unselected changes leave active state but remain recoverable from Git ancestry.
- Before reopening, report unresolved session working directories and unknown projects. Retain their files unlisted without automatic registration.
- Preserve uncertainty and reconcile omitted executed work before continuation; Git cannot undo external effects.

### Deletion

- Every listed session is deletable from the app, one the CLI wrote included, at the user's explicit request behind the inline confirm, worded to say the terminal's history goes with it.
- Under the session lease, delete replay, local hints, active legacy sidecar and derived state, then the manifest last. Interrupted cleanup is retryable; incomplete bundles cannot continue.
- Active or unprovable ownership blocks deletion, refused as busy with the holder named. Retain retired lease directories against delayed reclaimers.
- A session that vanishes from the store while the app runs leaves the listing.
- Git records deletions; delete-versus-modify requires whole-session selection. No application tombstones or conflict copies.

### Contract ownership

- Spex defines home files, project bindings and Git selection [[storage-1](../packages/storage.md#storage-1)] [[storage-6](../packages/storage.md#storage-6)] [[storage-11](../packages/storage.md#storage-11)].
- Playbook defines session manifests and their physical form, context, byte digests, hints and migration [[1]]; its contract does not relocate checkpoint paths.
- Cligent defines definite pre-execution resume rejection [[2]].
- The catalog links the owning definitions; each project owns implementation and integration evidence.

## Consequences

- Shared recovery replaces sidecar authority, separate restoration code and the in-memory substitute ledger.
- History is portable; exact resumption needs compatible runtimes, with fresh provider conversations as fallback.
- Different repository or module paths permit history only, even with fresh conversations. Cross-device continuation at changed paths requires a versioned Playbook relocation contract.
- Align the three projects' contracts before rollout; Git supplies ancestry and recovery history without a separate synchronization engine.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-storage.md "Shared durable session contract"
[2]: https://github.com/sublang-ai/cligent/blob/main/specs/packages/engine.md#engine-84 "Definite provider session rejection"
