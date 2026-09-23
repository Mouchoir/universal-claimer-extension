import { SERVICES, toNetscape, dedupeCookies } from "./cookies.js";

/**
 * Reading a service's session, shared by the popup and the background worker.
 *
 * The browser API is passed in rather than reached for, because these two callers live in
 * different worlds: the popup has a document and a user gesture, the worker has neither. Keeping
 * the logic here means the one-click path and the manual path cannot drift into exporting
 * different things.
 */

/** Where the instances the operator allowed are remembered, by exact origin (port included). */
export const INSTANCES_KEY = "allowedInstances";

/**
 * Whether this is Firefox. Decided from the extension's own URL scheme rather than from which
 * namespace exists, since polyfills put a `browser` object into Chrome too.
 */
export function isFirefox(api) {
  try {
    return api.runtime.getURL("").startsWith("moz-extension:");
  } catch {
    return false;
  }
}

/** The origin patterns a service's cookies need. */
export function cookieOrigins(svc) {
  return svc.domains.map((d) => `https://*.${d}/*`);
}

/**
 * Which of a service's cookie domains are not granted yet. Empty when everything is in place.
 *
 * Per domain rather than all at once, so what gets reported — and asked for — is what is actually
 * missing, not every marketplace Amazon has.
 */
export async function missingAccess(api, svc) {
  const missing = [];
  for (const domain of svc.domains) {
    try {
      if (!(await api.permissions.contains({ origins: [`https://*.${domain}/*`] }))) {
        missing.push(domain);
      }
    } catch {
      // No permissions API: the manifest grant is all there is, and it applies.
    }
  }
  return missing;
}

/**
 * Whether a service's session can be read, and what is still missing.
 *
 * Usable means every domain for most services, but any one of them for a service that spans
 * marketplaces: an Amazon account lives on one storefront, so blocking it until all twenty-two
 * are granted only stopped people for no reason.
 */
export async function accessState(api, svc) {
  const missing = await missingAccess(api, svc);
  const usable = svc.anyDomain ? missing.length < svc.domains.length : missing.length === 0;
  return { usable, missing };
}

/** Whether cookie access for a service is already granted, without prompting. */
export async function hasAccess(api, svc) {
  return (await accessState(api, svc)).usable;
}

/**
 * Read and serialize a service's cookies. Assumes access is already granted; anything missing is
 * granted on the setup page (see setup.js), never prompted for from here.
 */
export async function readSession(api, serviceId) {
  const svc = SERVICES.find((s) => s.id === serviceId);
  if (!svc) return { text: "", count: 0, label: "", hosts: [] };

  const all = [];
  for (const domain of svc.domains) {
    const cookies = await api.cookies.getAll({ domain });
    all.push(...cookies);
  }
  const unique = dedupeCookies(all);
  // Which hosts the cookies came from. Surfacing this matters: a service can span several
  // marketplaces (amazon.com vs amazon.fr) and exporting the wrong one looks identical to
  // exporting nothing useful.
  const hosts = [...new Set(unique.map((c) => c.domain.replace(/^\./, "")))].sort();
  return { text: toNetscape(unique), count: unique.length, label: svc.label, hosts };
}

/**
 * POST a session from inside the instance's own tab.
 *
 * Preferred over {@link sendSession} because an extension page is a secure context: fetching a
 * plain-http instance from one is blocked as mixed content, and the browser reports it as a bare
 * NetworkError that gives no hint the protocol was the problem. Running in the tab makes the
 * request same-origin, which sidesteps both that and CORS.
 *
 * Requires host permission for the tab's origin, so it returns a marker when it cannot run and
 * the caller can fall back.
 */
export async function sendSessionViaTab(api, tabId, origin, token, cookiesText) {
  if (!api.scripting?.executeScript || typeof tabId !== "number") return { unavailable: true };
  try {
    const [injected] = await api.scripting.executeScript({
      target: { tabId },
      args: [origin, token, cookiesText],
      func: async (o, t, text) => {
        try {
          const res = await fetch(`${o}/api/connect/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: t, cookiesText: text }),
          });
          if (res.ok) return null;
          const body = await res.json().catch(() => null);
          return body?.error?.message ?? `The instance rejected it (${res.status}).`;
        } catch (e) {
          return String(e);
        }
      },
    });
    return { error: injected?.result ?? null };
  } catch {
    // No permission for this origin, or a browser without scripting. The caller falls back.
    return { unavailable: true };
  }
}

/** POST a session to an instance's pairing endpoint. Returns an error string, or null on success. */
export async function sendSession(origin, token, cookiesText) {
  let res;
  try {
    res = await fetch(`${origin}/api/connect/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, cookiesText }),
    });
  } catch (e) {
    // Usually the instance being unreachable from this machine. Worth naming rather than showing
    // a bare TypeError from fetch.
    return `Could not reach ${new URL(origin).host}: ${String(e)}`;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return data?.error?.message ?? `The instance rejected it (${res.status}).`;
  }
  return null;
}
