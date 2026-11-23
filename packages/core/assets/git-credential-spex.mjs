// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A credential issued for one Git child is scoped to its permitted origin.
import { readFileSync } from "node:fs";

const operation = process.argv[2];

const request = [];
process.stdin.on("data", (chunk) => request.push(chunk));
process.stdin.on("error", () => {});
process.stdin.on("end", () => answerChild(Buffer.concat(request).toString("utf8")));

function answerChild(text) {
  if (operation !== "get") return;
  const file = process.env.SPEX_GIT_CREDENTIAL_FILE;
  if (!file) return;
  let lines;
  try {
    lines = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const scope = lines.split("\n").find((line) => line.startsWith("origin="))?.slice(7);
  if (scope !== undefined) {
    const fields = new Map(text.split("\n").map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
    const protocol = fields.get("protocol"), host = fields.get("host");
    if ((protocol !== "http" && protocol !== "https") || !host || /[\s/@?#]/.test(host)) return;
    try { if (new URL(`${protocol}://${host}`).origin !== scope) return; }
    catch { return; }
  }
  const kept = lines
    .split("\n")
    .filter((line) => line.startsWith("username=") || line.startsWith("password="));
  if (kept.length === 0) return;
  process.stdout.write(`${kept.join("\n")}\n\n`);
}
