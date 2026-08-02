# Store listing copy

Everything the two dashboards ask for, written out so the forms are copy-paste rather than
improvisation. Keep this in sync when the extension's behaviour changes — the permission
justifications in particular are what reviewers read.

---

## Name

Universal Claimer — Session Exporter

## Summary / short description (132 chars max on AMO, 132 on Chrome)

Export your own session cookies locally to connect an account in your self-hosted Universal
Claimer. Nothing is ever sent anywhere.

## Full description

Universal Claimer is a self-hosted tool that claims free games and rewards on your own accounts.
Some services refuse the browser it controls, so an account is connected by importing a session
you exported yourself. This extension is how you export it.

You click the extension while signed in to a supported service, and it hands the session cookies
back to you — clipboard or file download. You paste them into your own instance.

**It never makes a network request.** There is no server, no telemetry, and no third party. The
extension contains no code that opens a network connection, so there is nowhere for your data to
go: it reads cookies and gives them to you, and that is the whole program.

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

## Permission justifications (Chrome asks per permission)

**cookies** — The extension's only function is exporting the user's own session cookies for a
service they are already signed in to. Without this permission it has nothing to do.

**activeTab** — Used solely to read the current tab's domain, so the popup preselects the service
the user is signed in to. No page content is accessed.

**clipboardWrite** — Copying the exported cookies to the clipboard is the primary way the data is
handed back to the user; the alternative is a file download.

**Host permissions** (Twitch, Epic Games, Microsoft/Live/Bing, Amazon regional domains) — Scopes
cookie reads to exactly the services Universal Claimer supports. The list is deliberately explicit
rather than a wildcard, so the browser can enforce the boundary. Amazon appears many times because
its account cookies are per-marketplace and users are spread across regional storefronts.

**Remote code** — None. All code ships in the package; nothing is fetched or evaluated at runtime.

**Data usage disclosures** — Declare *no* data collected, in every category. The extension
transmits nothing. It handles cookies locally and hands them to the user, which is not collection:
no copy reaches the developer or any third party.

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
