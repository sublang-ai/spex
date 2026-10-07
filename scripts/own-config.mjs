// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Your own group's configuration in a Spex home (storage-1, DR-103): the
// clone `home.yaml` names under `workspace/`, read once a core has
// written the home.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export function ownConfigPath(home) {
  const { own } = parse(readFileSync(join(home, "home.yaml"), "utf8"));
  return join(home, "workspace", own, `${own}-spex`, "config", "playbook.config.yaml");
}
