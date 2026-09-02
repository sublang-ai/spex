// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Host construction capabilities for schema-3 playbooks (DR-037): from
// playbook 10 on, every host embedding the Captain shell supplies live
// repository and effect-ledger facilities for each enabled playbook,
// or no session can start. The git effect semantics — exclusive and
// cohort runs, deferred continuation, receipt classification — are the
// playbook CLI's own, shipped in its package but not on its exports
// map; Spex loads that module from the installed package rather than
// restating three thousand lines of it. What Spex supplies itself is
// the effect ledger's write-ahead: an in-memory, per-session ledger
// with one attempt per Boss turn, because a Spex session never resumes
// after a restart (core-service-10), so nothing would read a durable
// ledger back.
//
// Playbook 12.1 publishes `@sublang/playbook/host-capabilities`, but
// that facade serves a standalone runtime, not the shell: its
// repository object lacks `acquire` and `runCohort` of the six members
// the shell's exact-shape validator demands, and each construction
// owns its own ledger where the shell requires every enabled playbook's
// ledger to agree — so the shipped builder below stands (DR-038).

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertPlaybookEffectLedger,
  emptyPlaybookEffectLedger,
} from "@sublang/playbook/xstate-runtime";
import type {
  PlaybookEffectBoundary,
  PlaybookEffectLedger,
  PlaybookEffectLedgerCommand,
  PlaybookEffectLedgerCommandBatch,
  PlaybookEffectLogicalOperation,
} from "@sublang/playbook/runtime";
import type { PlaybookHostConstructionCapabilities } from "@sublang/playbook/playbook-captain";

import { playbookPackageRoot } from "./config.js";

export type HostCapabilities = Readonly<
  Record<string, PlaybookHostConstructionCapabilities>
>;

/** The per-session facilities a live session holds alongside its runtime. */
export interface HostEffects {
  readonly capabilities: HostCapabilities;
  /** Runs before each Boss turn, as the CLI reconciles before each of
   * its own: a fresh attempt, then repository-effect recovery. */
  beginTurn(): Promise<void>;
  /** The shell's unresolved-effect abandonment hooks. Durable
   * settlement is the CLI's record; Spex has none to write, so the
   * abandonment clears the shell's stack and settles nothing else. */
  readonly settlement: {
    begin(input: unknown): Promise<void>;
    complete(input: unknown): Promise<void>;
  };
}

interface CatalogEntry {
  readonly id: string;
  readonly artifactSchema: number;
  readonly requiredRoleIds: readonly string[];
  readonly concurrentRoleSets: readonly (readonly string[])[];
}

/** The shipped builder's surface, typed loosely: it has no declaration. */
interface RepositoryEffectsModule {
  createRepositoryEffectCapabilities(input: {
    cwd: string;
    catalog: Record<string, CatalogEntry>;
    sessionId: string;
    sessionLease: { sessionId: string; ownerToken: string; assertOwner(): Promise<void> };
    createWriteAhead(lease: unknown): Promise<LedgerService>;
  }): Promise<HostCapabilities>;
  refreshRepositoryEffectCapabilities(capabilities: HostCapabilities): Promise<PlaybookEffectLedger>;
  recoverIncompleteRepositoryEffects(input: {
    catalog: Record<string, CatalogEntry>;
    capabilities: HostCapabilities;
  }): Promise<PlaybookEffectLedger>;
}

interface LedgerService {
  snapshot(): PlaybookEffectLedger;
  refresh(): Promise<PlaybookEffectLedger>;
  writeAhead(
    authority: unknown,
    commands: PlaybookEffectLedgerCommandBatch,
  ): Promise<PlaybookEffectLedger>;
}

let repositoryEffects: Promise<RepositoryEffectsModule> | undefined;

function loadRepositoryEffects(env: NodeJS.ProcessEnv): Promise<RepositoryEffectsModule> {
  repositoryEffects ??= import(
    pathToFileURL(
      join(
        playbookPackageRoot(env),
        "reference",
        "sdlc",
        "code.playbook",
        "bin",
        "repository-effects.js",
      ),
    ).href
  ) as Promise<RepositoryEffectsModule>;
  return repositoryEffects;
}

/**
 * The effect ledger as a trusted in-process host keeps it: the four
 * command kinds applied in order, idempotent on a repeated start or
 * append, each batch one revision — the CLI's own reducer without its
 * defenses against a foreign writer, which no one here is.
 */
