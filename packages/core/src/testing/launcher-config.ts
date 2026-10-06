// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The playbook CLI's own config for a fixture that runs the CLI beside
// the core: Playbook's launcher still loads each playbook from a `from`
// in its config, while Spex's config names none and takes each module
// from an environment (DR-104, environments-9). Each built-in entry the
// Spex config enables is named by the module given for it — the one a
// session was launched on — else the package's own registry specifier,
// which the installed Playbook exports.

import { isMap, isScalar, parseDocument } from "yaml";

export function launcherConfig(spexConfig: string, modules: Readonly<Record<string, string>> = {}): string {
  const document = parseDocument(spexConfig);
  const playbooks = document.get("playbooks", true);
  if (!isMap(playbooks)) return spexConfig;
  for (const item of playbooks.items) {
    const id = isScalar(item.key) ? String(item.key.value) : String(item.key);
    if (!document.hasIn(["playbooks", id, "from"])) document.setIn(["playbooks", id, "from"], modules[id] ?? `@sublang/playbook/${id}/registry`);
  }
  return document.toString();
}
