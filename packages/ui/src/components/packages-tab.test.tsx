// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// playbook-library-94 over a simulated document: a project's Packages
// tab rendering the project's environment and your own group's beneath
// it through the real store, against a stand-in client answering as the
// core does — each section's spec packages with versions, sources,
// artifacts with languages and fallback marks, and installed state; Add
// from registry, from a folder and from Git; Resolve again while the
// lock is stale; the newer built-in release's line with Update; what
// the last export left out with Export again; Remove behind Remove or
// Keep; and every control waiting while that spex repository syncs,
// naming the sync; each section headed by the project's name or by
// your own group, never by a spex repository, with the ways to add a
// spec package beneath its list, every command naming that section's
// spex repository (playbook-library-92, DR-172).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CommandResults, EnvironmentState } from "@sublang/spex-core/protocol";

import { PackagesTab } from "./PackagesTab.js";
import { instanceState } from "../fixtures/groups-state.js";
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
    registryAccounts: { "https://spex.example": { origin: "https://spex.example", displayName: "Spex Example", account: { id: "registry", login: "me" }, signIn: { phase: "idle" }, error: null } },
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

/** The project's section and your own group's, each found by itself:
 * both stand at once, with the same controls (playbook-library-92). */
const projectSection = () => within(screen.getByTestId("packages-project"));
const personalSection = () => within(screen.getByTestId("packages-personal"));

async function renderTab(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  seed(over);
  const view = render(<PackagesTab project={PROJECT} />);
  await screen.findByTestId("env-package-acme/triage");
  await vi.waitFor(() => personalSection().getByTestId("env-package-sublang/playbooks"));
  return view;
}

