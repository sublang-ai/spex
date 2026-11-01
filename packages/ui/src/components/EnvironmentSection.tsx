// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One heading of the project's Packages tab (playbook-library-92,
// DR-104, DR-172): "Packages" for the project's spex.yaml, or
// "Personal" for the packages added for yourself, its line carrying the
// registry and the account there (playbook-library-119) and one "Add…";
// beneath it the chips — "spex.yaml, spex.lock not committed", "spex.yaml
// changed" with Update, "Not in the agents' folders" with Place skills
// again — then one row per package spex.yaml names, each package it
// requires under it: its name, its version, a source glyph, what it
// provides and its standing, Remove and Publish in its overflow,
// expanding to one line per artifact its release provides with its one
// act — a playbook's Enable writing this heading's config in place, a
// spec's waiting links' Add requesting the package they wait for, as
// Add… does, with its receipt; the built-in playbooks as one quiet line,
// never a removable row. Neither heading names the spex repository
// behind it (DR-159). A sync, an
// update or an install running beside it refuses nothing (DR-111): its
// progress shows by the heading, and a change the core refuses shows its
// cause in place.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  EnvironmentPackage,
  EnvironmentRequest,
  EnvironmentState,
} from "@sublang/spex-core/protocol";

import { isLocalPlace, type RegistryResult } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import {
  PACKAGES_FOLDER,
  SPEC_PACKAGE_NAME_RULE,
  addLabel,
  addsTitle,
  busyWord,
  firstRequirement,
  isBuiltinPackage,
  isProvided,
  listOf,
  providesPhrase,
  publishTargetOf,
  relativeInside,
  requirementChoices,
  sourceTooltip,
  type PublishTarget,
} from "../lib/environments.js";
import { usePopover } from "../lib/usePopover.js";
import { i18n } from "../i18n.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { RunningMark } from "./RunningMark.js";
import { PublishControl } from "./PublishControl.js";
import { RegistryAccount, registrySignInTitle, useRegistrySignIn } from "./RegistryAccount.js";
import { MoreMenu, type MenuEntry } from "./SpaceMenu.js";
import { signingInLabel } from "./SpaceSignIn.js";
import { PackageArtifacts, PlaybookEnableAct, UnlistedRequest, hasArtifactLines, usePlaybookEnable } from "./PackageArtifacts.js";

const BUTTON =
  "min-h-6 shrink-0 whitespace-nowrap rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";
const PRIMARY =
  "min-h-6 shrink-0 whitespace-nowrap rounded-md border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";
const INPUT =
  "min-w-0 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950";
const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const CHIP =
  "flex max-w-full flex-col gap-1 self-start rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 [overflow-wrap:anywhere] dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";

/** "Install": the versions spex.lock names put on this computer
 * (playbook-library-92). */
const installTitle = (): string =>
  i18n._({
    id: "Installs the versions in spex.lock",
    comment: "the title of a package's Install: it puts the versions spex.lock names on this computer; keep the file name as it is",
  });

/** "Place skills again": the skills put in the agents' folders again,
 * by the same install (playbook-library-92). */
const placeTitle = (): string =>
  i18n._({
    id: "Puts the skills in the agents' folders again",
    comment: "the title of Place skills again: it places the packages' skills in the agents' folders once more",
  });

/** "Update": the newest versions spex.yaml allows, installed. */
const updateTitle = (): string =>
  i18n._({
    id: "Installs the newest versions spex.yaml allows",
    comment: "the title of Update: it picks the newest versions spex.yaml allows for every package and installs them",
  });

/** The packages in the order the heading draws them: each one spex.yaml
 * names with what it requires beneath it, then any the lock holds that
 * no listed package names as its requirer; the built-in playbooks stand
 * on their own line instead. */
function packageTree(state: EnvironmentState): { pkg: EnvironmentPackage | undefined; name: string; depth: number }[] {
  const byName = new Map(state.packages.map((pkg) => [pkg.name, pkg]));
  const rows: { pkg: EnvironmentPackage | undefined; name: string; depth: number }[] = [];
  const placed = new Set<string>();
  const place = (name: string, depth: number): void => {
    // A cycle is allowed and adds nothing (DR-104).
    if (placed.has(name)) return;
    placed.add(name);
    if (isBuiltinPackage(name, byName.get(name))) return;
    rows.push({ pkg: byName.get(name), name, depth });
    for (const child of state.packages) {
      if (!child.direct && child.requiredBy.includes(name)) place(child.name, depth + 1);
    }
  };
  const direct = new Set([
    ...Object.keys(state.requests),
    ...state.packages.filter((pkg) => pkg.direct).map((pkg) => pkg.name),
  ]);
  for (const name of [...direct].sort()) place(name, 0);
  for (const pkg of state.packages) place(pkg.name, 0);
  return rows;
}

/** A source's glyph (playbook-library-92): a box for the registry, a
 * folder, a branch for Git; what it is reads as its tooltip. */
function SourceGlyph({ name, kind, tooltip }: { name: string; kind: EnvironmentPackage["source"]["kind"]; tooltip: string }) {
  return (
    <span
      role="img"
      aria-label={tooltip}
      title={tooltip}
      data-testid={`env-source-${name}`}
      data-kind={kind}
      className="inline-flex shrink-0 text-neutral-500"
    >
      {kind === "path" ? (
        <Icon name="folder" className="h-3.5 w-3.5" />
      ) : (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          {kind === "git" ? (
            <>
              <circle cx="5" cy="3.5" r="1.5" />
              <circle cx="5" cy="12.5" r="1.5" />
              <circle cx="11" cy="6" r="1.5" />
              <path d="M5 5v6M11 7.5c0 2.5-6 1.5-6 3.5" />
            </>
          ) : (
            <path d="M8 1.8 13.5 4.8v6.4L8 14.2 2.5 11.2V4.8ZM2.5 4.8 8 7.8l5.5-3M8 7.8v6.4" />
          )}
        </svg>
      )}
    </span>
  );
}

