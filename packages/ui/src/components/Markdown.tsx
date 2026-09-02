// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Remote images are stripped (only data: URIs render): transcripts can
// carry untrusted markdown, and remote fetches would leak activity.
const components: Components = {
  img: ({ src, alt }) =>
    typeof src === "string" && src.startsWith("data:") ? (
      <img src={src} alt={alt ?? ""} />
    ) : (
      <span className="text-xs text-neutral-500">
        [external image blocked: {alt || "image"}]
      </span>
    ),
};

/** Transcript rendering: an agent cites a repo path or a spec anchor
 * as freely as it cites a URL, and the shell opens only `http(s)` —
 * everything else it drops. A target nothing can open therefore reads
 * as text rather than as a promise the app cannot keep (run-view-83).
 * Authored surfaces (the spec view's own citations) keep their links,
 * because there the app does route them. */
const transcriptComponents: Components = {
  ...components,
  a: ({ href, children }) =>
    typeof href === "string" && /^https?:\/\//i.test(href) ? (
      <a href={href}>{children}</a>
    ) : (
      <span title={typeof href === "string" ? href : undefined}>
        {children}
      </span>
    ),
};

export function Markdown({
  text,
  links = "routed",
}: {
  text: string;
  /** "routed" — the surface handles every link it renders; "web-only"
   * — agent text, where only an openable target is a link. */
  links?: "routed" | "web-only";
}) {
  return (
    <div className="markdown text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={links === "web-only" ? transcriptComponents : components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
