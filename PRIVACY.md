# Privacy policy — Universal Claimer Session Exporter

Last updated: 2 August 2026

## The short version

This extension makes no network requests at all. It reads cookies for a service you are logged in
to, on your instruction, and hands them back to you — to your clipboard or as a file download.
Nothing is transmitted, stored remotely, or shared with anyone, including the extension's author.

## What the extension accesses

**Cookies for a small, fixed list of sites.** Only the domains of the services Universal Claimer
supports — Twitch, Epic Games, Microsoft, and Amazon's regional storefronts. The complete list is
the `host_permissions` array in
[`src/manifest.json`](https://github.com/Mouchoir/universal-claimer-extension/blob/main/src/manifest.json)
and is enforced by the browser, not by the extension's own code: it cannot read cookies for any
site outside that list even if it tried.

On Firefox those permissions are optional and switched off until you grant them, per site, from
the extension's own prompt.

**The active tab, when you click the extension's button.** Used only to work out which service
you are currently signed in to, so the right one is preselected.

## What happens to that data

It goes to your clipboard, or to a file in your downloads folder. That is the entire journey.

- No servers. The extension contains no code that opens a network connection — there is no
  endpoint for your data to go to.
- No analytics, telemetry, crash reporting, or advertising identifiers.
- No storage. The extension keeps nothing between sessions; it holds the cookies only for as long
  as it takes to copy them.
- No third parties receive anything, because nothing is ever sent.

Once the data is in your clipboard or your downloads folder, it is yours and out of the
extension's hands. Session cookies grant access to the account they came from, so treat the
exported text like a password: paste it into your own Universal Claimer instance and do not share
it.

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
