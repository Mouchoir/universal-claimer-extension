/**
 * Bridge between a Universal Claimer page and the extension.
 *
 * Injected only into instances the operator explicitly allowed, and registered from the live
 * permission set — so this runs exactly where consent was given and nowhere else.
 *
 * It does two things: announce that the extension is here, so the page can offer a real one-click
 * button instead of a three-step explanation; and relay the click.
 */

const api = globalThis.browser ?? globalThis.chrome;

const READY = "uc-extension-ready";
const CONNECT = "uc-extension-connect";
const RESULT = "uc-extension-result";

function announce() {
  window.postMessage({ type: READY, version: api.runtime.getManifest().version }, window.origin);
}

// Announce on load, and again on request: the page's script may not have been listening yet when
// this ran, and a page has no way to ask a content script to repeat itself except by asking.
announce();
window.addEventListener("message", (event) => {
  // Only messages this page sent to itself. Without both checks any embedded frame could drive
  // the bridge, and the whole point of the origin grant is that it names one place.
  if (event.source !== window || event.origin !== window.origin) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === `${READY}?`) {
    announce();
    return;
  }

  if (data.type !== CONNECT) return;
  // The token and service are relayed as-is; the worker re-derives both from this tab's URL and
  // refuses if they disagree, so a page cannot ask for a session it was not issued a pairing for.
  api.runtime
    .sendMessage({ type: "uc-connect", token: data.token, serviceId: data.serviceId })
    .then(
      (result) => window.postMessage({ type: RESULT, ...result }, window.origin),
      (e) => window.postMessage({ type: RESULT, ok: false, error: String(e) }, window.origin),
    );
});
