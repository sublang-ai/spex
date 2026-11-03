// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface (playbook-library-122, DR-176): the global page,
// the rail's Playbooks entry for the place it shows. Under a header
// carrying the global environment's registry, the account there and one
// "Add…", each spec package the global environment requests stands as
// the Packages tab's row reads it — each it requires beneath the one
// that required it — and beneath it the playbooks it places, each as a
// project's tab lists it, ✎ editing the global entry with each role's
// tuning. The Authoring section and "New playbook" follow, creating in
// the global environment's folder. Every act here writes the global
// config or the global environment; the surface lists no project's
// playbook and names no project.

import { useCallback, useEffect, useState } from "react";
import type { PlaybookAvailability } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { ownRepositoryKey } from "../lib/environments.js";
import { i18n } from "../i18n.js";
import { AuthoringWorkspace } from "./AuthoringWorkspace.js";
import { EnvironmentSection } from "./EnvironmentSection.js";
import { AddedNote, AuthoringSection } from "./PlaybookAuthoring.js";
import { InvalidEntryRow, PlaybookCard, playbookHints } from "./PlaybookCard.js";
import { ConfigGate, rowsById, takenIds, useLiveNote, useRevealedCard } from "./PlaybooksTab.js";

const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";

export function PlaybooksSurface({
  onNavigate,
}: {
  onNavigate?: (surface: "Settings" | "Space") => void;
}) {
  const store = usePlaceStore();
  const configState = store((state) => state.configState);
  const readiness = store((state) => state.readiness);
  const connection = store((state) => state.connection);
  const space = store((state) => state.space);
  const drafts = store((state) => state.drafts);
  const openDraftId = store((state) => state.openDraftId);
  const listDrafts = store((state) => state.listDrafts);
  const closeDraft = store((state) => state.closeDraft);
  const loadSpace = store((state) => state.loadSpace);
  const readLists = store((state) => state.playbookLists);
  const loadPlaybookLists = store((state) => state.loadPlaybookLists);
  const connected = connection === "open";
  const [listError, setListError] = useState<string>();
  const live = useLiveNote();

  // What the global environment places, as read for no project: a read
  // for a project's tab binds as that project would, and is not this
  // page's.
  const lists = readLists?.projectId === null ? readLists : undefined;
  // The global environment is your own group's spex repository's, as
  // Space or the list names it.
  const ownKey = ownRepositoryKey(space, readLists?.own);

  const reloadLists = useCallback(() => {
    setListError(undefined);
    void loadPlaybookLists(undefined).catch((cause: Error) => setListError(cause.message));
  }, [loadPlaybookLists]);

  useEffect(() => {
    if (!connected) return;
    void listDrafts().catch(() => {});
    reloadLists();
    if (!store.getState().space) void loadSpace().catch(() => {});
  }, [connected, listDrafts, reloadLists, loadSpace, store]);

  const rows = rowsById(lists?.own ?? []);
  const { revealed, added } = useRevealedCard(rows, live.announce);

  if (!configState || configState.status !== "valid") return <ConfigGate onNavigate={onNavigate} />;
  const roster = configState.summary.players ?? [];

  // An authoring session of the global environment replaces the list
  // with its workspace (playbook-library-52); it stays open in the core
  // while the list is shown.
  if (openDraftId && ownKey !== undefined && drafts[openDraftId]?.projectId === ownKey) {
    return (
      <>
        {live.region}
        <AuthoringWorkspace draftId={openDraftId} onBack={closeDraft} onNavigate={onNavigate} />
      </>
    );
  }

  const body = (() => {
    if (ownKey === undefined) {
      return listError ? (
        <div role="alert" className={ERROR}>
          {listError}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">{i18n._({ id: "loading…", comment: "a request for this pane's content is in flight" })}</p>
      );
    }
    // The global entries failing validation, each on its row or, where
    // none lists it, on a row of its own (playbook-library-2).
    const invalid = (lists?.invalid ?? []).filter((entry) => entry.config === "own");
    const invalidOf = (id: string) => invalid.filter((entry) => entry.playbook === id).map((entry) => entry.reason);
    const strayInvalid = invalid.filter((entry) => !rows.some((row) => row.id === entry.playbook));
    const running = new Set(rows.filter((row) => row.runs).map((row) => row.id));
    const cardFor = (entry: PlaybookAvailability) => (
      <PlaybookCard
        key={entry.id}
        entry={entry}
        scope={{ kind: "global", repository: ownKey }}
        invalid={invalidOf(entry.id)}
        roster={roster}
        readiness={readiness}
        revealed={revealed === entry.id}
        // An authoring session of the global environment syncs with the
        // global records: nothing to commit (playbook-library-61).
        addedNote={added === entry.id ? <AddedNote /> : undefined}
        hints={playbookHints(entry, running)}
        onChanged={reloadLists}
      />
    );
    return (
      <>
        <EnvironmentSection
          repository={ownKey}
          onNavigate={onNavigate}
          beneath={(name) => {
            const placed = rows.filter((entry) => entry.package === name);
            return placed.length > 0 ? (
              <div data-testid={`surface-playbooks-${name}`} className="flex flex-col gap-2 pt-1">
                {placed.map(cardFor)}
              </div>
            ) : null;
          }}
        />
        {listError ? (
          <div role="alert" className={ERROR}>
            {listError}
          </div>
        ) : null}
        {strayInvalid.length > 0 ? (
          <section className="flex flex-col gap-2">
            {strayInvalid.map((entry) => (
              <InvalidEntryRow key={entry.playbook} entry={entry} repository={ownKey} onChanged={reloadLists} />
            ))}
          </section>
        ) : null}
        <AuthoringSection
          repository={ownKey}
          taken={takenIds([lists?.own ?? []])}
          onAnnounce={live.announce}
        />
      </>
    );
  })();

  return (
    // The surface's root is the box it scrolls in (DR-041 §9), so the
    // page itself never scrolls.
    <div
      data-testid="playbooks-surface"
      className="@container relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6"
    >
      {live.region}
      {body}
    </div>
  );
}
