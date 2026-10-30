// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex remove <org>/<pkg>`, or `spex rm` (cli-3, environments-15): drop
// the request from `spex.yaml`, resolve, install and export what remains,
// and print each spec package the lock lost; a name `spex.yaml` does not
// request is refused before any write.

import { RequestsError, setRequest } from "../lib/environment/index.js";
import { VersionConflictError } from "../lib/files.js";
import { settleAndTell } from "./add.js";
import { Environment, shown } from "./environment.js";
import { parsed, Refusal, type Command } from "./run.js";

export const remove: Command = async (args) => {
  const { positionals } = parsed("remove", args, {}, { min: 1, max: 1, usage: "<org>/<pkg>" });
  const name = positionals[0]!;
  const env = new Environment();
  const read = env.readRequests();
  if (!read || !Object.hasOwn(read.requests.packages, name)) {
    throw new Refusal(`${name} is not requested in ${read ? shown(env.root, env.requestsFile) : `${env.root}, which holds no spex.yaml`}`);
  }
  try {
    await setRequest(env.requestsFile, name, null);
  } catch (error) {
    if (error instanceof RequestsError || error instanceof VersionConflictError) throw new Refusal(error.message);
    throw error;
  }
  await settleAndTell(env);
};
