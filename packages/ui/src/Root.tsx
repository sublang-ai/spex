// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The root the language owns (localization-3). Every text is read from
// the catalog as it renders, so a change of language must re-render
// the whole app: the resolved language is the app's key, and nothing
// else in the tree subscribes to it.

import { App } from "./App.js";
import { useAppStore } from "./state/store.js";

export function Root() {
  const resolved = useAppStore((state) => state.language.resolved);
  return <App key={resolved} />;
}
