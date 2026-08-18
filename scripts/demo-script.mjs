// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The viewing the demo recording performs. The agents are real and
// take as long as they take; only the camera is scripted.

const PROMPT =
  process.env.DEMO_PROMPT ??
  "/code slugify leaves a stray hyphen when a title ends in punctuation — fix it so the two failing tests pass";

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
    label: "the run: /code opens, calls /review, and settles",
    // The root card settles into the thread when the run finishes.
    waitForJs: `document.querySelector('[data-testid^="machine-card-"][data-settled="true"]')`,
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
    dwellMs: 2600,
  },
  {
    label: "hold on the finished tree",
    dwellMs: 1800,
  },
];
