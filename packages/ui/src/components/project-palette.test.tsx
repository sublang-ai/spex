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
  RepositoryState,
  SessionInfo,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";
import { NO_CAN, groupsState, instanceState, namespace, repositoryRow, type RowOver } from "../fixtures/groups-state.js";

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

describe("projects-1, space-58: a folder added while signed in asks for its group in place", () => {
  const ADDED: ProjectInfo = { id: "ada/gamma-spex", path: "/tmp/gamma", name: "gamma", registeredAt: 2, repository: { key: "ada/gamma-spex", name: "gamma-spex", group: "ada", own: true } };
  const HOST = "https://host.test";
  const SECOND = "https://second.test";
  const row = (key: string, extra: RowOver = {}) => repositoryRow(key, { folder: "/tmp/gamma", ...extra });
  const acme = (id: string) => ({ id, login: null, mine: false, fullPath: "acme", name: "acme", can: NO_CAN, placed: [], repositories: [] });
  /** An instance where ada may be signed in, listing her namespace and
   * acme. */
  const at = (origin: string, signedIn: boolean, id: string) =>
    instanceState(origin, {
      displayName: origin === HOST ? "Host" : "Second",
      account: { id: "1", login: "ada", displayName: null, canCreateGroup: false },
      signedIn,
      groups: [namespace("ada"), acme(id)],
    });
  /** Ada's home: signed in to the host where `account`, else listing no
   * instance; the added folder's clone under her own group. */
  const groups = (account: boolean, repositories: RepositoryState[]) =>
    groupsState({ defaultInstance: HOST, own: { name: "ada", named: !account, repositories }, instances: account ? [at(HOST, true, "20")] : [] });

  function add(path = "/tmp/gamma"): void {
    fireEvent.change(screen.getByTestId("palette-path"), { target: { value: path } });
    fireEvent.click(screen.getByTestId("palette-add"));
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
      expect(spacePick).toHaveBeenCalledWith(ADDED.id, { kind: "create", instance: HOST, groupId: "20", name: "gamma" }),
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
    expect(screen.queryByTestId(`space-picker-${ADDED.id}`)).toBeNull();
    cleanup();

    useAppStore.setState({ space: groups(true, [row(PROJECTS[0].id, { folder: "/tmp/alpha" })]) });
    const again = renderPalette();
    add("/tmp/alpha");
    await vi.waitFor(() => expect(again.onClose).toHaveBeenCalled());
    expect(again.onPick).toHaveBeenCalledWith(PROJECTS[0].id);
    expect(screen.queryByTestId(`space-picker-${PROJECTS[0].id}`)).toBeNull();
  });

  test("projects-17, projects-1, space-58: signed in to two instances each holding acme, the picker offers the acme of each and picking the second's creates there", async () => {
    const spacePick = vi.fn(async () => {});
    useAppStore.setState({
      connection: "open",
      space: groupsState({ defaultInstance: HOST, own: { name: "ada", named: false, repositories: [row(ADDED.id)] }, instances: [at(HOST, true, "20"), at(SECOND, true, "30")] }),
      spacePick,
    });
    const { onClose } = renderPalette({ onAddPath: vi.fn(async () => ADDED) });
    add();
    const picker = await screen.findByTestId(`space-picker-${ADDED.id}`);
    // Each instance under its display name, in the home's order, each
    // with its own acme (projects-1, space-58).
    const sections = within(picker).getAllByTestId(/^space-pick-instance-/);
    expect(sections.map((section) => section.dataset.testid)).toEqual([`space-pick-instance-${HOST}`, `space-pick-instance-${SECOND}`]);
    expect(sections.map((section) => within(section).getByRole("heading", { level: 3 }).textContent)).toEqual(["Host", "Second"]);
    // Your namespace reads "Only you", first (space-58, DR-159).
    for (const section of sections) {
      expect(within(section).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent)).toEqual(["Only you", "acme"]);
    }
    // Picking the second's acme creates there, by its id at the second.
    fireEvent.click(within(sections[1]!).getByTestId("space-pick-group-acme"));
    await vi.waitFor(() =>
      expect(spacePick).toHaveBeenCalledWith(ADDED.id, { kind: "create", instance: SECOND, groupId: "30", name: "gamma" }),
    );
    expect(spacePick).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("projects-1, space-58: signed in at any instance the picker stands in place; signed in nowhere the palette just closes", async () => {
    // Signed out of the default instance, signed in at a second one: the
    // folder asks for its group in place (projects-1, space-58).
    const two = (second: boolean) =>
      groupsState({ defaultInstance: HOST, own: { name: "ada", named: false, repositories: [row(ADDED.id)] }, instances: [at(HOST, false, "20"), at(SECOND, second, "30")] });
    useAppStore.setState({ connection: "open", space: two(true), spacePick: vi.fn(async () => {}) });
    const first = renderPalette({ onAddPath: vi.fn(async () => ADDED) });
    add();
    await screen.findByTestId(`space-picker-${ADDED.id}`);
    expect(first.onPick).toHaveBeenCalledWith(ADDED.id);
    expect(first.onClose).not.toHaveBeenCalled();
    cleanup();

    // Both listed, both signed out: nothing to pick at, so the palette
    // closes on the current project.
    useAppStore.setState({ space: two(false) });
    const again = renderPalette({ onAddPath: vi.fn(async () => ADDED) });
    add();
    await vi.waitFor(() => expect(again.onClose).toHaveBeenCalled());
    expect(again.onPick).toHaveBeenCalledWith(ADDED.id);
    expect(screen.queryByTestId(`space-picker-${ADDED.id}`)).toBeNull();
  });
});

