<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

The machine graphs the core serves for the installed built-in
playbooks, captured from `resolveArtifacts` so the drawing's geometry
law (run-view-77) is checked against the shapes that actually ship —
not only against a fixture that poses the cases it already knows.

Refresh with:

```
node --input-type=module -e "
import { resolveArtifacts } from './packages/core/dist/artifacts.js';
import { writeFileSync } from 'node:fs';
for (const id of ['code','review','decide','dev']) {
  const a = await resolveArtifacts({ id, from: '@sublang/playbook/' + id + '/registry' });
  writeFileSync('packages/ui/src/fixtures/machines/' + id + '.json', JSON.stringify(a.machine, null, 2) + '\n');
}
"
```
