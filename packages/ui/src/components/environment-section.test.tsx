// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// playbook-library-94 over a simulated document: the Playbooks surface
// rendering a project's environment and your own group's through the
// real store, against a stand-in client answering as the core does —
// each side's spec packages with versions, sources, artifacts with
// languages and fallback marks, and installed state; the playbooks of
// both environments once per origin with where each is enabled; Add
// from registry, from a folder and from Git; Resolve again while the
// lock is stale; Remove behind Remove or Keep; and every control
// waiting while that spex repository syncs, naming the sync
// (playbook-library-1, playbook-library-92).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CommandResults, EnvironmentState } from "@sublang/spex-core/protocol";

import { LibrarySurface } from "./LibrarySurface.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";
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
} from "../fixtures/playbooks.js";

const commandMock = vi.fn();

const LISTS: CommandResults["environment.playbooks"] = {
  project: [
    available({
      id: "triage",
      package: "acme/triage",
      version: "1.2.3",
      source: "registry",
      repository: PROJECT_ID,
      roles: ["triager"],
      enabled: ["project"],
      bindings: { project: { triager: { playerId: "dev.coder", display: "claude-opus-5 @ high" } } },
    }),
    available({ id: "code", repository: PROJECT_ID, roles: ["coder", "reviewer"] }),
    available({ id: "review", repository: PROJECT_ID, roles: ["host"], enabled: ["own"] }),
  ],
  own: [
    available({ id: "code", roles: ["coder", "reviewer"] }),
    available({
      id: "review",
      roles: ["host"],
      enabled: ["own"],
      bindings: { own: { host: { playerId: "dev.reviewer", display: "gpt-5.6-sol" } } },
    }),
  ],
};

let environments: Record<string, EnvironmentState>;

function seed(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    projects: [PROJECT],
    currentProjectId: PROJECT_ID,
    space: home(),
    playbooksSide: "project",
    playbookLists: undefined,
    environments: {},
    environmentErrors: {},
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
  const view = render(<LibrarySurface />);
  await screen.findByTestId("playbook-card-triage");
  await screen.findByTestId("env-package-acme/triage");
  return view;
}

beforeEach(() => {
  environments = { [PROJECT_ID]: PROJECT_ENVIRONMENT, [OWN_KEY]: OWN_ENVIRONMENT };
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    switch (type) {
      case "environment.playbooks":
        return LISTS;
      case "environment.get":
        return environments[String(params?.repository)];
      case "environment.search":
        return {
          packages: [
            { name: "acme/triage", description: "Sort issues into labels", versions: ["1.2.3", "1.2.0"] },
            { name: "acme/tidy", description: null, versions: ["0.3.0"] },
          ],
        };
      case "environment.request":
      case "environment.remove":
      case "environment.resolve":
      case "environment.install":
        return { accepted: true };
      case "draft.list":
        return [];
      case "space.get":
        return home();
      case "config.edit":
        return CONFIG_STATE;
      case "playbook.artifacts":
        return { source: null, gears: null, fsm: null, stateIds: null, machine: null, missing: [] };
      default:
        return null;
    }
  });
  setClientForTests({ command: commandMock } as unknown as Parameters<typeof setClientForTests>[0]);
});

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
});

