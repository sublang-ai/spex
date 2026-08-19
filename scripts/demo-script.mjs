// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The viewing the demo recording performs. The agents are real and
// take as long as they take; only the camera is scripted.

const PROMPT =
  process.env.DEMO_PROMPT ??
  // Short, and complete enough that the run has no reason to stop and
  // ask: it names the file, the spec item the code breaks, and the
  // evidence. The repo carries the spec, so nothing has to be invented.
  "/code src/slugify.js leaves the edge separators as hyphens — three tests fail against slugify-2 and slugify-3. Fix it.";

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
    // The quick-start card is what a first run opens on, and its
    // dismissal lives in localStorage — a previous take would hide it
    // from this one. The flag is cleared and the app reloaded, since
    // the card reads it once at mount.
    label: "start from a first-run frame",
    js: `
      window.localStorage.removeItem("spex.quickStartDismissed");
      window.location.reload();
      return true;
    `,
    dwellMs: 2500,
  },
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
    label: "settle after the reload",
    js: `
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (document.querySelector('[data-testid="quick-start"]')) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return { abort: "quick start never rendered" };
    `,
    dwellMs: 600,
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
      // The /code drawing is 564px wide and the default split gives
      // the column 413, so the divider is nudged the way a reader
      // would nudge it (run-view-81). Eight steps of 2% take 34% to
      // 50%, which is 608px — the drawing and its breathing room.
      const divider = document.querySelector('[data-testid="captain-divider"]');
      if (!divider) return { abort: "no divider" };
      // Home restores the default first, so a re-record starts from
      // the same place a first-time reader would.
      divider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      );
      await new Promise((r) => setTimeout(r, 120));
      for (let step = 0; step < 8; step += 1) {
        divider.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 90));
      }
      return document.querySelector('[data-testid="captain-column"]').style.width;
    `,
    dwellMs: 700,
  },
  {
    // A run that parks on a question waits for a human, so the demo
    // answers as a human would and lets it carry on. The tightened
    // prompt makes this rare; leaving it unhandled would make the
    // recording hang on the one run that asks.
    label: "the run: /code opens, calls /review, and settles",
    // The stretch where there is nothing for a reader to do but wait.
    fast: true,
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
    timeoutMs: 1_800_000,
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
    // The point of the tree is the machine /code called, so the demo
    // opens it too: two settled drawings, one inside the other.
    label: "open the called machine — the point of the tree",
    js: `
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const root = document.querySelector('[data-testid^="machine-card-"][data-settled="true"]');
      const child = root?.querySelector('[data-testid^="machine-card-"]');
      if (!child) return { abort: "no nested card" };
      child.scrollIntoView({ block: "center" });
      await wait(600);
      const disclose = child.querySelector('[data-testid^="machine-disclose-"]');
      if (disclose) disclose.click();
      await wait(900);
      child.scrollIntoView({ block: "center", behavior: "smooth" });
      await wait(900);
      return child.getAttribute("data-playbook");
    `,
    dwellMs: 3200,
  },
  {
    label: "hold on the finished tree",
    dwellMs: 2200,
  },
];
