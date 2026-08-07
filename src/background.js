import { SERVICES } from "./cookies.js";
import { parsePairTarget } from "./pairing.js";
import { hasAccess, readSession, sendSession } from "./session.js";

/**
 * Serves the one-click path.
 *
 * The page cannot read cookies and the extension cannot be summoned by a page it has no
 * permission for, so the two meet here: a content script — registered only for instances the
 * operator has explicitly allowed — relays the page's request, and this worker does the parts
 * that need extension privileges.
 *
 * Nothing here can be triggered by a site the operator has not granted. Registration happens on
 * grant and is undone on revoke, so the set of pages that can talk to this is exactly the set the
 * operator chose.
 */

const api = globalThis.browser ?? globalThis.chrome;

/** Identifies our own dynamic registrations, so they can be replaced wholesale. */
const SCRIPT_ID_PREFIX = "uc-bridge-";

/**
 * Register the page bridge on every origin the operator has granted, and only those.
 *
 * Rebuilt from the current permission set rather than tracked incrementally: permissions can be
 * revoked from the browser's own UI without telling us, and a bridge left registered for a
 * revoked origin would be a script running somewhere consent was withdrawn.
 */
async function syncBridges() {
  let granted;
  try {
    granted = await api.permissions.getAll();
  } catch {
    return;
  }
  // Only concrete http(s) origins. The manifest asks for `*://*/*` so any instance can be
  // allowed, but that wildcard itself is never something to inject into.
  const origins = (granted.origins ?? []).filter(
    (o) => /^https?:\/\//.test(o) && !o.startsWith("*://*"),
  );

  try {
    const existing = await api.scripting.getRegisteredContentScripts();
    const ours = existing.filter((s) => s.id.startsWith(SCRIPT_ID_PREFIX)).map((s) => s.id);
    if (ours.length) await api.scripting.unregisterContentScripts({ ids: ours });

    if (origins.length) {
      await api.scripting.registerContentScripts([
        {
          id: `${SCRIPT_ID_PREFIX}page`,
          js: ["content.js"],
          matches: origins,
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    }
  } catch {
    // A browser without dynamic registration keeps the popup path, which still works.
  }
}

api.permissions.onAdded?.addListener(syncBridges);
api.permissions.onRemoved?.addListener(syncBridges);
api.runtime.onStartup?.addListener(syncBridges);
api.runtime.onInstalled?.addListener(syncBridges);
void syncBridges();

/**
 * Handle a connect request relayed from an allowed page.
 *
 * The page supplies the token and the service, but neither is taken on trust: the request must
 * come from a tab whose URL is a connect page carrying that exact token, and the session is sent
 * to that tab's origin rather than to anything the message names. A page cannot therefore ask for
 * a session to be delivered somewhere else.
 */
async function handleConnect(message, sender) {
  const tabUrl = sender?.tab?.url ?? "";
  const target = parsePairTarget(tabUrl);
  if (!target) return { ok: false, error: "This page is not an active pairing page." };
  if (target.token !== message.token || target.serviceId !== message.serviceId) {
    return { ok: false, error: "The pairing on this page has changed. Reload and try again." };
  }

  const svc = SERVICES.find((s) => s.id === target.serviceId);
  if (!svc) return { ok: false, error: "This version does not know that service." };

  // Cookie access cannot be requested from here — permissions.request needs a user gesture, and a
  // message from a page is not one. Saying so is better than failing with an empty export.
  if (!(await hasAccess(api, svc))) {
    return {
      ok: false,
      error: `Open the extension and allow access to ${svc.label} first.`,
      needsAccess: true,
    };
  }

  const { text, count, hosts } = await readSession(api, svc.id);
  if (count === 0) {
    return { ok: false, error: `No ${svc.label} cookies found. Are you signed in on that site?` };
  }

  // The cookies go back to the content script, which posts them from the page's own origin.
  //
  // Not from here, because an extension page is a secure context and most self-hosted instances
  // are plain http — the browser blocks that as mixed content, with a bare NetworkError and no
  // hint that the protocol was the problem. The content script has the page's origin, so http to
  // http is same-origin: no mixed content, and no CORS either.
  return { ok: true, cookiesText: text, count, hosts };
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "uc-connect") return undefined;
  handleConnect(message, sender).then(sendResponse, (e) =>
    sendResponse({ ok: false, error: String(e) }),
  );
  // Keeps the channel open for the async reply.
  return true;
});
