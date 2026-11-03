// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface over a simulated document, through the real
// store against a stand-in client answering as the core does
// (playbook-library-123 at unit level, DR-176): each spec package the
// global environment requests as the Packages tab's row reads it, the
// playbooks it places beneath it, under a header carrying the registry,
// the account there and one "Add…", and no project's playbook or name
// (playbook-library-122); the built-in package an ordinary row with
// "Update to <shipped>" and Remove, Publish on a path request alone
// (playbook-library-92, -113); ✎ writing the global entry with each
// role's tuning, the first edit of a default writing it whole
// (playbook-library-4, -39); an Add… landing in the global spex.yaml;
// the Authoring section holding the global environment's sessions
// alone, New playbook creating there (playbook-library-50, -51); a
// global entry that fails listed with Remove (playbook-library-2); and
// "No playbooks yet" above Add… once nothing is requested.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  CommandResults,
  DraftInfo,
  EnvironmentState,
  PlaybookAvailability,
  RegistryState,
} from "@sublang/spex-core/protocol";

import { PlaybooksSurface } from "./PlaybooksSurface.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import {
  CONFIG_STATE,
  OWN_ENVIRONMENT,
  OWN_KEY,
  PROJECT,
  PROJECT_ENVIRONMENT,
  PROJECT_ID,
  READINESS,
  available,
  environment,
  home,
  specPackage,
} from "../fixtures/playbooks.js";

const commandMock = vi.fn();
const REGISTRY = "https://spex.example";

/** The global environment: the built-in package at an older release
 * than the app ships, a registry package and a path one in your own
 * group's clone. */
const GLOBAL: EnvironmentState = environment({
  ...OWN_ENVIRONMENT,
  registry: { origin: REGISTRY, legacy: false },
  builtinUpdate: { locked: "17.4.1", shipped: "17.8.0" },
  requests: {
    ...OWN_ENVIRONMENT.requests,
    "acme/notes": { kind: "registry", version: "^0.2.0" },
    "me/jot": { kind: "path", path: "spex-packages/me/jot" },
  },
  packages: [
    ...OWN_ENVIRONMENT.packages,
    specPackage({
      name: "acme/notes",
      version: "0.2.0",
      artifacts: [{ id: "note", kind: "playbook", language: "en", fallback: false, provided: true }],
    }),
    specPackage({
      name: "me/jot",
      version: "0.1.0",
      source: { kind: "path", detail: "spex-packages/me/jot" },
      artifacts: [{ id: "jot", kind: "playbook", language: "en", fallback: false, provided: true }],
    }),
  ],
});

/** `code`, its global entry binding coder and reviewer. */
const CODE: PlaybookAvailability = available({
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

const REVIEW = available({ id: "review", intent: "review of committed phases", roles: ["host"] });
const NOTE = available({ id: "note", package: "acme/notes", version: "0.2.0", source: "registry", roles: ["scribe", "editor"] });
const JOT = available({ id: "jot", package: "me/jot", version: "0.1.0", source: "path", roles: ["writer"] });

let lists: CommandResults["environment.playbooks"];
let environments: Record<string, EnvironmentState>;

function account(signedIn: boolean): RegistryState {
  return {
    origin: REGISTRY,
    displayName: "Spex Example",
    account: signedIn ? { id: "registry", login: "me" } : null,
    signIn: { phase: "idle" },
    error: null,
  };
}

function draft(over: Partial<DraftInfo> & { id: string; projectId: string }): DraftInfo {
  return {
    instance: `00000000-0000-4000-8000-${over.id.padStart(12, "0").slice(-12)}`,
    createdAt: 1,
    touchedAt: 2,
    firstLine: null,
    activity: "idle",
    state: "draft",
    queued: [],
    player: null,
    agent: { adapter: "claude", model: "claude-opus-5" },
    ready: true,
    failures: 0,
    ...over,
  } as DraftInfo;
}

function seed(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    projects: [PROJECT],
    currentProjectId: PROJECT_ID,
    space: home(),
    registryAccounts: { [REGISTRY]: account(true) },
    playbookLists: undefined,
    environments: {},
    environmentErrors: {},
    workspaceTabs: {},
    drafts: {},
    draftsLoaded: true,
    openDraftId: undefined,
    revealPlaybook: undefined,
    newPlaybookRequested: false,
    ...over,
  });
}

