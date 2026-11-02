// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Playbooks tab over a simulated document, through the
// real store against a stand-in client answering as the core does
// (DR-176): what runs in the project under two headings — the project's
// name and "Global" — a playbook both environments place listed once,
// under Global, a heading with no row left out (playbook-library-1);
// roles one player plays on one line, never badged (playbook-library-38);
// ✎ under the project's name editing the project's entry by the player
// alone, under Global overriding the global binding for the project,
// "Same as global" first, a dot on a role whose project player differs,
// and set back the entry leaving once no role differs
// (playbook-library-3, -4); a playbook whose command another takes
// standing aside (playbook-library-1); a project's written entry that
// fails listed with its failure and Remove (playbook-library-2); the
// review and delivery hints (playbook-library-48, -89); `from <package>
// <version>` on every row (playbook-library-29); the config gate
// (playbook-library-28, -31); the permanent stage row
// (playbook-library-22, -23, -45); and the example card
// (playbook-library-35). No row names a config or a scope, and none of
// the retired words stands (playbook-library-26).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  CommandResults,
  ConfigState,
  PlaybookAvailability,
} from "@sublang/spex-core/protocol";

import { PlaybooksTab } from "./PlaybooksTab.js";
import { activateLanguage } from "../i18n.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { SpexCommandError } from "../lib/client.js";
import {
  CONFIG_STATE,
  OWN_ENVIRONMENT,
  OWN_KEY,
  PROJECT,
  PROJECT_ENVIRONMENT,
  PROJECT_ID,
  READINESS,
  available,
  home,
} from "../fixtures/playbooks.js";

const commandMock = vi.fn();

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

/** `code`, placed by the global environment, its global entry binding
 * its coder and its reviewer — the reviewer with its own effort. */
const CODE_GLOBAL = available({
  id: "code",
  intent: "software development workflow",
  roles: ["coder", "reviewer"],
  entry: ["own"],
  bindings: {
    coder: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "own" },
    reviewer: { playerId: "dev.reviewer", effort: "max", display: "gpt-5.6-sol @ max", from: "own" },
  },
  written: {
    own: {
      coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
      reviewer: { playerId: "dev.reviewer", effort: "max", display: "gpt-5.6-sol @ max" },
    },
  },
});

/** `review`, a built-in no entry binds: its host on `dev.host`. */
const REVIEW_DEFAULT = available({ id: "review", intent: "review of committed phases", roles: ["host"] });

/** `triage`, placed by the project's environment alone, on its default
 * binding. */
const TRIAGE = available({
  id: "triage",
  intent: "sort incoming issues",
  roles: ["triager", "verifier"],
  package: "acme/triage",
  version: "1.2.3",
  source: "registry",
  repository: PROJECT_ID,
  placedBy: ["project"],
  folder: "/work/demo/.spex/packages/acme/triage/1.2.3/playbooks/triage",
});

let lists: CommandResults["environment.playbooks"];

function seed(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    projects: [PROJECT],
    currentProjectId: PROJECT_ID,
    space: home(),
    playbookLists: undefined,
    environments: {},
    environmentErrors: {},
    drafts: {},
    draftsLoaded: true,
    openDraftId: undefined,
    revealPlaybook: undefined,
    newPlaybookRequested: false,
    compileProgress: {},
    activeCompile: undefined,
    workspaceTabs: {},
    ...over,
  });
}

/** Render the project's tab, its lists answered as `next` says. */
async function renderTab(
  next: Partial<CommandResults["environment.playbooks"]> = {},
  over: Partial<ReturnType<typeof useAppStore.getState>> = {},
) {
  lists = { project: [TRIAGE], own: [CODE_GLOBAL, REVIEW_DEFAULT], ...next };
  seed(over);
  const view = render(<PlaybooksTab project={PROJECT} />);
  await vi.waitFor(() => expect(useAppStore.getState().playbookLists).toBeTruthy());
  return view;
}

/** A playbook's one card under `root` (playbook-library-1). */
function cardOf(id: string, root: ParentNode = document): HTMLElement {
  const cards = root.querySelectorAll<HTMLElement>(`[data-testid="playbook-card-${id}"]`);
  if (cards.length !== 1) throw new Error(`${cards.length} cards for ${id}`);
  return cards[0]!;
}

/** The line a role stands on (playbook-library-38). */
function lineOf(playbook: string, role: string): HTMLElement {
  const line = document.querySelector<HTMLElement>(`[data-testid^="role-line-${playbook}-"][data-roles~="${role}"]`);
  if (!line) throw new Error(`no line for ${playbook}.${role}`);
  return line;
}