export function createLedgerService(attempt: () => { attemptId: string; attemptNumber: number }): LedgerService {
  let ledger: PlaybookEffectLedger = emptyPlaybookEffectLedger();
  return {
    snapshot: () => ledger,
    refresh: async () => ledger,
    writeAhead: async (_authority, commands) => {
      let next = ledger;
      for (const command of commands) next = applyCommand(next, attempt(), command);
      if (next !== ledger) {
        ledger = assertPlaybookEffectLedger({ ...next, revision: ledger.revision + 1 });
      }
      return ledger;
    },
  };
}

function applyCommand(
  ledger: PlaybookEffectLedger,
  attempt: { attemptId: string; attemptNumber: number },
  command: PlaybookEffectLedgerCommand,
): PlaybookEffectLedger {
  switch (command.kind) {
    case "start-boundaries": {
      const known = new Set(ledger.boundaries.map((b) => b.boundaryId));
      const fresh = command.boundaries.filter((b) => !known.has(b.boundaryId));
      if (fresh.length === 0) return ledger;
      let sequence = ledger.boundaries.at(-1)?.sequence ?? 0;
      const additions: PlaybookEffectBoundary[] = fresh.map((start) => ({
        ...start,
        sequence: ++sequence,
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber,
      }));
      return { ...ledger, boundaries: [...ledger.boundaries, ...additions] };
    }
    case "replace-boundaries": {
      const boundaries = [...ledger.boundaries];
      let changed = false;
      for (const { expected, next } of command.replacements) {
        const index = boundaries.findIndex((b) => b.boundaryId === expected.boundaryId);
        if (index < 0) {
          throw new Error(`effect ledger names an absent boundary ${expected.boundaryId}`);
        }
        if (boundaries[index] !== next) {
          boundaries[index] = next;
          changed = true;
        }
      }
      return changed ? { ...ledger, boundaries } : ledger;
    }
    case "append-logical-operations": {
      const known = new Set(ledger.logicalOperations.map((o) => o.operationId));
      const fresh = command.operations.filter((o) => !known.has(o.operationId));
      if (fresh.length === 0) return ledger;
      let sequence = ledger.logicalOperations.at(-1)?.sequence ?? 0;
      const additions: PlaybookEffectLogicalOperation[] = fresh.map((operation) => ({
        ...operation,
        sequence: ++sequence,
      }));
      return {
        ...ledger,
        logicalOperations: [...ledger.logicalOperations, ...additions],
      };
    }
    case "replace-logical-operations": {
      const operations = [...ledger.logicalOperations];
      let changed = false;
      for (const { expected, next } of command.replacements) {
        const index = operations.findIndex((o) => o.operationId === expected.operationId);
        if (index < 0) {
          throw new Error(`effect ledger names an absent operation ${expected.operationId}`);
        }
        if (operations[index] !== next) {
          operations[index] = next;
          changed = true;
        }
      }
      return changed ? { ...ledger, logicalOperations: operations } : ledger;
    }
  }
}

/**
 * Build the capabilities one session hands the Captain shell: one per
 * enabled schema-3 playbook, over the project's git worktree, with the
 * session's own authority token under the core's root lease.
 */
export async function createHostEffects(input: {
  cwd: string;
  sessionId: string;
  playbooks: readonly CatalogEntry[];
  env?: NodeJS.ProcessEnv;
}): Promise<HostEffects> {
  const effects = await loadRepositoryEffects(input.env ?? process.env);
  const catalog = Object.fromEntries(
    input.playbooks
      .filter((playbook) => playbook.artifactSchema === 3)
      .map((playbook) => [
        playbook.id,
        {
          id: playbook.id,
          artifactSchema: 3,
          requiredRoleIds: playbook.requiredRoleIds,
          concurrentRoleSets: playbook.concurrentRoleSets,
        },
      ]),
  );
  let attempt = { attemptId: randomUUID(), attemptNumber: 1 };
  const ledger = createLedgerService(() => attempt);
  const capabilities = await effects.createRepositoryEffectCapabilities({
    cwd: input.cwd,
    catalog,
    sessionId: input.sessionId,
    // The session's authority under the root lease (core-service-61):
    // the builder validates the token's shape and uses it as the
    // boundaries' provenance, never re-reading a lease file.
    sessionLease: {
      sessionId: input.sessionId,
      ownerToken: randomUUID(),
      assertOwner: async () => {},
    },
    createWriteAhead: async () => ledger,
  });
  return {
    capabilities,
    beginTurn: async () => {
      attempt = { attemptId: randomUUID(), attemptNumber: 1 };
      await effects.refreshRepositoryEffectCapabilities(capabilities);
      await effects.recoverIncompleteRepositoryEffects({ catalog, capabilities });
    },
    settlement: {
      begin: async () => {},
      complete: async () => {},
    },
  };
}
