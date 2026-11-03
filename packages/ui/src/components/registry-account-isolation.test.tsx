// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setClientForTests, useAppStore } from "../state/store.js";
import { useRegistrySignIn } from "./RegistryAccount.js";

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
});

function Account({ origin }: { origin: string }) {
  const account = useRegistrySignIn(origin);
  return <div>
    <button data-testid="start" disabled={account.busy} onClick={() => void account.start()}>Sign in</button>
    <span data-testid="busy">{String(account.busy)}</span>
    <span data-testid="flow">{account.running?.flow === "device" ? account.running.verificationUri : account.running?.url}</span>
    <span data-testid="error">{account.error}</span>
  </div>;
}

test("playbook-library-119: delayed registry sign-in replies stay with their origin and cannot replace another registry's flow", async () => {
  const first = "https://first-registry.example";
  const second = "https://second-registry.example";
  const held = new Map<string, (value: unknown) => void>();
  const command = vi.fn((type: string, input: { origin: string }) => {
    expect(type).toBe("registry.signin.start");
    return new Promise((resolve) => held.set(input.origin, resolve));
  });
  setClientForTests({ command } as unknown as Parameters<typeof setClientForTests>[0]);
  useAppStore.setState({ registryAccounts: {} });
  const page = render(<Account origin={first} />);
  fireEvent.click(screen.getByTestId("start"));
  expect(screen.getByTestId("busy").textContent).toBe("true");

  page.rerender(<Account origin={second} />);
  expect(screen.getByTestId("busy").textContent).toBe("false");
  expect(screen.getByTestId("flow").textContent).toBe("");
  fireEvent.click(screen.getByTestId("start"));
  await act(async () => held.get(second)!({ flow: "device", verificationUri: `${second}/device` }));
  expect(screen.getByTestId("flow").textContent).toBe(`${second}/device`);
  await act(async () => held.get(first)!({ flow: "device", verificationUri: `${first}/device` }));
  expect(screen.getByTestId("flow").textContent).toBe(`${second}/device`);
  expect(screen.getByTestId("busy").textContent).toBe("false");
  expect(command.mock.calls.map(([, input]) => input.origin)).toEqual([first, second]);
});

test("playbook-library-119: a failed sign-in at a former registry neither reports an error nor clears the current registry's pending action", async () => {
  const first = "https://first-registry.example";
  const second = "https://second-registry.example";
  const held = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const command = vi.fn((_type: string, input: { origin: string }) => new Promise((resolve, reject) => held.set(input.origin, { resolve, reject })));
  setClientForTests({ command } as unknown as Parameters<typeof setClientForTests>[0]);
  useAppStore.setState({ registryAccounts: {} });
  const page = render(<Account origin={first} />);
  fireEvent.click(screen.getByTestId("start"));
  page.rerender(<Account origin={second} />);
  fireEvent.click(screen.getByTestId("start"));
  await act(async () => held.get(first)!.reject(new Error("First registry refused")));
  expect(screen.getByTestId("error").textContent).toBe("");
  expect(screen.getByTestId("busy").textContent).toBe("true");
  await act(async () => held.get(second)!.resolve({ flow: "device", verificationUri: `${second}/device` }));
  expect(screen.getByTestId("busy").textContent).toBe("false");
  expect(screen.getByTestId("flow").textContent).toBe(`${second}/device`);
});

test("playbook-library-119: a registry control removed before its browser sign-in reply never opens the former registry's browser flow", async () => {
  const origin = "https://former-registry.example";
  let finish!: (value: unknown) => void;
  const command = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const openExternal = vi.fn(async () => true);
  const nativeWindow = window as unknown as { spexNative?: { openExternal: typeof openExternal } };
  const previous = nativeWindow.spexNative;
  nativeWindow.spexNative = { openExternal };
  try {
    setClientForTests({ command } as unknown as Parameters<typeof setClientForTests>[0]);
    useAppStore.setState({ registryAccounts: {} });
    const page = render(<Account origin={origin} />);
    fireEvent.click(screen.getByTestId("start"));
    page.unmount();
    await act(async () => finish({ flow: "browser", url: `${origin}/login?scope=registry` }));
    expect(openExternal).not.toHaveBeenCalled();
  } finally {
    if (previous) nativeWindow.spexNative = previous;
    else delete nativeWindow.spexNative;
  }
});