/** A playbook of the global config, running, its single coder role. */
const configured = (id: string, over: Partial<PlaybookAvailability> = {}) =>
  available({
    id,
    intent: `${id} intent`,
    entry: ["own"],
    bindings: { coder: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "own" } },
    written: { own: { coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" } } },
    ...over,
  });

/** The player options a role's editor offers, by value. */
function choices(editor: HTMLElement): string[] {
  return [...within(editor).getByTestId("binding-player").querySelectorAll("option")].map(
    (option) => (option as HTMLOptionElement).value,
  );
}

beforeEach(() => {
  useAppStore.setState({ loadAgentOptions: async (adapter) => ({
    adapter, effortValues: adapter === "claude" ? ["high", "ultracode"] : adapter === "codex" ? ["high", "ultra"] : ["high"],
    fastModeSupported: adapter === "claude" || adapter === "codex", subagentModelSupported: adapter === "claude",
    subagentEffortValues: adapter === "claude" ? ["high"] : [],
    discovery: { status: "unavailable", reason: "Fixture" },
  }) });
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    switch (type) {
      case "environment.playbooks":
        return lists;
      case "environment.get":
        return params?.repository === PROJECT_ID ? PROJECT_ENVIRONMENT : OWN_ENVIRONMENT;
      case "config.edit":
        return CONFIG_STATE;
      case "draft.list":
        return [];
      case "playbook.artifacts":
        return { source: null, gears: null, fsm: null, stateIds: null, machine: null, missing: [] };
      default:
        return null;
    }
  });
  setClientForTests({ command: commandMock } as unknown as Parameters<typeof setClientForTests>[0]);
});

function edits(): unknown[] {
  return commandMock.mock.calls.filter(([type]) => type === "config.edit").map(([, params]) => params);
}

describe("playbook-library-1: what runs in the project, under the project's name and Global", () => {
  test("each playbook lists once under its heading, with its command, intent, package and roles, no switch and no package list", async () => {
    await renderTab({
      // The project's environment places code too: one playbook by one
      // id, listed once, under Global.
      project: [TRIAGE, { ...CODE_GLOBAL, repository: PROJECT_ID, placedBy: ["project", "own"] }],
      own: [{ ...CODE_GLOBAL, placedBy: ["project", "own"] }, REVIEW_DEFAULT],
    });
    const project = screen.getByTestId("playbooks-project");
    const global = screen.getByTestId("playbooks-global");
    expect(project.querySelector("h2")!.textContent).toBe("demo");
    expect(global.querySelector("h2")!.textContent).toBe("Global");
    // The project's heading stands first.
    expect(project.compareDocumentPosition(global) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cardOf("triage", project)).toBeTruthy();
    expect(project.querySelector('[data-testid="playbook-card-code"]')).toBeNull();
    expect(cardOf("code", global)).toBeTruthy();
    expect(cardOf("review", global)).toBeTruthy();

    // A row reads its command, `from <package> <version>` and its intent.
    const triage = cardOf("triage");
    expect(triage.textContent).toContain("/triage");
    expect(within(triage).getByTestId("playbook-from-triage").textContent).toBe("from acme/triage 1.2.3");
    expect(triage.textContent).toContain("sort incoming issues");
    // The built-in package's playbooks read as any other's (playbook-library-29).
    expect(within(cardOf("review")).getByTestId("playbook-from-review").textContent).toBe("from sublang/playbooks 17.4.1");
    // Its roles and the players they run on: the default dev.<role>.
    expect(within(lineOf("triage", "triager")).getByTestId("role-binding-triage-triager").title).toContain("dev.triager");
    expect(within(lineOf("review", "host")).getByTestId("role-binding-review-host").textContent).toBe("Hhost");

    // No switch, no package list, no registry account, no Add… — and
    // none of the retired words (playbook-library-26).
    const tab = screen.getByTestId("playbooks-tab");
    expect(within(tab).queryByRole("switch")).toBeNull();
    expect(within(tab).queryByTestId("add-open")).toBeNull();
    expect(within(tab).queryByTestId("environment-section")).toBeNull();
    for (const word of ["Enable", "Disable", "Enabled", "Available", "Personal", "built in", "in demo", "shared"]) {
      expect(tab.textContent).not.toContain(word);
    }
    // Every playbook a session there runs is read for this project.
    expect(commandMock).toHaveBeenCalledWith("environment.playbooks", { projectId: PROJECT_ID });
  });

  test("a heading with no row is left out; with neither, the list reads No playbooks yet", async () => {
    const view = await renderTab({ project: [] });
    expect(screen.queryByTestId("playbooks-project")).toBeNull();
    expect(screen.getByTestId("playbooks-global")).toBeTruthy();
    view.unmount();

    const second = await renderTab({ own: [] });
    expect(screen.getByTestId("playbooks-project")).toBeTruthy();
    expect(screen.queryByTestId("playbooks-global")).toBeNull();
    second.unmount();

    await renderTab({ project: [], own: [] });
    expect(screen.queryByTestId("playbooks-project")).toBeNull();
    expect(screen.queryByTestId("playbooks-global")).toBeNull();
    expect(screen.getByTestId("playbooks-empty").textContent).toBe("No playbooks yet");
  });

  test("a read for another project, or for the Playbooks surface, lists nothing here", async () => {
    seed({ playbookLists: { project: [TRIAGE], own: [CODE_GLOBAL], projectId: "other/project" } });
    lists = { project: [], own: [] };
    commandMock.mockImplementation(async () => new Promise(() => {}));
    render(<PlaybooksTab project={PROJECT} />);
    expect(screen.queryByTestId("playbook-card-triage")).toBeNull();
    act(() => useAppStore.setState({ playbookLists: { project: null, own: [CODE_GLOBAL], projectId: null } }));
    expect(screen.queryByTestId("playbook-card-code")).toBeNull();
  });

  test("one whose files are gone says so, its tooltip names its source and folder, and Manage packages opens the Packages tab", async () => {
    await renderTab({
      own: [
        CODE_GLOBAL,
        available({ id: "jot", package: "me/jot", version: "0.2.0", source: "path", folder: "/home/me/.spex/workspace/me/me-spex/spex-packages/me/jot", present: false }),
      ],
    });
    expect(within(cardOf("jot")).getByTestId("playbook-absent-jot").textContent).toBe("Its files are not on this computer");
    expect(within(cardOf("jot")).getByTestId("playbook-from-jot").textContent).toBe("from me/jot 0.2.0");
    expect(within(cardOf("jot")).getByTestId("playbook-from-jot").title).toBe(
      "From folder /home/me/.spex/workspace/me/me-spex/spex-packages/me/jot",
    );
    expect(within(cardOf("triage")).getByTestId("playbook-from-triage").title).toBe(
      "From the registry · /work/demo/.spex/packages/acme/triage/1.2.3/playbooks/triage",
    );
    fireEvent.click(screen.getByTestId("manage-packages"));
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe("packages");
  });

  test("a playbook whose command another package's takes stands aside, naming that package, in place of its roles", async () => {
    await renderTab({
      project: [
        available({ ...TRIAGE, id: "check", name: "check", command: "inspect", roles: ["checker"], bindings: {
          checker: { playerId: "dev.checker", display: "claude-opus-4-8 @ high", from: "default" },
        } }),
      ],
      own: [
        available({
          id: "inspect",
          roles: ["inspector"],
          runs: false,
          standsAside: { reason: "/inspect is acme/triage's", winner: "acme/triage" },
        }),
      ],
    });
    const inspect = cardOf("inspect");
    expect(within(inspect).getByTestId("playbook-aside-inspect").textContent).toBe("Stands aside · /inspect is acme/triage's");
    expect(within(inspect).queryByTestId("role-bind-inspect-inspector")).toBeNull();
    // The project's playbook that takes the command lists with its roles.
    expect(within(cardOf("check")).getByTestId("role-bind-check-checker")).toBeTruthy();
  });
});

