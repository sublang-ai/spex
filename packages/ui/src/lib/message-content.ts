// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { MessageContent } from "@sublang/spex-core/protocol";
import { i18n } from "../i18n.js";

/** File names are display labels only; the submitted text is never invented. */
export function contentTitle(content: MessageContent): string {
  const first = content.text.split(/\r?\n/, 1)[0] ?? "";
  return first.trim() ? first : content.attachments?.map((asset) => asset.name ?? i18n._("Attachment")).join(", ") || content.text;
}
