// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { InstanceState, RepositoryState, SpaceState } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { instanceName, instanceOf, pickInstances } from "../lib/instances.js";
import { canRun, heldPlacements, instancePlacements, placeInstances } from "../lib/placements.js";
import { cloneHere, pickDirectoryBridge, projectName, rowName, rowPhrase, phraseNames, sameCode, thisComputerLabel } from "../lib/space.js";
import { useAppStore, type SpaceDestination } from "../state/store.js";
import { AddInstance, InstanceSection } from "./SpaceInstance.js";
import { MoreMenu } from "./SpaceMenu.js";
import { ATTACHED_OWNER, ATTACHED_PANEL, ALERT_INK } from "./SpacePanel.js";
import { PanelCloseButton } from "./PanelCloseButton.js";
import { CombineConfirm, combineLabel } from "./SpacePlacements.js";
import type { SignInFlow } from "./SpaceSignIn.js";
import { ChoicesContext, ConflictsPicker, stoppedRetryInput } from "./SpaceSync.js";
import { PRIMARY, SECONDARY, syncRefusal, type Note } from "./SpaceSurface.js";

interface ListProps {
  space: SpaceState;
  now: number;
  selected?: string;
  selectionDisabled?: boolean;
  connected: boolean;
  dismissed: Readonly<Record<string, string>>;
  signIn: SignInFlow;
  onSelect(key: string, reveal?: boolean, opener?: HTMLElement): void;
  onExplore(key: string, opener?: HTMLElement): void;
  onOpenProject(projectId: string): void;
  onNote: Note;
  repositoryPanel?: ReactNode;
}

export function SpaceProjects(props: ListProps) {
  const { space, connected, signIn, onNote } = props;
  const rows = (origin: string | null) => space.repositories.filter((repo) => repo.instance === origin);
  const list = (repositories: RepositoryState[]) => (
    <ul className="min-w-0 space-y-1">
      {repositories.map((repo) => <ProjectRow key={repo.key} {...props} repo={repo} />)}
    </ul>
  );
  return (
    <div data-testid="space-projects" className="@container flex min-w-0 flex-col gap-3">
      {space.instances.map((instance) => (
        <InstanceSection key={instance.origin} instance={instance} connected={connected} signIn={signIn} onNote={onNote}>
          {list(rows(instance.origin))}
        </InstanceSection>
      ))}
      {rows(null).length > 0 ? (
        <section role="group" aria-label={thisComputerLabel()} className="min-w-0 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-semibold">{thisComputerLabel()}</h2>
          {list(rows(null))}
        </section>
      ) : null}
      {space.instances.length > 0 ? <AddInstance groups={space} connected={connected} signIn={signIn} /> : null}
    </div>
  );
}