describe("run-view-168: this computer's From your groups", () => {
  const SPEX = "https://spex.pub";
  const ABSENT = repositoryRow("@spex.pub/acme/gamma-spex", { instance: SPEX, governing: SPEX, id: "301", state: "absent", branch: null });
  const acme = (repositories: RepositoryState[]) => ({
    id: "7", login: null, mine: false, fullPath: "acme", name: "acme", can: NO_CAN, placed: [], repositories,
  });
  const signedIn = (repositories: RepositoryState[], signed = true) =>
    groupsState({ instances: [instanceState(SPEX, { signedIn: signed, groups: [namespace("me"), acme(repositories)] })] });
  const pristine = useAppStore.getState();
  afterEach(() => {
    useAppStore.setState({ space: pristine.space, connection: pristine.connection, spaceJoin: pristine.spaceJoin, loadSpace: pristine.loadSpace });
  });

  test("it stands only once this computer's groups read it signed in, and never in the add form", () => {
    useAppStore.setState({ connection: "open", space: undefined, loadSpace: vi.fn(async () => {}) });
    renderPalette();
    // Unread: nothing stands until the read says where it is signed in.
    expect(screen.queryByTestId("palette-groups-local")).toBeNull();
    expect(useAppStore.getState().loadSpace).toHaveBeenCalledOnce();
    cleanup();
    useAppStore.setState({ space: signedIn([ABSENT], false) });
    renderPalette();
    expect(screen.queryByTestId("palette-groups-local")).toBeNull();
    cleanup();
    // [run-view-168] signed in, with nothing this computer lacks.
    useAppStore.setState({ space: signedIn([]) });
    renderPalette();
    expect(screen.getByTestId("palette-groups-note-local").textContent).toBe("Nothing more to open from your groups");
    cleanup();
    // [projects-22] the add form keeps to adding a local project.
    useAppStore.setState({ space: signedIn([ABSENT]) });
    renderPalette({ addProjectOnly: true, onPickFolder: vi.fn(async () => null) });
    expect(screen.queryByTestId("palette-groups-local")).toBeNull();
  });

  test("the arrows reach its rows from the filter, and Enter on one asks its folder in place where no picker exists", async () => {
    const spaceJoin = vi.fn(async () => {});
    useAppStore.setState({ connection: "open", space: signedIn([ABSENT]), spaceJoin });
    renderPalette();
    const search = screen.getByTestId("palette-search");
    // Two projects, then the group's.
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const row = screen.getByTestId(`palette-join-${ABSENT.key}`);
    expect(row.className).toContain("bg-neutral-100");
    fireEvent.keyDown(search, { key: "Enter" });
    const field = screen.getByTestId(`palette-join-folder-${ABSENT.key}-path`);
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "/work/gamma" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await vi.waitFor(() => expect(spaceJoin).toHaveBeenCalledWith(SPEX, "301", "/work/gamma"));
  });

  test("opened at it, the first row takes focus over the add flow's folder action", async () => {
    const spaceJoin = vi.fn(async () => {});
    const onPickFolder = vi.fn(async () => "/work/gamma");
    useAppStore.setState({ connection: "open", space: signedIn([ABSENT]), spaceJoin });
    const { onClose } = renderPalette({ projects: [], sessions: [], groupsAt: "local", onPickFolder });
    const row = screen.getByTestId(`palette-join-${ABSENT.key}`);
    // [run-view-172] the palette opens at "From your groups".
    expect(document.activeElement).toBe(row);
    expect(row.className).toContain("bg-neutral-100");
    expect(screen.getByTestId("palette-academy").className).not.toContain("bg-neutral-100");
    fireEvent.click(row);
    await vi.waitFor(() => expect(spaceJoin).toHaveBeenCalledWith(SPEX, "301", "/work/gamma"));
    expect(onPickFolder).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
