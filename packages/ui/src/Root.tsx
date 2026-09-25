// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The root the language owns (localization-3). Every text is read from
// the catalog as it renders, so a change of language must re-render
// the whole app: this root subscribes to the resolved language, and a
// change re-renders it and, with it, the whole tree beneath — nothing
// under it is memoized, and nothing else subscribes to the language.
// The tree is re-rendered, not remounted, so the page keeps what it
// holds: an unsaved draft, a form under edit, a message being typed.

import { App } from "./App.js";
import { useAppStore } from "./state/store.js";

export function Root() {
  // Read only to re-render on a change; the tree reads the catalog.
  useAppStore((state) => state.language.resolved);
  return <App />;
}
