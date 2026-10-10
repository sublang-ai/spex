// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface's reading of environments (DR-104): which
// spex repository each side shows, whether it syncs, what its words
// are for sources, artifacts and the core's busy states, and the two
// name rules the surface checks in place. Pure functions; the
// components render them. Every phrase is read when called, never at
// module load (localization-4).

import type {
  EnvironmentPackage,
  EnvironmentRequest,
  EnvironmentState,
  GroupsState,
  PlaybookAvailability,
  ProjectInfo,
  RepositoryState,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";

/** A spec package's name, `<org>/<pkg>` in lowercase kebab-case
 * (DR-104), as `environment.request` takes it. */
export const SPEC_PACKAGE_NAME_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The Agent Skills name rule a playbook id follows (DR-104,
 * playbook-library-51). */
export const PLAYBOOK_ID_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const PLAYBOOK_ID_MAX = 64;

/** The project the Playbooks surface shows beside your own group: the
 * workspace's current project, else the first registered one. */
export function chosenProject(
  projects: readonly ProjectInfo[],
  currentProjectId: string | undefined,
): ProjectInfo | undefined {
  return projects.find((project) => project.id === currentProjectId) ?? projects[0];
}

/** Your own group's spex repository: as Space reads it, else as the
 * playbook list names it. */
export function ownRepositoryKey(
  space: GroupsState | undefined,
  own: readonly PlaybookAvailability[] | undefined,
): string | undefined {
  for (const group of space?.groups ?? []) {
    const repository = group.repositories.find((entry) => entry.own);
    if (repository) return repository.key;
  }
  return own?.[0]?.repository;
}

/** One spex repository as Space last read it. */
export function repositoryOf(
  space: GroupsState | undefined,
  key: string | undefined,
): RepositoryState | undefined {
  if (!key) return undefined;
  for (const group of space?.groups ?? []) {
    const repository = group.repositories.find((entry) => entry.key === key);
    if (repository) return repository;
  }
  return undefined;
}

/** What the core is doing to an environment, as its line reads. */
export function busyWord(busy: EnvironmentState["busy"]): string | undefined {
  switch (busy) {
    case "resolving":
      return i18n._({ id: "Resolving…", comment: "the environment's requests are being resolved into a lock" });
    case "installing":
      return i18n._({ id: "Installing…", comment: "the environment's locked files are being installed" });
    case "publishing":
      return i18n._({ id: "Publishing…", comment: "a spec package is being uploaded to the registry" });
    default:
      return undefined;
  }
}

/** A source's kind in one word (playbook-library-29). */
export function sourceKindWord(kind: EnvironmentPackage["source"]["kind"]): string {
  switch (kind) {
    case "registry":
      return i18n._({ id: "registry", comment: "a spec package's source: the registry" });
    case "path":
      return i18n._({ id: "path", comment: "a spec package's source: a folder in the working folder" });
    case "git":
      return i18n._({ id: "Git", comment: "a spec package's source: a Git repository at a commit" });
    case "builtin":
      return i18n._({ id: "built-in", comment: "a spec package's source: the one the app ships" });
  }
}

/** A request as the environment lists it: its source and what it asks
 * for (playbook-library-92). */
export function requestPhrase(request: EnvironmentRequest): string {
  switch (request.kind) {
    case "registry":
      return i18n._("registry {requirement}", { requirement: request.version });
    case "path":
      return i18n._("path {path}", { path: request.path });
    case "git":
      return request.path
        ? i18n._("Git {repository} at {rev}, {path}", { repository: request.git, rev: request.rev, path: request.path })
        : i18n._("Git {repository} at {rev}", { repository: request.git, rev: request.rev });
  }
}

/** An artifact's kind in one word (DR-104). */
export function artifactKindWord(kind: EnvironmentPackage["artifacts"][number]["kind"]): string {
  switch (kind) {
    case "source":
      return i18n._({ id: "source", comment: "a spec package's artifact kind: source material" });
    case "spec":
      return i18n._({ id: "spec", comment: "a spec package's artifact kind: the spec" });
    case "skill":
      return i18n._({ id: "skill", comment: "a spec package's artifact kind: an Agent Skills folder" });
    case "playbook":
      return i18n._({ id: "playbook", comment: "a spec package's artifact kind: a playbook" });
    case "applet":
      return i18n._({ id: "applet", comment: "a spec package's artifact kind: a browser-server application" });
  }
}

/** The caret requirement Add from registry writes for a version
 * (playbook-library-92). */
export function caretOf(version: string): string {
  return `^${version}`;
}

/** A picked folder's path inside the working folder, or undefined
 * when it lies outside it (environments-15 refuses that). */
export function relativeInside(folder: string, picked: string): string | undefined {
  const base = folder.replace(/\/+$/u, "");
  if (picked === base) return ".";
  return picked.startsWith(`${base}/`) ? picked.slice(base.length + 1) : undefined;
}
