// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Remote images are stripped (only data: URIs render): transcripts can
// carry untrusted markdown, and remote fetches would leak activity.
// Links stay clickable — the desktop shell routes them to the system
// browser and the CSP blocks in-place navigation.
const components: Components = {
  img: ({ src, alt }) =>
    typeof src === "string" && src.startsWith("data:") ? (
      <img src={src} alt={alt ?? ""} />
    ) : (
      <span className="text-xs text-neutral-400">
        [external image blocked: {alt || "image"}]
      </span>
    ),
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
