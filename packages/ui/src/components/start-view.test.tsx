// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-29: the start view renders its elements and one submission
// creates a session for the selected project with the first turn.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

import { StartView } from "./StartView.js";

const PROJECT = {
  id: "p1",
  path: "/tmp/demo",
  name: "demo",
  registeredAt: 0,
};

const PLAYBOOK = {
  id: "code",
  from: "@sublang/playbook/code/registry",
  command: "code",
  intent: "software development workflow",
  players: { coder: "claude-opus" },
};

const PROFILE = { id: "claude-opus", adapter: "claude" as const };

function renderStart(onStart = vi.fn(async () => {})) {
  render(
    <StartView
      projects={[PROJECT]}
      playbooks={[PLAYBOOK]}
      captainRef="claude-opus"
      profiles={[PROFILE]}
      readiness={[
        {
          profileId: "claude-opus",
          adapter: "claude",
          ready: false,
          requirement: "set ANTHROPIC_API_KEY",
        },
      ]}
      connected
      onRegisterPath={vi.fn()}
      onCreateProject={vi.fn()}
      onCaptainChange={vi.fn()}
      onStart={onStart}
    />,
  );
  return onStart;
}

describe("RUN-29: start view structure and one-motion start", () => {
  test("composer, project selector, playbook chip, captain summary render", () => {
    renderStart();
    expect(screen.getByTestId("start-composer")).toBeTruthy();
    const select = screen.getByTestId(
      "start-project-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("p1");
    const chip = screen.getByTestId("playbook-chip-code");
    expect(chip.textContent).toContain("/code");
    expect(chip.title).toContain("software development");
    expect(
      (screen.getByTestId("captain-select") as HTMLSelectElement).value,
    ).toBe("claude-opus");
    expect(screen.getByTestId("readiness-notice").textContent).toContain(
      "ANTHROPIC_API_KEY",
    );
  });

  test("submitting starts a session for the selected project with the text", async () => {
    const onStart = renderStart();
    const composer = screen.getByTestId("start-composer");
    fireEvent.change(composer, { target: { value: "/code fix the bug" } });
    fireEvent.click(screen.getByTestId("start-send"));
    await vi.waitFor(() =>
      expect(onStart).toHaveBeenCalledWith("p1", "/code fix the bug"),
    );
  });

  test("a chip inserts the slash command without dispatching", () => {
    const onStart = renderStart();
    fireEvent.click(screen.getByTestId("playbook-chip-code"));
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    expect(composer.value.startsWith("/code")).toBe(true);
    expect(onStart).not.toHaveBeenCalled();
  });
});
