// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// jsdom has no canvas 2D context and says so through a console.error
// every time the spec graph measures a label. The layout already
// falls back to its deterministic estimate (spec-view-28), so the
// report is pure noise in test output — drop exactly that one
// message and let every other error through.

import { afterEach } from "vitest";

// The page mirrors a few choices into the browser's storage, and jsdom
// keeps that storage for the whole file, so one test's choice would
// become the next test's stored precondition. Each test starts with an
// empty mirror; where the host's storage refuses (Node 25's own global
// stands in for jsdom's and answers no call), there is nothing to clear.
afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // no storage to clear
  }
});

const realError = console.error;

console.error = (...args: unknown[]) => {
  // jsdom reports it as an Error whose stack leads the first argument.
  const first = args[0];
  const message =
    first instanceof Error
      ? first.message
      : typeof first === "string"
        ? first
        : "";
  // jsdom words this differently across majors ("…prototype.getContext"
  // before 29, "…'s getContext() method" after), so match the pair.
  if (message.includes("Not implemented:") && message.includes("getContext")) {
    return;
  }
  realError(...args);
};
