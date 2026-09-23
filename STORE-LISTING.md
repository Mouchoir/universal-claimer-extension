# Store listing copy

Everything the two dashboards ask for, written out so the forms are copy-paste rather than
improvisation. Keep this in sync when the extension's behaviour changes — the permission
justifications in particular are what reviewers read.

---

## Name

Universal Claimer — Session Exporter

## Summary / short description (132 chars max on AMO, 132 on Chrome)

Export your own session cookies to connect an account in your self-hosted Universal Claimer.
Sent to your instance only.

## Full description

Universal Claimer is a self-hosted tool that claims free games and rewards on your own accounts.
Some services refuse the browser it controls, so an account is connected by importing a session
you exported yourself. This extension is how you export it.

You click the extension while signed in to a supported service, and it hands the session cookies
back to you — clipboard or file download — or, from your instance's connect page, sends them
straight to that instance so there is nothing to paste.

**Your data goes to your instance and nowhere else.** There is no server of the author's, no
telemetry, and no third party. A session is only ever sent to the Universal Claimer instance whose
page you are on, when you start it there, with the one-time pairing code that page issued.

Cookie access is limited to the services Universal Claimer supports — Twitch, Epic Games,
Microsoft, and Amazon's regional storefronts. The browser enforces that list, not the extension's
own code, so it cannot read cookies for any other site. On Firefox those permissions stay off
until you grant them per site.

Open source under the MIT licence. Every store release is built by a public GitHub Actions
workflow from a tagged commit of the public repository — never uploaded by hand — so the package
you install and the source you can read are the same artifact, and the build log is public.

Source: https://github.com/Mouchoir/universal-claimer-extension

## Category

Chrome: Productivity (or Developer Tools)
AMO: Privacy & Security

## Single purpose (Chrome requires this exact field)

Export the user's own session cookies for a supported service to their clipboard or a local file,
so they can connect that account in their self-hosted Universal Claimer instance.

---

## Privacy practices tab — verbatim field answers

Each of these fields caps at 1000 characters. Paste as-is.

### Single purpose description

Universal Claimer is a self-hosted tool that claims free games and rewards on a user's own
accounts. Some services refuse the automated browser it controls, so an account is connected by
importing a session the user exported themselves.

This extension does exactly that one thing. While you are signed in to a supported service, it
reads that service's cookies and hands them back to you — to your clipboard, or as a downloaded
cookies.txt file. You then paste them into your own Universal Claimer instance.

It has no other function. It sends a session only to the user's own instance, on their action;
the only thing it stores is the list of instance addresses the user allowed; its only content
script runs on those instances, and it modifies no page.

### cookies

Reading cookies is the extension's entire function: it exports the user's own session for a
service they are already signed in to, so they can connect that account in their self-hosted
Universal Claimer instance. Without this permission the extension has nothing to do.

Cookies are read only when the user asks: Copy, Download or Send in the popup, or the connect
button on the page of an instance the user allowed. They go to the user's clipboard, their
downloads folder, or their own instance's `/api/connect/session` — posted from inside that
instance's own tab, with the one-time pairing code the page issued. There is no server of the
author's and no third party for them to reach.

Which cookies can be read is bounded by the explicit host_permissions list, so only the four
supported services' domains are ever accessible.

### activeTab

Reads the current tab's URL when the popup is opened, to preselect the service the user is signed
in to and to recognise a Universal Claimer connect page. When the user presses Send on such a
page, a small function runs in that tab to post the session to the instance same-origin (an
extension page cannot reach a plain-http instance: it would be blocked as mixed content).

No page content is read and nothing is modified.

### clipboardWrite

Copying the exported cookies.txt to the clipboard is the primary way the data is handed back to
the user, because the next step is pasting it into their own Universal Claimer instance. A file
download is offered as the alternative.

Nothing is ever read from the clipboard. It is only written, and only in direct response to the
user clicking "Copy cookies.txt".

### Host permission

Cookie reads have to be scoped to the services Universal Claimer supports: Twitch, Epic Games,
Microsoft (microsoft.com, live.com, bing.com) and Amazon.