describe("playbook-library-38: roles one player plays stand on one line", () => {
  test("two roles on one player read as one line, the player once, a ✎ per role, and no badge", async () => {
    await renderTab({
      own: [
        available({
          id: "decide",
          roles: ["host", "critic", "scribe"],
          entry: ["own"],
          bindings: {
            host: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "own" },
            critic: { playerId: "dev.reviewer", display: "gpt-5.6-sol", from: "own" },
            scribe: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "own" },
          },
        }),
      ],
    });
    const shared = lineOf("decide", "host");
    expect(shared).toBe(lineOf("decide", "scribe"));
    expect(shared.dataset.roles).toBe("host scribe");
    expect(shared.textContent).toMatch(/^host, scribe:/);
    // The player by its name and mark, its id beside what it runs in
    // the tooltip, and what that binding runs (run-view-177).
    const player = within(shared).getByTestId("role-binding-decide-host");
    expect(player.textContent).toBe("Ccoder");
    expect(player.title).toBe("dev.coder · claude-opus-5 @ high");
    expect(within(shared).getByLabelText("dev.coder: claude · claude-opus-5 @ high (ready)")).toBeTruthy();
    expect(within(shared).getByTestId("role-bind-decide-host")).toBeTruthy();
    expect(within(shared).getByTestId("role-bind-decide-scribe")).toBeTruthy();
    expect(lineOf("decide", "critic")).not.toBe(shared);
    // dev.coder plays code's coder and fix's too: no row badges it.
    expect(cardOf("decide").textContent).not.toContain("shared");
    expect(document.querySelector('[data-testid^="role-shared-"]')).toBeNull();
  });
});

