# Privacy policy — Universal Claimer Session Exporter

Last updated: 23 September 2026

## The short version

This extension reads cookies for a service you are logged in to, on your instruction, and hands
them to you — to your clipboard, as a file download, or straight to your own self-hosted Universal
Claimer instance when you connect an account from it. It never sends anything anywhere else:
nothing goes to the extension's author or to any third party.

## What the extension accesses

**Cookies for a small, fixed list of sites.** Only the domains of the services Universal Claimer
supports — Twitch, Epic Games, Microsoft, and Amazon's regional storefronts. The complete list is
the `host_permissions` array in
[`src/manifest.json`](https://github.com/Mouchoir/universal-claimer-extension/blob/main/src/manifest.json)
and is enforced by the browser, not by the extension's own code: it cannot read cookies for any
site outside that list even if it tried.

On Firefox those permissions are optional and switched off until you grant them, per site, from
the extension's own prompt.

**The active tab, when you click the extension's button.** Used to work out which service you are
currently signed in to, so the right one is preselected, and to recognise a Universal Claimer
connect page you opened, so the session can be sent to it.

**Your own Universal Claimer instance, if you allow it.** When you choose to connect from your
instance, the extension asks your permission for that one address. With it, a small script on that
page lets the page's own button start the connection. It runs on no other site.

## What happens to that data

It goes to your clipboard, to a file in your downloads folder, or to your own Universal Claimer
instance. That is the entire journey.

- Only to your instance. A session is sent only to the Universal Claimer instance whose connect
  page you are on, only when you start it there, and only with the one-time pairing code that page
  just issued. The extension has no server of its own and no other destination.
- No analytics, telemetry, crash reporting, or advertising identifiers.
- Almost nothing stored. The one thing kept between sessions, in your browser only, is the list of
  Universal Claimer addresses you allowed (for example `http://192.168.1.20:8095`). Cookies are
  held only for as long as it takes to copy or send them.
- No third parties receive anything.

Once the data is in your clipboard, your downloads folder or your instance, it is yours and out of
the extension's hands. Session cookies grant access to the account they came from, so treat the
exported text like a password and do not share it.

## Verifying this

The extension is open source under the MIT licence, and every store release is built by a public
GitHub Actions workflow from a tagged commit of the public repository — never uploaded by hand.
The published package and the source you can read are the same artifact, and the build log is
public.

Source: https://github.com/Mouchoir/universal-claimer-extension

## Changes

Any future change to what the extension accesses will be reflected here and in the permissions
the browser asks you to approve, which is the check that does not depend on this document being
accurate.

## Contact

Open an issue at https://github.com/Mouchoir/universal-claimer-extension/issues