function ProjectRow({
  space, repo, now, selected, selectionDisabled, connected, dismissed, onSelect, onExplore,
  onOpenProject, onNote, repositoryPanel,
}: ListProps & { repo: RepositoryState }) {
  const store = useAppStore;
  const projectId = store((state) => state.projects.find((project) => project.repository.key === repo.key)?.id);
  const [editor, setEditor] = useState<"join" | "folder" | "destination" | "resolve" | "combine">();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<string>();
  const [error, setError] = useState<string>();
  const opener = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const phase = JSON.stringify(repo.sync);
  const running = repo.sync.phase === "running";
  useEffect(() => {
    if (accepted !== undefined && accepted !== phase) setAccepted(undefined);
  }, [accepted, phase]);
  const choices = useContext(ChoicesContext);
  const state = store.getState();
  const here = cloneHere(repo);
  const name = rowName(repo);
  const status = rowPhrase(repo, now, dismissed[repo.key], phraseNames(space, repo));
  const signup = instanceOf(space, repo.instance)?.signedIn === true;
  const disabled = !connected || busy || running || accepted === phase;
  const refusal = syncRefusal(space, repo);
  const syncing = busy || accepted === phase || (repo.sync.phase === "running" && repo.sync.op !== "join" && repo.sync.op !== "check");
  const syncDisabled = disabled || Boolean(refusal) || !heldPlacements(repo).some((line) => canRun(space, line));
  const canOpen = !repo.own && !here && repo.id !== null && repo.instance !== null && signup;
  const canPair = !repo.own && here && !repo.folder && projectId === undefined;
  const addsAnotherSpace = instancePlacements(repo).length > 0;
  const destinations = addsAnotherSpace ? placeInstances(space, repo) : pickInstances(space, repo);
  const canChoose = !repo.own && here && (!addsAnotherSpace || destinations.length > 0);
  const hasDestination = destinations.length > 0;
  const [destinationPending, setDestinationPending] = useState(false);
  const codeId = useId();

  const close = () => {
    setEditor(undefined);
    requestAnimationFrame(() => {
      const target = opener.current;
      if (target?.isConnected && !(target instanceof HTMLButtonElement && target.disabled)) target.focus();
      else nameRef.current?.focus();
    });
  };
  const submit = async (action: () => Promise<unknown>, waitsForState = true) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      if (waitsForState) setAccepted(phase);
      setEditor(undefined);
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };
  const openFolder = (folder: string) => editor === "folder" || canPair
    ? submit(() => state.rebindProject(repo.key, folder, []), false)
    : submit(() => state.spaceJoin(repo.instance!, repo.id!, folder));
  const chooseFolder = async (kind: "join" | "folder") => {
    const pick = pickDirectoryBridge();
    if (!pick) {
      setEditor(kind);
      return;
    }
    const folder = await pick();
    if (folder) await openFolder(folder).catch(() => {});
  };
  const retry = () => {
    const sync = repo.sync;
    if (sync.phase !== "stopped") return submit(state.spaceRefresh, false);
    if (sync.op === "check") return submit(() => state.spaceFetch(repo.key));
    const saved = choices.getState();
    const key = repo.key;
    return submit(() => state.spaceSync(repo.key, stoppedRetryInput(space, repo, saved.inputs[key], saved.choices[key], state.spaceLastAct(repo.key))));
  };
  const isSelected = selected === repo.key;

  return (
    <li className={`min-w-0 rounded px-2 py-1 ${isSelected ? ATTACHED_OWNER : ""}`}
      data-testid={`space-row-${repo.key}`} data-state={repo.state}>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="min-w-0 flex flex-1 flex-col items-start">
          <button ref={nameRef} type="button" data-testid={`space-repo-${repo.key}`} aria-expanded={isSelected}
            aria-controls={isSelected ? "space-repository" : undefined}
            aria-describedby={repo.instance && repo.code ? codeId : undefined}
            disabled={selectionDisabled || destinationPending}
            className="h-7 max-w-full truncate text-left text-sm font-medium hover:underline"
            onClick={(event) => onSelect(repo.key, false, event.currentTarget)} title={name}>{name}</button>
          {repo.instance && repo.code ? (
            <span id={codeId} data-testid={`space-repo-code-${repo.key}`} title={repo.code}
              className="hidden max-w-full truncate text-xs text-neutral-500 @md:block">{repo.code}</span>
          ) : null}
        </div>
        {status.text && here ? (
          <button type="button" data-testid={`space-repo-state-${repo.key}`} aria-expanded={isSelected}
            disabled={selectionDisabled} className="text-xs text-neutral-500 hover:underline" title={status.title}
            onClick={(event) => onSelect(repo.key, false, event.currentTarget)}>{status.text}</button>
        ) : <span data-testid={`space-repo-state-${repo.key}`} className="text-xs text-neutral-500" title={status.title}>{status.text}</span>}
        {status.act?.kind === "resolve" || status.act?.kind === "combine" ? (
          <button type="button" data-testid={`space-row-${status.act.kind}-${repo.key}`} className={SECONDARY} disabled={disabled} onClick={(event) => {
            opener.current = event.currentTarget;
            setEditor(status.act?.kind === "combine" ? "combine" : "resolve");
          }}>{status.act.kind === "combine" ? combineLabel() : i18n._("Resolve")}</button>
        ) : null}
        {status.act?.kind === "retry" && !canOpen && !canPair ? (
          <button type="button" className={SECONDARY} disabled={disabled} onClick={() => void retry().catch(() => {})}>{i18n._("Retry")}</button>
        ) : null}
        {projectId ? (
          <button type="button" data-testid={`space-row-open-${repo.key}`} className={`${SECONDARY} h-7`} disabled={!connected} onClick={() => onOpenProject(projectId)}>{i18n._("Open project")}</button>
        ) : canOpen || canPair ? (
          <button type="button" data-testid={`space-row-open-${repo.key}`} className={`${PRIMARY} h-7`} disabled={disabled}
            onClick={(event) => { opener.current = event.currentTarget; void chooseFolder(canPair ? "folder" : "join"); }}>
            {canPair ? i18n._("Choose folder…") : i18n._("Open here")}
          </button>
        ) : null}
        {here ? (
          <MoreMenu of={name} testId={`space-row-more-${repo.key}`} buttonRef={menuRef} disabled={!connected || destinationPending} entries={[
            ...(heldPlacements(repo).length > 0 ? [{
              label: syncing ? i18n._("Syncing…") : i18n._("Sync records"),
              testId: `space-row-sync-${repo.key}`,
              disabled: syncDisabled,
              hint: refusal,
              title: refusal ?? (repo.state === "read-only" ? i18n._("Brings back anything new; sends nothing") : i18n._("Sends what is here and brings back anything new")),
              onSelect: () => void submit(() => state.spaceSync(repo.key, {})).catch(() => {}),
            }] : []),
            ...(canChoose ? [{
              label: i18n._("Sync to a Space…"),
              testId: `space-row-destination-${repo.key}`,
              disabled: disabled || !hasDestination,
              hint: hasDestination ? undefined : i18n._("Sign in to a Space first"),
              onSelect: () => { opener.current = menuRef.current; setEditor("destination"); },
            }] : []),
            { label: i18n._("Explore records"), testId: `space-row-explore-${repo.key}`, disabled: selectionDisabled,
              onSelect: () => onExplore(repo.key, menuRef.current ?? undefined) },
          ]} />
        ) : null}
      </div>
      {isSelected ? repositoryPanel : null}
      {editor === "join" || editor === "folder" ? (
        <ProjectFolderEditor testId={`space-${editor}-${repo.key}`} label={i18n._("Project folder on this computer")} initial=""
          submitLabel={editor === "join" ? i18n._("Open here") : i18n._("Use this folder")} busyLabel={i18n._("Opening…")}
          onSubmit={openFolder} onCancel={close} />
      ) : null}
      {editor === "destination" ? (
        <SpaceDestinationPicker
          space={space} repo={repo} spaces={destinations} adding={addsAnotherSpace}
          connected={connected} onPendingChange={setDestinationPending} onClose={close} onNote={onNote}
        />
      ) : null}
      {editor === "resolve" && status.act?.kind === "resolve" ? (
        <div data-testid={`space-row-resolve-picker-${repo.key}`} className={ATTACHED_PANEL}>
          <ConflictsPicker groups={space} repo={repo} now={now} connected={connected} scope={`space-row-${repo.key}`} onNote={onNote} />
        </div>
      ) : null}
      {editor === "combine" && status.act?.kind === "combine" ? (
        <div data-testid={`space-row-combine-confirm-${repo.key}`} className={ATTACHED_PANEL}>
          <CombineConfirm onCancel={close} onConfirm={() => {
          const act = status.act;
          if (act?.kind === "combine") void submit(() => state.spaceSync(repo.key, {
            placement: act.placement, join: true,
          })).catch(() => {});
          }} />
        </div>
      ) : null}
      {error && editor !== "join" && editor !== "folder" ? <p role="alert" data-testid={`space-row-caption-${repo.key}`} className={`text-xs ${ALERT_INK}`}>{error}</p> : null}
    </li>
  );
}

