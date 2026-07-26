# Universal Claimer — Session Exporter

A tiny, open-source browser extension that exports your **logged-in session cookies** so you can
connect an account in your self-hosted [Universal Claimer](https://github.com/Mouchoir/Universal-Claimer)
instance — without trusting a third-party cookie exporter.

Chrome and Firefox, Manifest V3.

## Privacy

- **It never makes a network request.** Your cookies never leave your machine: the extension reads
  them and hands them to *you* (clipboard or file download). There is no server, no telemetry, no
  analytics.
- **Scoped access.** The `cookies` permission is limited to the supported service domains
  (`twitch.tv`, `epicgames.com`, `microsoft.com`, `live.com`, `bing.com`) — see
  [`src/manifest.json`](src/manifest.json).
- **Plain, unobfuscated source.** Nothing is minified or bundled; what you read here is what runs.

> ⚠️ An exported `cookies.txt` contains a full session — treat it like a password. Only paste it
> into your own Universal Claimer instance.

## Why you can trust the published builds

Store releases are produced **only** by [`.github/workflows/publish.yml`](.github/workflows/publish.yml),
from a tagged commit of this public repository. Nobody uploads a zip by hand.

The release job also **refuses to publish** unless `src/manifest.json`'s version matches the git
tag ([`scripts/check-version.mjs`](scripts/check-version.mjs)) — CI never rewrites the manifest, so
the packaged artifact is assembled from unmodified source. The tag, the workflow and its run log
are all public, so anyone can check which commit produced a given store version.

Firefox's AMO additionally reviews the source itself.

## Install

### From the stores

- Chrome Web Store — *pending first release*
- Firefox Add-ons — *pending first release*

### From source (no store needed)

- **Chrome / Edge**: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**
  and select the `src/` folder.
- **Firefox**: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and
  select `src/manifest.json`.

## Use

1. Log in to the service (e.g. `twitch.tv`) in this browser.
2. Click the extension icon → pick the service → **Copy cookies.txt**.
3. In Universal Claimer, open `/connect/<service>`, fill any required config (e.g. the Twitch
   channel), choose **Session import**, paste, and connect.

## Development

```bash
npm ci
npm test        # unit tests for the pure logic (Netscape serialization, service matching)
npm run lint    # web-ext lint
npm run build   # packages src/ into dist/
```

`src/cookies.js` holds the pure logic and is unit-tested; `src/popup.js` is the UI wiring.

## Releasing

1. Bump `version` in `src/manifest.json` (and `package.json`), commit.
2. Tag that commit: `git tag v0.2.0 && git push --tags`.
3. The publish workflow verifies, tests, builds and submits to both stores.

Required repository secrets: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
`CHROME_REFRESH_TOKEN`, `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`.

## Licence

MIT — see [LICENSE](LICENSE).
