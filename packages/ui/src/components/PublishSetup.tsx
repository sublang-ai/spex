// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { DraftInfo } from "@sublang/spex-core/protocol";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { isPackageOrg, packageOrgRuleText } from "../lib/drafts.js";
import type { PublishTarget } from "../lib/environments.js";
import { PanelCloseButton } from "./PanelCloseButton.js";
import { useRegistrySignIn } from "./RegistryAccount.js";
import { PublishControl } from "./PublishControl.js";

/** Publishing defaults are read only after Publish is chosen. Manually
 * edited values survive refreshed registry/account replies (DR-217). */
export function usePublicationFields(repository: string | undefined, existingOrg: string, existingLicense?: string) {
  const store = usePlaceStore();
  const connection = store((state) => state.connection);
  const loadDraftDefaults = store((state) => state.loadDraftDefaults);
  const loadEnvironment = store((state) => state.loadEnvironment);
  const environments = store((current) => current.environments);
  const connected = connection === "open";
  const [enteredOrg, setEnteredOrg] = useState<string>();
  const [license, setLicense] = useState("");
  const [orgsReply, setOrgsReply] = useState<{
    scope: string;
    orgs: { name: string; path: string; provider?: string }[];
    status: "idle" | "loading" | "ready" | "error";
    error?: string;
  }>();
  const [orgsAttempt, setOrgsAttempt] = useState(0);
  const registryOrigin = repository ? environments[repository]?.registry?.origin : undefined;
  // Authoring can open before Packages has read the selected registry's
  // account. A Space's account establishes no publishing identity.
  const registry = useRegistrySignIn(registryOrigin, { read: true });
  const registryAccount = registry.state?.account
    ? JSON.stringify([registry.state.account.id, registry.state.account.login])
    : undefined;
  const orgsScope = JSON.stringify([repository, connected, registryOrigin, registryAccount, orgsAttempt]);
  // A former account's successful answer is unusable in the very render
  // that changes scope, before the next request's effect starts.
  const currentOrgs = orgsReply?.scope === orgsScope ? orgsReply : undefined;
  const orgs = currentOrgs?.orgs ?? [];
  const orgsStatus = currentOrgs?.status ?? "idle";
  const orgsError = currentOrgs?.error;

  // The environment names the registry its orgs are read at.
  useEffect(() => {
    if (connected && repository) void loadEnvironment(repository).catch(() => {});
  }, [connected, repository, loadEnvironment]);

  useEffect(() => {
    let active = true;
    setOrgsReply({ scope: orgsScope, orgs: [], status: "idle" });
    if (connected && repository && registryOrigin && registryAccount) void (async () => {
      setOrgsReply({ scope: orgsScope, orgs: [], status: "loading" });
      try {
        const reply = await store.getClient().command("registry.orgs", { repository }, { timeoutMs: 35_000 });
        if (active) {
          const sorted = [...reply.orgs].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
          setOrgsReply({ scope: orgsScope, orgs: sorted, status: "ready" });
        }
      } catch (cause) {
        if (active) setOrgsReply({ scope: orgsScope, orgs: [], status: "error", error: cause instanceof Error ? cause.message : i18n._({ id: "Your orgs could not be read", comment: "the registry did not answer which orgs the account may publish to" }) });
      }
    })();
    return () => { active = false; };
  }, [connected, repository, registryOrigin, registryAccount, orgsScope, store]);

  const touched = useRef({ license: false });
  useEffect(() => {
    touched.current = { license: false };
    setEnteredOrg(undefined);
    setLicense("");
  }, [repository]);
  useEffect(() => {
    if (!connected || !repository) return;
    let current = true;
    void loadDraftDefaults(repository)
      .then((defaults) => {
        if (!current || !defaults) return;
        // Older cores may suggest a Space group here. Only the scoped
        // registry.orgs answer above can supply an automatic Org.
        if (!touched.current.license) setLicense(existingLicense ?? defaults.license ?? "");
      })
      .catch(() => {
        // The fields stand empty for the person to fill.
      });
    return () => {
      current = false;
    };
  }, [connected, repository, registryOrigin, registryAccount, loadDraftDefaults, existingLicense]);
  const editOrg = useCallback((value: string) => {
    setEnteredOrg(value);
  }, []);
  const editLicense = useCallback((value: string) => {
    touched.current.license = true;
    setLicense(value);
  }, []);
  const org = enteredOrg !== undefined ? enteredOrg : existingOrg !== "local" ? existingOrg : orgsStatus === "ready" ? orgs[0]?.name ?? "" : "";
  return {
    org,
    license,
    editOrg,
    editLicense,
    orgs,
    orgsStatus,
    orgsError,
    registryOrigin,
    registryAccount,
    retryOrgs: () => setOrgsAttempt((attempt) => attempt + 1),
  };
}


