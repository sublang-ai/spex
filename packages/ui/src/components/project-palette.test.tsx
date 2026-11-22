// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-42 (amended by DR-011): the project palette is fully keyboard
// operable, carries per-project live state, and owns add/create.

import { afterEach, describe, expect, test, vi } from "vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

afterEach(cleanup);

import { ProjectPalette } from "./ProjectPalette.js";
import { SpexCommandError } from "../lib/client.js";
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
  { id: "me/alpha-spex", path: "/tmp/alpha", name: "alpha", registeredAt: 0, repository: { key: "me/alpha-spex", name: "alpha-spex" } },
  { id: "me/beta-spex", path: "/tmp/beta", name: "beta", registeredAt: 1, repository: { key: "me/beta-spex", name: "beta-spex" } },
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

  test.each([false, true])("header dismissal closes the palette and restores its opener (local add: %s)", (addProjectOnly) => {
    const onPick = vi.fn();
    const onAddPath = vi.fn(async () => PROJECTS[0]);
    const onCreatePath = vi.fn(async () => PROJECTS[1]);
    function PaletteHarness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open project picker</button>
        {open ? <ProjectPalette
          projects={PROJECTS}
          sessions={[]}
          attention={new Map()}
          addProjectOnly={addProjectOnly}
          onPick={onPick}
          onAddPath={onAddPath}
          onCreatePath={onCreatePath}
          onClose={() => setOpen(false)}
        /> : null}
      </>;
    }
    render(<PaletteHarness />);
    const opener = screen.getByRole("button", { name: "Open project picker" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByTestId("palette-path"), { target: { value: "/tmp/unsaved-project" } });
    const close = screen.getByRole("button", { name: /^Close$/ });
    expect(close.textContent).toBe("");
    expect(close.closest("header")).toBeTruthy();
    if (addProjectOnly) expect(within(close.closest("header")!).getByRole("heading", { name: "Add a local project" })).toBeTruthy();
    else expect(within(close.closest("header")!).getByRole("textbox", { name: "Filter projects" })).toBeTruthy();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onPick).not.toHaveBeenCalled();
    expect(onAddPath).not.toHaveBeenCalled();
    expect(onCreatePath).not.toHaveBeenCalled();
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

  test("welcome own-project entry focuses the path without repeating Academy", () => {
    renderPalette({ ...EMPTY, addProjectOnly: true });
    expect(document.activeElement).toBe(screen.getByTestId("palette-path"));
    expect(screen.queryByTestId("palette-academy")).toBeNull();
  });

  test("desktop own-project entry exposes a neutral folder button and hides manual path", async () => {
    useAppStore.setState({ space: undefined });
    const onPickFolder = vi.fn(async () => "/tmp/existing");
    const onAddPath = vi.fn(async () => PROJECTS[0]);
    const { onPick } = renderPalette({ ...EMPTY, addProjectOnly: true, onPickFolder, onAddPath });
    const folder = screen.getByTestId("palette-open-folder");
    expect(document.activeElement).toBe(folder);
    expect(folder.textContent).toContain("Choose a project folder");
    expect(folder.className).toContain("border-neutral-300");
    expect(folder.className).not.toContain("bg-brand-600");
    expect(screen.queryByTestId("palette-path")).toBeNull();
    expect(screen.queryByTestId("palette-manual-path-start")).toBeNull();
    expect(screen.queryByTestId("palette-create")).toBeNull();
    fireEvent.click(folder);
    await vi.waitFor(() => expect(onAddPath).toHaveBeenCalledWith("/tmp/existing"));
    expect(onPick).toHaveBeenCalledWith(PROJECTS[0].id);
  });

  test("desktop folder selection remains available while the new-project path is open", () => {
    renderPalette({ ...EMPTY, addProjectOnly: true, onPickFolder: vi.fn(async () => null) });
    fireEvent.click(screen.getByTestId("palette-create-start"));
    expect(screen.queryByTestId("palette-path")).toBeNull();
    expect(screen.getByText("New folder path")).toBeTruthy();
    expect(screen.getByText("Spex will create this folder and set up Git.")).toBeTruthy();
    expect(screen.queryByTestId("palette-create-back")).toBeNull();
    expect(screen.getByTestId("palette-open-folder")).toBeTruthy();
    expect(screen.queryByTestId("palette-manual-path-start")).toBeNull();
  });

  test("the desktop project switcher adds existing projects through its folder action", () => {
    renderPalette({ onPickFolder: vi.fn(async () => null) });
    expect(screen.getByTestId("palette-open-folder")).toBeTruthy();
    expect(screen.queryByTestId("palette-path")).toBeNull();
    expect(screen.queryByTestId("palette-add")).toBeNull();
    expect(screen.queryByTestId("palette-create")).toBeNull();
  });

  test("an empty desktop switcher starts at the folder action", () => {
    renderPalette({ ...EMPTY, onPickFolder: vi.fn(async () => null) });
    expect(document.activeElement).toBe(screen.getByTestId("palette-open-folder"));
    expect(screen.queryByTestId("palette-path")).toBeNull();
  });

  test("without a native picker, the existing path remains reachable above creation", () => {
    renderPalette({ ...EMPTY, addProjectOnly: true });
    fireEvent.click(screen.getByTestId("palette-create-start"));
    expect(screen.queryByTestId("palette-path")).toBeNull();
    fireEvent.click(screen.getByTestId("palette-manual-path-start"));
    expect(screen.queryByTestId("palette-new-path")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("palette-path"));
  });

  test("new project expands its own path and keeps existing-path Add separate", async () => {
    const onCreatePath = vi.fn(async () => PROJECTS[1]);
    renderPalette({ ...EMPTY, addProjectOnly: true, onCreatePath });
    fireEvent.click(screen.getByTestId("palette-create-start"));
    expect(document.activeElement).toBe(screen.getByTestId("palette-new-path"));
    fireEvent.change(screen.getByTestId("palette-new-path"), {
      target: { value: "/tmp/brand-new" },
    });
    fireEvent.click(screen.getByTestId("palette-create"));
    await vi.waitFor(() => expect(onCreatePath).toHaveBeenCalledWith("/tmp/brand-new", true));
  });

  test("sidebar add mode uses the same form when projects already exist", async () => {
    useAppStore.setState({ space: undefined });
    const onPickFolder = vi.fn(async () => "/tmp/existing");
    const onAddPath = vi.fn(async () => PROJECTS[0]);
    const { onPick } = renderPalette({ addProjectOnly: true, onPickFolder, onAddPath });
    expect(screen.getByRole("dialog", { name: "Add a project" })).toBeTruthy();
    expect(screen.queryByTestId("palette-search")).toBeNull();
    expect(screen.queryByTestId("palette-project-me/alpha-spex")).toBeNull();
    expect(screen.queryByTestId("palette-academy")).toBeNull();
    expect(screen.getByTestId("palette-create-start")).toBeTruthy();
    const folder = screen.getByTestId("palette-open-folder");
    expect(document.activeElement).toBe(folder);
    fireEvent.click(folder);
    await vi.waitFor(() => expect(onAddPath).toHaveBeenCalledWith("/tmp/existing"));
    expect(onPick).toHaveBeenCalledWith(PROJECTS[0].id);
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
    expect(add.title).toBe("Add this project");
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

describe("projects-35: a Create refusal shows Git's words beneath the app's", () => {
  const WORDS =
    "Git could not make the first commit: commit signing is on, but no key is configured. The generated files stay in the folder: finish the initial commit in your terminal, then use Add.";
  const GIT =
    "fatal: either user.signingkey or gpg.ssh.defaultKeyCommand needs to be configured";

  async function refuse(error: Error) {
    const onCreatePath = vi.fn(async (): Promise<never> => {
      throw error;
    });
    const { onPick, onClose } = renderPalette({ onCreatePath });
    fireEvent.change(screen.getByTestId("palette-path"), {
      target: { value: "/tmp/new-repo" },
    });
    fireEvent.click(screen.getByTestId("palette-create"));
    await vi.waitFor(() => expect(screen.getByTestId("palette-error")).toBeTruthy());
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    return screen.getByTestId("palette-error");
  }

  test("an output detail stands whole beneath the refusal's words", async () => {
    // The refusal as the client raises it from the core's reply
    // (projects-34): the words, and Git's output as its detail.
    const box = await refuse(new SpexCommandError("invalid_request", WORDS, { output: GIT }));
    const detail = screen.getByTestId("palette-error-detail");
    expect(box.contains(detail)).toBe(true);
    expect(box.firstChild?.textContent).toBe(WORDS);
    expect(detail.textContent).toBe(GIT);
    expect(
      box.firstChild!.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("a refusal with no detail shows its words alone", async () => {
    const box = await refuse(new SpexCommandError("invalid_request", "git init failed: denied"));
    expect(box.textContent).toBe("git init failed: denied");
    expect(screen.queryByTestId("palette-error-detail")).toBeNull();
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
