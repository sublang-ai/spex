// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A package row's expanded lines (playbook-library-92, DR-174, DR-176):
// one line per artifact its release provides with its one act, a
// sibling's support unlisted — a playbook "/<command>", running with its
// package and carrying no act; the skills "skills: <ids> · placed for
// your agents" or "· not placed"; the spec where the state reads it under
// `specs/` (environments-14, environments-41) — "spec · in <path>",
// "spec · edited in specs/ — left as yours" with the version waiting,
// "spec · not placed — specs/ holds <pkg>.md already" or "spec · needs
// specs/ — scaffold first" — followed by "<n> links wait for <org/pkg> ·
// Add" for each package its links wait for, Add requesting it as Add…'s
// registry tab does, a version asked in place for one it does not list;
// else, as the global environment and an older
// core read it, "spec · placed as a skill" or "· not placed"; an applet
// "<id> · its page", opening its tab (applets-1). An artifact read in
// another language than the one wanted is marked with the language it is
// shown in.

import { Fragment, useState, type ReactNode } from "react";
import type {
  EnvironmentPackage,
  EnvironmentRequest,
  EnvironmentState,
  PlaybookAvailability,
} from "@sublang/spex-core/protocol";

import { isLocalPlace } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { appletTabId } from "../lib/applets.js";
import { addLabel, addsTitle, firstRequirement, isProvided, listOf, notListedPhrase } from "../lib/environments.js";
import { currentLocale, i18n } from "../i18n.js";

type Artifact = EnvironmentPackage["artifacts"][number];
type SpecPlacement = NonNullable<NonNullable<EnvironmentPackage["placement"]>["spec"]>;

const PRIMARY =
  "min-h-6 shrink-0 whitespace-nowrap rounded-md border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";
const LINK =
  "min-h-6 shrink-0 whitespace-nowrap rounded px-1 text-xs text-brand-600 hover:underline dark:text-brand-300";
const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const INPUT =
  "min-w-0 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950";
const LINE = "flex flex-wrap items-center gap-x-1.5 gap-y-1 [overflow-wrap:anywhere]";

/** The lines an expanded row shows (playbook-library-92): the playbooks,
 * the skills, the spec and the applets its release provides; a source
 * has no act of its own and no line, nor has a sibling's support. */
export function hasArtifactLines(pkg: EnvironmentPackage | undefined): boolean {
  return pkg !== undefined && pkg.artifacts.some((artifact) => artifact.kind !== "source" && isProvided(artifact));
}

/** Whether an artifact's export stands in the agents' folders: its
 * package's files are here, the lock exports it, and the last export
 * neither missed its package nor kept any of its names out of a folder
 * the reader holds (environments-8, environments-14). */
function placed(pkg: EnvironmentPackage, artifact: Artifact, state: EnvironmentState): boolean {
  if (!pkg.installed || pkg.missingPath !== null) return false;
  if (state.unexported?.missing.includes(pkg.name)) return false;
  const names = pkg.exports.filter((entry) => entry.artifact === artifact.id).map((entry) => entry.name);
  if (names.length === 0) return false;
  const skipped = new Set((state.unexported?.skipped ?? []).map((entry) => entry.name));
  return !names.some((name) => skipped.has(name));
}