beforeEach(() => {
  environments = { [PROJECT_ID]: { ...PROJECT_ENVIRONMENT, registry: { origin: "https://spex.example", legacy: false } }, [OWN_KEY]: { ...OWN_ENVIRONMENT, registry: { origin: "https://spex.example", legacy: false } } };
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

describe("playbook-library-94: each section's environment", () => {
  test("Git request labels and tooltips use the display summary through live state updates", async () => {
    const setSource = (repository: string): EnvironmentState => ({
      ...PROJECT_ENVIRONMENT,
      requests: { "acme/triage": { kind: "git", repository, rev: "v1", path: "pkg" } },
      packages: PROJECT_ENVIRONMENT.packages.filter((pkg) => pkg.name === "acme/triage").map((pkg) => ({ ...pkg, source: { kind: "git" as const, detail: repository } })),
    });
    environments[PROJECT_ID] = setSource("the remote");
    await renderTab();
    const source = screen.getByTestId("env-source-acme/triage");
    expect(source.textContent).toBe("Git the remote at v1, pkg");
    expect(source.title).toBe("the remote");
    for (const label of ["Spex Example", "https://example.test/acme/flows.git"]) {
      await act(async () => deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID, state: setSource(label) }));
      expect(source.textContent).toBe(`Git ${label} at v1, pkg`);
      expect(source.title).toBe(label);
    }
    expect(projectSection().getByTestId("environment-section").innerHTML).not.toContain("secret-user");
  });

  test("lists its spec packages with versions, sources, artifacts, languages, fallback marks and installed state", async () => {
    await renderTab();
    const section = projectSection().getByTestId("environment-section");
    // The word stands as the section's heading, naming the project by
    // its name and never its spex repository (DR-159).
    expect(within(section).getByRole("heading").textContent).toBe(`Environment of ${PROJECT.name}`);
    expect(section.textContent).not.toContain(PROJECT_ID);
    expect(section.textContent).not.toContain("-spex");
    // No switch and no playbook: the project's section and your own
    // group's stand together, the playbooks on their own tab (DR-172).
    expect(screen.queryByTestId("playbooks-switch")).toBeNull();
    expect(screen.queryByTestId(/^playbook-card-/)).toBeNull();
    expect(
      screen.getByTestId("packages-project").compareDocumentPosition(screen.getByTestId("packages-personal")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // [playbook-library-92] the ways to add a spec package stand
    // directly beneath the environment's list.
    const add = projectSection().getByTestId("add-packages");
    expect(
      projectSection().getByTestId("environment-packages").compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

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
    fireEvent.click(projectSection().getByTestId("environment-install"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }),
    );
    // A current lock offers no Resolve again.
    expect(screen.queryByTestId("environment-resolve")).toBeNull();

    // Your own group's section shows its own environment beneath.
    const own = personalSection().getByTestId("environment-section");
    expect(within(own).getByRole("heading").textContent).toBe("Environment of your own group");
    expect(own.textContent).not.toContain(OWN_KEY);
    expect(own.textContent).not.toContain("-spex");
    // Its ways to add stand beneath its list too.
    expect(
      personalSection().getByTestId("environment-packages").compareDocumentPosition(personalSection().getByTestId("add-packages")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(personalSection().queryByTestId("env-package-acme/triage")).toBeNull();
    expect(personalSection().getByTestId("env-source-sublang/playbooks").textContent).toBe("registry ^17.4.1");
    expect(commandMock).toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
  });

  test("a project that is your own group's spex repository stands as one section", async () => {
    const space = home();
    space.own.repositories = space.own.repositories.map((entry) => ({ ...entry, key: PROJECT_ID }));
    seed({ space });
    render(<PackagesTab project={PROJECT} />);
    await screen.findByTestId("env-package-acme/triage");
    expect(screen.getAllByTestId("environment-section")).toHaveLength(1);
    expect(screen.queryByTestId("packages-personal")).toBeNull();
    expect(commandMock).not.toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
  });
});

describe("playbook-library-94: the environment's controls", () => {
  test("Add from registry searches the registry and requests the chosen version at a caret", async () => {
    await renderTab();
    fireEvent.click(projectSection().getByTestId("add-from-registry"));
    expect(projectSection().getByTestId("add-from-registry").getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "tri" } });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.search", { repository: PROJECT_ID, query: "tri" }),
    );
    const result = await projectSection().findByTestId("registry-result-acme/triage");
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
    expect((await projectSection().findByTestId("add-note")).textContent).toBe("Requested acme/triage");

    // Your own group's section searches its own environment's registry.
    commandMock.mockClear();
    fireEvent.click(personalSection().getByTestId("add-from-registry"));
    fireEvent.change(personalSection().getByTestId("registry-query"), { target: { value: "tidy" } });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.search", { repository: OWN_KEY, query: "tidy" }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("environment.search", expect.objectContaining({ repository: PROJECT_ID, query: "tidy" }));
  });

  test("a request the core refuses shows its cause in place", async () => {
    await renderTab();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request") throw new Error("acme/tidy has no release meeting ^0.3.0");
      return base(type, params);
    });
    fireEvent.click(projectSection().getByTestId("add-from-registry"));
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "tidy" } });
    const result = await projectSection().findByTestId("registry-result-acme/tidy");
    fireEvent.click(within(result).getByTestId("registry-add-acme/tidy"));
    expect((await projectSection().findByTestId("registry-add-error-acme/tidy")).textContent).toBe(
      "acme/tidy has no release meeting ^0.3.0",
    );
  });

  test("Add from folder and Add from Git request by path and by repository and rev; a bad name is refused before anything is sent", async () => {
    await renderTab();
    fireEvent.click(projectSection().getByTestId("add-from-folder"));
    expect(projectSection().getByTestId("folder-request").textContent).toContain(`Folder inside ${PROJECT.path}`);
    fireEvent.change(projectSection().getByTestId("folder-request-name"), { target: { value: "Acme/Tools" } });
    fireEvent.change(projectSection().getByTestId("folder-request-path"), { target: { value: "spex-packages/tools" } });
    fireEvent.click(projectSection().getByTestId("folder-request-submit"));
    expect((await projectSection().findByTestId("folder-request-error")).textContent).toContain("org/name");
    expect(commandMock).not.toHaveBeenCalledWith("environment.request", expect.anything());
    fireEvent.change(projectSection().getByTestId("folder-request-name"), { target: { value: "acme/tools" } });
    fireEvent.click(projectSection().getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: PROJECT_ID,
        name: "acme/tools",
        request: { kind: "path", path: "spex-packages/tools" },
      }),
    );

    fireEvent.click(projectSection().getByTestId("add-from-git"));
    fireEvent.change(projectSection().getByTestId("git-request-name"), { target: { value: "acme/flows" } });
    fireEvent.change(projectSection().getByTestId("git-request-url"), { target: { value: "https://github.com/acme/flows.git" } });
    fireEvent.change(projectSection().getByTestId("git-request-rev"), { target: { value: "v0.2.0" } });
    fireEvent.click(projectSection().getByTestId("git-request-submit"));
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
    await renderTab();
    const stale = projectSection().getByTestId("environment-stale");
    expect(stale.textContent).toBe("Requests changed; resolve again to install");
    expect(stale.title).toBe("spex.yaml changed");
    fireEvent.click(projectSection().getByTestId("environment-resolve"));
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
    expect(projectSection().queryByTestId("environment-stale")).toBeNull();
    expect(projectSection().getByTestId("environment-conflicts").textContent).toContain(
      "acme/labels — ^0.4.0 by acme/triage; ^1.0.0 by acme/local-tools",
    );
    expect(projectSection().getByTestId("environment-resolve")).toBeTruthy();
  });

  test("a newer built-in release reads its line with Update, which resolves again; a state naming none reads no line", async () => {
    environments[PROJECT_ID] = { ...PROJECT_ENVIRONMENT, builtinUpdate: { shipped: "17.8.0", locked: "17.4.1" } };
    await renderTab();
    // [playbook-library-92] the line names both releases, with Update
    // beside it while the lock is current and no Resolve again stands.
    expect(projectSection().getByTestId("environment-builtin-update-line").textContent).toBe(
      "Built-in playbooks 17.8.0 shipped with this app; this environment runs 17.4.1",
    );
    expect(projectSection().queryByTestId("environment-resolve")).toBeNull();
    const update = projectSection().getByTestId("environment-update") as HTMLButtonElement;
    expect(update.textContent).toBe("Update");
    fireEvent.click(update);
    // [playbook-library-92] Update sends environment.resolve for this
    // spex repository, and nothing else.
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.resolve", { repository: PROJECT_ID }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("environment.install", expect.anything());

    // The state the core broadcasts once the lock selects the shipped
    // release names none, and the line goes.
    act(() => {
      deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID, state: PROJECT_ENVIRONMENT });
    });
    expect(projectSection().queryByTestId("environment-builtin-update")).toBeNull();
    expect(projectSection().queryByTestId("environment-update")).toBeNull();

    // [playbook-library-92] your own group's section, its state naming
    // no newer release, reads no line.
    expect(personalSection().queryByTestId("environment-builtin-update")).toBeNull();
  });

  test("the project's section reads Not committed with the code while its two files are not both in the code's HEAD, and not once a commit holds both; your own group's section never reads it", async () => {
    // Untracked, or added but not committed: the core reads the state
    // as not committed (environments-14).
    environments[PROJECT_ID] = { ...PROJECT_ENVIRONMENT, committed: false };
    await renderTab();
    // [playbook-library-92] the phrase on the project's section.
    expect(projectSection().getByTestId("environment-uncommitted").textContent).toBe("Not committed with the code");

    // [playbook-library-92] a commit holding both: the state the core
    // broadcasts reads committed, and the phrase goes.
    act(() => {
      deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID, state: { ...PROJECT_ENVIRONMENT, committed: true } });
    });
    expect(projectSection().queryByTestId("environment-uncommitted")).toBeNull();

    // [playbook-library-92] your own group's environment syncs with its
    // clone and reads no such phrase.
    act(() => {
      deliverServerMessageForTests({ type: "environment.state", repository: OWN_KEY, state: { ...OWN_ENVIRONMENT, committed: null } });
    });
    expect(personalSection().queryByTestId("environment-uncommitted")).toBeNull();
  });

  test("what the last export left out reads under Not exported with Export again, which installs; a state naming nothing reads no list", async () => {
    environments[PROJECT_ID] = {
      ...PROJECT_ENVIRONMENT,
      unexported: { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: ["acme/local-tools"] },
    };
    await renderTab();
    // [playbook-library-92] each skill a folder of the reader's kept out
    // names that folder; each spec package says its files are not here.
    expect(projectSection().getByTestId("environment-unexported").firstElementChild?.textContent).toBe("Not exported");
    expect(projectSection().getByTestId("environment-unexported-.agents/skills-lint").textContent).toBe(
      "lint — .agents/skills holds a folder of yours by that name",
    );
    expect(projectSection().getByTestId("environment-unexported-package-acme/local-tools").textContent).toBe(
      "acme/local-tools — Its files are not on this device",
    );
    // [playbook-library-92] Export again sends environment.install for
    // this spex repository, and nothing else.
    const again = projectSection().getByTestId("environment-export-again") as HTMLButtonElement;
    expect(again.textContent).toBe("Export again");
    fireEvent.click(again);
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("environment.resolve", expect.anything());

    // The state the core broadcasts once the export left nothing out
    // names nothing, and the list goes.
    act(() => {
      deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID, state: PROJECT_ENVIRONMENT });
    });
    expect(projectSection().queryByTestId("environment-unexported")).toBeNull();
    expect(projectSection().queryByTestId("environment-export-again")).toBeNull();
  });

  test("Remove asks Remove or Keep; Keep writes nothing", async () => {
    await renderTab();
    fireEvent.click(projectSection().getByTestId("env-remove-acme/triage"));
    const row = projectSection().getByTestId("env-package-acme/triage");
    expect(row.textContent).toContain("Remove acme/triage?");
    const keep = within(row).getByRole("button", { name: "Keep" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(commandMock).not.toHaveBeenCalledWith("environment.remove", expect.anything());
    fireEvent.click(projectSection().getByTestId("env-remove-acme/triage"));
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.remove", { repository: PROJECT_ID, name: "acme/triage" }),
    );
  });

  test("in your own group's section, Add from folder asks for a folder inside its clone and requests the path there", async () => {
    await renderTab();
    fireEvent.click(personalSection().getByTestId("add-from-folder"));
    expect(personalSection().getByTestId("folder-request").textContent).toContain(`Folder inside ${OWN_ENVIRONMENT.pathRoot}`);
    fireEvent.change(personalSection().getByTestId("folder-request-name"), { target: { value: "me/notes" } });
    fireEvent.change(personalSection().getByTestId("folder-request-path"), { target: { value: "mine/notes" } });
    fireEvent.click(personalSection().getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: OWN_KEY,
        name: "me/notes",
        request: { kind: "path", path: "mine/notes" },
      }),
    );
  });

  test("Add from folder waits for a path root: a state naming none disables it", async () => {
    environments[PROJECT_ID] = { ...PROJECT_ENVIRONMENT, pathRoot: null };
    await renderTab();
    const control = projectSection().getByTestId("add-from-folder") as HTMLButtonElement;
    expect(control.disabled).toBe(true);
    expect(control.title).toBe("No working folder on this device");
  });

  test("every control stays available while that spex repository syncs: the sync refuses nothing", async () => {
    environments[PROJECT_ID] = {
      ...PROJECT_ENVIRONMENT,
      unexported: { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: [] },
    };
    await renderTab({ space: home({ syncing: PROJECT_ID }) });
    expect(projectSection().queryByTestId("environment-progress")).toBeNull();
    const controls = [
      "env-remove-acme/triage",
      "env-remove-acme/local-tools",
      "environment-install",
      "environment-export-again",
      "add-from-registry",
      "add-from-folder",
      "add-from-git",
    ].map((id) => projectSection().getByTestId(id) as HTMLButtonElement);
    for (const control of controls) {
      expect(control.disabled, control.dataset.testid).toBe(false);
      expect(control.title, control.dataset.testid).not.toMatch(/sync/i);
    }
    // An act during the sync reaches the core, which answers it as any.
    fireEvent.click(projectSection().getByTestId("environment-install"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }));
  });

  test("the core's work on an environment reads in place as progress, holding no control; a failure shows its cause", async () => {
    environments[PROJECT_ID] = {
      ...PROJECT_ENVIRONMENT,
      busy: "installing",
      unexported: { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: [] },
    };
    await renderTab();
    expect(projectSection().getByTestId("environment-progress").textContent).toBe("Installing…");
    expect((projectSection().getByTestId("add-from-registry") as HTMLButtonElement).disabled).toBe(false);
    expect((projectSection().getByTestId("environment-export-again") as HTMLButtonElement).disabled).toBe(false);
    expect((projectSection().getByTestId("env-remove-acme/triage") as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: { ...PROJECT_ENVIRONMENT, error: "acme/labels 0.4.0: a file's digest does not match the lock" },
      });
    });
    expect(projectSection().queryByTestId("environment-progress")).toBeNull();
    expect(projectSection().getByTestId("environment-error").textContent).toBe(
      "acme/labels 0.4.0: a file's digest does not match the lock",
    );
    expect((projectSection().getByTestId("add-from-registry") as HTMLButtonElement).disabled).toBe(false);
  });

  test("an empty environment says so", async () => {
    environments[PROJECT_ID] = environment({ repository: PROJECT_ID });
    seed();
    render(<PackagesTab project={PROJECT} />);
    expect((await projectSection().findByTestId("environment-empty")).textContent).toBe("No spec packages requested yet");
  });
});


