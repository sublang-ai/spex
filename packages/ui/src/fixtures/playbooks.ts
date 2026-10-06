// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface's fixtures (playbook-library, DR-104): a home
// with your own group's spex repository and one project's, the own
// config's roster, the environments each side installs, and what they
// export — the shapes the core answers over the protocol, so a test
// drives the real store and surface against a stand-in client.

import type {
  ConfigState,
  EnvironmentPackage,
  EnvironmentState,
  GroupsState,
  PlaybookAvailability,
  ProjectInfo,
  ReadinessEntry,
  RepositoryState,
} from "@sublang/spex-core/protocol";

export const NOW = Date.UTC(2026, 9, 6, 12);
export const PROJECT_ID = "me/demo-spex";
export const OWN_KEY = "me/me-spex";

export const PROJECT: ProjectInfo = {
  id: PROJECT_ID,
  path: "/work/demo",
  name: "demo",
  registeredAt: NOW - 30 * 3_600_000,
  repository: { key: PROJECT_ID, name: "demo-spex", group: "me", own: true },
};

/** Your own group's config: the roster every side's bindings name. */
export const CONFIG_STATE: ConfigState = {
  status: "valid",
  seeded: false,
  summary: {
    path: `/home/me/.spex/workspace/${OWN_KEY}/config/playbook.config.yaml`,
    captain: {
      adapter: "claude",
      model: "claude-opus-4-8",
      effort: "high",
      permissions: { mode: "auto" },
    },
    players: [
      {
        id: "dev.coder",
        agent: { adapter: "claude", model: "claude-opus-5", effort: "high", instruction: "Keep the diff small." },
        display: "claude-opus-5 @ high",
        boundBy: ["code.coder", "fix.coder"],
      },
      {
        id: "dev.reviewer",
        agent: { adapter: "codex", model: "gpt-5.6-sol" },
        display: "gpt-5.6-sol",
        boundBy: ["code.reviewer"],
      },
    ],
    playbooks: [],
  },
};

export const READINESS: ReadinessEntry[] = [
  {
    adapter: "claude",
    ready: true,
    usedBy: ["captain", "dev.coder (code.coder)"],
    fastModeSupported: true,
    subagentModelSupported: true,
  },
  {
    adapter: "codex",
    ready: false,
    requirement: "set OPENAI_API_KEY or run `codex login`",
    usedBy: [],
    fastModeSupported: false,
    subagentModelSupported: false,
  },
];

export function repository(over: Partial<RepositoryState> = {}): RepositoryState {
  return {
    key: PROJECT_ID,
    name: "demo-spex",
    id: "42",
    own: false,
    remote: "/tmp/origin.git",
    code: null,
    folder: PROJECT.path,
    state: "reachable",
    reason: null,
    waiting: null,
    members: 1,
    visibility: "private",
    branch: null,
    local: [],
    incoming: [],
    conflicts: [],
    lastSync: null,
    noticed: true,
    sync: { phase: "idle" },
    ...over,
  };
}

/** The home: your own group's spex repository and the project's, the
 * account signed in unless a test says otherwise. */
export function home(
  options: { syncing?: string; account?: GroupsState["account"] } = {},
): GroupsState {
  const sync = (key: string): RepositoryState["sync"] =>
    options.syncing === key
      ? { phase: "running", op: "sync", step: "check", since: NOW, cancelable: true }
      : { phase: "idle" };
  return {
    home: "/home/me/.spex",
    git: { ok: true, version: "2.45.0" },
    host: { url: "https://gitlab.example", displayName: "GitLab" },
    account: options.account === undefined ? { id: "7", login: "me", displayName: "Me" } : options.account,
    signIn: { phase: "idle" },
    readAt: NOW,
    groups: [
      {
        id: "1",
        fullPath: "me",
        name: "me",
        url: null,
        own: true,
        repositories: [
          repository({ key: OWN_KEY, name: "me-spex", own: true, folder: null, sync: sync(OWN_KEY) }),
          repository({ sync: sync(PROJECT_ID) }),
        ],
      },
    ],
    diagnostics: [],
    issues: 0,
  };
}

/** A playbook an environment exports, enabled nowhere unless told. */
export function available(over: Partial<PlaybookAvailability> & { id: string }): PlaybookAvailability {
  return {
    name: over.id,
    command: over.id,
    intent: `${over.id} intent`,
    roles: ["coder"],
    package: "sublang/playbooks",
    version: "17.4.1",
    source: "builtin",
    repository: OWN_KEY,
    enabled: [],
    present: true,
    ...over,
  };
}

export function specPackage(over: Partial<EnvironmentPackage> & { name: string }): EnvironmentPackage {
  return {
    version: "1.0.0",
    source: { kind: "registry", detail: "spex.pub" },
    direct: true,
    requiredBy: [],
    artifacts: [],
    exports: [],
    installed: true,
    missingPath: null,
    ...over,
  };
}

export function environment(over: Partial<EnvironmentState> & { repository: string }): EnvironmentState {
  return {
    language: null,
    requests: {},
    packages: [],
    stale: null,
    conflicts: null,
    busy: null,
    error: null,
    ...over,
  };
}

/** The project's environment: a registry request whose playbook needs
 * a dependency, an artifact read in its original language where `zh`
 * was wanted, a path source this device lacks, and the built-ins. */
export const PROJECT_ENVIRONMENT = environment({
  repository: PROJECT_ID,
  language: "zh-Hans",
  requests: {
    "acme/triage": { kind: "registry", version: "^1.2.0" },
    "acme/local-tools": { kind: "path", path: "spex-packages/local-tools" },
    "sublang/playbooks": { kind: "registry", version: "^17.4.1" },
  },
  packages: [
    specPackage({
      name: "acme/triage",
      version: "1.2.3",
      artifacts: [
        { id: "triage", kind: "playbook", language: "zh-Hans", fallback: false },
        { id: "triage-spec", kind: "spec", language: "en", fallback: true },
      ],
      exports: [{ name: "triage", artifact: "triage" }],
    }),
    specPackage({
      name: "acme/labels",
      version: "0.4.0",
      direct: false,
      requiredBy: ["acme/triage"],
      artifacts: [{ id: "labels", kind: "skill", language: "en", fallback: true }],
      installed: false,
    }),
    specPackage({
      name: "acme/local-tools",
      version: "0.1.0",
      source: { kind: "path", detail: "spex-packages/local-tools" },
      artifacts: [{ id: "lint", kind: "skill", language: "en", fallback: false }],
      installed: false,
      missingPath: "spex-packages/local-tools",
    }),
    specPackage({
      name: "sublang/playbooks",
      version: "17.4.1",
      source: { kind: "builtin", detail: "the app" },
      artifacts: [{ id: "code", kind: "playbook", language: "en", fallback: false }],
    }),
  ],
});

export const OWN_ENVIRONMENT = environment({
  repository: OWN_KEY,
  requests: { "sublang/playbooks": { kind: "registry", version: "^17.4.1" } },
  packages: [
    specPackage({
      name: "sublang/playbooks",
      version: "17.4.1",
      source: { kind: "builtin", detail: "the app" },
      artifacts: [
        { id: "code", kind: "playbook", language: "en", fallback: false },
        { id: "review", kind: "playbook", language: "en", fallback: false },
      ],
    }),
  ],
});
