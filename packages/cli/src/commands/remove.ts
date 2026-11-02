// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex remove <org>/<pkg>`, or `spex rm` (cli-3, environments-15): take
// the package out of `spex.yaml`, resolve, install and export what
// remains, and print each package removed, an edited copy of its spec
// left in `specs/` as the project's own and read as edited, in the words
// `spex list` uses (environments-41, DR-172). A package
// `spex.yaml` does not add is refused before any write; the built-in
// one is removed as any other (DR-176).

import { RequestsError, setRequest } from "../lib/environment/index.js";
import { VersionConflictError } from "../lib/files.js";
import { settleAndTell } from "./add.js";
import { Environment, shown } from "./environment.js";
import { parsed, Refusal, type Command } from "./run.js";

export const remove: Command = async (args) => {
  const { positionals } = parsed("remove", args, {}, { min: 1, max: 1 });
  const name = positionals[0]!;
  const env = new Environment();
  const read = env.readRequests();
  if (!read || !Object.hasOwn(read.requests.packages, name)) throw new Refusal(`${name} is not in spex.yaml — spex list shows what is added`);
  try {
    await setRequest(env.requestsFile, name, null);
  } catch (error) {
    if (error instanceof VersionConflictError) throw new Refusal(`${shown(env.root, error.file)} changed meanwhile — retry`);
    if (error instanceof RequestsError) throw new Refusal(`${error.message} — fix the file, then retry`);
    throw error;
  }
  await settleAndTell(env);
};