describe("playbook-library-113: publish a directly requested local package", () => {
  const NAME = "acme/triage";
  const PATH = "spex-packages/current";
  const PREVIEW = { name: NAME, version: "1.2.3", files: ["meta.yaml", "specs/en/triage.md", "skills/en/tidy/SKILL.md"] };
  const receipt = { name: NAME, version: "1.2.3", url: `https://spex.example/${NAME}` };
  const row = () => within(projectSection().getByTestId(`env-package-${NAME}`));
  const local = (): EnvironmentState => ({
    ...PROJECT_ENVIRONMENT,
    // The current request, not its older registry lock, owns the folder.
    requests: { ...PROJECT_ENVIRONMENT.requests, [NAME]: { kind: "path", path: PATH } },
    stale: ["requests changed"],
    pathRoot: "/project",
    registry: { origin: "https://spex.example", legacy: false },
  });
  function update(state: EnvironmentState) {
    environments[PROJECT_ID] = state;
    act(() => deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID, state }));
  }
  function publishingReplies() {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish"
        ? params?.dryRun ? { accepted: true, preview: PREVIEW } : { accepted: true }
        : base(type, params));
  }
  async function confirm(target = row()) {
    fireEvent.click(target.getByTestId("publish-button"));
    const summary = await target.findByTestId("publish-summary");
    fireEvent.click(within(summary).getByTestId("publish-confirm"));
    await vi.waitFor(() => expect(target.queryByTestId("publish-summary")).toBeNull());
  }

  test("uses the current folder despite a stale lock, previews and cancels without uploading, and excludes other sources", async () => {
    environments[PROJECT_ID] = local();
    publishingReplies();
    await renderTab();
    expect(within(projectSection().getByTestId("env-package-acme/labels")).queryByTestId("publish")).toBeNull();
    expect(within(projectSection().getByTestId("env-package-sublang/playbooks")).queryByTestId("publish")).toBeNull();
    fireEvent.click(row().getByTestId("publish-button"));
    const summary = await row().findByTestId("publish-summary");
    expect(summary.textContent).toContain(`${NAME} 1.2.3`);
    expect(within(summary).getByTestId("publish-files").textContent).toContain("skills/en/tidy/SKILL.md");
    // By name: the core reads the current request's folder (environments-10).
    expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, name: NAME, dryRun: true });
    fireEvent.click(within(summary).getByTestId("publish-cancel"));
    expect(row().queryByTestId("publish-summary")).toBeNull();
    expect(commandMock.mock.calls.some(([type, params]) => type === "environment.publish" && !params.dryRun)).toBe(false);
    update({ ...local(), requests: { ...local().requests, [NAME]: { kind: "git", repository: "remote", rev: "main" } } });
    expect(row().queryByTestId("publish")).toBeNull();
    update({ ...local(), pathRoot: null });
    expect(row().queryByTestId("publish")).toBeNull();
  });

  test("a retained success cannot hide two identical refusals, and a different package can succeed", async () => {
    let state = local();
    environments[PROJECT_ID] = state;
    publishingReplies();
    await renderTab();
    await confirm();
    update(state = { ...state, published: receipt, error: null });
    expect(row().getByTestId("publish-done").textContent).toContain(`Published ${NAME} 1.2.3`);
    const refusal = "the registry refused acme/triage 1.2.3: that version exists";
    for (let attempt = 0; attempt < 2; attempt++) {
      await confirm();
      update(state = { ...state, busy: "publishing" });
      expect(row().queryByTestId("publish-done")).toBeNull();
      expect(row().queryByTestId("publish-error")).toBeNull();
      update(state = { ...state, busy: null, error: refusal });
      expect(row().getByTestId("publish-error").textContent).toBe(refusal);
      expect(row().queryByTestId("publish-done")).toBeNull();
    }
    const other = "acme/local-tools";
    const otherRow = within(projectSection().getByTestId(`env-package-${other}`));
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish" && params?.dryRun
        ? { accepted: true, preview: { ...PREVIEW, name: other } }
        : base(type, params));
    await confirm(otherRow);
    update({ ...state, error: null, published: { ...receipt, name: other, url: `https://spex.example/${other}` } });
    expect(otherRow.getByTestId("publish-done").textContent).toContain(`Published ${other} 1.2.3`);
    expect(row().queryByTestId("publish-done")).toBeNull();
  });

  test("changing path discards a delayed old preview, and repository and same-name target changes discard an open preview", async () => {
    environments[PROJECT_ID] = local();
    let finish!: (reply: { accepted: true; preview: typeof PREVIEW }) => void;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) =>
      type === "environment.publish" && params?.dryRun
        ? new Promise((resolve) => { finish = resolve; })
        : base(type, params));
    await renderTab();
    fireEvent.click(row().getByTestId("publish-button"));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    update({ ...local(), requests: { ...local().requests, [NAME]: { kind: "path", path: "spex-packages/replacement" } } });
    await act(async () => { finish({ accepted: true, preview: PREVIEW }); });
    expect(row().queryByTestId("publish-summary")).toBeNull();
    publishingReplies();
    fireEvent.click(row().getByTestId("publish-button"));
    await row().findByTestId("publish-summary");
    const changed = home({ account: null });
    changed.own.repositories.forEach((repo) => { repo.instance = null; });
    changed.defaultInstance = "https://second.test";
    changed.instances = [instanceState("https://second.test", { displayName: "Spex Example" })];
    act(() => useAppStore.setState({ space: changed }));
    expect(row().queryByTestId("publish-summary")).not.toBeNull();
    update({ ...local(), registry: { origin: "https://second.test", legacy: false } });
    act(() => deliverServerMessageForTests({ type: "registry.state", state: { origin: "https://second.test", displayName: "Spex Example", account: { id: "registry", login: "me" }, signIn: { phase: "idle" }, error: null } }));
    expect(row().queryByTestId("publish-summary")).toBeNull();
    fireEvent.click(row().getByTestId("publish-button"));
    await row().findByTestId("publish-summary");
    // Signed out at that registry, the open preview goes with the
    // account it would have published as.
    act(() => deliverServerMessageForTests({ type: "registry.state", state: { origin: "https://second.test", displayName: "Spex Example", account: null, signIn: { phase: "idle" }, error: null } }));
    expect(row().queryByTestId("publish-summary")).toBeNull();
    expect(row().getByRole("button", { name: "Sign in to registry" })).toBeTruthy();
    expect(row().queryByTestId("publish-button")).toBeNull();
  });
});

