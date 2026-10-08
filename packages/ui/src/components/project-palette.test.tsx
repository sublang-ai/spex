// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-42 (amended by DR-011): the project palette is fully keyboard
// operable, carries per-project live state, and owns add/create.

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

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
  { id: "me/alpha-spex", path: "/tmp/alpha", name: "alpha", registeredAt: 0, repository: { key: "me/alpha-spex", name: "alpha-spex", group: "me", own: true } },
  { id: "me/beta-spex", path: "/tmp/beta", name: "beta", registeredAt: 1, repository: { key: "me/beta-spex", name: "beta-spex", group: "me", own: true } },
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
    turns: 0,
    failed: false,
  };
}

/** A view parked on a Boss question (attention: question). */
function parkedView(): SessionView {
  return applyRecords(initialSessionView([]), [
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
      sessions={[liveSession("s1", "me/beta-spex")]}
      attention={
        new Map([
          [
            "s1",
            {
              kind: "question" as const,
              sessionId: "s1",
              projectPath: "/tmp/p2",
              text: "Which way?",
            },
          ],
        ])
      }
      currentProjectId="me/alpha-spex"
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
    expect(onPick).toHaveBeenCalledWith("me/beta-spex");
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
    expect(screen.queryByTestId("palette-project-me/alpha-spex")).toBeNull();
    expect(screen.getByTestId("palette-project-me/beta-spex")).toBeTruthy();
  });

  test("Escape closes from a control deep inside the dialog", () => {
    const { onClose } = renderPalette();
    const create = screen.getByTestId("palette-path");
    create.focus();
    fireEvent.keyDown(create, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("the dialog is modal and Tab wraps at both ends", () => {
    renderPalette();
    const dialog = screen.getByRole("dialog", { name: "Choose a project" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const search = screen.getByTestId("palette-search");
    const last = screen.getByTestId("palette-academy");
    // Shift+Tab from the first control lands on the last, Tab from
    // the last lands on the first: focus never leaves the palette.
    search.focus();
    fireEvent.keyDown(search, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(search);
  });
});

describe("projects-22: with no project, the palette is an add flow", () => {
  const EMPTY = { projects: [], sessions: [], views: {} };

  test("Enter in the empty path field takes the leading Academy row", async () => {
    const openAcademyExample = vi.fn(async () => PROJECTS[1]);
    useAppStore.setState({ openAcademyExample });
    const { onPick } = renderPalette(EMPTY);
    fireEvent.keyDown(screen.getByTestId("palette-path"), { key: "Enter" });
    await vi.waitFor(() => {
      expect(openAcademyExample).toHaveBeenCalledWith(undefined);
      expect(onPick).toHaveBeenCalledWith("me/beta-spex");
    });
  });

  test("a typed path still adds on Enter", async () => {
    const { onAddPath } = renderPalette(EMPTY);
    const path = screen.getByTestId("palette-path");
    fireEvent.change(path, { target: { value: "/tmp/repo" } });
    fireEvent.keyDown(path, { key: "Enter" });
    await vi.waitFor(() =>
      expect(onAddPath).toHaveBeenCalledWith("/tmp/repo"),
    );
  });
});

describe("projects-26: the palette's path actions, live rows and plain words", () => {
  test("Add and Create name what each does, a live row pulses, and nothing says forge", () => {
    renderPalette();
    const add = screen.getByTestId("palette-add") as HTMLButtonElement;
    const create = screen.getByTestId("palette-create") as HTMLButtonElement;
    // Two distinct actions on the typed path, each titled with what it
    // does (projects-22, projects-25).
    expect(add.textContent).toBe("Add");
    expect(add.title).toBe("Register this existing repository");
    expect(create.textContent).toBe("Create");
    expect(create.title).toBe("Create a new repository at this path");
    expect(add.disabled).toBe(true);
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("palette-path"), {
      target: { value: "/tmp/new-repo" },
    });
    expect(add.disabled).toBe(false);
    expect(create.disabled).toBe(false);

    // The project with a live session reads its running count beside a
    // pulsing dot; the other reads none (projects-23).
    const live = screen.getByTestId("palette-project-me/beta-spex");
    expect(live.textContent).toContain("1 running");
    expect(live.querySelector(".animate-pulse")).not.toBeNull();
    const quiet = screen.getByTestId("palette-project-me/alpha-spex");
    expect(quiet.textContent).not.toContain("running");
    expect(quiet.querySelector(".animate-pulse")).toBeNull();

    // Plain words throughout: no text, label or title says "forge"
    // (projects-25).
    const dialog = screen.getByRole("dialog");
    const words = [
      dialog.textContent ?? "",
      ...Array.from(dialog.querySelectorAll("[title],[aria-label],[placeholder]")).flatMap(
        (node) => ["title", "aria-label", "placeholder"].map((name) => node.getAttribute(name) ?? ""),
      ),
    ];
    expect(words.filter((word) => /forge/i.test(word))).toEqual([]);
  });
});

describe("palette rows carry live state", () => {
  test("a project with a parked question shows needs-you and running", () => {
    renderPalette();
    const row = screen.getByTestId("palette-project-me/beta-spex");
    expect(row.textContent).toContain("1 needs you");
    expect(row.textContent).toContain("1 running");
    expect(
      screen.getByTestId("palette-project-me/alpha-spex").textContent,
    ).not.toContain("running");
  });
});

describe("DR-015: the palette offers the Academy example", () => {
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

describe("projects-33: a folder added or created while signed in asks for its group in place", () => {
  const ADDED: ProjectInfo = { id: "ada/gamma-spex", path: "/tmp/gamma", name: "gamma", registeredAt: 2, repository: { key: "ada/gamma-spex", name: "gamma-spex", group: "ada", own: true } };
  const row = (key: string, extra: object = {}) => ({
    key, name: key.split("/").pop(), id: null, own: false, code: null, folder: "/tmp/gamma",
    remote: null, state: "local-only", reason: null, waiting: null, members: null, visibility: null,
    branch: null, local: [], incoming: [], conflicts: [], lastSync: null, noticed: false, sync: { phase: "idle" }, ...extra,
  });
  const groups = (account: boolean, repositories: object[]) => ({
    home: "/home/.spex", git: { ok: true, version: "2.50" }, host: { url: "https://host.test", displayName: "Host" },
    account: account ? { id: "1", login: "ada", displayName: null } : null,
    signIn: { phase: "idle" }, readAt: 1, diagnostics: [], issues: 0,
    groups: [
      { id: "10", fullPath: "ada", name: "ada", url: null, own: true, repositories },
      { id: "20", fullPath: "acme", name: "acme", url: null, own: false, repositories: [] },
    ],
  }) as never;

  function add(path = "/tmp/gamma", action = "palette-add"): void {
    fireEvent.change(screen.getByTestId("palette-path"), { target: { value: path } });
    fireEvent.click(screen.getByTestId(action));
  }

  test("the picker stands in the palette; picking a group creates there and closes it", async () => {
    const spacePick = vi.fn(async () => {});
    useAppStore.setState({ connection: "open", space: groups(true, [row(ADDED.id)]), spacePick });
    const { onPick, onClose } = renderPalette({ onAddPath: vi.fn(async () => ADDED) });
    add();
    await screen.findByTestId(`space-picker-${ADDED.id}`);
    // The folder is the current project already; nothing is closed yet,
    // and the picker stands where the list was.
    expect(onPick).toHaveBeenCalledWith(ADDED.id);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId("palette-path")).toBeNull();
    expect((screen.getByTestId(`space-pick-name-${ADDED.id}`) as HTMLInputElement).value).toBe("gamma");
    fireEvent.click(screen.getByTestId("space-pick-group-acme"));
    await vi.waitFor(() =>
      expect(spacePick).toHaveBeenCalledWith(ADDED.id, { kind: "create", groupId: "20", name: "gamma" }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("Cancel leaves it local only and closes the palette", async () => {
    const spacePick = vi.fn(async () => {});
    useAppStore.setState({ connection: "open", space: groups(true, [row(ADDED.id)]), spacePick });
    const { onPick, onClose } = renderPalette({ onAddPath: vi.fn(async () => ADDED) });
    add();
    fireEvent.click(await screen.findByTestId(`space-pick-cancel-${ADDED.id}`));
    expect(onClose).toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith(ADDED.id);
    expect(spacePick).not.toHaveBeenCalled();
  });

  test("signed out, or a folder already a project, the palette just closes", async () => {
    useAppStore.setState({ connection: "open", space: groups(false, [row(ADDED.id)]) });
    const first = renderPalette({ onAddPath: vi.fn(async () => ADDED) });
    add();
    await vi.waitFor(() => expect(first.onClose).toHaveBeenCalled());
    expect(first.onPick).toHaveBeenCalledWith(ADDED.id);
    expect(screen.queryByTestId(`space-picker-${ADDED.id}`)).toBeNull();
    cleanup();

    useAppStore.setState({ space: groups(true, [row(PROJECTS[0].id, { folder: "/tmp/alpha" })]) });
    const again = renderPalette();
    add("/tmp/alpha");
    await vi.waitFor(() => expect(again.onClose).toHaveBeenCalled());
    expect(again.onPick).toHaveBeenCalledWith(PROJECTS[0].id);
    expect(screen.queryByTestId(`space-picker-${PROJECTS[0].id}`)).toBeNull();
  });

  test("Create pairs as Add does: the picker stands in the palette once the Groups state reads the new repository", async () => {
    const realLoadSpace = useAppStore.getState().loadSpace;
    // The Groups state predates the creation: the new spex repository
    // lists only once the palette reads it again.
    const loadSpace = vi.fn(async () => useAppStore.setState({ space: groups(true, [row(ADDED.id)]) }));
    const spacePick = vi.fn(async () => {});
    useAppStore.setState({ connection: "open", space: groups(true, []), spacePick, loadSpace });
    try {
      const onCreatePath = vi.fn(async () => ADDED);
      const { onPick, onClose } = renderPalette({ onCreatePath });
      add("/tmp/gamma", "palette-create");
      await screen.findByTestId(`space-picker-${ADDED.id}`);
      expect(onCreatePath).toHaveBeenCalledWith("/tmp/gamma", true);
      expect(loadSpace).toHaveBeenCalled();
      expect(onPick).toHaveBeenCalledWith(ADDED.id);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByTestId("palette-path")).toBeNull();
      fireEvent.click(screen.getByTestId(`space-pick-cancel-${ADDED.id}`));
      expect(onClose).toHaveBeenCalled();
      expect(spacePick).not.toHaveBeenCalled();
    } finally {
      useAppStore.setState({ loadSpace: realLoadSpace });
    }
  });

  test("signed out, Create makes the project current and the palette just closes", async () => {
    useAppStore.setState({ connection: "open", space: groups(false, [row(ADDED.id)]) });
    const { onPick, onClose } = renderPalette({ onCreatePath: vi.fn(async () => ADDED) });
    add("/tmp/gamma", "palette-create");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPick).toHaveBeenCalledWith(ADDED.id);
    expect(screen.queryByTestId(`space-picker-${ADDED.id}`)).toBeNull();
  });
});
