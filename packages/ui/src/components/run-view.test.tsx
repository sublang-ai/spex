// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-19/20/21 component coverage: the run view rendered from the
// fixture stream shows the expected panes and never hidden content.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
import type {
  SessionInfo,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";

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

describe("RUN-21: awaitBossReply as a first-class chat moment", () => {
  test("the question renders as an incoming bubble from the player", () => {
    renderRun([...TURN_ONE, ...TURN_TWO_QUESTION]);
    const bubble = screen.getByTestId("question-bubble");
    expect(bubble.textContent).toContain("code-reviewer");
    expect(bubble.textContent).toContain(
      "Which auth flow should I prioritize?",
    );
    // The runtime's status-line echo of the same question is replaced
    // by the bubble, not duplicated.
    expect(
      screen.queryByText(/asks: Which auth flow/, { exact: false }),
    ).toBeNull();
  });

  test("the banner names the player without repeating the question", () => {
    renderRun([...TURN_ONE, ...TURN_TWO_QUESTION]);
    const banner = screen.getByTestId("boss-reply-banner");
    expect(banner.textContent).toContain(
      "code-reviewer is waiting for your reply",
    );
  });

  test("banner clears after the reply turn", () => {
    renderRun(FULL_RUN);
    expect(screen.queryByTestId("boss-reply-banner")).toBeNull();
  });
});

const TURN_ONLY_STARTED = [
  {
    seq: 1,
    record: {
      type: "turn_started",
      turnId: 9,
      timestamp: 1,
      turn: { id: 9, prompt: "go", timestamp: 1 },
    } as unknown as TmuxPlayRecord,
  },
];

describe("RUN-37: the thread stays alive while a turn runs", () => {
  test("a working indicator shows when the captain is silent", () => {
    renderRun(TURN_ONLY_STARTED);
    expect(screen.getByTestId("working-indicator").textContent).toContain(
      "Captain is thinking…",
    );
  });
});

describe("RUN-38: queued messages read as pending, not sent", () => {
  test("queue entries render full text with the delivery caption", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      TURN_ONLY_STARTED,
    );
    render(
      <RunView
        session={SESSION}
        view={view}
        composer={{ queued: ["also update the changelog please"] }}
        connected
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    const queue = screen.getByTestId("queue-indicator");
    expect(queue.textContent).toContain("also update the changelog please");
    expect(queue.textContent).toContain("sends when this turn ends");
  });
});

describe("RUN-39: drafts come from the store", () => {
  test("the composer renders the stored draft and reports edits", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      TURN_ONE,
    );
    const onDraftChange = vi.fn();
    render(
      <RunView
        session={SESSION}
        view={view}
        composer={{ queued: [], draft: "half-typed reply" }}
        connected
        onDraftChange={onDraftChange}
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    const composer = screen.getByTestId(
      "boss-composer",
    ) as HTMLTextAreaElement;
    expect(composer.value).toBe("half-typed reply");
    fireEvent.change(composer, { target: { value: "half-typed reply!" } });
    expect(onDraftChange).toHaveBeenCalledWith("half-typed reply!");
  });
});

describe("RUN-40: abort acknowledges instantly", () => {
  test("clicking Abort disables it and relabels to Aborting…", () => {
    renderRun(TURN_ONLY_STARTED);
    const abort = screen.getByTestId("abort-button") as HTMLButtonElement;
    fireEvent.click(abort);
    expect(abort.disabled).toBe(true);
    expect(abort.textContent).toContain("Aborting…");
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
