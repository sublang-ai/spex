// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Packaging model-selection verdicts (app-shell-44, DR-238).

/** Why a fresh call failed, or undefined where its selection held. */
export function freshVerdict({ expectedModel, requests }) {
  if (requests.length !== 1 || requests[0] !== expectedModel) {
    return `the fresh call sent ${JSON.stringify(requests)}, expected one request naming ${expectedModel}`;
  }
  return undefined;
}

/** A resume must preserve identity as well as select the expected model. */
export function resumeVerdict({ expectedModel, freshToken, resumeToken, requests }) {
  if (resumeToken !== freshToken) {
    return `the resume of session ${freshToken} ended in session ${resumeToken ?? "(none)"}; ` +
      "Claude Code started a new session in place of the resume, so the request it sent shows nothing of a resumed one";
  }
  if (requests.length !== 1 || requests[0] !== expectedModel) {
    return `the resume sent ${JSON.stringify(requests)}, expected one request naming ${expectedModel}`;
  }
  return undefined;
}
