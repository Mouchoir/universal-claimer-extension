import { SERVICES } from "./cookies.js";
import {
  bridgeMatches,
  instancePattern,
  instancesFromGrants,
  isAllowedInstance,
  parsePairTarget,
} from "./pairing.js";
import { INSTANCES_KEY, isFirefox, missingAccess, readSession } from "./session.js";

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
 * The instances the operator allowed from the popup, by exact origin.
 *
 * The first read after updating from a version that kept no such list seeds it from the
 * permissions that version granted, so the update does not quietly take the page's one-click
 * button away. Seeding when the key is absent, rather than on the install event, also covers an
 * install event that was missed. An empty list is written on a fresh install, which marks it done.
 */
async function allowedInstances() {
  try {
    const stored = await api.storage.local.get(INSTANCES_KEY);
    if (Array.isArray(stored?.[INSTANCES_KEY])) return stored[INSTANCES_KEY];
    const { origins } = await api.permissions.getAll();
    const seeded = instancesFromGrants(origins);
    await api.storage.local.set({ [INSTANCES_KEY]: seeded });
    return seeded;
  } catch {
    return [];
  }
}

/** Whether the instance's own permission is still held — the operator can revoke it any time. */
async function instanceGranted(origin) {
  try {
    return await api.permissions.contains({
      origins: [instancePattern(origin, { firefox: isFirefox(api) })],
    });
  } catch {
    return false;
  }
}

/**
 * Register the page bridge on the instances the operator allowed, and only those.
 *
 * Rebuilt from the current state rather than tracked incrementally: permissions can be revoked
 * from the browser's own UI without telling us, and a bridge left registered for a revoked origin
 * would be a script running somewhere consent was withdrawn. So an instance counts only while its
 * permission is still held.
 *
 * This used to register on every granted origin, which includes the services' cookie domains —
 * so the bridge also ran on twitch.tv and every Amazon storefront — and used the instance's origin
 * with its port as the pattern, which Firefox silently never matches.
 */
async function syncBridges() {
  const firefox = isFirefox(api);
  const live = [];
  for (const origin of await allowedInstances()) {
    if (await instanceGranted(origin)) live.push(origin);
  }
  const matches = bridgeMatches(live, { firefox });

  try {
    const existing = await api.scripting.getRegisteredContentScripts();
    const ours = existing.filter((s) => s.id.startsWith(SCRIPT_ID_PREFIX)).map((s) => s.id);
    if (ours.length) await api.scripting.unregisterContentScripts({ ids: ours });
    if (!matches.length) {
      console.info("[universal-claimer] no allowed instance yet; page bridge not registered");
      return;
    }

    const script = {
      id: `${SCRIPT_ID_PREFIX}page`,
      js: ["content.js"],
      matches,
      runAt: "document_idle",
    };
    try {
      await api.scripting.registerContentScripts([{ ...script, persistAcrossSessions: true }]);
    } catch {
      // A temporarily installed extension cannot persist registrations — Firefox rejects the
      // call outright. Retrying without it is what makes about:debugging installs work at all,
      // and silently giving up here is what made the bridge never appear.
      await api.scripting.registerContentScripts([script]);
    }
    console.info("[universal-claimer] page bridge registered for", live, "as", matches);
  } catch (e) {
    // Worth saying out loud: without this the site's one-click button silently stays a
    // three-step explanation, with nothing anywhere to say why.
    console.warn("[universal-claimer] could not register the page bridge:", e);
  }
}

/**
 * Run the sync one at a time. Several triggers can land together — a grant, the list changing,
 * the worker waking — and two overlapping runs can unregister each other's result.
 */
let syncing = Promise.resolve();
function scheduleSync() {
  // Whatever the listeners pass is ignored on purpose: each run reads the live state.
  syncing = syncing.then(() => syncBridges(), () => syncBridges());
  return syncing;
}

api.permissions.onAdded?.addListener(scheduleSync);
api.permissions.onRemoved?.addListener(scheduleSync);
api.storage?.onChanged?.addListener((changes, area) => {
  // The popup records an instance on the press, and its permission may be granted before or after
  // that — so the list changing is a trigger of its own.
  if (area === "local" && changes[INSTANCES_KEY]) void scheduleSync();
});
api.runtime.onStartup?.addListener(scheduleSync);
api.runtime.onInstalled?.addListener(scheduleSync);
void scheduleSync();

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

  // By exact origin, port included. On Firefox the grant and the bridge are host-wide (it cannot
  // express a port), so this is what keeps another service on the same machine from asking for a
  // session through a page of its own.
  if (!isAllowedInstance(tabUrl, await allowedInstances()) || !(await instanceGranted(target.origin))) {
    return {
      ok: false,
      error:
        "This instance has not been allowed in the extension yet. Click the extension's icon in " +
        'the toolbar and press "Send to this instance" once; after that this button does it all.',
    };
  }

  const svc = SERVICES.find((s) => s.id === target.serviceId);
  if (!svc) return { ok: false, error: "This version does not know that service." };

  // Cookie access cannot be requested from here. permissions.request() may only be called from an
  // extension surface inside a user-action handler, and a message relayed from a page is neither
  // — a content script cannot call it at all. So the closest thing to doing it automatically is
  // to put the surface in front of the operator: the popup already recognises this connect page
  // and offers exactly the button that asks and then sends.
  const missing = await missingAccess(api, svc);
  if (missing.length > 0) {
    let opened = false;
    try {
      await api.action.openPopup();
      opened = true;
    } catch {
      // Not permitted without a gesture of its own on some builds; the page explains instead.
    }
    return {
      ok: false,
      needsAccess: true,
      service: svc.label,
      // Only what is actually missing. Listing every marketplace buried the one that mattered.
      domains: missing,
      opened,
      error: opened
        ? `Allow access to ${svc.label} in the extension window, and it will carry on.`
        : `The extension needs access to ${svc.label}. Open it from your toolbar and press "Send to this instance".`,
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
