// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-42 (amended by DR-011): the project palette is fully keyboard
// operable, carries per-project live state, and owns add/create.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

import { ProjectPalette } from "./ProjectPalette.js";
import { useAppStore } from "../state/store.js";
import {
  applyRecords,
  initialSessionView,
  type SessionView,
} from "../state/reducer.js";
import type {
  ProjectInfo,
  SessionInfo,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";

const PROJECTS: ProjectInfo[] = [
  { id: "p1", path: "/tmp/alpha", name: "alpha", registeredAt: 0 },
  { id: "p2", path: "/tmp/beta", name: "beta", registeredAt: 1 },
];

function liveSession(id: string, projectId: string): SessionInfo {
  return {
    id,
    projectId,
    projectPath: `/tmp/${projectId}`,
    createdAt: 0,
    live: true,
    endedAt: null,
    players: [],
    initialVisible: [],
  };
}

/** A view parked on a Boss question (attention: question). */
function parkedView(): SessionView {
  return applyRecords(initialSessionView([], []), [
    {
      seq: 1,
      record: {
        type: "captain_telemetry",
        turnId: 1,
        timestamp: 1,
        topic: "playbook.fsm.state",
        payload: {
          to: "awaitBossReply",
          pendingBossQuestion: { player: "coder", question: "Which way?" },
        },
      } as unknown as TmuxPlayRecord,
    },
  ]);
}

function renderPalette(overrides: Partial<Parameters<typeof ProjectPalette>[0]> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const onAddPath = vi.fn(async () => PROJECTS[0]);
  render(
    <ProjectPalette
      projects={PROJECTS}
      sessions={[liveSession("s1", "p2")]}
      views={{ s1: parkedView() }}
      currentProjectId="p1"
      onPick={onPick}
      onAddPath={onAddPath}
      onCreatePath={vi.fn(async () => PROJECTS[1])}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onPick, onClose, onAddPath };
}

describe("project palette keyboard contract (DR-011)", () => {
  test("search focuses on open; arrows highlight; Enter picks", () => {
    const { onPick, onClose } = renderPalette();
    const search = screen.getByTestId("palette-search");
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("p2");
    expect(onClose).toHaveBeenCalled();
  });

  test("Escape closes without picking", () => {
    const { onPick, onClose } = renderPalette();
    fireEvent.keyDown(screen.getByTestId("palette-search"), {
      key: "Escape",
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("typing filters the rows", () => {
    renderPalette();
    fireEvent.change(screen.getByTestId("palette-search"), {
      target: { value: "bet" },
    });
    expect(screen.queryByTestId("palette-project-p1")).toBeNull();
    expect(screen.getByTestId("palette-project-p2")).toBeTruthy();
  });
});

describe("palette rows carry live state", () => {
  test("a project with a parked question shows needs-you and running", () => {
    renderPalette();
    const row = screen.getByTestId("palette-project-p2");
    expect(row.textContent).toContain("1 needs you");
    expect(row.textContent).toContain("1 running");
    expect(
      screen.getByTestId("palette-project-p1").textContent,
    ).not.toContain("running");
  });
});

describe("palette owns add-by-path", () => {
  test("a typed path registers and picks the project", async () => {
    const { onPick, onAddPath } = renderPalette();
    fireEvent.change(screen.getByTestId("palette-path"), {
      target: { value: "/tmp/somewhere" },
    });
    fireEvent.click(screen.getByTestId("palette-add"));
    await vi.waitFor(() => {
      expect(onAddPath).toHaveBeenCalledWith("/tmp/somewhere");
      expect(onPick).toHaveBeenCalledWith("p1");
    });
  });
});

describe("DR-015: the palette offers the Academy example", () => {
  test("the action seeds via the store and picks the project", async () => {
    const openAcademyExample = vi.fn(async () => PROJECTS[1]);
    useAppStore.setState({ openAcademyExample });
    const { onPick, onClose } = renderPalette();
    fireEvent.click(screen.getByTestId("palette-academy"));
    await vi.waitFor(() => {
      expect(openAcademyExample).toHaveBeenCalledWith(undefined);
      expect(onPick).toHaveBeenCalledWith("p2");
      expect(onClose).toHaveBeenCalled();
    });
  });

  test("a typed path becomes the example target", async () => {
    const openAcademyExample = vi.fn(async () => PROJECTS[1]);
    useAppStore.setState({ openAcademyExample });
    renderPalette();
    fireEvent.change(screen.getByTestId("palette-path"), {
      target: { value: "~/academy-here" },
    });
    fireEvent.click(screen.getByTestId("palette-academy"));
    await vi.waitFor(() =>
      expect(openAcademyExample).toHaveBeenCalledWith("~/academy-here"),
    );
  });

  test("a seeding failure surfaces inline without closing", async () => {
    const openAcademyExample = vi.fn(async (): Promise<never> => {
      throw new Error("target directory is not empty");
    });
    useAppStore.setState({ openAcademyExample });
    const { onPick, onClose } = renderPalette();
    fireEvent.click(screen.getByTestId("palette-academy"));
    await vi.waitFor(() =>
      expect(screen.getByText(/not empty/).textContent).toBeTruthy(),
    );
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