describe("playbook-library-115, playbook-library-116: request a known registry package", () => {
  const name = "private/notes";
  function openKnown(section = projectSection()) {
    fireEvent.click(section.getByTestId("add-from-registry"));
    fireEvent.click(section.getByTestId("add-by-name"));
  }
  function fill(version: string, packageName = name, section = projectSection()) {
    fireEvent.change(section.getByTestId("known-package-name"), { target: { value: packageName } });
    fireEvent.change(section.getByTestId("known-package-version"), { target: { value: version } });
  }

  test.each(["1.2.3", "^1.2.3", "~1.2.3"])("preserves trimmed %s without searching or claiming installation", async (version) => {
    await renderTab();
    openKnown();
    fill(`  ${version}  `, `  ${name}  `);
    fireEvent.click(projectSection().getByTestId("known-package-request-submit"));
    expect((await projectSection().findByTestId("add-note")).textContent).toBe(`Requested ${name}`);
    expect(commandMock).toHaveBeenCalledWith("environment.request", {
      repository: PROJECT_ID, name, request: { kind: "registry", version },
    });
    expect(commandMock.mock.calls.some(([type]) => type === "environment.search")).toBe(false);
    expect(projectSection().queryByTestId(`env-installed-${name}`)).toBeNull();
    act(() => deliverServerMessageForTests({
      type: "environment.state", repository: PROJECT_ID,
      state: { ...PROJECT_ENVIRONMENT, error: `${name}: this account may not fetch it from the registry` },
    }));
    expect(projectSection().getByTestId("environment-error").textContent).toContain("may not fetch");
    expect(projectSection().queryByTestId(`env-installed-${name}`)).toBeNull();
  });

  test("requires both fields, checks the name and shows the authoritative requirement refusal", async () => {
    await renderTab();
    openKnown();
    const submit = projectSection().getByTestId("known-package-request-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fill("   ");
    expect(submit.disabled).toBe(true);
    fill("1.2.3", "not-a-package");
    fireEvent.click(submit);
    expect((await projectSection().findByTestId("known-package-request-error")).textContent).toContain("org/name");
    expect(commandMock.mock.calls.some(([type]) => type === "environment.request")).toBe(false);
    fill("1.2.3");
    fireEvent.click(submit);
    await projectSection().findByTestId("add-note");
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request") throw new Error('"*" is not a version requirement: use 1.2.3, ^1.2.3 or ~1.2.3');
      return base(type, params);
    });
    fill("*");
    fireEvent.click(submit);
    expect((await projectSection().findByTestId("known-package-request-error")).textContent).toContain("not a version requirement");
    expect(projectSection().queryByTestId("add-note")).toBeNull();
  });

  test.each(["resolve", "reject"])("a delayed %s stays with its original environment", async (outcome) => {
    const base = commandMock.getMockImplementation()!;
    let finish!: () => void;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request" && params?.repository === PROJECT_ID) {
        return new Promise((resolve, reject) => {
          finish = () => outcome === "resolve" ? resolve({ accepted: true }) : reject(new Error("old destination refusal"));
        });
      }
      return base(type, params);
    });
    await renderTab();
    openKnown();
    fill("1.2.3");
    fireEvent.click(projectSection().getByTestId("known-package-request-submit"));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    // Your own group's section holds a form of its own, empty.
    openKnown(personalSection());
    expect((personalSection().getByTestId("known-package-name") as HTMLInputElement).value).toBe("");
    expect((personalSection().getByTestId("known-package-version") as HTMLInputElement).value).toBe("");
    await act(async () => finish());
    // The delayed outcome lands in the section that sent it, never in
    // yours.
    expect(personalSection().queryByTestId("add-note")).toBeNull();
    expect(personalSection().queryByTestId("known-package-request-error")).toBeNull();
    if (outcome === "resolve") {
      expect(projectSection().getByTestId("add-note").textContent).toBe(`Requested ${name}`);
    } else {
      expect(projectSection().getByTestId("known-package-request-error").textContent).toBe("old destination refusal");
    }
    fill("~1.2.3", name, personalSection());
    fireEvent.click(personalSection().getByTestId("known-package-request-submit"));
    await personalSection().findByTestId("add-note");
    expect(commandMock).toHaveBeenCalledWith("environment.request", {
      repository: OWN_KEY, name, request: { kind: "registry", version: "~1.2.3" },
    });
  });
});