async function renderSurface(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  seed(over);
  const view = render(<PlaybooksSurface />);
  await vi.waitFor(() => expect(useAppStore.getState().playbookLists?.projectId).toBeNull());
  await screen.findByTestId("env-package-sublang/playbooks");
  return view;
}

/** A playbook's one card on the page. */
function cardOf(id: string): HTMLElement {
  const cards = document.querySelectorAll<HTMLElement>(`[data-testid="playbook-card-${id}"]`);
  if (cards.length !== 1) throw new Error(`${cards.length} cards for ${id}`);
  return cards[0]!;
}

function edits(): unknown[] {
  return commandMock.mock.calls.filter(([type]) => type === "config.edit").map(([, params]) => params);
}

beforeEach(() => {
  useAppStore.setState({ loadAgentOptions: async (adapter) => ({
    adapter, effortValues: adapter === "claude" ? ["high", "ultracode"] : adapter === "codex" ? ["high", "ultra"] : ["high"],
    fastModeSupported: adapter === "claude" || adapter === "codex", subagentModelSupported: adapter === "claude",
    // The core lists a subagent's efforts less the orchestration value.
    subagentEffortValues: adapter === "claude" ? ["high"] : [],
    discovery: { status: "unavailable", reason: "Fixture" },
  }) });
  lists = { project: null, own: [CODE, REVIEW, NOTE, JOT] };
  environments = { [OWN_KEY]: GLOBAL, [PROJECT_ID]: PROJECT_ENVIRONMENT };
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    switch (type) {
      case "environment.playbooks":
        return lists;
      case "environment.get":
        return environments[String(params?.repository)];
      case "environment.search":
        return { packages: [{ name: "acme/tidy", description: null, versions: ["0.3.0"] }] };
      case "environment.request":
      case "environment.remove":
      case "environment.resolve":
      case "environment.install":
        return { accepted: true };
      case "registry.get":
        return account(true);
      case "config.edit":
        return CONFIG_STATE;
      case "draft.list":
        return Object.values(useAppStore.getState().drafts);
      case "draft.defaults":
        return { org: "me", license: "Apache-2.0" };
      case "draft.create":
        return draft({ id: String(params?.draftId), projectId: String(params?.projectId) });
      case "draft.open":
        return { draft: draft({ id: String(params?.draftId), projectId: String(params?.projectId) }), records: [], source: null };
      case "registry.orgs":
        return { orgs: [{ name: "me", path: "me" }] };
      case "space.get":
        return home();
      default:
        return null;
    }
  });
  setClientForTests({
    command: commandMock,
    subscribe: vi.fn(async () => null),
    unsubscribe: vi.fn(async () => null),
  } as unknown as Parameters<typeof setClientForTests>[0]);
});

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
});

describe("playbook-library-122: the global packages, each with the playbooks it places beneath it", () => {
  test("a header with the registry, the account there and one Add…, each package as the Packages tab reads it, its playbooks beneath, and no project", async () => {
    await renderSurface();
    const surface = screen.getByTestId("playbooks-surface");
    const header = within(screen.getByTestId("surface-packages"));
    expect(header.getByRole("heading", { level: 1 }).textContent).toBe("Playbooks");
    expect(header.getByTestId("registry-chooser").textContent).toBe("Registry: Spex Example");
    expect(header.getByTestId("registry-login").textContent).toBe("@me");
    expect(header.getAllByTestId("add-open")).toHaveLength(1);
    // The global environment is read and listed, for no project.
    expect(commandMock).toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
    expect(commandMock).toHaveBeenCalledWith("environment.playbooks", {});
    expect(commandMock).not.toHaveBeenCalledWith("environment.get", { repository: PROJECT_ID });

    // Each package's row reads its name, version, source and what it
    // provides; its playbooks stand beneath it.
    for (const [name, ids] of [
      ["sublang/playbooks", ["code", "review"]],
      ["acme/notes", ["note"]],
      ["me/jot", ["jot"]],
    ] as const) {
      const row = screen.getByTestId(`env-package-${name}`);
      const beneath = within(row).getByTestId(`surface-playbooks-${name}`);
      for (const id of ids) expect(beneath.contains(cardOf(id))).toBe(true);
    }
    expect(screen.getByTestId("env-version-sublang/playbooks").textContent).toBe("17.4.1");
    expect(screen.getByTestId("env-source-sublang/playbooks").title).toBe("Built in");
    expect(screen.getByTestId("env-provides-acme/notes").textContent).toBe("1 playbook");
    // A playbook card reads as a project's tab lists it.
    expect(within(cardOf("note")).getByTestId("playbook-from-note").textContent).toBe("from acme/notes 0.2.0");

    // No project's playbook, no project named, no project heading.
    expect(screen.queryByTestId("playbooks-project")).toBeNull();
    expect(screen.queryByTestId("playbooks-global")).toBeNull();
    expect(surface.textContent).not.toContain(PROJECT.name);
    expect(surface.textContent).not.toContain(OWN_KEY);
    expect(surface.textContent).not.toMatch(/Enable|Disable|Personal|built in/);
  });

  test("a read for a project's tab lists nothing here: its bindings are that project's", async () => {
    seed({ playbookLists: { project: [], own: [CODE], projectId: PROJECT_ID } });
    lists = { project: null, own: [] };
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.playbooks" ? new Promise(() => {}) : type === "environment.get" ? environments[String(params?.repository)] : null,
    );
    render(<PlaybooksSurface />);
    await screen.findByTestId("env-package-sublang/playbooks");
    expect(screen.queryByTestId("playbook-card-code")).toBeNull();
  });
});

