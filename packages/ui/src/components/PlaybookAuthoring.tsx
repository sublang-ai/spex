// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Authoring where its playbook will live (playbook-library-50,
// playbook-library-51, DR-176): the authoring sessions of one
// environment — a project's on its Playbooks tab, the global one on the
// Playbooks surface — each with its state chip, age, Open and Delete,
// and a command-only creation form at the section's foot. Publishing
// metadata is deferred until Publish (DR-217).

import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { DraftInfo, PlaybookAvailability } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import {
  draftIdCaption,
  draftIdRuleText,
  draftPackagePath,
  isDraftId,
} from "../lib/drafts.js";
import { i18n } from "../i18n.js";
import { phaseLabel } from "../lib/compile-log.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import { useClock } from "../lib/useClock.js";
import { DraftStateChip } from "./AuthoringWorkspace.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { withCode } from "./PlaybookCard.js";

const PRIMARY =
  "min-h-6 rounded-md border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";

/** "Commit ⟨folder⟩ with your code", the folder set as code wherever
 * the language places it (playbook-library-61, DR-069). */
export function commitPhrase(folder: string): ReactNode {
  return withCode(
    (slot) =>
      i18n._({
        id: "Commit {folder} with your code",
        comment: "after adding an authored playbook to a project: {folder} is its package's folder in the project folder, e.g. spex-packages/acme/triage",
        values: { folder: slot },
      }),
    folder,
  );
}

/** The success line an authoring session's Add leaves on the card it
 * listed (playbook-library-10, playbook-library-61): sessions started
 * before must restart, and, for a project's session, its folder is
 * committed with the code. */
export function AddedNote({ folder }: { folder?: string }) {
  return (
    <p data-testid="added-note" className="flex flex-wrap gap-x-3 text-xs text-neutral-500 [overflow-wrap:anywhere]">
      <span>
        {i18n._({
          id: "Added · restart running sessions to use it",
          comment: "after adding an authored playbook: sessions already running do not offer it until restarted",
        })}
      </span>
      {folder !== undefined ? <span data-testid="added-commit">{commitPhrase(folder)}</span> : null}
    </p>
  );
}

/** What the live region says as authoring sessions move
 * (playbook-library-57/58/60/61). */
export function announcementFor(previous: DraftInfo | undefined, next: DraftInfo): string | undefined {
  if (previous?.state === next.state) return undefined;
  switch (next.state) {
    case "compiling":
      return i18n._("Compiling {id}", { id: next.id });
    case "failed":
      // The pipeline names the phase; where it cannot, the line says so.
      return next.compile?.phase
        ? i18n._("Compile failed at {phase}", { phase: phaseLabel(next.compile.phase) })
        : i18n._("Compile failed at an unknown phase");
    case "compiled":
      return i18n._("Compiled {id}", { id: next.id });
    default:
      return undefined;
  }
}

/** One authoring session's row (playbook-library-50): its id, state
 * chip, the age of its last activity, Open, and Delete behind the
 * inline confirm (playbook-library-63). A session whose spec package
 * folder is gone, or whose record the core cannot read, offers only
 * Delete — the latter with the core's diagnostic beneath
 * (playbook-library-70). */
