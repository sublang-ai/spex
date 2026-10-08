// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Your own group's configuration in a Spex home (storage-1, DR-103): the
// clone of the spex repository `home.yaml` records as your own group's,
// read once a core has written the home; a one-segment value of an
// earlier file names `<value>/<value>-spex` (storage-2).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export function ownConfigPath(home) {
  const { own } = parse(readFileSync(join(home, "home.yaml"), "utf8"));
  const key = own.includes("/") ? own : `${own}/${own}-spex`;
  return join(home, "workspace", ...key.split("/"), "config", "playbook.config.yaml");
}