describe("playbook-library-92/113: the built-in package is one row among the rest", () => {
  test("Update to the shipped release, Remove in its overflow; Publish on the path request alone", async () => {
    await renderSurface();
    const update = screen.getByTestId("env-update-sublang/playbooks");
    expect(update.textContent).toBe("Update to 17.8.0");
    fireEvent.click(update);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.resolve", { repository: OWN_KEY }));

    fireEvent.click(screen.getByTestId("env-more-sublang/playbooks"));
    expect(screen.getByTestId("env-remove-sublang/playbooks").title).toBe(
      "Removes sublang/playbooks from spex.yaml and uninstalls it",
    );
    expect(screen.queryByTestId("env-publish-sublang/playbooks")).toBeNull();
    fireEvent.click(screen.getByTestId("env-remove-sublang/playbooks"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.remove", { repository: OWN_KEY, name: "sublang/playbooks" }),
    );

    fireEvent.click(screen.getByTestId("env-more-me/jot"));
    expect(screen.getByTestId("env-publish-me/jot")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByTestId("env-more-acme/notes"));
    expect(screen.queryByTestId("env-publish-acme/notes")).toBeNull();
  });

  test("a local package opens publishing setup without needing its authoring session", async () => {
    const { ["me/jot"]: _former, ...requests } = GLOBAL.requests;
    environments[OWN_KEY] = {
      ...GLOBAL,
      requests: { ...requests, "local/jot": { kind: "path", path: "spex-packages/local/jot" } },
      packages: GLOBAL.packages.map((pkg) => pkg.name === "me/jot" ? {
        ...pkg, name: "local/jot", source: { kind: "path", detail: "spex-packages/local/jot" },
      } : pkg),
    };
    lists = { project: null, own: [CODE, REVIEW, NOTE, { ...JOT, package: "local/jot" }] };
    const original = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type, params, ...args) => type === "environment.publish" && params?.dryRun ? {
      accepted: true, preview: {
        instance: { origin: REGISTRY, name: "Spex Example" },
        name: "mine/jot", version: "0.1.0", license: "MIT", orgVerified: true, files: ["meta.yaml"],
      },
    } : original(type, params, ...args));
    await renderSurface();
    expect(screen.queryByTestId("draft-row-jot")).toBeNull();
    fireEvent.click(screen.getByTestId("env-more-local/jot"));
    fireEvent.click(screen.getByTestId("env-publish-local/jot"));
    await screen.findByRole("dialog", { name: "Publish package" });
    await vi.waitFor(() => expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe("Apache-2.0"));
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "mine" } });
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    fireEvent.click(screen.getByTestId("publish-review"));
    await screen.findByTestId("publish-summary");
    expect(commandMock).toHaveBeenCalledWith("environment.publish", {
      repository: OWN_KEY, name: "local/jot", publication: { org: "mine", license: "MIT" }, dryRun: true,
    }, { timeoutMs: 35_000 });
    fireEvent.click(screen.getByTestId("publish-cancel"));
    expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe("mine");
    fireEvent.click(screen.getByTestId("publish-close"));
    expect(screen.queryByRole("dialog", { name: "Publish package" })).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("env-more-local/jot")));
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toEqual([]);
  });

  test("a package added through Add… is requested in the global spex.yaml", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("add-open"));
    fireEvent.change(screen.getByTestId("registry-query"), { target: { value: "tidy" } });
    fireEvent.click(await screen.findByTestId("registry-add-acme/tidy"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: OWN_KEY,
        name: "acme/tidy",
        request: { kind: "registry", version: "^0.3.0" },
      }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("environment.request", expect.objectContaining({ repository: PROJECT_ID }));
  });

  test("with nothing requested, the surface reads No playbooks yet above Add…", async () => {
    environments[OWN_KEY] = environment({ repository: OWN_KEY, registry: { origin: REGISTRY, legacy: false } });
    lists = { project: null, own: [] };
    seed();
    render(<PlaybooksSurface />);
    const empty = await screen.findByTestId("playbooks-surface-empty");
    expect(empty.querySelector("p")!.textContent).toBe("No playbooks yet");
    const add = within(empty).getByTestId("add-open");
    expect(empty.querySelector("p")!.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("add-open")).toHaveLength(1);
  });
});

