// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Packages tab (playbook-library-92, DR-104, DR-172): the
// project's packages under "Packages", and yours beneath them under
// "Personal" — packages added for yourself, available in every project —
// each heading with the registry its spex.yaml names and your account
// there (playbook-library-119), its packages and one "Add…". Every
// command a heading sends names that heading's spex repository: the
// project's for "Packages", your own group's for "Personal". A row's
// playbooks enable in place in that heading's config, as the project's
// Playbooks tab lists them; the tab reads those lists for this project.

import { useEffect } from "react";
import type { ProjectInfo } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { ownRepositoryKey } from "../lib/environments.js";
import { EnvironmentSection } from "./EnvironmentSection.js";

export function PackagesTab({
  project,
  onNavigate,
}: {
  /** The project whose tab this is, at the place it is shown. */
  project: ProjectInfo;
  onNavigate?: (surface: "Settings" | "Space") => void;
}) {
  const store = usePlaceStore();
  const connection = store((state) => state.connection);
  const space = store((state) => state.space);
  const lists = store((state) => state.playbookLists);
  const loadSpace = store((state) => state.loadSpace);
  const loadEnvironment = store((state) => state.loadEnvironment);
  const loadPlaybookLists = store((state) => state.loadPlaybookLists);
  const connected = connection === "open";
  const projectId = project.id;
  // Your own group's spex repository, as Space or the playbook lists
  // name it; a project that is your own group's has no second section.
  const ownKey = ownRepositoryKey(space, lists?.own);
  const personal = ownKey !== undefined && ownKey !== projectId ? ownKey : undefined;
  const listsHere = lists?.projectId === projectId;

  // The tab's activation reads both environments and what they export
  // for this project — the playbooks a row enables in place
  // (playbook-library-92) — your own group's key coming with Space or
  // those lists.
  useEffect(() => {
    if (!connected) return;
    void loadEnvironment(projectId).catch(() => {});
    if (!store.getState().space) void loadSpace().catch(() => {});
  }, [connected, projectId, loadEnvironment, loadSpace, store]);
  useEffect(() => {
    if (connected && !listsHere) void loadPlaybookLists(projectId).catch(() => {});
  }, [connected, projectId, listsHere, loadPlaybookLists]);
  useEffect(() => {
    if (connected && personal !== undefined) void loadEnvironment(personal).catch(() => {});
  }, [connected, personal, loadEnvironment]);

  return (
    // The tab's root is the box it scrolls in (DR-041 §9), so the page
    // itself never scrolls.
    <div
      data-testid="packages-tab"
      className="@container relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6"
    >
      <div data-testid="packages-project" className="flex flex-col gap-3">
        <EnvironmentSection repository={projectId} projectId={projectId} projectName={project.name} onNavigate={onNavigate} />
      </div>
      {personal !== undefined ? (
        <div data-testid="packages-personal" className="flex flex-col gap-3">
          <EnvironmentSection repository={personal} projectId={projectId} projectName={project.name} personal onNavigate={onNavigate} />
        </div>
      ) : null}
    </div>
  );
}