describe("playbook-library-94: each side's environment", () => {
  test("lists its spec packages with versions, sources, artifacts, languages, fallback marks and installed state", async () => {
    await renderSurface();
    const section = screen.getByTestId("environment-section");
    // The word stands as the section's heading, with the repository.
    expect(within(section).getByRole("heading").textContent).toBe("Environment");
    expect(section.textContent).toContain(PROJECT_ID);

    // [playbook-library-92] a requested package: its source and its
    // resolved version, its artifacts with their languages.
    const triage = screen.getByTestId("env-package-acme/triage");
    expect(screen.getByTestId("env-version-acme/triage").textContent).toBe("1.2.3");
    expect(screen.getByTestId("env-source-acme/triage").textContent).toBe("registry ^1.2.0");
    expect(within(triage).getByTestId("env-artifact-acme/triage-triage").textContent).toContain("zh-Hans");
    expect(within(triage).queryByTestId("env-fallback-acme/triage-triage")).toBeNull();
    // An artifact the wanted language was missing for wears the mark.
    const fallback = within(triage).getByTestId("env-fallback-acme/triage-triage-spec");
    expect(fallback.textContent).toBe("fallback");
    expect(fallback.title).toBe("No zh-Hans text; the original stands");
    expect(screen.getByTestId("env-installed-acme/triage").textContent).toBe("Installed");

    // [playbook-library-92] a required package stands under the one
    // that required it, saying so, with its own installed state.
    const labels = screen.getByTestId("env-package-acme/labels");
    expect(labels.style.marginInlineStart).toBe("1.25rem");
    expect(
      triage.compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("env-source-acme/labels").textContent).toBe("registry, required by acme/triage");
    expect(screen.getByTestId("env-installed-acme/labels").textContent).toBe("Not installed");
    // Only a direct request can be removed.
    expect(screen.queryByTestId("env-remove-acme/labels")).toBeNull();

    // [playbook-library-92] a path source this device lacks says so.
    expect(screen.getByTestId("env-missing-acme/local-tools").textContent).toBe(
      "Missing on this device: spex-packages/local-tools",
    );
    expect(screen.getByTestId("env-source-acme/local-tools").textContent).toBe("path spex-packages/local-tools");

    // [playbook-library-92] files missing: Install is offered.
    fireEvent.click(screen.getByTestId("environment-install"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }),
    );
    // A current lock offers no Resolve again.
    expect(screen.queryByTestId("environment-resolve")).toBeNull();

    // Your own group's side shows its own environment.
    fireEvent.click(screen.getByTestId("side-own"));
    await screen.findByTestId("env-package-sublang/playbooks");
    expect(screen.getByTestId("environment-section").textContent).toContain(OWN_KEY);
    expect(screen.queryByTestId("env-package-acme/triage")).toBeNull();
    expect(screen.getByTestId("env-source-sublang/playbooks").textContent).toBe("registry ^17.4.1");
    expect(commandMock).toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
  });

  test("the playbooks of both environments list once per origin, each reading where it is enabled", async () => {
    await renderSurface();
    // [playbook-library-1] the project's side: what its environment
    // exports, with where each is enabled.
    expect(screen.getAllByTestId("playbook-card-code")).toHaveLength(1);
    expect(screen.getByTestId("playbook-enabled-triage").textContent).toBe("Enabled in the project");
    expect(screen.getByTestId("playbook-enabled-code").textContent).toBe("Not enabled");
    expect(screen.getByTestId("playbook-enabled-review").textContent).toBe("Enabled in your own group");
    // Enabled here first; the rest below with Enable.
    expect(within(screen.getByTestId("playbooks-enabled")).getByTestId("playbook-card-triage")).toBeTruthy();
    expect(within(screen.getByTestId("playbooks-available")).getByTestId("playbook-card-code")).toBeTruthy();
    expect(within(screen.getByTestId("playbooks-available")).getByTestId("playbook-card-review")).toBeTruthy();
    // [playbook-library-29] the spec package and version, with the
    // muted prefix outside the truncation.
    expect(screen.getByTestId("playbook-from-triage").textContent).toBe("fromacme/triage 1.2.3");
    expect(screen.getByTestId("playbook-from-code").textContent).toBe("fromsublang/playbooks 17.4.1");
    // [playbook-library-1] the role's player and what it runs.
    expect(screen.getByTestId("role-binding-triage-triager").textContent).toBe("dev.coder");

    // [playbook-library-1] your own group's side lists its own export
    // of the same playbooks, once each.
    fireEvent.click(screen.getByTestId("side-own"));
    expect(screen.getByTestId("side-own").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("playbook-card-triage")).toBeNull();
    expect(screen.getAllByTestId("playbook-card-code")).toHaveLength(1);
    expect(screen.getAllByTestId("playbook-card-review")).toHaveLength(1);
    expect(screen.getByTestId("playbook-enabled-review").textContent).toBe("Enabled in your own group");
    expect(within(screen.getByTestId("playbooks-enabled")).getByTestId("playbook-card-review")).toBeTruthy();
    expect(screen.getByTestId("role-binding-review-host").textContent).toBe("dev.reviewer");
  });

  test("with no project chosen, your own group's side alone stands", async () => {
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.playbooks"
        ? { project: null, own: LISTS.own }
        : type === "environment.get"
          ? environments[String(params?.repository)]
          : type === "draft.list"
            ? []
            : null,
    );
    seed({ projects: [], currentProjectId: undefined });
    render(<LibrarySurface />);
    await screen.findByTestId("env-package-sublang/playbooks");
    expect(screen.queryByTestId("playbooks-switch")).toBeNull();
    expect(screen.getByTestId("playbook-card-review")).toBeTruthy();
    expect(commandMock).toHaveBeenCalledWith("environment.playbooks", {});
  });
});