describe("playbook-library-3/4: ✎ writes the project's config", () => {
  test("under the project's name ✎ offers the player alone, the first edit of a default writing the entry whole by name", async () => {
    await renderTab();
    fireEvent.click(screen.getByTestId("role-bind-triage-triager"));
    const editor = screen.getByTestId("binding-editor-triager");
    expect(within(editor).getByTestId("binding-tuning-note").textContent).toBe("Tuning lives in your players, in Settings");
    expect(within(editor).queryByTestId("binding-tuning-rows")).toBeNull();
    expect(within(editor).queryByTestId("binding-fast-mode")).toBeNull();
    // The roster, and no "Same as global" under the project's name.
    expect(choices(editor)).toEqual(["dev.coder", "dev.reviewer"]);
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.coder" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        {
          repository: PROJECT_ID,
          op: { kind: "playbook.add", playbookId: "triage", roles: { triager: "dev.coder", verifier: "dev.verifier" } },
        },
      ]),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("binding-editor-triager")).toBeNull());
  });

  test("under the project's name, with the project's entry written, ✎ rebinds the role by name alone", async () => {
    await renderTab({
      project: [
        {
          ...TRIAGE,
          entry: ["project"],
          bindings: {
            triager: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "project" },
            verifier: { playerId: "dev.reviewer", display: "gpt-5.6-sol", from: "project" },
          },
          written: {
            project: {
              triager: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
              verifier: { playerId: "dev.reviewer", display: "gpt-5.6-sol" },
            },
          },
        },
      ],
    });
    // No dot stands under the project's own heading.
    expect(document.querySelector('[data-testid^="role-override-dot-triage-"]')).toBeNull();
    fireEvent.click(screen.getByTestId("role-bind-triage-verifier"));
    const editor = screen.getByTestId("binding-editor-verifier");
    expect((within(editor).getByTestId("binding-player") as HTMLSelectElement).value).toBe("dev.reviewer");
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.coder" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        { op: { kind: "playbook.role.bind", playbookId: "triage", role: "verifier", playerId: "dev.coder" }, repository: PROJECT_ID },
      ]),
    );
  });

  test("[playbook-library-21] under Global ✎ overrides a role for the project, a dot marks it, and Same as global sets it back", async () => {
    await renderTab();
    // The global binding stands: "Same as global" first and chosen.
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    let editor = screen.getByTestId("binding-editor-coder");
    expect(choices(editor)).toEqual(["", "dev.coder", "dev.reviewer"]);
    expect(within(editor).getByTestId("binding-player").querySelector("option")!.textContent).toBe("Same as global");
    expect((within(editor).getByTestId("binding-player") as HTMLSelectElement).value).toBe("");
    expect(within(editor).getByTestId("binding-tuning-note")).toBeTruthy();
    expect(document.querySelector('[data-testid^="role-override-dot-"]')).toBeNull();

    // An override writes the project's entry whole: the chosen player
    // for coder, the global binding's for reviewer, each by name.
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.reviewer" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        {
          repository: PROJECT_ID,
          op: { kind: "playbook.add", playbookId: "code", roles: { coder: "dev.reviewer", reviewer: "dev.reviewer" } },
        },
      ]),
    );
    // The global config is never written from the tab.
    expect(edits().some((edit) => (edit as { repository?: string }).repository === OWN_KEY)).toBe(false);

    // Read again with the project's entry: the overridden role carries
    // a dot, the other none.
    const overridden: PlaybookAvailability = {
      ...CODE_GLOBAL,
      entry: ["project", "own"],
      bindings: {
        coder: { playerId: "dev.reviewer", display: "gpt-5.6-sol", from: "project" },
        reviewer: { playerId: "dev.reviewer", display: "gpt-5.6-sol", from: "project" },
      },
      written: {
        ...CODE_GLOBAL.written,
        project: {
          coder: { playerId: "dev.reviewer", display: "gpt-5.6-sol" },
          reviewer: { playerId: "dev.reviewer", display: "gpt-5.6-sol" },
        },
      },
    };
    lists = { project: [TRIAGE], own: [overridden, REVIEW_DEFAULT] };
    await act(async () => {
      await useAppStore.getState().loadPlaybookLists(PROJECT_ID);
    });
    expect(screen.getByTestId("role-override-dot-code-coder")).toBeTruthy();
    expect(screen.queryByTestId("role-override-dot-code-reviewer")).toBeNull();
    // One player now plays both roles: one line.
    expect(lineOf("code", "coder")).toBe(lineOf("code", "reviewer"));

    // Set back to "Same as global": no role then differs, and the
    // project's entry leaves.
    commandMock.mockClear();
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    editor = screen.getByTestId("binding-editor-coder");
    expect((within(editor).getByTestId("binding-player") as HTMLSelectElement).value).toBe("dev.reviewer");
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: PROJECT_ID, op: { kind: "playbook.delete", playbookId: "code" } }]),
    );
  });

  test("[playbook-library-21] a role set back while another still differs takes the global player again, the entry standing", async () => {
    await renderTab({
      own: [
        {
          ...CODE_GLOBAL,
          entry: ["project", "own"],
          bindings: {
            coder: { playerId: "dev.reviewer", display: "gpt-5.6-sol", from: "project" },
            reviewer: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "project" },
          },
          written: {
            ...CODE_GLOBAL.written,
            project: {
              coder: { playerId: "dev.reviewer", display: "gpt-5.6-sol" },
              reviewer: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
            },
          },
        },
      ],
    });
    expect(screen.getByTestId("role-override-dot-code-coder")).toBeTruthy();
    expect(screen.getByTestId("role-override-dot-code-reviewer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        { op: { kind: "playbook.role.bind", playbookId: "code", role: "coder", playerId: "dev.coder" }, repository: PROJECT_ID },
      ]),
    );
  });

  test("under Global a default-bound playbook's override names the default players for the other roles; Same as global with no entry writes nothing", async () => {
    await renderTab({
      own: [available({ id: "decide", roles: ["host", "critic"] })],
    });
    fireEvent.click(screen.getByTestId("role-bind-decide-host"));
    let editor = screen.getByTestId("binding-editor-host");
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() => expect(screen.queryByTestId("binding-editor-host")).toBeNull());
    expect(edits()).toEqual([]);

    fireEvent.click(screen.getByTestId("role-bind-decide-critic"));
    editor = screen.getByTestId("binding-editor-critic");
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.reviewer" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        { repository: PROJECT_ID, op: { kind: "playbook.add", playbookId: "decide", roles: { host: "dev.host", critic: "dev.reviewer" } } },
      ]),
    );
  });

  test("a refused write surfaces inline and keeps the editor open", async () => {
    await renderTab();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "config.edit") throw new Error("dev.ghost is not a player");
      return base(type, params);
    });
    fireEvent.click(screen.getByTestId("role-bind-triage-triager"));
    fireEvent.click(screen.getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("binding-editor-triager").textContent).toContain("dev.ghost is not a player"),
    );
  });

  test("the editor names the other playbooks a chosen player plays in", async () => {
    await renderTab();
    fireEvent.click(screen.getByTestId("role-bind-triage-triager"));
    const editor = screen.getByTestId("binding-editor-triager");
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.coder" } });
    // dev.coder plays code's coder and fix's: one conversation.
    expect(within(editor).getByTestId("binding-shared-note").textContent).toBe("Also plays in /code and /fix");
  });
});

