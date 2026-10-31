// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { useEffect, useState } from "react";
import { usePlaceStore } from "../state/place-context.js";
import { openExternalBridge } from "../lib/space.js";
import { i18n } from "../i18n.js";

/** The package account is independent of the project's Space and seat. */
export function RegistryAccount({ repository }: { repository: string }) {
  const store = usePlaceStore();
  const environment = store((state) => state.environments[repository]);
  const origin = environment?.registry?.origin;
  const account = store((state) => origin ? state.registryAccounts?.[origin] : undefined);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(origin ?? "");
    if (origin) void (async () => { try { await store.getClient().command("registry.get", { origin }); } catch { setError(i18n._("The registry could not be read. Try again.")); } })();
  }, [origin, store]);
  async function act(kind: "signin" | "signout" | "cancel" | "set"): Promise<void> {
    setBusy(true); setError(undefined);
    try {
      if (!origin) return;
      if (kind === "set") {
        await store.getClient().command("environment.registry.set", { repository, origin: value });
      } else if (kind === "signin") {
        const reply = await store.getClient().command("registry.signin.start", { origin });
        if (reply.flow === "browser") await openExternalBridge()?.(reply.url);
      } else if (kind === "signout") await store.getClient().command("registry.signout", { origin });
      else await store.getClient().command("registry.signin.cancel", { origin });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  if (!origin) return null;
  const running = account?.signIn.phase === "running" ? account.signIn : undefined;
  const button = "rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700";
  return <section data-testid="registry-account" className="flex flex-col gap-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <strong>{i18n._("Package registry")}</strong><span>{account?.displayName ?? new URL(origin).host}</span>
      <span>{account?.account ? `@${account.account.login}` : i18n._("Not signed in to registry")}</span>
      {running ? <button className={button} disabled={busy} onClick={() => void act("cancel")}>{i18n._("Cancel")}</button>
        : <button className={button} disabled={busy} onClick={() => void act(account?.account ? "signout" : "signin")}>{account?.account ? i18n._("Sign out of registry") : i18n._("Sign in to registry")}</button>}
    </div>
    {running?.flow === "browser" ? <a className="text-sm underline" href={running.url} target="_blank" rel="noreferrer">{i18n._("Continue registry sign-in")}</a> : null}
    {running?.flow === "device" ? <div className="text-sm"><code>{running.userCode}</code> <a className="underline" href={running.verificationUri} target="_blank" rel="noreferrer">{i18n._("Continue registry sign-in")}</a></div> : null}
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void act("set"); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{i18n._("Registry URL")}<input aria-label={i18n._("Registry URL")} type="url" required value={value} onChange={(event) => setValue(event.target.value)} className="min-w-0 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" /></label>
      <button className={button} disabled={busy || (value === origin && !environment?.registry?.legacy) || !!running}>{i18n._("Use registry")}</button>
    </form>
    {environment?.registry?.legacy ? <p className="text-xs text-neutral-500">{i18n._("This environment keeps its previous package destination until you choose a registry.")}</p> : null}
    {error || account?.error ? <p role="alert" className="text-xs text-red-600">{error ?? account?.error}</p> : null}
  </section>;
}
