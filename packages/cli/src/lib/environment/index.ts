// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Spec packages and environments (DR-104): the format, requests and
// lock, the registry and Git sources, resolution, the store and
// installs, exports, the placed specs' record and marker, citations across a
// release's boundary (DR-174) and the built-in spec package.

export * from "./format.js";
export * from "./semver.js";
export * from "./requests.js";
export * from "./lock.js";
export * from "./registry.js";
export * from "./registries.js";
export * from "./git-source.js";
export * from "./resolve.js";
export * from "./store.js";
export * from "./layout.js";
export * from "./install.js";
export * from "./placed-record.js";
export * from "./marker.js";
export * from "./exports.js";
export * from "./own-paths.js";
export * from "./agent-folders.js";
export * from "./archive.js";
export * from "./tar.js";
export * from "./citations.js";
export {
  builtinLock,
  stagedBuiltinPackage,
  prepareBuiltinEnvironment,
  rehomeBuiltinLock,
  builtinRegistrySource,
  compositeRegistry,
  ensureBuiltinRequest,
  seedBuiltinPackage,
  type BuiltinPackage,
  type BuiltinRelease,
  type BuiltinSourceOptions,
} from "./builtins.js";