describe("playbook-library-2: a project's written entry that fails lists with its failure and Remove", () => {
  test("a listed playbook carries its entry's failure, one no environment places lists on its own, and Remove deletes that entry alone", async () => {
    await renderTab({
      invalid: [
        { config: "project", playbook: "triage", reason: "role verifier is unresolved" },
        { config: "project", playbook: "ghost", reason: "no environment of the session places ghost" },
        // The global config's failures are the Playbooks surface's.
        { config: "own", playbook: "review", reason: "role host is unresolved" },
      ],
    });
    expect(within(cardOf("triage")).getByTestId("playbook-invalid-triage").textContent).toBe(
      "Invalid: role verifier is unresolved",
    );
    const ghost = cardOf("ghost", screen.getByTestId("playbooks-project"));
    expect(within(ghost).getByTestId("playbook-invalid-ghost").textContent).toBe(
      "Invalid: no environment of the session places ghost",
    );
    expect(screen.queryByTestId("playbook-invalid-review")).toBeNull();

    fireEvent.click(within(ghost).getByTestId("playbook-remove-ghost"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: PROJECT_ID, op: { kind: "playbook.delete", playbookId: "ghost" } }]),
    );
    fireEvent.click(within(cardOf("triage")).getByTestId("playbook-remove-triage"));
    await vi.waitFor(() =>
      expect(edits()).toContainEqual({ repository: PROJECT_ID, op: { kind: "playbook.delete", playbookId: "triage" } }),
    );
  });
});

describe("playbook-library-89/90: packaged work names its required review", () => {
  test.each(["en", "zh"] as const)("code and decide name their effective commands while no review runs, pointing at its row (%s)", async (language) => {
    activateLanguage(language);
    await renderTab({
      own: [
        configured("code", { command: "build" }),
        configured("decide", { command: "design" }),
        // Listed, but not running: it does not count.
        available({ id: "review", roles: ["host"], runs: false, standsAside: { reason: "its module is not on this device" } }),
      ],
    });
    expect(screen.getByTestId("review-required-hint-code").textContent).toBe(
      language === "zh" ? "/build 需要 /review 才能运行" : "/build needs /review to run",
    );
    expect(screen.getByTestId("review-required-hint-decide").textContent).toBe(
      language === "zh" ? "/design 需要 /review 才能运行" : "/design needs /review to run",
    );
    // Its /review points at review's row.
    const review = cardOf("review");
    review.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByTestId("review-required-show-code"));
    expect(review.scrollIntoView).toHaveBeenCalled();
    expect(edits()).toEqual([]);

    // The list read again with review running: the hints go.
    lists = {
      project: [],
      own: [configured("code", { command: "build" }), configured("decide", { command: "design" }), configured("review")],
    };
    await act(async () => {
      await useAppStore.getState().loadPlaybookLists(PROJECT_ID);
    });
    expect(screen.queryByTestId("review-required-hint-code")).toBeNull();
    expect(screen.queryByTestId("review-required-hint-decide")).toBeNull();
    expect(edits()).toEqual([]);
  });

  test("another spec package's same ids and unrelated built-ins receive no hint", async () => {
    await renderTab({
      project: [],
      own: [
        configured("code", { package: "acme/flows", source: "registry" }),
        configured("decide", { package: "acme/flows", source: "path" }),
        configured("inspect"),
      ],
    });
    expect(screen.queryByTestId("review-required-hint-code")).toBeNull();
    expect(screen.queryByTestId("review-required-hint-decide")).toBeNull();
    expect(screen.queryByTestId("review-required-hint-inspect")).toBeNull();
  });
});

describe("playbook-library-48/49: dev names the delivery built-ins it lacks", () => {
  test("dev without branch or pr carries the hint naming both", async () => {
    await renderTab({ project: [], own: [configured("dev", { intent: "plan a development request" })] });
    const hint = screen.getByTestId("dev-delivery-hint");
    expect(hint.textContent).toBe("Pull requests need /branch and /pr · /dev still runs");
    // A hint, not an invalid mark.
    expect(screen.queryByTestId("playbook-invalid-dev")).toBeNull();
  });

  test("dev with branch running in the project but not pr names only pr", async () => {
    await renderTab({
      own: [configured("dev")],
      project: [available({ id: "branch", repository: PROJECT_ID, placedBy: ["project"] })],
    });
    expect(screen.getByTestId("dev-delivery-hint").textContent).toBe("Pull requests need /pr · /dev still runs");
  });

  test("dev with both running carries no hint", async () => {
    await renderTab({ project: [], own: [configured("dev"), configured("branch"), configured("pr")] });
    expect(screen.queryByTestId("dev-delivery-hint")).toBeNull();
  });
});

