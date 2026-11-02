// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Packages tab (playbook-library-92, DR-176): the project's
// packages alone, under "Packages", with the registry its spex.yaml
// names and your account there (playbook-library-119), its packages and
// one "Add…"; every command it sends names the project's spex
// repository. The global packages are managed on the Playbooks surface.
// The tab reads the playbook lists for this project, naming each
// package's playbook lines.

import { useEffect } from "react";
import type { ProjectInfo } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
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
  const lists = store((state) => state.playbookLists);
  const loadPlaybookLists = store((state) => state.loadPlaybookLists);
  const connected = connection === "open";
  const projectId = project.id;
  const listsHere = lists?.projectId === projectId;

  // The tab's activation reads what the project's environment places,
  // naming each playbook line's command (playbook-library-92).
  useEffect(() => {
    if (connected && !listsHere) void loadPlaybookLists(projectId).catch(() => {});
  }, [connected, projectId, listsHere, loadPlaybookLists]);

  return (
    // The tab's root is the box it scrolls in (DR-041 §9), so the page
    // itself never scrolls.
    <div
      data-testid="packages-tab"
      className="@container relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6"
    >
      <div data-testid="packages-project" className="flex flex-col gap-3">
        <EnvironmentSection repository={projectId} projectId={projectId} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
