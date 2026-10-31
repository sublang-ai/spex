// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Packages tab (playbook-library-92, DR-104, DR-172): the
// project's environment, and your own group's beneath it, each with the
// registry account it publishes and reads private packages through
// (playbook-library-119), its spec packages (playbook-library-92) and
// the ways to add one. Every command a section sends names that
// section's spex repository: the project's for the project's, your own
// group's for yours. The playbooks the packages provide stand on the
// project's Playbooks tab.

import { useEffect } from "react";
import type { ProjectInfo } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { ownRepositoryKey } from "../lib/environments.js";
import { RegistryAccount } from "./RegistryAccount.js";
import { AddSpecPackages, EnvironmentSection } from "./EnvironmentSection.js";

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

  // The tab's activation reads both environments; your own group's key
  // comes with Space or the playbook lists, read for it where neither
  // is held.
  useEffect(() => {
    if (!connected) return;
    void loadEnvironment(projectId).catch(() => {});
    if (!store.getState().space) void loadSpace().catch(() => {});
  }, [connected, projectId, loadEnvironment, loadSpace, store]);
  useEffect(() => {
    if (!connected) return;
    if (ownKey === undefined) void loadPlaybookLists(projectId).catch(() => {});
    else if (personal !== undefined) void loadEnvironment(personal).catch(() => {});
  }, [connected, projectId, ownKey, personal, loadEnvironment, loadPlaybookLists]);

  return (
    // The tab's root is the box it scrolls in (DR-041 §9), so the page
    // itself never scrolls.
    <div
      data-testid="packages-tab"
      className="@container relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6"
    >
      {/* The ways to add a spec package stand directly beneath each
          environment's list (playbook-library-92). */}
      <div data-testid="packages-project" className="flex flex-col gap-3">
        <RegistryAccount repository={projectId} />
        <EnvironmentSection repository={projectId} project={project.name} onNavigate={onNavigate} />
        <AddSpecPackages repository={projectId} />
      </div>
      {personal !== undefined ? (
        <div data-testid="packages-personal" className="flex flex-col gap-3">
          <RegistryAccount repository={personal} />
          <EnvironmentSection repository={personal} onNavigate={onNavigate} />
          <AddSpecPackages repository={personal} />
        </div>
      ) : null}
    </div>
  );
}