describe("playbook-library-28/31: the config gate", () => {
  const invalid: ConfigState = { status: "invalid", path: "/tmp/config.yaml", errors: ["playbooks must be an object"] };

  test("an invalid own config replaces the tab with the gate, Settings a control where navigation is offered", async () => {
    const onNavigate = vi.fn();
    seed({ configState: invalid });
    render(<PlaybooksTab project={PROJECT} onNavigate={onNavigate} />);
    expect(screen.queryByText("The Captain can only run playbooks listed here.")).toBeNull();
    const settings = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settings);
    expect(onNavigate).toHaveBeenCalledWith("Settings");
    expect(screen.queryByTestId("playbooks-global")).toBeNull();
    expect(screen.queryByTestId("register-form")).toBeNull();
  });

  test("a missing config without navigation names Settings as plain text", () => {
    seed({ configState: { status: "missing", path: "/tmp/config.yaml" } });
    render(<PlaybooksTab project={PROJECT} />);
    expect(screen.getByText(/Playbooks need a valid config/).textContent).toBe(
      "Playbooks need a valid config — fix it in Settings.",
    );
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByTestId("playbooks-global")).toBeNull();
  });
});

/** The Gears artifact as the core serves it: the markdown plus the
 * parse the card draws as rows (playbook-library-24). */
const GEARS_ITEMS = {
  path: "specs/packages/code.md",
  key: "code",
  dir: "",
  basename: "code",
  title: "Coding Workflow",
  items: [
    {
      id: "CODE-1",
      group: "external",
      section: "Coder",
      firstLine: "The coder shall write the change.",
      text: "The coder shall write the change.",
      cites: [] as string[],
    },
    {
      id: "CODE-2",
      group: "external",
      section: "Coder",
      firstLine: "The reviewer shall read it.",
      text: "The reviewer shall read it [[CODE-1](code.md#CODE-1)]:\n\n- the review names the commit.",
      cites: ["CODE-1"],
    },
  ],
  notices: [] as string[],
};

const ARTIFACTS = {
  source: "# Code workflow\n\nThe coder writes.",
  gears:
    "### CODE-1\n\nThe coder shall write the change.\n\n### CODE-2\n\nThe reviewer shall read it.",
  gearsItems: GEARS_ITEMS,
  fsm: "import { setup } from 'xstate';",
  stateIds: ["idle", "coding"],
  machine: null,
  missing: [] as string[],
};

/** Answer playbook.artifacts with `load`, leaving the surface's other
 * commands on the default stub. */
function withArtifacts(load: () => Promise<unknown>): void {
  const base = commandMock.getMockImplementation()!;
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
    type === "playbook.artifacts" ? load() : base(type, params),
  );
}

function artifactCalls(): number {
  return commandMock.mock.calls.filter(
    ([type]) => type === "playbook.artifacts",
  ).length;
}