function DraftRow({
  draft,
  onOpen,
  onDelete,
}: {
  draft: DraftInfo;
  onOpen: () => void;
  onDelete: () => Promise<void>;
}) {
  const now = useClock(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const deleteRef = useRef<HTMLButtonElement>(null);
  async function remove(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    setError(undefined);
    try {
      await onDelete();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
      deleteRef.current?.focus();
    }
  }

  return (
    <div
      data-testid={`draft-row-${draft.id}`}
      className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{draft.id}</span>
        <DraftStateChip draft={draft} />
        {draft.firstLine ? (
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-500" title={draft.firstLine}>
            {draft.firstLine}
          </span>
        ) : null}
        <span
          data-testid={`draft-age-${draft.id}`}
          title={absoluteTitle(draft.touchedAt)}
          className="ml-auto shrink-0 text-xs text-neutral-500"
        >
          {relativeAge(draft.touchedAt, now)}
        </span>
        {!draft.sourceMissing && !draft.diagnostic ? (
          <button
            type="button"
            data-testid={`draft-open-${draft.id}`}
            onClick={onOpen}
            className={PRIMARY}
          >
            {i18n._({ id: "Open", comment: "open this authoring session's workspace" })}
          </button>
        ) : null}
        {confirming ? (
          <InlineConfirm
            question={i18n._("Delete this authoring session? Its spec package folder stays.")}
            confirmLabel={i18n._({ id: "Delete", comment: "confirm: remove the authoring session for good" })}
            cancelLabel={i18n._({ id: "Keep", comment: "cancel a removal: leave it as it is" })}
            onConfirm={() => void remove()}
            onCancel={() => {
              setConfirming(false);
              deleteRef.current?.focus();
            }}
          />
        ) : (
          <button
            ref={deleteRef}
            type="button"
            data-testid={`draft-delete-${draft.id}`}
            disabled={busy}
            aria-label={i18n._("Delete authoring session {id}", { id: draft.id })}
            title={i18n._({
              id: "Deletes the session and its conversation · its package folder stays",
              comment: "tooltip of an authoring session's Delete on the Playbooks tab: the session and its conversation go, its package folder stays in the project",
            })}
            onClick={() => setConfirming(true)}
            className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            {busy ? i18n._({ id: "Deleting…", comment: "the delete request is in flight" }) : i18n._({ id: "Delete", comment: "remove the authoring session for good" })}
          </button>
        )}
      </div>
      {draft.diagnostic ? (
        <div
          data-testid={`draft-row-diagnostic-${draft.id}`}
          className="text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400"
        >
          {/* The core's own reading of the record, and what to do. */}
          {i18n._("{diagnostic} — delete the session, or repair the file and restart Spex", {
            diagnostic: draft.diagnostic,
          })}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          data-testid={`draft-row-error-${draft.id}`}
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** A local playbook starts with its command alone. Publication metadata
 * belongs to PublishSetup (playbook-library-51, DR-217). */
function NewPlaybookField({
  taken,
  drafts,
  onCreate,
  onOpenExisting,
  autoFocus,
  onAutoFocused,
}: {
  /** The playbooks the environments place, by id and by name. */
  taken: ReadonlyMap<string, PlaybookAvailability>;
  drafts: Record<string, DraftInfo>;
  onCreate: (id: string) => Promise<unknown>;
  onOpenExisting: (id: string) => void;
  /** The Captain home's slash menu asked for this field. */
  autoFocus: boolean;
  /** The request was honored: focus lands here once, not on every return. */
  onAutoFocused: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const empty = value.trim().length === 0;

  useEffect(() => {
    if (!autoFocus) return;
    rootRef.current?.scrollIntoView?.({ block: "center" });
    inputRef.current?.focus();
    onAutoFocused();
  }, [autoFocus, onAutoFocused]);

  async function submit(): Promise<void> {
    const id = value.trim();
    if (!id || busy) return;
    if (!isDraftId(id)) {
      setError(draftIdRuleText());
      return;
    }
    if (drafts[id]) {
      // An id naming an existing authoring session opens that session.
      setError(undefined);
      onOpenExisting(id);
      return;
    }
    const holder = taken.get(id);
    if (holder) {
      setError(i18n._("{id} is already a playbook of {package}", { id, package: holder.package }));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onCreate(id);
      setValue("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };
  const field = "min-w-0 w-full rounded border border-neutral-300 bg-white px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <div
      ref={rootRef}
      data-testid="new-playbook"
      className="@container flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <p className="text-xs text-neutral-500">{i18n._({ id: "Write and try it here. Publish when you’re ready.", comment: "New playbooks need no publishing account or license to start" })}</p>
      <div className="grid grid-cols-1 items-end gap-2 @sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">{i18n._({ id: "Command", comment: "the slash command of a new playbook" })}</span>
          <input
            ref={inputRef}
            data-testid="new-playbook-id"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            placeholder={i18n._({ id: "e.g. triage", comment: "the hint inside the new-playbook id field; triage is an example id" })}
            spellCheck={false}
            aria-invalid={error !== undefined}
            aria-describedby="new-playbook-caption"
            className={field}
          />
        </label>
        <button
          type="button"
          data-testid="new-playbook-button"
          disabled={busy || empty}
          onClick={() => void submit()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          {busy ? i18n._({ id: "Opening…", comment: "an authoring session is being opened" }) : i18n._({ id: "Start writing", comment: "create a local playbook and open its authoring workspace" })}
        </button>
      </div>
      <span id="new-playbook-caption" data-testid="new-playbook-caption" className="text-xs text-neutral-500">
        {draftIdCaption(isDraftId(value.trim()) ? value.trim() : "triage")}
      </span>
      {error ? (
        <span
          role="alert"
          data-testid="new-playbook-error"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** The Authoring section of one environment (playbook-library-50), or,
 * while it holds no session, "New playbook" alone. */
export function AuthoringSection({
  repository,
  taken,
  autoFocus = false,
  onAutoFocused = () => {},
  onAnnounce,
}: {
  /** The environment whose sessions it lists and creates in: a
   * project's key, or your own group's for the global one. */
  repository: string;
  taken: ReadonlyMap<string, PlaybookAvailability>;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  /** Says a deletion in the page's live region. */
  onAnnounce: (note: string) => void;
}) {
  const store = usePlaceStore();
  const drafts = store((state) => state.drafts);
  const draftsLoaded = store((state) => state.draftsLoaded);
  const createDraft = store((state) => state.createDraft);
  const openDraft = store((state) => state.openDraft);
  const deleteDraft = store((state) => state.deleteDraft);
  const [deletedNote, setDeletedNote] = useState<string>();
  const listed = Object.values(drafts)
    .filter((draft) => draft.projectId === repository)
    .sort((a, b) => b.touchedAt - a.touchedAt);

  const newPlaybook = (
    <NewPlaybookField
      taken={taken}
      drafts={drafts}
      onCreate={(id) => createDraft(id, {}, repository)}
      onOpenExisting={(id) => void openDraft(id)}
      autoFocus={autoFocus}
      onAutoFocused={onAutoFocused}
    />
  );
  const deleted = deletedNote ? (
    <p data-testid="deleted-note" className="text-xs text-neutral-500">
      {deletedNote}
    </p>
  ) : null;

  // Authoring follows the playbooks, the way to a new playbook at its
  // foot (playbook-library-50/51); with no session the section is
  // absent and the field stands alone.
  if (listed.length > 0) {
    return (
      <section data-testid="drafts-section" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "Authoring", comment: "section heading: playbooks being written here" })}</h2>
        {deleted}
        {listed.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            onOpen={() => void openDraft(draft.id)}
            onDelete={async () => {
              await deleteDraft(draft.id);
              const note = i18n._("Deleted {id}; its spec package folder stays at {path}", {
                id: draft.id,
                path: draftPackagePath(draft),
              });
              setDeletedNote(note);
              onAnnounce(note);
            }}
          />
        ))}
        {newPlaybook}
      </section>
    );
  }
  if (!draftsLoaded) return null;
  return (
    <section data-testid="new-playbook-section" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "New playbook", comment: "start writing a playbook of one's own" })}</h2>
      {deleted}
      {newPlaybook}
    </section>
  );
}