function SpaceDestinationPicker({ space, repo, spaces, connected, adding, onPendingChange, onClose, onNote }: {
  space: SpaceState; repo: RepositoryState; spaces: InstanceState[]; connected: boolean; adding: boolean;
  onPendingChange(pending: boolean): void; onClose(): void; onNote: Note;
}) {
  const [origin, setOrigin] = useState(spaces[0]?.origin ?? "");
  const [matching, setMatching] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const selected = spaces.find((entry) => entry.origin === origin);
  const copies = space.repositories.filter((row) => row.instance === selected?.origin && row.state === "absent" && row.id !== null && sameCode(row, repo));
  const synchronize = async () => {
    if (!selected || !connected || pending || (matching !== "" && !copies.some((copy) => copy.id === matching))) return;
    const copy = copies.find((entry) => entry.id === matching);
    const choice: SpaceDestination = copy
      ? { kind: "join", instance: selected.origin, hostId: copy.id! }
      : { kind: "create", instance: selected.origin, name: projectName(repo.name) };
    setPending(true);
    onPendingChange(true);
    setError(undefined);
    try {
      const client = useAppStore.getClient();
      if (adding) await client.command("space.place", { repository: repo.key, choice });
      else await useAppStore.getState().spacePick(repo.key, choice);
      onClose();
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  };
  return (
    <div className={ATTACHED_PANEL} data-testid={`space-destination-${repo.key}`} onKeyDown={(event) => {
      if (event.key !== "Escape" || pending) return;
      event.stopPropagation();
      onClose();
    }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{i18n._("Sync to a Space")}</h3>
        <PanelCloseButton disabled={pending} onClick={onClose} />
      </div>
      {spaces.length > 0 ? (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            {i18n._("Space")}
            <select autoFocus value={selected?.origin ?? ""} disabled={pending} onChange={(event) => { setOrigin(event.target.value); setMatching(""); }}>
              {!selected ? <option value="" disabled>{i18n._("Choose a Space")}</option> : null}
              {spaces.map((entry) => <option key={entry.origin} value={entry.origin}>{instanceName(entry)}</option>)}
            </select>
          </label>
          {copies.length > 0 ? (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              {i18n._("Project records")}
              <select value={matching} disabled={pending} onChange={(event) => setMatching(event.target.value)}>
                <option value="">{i18n._("Create a new copy")}</option>
                {copies.map((copy) => <option key={copy.id} value={copy.id!}>{projectName(copy.name)}</option>)}
              </select>
            </label>
          ) : null}
          <button type="button" className={PRIMARY} disabled={!connected || pending || !selected || (matching !== "" && !copies.some((copy) => copy.id === matching))} onClick={() => void synchronize()}>
            {pending ? i18n._("Syncing…") : i18n._("Sync records")}
          </button>
        </>
      ) : <p className="text-sm">{i18n._("Sign in to a Space first")}</p>}
      {error ? <p role="alert" className={`text-xs ${ALERT_INK}`}>{error}</p> : null}
    </div>
  );
}

export function ProjectFolderEditor({
  testId,
  label,
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  testId: string;
  label: string;
  initial: string;
  submitLabel: string;
  busyLabel: string;
  onSubmit(folder: string): Promise<void>;
  onCancel(): void;
}) {
  const [path, setPath] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const submit = async () => {
    const folder = path.trim();
    if (!folder) {
      setRefusal(i18n._({ id: "Name a folder", comment: "the folder field's refusal of an empty path" }));
      fieldRef.current?.focus();
      return;
    }
    setBusy(true);
    setRefusal(undefined);
    try {
      await onSubmit(folder);
    } catch (cause) {
      setRefusal((cause as Error).message);
      fieldRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={testId}
      className="ml-6 flex min-w-0 flex-col gap-1 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">{label}</span>
        <input
          ref={fieldRef}
          data-testid={`${testId}-path`}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SECONDARY} disabled={busy} onClick={() => void submit()}>
          {busy ? busyLabel : submitLabel}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onCancel}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusal ? (
          <span role="alert" className={`min-w-0 text-xs ${ALERT_INK}`}>
            {refusal}
          </span>
        ) : null}
      </div>
    </div>
  );
}
