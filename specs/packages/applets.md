<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# applets: Applets in the IDE

## Intent

This package defines what the IDE and the core do with an installed applet under [DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md): the tab a project's workspace shows for it, the command that opens it and the capability the core serves it under on its own endpoint, what the page may read, how it is confined, and where its frame may go.
An **applet** is the `applet` artifact of a spec package — a static web application in `applets/<id>/`, entered at `index.html` [[environments-1](environments.md#environments-1)] — installed by the environment of a project or of your own group [[environments-7](environments.md#environments-7)].
An applet's **project** is the project whose workspace shows it, and its **working folder** the one paired with that project's spex repository on this device [[storage-6](storage.md#storage-6)].
A **capability** is the secret path segment under which the core serves one applet for one project.

## External Behavior

### The Tab

#### applets-1

While a project of this computer is shown, the workspace shall show one tab per applet that the project's environment or your own group's installs and whose files are present on this device [[environments-14](environments.md#environments-14)], after Start, Specs and Overview, named by the applet's id, standing while the applet is so installed and leaving with it ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)):

- two environments each installing an applet of one id give two tabs, each naming its spec package;
- a project open on a team server's seat [[run-view-169](run-view.md#run-view-169)] shows no applet tab.

#### applets-2

When an applet's tab is shown, the workspace shall send `applet.open` for it [[applets-3](#applets-3)] and fill the pane with an embedded browser frame at the path the core answers, under one line naming the applet's spec package and version and offering Reload, which loads the frame again ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)):

- the frame carries `sandbox="allow-scripts allow-forms allow-modals allow-downloads"` and no `allow-same-origin`, so the page's origin is opaque;
- the frame's address is the core endpoint's HTTP origin — the WebSocket endpoint's scheme turned to `http` or `https` — followed by the path;
- a refusal from the core shows its cause in the pane in place of the frame.

### Serving

#### applets-3

When a client sends `applet.open { repository, applet, project }` — the spex repository whose environment installs the applet, the applet's id, and the spex repository of the project whose tab shows it — the core shall mint, or reuse, the capability of that applet and project and reply `{ path }`, `/applets/<capability>/` on its own endpoint [[core-service-1](core-service.md#core-service-1)] ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)):

- the capability is 256 random bits encoded as base64url without padding, minted once per applet and project, kept in memory until the core stops and persisted nowhere, so the same ask returns the same path;
- `not_found` where the repository, the applet or the project is not known, or the project pairs no working folder on this device [[storage-6](storage.md#storage-6)]; `invalid_request` where the applet's files are not present on this device [[environments-14](environments.md#environments-14)].

#### applets-4

When the core's endpoint receives a `GET` or `HEAD` request under `/applets/<capability>/`, the core shall answer, with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *` — the sandboxed page's opaque origin reading its own paths across origins — and the content type the extension maps to as the server shell maps it [[server-shell-4](server-shell.md#server-shell-4)] ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)):

| Path under the capability | Served |
| --- | --- |
| `/`, `index.html` | the applet's entry |
| `<path>` | that regular file of the applet's folder — the installed copy under the clone's `packages/` [[environments-7](environments.md#environments-7)], or a path source's folder where its path resolves [[environments-2](environments.md#environments-2)] |
| `~/<path>` | that regular file of the project's working folder, read-only |
| `~/<folder>/` | the folder's entries as JSON `{ entries: [{ name, kind, size, modified }] }`, `kind` being `file` or `folder`, `modified` Unix milliseconds, links and special files left out |

- an unknown capability, a path escaping either root lexically or through a link, a `.git` entry at any depth, a path under `~/` leading lexically or through a link into the home [[storage-1](storage.md#storage-1)] from a working folder outside it — a home folder registered as a project opens no window on the home — a path naming no regular file or folder, and a WebSocket handshake are refused `404`, any other method `405`, each with an empty body;
- the endpoint's token admits nothing under the path and is never part of it.

#### applets-5

When the core answers a request under a capability [[applets-4](#applets-4)], the response shall carry the policy `Content-Security-Policy: default-src <origin>; script-src <origin> 'unsafe-inline'; style-src <origin> 'unsafe-inline'; img-src <origin> data: blob:; media-src <origin> blob:; font-src <origin> data:; connect-src <origin>; form-action <origin>; base-uri 'none'`, `<origin>` being the scheme the request arrived by and the `Host` it addressed, so the page's requests and forms reach only its capability's own origin, where its frame may go being the IDE's to confine [[applets-9](#applets-9)] ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)).

### Framing

#### applets-6

The built UI page's content security policy shall allow `frame-src 'self' http://127.0.0.1:* http://localhost:*`, so the desktop's `file://` page may frame the core's endpoint at whatever port it took, and shall allow nothing else it did not allow before, a served page's `frame-src` being the server shell's to retarget [[server-shell-4](server-shell.md#server-shell-4)] ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)).

#### applets-9

While an applet's frame is shown [[applets-2](#applets-2)], when the framed page navigates its own frame — by script, a link or a form — the IDE shall let the navigation proceed only at the core endpoint's origin and otherwise refuse it before any request leaves, nothing opening elsewhere and Reload bringing the page back, since no policy a page carries confines where its own frame goes ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)):

- on a served page, the page's `frame-src` names the serving origin alone, where the attached core's endpoint stands [[server-shell-4](server-shell.md#server-shell-4)];
- on the desktop, the shell refuses a sub-frame navigation off the in-app endpoint's origin [[app-shell-41](app-shell.md#app-shell-41)].

## Verification

#### applets-7

When an integration suite starts a real core on a scratch home with a project whose environment installs, from the core's stand-in registry, a release holding an applet and requests by path a folder of the working folder holding an applet of another id, and your own group's environment installs the first release too, it shall assert:

- `applet.open` for the project's applet answers a path `/applets/<capability>/` whose capability is 43 base64url characters, the same path on a second ask, another path for your own group's applet of the same id, and `not_found` for an unknown applet, an unknown repository and a project pairing no working folder, and `invalid_request` for the path source's applet once its folder is removed [[applets-3](#applets-3)];
- `GET` of `/`, `index.html`, a script beside it, `~/README.md` and `~/` — a listing naming the README and a folder, no link — each answer `200` with their bytes, content types, `no-store`, `nosniff` and `Access-Control-Allow-Origin: *` [[applets-4](#applets-4)], the policy naming the request's own scheme and `Host` [[applets-5](#applets-5)], and `HEAD` the same headers without a body [[applets-4](#applets-4)];
- `../index.html`, a percent-encoded `..`, a link in the working folder leading outside it, `~/.git/HEAD`, a folder's path without its slash, an unknown capability, a WebSocket handshake under the path and a `POST` are refused as the table says, each with an empty body, and a request presenting the endpoint's token gains nothing [[applets-4](#applets-4)];
- the path source's applet serves the working folder's bytes, an edit to its entry read on the next request [[applets-4](#applets-4)];
- a second project whose working folder holds the home — the suite's scratch root — shown your own group's applet reads a file of its own through `~/` and is refused `404` for the home's `home.yaml`, the home's folder spelled in another case, the home's listing, and a file and a listing reached through a link leading into the home [[applets-4](#applets-4)];
- once `environment.remove` and its install took the first release away, its capability answers `404` [[applets-4](#applets-4)].

#### applets-8

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with a project and a stand-in registry holding a release whose applet's page lists the working folder through `~/` and shows the README's text, when the journey requests the release through Add from registry, it shall assert: once the install ends, a tab named by the applet's id stands after Overview, naming the spec package and version [[applets-1](#applets-1)]; showing it renders a frame sandboxed as specified, whose document shows the README's text and the listing [[applets-2](#applets-2)] [[applets-4](#applets-4)]; inside the frame `window.parent.document` throws and `localStorage` is unreachable [[applets-2](#applets-2)] [[applets-5](#applets-5)]; the page's own script sending its frame to a sink the journey listens on at another loopback port, the README's text in the URL, is refused — the sink hears nothing, no frame stands at the sink's origin and the page's console names `frame-src` [[applets-9](#applets-9)]; after an edit to the README, Reload shows the new text [[applets-2](#applets-2)] [[applets-9](#applets-9)]; the served page's policy frames `'self'` alone [[applets-9](#applets-9)] and the staged bundle's page the loopback origins [[applets-6](#applets-6)]; and Remove of the spec package takes the tab away [[applets-1](#applets-1)].
