// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LICENSING_SEED_PATH = "specs/packages/licensing.md";

/**
 * The placeholders the bundled licensing seed carries in `licensing-9`.
 * A placeholder the scaffold cannot resolve stays in the file, so an
 * agent reading it sees an unresolved value rather than a holder
 * copied from the template's own upstream SPDX line.
 */
const HOLDER_PLACEHOLDER = "<holder>";
const LICENSE_PLACEHOLDER = "<license>";
const YEAR_PLACEHOLDER = "<year>";

export interface PinHeaderFormatOptions {
  /** Whether the target root `LICENSE` is the bundled Apache-2.0 text. */
  apacheLicense: boolean;
  /** Clock override for tests. */
  now?: Date;
}

export interface PinnedHeaderFormat {
  /** Placeholders left unresolved, in file order. */
  unresolved: string[];
}

function readGitConfig(basePath: string, key: string): string | undefined {
  try {
    const value = execFileSync("git", ["config", "--get", key], {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

/**
 * Derive the project's copyright holder from the git identity the
 * scaffold runs under: `user.name`, with ` <user.email>` appended when
 * an email is configured. Undefined when no name is configured.
 */
export function resolveCopyrightHolder(basePath: string): string | undefined {
  const name = readGitConfig(basePath, "user.name");
  if (name === undefined) return undefined;
  const email = readGitConfig(basePath, "user.email");
  return email === undefined ? name : `${name} <${email}>`;
}

/**
 * Pin the project's own header format into the licensing seed just
 * written: the current year, the git identity as the holder, and
 * `Apache-2.0` when the root LICENSE is the bundled text. Whatever
 * cannot be resolved keeps its placeholder and is reported.
 */
export function pinHeaderFormat(
  basePath: string,
  options: PinHeaderFormatOptions,
): PinnedHeaderFormat {
  const target = join(basePath, LICENSING_SEED_PATH);
  if (!existsSync(target)) return { unresolved: [] };

  const year = String((options.now ?? new Date()).getFullYear());
  const holder = resolveCopyrightHolder(basePath);
  const license = options.apacheLicense ? "Apache-2.0" : undefined;

  let content = readFileSync(target, "utf-8").replaceAll(YEAR_PLACEHOLDER, year);
  if (license !== undefined) {
    content = content.replaceAll(LICENSE_PLACEHOLDER, license);
  }
  if (holder !== undefined) {
    content = content.replaceAll(HOLDER_PLACEHOLDER, holder);
  }
  writeFileSync(target, content);

  const unresolved: string[] = [];
  if (license === undefined) unresolved.push(LICENSE_PLACEHOLDER);
  if (holder === undefined) unresolved.push(HOLDER_PLACEHOLDER);
  return { unresolved };
}

/** The stderr warning for each placeholder `pinHeaderFormat` left. */
export function warnUnresolvedHeaderFormat(unresolved: string[]): void {
  for (const placeholder of unresolved) {
    const reason =
      placeholder === HOLDER_PLACEHOLDER
        ? "no git user.name is configured"
        : "the root LICENSE is not the bundled Apache-2.0 text";
    const value =
      placeholder === HOLDER_PLACEHOLDER
        ? "the project's copyright holder"
        : "the project's SPDX license identifier";
    console.warn(
      `  warning: ${reason}, so licensing-9 in ${LICENSING_SEED_PATH} keeps its ${placeholder} placeholder; replace it with ${value}.`,
    );
  }
}
