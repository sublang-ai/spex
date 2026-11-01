// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A package row's expanded lines (playbook-library-92, DR-172, DR-174):
// one line per artifact its release provides with its one act, a
// sibling's support unlisted, so installing a package is never mistaken
// for enabling it — a playbook "/<command> · Enable", enabled in place in
// the config of the heading's spex repository by the Playbooks tab's own
// write (playbook-library-3) and reading "Enabled in <project>" or
// "Enabled · Personal" after; the skills "skills: <ids> · placed for your
// agents" or "· not placed"; the spec where the state reads it under
// `specs/` (environments-14, environments-41) — "spec · in <path>",
// "spec · edited in specs/ — left as yours" with the version waiting,
// "spec · not placed — specs/ holds <pkg>.md already" or "spec · needs
// specs/ — scaffold first" — followed by "<n> links wait for <org/pkg> ·
// Add" for each package its links wait for, Add requesting it as Add…'s
// registry tab does, a version asked in place for one it does not list;
// else, as your own group's environment and an older
// core read it, "spec · placed as a skill" or "· not placed"; an applet
// "<id> · its page", opening its tab (applets-1). An artifact read in
// another language than the one wanted is marked with the language it is
// shown in.

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  EnvironmentPackage,
  EnvironmentRequest,
  EnvironmentState,
  PlaybookAvailability,
} from "@sublang/spex-core/protocol";

import { isLocalPlace } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { appletTabId } from "../lib/applets.js";
import { enablePlaybook } from "../lib/enable-playbook.js";
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

/** Enable on a package's playbook, wherever it stands — its line on an
 * expanded row, or the receipt after Add… (playbook-library-92): the
 * Playbooks tab's own write in the config of the heading's spex
 * repository (playbook-library-3), the list read again so the playbook
 * reads where it is enabled, and focus moving to that standing. */
