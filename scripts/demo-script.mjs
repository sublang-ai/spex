// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The viewing the demo recording performs. The agents are real and
// take as long as they take; only the camera is scripted.

const PROMPT =
  process.env.DEMO_PROMPT ??
  // Says enough that the run has no reason to stop and ask: the repo
  // carries no specs tree, and the coder should not invent one.
  "/code slugify leaves a stray hyphen when a title ends in punctuation — fix it so the two failing tests pass. No specs tree in this repo; don't add one.";

const setValue = (selector, value) => `
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { abort: "no element " + ${JSON.stringify(selector)} };
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
`;

export default [
  // --- setup, before the first frame ------------------------------------
  {
    label: "register the demo project",
    js: `
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true }));
      await wait(400);
      ${setValue('[placeholder^="~/path"]', process.env.DEMO_PROJECT ?? `${process.env.HOME}/spex-demo`)}
      await wait(200);
      const add = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add");
      if (!add) return { abort: "no Add button" };
      add.click();
      await wait(1500);
      const project = document.querySelector('[data-testid^="sidebar-project-"]');
      return project ? project.textContent : { abort: "project did not register" };
    `,
  },
  {
    label: "dismiss the quick-start card so the frame is calm",
    js: `
      const hide = document.querySelector('[data-testid="quick-start-dismiss"]');
      if (hide) hide.click();
      return true;
    `,
    dwellMs: 900,
  },

  // --- the recording ----------------------------------------------------
  {
    startsRecording: true,
    label: "hold on the workspace",
    dwellMs: 1600,
  },
  {
    label: "type the task",
    js: `
      const el = document.querySelector('[data-testid="start-composer"]');
      if (!el) return { abort: "no composer" };
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      const text = ${JSON.stringify(PROMPT)};
      // Typed a character at a time: the demo should look used, not scripted.
      for (let i = 1; i <= text.length; i += 1) {
        setter.call(el, text.slice(0, i));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 22));
      }
      return text.length;
    `,
    dwellMs: 900,
  },
  {
    label: "send",
    js: `
      const send = document.querySelector('[data-testid="start-send"]');
      if (!send) return { abort: "no send button" };
      send.click();
      return true;
    `,
    dwellMs: 1200,
  },
  {
    label: "widen the Captain pane so the whole machine is in frame",
    js: `
      // The /code drawing is 564px wide and the default split gives it
      // 377, so the divider is nudged the way a reader would nudge it
      // (run-view-81). Seven steps of 2% take 34% to 48%.
      const divider = document.querySelector('[data-testid="captain-divider"]');
      if (!divider) return { abort: "no divider" };
      // Home restores the default first, so a re-record starts from
      // the same place a first-time reader would.
      divider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      );
      await new Promise((r) => setTimeout(r, 120));
      for (let step = 0; step < 7; step += 1) {
        divider.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 90));
      }
      return document.querySelector('[data-testid="captain-column"]').style.width;
    `,
    dwellMs: 600,
  },
  {
    // A run that parks on a question waits for a human, so the demo
    // answers as a human would and lets it carry on. The tightened
    // prompt makes this rare; leaving it unhandled would make the
    // recording hang on the one run that asks.
    label: "the run: /code opens, calls /review, and settles",
    waitForJs: `(() => {
      if (document.querySelector('[data-testid^="machine-card-"][data-settled="true"]')) {
        return true;
      }
      const banner = document.querySelector('[data-testid="boss-reply-banner"]');
      const box = document.querySelector('[data-testid="boss-composer"]');
      if (banner && box && !box.value) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(box, "Go ahead with the judgement you just described.");
        box.dispatchEvent(new Event("input", { bubbles: true }));
        const send = [...document.querySelectorAll("button")]
          .find((b) => b.textContent.trim() === "Send");
        if (send) send.click();
      }
      return false;
    })()`,
    timeoutMs: 900_000,
    dwellMs: 1200,
  },
  {
    label: "open the settled call tree",
    js: `
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const root = document.querySelector('[data-testid^="machine-card-"][data-settled="true"]');
      if (!root) return { abort: "no settled card" };
      root.scrollIntoView({ block: "center" });
      await wait(700);
      const disclose = root.querySelector('[data-testid^="machine-disclose-"]');
      if (disclose) disclose.click();
      await wait(900);
      const nested = root.querySelectorAll('[data-testid^="machine-card-"]');
      return { cards: nested.length + 1 };
    `,
    dwellMs: 1400,
  },
  {
    label: "land on the called machine — the point of the tree",
    js: `
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const root = document.querySelector('[data-testid^="machine-card-"][data-settled="true"]');
      const child = root?.querySelector('[data-testid^="machine-card-"]');
      if (!child) return { abort: "no nested card" };
      child.scrollIntoView({ block: "center", behavior: "smooth" });
      await wait(900);
      return child.getAttribute("data-playbook");
    `,
    dwellMs: 2600,
  },
  {
    label: "hold on the finished tree",
    dwellMs: 1600,
  },
];
