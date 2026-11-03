// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The verdicts of the packaging resume check (app-shell-44, DR-217), kept
// apart from its processes so its tests can feed them recorded outcomes.

/** Why the fresh call on `explicit` failed, or undefined where it held. */
export function freshVerdict({ explicit, requests }) {
  if (requests.length !== 1 || requests[0] !== explicit) {
    return `the fresh call on ${explicit} sent ${JSON.stringify(requests)}, expected one request naming it`;
  }
  return undefined;
}

/** Why the resume of the fresh call's session failed, or undefined
 * where it resumed that session on the changed default. */
export function resumeVerdict({ explicit, changedDefault, freshToken, resumeToken, requests }) {
  if (resumeToken !== freshToken) {
    return `the resume of session ${freshToken} ended in session ${resumeToken ?? "(none)"}; ` +
      "Claude Code started a new session in place of the resume, so the request it sent shows nothing of a resumed one";
  }
  if (requests.length === 1 && requests[0] === explicit) {
    return `Claude Code restored the session's earlier model ${explicit} on a resume with no model, instead of the current default ${changedDefault}; ` +
      "Cligent's admission of a resumed Claude call on the provider default (0.38.0) no longer holds for this Claude Code";
  }
  if (requests.length !== 1 || requests[0] !== changedDefault) {
    return `the resume with no model sent ${JSON.stringify(requests)}, expected one request naming the current default ${changedDefault}`;
  }
  return undefined;
}
