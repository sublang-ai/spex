// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A package row's expanded lines (playbook-library-92, DR-172): one line
// per selected artifact with its one act, so installing a package is
// never mistaken for enabling it — a playbook "/<command> · Enable",
// enabled in place in the config of the heading's spex repository by the
// Playbooks tab's own write (playbook-library-3) and reading "Enabled in
// <project>" or "Enabled · Personal" after; the skills "skills: <ids> ·
// placed for your agents" or "· not placed"; the spec "spec · placed as
// a skill"; an applet "<id> · its page", opening its tab (applets-1). An
// artifact read in another language than the one wanted wears the
// fallback mark.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  EnvironmentPackage,
  EnvironmentState,
  PlaybookAvailability,
} from "@sublang/spex-core/protocol";

import { isLocalPlace } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { appletTabId } from "../lib/applets.js";
import { enablePlaybook } from "../lib/enable-playbook.js";
import { i18n } from "../i18n.js";

type Artifact = EnvironmentPackage["artifacts"][number];

const PRIMARY =
  "min-h-6 shrink-0 whitespace-nowrap rounded-md border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";
const LINK =
  "min-h-6 shrink-0 whitespace-nowrap rounded px-1 text-xs text-brand-600 hover:underline dark:text-brand-300";
const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const LINE = "flex flex-wrap items-center gap-x-1.5 gap-y-1 [overflow-wrap:anywhere]";

/** The lines an expanded row shows (playbook-library-92): its playbooks,
 * its skills, its spec and its applets; a source has no act of its own
 * and no line. */
export function hasArtifactLines(pkg: EnvironmentPackage | undefined): boolean {
  return pkg !== undefined && pkg.artifacts.some((artifact) => artifact.kind !== "source");
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

/** The mark of an artifact read in its original language where another
 * was wanted (environments-14). */
function FallbackMark({ testId, language }: { testId: string; language: string | null }) {
  return (
    <span
      data-testid={testId}
      title={
        language
          ? i18n._({
              id: "No {language} text; the original stands",
              comment: "the title of an artifact's fallback mark: it has no text in the wanted language; {language} is that language's code",
              values: { language },
            })
          : i18n._({ id: "The original text stands", comment: "the title of an artifact's fallback mark: it has no text in the wanted language" })
      }
      className="shrink-0 rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      {i18n._({ id: "fallback", comment: "mark: this artifact's wanted language was missing, the original stands" })}
    </span>
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
  /** The playbook as the heading's environment lists it; absent while
   * the list is read or where it lists no such playbook. */
  entry: PlaybookAvailability | undefined;
  personal: boolean;
  repository: string;
  projectId: string;
  projectName: string;
  fallback: ReactNode;
}) {
  const store = usePlaceStore();
  const configState = store((current) => current.configState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [settled, setSettled] = useState(false);
  const statusRef = useRef<HTMLSpanElement>(null);
  const command = entry?.command ?? artifact.id;
  const enabled = entry?.enabled.includes(personal ? "own" : "project") === true;
  // Your own group's roster names every binding; an Enable stands only
  // while the config reads and the playbook's roles are known.
  const roster = configState?.status === "valid" ? (configState.summary.players ?? []) : undefined;

  // The control an Enable leaves gives focus to the standing that
  // replaces it, so the reader stays on the line; a list that read no
  // change leaves Enable, and focus, where they are.
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

  let act: ReactNode = null;
  if (enabled) {
    act = (
      <span
        ref={statusRef}
        tabIndex={-1}
        data-testid={`env-enabled-${name}-${artifact.id}`}
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
  } else if (entry && roster) {
    act = (
      <button
        type="button"
        data-testid={`env-enable-${name}-${artifact.id}`}
        disabled={busy}
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
        aria-label={i18n._("Enable /{command}", { command })}
        onClick={() => void enable()}
        className={PRIMARY}
      >
        {busy
          ? i18n._({ id: "Enabling…", comment: "the enable request is in flight" })
          : i18n._({ id: "Enable", comment: "enable this playbook in this config" })}
      </button>
    );
  }

  return (
    <li data-testid={`env-artifact-${name}-${artifact.id}`} data-kind="playbook" className="flex flex-col gap-1">
      <span className={LINE}>
        <span className="font-mono">/{command}</span>
        {fallback}
        {act ? (
          <>
            <span aria-hidden className="text-neutral-400">
              ·
            </span>
            {act}
          </>
        ) : null}
      </span>
      {error ? (
        <p role="alert" data-testid={`env-enable-error-${name}-${artifact.id}`} className={ERROR}>
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
}: {
  /** The list's element id, which the row's disclosure controls. */
  id: string;
  name: string;
  pkg: EnvironmentPackage;
  state: EnvironmentState;
  /** The heading's spex repository, whose config an Enable writes. */
  repository: string;
  projectId: string;
  projectName: string;
  /** The heading is "Personal": your own group's config. */
  personal: boolean;
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
    artifact.fallback ? <FallbackMark testId={`env-fallback-${name}-${artifact.id}`} language={state.language} /> : null;

  const playbooks = pkg.artifacts.filter((artifact) => artifact.kind === "playbook");
  const skills = pkg.artifacts.filter((artifact) => artifact.kind === "skill");
  const specs = pkg.artifacts.filter((artifact) => artifact.kind === "spec");
  const applets = pkg.artifacts.filter((artifact) => artifact.kind === "applet");
  const placedSkills = skills.filter((artifact) => placed(pkg, artifact, state));
  const unplacedSkills = skills.filter((artifact) => !placed(pkg, artifact, state));

  const skillLine = (group: Artifact[], isPlaced: boolean): ReactNode => {
    if (group.length === 0) return null;
    const ids = group.map((artifact) => artifact.id).join(", ");
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
          <FallbackMark testId={`env-fallback-${name}-${isPlaced ? "placed" : "unplaced"}-skills`} language={state.language} />
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
        <li key={`spec:${artifact.id}`} data-testid={`env-artifact-${name}-${artifact.id}`} data-kind="spec" className={LINE}>
          <span>
            {placed(pkg, artifact, state)
              ? i18n._({ id: "spec · placed as a skill", comment: "a package's spec line on the Packages tab: its spec stands in the agents' folders as a skill" })
              : i18n._({ id: "spec · not placed", comment: "a package's spec line on the Packages tab: its spec is not in the agents' folders" })}
          </span>
          {fallbackOf(artifact)}
        </li>
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