export function usePlaybookEnable({
  entry,
  personal,
  repository,
  projectId,
}: {
  /** The playbook as the heading's environment lists it; absent while
   * the list is read or where it lists no such playbook. */
  entry: PlaybookAvailability | undefined;
  personal: boolean;
  repository: string;
  projectId: string;
}) {
  const store = usePlaceStore();
  const configState = store((current) => current.configState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [settled, setSettled] = useState(false);
  const statusRef = useRef<HTMLSpanElement>(null);
  const enabled = entry?.enabled.includes(personal ? "own" : "project") === true;
  // Your own group's roster names every binding; an Enable stands only
  // while the config reads and the playbook's roles are known.
  const roster = configState?.status === "valid" ? (configState.summary.players ?? []) : undefined;

  // The control an Enable leaves gives focus to the standing that
  // replaces it, so the reader stays where they were; a list that read
  // no change leaves Enable, and focus, where they are.
  useEffect(() => {
    if (!settled) return;
    if (enabled) statusRef.current?.focus();
    setSettled(false);
  }, [settled, enabled]);

  async function enable(): Promise<void> {
    if (!entry || !roster) return;
    setBusy(true);
    setError(undefined);
    try {
      await enablePlaybook(store.getClient(), {
        repository,
        playbookId: entry.id,
        roles: entry.roles,
        roster,
      });
      // The list reads again, so the line reads where it is enabled
      // before Enable gives way.
      await store.getState().loadPlaybookLists(projectId).catch(() => {});
      setSettled(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { enabled, ready: entry !== undefined && roster !== undefined, busy, error, statusRef, enable };
}

/** Enable, or the standing that replaces it: "Enabled in <project>", or
 * under "Personal" "Enabled · Personal" (playbook-library-92). */
export function PlaybookEnableAct({
  enabling,
  command,
  personal,
  projectName,
  enableTestId,
  enabledTestId,
  named = false,
}: {
  enabling: ReturnType<typeof usePlaybookEnable>;
  command: string;
  personal: boolean;
  projectName: string;
  enableTestId: string;
  enabledTestId: string;
  /** The visible label names the command, "Enable /triage", where no
   * command stands before it: the receipt after Add… (playbook-library-92). */
  named?: boolean;
}) {
  if (enabling.enabled) {
    return (
      <span
        ref={enabling.statusRef}
        tabIndex={-1}
        data-testid={enabledTestId}
        className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 outline-none dark:bg-emerald-950 dark:text-emerald-300"
      >
        {personal
          ? i18n._({ id: "Enabled · Personal", comment: "a package's playbook line on the Packages tab: enabled in your Personal config, for every project of yours" })
          : i18n._({
              id: "Enabled in {project}",
              comment: "a package's playbook line on the Packages tab: enabled in the project's config, for every member; {project} is the project's name",
              values: { project: projectName },
            })}
      </span>
    );
  }
  if (!enabling.ready) return null;
  const label = i18n._("Enable /{command}", { command });
  return (
    <button
      type="button"
      data-testid={enableTestId}
      disabled={enabling.busy}
      title={
        personal
          ? i18n._({
              id: "For you, in every project of yours",
              comment: "tooltip of Enable on a playbook your Personal packages list: it is written to your Personal config",
            })
          : i18n._({
              id: "For you and every member of {project}",
              comment: "tooltip of Enable on a playbook the project's packages list: it is written to the project's config",
              values: { project: projectName },
            })
      }
      aria-label={label}
      onClick={() => void enabling.enable()}
      className={PRIMARY}
    >
      {enabling.busy
        ? i18n._({ id: "Enabling…", comment: "the enable request is in flight" })
        : named
          ? label
          : i18n._({ id: "Enable", comment: "enable this playbook in this config" })}
    </button>
  );
}

/** One playbook's line: its command, and Enable — or where the heading's
 * config enables it, that standing (playbook-library-92). */
function PlaybookLine({
  name,
  artifact,
  entry,
  personal,
  repository,
  projectId,
  projectName,
  fallback,
}: {
  name: string;
  artifact: Artifact;
  entry: PlaybookAvailability | undefined;
  personal: boolean;
  repository: string;
  projectId: string;
  projectName: string;
  fallback: ReactNode;
}) {
  const enabling = usePlaybookEnable({ entry, personal, repository, projectId });
  const command = entry?.command ?? artifact.id;
  const act = (
    <PlaybookEnableAct
      enabling={enabling}
      command={command}
      personal={personal}
      projectName={projectName}
      enableTestId={`env-enable-${name}-${artifact.id}`}
      enabledTestId={`env-enabled-${name}-${artifact.id}`}
    />
  );
  const shown = enabling.enabled || enabling.ready;

  return (
    <li data-testid={`env-artifact-${name}-${artifact.id}`} data-kind="playbook" className="flex flex-col gap-1">
      <span className={LINE}>
        <span className="font-mono">/{command}</span>
        {fallback}
        {shown ? (
          <>
            <span aria-hidden className="text-neutral-400">
              ·
            </span>
            {act}
          </>
        ) : null}
      </span>
      {enabling.error ? (
        <p role="alert" data-testid={`env-enable-error-${name}-${artifact.id}`} className={ERROR}>
          {enabling.error}
        </p>
      ) : null}
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
  projectName,
  personal,
  onAdded,
}: {
  /** The list's element id, which the row's disclosure controls. */
  id: string;
  name: string;
  pkg: EnvironmentPackage;
  state: EnvironmentState;
  /** The heading's spex repository, whose config an Enable writes and
   * whose spex.yaml a waiting link's Add writes. */
  repository: string;
  projectId: string;
  projectName: string;
  /** The heading is "Personal": your own group's config. */
  personal: boolean;
  /** A package a waiting link's Add requested, for the heading's receipt. */
  onAdded?: (name: string) => void;
}) {
  const store = usePlaceStore();
  const readLists = store((current) => current.playbookLists);
  const setWorkspaceTab = store((current) => current.setWorkspaceTab);
  // What the heading's environment exports, as read for this project.
  const lists = readLists?.projectId === projectId ? readLists : undefined;
  const listed = personal ? lists?.own : (lists?.project ?? undefined);
  // An applet's page is a tab of this computer's project, standing while
  // its files are here (applets-1).
  const pageHere = isLocalPlace(store.place) && pkg.installed && pkg.missingPath === null;

  const fallbackOf = (artifact: Artifact): ReactNode =>
    artifact.fallback ? <FallbackMark testId={`env-fallback-${name}-${artifact.id}`} shown={artifact.language} wanted={state.language} /> : null;

  // What the release provides has a line; a sibling's support has none
  // (environments-6).
  const provided = pkg.artifacts.filter(isProvided);
  const playbooks = provided.filter((artifact) => artifact.kind === "playbook");
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
      {playbooks.map((artifact) => (
        <PlaybookLine
          key={`playbook:${artifact.id}`}
          name={name}
          artifact={artifact}
          entry={listed?.find((entry) => entry.package === pkg.name && entry.id === artifact.id)}
          personal={personal}
          repository={repository}
          projectId={projectId}
          projectName={projectName}
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
                onClick={() => setWorkspaceTab(projectId, appletTabId(repository, artifact.id))}
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
