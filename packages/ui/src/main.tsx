// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { useAppStore } from "./state/store.js";
import "./index.css";

// No single render bug may ever blank the whole window: the boundary
// keeps the shell alive and offers a reload.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
          <h1 className="text-lg font-semibold">Something broke in the UI</h1>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-2 text-left text-xs text-red-600 dark:bg-neutral-900">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

useAppStore.getState().connect();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