describe("playbook-library-22/23/45: a listed playbook wears its pipeline as a row", () => {
  test("a press opens a stage, a second closes it, another swaps — on one request for that environment's artifact", async () => {
    withArtifacts(async () => ARTIFACTS);
    await renderTab({ own: [CODE_GLOBAL] });
    const row = screen.getByTestId("stages-code");
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Source", "Gears", "State machine"]);
    // The row stands before anything is asked for: nothing loads and
    // no stage is open.
    expect(artifactCalls()).toBe(0);
    expect(screen.queryByTestId("pipeline-code")).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    expect(
      within(row).getByRole("button", { name: "Source" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // The first open asks, and says so until the answer lands.
    expect(commandMock).toHaveBeenCalledWith("playbook.artifacts", { playbookId: "code", repository: OWN_KEY });
    expect(artifactCalls()).toBe(1);
    expect(screen.getByTestId("pipeline-code").textContent).toContain("loading…");
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "The coder writes.",
      ),
    );

    // Another stage swaps to it; the code is what scrolls.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    const box = screen.getByTestId("pipeline-code");
    expect(box.textContent).not.toContain("The coder writes.");
    expect(box.textContent).toContain("xstate");

    // Pressing the open stage closes it, and reopening reuses what
    // arrived: one request for this card.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(screen.queryByTestId("pipeline-code")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    expect(screen.getByTestId("pipeline-code").textContent).toContain("CODE-1");
    expect(artifactCalls()).toBe(1);
  });

  test("the Gears stage stands as the outline's rows, collapsed", async () => {
    withArtifacts(async () => ARTIFACTS);
    await renderTab({ own: [CODE_GLOBAL] });
    const row = screen.getByTestId("stages-code");
    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("item-CODE-1")).toBeTruthy(),
    );

    // A row is the ID chip in its group colour and the first line,
    // under its section's heading — a Gears section outside the
    // package grammar heads by its own words — and the body waits
    // behind the toggle.
    expect(screen.getByTestId("section-CODE-1").textContent).toBe("Coder · 2");
    const second = screen.getByTestId("item-CODE-2");
    expect(second.textContent).toContain("CODE-2");
    expect(second.textContent).not.toContain("external");
    expect(second.textContent).toContain("The reviewer shall read it.");
    expect(second.textContent).not.toContain("the review names the commit");
    const toggle = screen.getByTestId("item-toggle-CODE-2");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Read-only: no Edit control and no copy chip on this surface.
    expect(screen.queryByTestId("item-edit-CODE-2")).toBeNull();
    expect(screen.queryByLabelText("Copy CODE-2")).toBeNull();

    // Expanding renders the body with its citations.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("item-CODE-2").textContent).toContain(
      "the review names the commit",
    );

    // A settled hover previews the cited item at hand, the same card
    // the outline raises.
    fireEvent.mouseEnter(screen.getByTestId("link-CODE-2-CODE-1"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("citation-preview").textContent).toContain(
        "The coder shall write the change.",
      ),
    );

    // A citation of a sibling lands on it inside the box: the target
    // expands and flashes, with no navigation away from the card.
    fireEvent.click(screen.getByTestId("link-CODE-2-CODE-1"));
    expect(screen.queryByTestId("citation-preview")).toBeNull();
    expect(
      screen.getByTestId("item-toggle-CODE-1").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByTestId("item-CODE-1").className).toContain("ring-2");
    expect(screen.getByTestId("stages-code")).toBeTruthy();
  });

  test("gears the parser could not read fall back to the markdown", async () => {
    withArtifacts(async () => ({ ...ARTIFACTS, gearsItems: undefined }));
    await renderTab({ own: [CODE_GLOBAL] });
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "Gears",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "The coder shall write the change.",
      ),
    );
    expect(screen.queryByTestId("item-CODE-1")).toBeNull();
  });

  test("the State machine's stage names its states", async () => {
    withArtifacts(async () => ARTIFACTS);
    await renderTab({ own: [CODE_GLOBAL] });
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "State machine",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("stage-states-code")).toBeTruthy(),
    );
    const states = screen.getByTestId("stage-states-code");
    expect(states.textContent).toContain("states");
    expect(states.textContent).toContain("idle");
    expect(states.textContent).toContain("coding");
  });

  test("a stage the load cannot locate is struck out, inactive, and named in the box", async () => {
    withArtifacts(async () => ({ ...ARTIFACTS, gears: null, missing: ["gears"] }));
    await renderTab({ own: [CODE_GLOBAL] });
    const row = screen.getByTestId("stages-code");
    const gears = () =>
      within(row).getByRole("button", { name: "Gears" }) as HTMLButtonElement;
    // Before the load the row knows of no absence and offers it.
    expect(gears().disabled).toBe(false);

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    await vi.waitFor(() => expect(gears().disabled).toBe(true));
    // Struck out as well as quiet: never colour alone (DR-010 §7).
    expect(gears().className).toContain("line-through");
    expect(gears().title).toBe("Gears not found beside this playbook's module");
    // The absence is named in the open stage, not on the card.
    expect(screen.getByTestId("pipeline-code").textContent).toContain(
      "missing stages: Gears",
    );
  });

  /** jsdom measures nothing, so the capped box is given its cap and
   * content taller than it — the state the grip stands in. */
  function sized(scrollHeight: number): () => void {
    const prior = (["clientHeight", "scrollHeight"] as const).map(
      (name) =>
        [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
    );
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return parseFloat(this.style.maxHeight) || 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.style.maxHeight ? scrollHeight : 0;
      },
    });
    return () => {
      for (const [name, descriptor] of prior) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLElement.prototype, name);
      }
      useAppStore.setState({ frameHeights: {} });
    };
  }

  test("the open stage's box is a frame the reader sets, one height for the card", async () => {
    const REM = 16;
    const restore = sized(1000);
    try {
      useAppStore.setState({ frameHeights: {} });
      withArtifacts(async () => ARTIFACTS);
      await renderTab({ own: [CODE_GLOBAL] });
      const row = screen.getByTestId("stages-code");
      fireEvent.click(within(row).getByRole("button", { name: "Source" }));
      await vi.waitFor(() =>
        expect(screen.getByTestId("pipeline-code").textContent).toContain(
          "The coder writes.",
        ),
      );
      const box = screen.getByTestId("stage-box-code");
      expect(box.style.maxHeight).toBe(`${24 * REM}px`);

      // The bottom edge is a control naming the stage it caps, and it
      // reports the height in the box's own unit (DR-010 §7).
      const grip = screen.getByTestId("stage-box-code-grip");
      expect(grip.getAttribute("role")).toBe("separator");
      expect(grip.getAttribute("aria-orientation")).toBe("horizontal");
      expect(grip.getAttribute("aria-label")).toBe("Resize the Source stage");
      expect(grip.getAttribute("aria-valuenow")).toBe("24");
      expect(grip.getAttribute("aria-valuemin")).toBe("8");
      expect(grip.getAttribute("aria-valuemax")).toBe("48");
      expect(grip.getAttribute("tabindex")).toBe("0");

      // Dragged, the edge follows the pointer a step at a time.
      fireEvent.pointerDown(grip, { clientY: 40 });
      fireEvent.pointerMove(grip, { clientY: 40 + 8 * REM });
      fireEvent.pointerUp(grip, { clientY: 40 + 8 * REM });
      expect(box.style.maxHeight).toBe(`${32 * REM}px`);

      // Arrow keys move it a step at a time; neither bound is passed.
      for (let nudge = 0; nudge < 60; nudge += 1) {
        fireEvent.keyDown(grip, { key: "ArrowDown" });
      }
      expect(box.style.maxHeight).toBe(`${48 * REM}px`);
      for (let nudge = 0; nudge < 60; nudge += 1) {
        fireEvent.keyDown(grip, { key: "ArrowUp" });
      }
      expect(box.style.maxHeight).toBe(`${8 * REM}px`);

      // A double-click restores the default.
      fireEvent.doubleClick(grip);
      expect(box.style.maxHeight).toBe(`${24 * REM}px`);

      // The height is remembered for the playbook, one height serving
      // its stages (DR-030).
      fireEvent.keyDown(grip, { key: "ArrowDown" });
      expect(useAppStore.getState().frameHeights["stage:code"]).toBe(25);
      fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
      expect(screen.getByTestId("stage-box-code").style.maxHeight).toBe(
        `${25 * REM}px`,
      );
      expect(
        screen.getByTestId("stage-box-code-grip").getAttribute("aria-label"),
      ).toBe("Resize the Gears stage");
    } finally {
      restore();
    }
  });

  test("a failed request leaves its message in the open stage", async () => {
    withArtifacts(async () => {
      throw new Error("no module beside /tmp/code");
    });
    await renderTab({ own: [CODE_GLOBAL] });
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "Source",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "no module beside /tmp/code",
      ),
    );
  });
});

