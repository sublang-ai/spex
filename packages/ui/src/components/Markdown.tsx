// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const WEB_URL = /^https?:\/\//i;

/** A web link leaves the page rather than replacing it: a new tab when
 * the UI is served, the system browser on the desktop, and never a
 * referrer. A link within the app stays a plain anchor for the surface
 * that routes it. */
function link(href: string, children: React.ReactNode) {
  return WEB_URL.test(href) ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <a href={href}>{children}</a>
  );
}

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
  a: ({ href, children }) =>
    typeof href === "string" ? link(href, children) : <>{children}</>,
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
    typeof href === "string" && WEB_URL.test(href) ? (
      link(href, children)
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
