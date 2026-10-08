// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

export const CORE_NAME = "@sublang/spex-core";

export * from "./protocol.js";
export * from "./config.js";
export { Store, type SpexRepository } from "./store.js";
export { Home, defaultOwnName, hostUrlFor, type HomeFile } from "./home.js";
export { StateRootHeldError, StateRootLeaseError, acquireRootLease, type RootLease } from "./root-lease.js";
export {
  SessionManager,
  CoreError,
  type CaptainFactory,
  type RecordEnvelope,
  type SessionManagerOptions,
} from "./session.js";
export { CoreService, createCoreService, type CoreServiceOptions } from "./service.js";
export { suppliedScaffold, type SuppliedScaffold } from "./forge.js";
export {
  checkToolchain,
  compilerAgentEnv,
  moduleDirectoriesAbove,
  suppliedCompiler,
  type CompilerAgent,
  type ToolchainRuntime,
  type ToolchainStatus,
} from "./compile.js";
