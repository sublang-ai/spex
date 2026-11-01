// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The project's Packages and Playbooks tabs' reading of environments
// (DR-104, DR-172): your own group's spex repository, where a publish
// goes, the words for sources, version requirements, what a package
// provides and the core's busy states, the built-in package, the name a
// package folder gives, and the two name rules the tabs check in place.
// Pure functions; the components render them. Every phrase is read when
// called, never at module load (localization-4).

import type {
  EnvironmentPackage,
  EnvironmentRequestSummary,
  EnvironmentState,
  GroupsState,
  PlaybookAvailability,
  RegistryState,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { hostNameOf } from "./instances.js";

/** A spec package's name, `<org>/<pkg>` in lowercase kebab-case
 * (DR-104), as `environment.request` takes it. */
export const SPEC_PACKAGE_NAME_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The Agent Skills name rule a playbook id follows (DR-104,
 * playbook-library-51). */
export const PLAYBOOK_ID_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const PLAYBOOK_ID_MAX = 64;

/** Your own group's spex repository: as Space reads it under your own
 * group (space-1), else as the playbook list names it. */
export function ownRepositoryKey(
  space: GroupsState | undefined,
  own: readonly PlaybookAvailability[] | undefined,
): string | undefined {
  return space?.own?.repositories?.find((entry) => entry.own)?.key ?? own?.[0]?.repository;
}

/** The independent registry destination and publication account: the
 * registry's origin and display name, and the login signed in there. */
export interface PublishTarget {
  origin: string;
  signedIn: boolean;
  name: string;
  login?: string;
}

/** Package authorization is read only from its selected registry account.
 * A missing registry state never borrows a Space grant. */
export function publishTargetOf(environment: EnvironmentState | undefined, accounts?: Record<string, RegistryState>): PublishTarget | undefined {
  if (!environment?.registry) return undefined;
  const account = accounts?.[environment.registry.origin];
  return {
    origin: environment.registry.origin,
    signedIn: !!account?.account,
    name: account?.displayName || hostNameOf(environment.registry.origin),
    ...(account?.account ? { login: account.account.login } : {}),
  };
}

/** What the core is doing to an environment, as its heading reads: the
 * act's own word — Update, Install, Publish — never resolve
 * (playbook-library-26). */
export function busyWord(busy: EnvironmentState["busy"]): string | undefined {
  switch (busy) {
    case "resolving":
      return i18n._({ id: "Updating…", comment: "the packages spex.yaml names are being updated to the newest versions it allows and installed" });
    case "installing":
      return i18n._({ id: "Installing…", comment: "the files spex.lock records are being installed on this computer" });
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

/** The built-in spec package the app ships (environments-11): one quiet
 * line on the Packages tab, never a removable row (playbook-library-92). */
export const BUILTIN_PACKAGE = "sublang/playbooks";

/** Whether a package of the environment is the built-in one: the name
 * the app seeds it by, or a lock naming the app as its source. */
export function isBuiltinPackage(name: string, pkg: EnvironmentPackage | undefined): boolean {
  return name === BUILTIN_PACKAGE || pkg?.source.kind === "builtin";
}

/** A `major.minor.patch` version's three numbers, or undefined. */
function triple(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** The versions a caret requirement at `version` admits beyond it, as
 * a series — "1.x", "0.3.x" — or undefined where it admits none but
 * that version (`^0.0.3`) (environments-4). */
function caretSeries(version: string): string | undefined {
  const parts = triple(version);
  if (!parts) return undefined;
  const [major, minor] = parts;
  if (major > 0) return `${major}.x`;
  if (minor > 0) return `0.${minor}.x`;
  return undefined;
}

const exactly = (version: string): string =>
  i18n._({
    id: "{version} exactly",
    comment: "a package's version requirement that admits one version only, such as 1.2.0 exactly; {version} is that version",
    values: { version },
  });

/** A request's version requirement as its source's tooltip reads it
 * (playbook-library-92): "any 1.x" for `^1.2.0`, "any 1.2.x" for
 * `~1.2.0`, "1.2.0 exactly" for `1.2.0`; one in no form the core takes
 * stands as written. */
export function rangePhrase(requirement: string): string {
  const any = (series: string): string =>
    i18n._({
      id: "any {series}",
      comment: "a package's version requirement admitting a series of versions, such as any 1.x; {series} is that series",
      values: { series },
    });
  if (requirement.startsWith("^")) {
    const version = requirement.slice(1);
    if (!triple(version)) return requirement;
    const series = caretSeries(version);
    return series ? any(series) : exactly(version);
  }
  if (requirement.startsWith("~")) {
    const parts = triple(requirement.slice(1));
    return parts ? any(`${parts[0]}.${parts[1]}.x`) : requirement;
  }
  return triple(requirement) ? exactly(requirement) : requirement;
}

/** The requirements a registry search result offers for one of its
 * versions (playbook-library-92): the caret first, read "1.2.0 and newer
 * 1.x", then the exact, read "1.2.0 exactly"; a version a caret admits
 * nothing beyond offers the exact alone. */
export function requirementChoices(version: string): { requirement: string; label: string }[] {
  const series = caretSeries(version);
  const choices: { requirement: string; label: string }[] = [];
  if (series) {
    choices.push({
      requirement: `^${version}`,
      label: i18n._({
        id: "{version} and newer {series}",
        comment: "a version choice in Add…'s registry results: this version or any newer one in its series, such as 1.2.0 and newer 1.x",
        values: { version, series },
      }),
    });
  }
  choices.push({ requirement: version, label: exactly(version) });
  return choices;
}

/** Where a package comes from, as its source glyph's tooltip reads it
 * (playbook-library-92, environments-29): the request's own words for a
 * package spex.yaml names, the lock's for one another package
 * requires. */
export function sourceTooltip(
  pkg: EnvironmentPackage | undefined,
  request: EnvironmentRequestSummary | undefined,
): string {
  if (pkg?.source.kind === "builtin") {
    return i18n._({ id: "Built in", comment: "the tooltip of a package's source glyph: the app ships it" });
  }
  if (request?.kind === "registry") {
    return i18n._({
      id: "From the registry · {range}",
      comment: "the tooltip of a package's source glyph: it comes from the registry at the versions {range} reads, such as any 1.x",
      values: { range: rangePhrase(request.version) },
    });
  }
  if (request?.kind === "path") {
    return i18n._({
      id: "From folder {path}",
      comment: "the tooltip of a package's source glyph: it comes from a folder; {path} is the folder, such as spex-packages/acme/triage",
      values: { path: request.path },
    });
  }
  if (request?.kind === "git") {
    return i18n._({
      id: "From Git {repository} at {rev}",
      comment: "the tooltip of a package's source glyph: it comes from a Git repository at a branch or tag; {repository} names the repository, {rev} the branch or tag",
      values: { repository: request.repository, rev: request.rev },
    });
  }
  switch (pkg?.source.kind) {
    case "path":
      return i18n._({
        id: "From folder {path}",
        comment: "the tooltip of a package's source glyph: it comes from a folder; {path} is the folder, such as spex-packages/acme/triage",
        values: { path: pkg.source.detail },
      });
    case "git":
      return i18n._({
        id: "From Git {source}",
        comment: "the tooltip of a package's source glyph, for a package another package requires: it comes from Git; {source} names the repository and its commit",
        values: { source: pkg.source.detail },
      });
    default:
      return i18n._({ id: "From the registry", comment: "the tooltip of a package's source glyph, for a package another package requires: it comes from the registry" });
  }
}

/** What a package provides, in one phrase (playbook-library-92): "1 spec
 * · 2 skills · 1 playbook", each kind it holds counted, in that order;
 * empty where it holds none. */
export function providesPhrase(artifacts: readonly EnvironmentPackage["artifacts"][number][]): string {
  const count = (kind: EnvironmentPackage["artifacts"][number]["kind"]): number =>
    artifacts.filter((artifact) => artifact.kind === kind).length;
  const parts: string[] = [];
  const specs = count("spec");
  if (specs > 0) {
    parts.push(i18n._({ id: "{count, plural, one {# spec} other {# specs}}", comment: "what a package provides: its count of specs", values: { count: specs } }));
  }
  const skills = count("skill");
  if (skills > 0) {
    parts.push(i18n._({ id: "{count, plural, one {# skill} other {# skills}}", comment: "what a package provides: its count of skills for agents", values: { count: skills } }));
  }
  const playbooks = count("playbook");
  if (playbooks > 0) {
    parts.push(i18n._({ id: "{count, plural, one {# playbook} other {# playbooks}}", comment: "what a package provides: its count of playbooks", values: { count: playbooks } }));
  }
  const applets = count("applet");
  if (applets > 0) {
    parts.push(i18n._({ id: "{count, plural, one {# applet} other {# applets}}", comment: "what a package provides: its count of applets, pages the IDE shows in a tab", values: { count: applets } }));
  }
  const sources = count("source");
  if (sources > 0) {
    parts.push(i18n._({ id: "{count, plural, one {# source} other {# sources}}", comment: "what a package provides: its count of source materials", values: { count: sources } }));
  }
  return parts.join(" · ");
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
      return i18n._({ id: "applet", comment: "a spec package's artifact kind: a static web page the IDE shows in a tab" });
  }
}

/** The name a package under development's folder gives it
 * (environments-10): `<org>/<pkg>` for `spex-packages/<org>/<pkg>`,
 * else undefined, where Add…'s Folder tab asks for the name. */
export function nameFromFolder(path: string): string | undefined {
  const match = /^(?:\.\/)?spex-packages\/([^/]+)\/([^/]+)\/?$/u.exec(path.trim());
  if (!match) return undefined;
  const name = `${match[1]}/${match[2]}`;
  return SPEC_PACKAGE_NAME_RULE.test(name) ? name : undefined;
}

/** The folder Add…'s Folder tab starts from, where a package under
 * development lies (environments-10). */
export const PACKAGES_FOLDER = "spex-packages/";

/** A picked folder's path inside the working folder, or undefined
 * when it lies outside it (environments-15 refuses that). */
export function relativeInside(folder: string, picked: string): string | undefined {
  const base = folder.replace(/\/+$/u, "");
  if (picked === base) return ".";
  return picked.startsWith(`${base}/`) ? picked.slice(base.length + 1) : undefined;
}