describe("playbook-library-4/39: ✎ writes the global entry, with each role's tuning", () => {
  test("rebinding offers exactly the roster and pins a role's own effort in the global config", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    await within(editor).findByText("Model list unavailable: Fixture");
    expect(
      [...within(editor).getByTestId("binding-player").querySelectorAll("option")].map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["dev.coder", "dev.reviewer"]);
    // The global entry carries tuning: no player-alone note, no
    // "Same as global".
    expect(within(editor).queryByTestId("binding-tuning-note")).toBeNull();
    fireEvent.change(within(editor).getByTestId("binding-effort-mode"), { target: { value: "pin" } });
    fireEvent.change(within(editor).getByTestId("binding-effort-value"), { target: { value: "ultracode" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        {
          op: { kind: "playbook.role.bind", playbookId: "code", role: "coder", playerId: "dev.coder", effort: "ultracode" },
          repository: OWN_KEY,
        },
      ]),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("binding-editor-coder")).toBeNull());
  });

  test("the subagent model and effort stand where the lane's adapter serves one, a standing Off stays clearable (DR-093, DR-095)", async () => {
    lists = {
      project: null,
      own: [
        {
          ...CODE,
          bindings: {
            ...CODE.bindings,
            coder: { playerId: "dev.coder", display: "claude-opus-5 @ high", subagentModel: false, subagentEffort: false, from: "own" },
          },
        },
      ],
    };
    await renderSurface();
    // A codex lane is offered neither.
    fireEvent.click(screen.getByTestId("role-bind-code-reviewer"));
    const reviewer = screen.getByTestId("binding-editor-reviewer");
    await within(reviewer).findByText("Model list unavailable: Fixture");
    expect(within(reviewer).queryByTestId("binding-subagent-model-mode")).toBeNull();
    fireEvent.keyDown(reviewer, { key: "Escape" });

    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    await within(editor).findByText("Model list unavailable: Fixture");
    const rows = within(editor).getByTestId("binding-tuning-rows");
    expect([...rows.querySelectorAll("select[data-testid$='-mode']")].map((select) => select.getAttribute("data-testid"))).toEqual([
      "binding-model-mode", "binding-effort-mode", "binding-subagent-model-mode", "binding-subagent-effort-mode",
    ]);
    const mode = within(editor).getByTestId("binding-subagent-model-mode") as HTMLSelectElement;
    expect(mode.value).toBe("provider");
    expect([...mode.options].map((option) => option.textContent)).toEqual([
      "inherit the player (Same as agent)", "Off", "pin a value…",
    ]);
    fireEvent.change(mode, { target: { value: "inherit" } });
    expect([...mode.options].map((option) => option.textContent)).toEqual([
      "inherit the player (Same as agent)", "pin a value…",
    ]);
    const effort = within(editor).getByTestId("binding-subagent-effort-mode") as HTMLSelectElement;
    fireEvent.change(effort, { target: { value: "pin" } });
    const pinned = within(editor).getByTestId("binding-subagent-effort-value") as HTMLSelectElement;
    // A pin lists the adapter's subagent efforts, never its orchestration one.
    expect([...pinned.options].map((option) => option.value)).toEqual(["", "high"]);
    fireEvent.change(pinned, { target: { value: "high" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        {
          op: expect.objectContaining({ kind: "playbook.role.bind", role: "coder", subagentModel: null, subagentEffort: "high" }),
          repository: OWN_KEY,
        },
      ]),
    );
  });

  test("Save with nothing changed and no entry writes nothing", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("role-bind-note-editor"));
    const editor = screen.getByTestId("binding-editor-editor");
    await within(editor).findByText("Model list unavailable: Fixture");
    expect((within(editor).getByTestId("binding-player") as HTMLSelectElement).value).toBe("dev.editor");
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() => expect(screen.queryByTestId("binding-editor-editor")).toBeNull());
    expect(edits()).toEqual([]);
  });

  test("the first edit of a playbook on its default binding writes its entry whole, then the role's tuning", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("role-bind-note-editor"));
    const editor = screen.getByTestId("binding-editor-editor");
    await within(editor).findByText("Model list unavailable: Fixture");
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.reviewer" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        {
          repository: OWN_KEY,
          op: { kind: "playbook.add", playbookId: "note", roles: { scribe: "dev.scribe", editor: "dev.reviewer" } },
        },
      ]),
    );

    commandMock.mockClear();
    fireEvent.click(screen.getByTestId("role-bind-jot-writer"));
    const writer = screen.getByTestId("binding-editor-writer");
    await within(writer).findByText("Model list unavailable: Fixture");
    fireEvent.change(within(writer).getByTestId("binding-player"), { target: { value: "dev.coder" } });
    fireEvent.change(within(writer).getByTestId("binding-effort-mode"), { target: { value: "pin" } });
    fireEvent.change(within(writer).getByTestId("binding-effort-value"), { target: { value: "high" } });
    fireEvent.click(within(writer).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        { repository: OWN_KEY, op: { kind: "playbook.add", playbookId: "jot", roles: { writer: "dev.coder" } } },
        { op: { kind: "playbook.role.bind", playbookId: "jot", role: "writer", playerId: "dev.coder", effort: "high" }, repository: OWN_KEY },
      ]),
    );
  });

  test("the editor names the other playbooks a player plays in, and a refusal stands inline with the editor open", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("role-bind-code-reviewer"));
    const editor = screen.getByTestId("binding-editor-reviewer");
    expect(within(editor).queryByTestId("binding-shared-note")).toBeNull();
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.coder" } });
    expect(within(editor).getByTestId("binding-shared-note").textContent).toBe("Also plays in /fix");
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "config.edit") throw new Error("runs roles coder, reviewer concurrently");
      return base(type, params);
    });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("binding-editor-reviewer").textContent).toContain("runs roles coder, reviewer concurrently"),
    );
  });
});

