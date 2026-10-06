// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Spex's Git credential helper (git-host-9), run by Git as
// `"<runtime>" "<this file>" <operation>` on the app's own runtime. It
// answers `get` with the username and password in the file named by
// SPEX_GIT_CREDENTIAL_FILE — written owner-only by the core for one Git
// child and removed when that child ends — and ignores `store` and
// `erase`, so the brokered secret never reaches another helper's store.
// Git's request arrives on stdin and is read to its end first.

import { readFileSync } from "node:fs";

const operation = process.argv[2];

process.stdin.on("data", () => {});
process.stdin.on("error", () => {});
process.stdin.on("end", answer);

function answer() {
  if (operation !== "get") return;
  const file = process.env.SPEX_GIT_CREDENTIAL_FILE;
  if (!file) return;
  let lines;
  try {
    lines = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const kept = lines
    .split("\n")
    .filter((line) => line.startsWith("username=") || line.startsWith("password="));
  if (kept.length === 0) return;
  process.stdout.write(`${kept.join("\n")}\n\n`);
}