/** Whether a package stands refused for want of a grant
 * (playbook-library-92): the state lists it among the packages the
 * standing failure's registry refused (environments-14), its files are
 * not installed, and the person is not signed in at the registry. */
function refusedAsPrivate(pkg: EnvironmentPackage | undefined, name: string, state: EnvironmentState, signedIn: boolean): boolean {
  return state.refused?.includes(name) === true && pkg?.installed !== true && !signedIn;
}

function PackageRow({
  name,
  pkg,
  depth,
  state,
  repository,
  projectId,
  projectName,
  personal,
  target,
  reveal = 0,
  onAdded,
  onNavigate,
}: {
  name: string;
  pkg: EnvironmentPackage | undefined;
  depth: number;
  state: EnvironmentState;
  repository: string;
  /** The project whose tab this is, and its name as the lines say it. */
  projectId: string;
  projectName: string;
  /** The heading is "Personal": its playbooks enable in your own config. */
  personal: boolean;
  target: PublishTarget | undefined;
  /** Each new count asks the row to open its lines, the receipt's Enable
   * for a package of several playbooks. */
  reveal?: number;
  /** A package its lines' Add requested, for the heading's receipt. */
  onAdded?: (name: string) => void;
  onNavigate?: (surface: "Settings" | "Space") => void;
}) {
  const store = usePlaceStore();
  const linesId = useId();
  // A row expands to its artifacts, one line each with its one act
  // (playbook-library-92); it stands folded until the reader opens it.
  const [expanded, setExpanded] = useState(false);
  const expandable = hasArtifactLines(pkg);
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (reveal === 0 || !expandable) return;
    setExpanded(true);
    expandRef.current?.focus();
  }, [reveal, expandable]);
  const install = store((current) => current.installEnvironment);
  const removePackage = store((current) => current.removeSpecPackage);
  const account = useRegistrySignIn(state.registry?.origin);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string>();
  // Each Publish chosen from the overflow is its own attempt, asking for
  // its preview once (playbook-library-113).
  const [publishing, setPublishing] = useState(0);
  const [autoAsk, setAutoAsk] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const request = state.requests[name];
  const direct = request !== undefined || pkg?.direct === true;
  const publishable = request?.kind === "path" && state.pathRoot !== null;
  const requirers = pkg?.requiredBy ?? [];
  const privately = refusedAsPrivate(pkg, name, state, account.login !== undefined);

  async function remove(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    setError(undefined);
    try {
      await removePackage(repository, name);
    } catch (cause) {
      setError((cause as Error).message);
      moreRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function installAgain(): void {
    setInstalling(true);
    setError(undefined);
    void install(repository)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setInstalling(false));
  }

  const entries: MenuEntry[] = [];
  if (direct && publishable) {
    // Signed out at the registry, the entry reads "Sign in to publish" in
    // Publish's place and starts that sign-in (playbook-library-93); until
    // the account there is read it reads Publish (playbook-library-113).
    entries.push({
      label:
        target?.signedIn === false
          ? i18n._({ id: "Sign in to publish", comment: "in place of Publish while the person is not signed in to the registry: starts the registry sign-in" })
          : i18n._({ id: "Publish", comment: "upload the spec package to the registry" }),
      testId: `env-publish-${name}`,
      onSelect: () => {
        setAutoAsk(true);
        setPublishing((attempt) => attempt + 1);
      },
    });
  }
  if (direct) {
    entries.push({
      label: busy
        ? i18n._({ id: "Removing…", comment: "the removal is in flight" })
        : i18n._({ id: "Remove", comment: "a package's act: take it out of spex.yaml and uninstall it" }),
      title: i18n._({
        id: "Removes {name} from spex.yaml and uninstalls it",
        comment: "the title of a package row's Remove: its consequence; {name} is the package",
        values: { name },
      }),
      testId: `env-remove-${name}`,
      disabled: busy,
      // A package another one requires asks first (playbook-library-92).
      onSelect: () => (requirers.length > 0 ? setConfirming(true) : void remove()),
    });
  }

  let standing: ReactNode;
  if (pkg?.installed) {
    standing = (
      <span data-testid={`env-installed-${name}`} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        {i18n._({ id: "Installed", comment: "a package's standing: its files are installed on this computer" })}
      </span>
    );
  } else if (privately) {
    standing = (
      <>
        <span data-testid={`env-installed-${name}`} className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {i18n._({
            id: "Not installed · private",
            comment: "a package's standing: the registry refused it for want of a sign-in, so it is not installed",
          })}
        </span>
        <button
          type="button"
          data-testid={`env-signin-${name}`}
          disabled={account.busy || account.running !== undefined}
          title={registrySignInTitle()}
          onClick={() => void account.start()}
          className={PRIMARY}
        >
          {account.busy || account.running
            ? signingInLabel()
            : i18n._({ id: "Sign in", comment: "sign in to a Space or a registry" })}
        </button>
      </>
    );
  } else if (pkg) {
    standing = (
      <>
        <span
          data-testid={`env-installed-${name}`}
          title={
            pkg.missingPath !== null
              ? i18n._({
                  id: "Not on this computer: {path}",
                  comment: "the title of a package's standing Files missing, for a folder package whose folder is not here; {path} is that folder",
                  values: { path: pkg.missingPath },
                })
              : undefined
          }
          className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {i18n._({ id: "Files missing", comment: "a package's standing: spex.lock records it but its files are not all on this computer" })}
        </span>
        <button
          type="button"
          data-testid={`env-install-${name}`}
          disabled={installing}
          title={installTitle()}
          onClick={installAgain}
          className={PRIMARY}
        >
          {installing
            ? i18n._({ id: "Installing…", comment: "the files spex.lock records are being installed on this computer" })
            : i18n._({ id: "Install", comment: "a package's act: put the files spex.lock records on this computer" })}
        </button>
      </>
    );
  } else {
    standing = (
      <span data-testid={`env-installed-${name}`} className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {i18n._({ id: "Not installed", comment: "a package's standing: spex.yaml names it but no version of it is installed yet" })}
      </span>
    );
  }

  const provides = pkg ? providesPhrase(pkg.artifacts) : "";
  const kind = pkg?.source.kind ?? request?.kind ?? "registry";
  return (
    <li
      data-testid={`env-package-${name}`}
      style={depth > 0 ? { marginInlineStart: `${depth * 1.25}rem` } : undefined}
      className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {expandable ? (
          <button
            ref={expandRef}
            type="button"
            data-testid={`env-expand-${name}`}
            aria-expanded={expanded}
            aria-controls={expanded ? linesId : undefined}
            aria-label={i18n._({
              id: "What {name} provides",
              comment: "accessible name of a package row's disclosure on the Packages tab: it shows the package's playbooks, skills, spec and applets, each with its act; {name} is the package",
              values: { name },
            })}
            onClick={() => setExpanded((current) => !current)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Icon name={expanded ? "caretDown" : "caretRight"} className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span aria-hidden className="h-6 w-6 shrink-0" />
        )}
        <span className="min-w-0 truncate font-mono text-sm font-semibold" title={name}>
          {name}
        </span>
        <span
          data-testid={`env-version-${name}`}
          title={
            pkg?.version
              ? undefined
              : i18n._({ id: "no version yet", comment: "the title of a package's version shown as a dash: spex.lock holds no version of it yet" })
          }
          className="font-mono text-neutral-600 dark:text-neutral-300"
        >
          {pkg?.version ?? "—"}
        </span>
        <SourceGlyph name={name} kind={kind} tooltip={sourceTooltip(pkg, request)} />
        {provides ? (
          <span data-testid={`env-provides-${name}`} className="min-w-0 truncate text-neutral-500" title={provides}>
            {provides}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {standing}
          <MoreMenu of={name} testId={`env-more-${name}`} entries={entries} buttonRef={moreRef} />
        </span>
      </div>
      {confirming ? (
        <InlineConfirm
          question={i18n._({
            id: "Required by {packages}",
            comment: "Remove's confirm on a package other packages require; {packages} names them",
            values: { packages: listOf(requirers) },
          })}
          confirmLabel={i18n._({ id: "Remove", comment: "a package's act: take it out of spex.yaml and uninstall it" })}
          cancelLabel={i18n._({ id: "Keep", comment: "cancel a removal: leave it as it is" })}
          onConfirm={() => void remove()}
          onCancel={() => {
            setConfirming(false);
            moreRef.current?.focus();
          }}
        />
      ) : null}
      {expanded && pkg && expandable ? (
        <PackageArtifacts
          id={linesId}
          name={name}
          pkg={pkg}
          state={state}
          repository={repository}
          projectId={projectId}
          projectName={projectName}
          personal={personal}
          onAdded={onAdded}
        />
      ) : null}
      {publishing > 0 && direct && publishable && request?.kind === "path" ? (
        <PublishControl
          key={publishing}
          repository={repository}
          name={name}
          path={request.path}
          target={target}
          opened
          autoAsk={autoAsk}
          onAutoAsked={() => setAutoAsk(false)}
          onClose={() => {
            setPublishing(0);
            moreRef.current?.focus();
          }}
          onNavigate={onNavigate}
        />
      ) : null}
      {error || (privately && account.error) ? (
        <p role="alert" data-testid={`env-package-error-${name}`} className={ERROR}>
          {error ?? account.error}
        </p>
      ) : null}
    </li>
  );
}

/** The built-in playbooks (playbook-library-92, environments-11): one
 * quiet line with the version spex.lock records, and where the app
 * ships a newer release the requirement admits, that release with
 * "Update to <shipped>". */
function BuiltinLine({
  locked,
  update,
  pending,
  onUpdate,
}: {
  locked: string | undefined;
  update: EnvironmentState["builtinUpdate"];
  pending: boolean;
  onUpdate: () => void;
}) {
  const text = locked
    ? update
      ? i18n._({
          id: "Built-in playbooks {locked} · {shipped} shipped with this app",
          comment: "the built-in playbooks' line while the app ships a newer release: {locked} is the version spex.lock records, {shipped} the one this app ships",
          values: { locked, shipped: update.shipped },
        })
      : i18n._({
          id: "Built-in playbooks {locked}",
          comment: "the built-in playbooks' line on the Packages tab: {locked} is the version spex.lock records",
          values: { locked },
        })
    : i18n._({ id: "Built-in playbooks", comment: "the built-in playbooks' line on the Packages tab, while spex.lock records no version of them" });
  return (
    <div data-testid="environment-builtin" className="flex flex-wrap items-center gap-2 px-1 text-xs text-neutral-500">
      <span data-testid="environment-builtin-line" className="min-w-0">
        {text}
      </span>
      {update ? (
        <button
          type="button"
          data-testid="environment-builtin-update"
          disabled={pending}
          title={updateTitle()}
          onClick={onUpdate}
          className={PRIMARY}
        >
          {pending
            ? i18n._({ id: "Updating…", comment: "the packages spex.yaml names are being updated to the newest versions it allows and installed" })
            : i18n._({
                id: "Update to {version}",
                comment: "the built-in playbooks' line: update to the release this app ships; {version} is that release",
                values: { version: update.shipped },
              })}
        </button>
      ) : null}
    </div>
  );
}

/** What an Add brought, once (playbook-library-92): "Added <name>
 * <version> · <what it provides>", with Enable where it provides a
 * playbook — enabling its one playbook in place in the heading's config,
 * as its row's line does, and reading where it is enabled after; for a
 * package of several playbooks, opening its row's lines, each with its
 * own Enable. */
function Receipt({
  name,
  state,
  repository,
  projectId,
  projectName,
  personal,
  onShowPlaybooks,
}: {
  name: string;
  state: EnvironmentState | undefined;
  repository: string;
  projectId: string;
  projectName: string;
  personal: boolean;
  onShowPlaybooks: () => void;
}) {
  const store = usePlaceStore();
  const readLists = store((current) => current.playbookLists);
  const pkg = state?.packages.find((entry) => entry.name === name);
  const provides = pkg ? providesPhrase(pkg.artifacts) : "";
  const text = pkg?.version
    ? provides
      ? i18n._({
          id: "Added {name} {version} · {provides}",
          comment: "the receipt after Add…: the package, the version installed and what it provides, such as Added acme/triage 0.1.0 · 1 playbook",
          values: { name, version: pkg.version, provides },
        })
      : i18n._({
          id: "Added {name} {version}",
          comment: "the receipt after Add…, for a package that provides nothing: the package and the version installed",
          values: { name, version: pkg.version },
        })
    : i18n._({
        id: "Added {name}",
        comment: "the receipt after Add…, while the package's version is still being picked",
        values: { name },
      });
  const playbooks = pkg?.artifacts.filter((artifact) => artifact.kind === "playbook" && isProvided(artifact)) ?? [];
  // The one playbook as the heading's environment lists it, read for
  // this project: what its Enable writes.
  const lists = readLists?.projectId === projectId ? readLists : undefined;
  const listed = personal ? lists?.own : (lists?.project ?? undefined);
  const only = playbooks.length === 1 ? playbooks[0] : undefined;
  const entry = only ? listed?.find((candidate) => candidate.package === name && candidate.id === only.id) : undefined;
  const enabling = usePlaybookEnable({ entry, personal, repository, projectId });
  return (
    <div data-testid="add-receipt" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
        <span data-testid="add-note" role="status" className="[overflow-wrap:anywhere]">
          {text}
        </span>
        {only ? (
          <PlaybookEnableAct
            enabling={enabling}
            command={entry?.command ?? only.id}
            personal={personal}
            projectName={projectName}
            enableTestId="add-note-enable"
            enabledTestId="add-note-enabled"
            named
          />
        ) : playbooks.length > 1 ? (
          <button
            type="button"
            data-testid="add-note-enable"
            title={i18n._({
              id: "Shows its playbooks, each with Enable",
              comment: "the title of Enable in the receipt after Add…, for a package of several playbooks: it opens the package's row to its playbooks, each enabled on its own line",
            })}
            onClick={onShowPlaybooks}
            className={PRIMARY}
          >
            {i18n._({ id: "Enable", comment: "enable a playbook: name a player for each of its roles" })}
          </button>
        ) : null}
      </div>
      {enabling.error ? (
        <p role="alert" data-testid="add-note-enable-error" className={ERROR}>
          {enabling.error}
        </p>
      ) : null}
    </div>
  );
}

/** One heading of the Packages tab (playbook-library-92): the project's
 * spex.yaml under "Packages", or yours under "Personal". */
export function EnvironmentSection({
  repository,
  projectId,
  projectName,
  personal = false,
  onNavigate,
}: {
  repository: string;
  /** The project whose tab this is: the playbook lists read for it
   * name each row's playbooks, which its lines and the receipt enable
   * in place. */
  projectId: string;
  /** The project's name, as an enabled playbook's line says it
   * (playbook-library-92). */
  projectName: string;
  /** The packages added for yourself, available in every project. */
  personal?: boolean;
  onNavigate?: (surface: "Settings" | "Space") => void;
}) {
  const store = usePlaceStore();
  const state = store((current) => current.environments[repository]);
  const registryAccounts = store((current) => current.registryAccounts);
  const target = publishTargetOf(state, registryAccounts);
  const loadError = store((current) => current.environmentErrors[repository]);
  const resolve = store((current) => current.resolveEnvironment);
  const install = store((current) => current.installEnvironment);
  const [error, setError] = useState<string>();
  // The receipt's Enable on a package of several playbooks opens its
  // row's lines: each ask a new count, so asking again opens it again.
  const [revealed, setRevealed] = useState<{ name: string; times: number }>();
  const [pending, setPending] = useState<"update" | "builtin" | "place">();
  const [added, setAdded] = useState<string>();
  const progress = busyWord(state?.busy ?? null);
  const heading = personal
    ? i18n._({ id: "Personal", comment: "a Packages tab heading: the packages added for yourself, available in every project" })
    : i18n._({ id: "Packages", comment: "a Packages tab heading: the packages the project's spex.yaml names" });

  function act(kind: "update" | "builtin" | "place"): void {
    setPending(kind);
    setError(undefined);
    // Update, and the built-in line's Update to, pick the newest
    // versions spex.yaml allows (environments-11); Place skills again
    // installs, which places the skills again.
    void (kind === "place" ? install(repository) : resolve(repository))
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setPending(undefined));
  }

  let body: ReactNode;
  if (!state) {
    body = loadError ? (
      <p role="alert" data-testid="environment-load-error" className={ERROR}>
        {loadError}
      </p>
    ) : (
      <p className="text-xs text-neutral-500">{i18n._({ id: "loading…", comment: "a request for this pane's content is in flight" })}</p>
    );
  } else {
    const tree = packageTree(state);
    const builtinNames = [...new Set([...Object.keys(state.requests), ...state.packages.map((pkg) => pkg.name)])].filter((name) =>
      isBuiltinPackage(name, state.packages.find((pkg) => pkg.name === name)),
    );
    const builtin = builtinNames
      .map((name) => state.packages.find((pkg) => pkg.name === name))
      .find((pkg) => pkg?.version);
    const showBuiltin = builtinNames.length > 0 || state.builtinUpdate !== undefined;
    const conflicts = state.conflicts ?? [];
    const changed = state.stale !== null || conflicts.length > 0;
    body = (
      <>
        {state.committed === false || changed || state.unexported ? (
          <div className="flex flex-col gap-1.5">
            {state.committed === false ? (
              <p
                data-testid="environment-uncommitted"
                title={i18n._({
                  id: "Commit them with the code so every member installs the same packages",
                  comment: "the title of the chip spex.yaml, spex.lock not committed: what to do about it and why",
                })}
                className={CHIP}
              >
                {i18n._({
                  id: "spex.yaml, spex.lock not committed",
                  comment: "a chip on the project's packages: its two files are not both in the code's last commit; keep the file names as they are",
                })}
              </p>
            ) : null}
            {changed ? (
              <div className={CHIP}>
                <span className="flex flex-wrap items-center gap-2">
                  <span data-testid="environment-stale" title={state.stale?.join("\n") || undefined}>
                    {i18n._({ id: "spex.yaml changed", comment: "a chip: spex.yaml names packages spex.lock does not record yet; keep the file name as it is" })}
                  </span>
                  <button
                    type="button"
                    data-testid="environment-update"
                    disabled={pending === "update"}
                    title={updateTitle()}
                    onClick={() => act("update")}
                    className={PRIMARY}
                  >
                    {pending === "update"
                      ? i18n._({ id: "Updating…", comment: "the packages spex.yaml names are being updated to the newest versions it allows and installed" })
                      : i18n._({ id: "Update", comment: "a package's act: install the newest versions spex.yaml allows" })}
                  </button>
                </span>
                {conflicts.length > 0 ? (
                  <span data-testid="environment-conflicts">
                    {i18n._({
                      id: "No version fits every package: {conflicts}",
                      comment: "beneath the chip spex.yaml changed: the packages no version satisfies; {conflicts} lists each with what asks for it",
                      values: {
                        conflicts: listOf(
                          conflicts.map((conflict) =>
                            i18n._({
                              id: "{name} ({requirements})",
                              comment: "one package in the list beneath spex.yaml changed: the package and what asks for which versions of it, such as acme/lint (^1.0.0 by spex.yaml and ^2.0.0 by acme/triage)",
                              values: {
                                name: conflict.name,
                                requirements: listOf(
                                  conflict.requirements.map((entry) =>
                                    i18n._({
                                      id: "{requirement} by {requirer}",
                                      comment: "one requirement in the list beneath spex.yaml changed: a version requirement and the package or file asking for it, such as ^0.4.0 by acme/triage",
                                      values: { requirement: entry.requirement, requirer: entry.by },
                                    }),
                                  ),
                                ),
                              },
                            }),
                          ),
                        ),
                      },
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
            {state.unexported ? (
              <div data-testid="environment-unexported" className={CHIP}>
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {i18n._({
                      id: "Not in the agents' folders",
                      comment: "a chip: the skills and packages the last placing left out of the agents' folders, listed beneath",
                    })}
                  </span>
                  <button
                    type="button"
                    data-testid="environment-place-skills"
                    disabled={pending === "place"}
                    title={placeTitle()}
                    onClick={() => act("place")}
                    className={PRIMARY}
                  >
                    {pending === "place"
                      ? i18n._({ id: "Placing…", comment: "the skills are being placed in the agents' folders again" })
                      : i18n._({ id: "Place skills again", comment: "place the packages' skills in the agents' folders again" })}
                  </button>
                </span>
                <ul className="flex flex-col gap-0.5">
                  {state.unexported.skipped.map((entry) => (
                    <li key={`${entry.folder}:${entry.name}`} data-testid={`environment-unexported-${entry.folder}-${entry.name}`}>
                      <span className="font-mono">{entry.name}</span>
                      {" — "}
                      {i18n._({
                        id: "{folder} holds a folder of yours by that name",
                        comment: "a skill left out of an agent folder because the reader placed a folder of that name there; {folder} is the agent folder, such as .agents/skills",
                        values: { folder: entry.folder },
                      })}
                    </li>
                  ))}
                  {state.unexported.missing.map((name) => (
                    <li key={name} data-testid={`environment-unexported-package-${name}`}>
                      <span className="font-mono">{name}</span>
                      {" — "}
                      {i18n._({
                        id: "Its files are not on this computer",
                        comment: "a package left out of the agents' folders because its files are not on this computer",
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {state.error ? (
          <p role="alert" data-testid="environment-error" className={ERROR}>
            {state.error}
          </p>
        ) : null}
        {error ? (
          <p role="alert" data-testid="environment-refusal" className={ERROR}>
            {error}
          </p>
        ) : null}
        {tree.length > 0 ? (
          <ul data-testid="environment-packages" className="flex flex-col gap-1.5">
            {tree.map((row) => (
              <PackageRow
                key={row.name}
                name={row.name}
                pkg={row.pkg}
                depth={row.depth}
                state={state}
                repository={repository}
                projectId={projectId}
                projectName={projectName}
                personal={personal}
                target={target}
                reveal={revealed?.name === row.name ? revealed.times : 0}
                onAdded={setAdded}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : null}
        {showBuiltin ? (
          <BuiltinLine
            locked={builtin?.version ?? state.builtinUpdate?.locked}
            update={state.builtinUpdate}
            pending={pending === "builtin"}
            onUpdate={() => act("builtin")}
          />
        ) : null}
        {tree.length === 0 && !showBuiltin ? (
          <p data-testid="environment-empty" className="text-xs text-neutral-500">
            {i18n._({ id: "No packages yet", comment: "a Packages tab heading with no package in its spex.yaml" })}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section data-testid="environment-section" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2
          className="shrink-0 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
          title={
            personal
              ? i18n._({
                  id: "Packages added for yourself, available in every project",
                  comment: "the title of the Packages tab's heading Personal",
                })
              : undefined
          }
        >
          {heading}
        </h2>
        <RegistryAccount repository={repository} />
        {progress ? (
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <RunningMark running />
            <span data-testid="environment-progress">{progress}</span>
          </span>
        ) : null}
        <span className="ml-auto">
          <AddPackages
            repository={repository}
            personal={personal}
            onOpen={() => setAdded(undefined)}
            onAdded={setAdded}
            onRefused={setError}
          />
        </span>
      </div>
      {added ? (
        <Receipt
          name={added}
          state={state}
          repository={repository}
          projectId={projectId}
          projectName={projectName}
          personal={personal}
          onShowPlaybooks={() => setRevealed((current) => ({ name: added, times: (current?.times ?? 0) + 1 }))}
        />
      ) : null}
      {body}
    </section>
  );
}

type AddMode = "registry" | "folder" | "git";

/** "Add…" (playbook-library-92): one popover whose three tabs — Registry,
 * Folder and Git — add a package to this heading's spex.yaml. A
 * destination change remounts it; an add finishes only in the heading
 * that sent it. */
function AddPackages(props: {
  repository: string;
  personal: boolean;
  onOpen: () => void;
  onAdded: (name: string) => void;
  onRefused: (message: string) => void;
}) {
  return <AddPopover key={props.repository} {...props} />;
}

function AddPopover({
  repository,
  personal,
  onOpen,
  onAdded,
  onRefused,
}: {
  repository: string;
  personal: boolean;
  onOpen: () => void;
  onAdded: (name: string) => void;
  onRefused: (message: string) => void;
}) {
  const store = usePlaceStore();
  const request = store((current) => current.requestSpecPackage);
  const folder = store((current) => current.environments[repository]?.pathRoot ?? null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AddMode>("registry");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const panelRef = usePopover<HTMLDivElement>(open, { anchorRef, onClose: () => setOpen(false) });
  const baseId = useId();
  const label = i18n._({ id: "Add…", comment: "a Packages tab heading's control: opens the ways to add a package, from the registry, a folder or Git" });

  async function add(name: string, next: EnvironmentRequest): Promise<void> {
    try {
      await request(repository, name, next);
    } catch (cause) {
      // A refusal arriving after the popover closed shows by the heading.
      if (!openRef.current) onRefused((cause as Error).message);
      throw cause;
    }
    onAdded(name);
    setOpen(false);
  }

  const modes: { key: AddMode; label: string; testId: string; disabledWhy?: string }[] = [
    { key: "registry", label: i18n._({ id: "Registry", comment: "a tab of Add…: search the registry" }), testId: "add-from-registry" },
    {
      key: "folder",
      label: i18n._({ id: "Folder", comment: "a tab of Add…: add a package from a folder in the project" }),
      testId: "add-from-folder",
      disabledWhy: folder
        ? undefined
        : personal
          ? i18n._({
              id: "Your Personal records are not on this computer",
              comment: "the title of Add…'s disabled Folder tab under Personal: the folder holding your Personal records, which a folder package lies in, is not on this computer",
            })
          : i18n._({
              id: "The project folder is not on this computer",
              comment: "the title of Add…'s disabled Folder tab under Packages: the project's folder, which a folder package lies in, is not on this computer, as for a project on a server",
            }),
    },
    { key: "git", label: i18n._({ id: "Git", comment: "a tab of Add…: add a package from a Git repository" }), testId: "add-from-git" },
  ];
  const shown: AddMode = mode === "folder" && !folder ? "registry" : mode;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const offered = modes.filter((entry) => entry.disabledWhy === undefined);
    const at = offered.findIndex((entry) => entry.key === shown);
    const next = offered[(at + (event.key === "ArrowRight" ? 1 : -1) + offered.length) % offered.length];
    if (!next) return;
    setMode(next.key);
    document.getElementById(`${baseId}-${next.key}`)?.focus();
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={anchorRef}
        type="button"
        data-testid="add-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen();
          setOpen((was) => !was);
        }}
        className={BUTTON}
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          data-testid="add-packages"
          // As wide as the tab's own box at most, so it stands whole at
          // the narrowest pane (DR-041): its right edge is Add…'s.
          className="absolute right-0 top-full z-20 mt-1 flex w-[min(26rem,100cqw)] flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div role="tablist" aria-label={label} className="flex gap-1 border-b border-neutral-200 pb-1 dark:border-neutral-800">
            {modes.map((entry) => (
              <button
                key={entry.key}
                id={`${baseId}-${entry.key}`}
                type="button"
                role="tab"
                data-testid={entry.testId}
                aria-selected={shown === entry.key}
                aria-controls={`${baseId}-panel`}
                tabIndex={shown === entry.key ? 0 : -1}
                disabled={entry.disabledWhy !== undefined}
                title={entry.disabledWhy}
                onKeyDown={onTabKey}
                onClick={() => setMode(entry.key)}
                className={`min-h-6 rounded px-2 py-0.5 text-xs disabled:opacity-40 ${
                  shown === entry.key
                    ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${shown}`}>
            {shown === "registry" ? <RegistryTab repository={repository} onAdd={add} /> : null}
            {shown === "folder" && folder ? <FolderTab repository={repository} folder={folder} onAdd={add} /> : null}
            {shown === "git" ? <GitTab onAdd={add} /> : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}

/** Add…'s Registry tab (playbook-library-92): a search over the registry
 * of the heading's spex.yaml, each result with its versions, and a typed
 * `org/name` the registry does not list as one row of its own. */
function RegistryTab({
  repository,
  onAdd,
}: {
  repository: string;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const store = usePlaceStore();
  const search = store((current) => current.searchRegistry);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistryResult[]>();
  const [settledFor, setSettledFor] = useState<string>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const reads = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // After the popover's own focus move, the search field takes focus.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const text = query.trim();
    // The newest query wins: a reply an edit overtook applies nothing.
    const read = (reads.current += 1);
    if (!text) {
      setResults(undefined);
      setError(undefined);
      setSettledFor(undefined);
      setSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      setError(undefined);
      search(repository, text)
        .then((found) => {
          if (read !== reads.current) return;
          setResults(found);
          setSettledFor(text);
        })
        .catch((cause: Error) => {
          if (read !== reads.current) return;
          setResults(undefined);
          setError(cause.message);
          setSettledFor(text);
        })
        .finally(() => {
          if (read === reads.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, repository, search]);

  const typed = query.trim();
  const settled = settledFor === typed && !searching;
  const listed = results?.some((result) => result.name === typed) === true;
  const unlisted = settled && SPEC_PACKAGE_NAME_RULE.test(typed) && !listed;
  const searchLabel = i18n._({
    id: "Search, or type org/name",
    comment: "the hint inside Add…'s registry search field: search the registry, or type a package's full name",
  });

  return (
    <div data-testid="registry-search" className="flex flex-col gap-2">
      <input
        ref={inputRef}
        data-testid="registry-query"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchLabel}
        aria-label={searchLabel}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        className={INPUT}
      />
      {searching ? (
        <p className="text-xs text-neutral-500">{i18n._({ id: "Searching…", comment: "the registry search is in flight" })}</p>
      ) : null}
      {error && settled ? (
        <p role="alert" data-testid="registry-error" className={ERROR}>
          {error}
        </p>
      ) : null}
      {settled && results && results.length === 0 && !unlisted ? (
        <p data-testid="registry-none" className="text-xs text-neutral-500">
          {i18n._({ id: "No package matches", comment: "Add…'s registry search found nothing" })}
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {results.map((result) => (
            <RegistryResultRow key={result.name} result={result} onAdd={onAdd} />
          ))}
        </ul>
      ) : null}
      {unlisted ? <UnlistedRequest key={typed} name={typed} onAdd={onAdd} /> : null}
    </div>
  );
}

function RegistryResultRow({
  result,
  onAdd,
}: {
  result: RegistryResult;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const choices = result.versions.flatMap((version) => requirementChoices(version));
  const [requirement, setRequirement] = useState(firstRequirement(result.versions) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <li data-testid={`registry-result-${result.name}`} className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 grow truncate font-mono text-sm font-semibold" title={result.name}>
          {result.name}
        </span>
        <select
          data-testid={`registry-version-${result.name}`}
          aria-label={i18n._({ id: "Version of {name}", comment: "the accessible name of a version choice in Add…; {name} is the package", values: { name: result.name } })}
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          className="min-w-0 max-w-full rounded border border-neutral-300 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
        >
          {choices.map((choice) => (
            <option key={choice.requirement} value={choice.requirement}>
              {choice.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid={`registry-add-${result.name}`}
          disabled={busy || !requirement}
          title={addsTitle(result.name)}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void onAdd(result.name, { kind: "registry", version: requirement })
              .catch((cause: Error) => setError(cause.message))
              .finally(() => setBusy(false));
          }}
          className={PRIMARY}
        >
          {addLabel(busy)}
        </button>
      </div>
      {/* The description on its own line, the row's full width, so the
          popover's narrow width never cuts it to a few letters. */}
      {result.description ? (
        <p className="line-clamp-2 text-neutral-500 [overflow-wrap:anywhere]" title={result.description}>
          {result.description}
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid={`registry-add-error-${result.name}`} className={ERROR}>
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** A name typed for a folder or Git package, checked in place against
 * the package name rule before anything is sent. */
function nameRefusal(name: string): string | undefined {
  return SPEC_PACKAGE_NAME_RULE.test(name)
    ? undefined
    : i18n._({
        id: "Use org/name: lowercase words joined by hyphens",
        comment: "a package name typed in Add… breaks the rule; keep org/name as it is",
      });
}

function RequestForm({
  testId,
  fields,
  ready,
  onSubmit,
}: {
  testId: string;
  fields: ReactNode;
  ready: boolean;
  onSubmit: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !ready) return;
        setBusy(true);
        setError(undefined);
        void onSubmit()
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}
      className="flex flex-col gap-2 text-xs"
    >
      <div className="flex flex-col gap-2">{fields}</div>
      {error ? (
        <p role="alert" data-testid={`${testId}-error`} className={ERROR}>
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" data-testid={`${testId}-submit`} disabled={busy || !ready} className={PRIMARY}>
          {addLabel(busy)}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-neutral-500 [overflow-wrap:anywhere]">{label}</span>
      {children}
    </label>
  );
}

const packageNameLabel = (): string =>
  i18n._({ id: "Package name", comment: "a field of Add…'s Folder and Git tabs: the package's org/name" });

/** What Add…'s Folder tab read of a folder: nothing yet, the read in
 * flight, its `meta.yaml`'s name and version (environments-15), or the
 * core's refusal of the folder. */
type FolderRead =
  | { phase: "idle" }
  | { phase: "reading"; path: string }
  | { phase: "read"; path: string; name: string | null; version: string | null }
  | { phase: "refused"; path: string; message: string };

/** Add…'s Folder tab (playbook-library-92): a folder inside the heading's
 * folder, from `spex-packages/`, where a package under development lies
 * (environments-10); the core reads its name and version from its
 * `meta.yaml` by a dry run of the request, nothing written
 * (environments-15), and a name field shows only where that names none. */
function FolderTab({
  repository,
  folder,
  onAdd,
}: {
  repository: string;
  folder: string;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const store = usePlaceStore();
  const preview = store((current) => current.previewFolderPackage);
  const [path, setPath] = useState(PACKAGES_FOLDER);
  const [name, setName] = useState("");
  const [refusal, setRefusal] = useState<string>();
  const [read, setRead] = useState<FolderRead>({ phase: "idle" });
  const reads = useRef(0);
  const pathRef = useRef<HTMLInputElement>(null);
  const typed = path.trim().replace(/\/+$/u, "");
  const chosen = typed.length > 0 && `${typed}/` !== PACKAGES_FOLDER ? typed : "";
  // The shell's picker reads this computer's folders: a remote place's
  // project is on its server, so none is offered there (run-view-169).
  const local = isLocalPlace(store.place);
  const pickDirectory = local ? window.spexNative?.pickDirectory : undefined;

  useEffect(() => {
    const timer = setTimeout(() => pathRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  // The folder typed or picked is read once it rests; the newest read
  // wins, a reply an edit overtook applying nothing.
  useEffect(() => {
    const at = (reads.current += 1);
    if (!chosen) {
      setRead({ phase: "idle" });
      return;
    }
    setRead({ phase: "reading", path: chosen });
    const timer = setTimeout(() => {
      preview(repository, chosen)
        .then((found) => {
          if (at === reads.current) setRead({ phase: "read", path: chosen, name: found.name, version: found.version });
        })
        .catch((cause: Error) => {
          if (at === reads.current) setRead({ phase: "refused", path: chosen, message: cause.message });
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [chosen, repository, preview]);

  const current = read.phase !== "idle" && read.path === chosen ? read : undefined;
  const found = current?.phase === "read" ? current.name : null;
  const asksName = current?.phase === "read" && current.name === null;

  return (
    <RequestForm
      testId="folder-request"
      ready={current?.phase === "read" && (found !== null || name.trim().length > 0)}
      onSubmit={async () => {
        const taken = found ?? name.trim();
        const why = nameRefusal(taken);
        if (why) throw new Error(why);
        await onAdd(taken, { kind: "path", path: chosen });
      }}
      fields={
        <>
          <Field label={i18n._({ id: "Folder inside {folder}", comment: "a field of Add…'s Folder tab: a folder inside the project's folder; {folder} is that folder's path", values: { folder } })}>
            <span className="flex min-w-0 gap-1">
              <input
                ref={pathRef}
                data-testid="folder-request-path"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                spellCheck={false}
                className={`${INPUT} min-w-0 flex-1 font-mono`}
              />
              {pickDirectory ? (
                <button
                  type="button"
                  data-testid="folder-request-pick"
                  className={BUTTON}
                  onClick={() => {
                    void pickDirectory().then((picked) => {
                      if (!picked) return;
                      const inside = relativeInside(folder, picked);
                      if (inside === undefined) {
                        setRefusal(
                          i18n._({
                            id: "Choose a folder inside {folder}",
                            comment: "Add…'s Folder tab: the folder chosen lies outside the project's folder; {folder} is that folder's path",
                            values: { folder },
                          }),
                        );
                        return;
                      }
                      setRefusal(undefined);
                      setPath(inside);
                    });
                  }}
                >
                  {i18n._({ id: "Choose folder…", comment: "open the system's folder picker" })}
                </button>
              ) : null}
            </span>
            {refusal ? <span role="alert" className="text-red-600 dark:text-red-400">{refusal}</span> : null}
            {current?.phase === "refused" ? (
              <span role="alert" data-testid="folder-request-refusal" className="text-red-600 [overflow-wrap:anywhere] dark:text-red-400">
                {current.message}
              </span>
            ) : null}
          </Field>
          {current?.phase === "reading" ? (
            <span data-testid="folder-request-reading" className="text-neutral-500">
              {i18n._({ id: "Reading meta.yaml…", comment: "Add…'s Folder tab: the chosen folder's meta.yaml is being read for the package's name and version; keep the file name as it is" })}
            </span>
          ) : null}
          {found !== null && current?.phase === "read" ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-neutral-500">{packageNameLabel()}</span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span data-testid="folder-request-derived" className="truncate font-mono">
                  {found}
                </span>
                {current.version ? (
                  <span data-testid="folder-request-version" className="shrink-0 font-mono text-neutral-500">
                    {current.version}
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
          {asksName ? (
            <Field label={packageNameLabel()}>
              <input
                data-testid="folder-request-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="acme/triage"
                spellCheck={false}
                title={i18n._({ id: "No name in its meta.yaml", comment: "the title of Add…'s Folder tab name field: the folder's meta.yaml names no package, so the name is typed; keep the file name as it is" })}
                className={`${INPUT} font-mono`}
              />
            </Field>
          ) : null}
        </>
      }
    />
  );
}

/** Add…'s Git tab (playbook-library-92): a repository at a branch or
 * tag, with the package's name. */
function GitTab({
  onAdd,
}: {
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [git, setGit] = useState("");
  const [rev, setRev] = useState("");
  return (
    <RequestForm
      testId="git-request"
      ready={name.trim().length > 0 && git.trim().length > 0 && rev.trim().length > 0}
      onSubmit={async () => {
        const why = nameRefusal(name.trim());
        if (why) throw new Error(why);
        await onAdd(name.trim(), { kind: "git", git: git.trim(), rev: rev.trim() });
      }}
      fields={
        <>
          <Field label={i18n._({ id: "Repository", comment: "a field of Add…'s Git tab: the Git repository's address" })}>
            <input data-testid="git-request-url" value={git} onChange={(event) => setGit(event.target.value)} placeholder="https://…/triage.git" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
          <Field label={i18n._({ id: "Branch or tag", comment: "a field of Add…'s Git tab: the branch or tag to add the package at" })}>
            <input data-testid="git-request-rev" value={rev} onChange={(event) => setRev(event.target.value)} placeholder="v0.1.0" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
          <Field label={packageNameLabel()}>
            <input data-testid="git-request-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="acme/triage" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
        </>
      }
    />
  );
}
