// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-19/20/21 component coverage: the run view rendered from the
// fixture stream shows the expected panes and never hidden content.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen,
  within,
} from "@testing-library/react";

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
import {
  MACHINE_ORPHAN,
  MACHINE_RUN,
  MACHINE_STOPPED,
} from "../fixtures/sample-run.js";

const SESSION: SessionInfo = {
  id: "s1",
  projectId: "p1",
  projectPath: "/tmp/demo",
  createdAt: 0,
  live: true,
  endedAt: null,
  players: PLAYERS,
  initialVisible: INITIAL_VISIBLE,
  turns: 0,
  failed: false,
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
    expect(screen.getByTestId("player-pane-dev.coder")).toBeTruthy();
    expect(screen.getByTestId("player-pane-dev.reviewer")).toBeTruthy();
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
    expect(bubble.textContent).toContain("dev.reviewer");
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
      "dev.reviewer is waiting for your reply",
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

// run-view-66: the machine call tree over a fixture replay (DR-031).
describe("run-view-66: the machine call tree from the trace", () => {
  test("a running child nests under its caller, which folds to a strip", () => {
    // Replay to the review's first transition: /code is delegating,
    // /review is the running leaf.
    renderRun(MACHINE_RUN.slice(0, 13));
    const live = screen.getByTestId("live-machines");
    const cards = within(live).getAllByTestId(/^machine-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute("data-playbook")).toBe("code");
    expect(cards[1].getAttribute("data-playbook")).toBe("review");

    // The caller is the ancestor: a strip that still names the calling
    // state and the callee, so the containment survives the fold.
    expect(cards[0].getAttribute("data-expanded")).toBe("false");
    expect(cards[0].getAttribute("aria-label")).toContain("review first commit");
    expect(cards[0].getAttribute("aria-label")).toContain("/review");
    expect(
      within(live).getByTestId("machine-connector-t-code"),
    ).toBeTruthy();

    // The running leaf is what is drawn, and its header names the
    // state that called it.
    expect(cards[1].getAttribute("data-expanded")).toBe("true");
    expect(cards[1].getAttribute("data-caller-state")).toBe("reviewFirstCommit");
    const active = within(cards[1]).getByTestId(
      "machine-state-t-review-reviewing",
    );
    expect(active.getAttribute("data-active")).toBe("true");

    // The running mark is the app's one pulse, and it says so.
    const mark = within(cards[1]).getByTestId("machine-running-t-review");
    expect(mark.getAttribute("data-running")).toBe("true");
    expect(mark.className).toContain("motion-safe:animate-pulse");

    // The card absorbs the run's progress while ◇ engagement lines
    // stay — including the bare event ids the runtime narrates with
    // no glyph, which used to reach the reader as raw jargon.
    expect(screen.getByText("◇ /code started")).toBeTruthy();
    expect(screen.queryByText(/⤷ Coder: implement/)).toBeNull();
    expect(screen.queryByText("START_CODE")).toBeNull();
    expect(screen.queryByText("→ directCommit")).toBeNull();
  });

  test("expanding the caller is arrangement, and shows both drawings", () => {
    renderRun(MACHINE_RUN.slice(0, 13));
    const before = screen
      .getAllByTestId(/^machine-card-/)
      .map((card) => card.getAttribute("data-playbook"));

    fireEvent.click(screen.getByTestId("machine-disclose-t-code"));

    const cards = screen.getAllByTestId(/^machine-card-/);
    expect(cards[0].getAttribute("data-expanded")).toBe("true");
    // The delegating state wears the call voice and names its callee.
    const delegating = within(cards[0]).getByTestId(
      "machine-state-t-code-reviewFirstCommit",
    );
    expect(delegating.getAttribute("data-delegating")).toBe("true");
    expect(within(delegating).getByText("call /review")).toBeTruthy();
    // The child is untouched: the same tree, differently disclosed.
    expect(cards.map((card) => card.getAttribute("data-playbook"))).toEqual(
      before,
    );
    expect(cards[1].getAttribute("data-expanded")).toBe("true");
  });

  test("one card per run: the reports that trail a finish revive none", () => {
    renderRun(MACHINE_RUN);
    // Nothing left running, and the root settled into the thread with
    // its child settled inside it — not two loose cards.
    expect(screen.queryByTestId("live-machines")).toBeNull();
    const settled = screen.getAllByTestId(/^machine-card-/);
    expect(settled).toHaveLength(2);
    expect(settled[0].getAttribute("data-playbook")).toBe("code");
    expect(settled[1].getAttribute("data-playbook")).toBe("review");
    for (const card of settled) {
      expect(card.getAttribute("data-settled")).toBe("true");
    }
    // The status, settlement and disposal that follow a finished run
    // used to raise a blank second card labelled "stopped".
    expect(screen.getByTestId("machine-outcome-t-code").textContent).toBe(
      "done",
    );
    expect(screen.getByTestId("machine-outcome-t-review").textContent).toBe(
      "done",
    );
    // The settled child stays anchored to the state that called it.
    expect(settled[1].getAttribute("data-caller-state")).toBe(
      "reviewFirstCommit",
    );
  });

  test("a settled strip expands to its final drawing", () => {
    renderRun(MACHINE_RUN);
    const card = screen.getByTestId("machine-card-t-code");
    expect(card.getAttribute("data-expanded")).toBe("false");
    fireEvent.click(screen.getByTestId("machine-disclose-t-code"));
    expect(
      within(card).getByTestId("machine-state-t-code-done"),
    ).toBeTruthy();
  });

  test("a run disposed where it stands settles unfinished", () => {
    renderRun(MACHINE_STOPPED);
    expect(screen.getAllByTestId(/^machine-card-/)).toHaveLength(1);
    expect(screen.getByTestId("machine-outcome-t-halt").textContent).toBe(
      "stopped",
    );
  });

  test("a child whose caller is unknown draws at the top level", () => {
    renderRun(MACHINE_ORPHAN);
    const live = screen.getByTestId("live-machines");
    const cards = within(live).getAllByTestId(/^machine-card-/);
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-playbook")).toBe("review");
  });
});

