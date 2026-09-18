// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Translated text with something inside it — a link, a code span, a
// bold run (localization-4). The catalog holds one whole sentence with
// numbered tags, so a translator moves the tagged run wherever the
// language wants it and no text is assembled from fragments:
//
//   <Rich
//     text={i18n._("Read the <0>spec</0> first")}
//     components={[<a href="…" key="spec" />]}
//   />
//
// The text handed in is already translated; this only splits it on its
// tags and clones each component around what the tag holds. A
// self-closing `<0/>` renders the component with no children of its
// own. No provider, no context — the renderer has none.

import { cloneElement, Fragment, type ReactElement, type ReactNode } from "react";

export interface RichProps {
  /** Already-translated text carrying `<n>…</n>` and `<n/>` tags. */
  text: string;
  /** The element each tag index stands for; a tag past the end and its
   * markup render as the plain text they are, so a stray tag in a
   * translation degrades rather than throws. */
  components: readonly ReactElement[];
}

const TOKENS = /(<\/?\d+\/?>)/g;
const TAG = /^<(\/)?(\d+)(\/)?>$/;

interface Frame {
  index?: number;
  token: string;
  children: ReactNode[];
}

export function splitRich(
  text: string,
  components: readonly ReactElement[],
): ReactNode[] {
  const stack: Frame[] = [{ token: "", children: [] }];
  let key = 0;
  const push = (node: ReactNode): void => {
    stack[stack.length - 1].children.push(node);
  };

  for (const token of text.split(TOKENS)) {
    if (token === "") continue;
    const tag = TAG.exec(token);
    const element = tag ? components[Number(tag[2])] : undefined;
    if (!tag || !element) {
      push(token);
      continue;
    }
    const index = Number(tag[2]);
    if (tag[3]) {
      // <n/>
      push(cloneElement(element, { key: `rich-${(key += 1)}` }));
    } else if (!tag[1]) {
      // <n>
      stack.push({ index, token, children: [] });
    } else if (stack.length > 1 && stack[stack.length - 1].index === index) {
      // </n> closing the frame it opened
      const frame = stack.pop()!;
      push(
        cloneElement(
          element,
          { key: `rich-${(key += 1)}` },
          ...(frame.children as ReactNode[]),
        ),
      );
    } else {
      push(token);
    }
  }

  // An unclosed tag keeps its own markup and its content, in place.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    stack[stack.length - 1].children.push(frame.token, ...frame.children);
  }
  return stack[0].children;
}

export function Rich({ text, components }: RichProps) {
  const nodes = splitRich(text, components);
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </>
  );
}
