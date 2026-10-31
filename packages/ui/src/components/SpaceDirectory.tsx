// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { useEffect, useState } from "react";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";

/** Discovery offers addresses; every choice still runs its own sign-in. */
export function SpaceDirectory({ onChoose }: { onChoose(origin: string): void }) {
  const store = usePlaceStore();
  const [spaces, setSpaces] = useState<{ origin: string; displayName: string; signIn: string[] }[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try { const reply = await store.getClient().command("registry.directory", {}); if (!Array.isArray(reply?.spaces)) throw new Error("Invalid directory response"); if (active) setSpaces(reply.spaces); }
      catch { if (active) setFailed(true); }
    })();
    return () => { active = false; };
  }, [store]);
  return <div className="flex min-w-0 flex-col gap-1 text-xs" data-testid="space-directory">
    {spaces.length ? <label className="flex flex-col gap-1">{i18n._("Choose a Space or enter a custom URL")}<select defaultValue="" className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700" onChange={(event) => { if (event.target.value) onChoose(event.target.value); }}><option value="">{i18n._("Custom URL")}</option>{spaces.map((space) => <option key={space.origin} value={space.origin}>{space.displayName} — {space.origin} ({space.signIn.join(", ")})</option>)}</select></label> : null}
    {failed ? <p>{i18n._("The Space directory could not be read. Enter a custom URL.")}</p> : null}
  </div>;
}