describe("playbook-library-35: the example card", () => {
  test("the row stands on the card and opens all four in-memory stages", async () => {
    await renderTab();
    const card = screen.getByTestId("example-card");
    expect(card.textContent).toContain("Example: Two-Agent Change-and-Review Workflow");
    expect(card.textContent).toContain("from the slc demo");

    // The row is permanent — no toggle stands between card and stages.
    const row = within(card).getByTestId("example-stages");
    for (const label of ["Source", "Normalized", "Gears", "State machine"]) {
      expect(within(row).getByRole("button", { name: label })).toBeTruthy();
    }
    // Nothing is open until a stage is pressed.
    expect(
      within(row)
        .getAllByRole("button")
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
    expect(card.textContent).not.toContain(
      "handing them back to the first agent to judge",
    );

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    // The raw prose, pre-normalization.
    expect(card.textContent).toContain(
      "handing them back to the first agent to judge",
    );
    expect(
      within(row).getByRole("button", { name: "Source" }).getAttribute("aria-pressed"),
    ).toBe("true");

    // Another stage swaps; the label holds the budget, the title
    // carries the longer truth (DR-041).
    const normalized = within(row).getByRole("button", { name: "Normalized" });
    expect(normalized.title).toContain("Normalized text");
    fireEvent.click(normalized);
    expect(card.textContent).toContain("Use two agents, Coder and Reviewer");
    expect(card.textContent).not.toContain(
      "handing them back to the first agent to judge",
    );

    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    // Gears render as markdown: the item heading becomes an <h3>.
    expect(within(card).getByText("WORKFLOW-1").tagName).toBe("H3");

    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(card.textContent).toContain("from 'xstate'");

    // Pressing the open stage closes it.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(card.textContent).not.toContain("from 'xstate'");
  });

  test("the prefill waits for New playbook's Org and License", async () => {
    // No defaults read: the fields stand empty for the person to fill.
    await renderTab();
    const prefill = screen.getByTestId("example-prefill") as HTMLButtonElement;
    expect(prefill.disabled).toBe(true);
    expect(prefill.title).toBe("Org and License first");
  });
});

describe("DR-015: repeated Academy seeding opens the existing project", () => {
  test("a conflict on the default path selects the registered example", async () => {
    const academy = {
      id: "p-academy",
      path: "/Users/dev/spex-academy",
      name: "spex-academy",
      createdAt: 1,
    };
    commandMock.mockImplementation(async (type: string) => {
      if (type === "project.create") {
        // The words follow the home's language; the facts do not.
        throw new SpexCommandError("conflict", "已注册", { path: "/Users/dev/spex-academy" });
      }
      if (type === "project.list") return [academy];
      if (type === "specs.get") {
        return {
          present: false,
          legacy: false,
          files: [],
          decisions: [],
          intents: [],
          notices: [],
          readAt: 0,
        };
      }
      return {};
    });
    const project = await useAppStore.getState().openAcademyExample();
    expect(project.id).toBe("p-academy");
    expect(useAppStore.getState().currentProjectId).toBe("p-academy");
  });

  test("a non-conflict failure still rejects", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "project.create") {
        throw new Error("target directory exists and is not empty");
      }
      if (type === "project.list") return [];
      return {};
    });
    await expect(
      useAppStore.getState().openAcademyExample(),
    ).rejects.toThrow(/not empty/);
  });
});