describe("playbook-library-2: a global entry that fails lists with its failure and Remove", () => {
  test("on its row, or on a row of its own, Remove deleting it from the global config", async () => {
    lists = {
      project: null,
      own: [CODE, REVIEW, NOTE, JOT],
      invalid: [
        { config: "own", playbook: "note", reason: "role editor is unresolved" },
        { config: "own", playbook: "ghost", reason: "no environment places ghost" },
      ],
    };
    await renderSurface();
    expect(within(cardOf("note")).getByTestId("playbook-invalid-note").textContent).toBe("Invalid: role editor is unresolved");
    const ghost = cardOf("ghost");
    fireEvent.click(within(ghost).getByTestId("playbook-remove-ghost"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "ghost" } }]),
    );
  });
});

describe("playbook-library-50/51: authoring in the global environment", () => {
  test("the Authoring section lists the global environment's sessions alone, and New playbook creates there", async () => {
    await renderSurface({
      drafts: {
        mine: draft({ id: "mine", projectId: OWN_KEY }),
        theirs: draft({ id: "theirs", projectId: PROJECT_ID }),
      },
    });
    const section = screen.getByTestId("drafts-section");
    expect(within(section).getByTestId("draft-row-mine")).toBeTruthy();
    expect(within(section).queryByTestId("draft-row-theirs")).toBeNull();

    // Creating a global playbook does not ask for publication details.
    expect(commandMock).not.toHaveBeenCalledWith("draft.defaults", expect.anything());
    expect(commandMock).not.toHaveBeenCalledWith("registry.orgs", expect.anything(), expect.anything());
    fireEvent.change(screen.getByTestId("new-playbook-id"), { target: { value: "sweep" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("new-playbook-button"));
    });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: OWN_KEY, draftId: "sweep" }),
    );
    // Its workspace opens in the surface's place.
    expect(await screen.findByTestId("authoring-workspace")).toBeTruthy();
    expect(screen.queryByTestId("surface-packages")).toBeNull();
  });
});
