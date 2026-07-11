// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-19/20/21 component coverage: the run view rendered from the
// fixture stream shows the expected panes and never hidden content.

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);

import { RunView } from "./RunView.js";
import { applyRecords, initialSessionView } from "../state/reducer.js";
import {
  FULL_RUN,
  HIDDEN_LEAK,
  INITIAL_VISIBLE,
  PLAYERS,
  TURN_ONE,
  TURN_TWO_QUESTION,
} from "../fixtures/sample-run.js";
import type { SessionInfo } from "@sublang/spex-core/protocol";

const SESSION: SessionInfo = {
  id: "s1",
  projectId: "p1",
  projectPath: "/tmp/demo",
  createdAt: 0,
  live: true,
  endedAt: null,
  players: PLAYERS,
  initialVisible: INITIAL_VISIBLE,
};

function renderRun(entries: typeof FULL_RUN) {
  const view = applyRecords(
    initialSessionView(PLAYERS, INITIAL_VISIBLE),
    entries,
  );
  return render(
    <RunView
      session={SESSION}
      view={view}
      composer={{ queued: [] }}
      connected
      onSubmit={async () => {}}
      onAbort={() => {}}
      onRemoveQueued={() => {}}
      onDismissError={() => {}}
    />,
  );
}

describe("RUN-30: boss messages echo as user bubbles", () => {
  test("the submitted turn text renders as a boss bubble", () => {
    renderRun(TURN_ONE);
    const bubble = screen.getByTestId("boss-bubble");
    expect(bubble.textContent).toContain("/code fix the bug");
  });
});

describe("RUN-19: pane structure from the fixture stream", () => {
  test("captain pane and both player panes render with content", () => {
    renderRun(TURN_ONE);
    expect(screen.getByTestId("captain-pane")).toBeTruthy();
    expect(screen.getByTestId("player-pane-code-coder")).toBeTruthy();
    expect(screen.getByTestId("player-pane-code-reviewer")).toBeTruthy();
    expect(screen.getByText("◇ /code started")).toBeTruthy();
    // Markdown rendered: **auth** becomes a <strong>.
    expect(screen.getByText("auth").tagName).toBe("STRONG");
    expect(screen.getByText("Edit", { exact: false })).toBeTruthy();
  });
});

describe("RUN-20: hidden records never appear", () => {
  test("hidden captain prompt content is absent from the DOM", () => {
    const { container } = renderRun([...TURN_ONE, ...HIDDEN_LEAK]);
    expect(container.textContent).not.toContain("secret router prompt");
  });
});

describe("RUN-21: awaitBossReply banner", () => {
  test("banner shows the pending question above the composer", () => {
    renderRun([...TURN_ONE, ...TURN_TWO_QUESTION]);
    const banner = screen.getByTestId("boss-reply-banner");
    expect(banner.textContent).toContain(
      "Which auth flow should I prioritize?",
    );
  });

  test("banner clears after the reply turn", () => {
    renderRun(FULL_RUN);
    expect(screen.queryByTestId("boss-reply-banner")).toBeNull();
  });
});

describe("RUN-36: ended sessions render read-only", () => {
  test("readOnly hides the composer and shows the ended notice", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      TURN_ONE,
    );
    render(
      <RunView
        session={{ ...SESSION, live: false, endedAt: 5 }}
        view={view}
        composer={{ queued: [] }}
        connected
        readOnly
        onStartNew={() => {}}
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    expect(screen.getByTestId("ended-notice").textContent).toContain(
      "read-only",
    );
    expect(screen.queryByTestId("boss-composer")).toBeNull();
    expect(screen.getByText("Start a new session")).toBeTruthy();
  });
});
