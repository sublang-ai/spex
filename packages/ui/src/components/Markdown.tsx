// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { i18n } from "../i18n.js";

const WEB_URL = /^https?:\/\//i;

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

/** Drop comment nodes after parsing, so literal examples in code survive. */
function omitComments() {
  return function visit(node: MarkdownNode): void {
    if (!node.children) return;
    node.children = node.children.filter((child) => {
      if (child.type !== "html") return true;
      child.value = child.value?.replace(/<!--[\s\S]*?-->/g, "");
      return Boolean(child.value?.trim());
    });
    node.children.forEach(visit);
  };
}

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
        {i18n._("[external image blocked: {alt}]", {
          alt:
            alt ||
            i18n._({
              id: "image",
              comment: "stands in for a blocked image that carried no alt text",
            }),
        })}
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
  hideComments = false,
}: {
  text: string;
  /** Authored spec views hide source metadata; their editor keeps the bytes. */
  hideComments?: boolean;
  /** "routed" — the surface handles every link it renders; "web-only"
   * — agent text, where only an openable target is a link. */
  links?: "routed" | "web-only";
}) {
  // An unbroken token — a long URL, a hash, a path — breaks anywhere
  // rather than widening its pane sideways (run-view-3, DR-041), and a
  // code block wraps its long lines the same way.
  return (
    <div className="markdown min-w-0 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={hideComments ? [remarkGfm, omitComments] : [remarkGfm]}
        components={links === "web-only" ? transcriptComponents : components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
