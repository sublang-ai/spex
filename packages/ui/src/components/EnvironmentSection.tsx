// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's environment on the Playbooks surface
// (playbook-library-92, DR-104): what it requests and what it got —
// each requested spec package with its source and resolved version,
// what it requires nested under it, every selected artifact with its
// language and a fallback mark, whether its files are installed, a
// path source missing on this device — with the lock's staleness and
// the conflict report, Resolve again and Install where they apply, and
// Remove behind the inline confirm. The ways to add a spec package —
// from the registry, a folder or Git — stand apart at the surface's
// foot. Every control waits while that spex repository syncs, naming
// the sync; a change the core refuses shows its cause in place.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  EnvironmentPackage,
  EnvironmentRequest,
  EnvironmentState,
} from "@sublang/spex-core/protocol";

import { useAppStore, type RegistryResult } from "../state/store.js";
import {
  SPEC_PACKAGE_NAME_RULE,
  artifactKindWord,
  busyWord,
  caretOf,
  relativeInside,
  requestPhrase,
  sourceKindWord,
} from "../lib/environments.js";
import { i18n } from "../i18n.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { RunningMark } from "./RunningMark.js";

const BUTTON =
  "min-h-6 rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";
const PRIMARY =
  "min-h-6 rounded-md border border-brand-300 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";
const INPUT =
  "min-w-0 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950";
const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";

/** Why every control waits right now: the sync, then the core's own
 * work on this environment. */
function holdOf(state: EnvironmentState | undefined, sync: string | undefined): string | undefined {
  return sync ?? busyWord(state?.busy ?? null);
}

/** The packages in the order the section draws them: each requested
 * one with what it requires beneath it, then any the graph holds that
 * no listed package names as its requirer. */
