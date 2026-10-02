// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { activateLanguage } from "../i18n.js";
import { BrowserControl, type BrowserControlProps } from "./BrowserControl.js";

afterEach(() => { cleanup(); activateLanguage("en"); });

const props = (): BrowserControlProps => ({
  enabled: false,
  supported: true,
  preparation: { status: "idle" },
  onChange: vi.fn(),
  onPrepare: vi.fn(),
  onCancel: vi.fn(),
});

test("settings-43: preparation does not authorize tools and host updates drive its status", () => {
  const model = props();
  const { rerender } = render(<BrowserControl {...model} />);
  expect(screen.getByText("Isolated browser on the computer running this session")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
  expect(model.onPrepare).toHaveBeenCalledOnce();
  expect(model.onChange).not.toHaveBeenCalled();
  rerender(<BrowserControl {...model} preparation={{ status: "preparing", detail: "Downloading Chromium: 48%" }} />);
  expect(screen.getByRole("status").textContent).toContain("Downloading Chromium: 48%");
  fireEvent.click(screen.getByRole("button", { name: "Cancel browser setup" }));
  expect(model.onCancel).toHaveBeenCalledOnce();
  rerender(<BrowserControl {...model} preparation={{ status: "failed", detail: "Required browser libraries are missing. Install the named packages." }} />);
  expect(screen.getByText("Browser setup failed")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Install the named packages.");
  fireEvent.click(screen.getByRole("button", { name: "Retry browser setup" }));
  expect(model.onPrepare).toHaveBeenCalledTimes(2);
  rerender(<BrowserControl {...model} preparation={{ status: "ready" }} />);
  expect((screen.getByRole("checkbox", { name: "Browser" }) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText("Browser ready")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Browser" }));
  expect(model.onChange).toHaveBeenCalledWith(true);
  expect(model.onPrepare).toHaveBeenCalledTimes(2);
});

test("settings-43: unsupported and disabled choices are safe, while stale values remain clearable", () => {
  const model = props();
  const { rerender } = render(<BrowserControl {...model} supported={false} unsupportedReason="This adapter cannot admit browser tools" />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("This adapter cannot admit browser tools");
  rerender(<BrowserControl {...model} supported={false} enabled />);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(model.onChange).toHaveBeenCalledWith(false);
  model.onChange = vi.fn();
  rerender(<BrowserControl {...model} enabled disabled />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Set up browser" }));
  expect(model.onChange).not.toHaveBeenCalled();
  expect(model.onPrepare).not.toHaveBeenCalled();
});

test("settings-43: a conversation reset is explicit and supplied labels follow the UI language", () => {
  const model = props();
  const onReset = vi.fn();
  const { rerender } = render(<BrowserControl {...model} enabled inherited={false} onReset={onReset} />);
  expect(screen.getByText("Changed for this conversation")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Use browser setting from Settings" }));
  expect(onReset).toHaveBeenCalledOnce();
  rerender(<BrowserControl {...model} inherited onReset={onReset} />);
  expect(screen.getByText("From Settings")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use browser setting from Settings" })).toBeNull();
  activateLanguage("zh");
  rerender(<BrowserControl {...model} preparation={{ status: "preparing", detail: "正在验证浏览器启动" }} />);
  expect(screen.getByRole("checkbox", { name: "浏览器" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("正在验证浏览器启动");
  expect(screen.getByRole("button", { name: "取消浏览器设置" })).toBeTruthy();
});
