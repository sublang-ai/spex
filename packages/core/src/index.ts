// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

export const CORE_NAME = "@sublang/spex-core";

export * from "./protocol.js";
export * from "./config.js";
export { Store } from "./store.js";
export {
  SessionManager,
  CoreError,
  type CaptainFactory,
  type RecordEnvelope,
  type SessionManagerOptions,
} from "./session.js";
export { CoreService, createCoreService, type CoreServiceOptions } from "./service.js";