function packageTree(state: EnvironmentState): { pkg: EnvironmentPackage | undefined; name: string; depth: number }[] {
  const byName = new Map(state.packages.map((pkg) => [pkg.name, pkg]));
  const rows: { pkg: EnvironmentPackage | undefined; name: string; depth: number }[] = [];
  const placed = new Set<string>();
  const place = (name: string, depth: number): void => {
    // A cycle is allowed and adds nothing (DR-104).
    if (placed.has(name)) return;
    placed.add(name);
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

function PackageRow({
  name,
  pkg,
  depth,
  state,
  hold,
  onRemove,
}: {
  name: string;
  pkg: EnvironmentPackage | undefined;
  depth: number;
  state: EnvironmentState;
  hold: string | undefined;
  onRemove: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const removeRef = useRef<HTMLButtonElement>(null);
  const request = state.requests[name];
  const direct = request !== undefined || pkg?.direct === true;

  async function remove(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    setError(undefined);
    try {
      await onRemove();
    } catch (cause) {
      setError((cause as Error).message);
      removeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      data-testid={`env-package-${name}`}
      style={depth > 0 ? { marginInlineStart: `${depth * 1.25}rem` } : undefined}
      className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate font-mono text-sm font-semibold" title={name}>
          {name}
        </span>
        <span data-testid={`env-version-${name}`} className="font-mono text-neutral-600 dark:text-neutral-300">
          {pkg?.version ?? i18n._({ id: "not resolved", comment: "a requested spec package the lock holds no version of yet" })}
        </span>
        <span data-testid={`env-source-${name}`} className="min-w-0 flex-1 truncate text-neutral-500" title={pkg?.source.detail}>
          {request
            ? requestPhrase(request)
            : pkg
              ? depth > 0
                ? i18n._("{source}, required by {packages}", {
                    source: sourceKindWord(pkg.source.kind),
                    packages: pkg.requiredBy.join(", "),
                  })
                : sourceKindWord(pkg.source.kind)
              : null}
        </span>
        {pkg ? (
          pkg.missingPath !== null ? (
            <span data-testid={`env-missing-${name}`} className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300">
              {i18n._("Missing on this device: {path}", { path: pkg.missingPath })}
            </span>
          ) : (
            <span
              data-testid={`env-installed-${name}`}
              className={`rounded px-1.5 py-0.5 ${
                pkg.installed
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              }`}
            >
              {pkg.installed
                ? i18n._({ id: "Installed", comment: "a spec package's files are installed on this device" })
                : i18n._({ id: "Not installed", comment: "a spec package's files are not installed on this device yet" })}
            </span>
          )
        ) : null}
        {direct ? (
          confirming ? (
            <InlineConfirm
              question={i18n._("Remove {name}?", { name })}
              confirmLabel={i18n._({ id: "Remove", comment: "confirm: take this spec package out of the requests" })}
              cancelLabel={i18n._({ id: "Keep", comment: "cancel a removal: leave it as it is" })}
              onConfirm={() => void remove()}
              onCancel={() => {
                setConfirming(false);
                removeRef.current?.focus();
              }}
            />
          ) : (
            <button
              ref={removeRef}
              type="button"
              data-testid={`env-remove-${name}`}
              disabled={busy || hold !== undefined}
              title={hold ?? i18n._("Stop requesting this spec package")}
              aria-label={i18n._("Remove {name}", { name })}
              onClick={() => setConfirming(true)}
              className={BUTTON}
            >
              {busy
                ? i18n._({ id: "Removing…", comment: "the removal is in flight" })
                : i18n._({ id: "Remove", comment: "take this spec package out of the requests" })}
            </button>
          )
        ) : null}
      </div>
      {pkg && pkg.artifacts.length > 0 ? (
        <ul data-testid={`env-artifacts-${name}`} className="flex flex-wrap gap-1">
          {pkg.artifacts.map((artifact) => (
            <li
              key={`${artifact.kind}:${artifact.id}`}
              data-testid={`env-artifact-${name}-${artifact.id}`}
              className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <span className="font-mono">{artifact.id}</span>
              <span className="text-neutral-500">{artifactKindWord(artifact.kind)}</span>
              {artifact.language ? <span className="font-mono">{artifact.language}</span> : null}
              {artifact.fallback ? (
                <span
                  data-testid={`env-fallback-${name}-${artifact.id}`}
                  title={
                    state.language
                      ? i18n._("No {language} text; the original stands", { language: state.language })
                      : i18n._("The original text stands")
                  }
                  className="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  {i18n._({ id: "fallback", comment: "mark: this artifact's wanted language was missing, the original stands" })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" data-testid={`env-package-error-${name}`} className={ERROR}>
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** The environment of one spex repository (playbook-library-92). */
export function EnvironmentSection({
  repository,
  sync,
}: {
  repository: string;
  /** Why the controls wait for this repository's sync, if it syncs. */
  sync: string | undefined;
}) {
  const state = useAppStore((store) => store.environments[repository]);
  const loadError = useAppStore((store) => store.environmentErrors[repository]);
  const resolve = useAppStore((store) => store.resolveEnvironment);
  const install = useAppStore((store) => store.installEnvironment);
  const remove = useAppStore((store) => store.removeSpecPackage);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<"resolve" | "install">();
  const hold = holdOf(state, sync);

  function act(kind: "resolve" | "install"): void {
    setPending(kind);
    setError(undefined);
    void (kind === "resolve" ? resolve(repository) : install(repository))
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
    const filesMissing = state.packages.some((pkg) => !pkg.installed && pkg.missingPath === null);
    const offerResolve = state.stale !== null || (state.conflicts?.length ?? 0) > 0;
    body = (
      <>
        {state.stale !== null ? (
          <p
            data-testid="environment-stale"
            title={state.stale.join("\n") || undefined}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            {i18n._("Requests changed; resolve again to install")}
          </p>
        ) : null}
        {state.conflicts && state.conflicts.length > 0 ? (
          <div data-testid="environment-conflicts" className={ERROR}>
            <p>{i18n._("No version meets every requirement:")}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {state.conflicts.map((conflict) => (
                <li key={conflict.name}>
                  <span className="font-mono">{conflict.name}</span>
                  {" — "}
                  {conflict.requirements
                    .map((entry) => i18n._("{requirement} by {requirer}", { requirement: entry.requirement, requirer: entry.by }))
                    .join("; ")}
                </li>
              ))}
            </ul>
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
        {offerResolve || filesMissing ? (
          <div className="flex flex-wrap items-center gap-2">
            {offerResolve ? (
              <button
                type="button"
                data-testid="environment-resolve"
                disabled={hold !== undefined || pending !== undefined}
                title={hold ?? i18n._("Resolve the requests into a new lock and install it")}
                onClick={() => act("resolve")}
                className={PRIMARY}
              >
                {pending === "resolve"
                  ? i18n._({ id: "Resolving…", comment: "the environment's requests are being resolved into a lock" })
                  : i18n._({ id: "Resolve again", comment: "resolve the changed requests into a new lock" })}
              </button>
            ) : null}
            {filesMissing ? (
              <button
                type="button"
                data-testid="environment-install"
                disabled={hold !== undefined || pending !== undefined}
                title={hold ?? i18n._("Install the locked files on this device")}
                onClick={() => act("install")}
                className={PRIMARY}
              >
                {pending === "install"
                  ? i18n._({ id: "Installing…", comment: "the environment's locked files are being installed" })
                  : i18n._({ id: "Install", comment: "install the locked files that are missing on this device" })}
              </button>
            ) : null}
          </div>
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
                hold={hold}
                onRemove={() => remove(repository, row.name)}
              />
            ))}
          </ul>
        ) : (
          <p data-testid="environment-empty" className="text-xs text-neutral-500">
            {i18n._("No spec packages requested yet")}
          </p>
        )}
      </>
    );
  }

  return (
    <section data-testid="environment-section" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          {i18n._({ id: "Environment", comment: "section heading: the spec packages one spex repository installs" })}
        </h2>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-500" title={repository}>
          {repository}
        </span>
        {hold ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-neutral-500">
            <RunningMark running />
            <span data-testid="environment-hold">{hold}</span>
          </span>
        ) : null}
      </div>
      {body}
    </section>
  );
}

type AddMode = "registry" | "folder" | "git";

/** The ways to add a spec package to one spex repository's requests
 * (playbook-library-92): from the registry by search, from a folder
 * inside the working folder, or from Git at a rev. */
export function AddSpecPackages({
  repository,
  sync,
  folder,
}: {
  repository: string;
  sync: string | undefined;
  /** The working folder paired with the repository on this device. */
  folder: string | null | undefined;
}) {
  const state = useAppStore((store) => store.environments[repository]);
  const request = useAppStore((store) => store.requestSpecPackage);
  const [mode, setMode] = useState<AddMode>();
  const [added, setAdded] = useState<string>();
  const hold = holdOf(state, sync);

  async function add(name: string, next: EnvironmentRequest): Promise<void> {
    await request(repository, name, next);
    setAdded(name);
  }

  const modes: { key: AddMode; label: string; title: string; testId: string; disabledWhy?: string }[] = [
    {
      key: "registry",
      label: i18n._({ id: "Add from registry", comment: "open the search over the registry's spec packages" }),
      title: i18n._("Search the registry and request a version"),
      testId: "add-from-registry",
    },
    {
      key: "folder",
      label: i18n._({ id: "Add from folder", comment: "request a spec package by its folder in the working folder" }),
      title: i18n._("Request a folder inside the working folder"),
      testId: "add-from-folder",
      disabledWhy: folder ? undefined : i18n._("No working folder on this device"),
    },
    {
      key: "git",
      label: i18n._({ id: "Add from Git", comment: "request a spec package from a Git repository at a rev" }),
      title: i18n._("Request a Git repository at a branch, tag or commit"),
      testId: "add-from-git",
    },
  ];

  return (
    <section data-testid="add-packages" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500">{i18n._("Add a spec package")}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {modes.map((entry) => {
          const why = hold ?? entry.disabledWhy;
          return (
            <button
              key={entry.key}
              type="button"
              data-testid={entry.testId}
              aria-expanded={mode === entry.key}
              disabled={why !== undefined}
              title={why ?? entry.title}
              onClick={() => {
                setAdded(undefined);
                setMode((current) => (current === entry.key ? undefined : entry.key));
              }}
              className={mode === entry.key ? PRIMARY : BUTTON}
            >
              {entry.label}
            </button>
          );
        })}
        {hold ? (
          <span data-testid="add-hold" className="text-xs text-neutral-500">
            {hold}
          </span>
        ) : null}
      </div>
      {added ? (
        <p data-testid="add-note" role="status" className="text-xs text-neutral-500">
          {i18n._("Requested {name}", { name: added })}
        </p>
      ) : null}
      {mode === "registry" ? <RegistrySearch hold={hold} onAdd={add} /> : null}
      {mode === "folder" && folder ? <FolderRequest folder={folder} hold={hold} onAdd={add} /> : null}
      {mode === "git" ? <GitRequest hold={hold} onAdd={add} /> : null}
    </section>
  );
}

function RegistrySearch({
  hold,
  onAdd,
}: {
  hold: string | undefined;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const search = useAppStore((store) => store.searchRegistry);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistryResult[]>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const reads = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults(undefined);
      return;
    }
    // The newest query wins: a reply an edit overtook applies nothing.
    const read = (reads.current += 1);
    const timer = setTimeout(() => {
      setSearching(true);
      setError(undefined);
      search(text)
        .then((found) => {
          if (read === reads.current) setResults(found);
        })
        .catch((cause: Error) => {
          if (read === reads.current) setError(cause.message);
        })
        .finally(() => {
          if (read === reads.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div data-testid="registry-search" className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <input
        ref={inputRef}
        data-testid="registry-query"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={i18n._({ id: "Search the registry", comment: "placeholder of the registry search field" })}
        aria-label={i18n._({ id: "Search the registry", comment: "placeholder of the registry search field" })}
        spellCheck={false}
        className={INPUT}
      />
      {searching ? (
        <p className="text-xs text-neutral-500">{i18n._({ id: "Searching…", comment: "the registry search is in flight" })}</p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="registry-error" className={ERROR}>
          {error}
        </p>
      ) : null}
      {results && results.length === 0 && !searching ? (
        <p data-testid="registry-none" className="text-xs text-neutral-500">
          {i18n._("No spec package matches")}
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {results.map((result) => (
            <RegistryResultRow key={result.name} result={result} hold={hold} onAdd={onAdd} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RegistryResultRow({
  result,
  hold,
  onAdd,
}: {
  result: RegistryResult;
  hold: string | undefined;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const [version, setVersion] = useState(result.versions[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <li data-testid={`registry-result-${result.name}`} className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{result.name}</span>
        {result.description ? (
          <span className="min-w-0 flex-1 truncate text-neutral-500" title={result.description}>
            {result.description}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <select
          data-testid={`registry-version-${result.name}`}
          aria-label={i18n._("Version of {name}", { name: result.name })}
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono dark:border-neutral-700 dark:bg-neutral-950"
        >
          {result.versions.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid={`registry-add-${result.name}`}
          disabled={busy || !version || hold !== undefined}
          title={hold ?? i18n._("Request {requirement}", { requirement: caretOf(version) })}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void onAdd(result.name, { kind: "registry", version: caretOf(version) })
              .catch((cause: Error) => setError(cause.message))
              .finally(() => setBusy(false));
          }}
          className={PRIMARY}
        >
          {busy ? i18n._({ id: "Adding…", comment: "the request is being written" }) : i18n._({ id: "Add", comment: "request this spec package at the chosen version" })}
        </button>
      </div>
      {error ? (
        <p role="alert" data-testid={`registry-add-error-${result.name}`} className={ERROR}>
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** The name field both the folder and the Git forms carry, checked in
 * place against the spec package name rule before anything is sent. */
function nameRefusal(name: string): string | undefined {
  return SPEC_PACKAGE_NAME_RULE.test(name)
    ? undefined
    : i18n._("A spec package is named org/name, each part lowercase words joined by single hyphens");
}

function RequestForm({
  testId,
  hold,
  fields,
  ready,
  onSubmit,
}: {
  testId: string;
  hold: string | undefined;
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
        if (busy || !ready || hold) return;
        setBusy(true);
        setError(undefined);
        void onSubmit()
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}
      className="@container flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">{fields}</div>
      {error ? (
        <p role="alert" data-testid={`${testId}-error`} className={ERROR}>
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          data-testid={`${testId}-submit`}
          disabled={busy || !ready || hold !== undefined}
          title={hold}
          className={PRIMARY}
        >
          {busy ? i18n._({ id: "Adding…", comment: "the request is being written" }) : i18n._({ id: "Add", comment: "request this spec package at the chosen version" })}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function FolderRequest({
  folder,
  hold,
  onAdd,
}: {
  folder: string;
  hold: string | undefined;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [refusal, setRefusal] = useState<string>();
  const pickDirectory = window.spexNative?.pickDirectory;
  return (
    <RequestForm
      testId="folder-request"
      hold={hold}
      ready={name.trim().length > 0 && path.trim().length > 0}
      onSubmit={async () => {
        const why = nameRefusal(name.trim());
        if (why) throw new Error(why);
        await onAdd(name.trim(), { kind: "path", path: path.trim() });
      }}
      fields={
        <>
          <Field label={i18n._("Spec package name")}>
            <input data-testid="folder-request-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="acme/triage" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
          <Field label={i18n._("Folder inside {folder}", { folder })}>
            <span className="flex min-w-0 gap-1">
              <input data-testid="folder-request-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="spex-packages/triage" spellCheck={false} className={`${INPUT} flex-1 font-mono`} />
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
                        setRefusal(i18n._("Pick a folder inside {folder}", { folder }));
                        return;
                      }
                      setRefusal(undefined);
                      setPath(inside);
                    });
                  }}
                >
                  {i18n._({ id: "Pick folder", comment: "open the system's folder picker" })}
                </button>
              ) : null}
            </span>
            {refusal ? <span role="alert" className="text-red-600 dark:text-red-400">{refusal}</span> : null}
          </Field>
        </>
      }
    />
  );
}

function GitRequest({
  hold,
  onAdd,
}: {
  hold: string | undefined;
  onAdd: (name: string, request: EnvironmentRequest) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [git, setGit] = useState("");
  const [rev, setRev] = useState("");
  const [path, setPath] = useState("");
  return (
    <RequestForm
      testId="git-request"
      hold={hold}
      ready={name.trim().length > 0 && git.trim().length > 0 && rev.trim().length > 0}
      onSubmit={async () => {
        const why = nameRefusal(name.trim());
        if (why) throw new Error(why);
        await onAdd(name.trim(), {
          kind: "git",
          git: git.trim(),
          rev: rev.trim(),
          ...(path.trim() ? { path: path.trim() } : {}),
        });
      }}
      fields={
        <>
          <Field label={i18n._("Spec package name")}>
            <input data-testid="git-request-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="acme/triage" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
          <Field label={i18n._("Repository URL")}>
            <input data-testid="git-request-url" value={git} onChange={(event) => setGit(event.target.value)} placeholder="https://github.com/acme/triage.git" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
          <Field label={i18n._("Branch, tag or commit")}>
            <input data-testid="git-request-rev" value={rev} onChange={(event) => setRev(event.target.value)} placeholder="v0.1.0" spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
          <Field label={i18n._("Folder inside it (optional)")}>
            <input data-testid="git-request-path" value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} className={`${INPUT} font-mono`} />
          </Field>
        </>
      }
    />
  );
}
