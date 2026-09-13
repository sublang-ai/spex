// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent's directive blocks as the thread reads them (DR-058,
// playbook-library-53): the core's own parser, so the pane draws as a
// card exactly the block the core acted on, and shows as code with a
// caption exactly the block the core left as code — one reading of a
// reply, never two.

export {
  parseSpexBlock,
  splitDirectives,
  type Directive,
  type TextPart,
} from "@sublang/spex-core/directives";
