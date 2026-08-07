import { SERVICES, toNetscape, dedupeCookies } from "./cookies.js";

/**
 * Reading a service's session, shared by the popup and the background worker.
 *
 * The browser API is passed in rather than reached for, because these two callers live in
 * different worlds: the popup has a document and a user gesture, the worker has neither. Keeping
 * the logic here means the one-click path and the manual path cannot drift into exporting
 * different things.
 */

/**
 * Ensure cookie access for a service, asking for it if this is Firefox and it has not been
 * granted yet.
 *
 * Only callable from a user gesture — `permissions.request` requires one — which is why the
 * background worker never calls this and instead reports what is missing back to the popup.
 */
export async function ensureAccess(api, svc, activeHost) {
  // Ask for the domain you are actually on when it belongs to this service. A service like Amazon
  // spans one domain per marketplace, and asking for all twenty-odd at once produces a wall of
  // toggles that is easy to dismiss — which silently leaves the one that matters switched off.
  const relevant = activeHost
    ? svc.domains.filter((d) => activeHost === d || activeHost.endsWith(`.${d}`))
    : [];
  const origins = (relevant.length ? relevant : svc.domains).map((d) => `https://*.${d}/*`);
  try {
    // request() is called directly rather than after a contains() check: it resolves to true
    // without prompting when the permission is already held, and Firefox requires request() to
    // run inside the user gesture — an await beforehand can invalidate that.
    return await api.permissions.request({ origins });
  } catch {
    // Older engines without the permissions API: assume the manifest grant applies.
    return true;
  }
}

/** Whether cookie access for a service is already granted, without prompting. */
export async function hasAccess(api, svc) {
  try {
    return await api.permissions.contains({
      origins: svc.domains.map((d) => `https://*.${d}/*`),
    });
  } catch {
    return true;
  }
}

/**
 * Read and serialize a service's cookies. Assumes access is already granted — callers that can
 * prompt should call {@link ensureAccess} first.
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
