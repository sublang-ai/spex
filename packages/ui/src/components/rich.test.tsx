// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// localization-4: a whole sentence with something inside it stays one
// catalog entry. The tags are numbered, so a translation may move them
// or reorder them, and the text is never assembled from fragments.

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Rich } from "./Rich.js";

afterEach(cleanup);

describe("Rich", () => {
  test("a tagged run becomes its component, keeping the text around it", () => {
    render(
      <p data-testid="line">
        <Rich
          text="Read the <0>spec</0> first"
          components={[<a href="/spec" key="spec" />]}
        />
      </p>,
    );
    const line = screen.getByTestId("line");
    expect(line.textContent).toBe("Read the spec first");
    const link = screen.getByRole("link", { name: "spec" });
    expect(link.getAttribute("href")).toBe("/spec");
  });

  test("a translation may reorder and repeat what the English tagged", () => {
    render(
      <p data-testid="line">
        <Rich
          text="先读<0>规约</0>，再看<1>仓库</1>"
          components={[<a href="/spec" key="s" />, <a href="/repo" key="r" />]}
        />
      </p>,
    );
    expect(screen.getByTestId("line").textContent).toBe("先读规约，再看仓库");
    expect(screen.getByRole("link", { name: "规约" }).getAttribute("href")).toBe(
      "/spec",
    );
    expect(screen.getByRole("link", { name: "仓库" }).getAttribute("href")).toBe(
      "/repo",
    );
  });

  test("a self-closing tag renders its component with no children", () => {
    render(
      <p data-testid="line">
        <Rich
          text="Press <0/> to send"
          components={[<kbd key="k">Enter</kbd>]}
        />
      </p>,
    );
    expect(screen.getByTestId("line").textContent).toBe("Press Enter to send");
  });

  test("nested tags each take their own component", () => {
    render(
      <p data-testid="line">
        <Rich
          text="A <0>bold <1>link</1></0> here"
          components={[<strong key="b" />, <a href="/x" key="a" />]}
        />
      </p>,
    );
    expect(screen.getByTestId("line").textContent).toBe("A bold link here");
    expect(screen.getByRole("link", { name: "link" })).toBeTruthy();
    expect(screen.getByTestId("line").querySelector("strong")?.textContent).toBe(
      "bold link",
    );
  });

  test("a tag with no component, and an unclosed one, degrade to their text", () => {
    render(
      <p data-testid="line">
        <Rich text="Keep <3>this</3> and <0>that" components={[<em key="e" />]} />
      </p>,
    );
    expect(screen.getByTestId("line").textContent).toBe(
      "Keep <3>this</3> and <0>that",
    );
  });
});
