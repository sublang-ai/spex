// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The role-binding editor as the house popover (playbook-library-4,
// DR-010 §6): focus enters on open; Escape, an outside click, and
// Cancel close it; focus returns to the role's control, never to the
// page body.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import type {
  RoleBindingSummary,
  SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import { BindingEditorPopover } from "./BindingEditor.js";

afterEach(cleanup);

const PLAYERS: SessionPlayerSummary[] = [
  {
    id: "dev.coder",
    agent: { adapter: "claude", model: "claude-opus-5", effort: "high" },
    display: "claude-opus-5 @ high",
    boundBy: ["code.coder"],
  },
  {
    id: "dev.reviewer",
    agent: { adapter: "codex", model: "gpt-5.6-sol" },
    display: "gpt-5.6-sol",
    boundBy: ["code.reviewer"],
  },
];

const BINDING: RoleBindingSummary = {
  playerId: "dev.coder",
  display: "claude-opus-5 @ high",
};

/** A role's control with its editor, the way the Library mounts one. */
function Harness({ onClose }: { onClose?: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        ref={anchorRef}
        data-testid="anchor"
        onClick={() => setOpen((current) => !current)}
      >
        Bind coder
      </button>
      <button type="button" data-testid="elsewhere">
        Elsewhere
      </button>
      {open ? (
        <BindingEditorPopover
          role="coder"
          position="code.coder"
          binding={BINDING}
          players={PLAYERS}
          anchorRef={anchorRef}
          onSave={async () => {}}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

describe("playbook-library-4: the binding editor is the house popover", () => {
  test("focus enters on open; Escape closes and returns it to the control", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const anchor = screen.getByTestId("anchor");
    anchor.focus();
    fireEvent.click(anchor);

    const editor = screen.getByRole("dialog", { name: "Bind coder" });
    expect(document.activeElement).toBe(screen.getByTestId("binding-player"));

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(editor.isConnected).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  test("an outside click closes; a click inside or on the control does not", () => {
    render(<Harness />);
    const anchor = screen.getByTestId("anchor");
    fireEvent.click(anchor);
    expect(screen.getByRole("dialog", { name: "Bind coder" })).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("binding-player"));
    expect(screen.queryByRole("dialog")).toBeTruthy();
    // The control's own click toggles the editor; its mousedown is
    // not an outside click, or the toggle would reopen it at once.
    fireEvent.mouseDown(anchor);
    expect(screen.queryByRole("dialog")).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("elsewhere"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Cancel closes and returns focus to the control", () => {
    render(<Harness />);
    const anchor = screen.getByTestId("anchor");
    anchor.focus();
    fireEvent.click(anchor);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });
});