describe("playbook-library-94: the environment's controls", () => {
  test("Add from registry searches the registry and requests the chosen version at a caret", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("add-from-registry"));
    expect(screen.getByTestId("add-from-registry").getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByTestId("registry-query"), { target: { value: "tri" } });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.search", { query: "tri" }),
    );
    const result = await screen.findByTestId("registry-result-acme/triage");
    expect(result.textContent).toContain("Sort issues into labels");
    const versions = within(result).getByTestId("registry-version-acme/triage") as HTMLSelectElement;
    expect([...versions.options].map((option) => option.value)).toEqual(["1.2.3", "1.2.0"]);
    fireEvent.change(versions, { target: { value: "1.2.0" } });
    fireEvent.click(within(result).getByTestId("registry-add-acme/triage"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: PROJECT_ID,
        name: "acme/triage",
        request: { kind: "registry", version: "^1.2.0" },
      }),
    );
    expect((await screen.findByTestId("add-note")).textContent).toBe("Requested acme/triage");
  });

  test("a request the core refuses shows its cause in place", async () => {
    await renderSurface();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request") throw new Error("acme/tidy has no release meeting ^0.3.0");
      return base(type, params);
    });
    fireEvent.click(screen.getByTestId("add-from-registry"));
    fireEvent.change(screen.getByTestId("registry-query"), { target: { value: "tidy" } });
    const result = await screen.findByTestId("registry-result-acme/tidy");
    fireEvent.click(within(result).getByTestId("registry-add-acme/tidy"));
    expect((await screen.findByTestId("registry-add-error-acme/tidy")).textContent).toBe(
      "acme/tidy has no release meeting ^0.3.0",
    );
  });

  test("Add from folder and Add from Git request by path and by repository and rev; a bad name is refused before anything is sent", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("add-from-folder"));
    expect(screen.getByTestId("folder-request").textContent).toContain(`Folder inside ${PROJECT.path}`);
    fireEvent.change(screen.getByTestId("folder-request-name"), { target: { value: "Acme/Tools" } });
    fireEvent.change(screen.getByTestId("folder-request-path"), { target: { value: "spex-packages/tools" } });
    fireEvent.click(screen.getByTestId("folder-request-submit"));
    expect((await screen.findByTestId("folder-request-error")).textContent).toContain("org/name");
    expect(commandMock).not.toHaveBeenCalledWith("environment.request", expect.anything());
    fireEvent.change(screen.getByTestId("folder-request-name"), { target: { value: "acme/tools" } });
    fireEvent.click(screen.getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: PROJECT_ID,
        name: "acme/tools",
        request: { kind: "path", path: "spex-packages/tools" },
      }),
    );

    fireEvent.click(screen.getByTestId("add-from-git"));
    fireEvent.change(screen.getByTestId("git-request-name"), { target: { value: "acme/flows" } });
    fireEvent.change(screen.getByTestId("git-request-url"), { target: { value: "https://github.com/acme/flows.git" } });
    fireEvent.change(screen.getByTestId("git-request-rev"), { target: { value: "v0.2.0" } });
    fireEvent.click(screen.getByTestId("git-request-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: PROJECT_ID,
        name: "acme/flows",
        request: { kind: "git", git: "https://github.com/acme/flows.git", rev: "v0.2.0" },
      }),
    );
  });

  test("a stale lock reads its phrase with Resolve again, and a conflict names the requirements", async () => {
    environments[PROJECT_ID] = { ...PROJECT_ENVIRONMENT, stale: ["spex.yaml changed"] };
    await renderSurface();
    const stale = screen.getByTestId("environment-stale");
    expect(stale.textContent).toBe("Requests changed; resolve again to install");
    expect(stale.title).toBe("spex.yaml changed");
    fireEvent.click(screen.getByTestId("environment-resolve"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.resolve", { repository: PROJECT_ID }),
    );

    // The state the core broadcasts replaces the last wholesale: the
    // lock is current again, and a conflict now stands.
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: {
          ...PROJECT_ENVIRONMENT,
          conflicts: [
            {
              name: "acme/labels",
              requirements: [
                { by: "acme/triage", requirement: "^0.4.0" },
                { by: "acme/local-tools", requirement: "^1.0.0" },
              ],
            },
          ],
        },
      });
    });
    expect(screen.queryByTestId("environment-stale")).toBeNull();
    expect(screen.getByTestId("environment-conflicts").textContent).toContain(
      "acme/labels — ^0.4.0 by acme/triage; ^1.0.0 by acme/local-tools",
    );
    expect(screen.getByTestId("environment-resolve")).toBeTruthy();
  });

  test("Remove asks Remove or Keep; Keep writes nothing", async () => {
    await renderSurface();
    fireEvent.click(screen.getByTestId("env-remove-acme/triage"));
    const row = screen.getByTestId("env-package-acme/triage");
    expect(row.textContent).toContain("Remove acme/triage?");
    const keep = within(row).getByRole("button", { name: "Keep" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(commandMock).not.toHaveBeenCalledWith("environment.remove", expect.anything());
    fireEvent.click(screen.getByTestId("env-remove-acme/triage"));
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.remove", { repository: PROJECT_ID, name: "acme/triage" }),
    );
  });

  test("every control stays available while that spex repository syncs: the sync refuses nothing", async () => {
    await renderSurface({ space: home({ syncing: PROJECT_ID }) });
    expect(screen.queryByTestId("environment-progress")).toBeNull();
    const controls = [
      "env-remove-acme/triage",
      "env-remove-acme/local-tools",
      "environment-install",
      "add-from-registry",
      "add-from-folder",
      "add-from-git",
    ].map((id) => screen.getByTestId(id) as HTMLButtonElement);
    for (const control of controls) {
      expect(control.disabled, control.dataset.testid).toBe(false);
      expect(control.title, control.dataset.testid).not.toMatch(/sync/i);
    }
    // An act during the sync reaches the core, which answers it as any.
    fireEvent.click(screen.getByTestId("environment-install"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }));
  });

  test("the core's work on an environment reads in place as progress, holding no control; a failure shows its cause", async () => {
    environments[PROJECT_ID] = { ...PROJECT_ENVIRONMENT, busy: "installing" };
    await renderSurface();
    expect(screen.getByTestId("environment-progress").textContent).toBe("Installing…");
    expect((screen.getByTestId("add-from-registry") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("env-remove-acme/triage") as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: { ...PROJECT_ENVIRONMENT, error: "acme/labels 0.4.0: a file's digest does not match the lock" },
      });
    });
    expect(screen.queryByTestId("environment-progress")).toBeNull();
    expect(screen.getByTestId("environment-error").textContent).toBe(
      "acme/labels 0.4.0: a file's digest does not match the lock",
    );
    expect((screen.getByTestId("add-from-registry") as HTMLButtonElement).disabled).toBe(false);
  });

  test("an empty environment says so", async () => {
    environments[PROJECT_ID] = environment({ repository: PROJECT_ID });
    seed();
    render(<LibrarySurface />);
    expect((await screen.findByTestId("environment-empty")).textContent).toBe("No spec packages requested yet");
  });
});