/** Creation stays local; only this chosen Publish asks how to share it.
 * The release snapshot carries these fields, leaving local files and
 * requests intact (playbook-library-121, DR-217). */
export function PublishSetup({
  draft, repository, name, path, target, opened, autoAsk, onAutoAsked, onClose,
}: {
  draft?: DraftInfo;
  repository: string;
  opened?: boolean;
  autoAsk?: boolean;
  onAutoAsked?: () => void;
  onClose?: () => void;
  name: string;
  path: string;
  target: PublishTarget | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const fields = usePublicationFields(open ? repository : undefined, name.split("/")[0] ?? "local", draft?.packageLicense);
  const root = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const previousReview = useRef(false);
  const [error, setError] = useState<string>();
  const typedOrg = fields.org.trim();
  const license = fields.license.trim();
  const valid = isPackageOrg(typedOrg) && /^(?!\s)[^\r\n]+(?<!\s)$/.test(license);
  const verified = fields.orgsStatus === "ready" && fields.orgs.some((org) => org.name === typedOrg);
  const claimUrl = fields.registryOrigin ? new URL("/account/orgs?scope=registry", fields.registryOrigin).href : undefined;
  // Account and registry changes invalidate a review; keep edits in the
  // setup, and require a fresh deliberate review for the new account.
  const context = JSON.stringify([repository, name, path, draft?.instance, target?.origin, target?.login, target?.signedIn, target?.accountId, fields.registryAccount]);
  const previousContext = useRef(context);
  useEffect(() => {
    if (previousContext.current !== context) { setReview(false); setPending(false); previousContext.current = context; }
  }, [context]);
  useEffect(() => {
    if (previousReview.current && !review) reviewRef.current?.focus();
    previousReview.current = review;
  }, [review]);
  useEffect(() => { if (open && review) dialog.current?.focus(); }, [open, review]);
  function close() {
    if (pending) return;
    setReview(false);
    setOpen(false);
    onClose?.();
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[data-testid="publish-button"]')?.focus());
  }
  function submit() {
    if (!valid) { setError(!isPackageOrg(typedOrg) ? packageOrgRuleText() : i18n._({ id: "Enter a license on one line, such as Apache-2.0.", comment: "publishing needs an explicit license" })); return; }
    setError(undefined);
    setReview(true);
  }
  const note = fields.orgsStatus === "loading"
    ? i18n._({ id: "Loading…", comment: "a read is still in flight" })
    : fields.orgsStatus === "error"
      ? fields.orgsError
      : fields.orgsStatus === "ready" && !fields.orgs.length
        ? i18n._({ id: "No orgs to publish to", comment: "the registry account may publish to no org" })
        : fields.orgsStatus === "ready" && typedOrg && !verified
          ? i18n._({ id: "not yours to publish to", comment: "the registry account cannot publish under the typed name" })
          : fields.orgsStatus === "idle"
            ? i18n._({ id: "Publishing rights not checked", comment: "the publishing name has no successful registry account check" })
            : undefined;
  const heading = draft
    ? i18n._({ id: "Publish playbook", comment: "heading for publishing a locally authored playbook" })
    : i18n._({ id: "Publish package", comment: "heading for publishing a local package" });
  function dialogKeydown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) { if (review) setReview(false); else close(); }
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0];
    const last = controls.at(-1);
    if (!controls.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const input = "min-w-0 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950";
  return <div ref={root} className="min-w-0">
    {!open ? <PublishControl repository={repository} name={name} path={path} target={target} opened={opened} autoAsk={autoAsk} onAutoAsked={onAutoAsked} onClose={onClose} onPrepare={() => setOpen(true)} />
      : createPortal(<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-3"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-label={heading} onKeyDown={dialogKeydown}
          className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">{heading}</h2>
            <PanelCloseButton data-testid="publish-close" disabled={pending} onClick={close} />
          </header>
          <div className="min-h-0 overflow-y-auto p-4">
      {review ? <PublishControl
        repository={repository} name={name} path={path} target={target}
        options={{ ...(draft ? { draft: { id: draft.id, instance: draft.instance! } } : {}), publication: { org: typedOrg, license } }}
        opened autoAsk onPendingChange={setPending} onClose={() => setReview(false)} onPrepare={() => setReview(false)}
      />
      : <form data-testid="publish-setup" onSubmit={(event) => { event.preventDefault(); submit(); }}
          className="@container flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-neutral-500">{i18n._({ id: "Choose a publishing name and license. Your local files stay as they are.", comment: "publishing creates a release snapshot and does not rename local work" })}</p>
        </div>
        <div className="grid grid-cols-1 items-start gap-3 @sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="publish-org" className="text-xs text-neutral-500">{i18n._({ id: "Publish under", comment: "registry publishing org, the first half of the published package name" })}</label>
            <input id="publish-org" data-testid="publish-org" autoFocus value={fields.org} list="publish-orgs" autoComplete="off" spellCheck={false}
              aria-describedby="publish-package-name publish-org-note publish-org-guidance"
              onChange={(event) => { fields.editOrg(event.target.value); setError(undefined); }} className={input} />
            <datalist id="publish-orgs" data-testid="publish-orgs">{fields.orgs.map((org) => <option key={org.name} value={org.name} />)}</datalist>
            <span id="publish-package-name" className="font-mono text-xs text-neutral-500 [overflow-wrap:anywhere]">{typedOrg || "…"}/{name.split("/").at(-1)}</span>
            {note ? <p id="publish-org-note" data-testid="publish-org-note" role={fields.orgsStatus === "error" ? "alert" : "status"} className="text-xs text-neutral-500 [overflow-wrap:anywhere]">
              {note}{fields.orgsStatus === "error" ? <> <button type="button" data-testid="publish-orgs-retry" onClick={fields.retryOrgs} className="underline">{i18n._({ id: "Retry", comment: "read the registry publishing names again" })}</button></> : null}
            </p> : null}
            {!verified ? <p id="publish-org-guidance" data-testid="publish-org-guidance" className="text-xs text-neutral-500 [overflow-wrap:anywhere]">
              {i18n._({ id: "To publish, use an org you can claim at this registry.", comment: "local names do not establish publishing rights" })}
              {claimUrl ? <> <a href={claimUrl} target="_blank" rel="noreferrer" className="underline">{i18n._({ id: "Claim an org", comment: "open the selected registry account's publishing-name management" })}</a></> : null}
            </p> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="publish-license" className="text-xs text-neutral-500">{i18n._({ id: "License", comment: "the explicit license for the published release" })}</label>
            <input id="publish-license" data-testid="publish-license" value={fields.license} spellCheck={false} autoComplete="off" placeholder={i18n._({ id: "e.g. Apache-2.0", comment: "an example SPDX license identifier" })}
              onChange={(event) => { fields.editLicense(event.target.value); setError(undefined); }} className={input} />
          </div>
        </div>
        {error ? <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" data-testid="publish-setup-cancel" onClick={close} className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">{i18n._({ id: "Cancel", comment: "leave an editor without saving" })}</button>
          <button ref={reviewRef} type="submit" data-testid="publish-review" disabled={!valid} className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40">{i18n._({ id: "Preview", comment: "check the release and see its destination and files before confirming upload" })}</button>
        </div>
      </form>}
          </div>
        </div>
      </div>, document.body)}
  </div>;
}
