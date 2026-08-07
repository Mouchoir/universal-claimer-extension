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
  void connect(data);
});

/**
 * Ask the worker for the session, then post it to this instance from here.
 *
 * The posting has to happen in this script rather than in the worker. An extension page is a
 * secure context, and a self-hosted instance is usually plain http, so a fetch from there is
 * blocked as mixed content — surfacing as a bare NetworkError that says nothing about the
 * protocol being the cause. This script runs in the page's own origin, so http to http is
 * same-origin: no mixed content, and no CORS.
 */
async function connect(data) {
  const reply = (result) => window.postMessage({ type: RESULT, ...result }, window.origin);
  try {
    // The token and service are relayed as-is; the worker re-derives both from this tab's URL and
    // refuses if they disagree, so a page cannot ask for a session it was not issued a pairing
    // for.
    const result = await api.runtime.sendMessage({
      type: "uc-connect",
      token: data.token,
      serviceId: data.serviceId,
    });
    if (!result?.ok) {
      reply(result ?? { ok: false, error: "The extension did not answer." });
      return;
    }

    const res = await fetch(`${window.origin}/api/connect/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token, cookiesText: result.cookiesText }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      reply({ ok: false, error: body?.error?.message ?? `The instance rejected it (${res.status}).` });
      return;
    }
    reply({ ok: true, count: result.count, hosts: result.hosts });
  } catch (e) {
    reply({ ok: false, error: String(e) });
  }
}
