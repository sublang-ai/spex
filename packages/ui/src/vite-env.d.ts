/// <reference types="vite/client" />

// The Lingui Vite plugin compiles a `.po` catalog on import
// (localization-6); it ships no client type reference of its own, so
// the module's shape is declared here.
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