The list is deliberately explicit rather than a wildcard, so the browser itself enforces the
boundary — the extension cannot read cookies for any site outside it, regardless of what its own
code does.

Amazon accounts for most of the entries because Amazon sessions are per-marketplace: a user in
France signs in on amazon.fr, in Japan on amazon.co.jp, and so on. Each regional storefront needs
its own entry for the extension to work outside the United States.

No content script is injected into any of these hosts. The permission is used solely to read
cookies through the cookies API.

### scripting

Added in 0.2.0, for the one-click connection.

The extension registers a small bridge script on the user's own Universal Claimer instance — and
only there, on an origin they granted by hand — so the page can ask for a session without them
having to open this popup and copy anything. The bridge relays that request and posts the result
back to the page it came from.

When access is granted, the bridge is also put on that instance's tabs that are already open, so
the page's button works without a reload. Registration is rebuilt from the live permission set
and undone when a permission is revoked, and the worker refuses any request from an address whose
permission is gone.

### storage

Added in 0.2.2.

Remembers which Universal Claimer instances the user allowed, by exact address (for example
`http://192.168.1.20:8095`), so the bridge script is put on those pages and only those. Firefox
cannot express a port in a permission, so its grant covers every port of a host; this list is how
the extension still refuses every address the user did not choose. Nothing else is stored, and
nothing is synchronised off the device.

### Host permission — optional, `*://*/*`

Also added in 0.2.0, and never granted at install: it is declared as *optional* precisely so
nothing is held until the user grants a specific origin at runtime.

Universal Claimer is self-hosted. Its address is whatever the user chose — a LAN IP, a hostname,
a port — and cannot be known when this extension is built, so it cannot be listed as a fixed
pattern in the manifest. The user enters or confirms that address on the extension's own setup
page, and the extension asks for that one origin and nothing else. On Chrome the grant is that
exact origin; on Firefox it covers every port of the host, because Firefox match patterns cannot
carry a port — and only the exact addresses on the user's allowed list can ever request a
session.

The wildcard is the shape of the request the API requires to allow *any* origin to be asked for.
The extension never asks for it. (Firefox lets a user switch the whole of it on in about:addons;
even then, only allowed addresses can request a session.)

### tabs (no permission; `tabs.create`)

The setup page opens in a tab: on install, once after an update that left an allowed instance
without its permission, and from the popup when something is missing. Permissions are asked for
there rather than from the popup, because Firefox on Windows can open a popup's permission prompt
behind the popup, where it cannot be clicked.

### Remote code

Select **No, I am not using remote code**. All JavaScript ships inside the package; nothing is
fetched, imported from a remote URL, or evaluated at runtime, and there is no eval() anywhere.

### Data usage

Tick **nothing**. Chrome defines collection as transmitting data off the user's device where the
developer or a third party can access it. The extension sends a session only to the user's own
self-hosted instance, at the address they allowed — neither the developer nor any third party can
access it — and otherwise hands it to the user's clipboard or downloads folder. (This is a
judgement about the definition; re-read it against Chrome's current wording before submitting.)

Declaring "authentication information" here would be the cautious-looking answer and the wrong
one: it publishes a notice telling users their data is collected, which is untrue and contradicts
the privacy policy a reviewer will read on the same submission.

Then tick all three certification checkboxes: no selling or transferring to third parties, no use
unrelated to the core function, no use for creditworthiness or lending.

---

## Privacy policy URL

https://github.com/Mouchoir/universal-claimer-extension/blob/main/PRIVACY.md

## Support / homepage URL

https://github.com/Mouchoir/universal-claimer-extension

---

## Screenshots

Chrome requires at least one, 1280x800 or 640x400. AMO wants at least one.

Take them from the real extension rather than a mockup — a store screenshot has to show the
product as it actually is:

1. `chrome://extensions` → Developer mode → **Load unpacked** → select the `src/` folder.
2. Sign in to one of the supported services in another tab.
3. Click the extension's toolbar button and screenshot the popup.
4. Crop or pad to 1280x800.

One screenshot of the popup is enough for both stores; a second showing the pasted result on the
Universal Claimer connect page helps a reviewer understand the point of the extension.