/** A language's name in the interface language, "English" for `en`;
 * the code itself where none is known (localization-4). */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(currentLocale(), { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The mark of an artifact read in another language than the one
 * wanted (environments-14): the language it is shown in, its tooltip
 * saying which language it has no text in yet. */
function FallbackMark({ testId, shown, wanted }: { testId: string; shown: string | null; wanted: string | null }) {
  return (
    <span
      data-testid={testId}
      title={
        wanted
          ? i18n._({
              id: "No {language} text yet",
              comment: "the title of an artifact's language mark on the Packages tab: it has no text in the wanted language, so another stands; {language} is the wanted language's name, such as Chinese",
              values: { language: languageName(wanted) },
            })
          : i18n._({ id: "No text in the wanted language yet", comment: "the title of an artifact's language mark on the Packages tab: it has no text in the wanted language, so another stands" })
      }
      className="shrink-0 rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      {shown
        ? languageName(shown)
        : i18n._({ id: "Original text", comment: "an artifact's language mark on the Packages tab: it has no text in the wanted language, so its original stands" })}
    </span>
  );
}

/** One playbook's line: its command, running with its package and
 * carrying no act (playbook-library-92). */
function PlaybookLine({
  name,
  artifact,
  entry,
  fallback,
}: {
  name: string;
  artifact: Artifact;
  entry: PlaybookAvailability | undefined;
  fallback: ReactNode;
}) {
  return (
    <li data-testid={`env-artifact-${name}-${artifact.id}`} data-kind="playbook" className={LINE}>
      <span className="font-mono">/{entry?.command ?? artifact.id}</span>
      {fallback}
    </li>
  );
}

/** A provided spec's line where the state reads its placement under
 * `specs/` (playbook-library-92, environments-41): the copy's path, an
 * edited copy left standing with the newer release that waits for a
 * merge, a file of its name holding the place, or a root to scaffold. */
function placementPhrase(placement: SpecPlacement): string {
  switch (placement.state) {
    case "placed":
      return i18n._({
        id: "spec · in {path}",
        comment: "a package's spec line on the Packages tab: an install placed its spec in the project's specs/ at {path}, such as specs/packages/glossary.md; keep the path as it is",
        values: { path: placement.path },
      });
    case "edited":
      return placement.waitingVersion
        ? i18n._({
            id: "spec · edited in specs/ — left as yours · {version} waiting",
            comment: "a package's spec line on the Packages tab: its placed copy in specs/ was edited, so installs leave it as the project's own; {version} is the package's newer release, waiting for someone to merge it into that file; keep specs/ as it is",
            values: { version: placement.waitingVersion },
          })
        : i18n._({
            id: "spec · edited in specs/ — left as yours",
            comment: "a package's spec line on the Packages tab: its placed copy in specs/ was edited, so installs leave it as the project's own; keep specs/ as it is",
          });
    case "blocked":
      // The blocking file bears the spec's basename, <pkg>.md.
      return i18n._({
        id: "spec · not placed — specs/ holds {file} already",
        comment: "a package's spec line on the Packages tab: its spec is not placed because a file of the same name, {file} such as glossary.md, already stands in the project's specs/; keep specs/ and the file name as they are",
        values: { file: placement.path.slice(placement.path.lastIndexOf("/") + 1) },
      });
    case "no-specs":
      return i18n._({
        id: "spec · needs specs/ — scaffold first",
        comment: "a package's spec line on the Packages tab: the project has no specs/ folder to place its spec in, and scaffolding the project's specs makes one; keep specs/ as it is",
      });
  }
}

/** A typed `org/name` the registry does not list (playbook-library-92,
 * DR-152): one row "<name> · not listed publicly" with a version taking
 * an exact, caret or tilde requirement, added as typed; the core checks
 * the requirement and the access. Add…'s Registry tab and a waiting
 * link's Add show it alike, `testId` naming its parts. */
export function UnlistedRequest({
  name,
  onAdd,
  testId = "known-package",
  autoFocus = false,
}: {
  name: string;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
  testId?: string;
  /** Focus the version field once shown, where an act brought it up. */
  autoFocus?: boolean;
}) {
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ready = version.trim().length > 0;
  return (
    <form
      data-testid={`${testId}-request`}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !ready) return;
        setBusy(true);
        setError(undefined);
        void onAdd(name, { kind: "registry", version: version.trim() })
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}
      className="flex flex-col gap-1 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-800"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid={`${testId}-name`} className="min-w-0 flex-1 truncate">
          {notListedPhrase(name)}
        </span>
        <input
          data-testid={`${testId}-version`}
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          aria-label={i18n._({ id: "Version of {name}", comment: "the accessible name of a version choice in Add…; {name} is the package", values: { name } })}
          placeholder={i18n._({ id: "1.2.3, ^1.2.3, ~1.2.3", comment: "examples of exact, caret and tilde registry requirements; preserve the syntax" })}
          spellCheck={false}
          autoFocus={autoFocus}
          className={`${INPUT} w-36 font-mono`}
        />
        <button type="submit" data-testid={`${testId}-request-submit`} disabled={busy || !ready} title={addsTitle(name)} className={PRIMARY}>
          {addLabel(busy)}
        </button>
      </div>
      {error ? (
        <p role="alert" data-testid={`${testId}-request-error`} className={ERROR}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** "<n> links wait for <org/pkg> · Add" (playbook-library-92): links the
 * placed spec lost because the package they cite has no spec in this
 * `specs/` (environments-41), and Add requesting that package as Add…'s
 * registry tab does, at the requirement its search result stands at
 * first — so the links appear once its spec is placed. A package the
 * search does not list reads in place as Add… reads a typed name it does
 * not list, a version taking its requirement and Add requesting it. */
function WaitingLine({
  name,
  waited,
  count,
  repository,
  onAdded,
}: {
  name: string;
  /** The package the links wait for, `<org>/<pkg>`. */
  waited: string;
  count: number;
  repository: string;
  onAdded?: (name: string) => void;
}) {
  const store = usePlaceStore();
  const search = store((current) => current.searchRegistry);
  const request = store((current) => current.requestSpecPackage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The search listed no such package: a version is asked in place.
  const [unlisted, setUnlisted] = useState(false);

  async function add(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const found = (await search(repository, waited)).find((result) => result.name === waited);
      const requirement = found ? firstRequirement(found.versions) : undefined;
      if (requirement === undefined) {
        setUnlisted(true);
        return;
      }
      setUnlisted(false);
      await request(repository, waited, { kind: "registry", version: requirement });
      onAdded?.(waited);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addUnlisted(added: string, requested: EnvironmentRequest): Promise<void> {
    await request(repository, added, requested);
    onAdded?.(added);
  }

  return (
    <li data-testid={`env-waiting-${name}-${waited}`} className="flex flex-col gap-1">
      <span className={LINE}>
        <span>
          {i18n._({
            id: "{count, plural, one {# link waits} other {# links wait}} for {name}",
            comment: "beneath a package's spec line on the Packages tab: the placed spec's links to another package's spec, dropped until that package is added; {name} is that package, such as acme/glossary",
            values: { count, name: waited },
          })}
        </span>
        <span aria-hidden className="text-neutral-400">
          ·
        </span>
        <button
          type="button"
          data-testid={`env-waiting-add-${name}-${waited}`}
          disabled={busy}
          title={addsTitle(waited)}
          onClick={() => void add()}
          className={PRIMARY}
        >
          {addLabel(busy)}
        </button>
      </span>
      {unlisted ? <UnlistedRequest name={waited} onAdd={addUnlisted} testId={`env-waiting-${name}-${waited}`} autoFocus /> : null}
      {error ? (
        <p role="alert" data-testid={`env-waiting-error-${name}-${waited}`} className={ERROR}>
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** A package's expanded lines (playbook-library-92), under the row that
 * discloses them. */
export function PackageArtifacts({
  id,
  name,
  pkg,
  state,
  repository,
  projectId,
  playbooks,
  onAdded,
}: {
  /** The list's element id, which the row's disclosure controls. */
  id: string;
  name: string;
  pkg: EnvironmentPackage;
  state: EnvironmentState;
  /** The heading's spex repository, whose spex.yaml a waiting link's
   * Add writes. */
  repository: string;
  /** The project whose Packages tab this is; absent on the Playbooks
   * surface, where no project's tab opens. */
  projectId?: string;
  /** The playbooks the environment places, naming each line's command. */
  playbooks?: readonly PlaybookAvailability[];
  /** A package a waiting link's Add requested, for the heading's receipt. */
  onAdded?: (name: string) => void;
}) {
  const store = usePlaceStore();
  const setWorkspaceTab = store((current) => current.setWorkspaceTab);
  // An applet's page is a tab of this computer's project, standing while
  // its files are here (applets-1).
  const pageHere = projectId !== undefined && isLocalPlace(store.place) && pkg.installed && pkg.missingPath === null;

  const fallbackOf = (artifact: Artifact): ReactNode =>
    artifact.fallback ? <FallbackMark testId={`env-fallback-${name}-${artifact.id}`} shown={artifact.language} wanted={state.language} /> : null;

  // What the release provides has a line; a sibling's support has none
  // (environments-6).
  const provided = pkg.artifacts.filter(isProvided);
  const playbookArtifacts = provided.filter((artifact) => artifact.kind === "playbook");
  const skills = provided.filter((artifact) => artifact.kind === "skill");
  const specs = provided.filter((artifact) => artifact.kind === "spec");
  const applets = provided.filter((artifact) => artifact.kind === "applet");
  // Where the spec stands under `specs/`, in a project's environment read
  // by a core that says so (environments-14).
  const placement = pkg.placement?.spec;
  const placedSkills = skills.filter((artifact) => placed(pkg, artifact, state));
  const unplacedSkills = skills.filter((artifact) => !placed(pkg, artifact, state));

  const skillLine = (group: Artifact[], isPlaced: boolean): ReactNode => {
    if (group.length === 0) return null;
    const ids = listOf(group.map((artifact) => artifact.id), "narrow");
    const fallen = group.find((artifact) => artifact.fallback);
    return (
      <li
        data-testid={`env-skills-${isPlaced ? "placed" : "unplaced"}-${name}`}
        data-kind="skill"
        className={LINE}
      >
        <span>
          {isPlaced
            ? i18n._({
                id: "{count, plural, one {skill: {ids} · placed for your agents} other {skills: {ids} · placed for your agents}}",
                comment: "a package's skills line on the Packages tab: its skills, by id, stand in the agents' folders; {ids} lists them",
                values: { count: group.length, ids },
              })
            : i18n._({
                id: "{count, plural, one {skill: {ids} · not placed} other {skills: {ids} · not placed}}",
                comment: "a package's skills line on the Packages tab: its skills, by id, are not in the agents' folders; {ids} lists them",
                values: { count: group.length, ids },
              })}
        </span>
        {fallen ? (
          <FallbackMark testId={`env-fallback-${name}-${isPlaced ? "placed" : "unplaced"}-skills`} shown={fallen.language} wanted={state.language} />
        ) : null}
      </li>
    );
  };

  return (
    <ul id={id} data-testid={`env-artifacts-${name}`} className="flex flex-col gap-1 pl-6 text-neutral-600 dark:text-neutral-300">
      {playbookArtifacts.map((artifact) => (
        <PlaybookLine
          key={`playbook:${artifact.id}`}
          name={name}
          artifact={artifact}
          entry={playbooks?.find((entry) => entry.package === pkg.name && entry.id === artifact.id)}
          fallback={fallbackOf(artifact)}
        />
      ))}
      {skillLine(placedSkills, true)}
      {skillLine(unplacedSkills, false)}
      {specs.map((artifact) => (
        <Fragment key={`spec:${artifact.id}`}>
          <li data-testid={`env-artifact-${name}-${artifact.id}`} data-kind="spec" className={LINE}>
            <span>
              {placement
                ? placementPhrase(placement)
                : placed(pkg, artifact, state)
                  ? i18n._({ id: "spec · placed as a skill", comment: "a package's spec line on the Packages tab: its spec stands in the agents' folders as a skill" })
                  : i18n._({ id: "spec · not placed", comment: "a package's spec line on the Packages tab: its spec is not in the agents' folders" })}
            </span>
            {fallbackOf(artifact)}
          </li>
          {(placement?.waiting ?? []).map((entry) => (
            <WaitingLine
              key={`waiting:${entry.name}`}
              name={name}
              waited={entry.name}
              count={entry.count}
              repository={repository}
              onAdded={onAdded}
            />
          ))}
        </Fragment>
      ))}
      {applets.map((artifact) => (
        <li key={`applet:${artifact.id}`} data-testid={`env-artifact-${name}-${artifact.id}`} data-kind="applet" className={LINE}>
          <span className="font-mono">{artifact.id}</span>
          {fallbackOf(artifact)}
          {pageHere ? (
            <>
              <span aria-hidden className="text-neutral-400">
                ·
              </span>
              <button
                type="button"
                data-testid={`env-applet-open-${name}-${artifact.id}`}
                aria-label={i18n._({
                  id: "Open {applet}",
                  comment: "accessible name of an applet's line on the Packages tab, its page: opens the applet's tab; {applet} is its id",
                  values: { applet: artifact.id },
                })}
                onClick={() => projectId !== undefined && setWorkspaceTab(projectId, appletTabId(repository, artifact.id))}
                className={LINK}
              >
                {i18n._({ id: "its page", comment: "an applet's line on the Packages tab: opens the applet's page, its tab in the project" })}
              </button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
