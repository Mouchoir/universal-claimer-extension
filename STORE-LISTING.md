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

## Privacy practices tab — verbatim field answers

Each of these fields caps at 1000 characters. Paste as-is.

### Single purpose description

Universal Claimer is a self-hosted tool that claims free games and rewards on a user's own
accounts. Some services refuse the automated browser it controls, so an account is connected by
importing a session the user exported themselves.

This extension does exactly that one thing. While you are signed in to a supported service, it
reads that service's cookies and hands them back to you — to your clipboard, or as a downloaded
cookies.txt file. You then paste them into your own Universal Claimer instance.

It has no other function. It makes no network requests, stores nothing between sessions, injects
no content scripts, and modifies no page.

### cookies

Reading cookies is the extension's entire function: it exports the user's own session for a
service they are already signed in to, so they can connect that account in their self-hosted
Universal Claimer instance. Without this permission the extension has nothing to do.

Cookies are read only when the user opens the popup and clicks Copy or Download, and they go only
to that user's own clipboard or downloads folder. They are never transmitted anywhere: the
extension contains no code that opens a network connection, so there is no endpoint for them to
reach.

Which cookies can be read is bounded by the explicit host_permissions list, so only the four
supported services' domains are ever accessible.

### activeTab

Used only to read the current tab's URL, so the popup can preselect the service the user is
already signed in to instead of making them find it in a list.

Nothing else about the tab is used: no page content is read, no script is injected, and nothing
is modified. The extension remains fully functional without it — the user simply picks the
service from the dropdown manually.

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

### Remote code

Select **No, I am not using remote code**. All JavaScript ships inside the package; nothing is
fetched, imported from a remote URL, or evaluated at runtime, and there is no eval() anywhere.

### Data usage

Tick **nothing**. Chrome defines collection as transmitting data off the user's device where the
developer or a third party can access it, and this extension transmits nothing — the clipboard
and the downloads folder are the user's own machine.

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
