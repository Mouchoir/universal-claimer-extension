// Pure helpers for the one-click pairing flow — no browser APIs, so they are unit-tested in Node.

import { serviceForUrl } from "./cookies.js";

/**
 * Whether an origin may ever count as an instance. A service's own site never can: a page on
 * twitch.tv carrying /connect/twitch?pair=… is not somewhere to send a session, and treating it
 * as one would put the bridge on the very sites whose cookies it reads.
 */
export function canBeInstance(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && serviceForUrl(url.href) === null;
  } catch {
    return false;
  }
}

/**
 * Read a pairing target out of the active tab's URL.
 *
 * The tab URL is the whole channel. `activeTab` grants it on click without any host permission,
 * which is what lets this work against a self-hosted instance whose address cannot be known when
 * the extension is built — and the alternatives do not survive both browsers: Firefox has no
 * `externally_connectable`, and gives every installation a random `moz-extension://` UUID that a
 * page cannot construct to probe us with.
 *
 * Returns null for anything that is not a Universal Claimer connect page carrying a token, which
 * is the common case: the popup is normally opened on Twitch or Amazon, not on the instance.
 */
export function parsePairTarget(tabUrl) {
  let url;
  try {
    url = new URL(tabUrl);
  } catch {
    return null;
  }
  // Refuse anything that is not plain web traffic. Without this, a file:// or extension page
  // carrying the right-looking path would be treated as somewhere to send a session.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const token = url.searchParams.get("pair");
  if (!token) return null;

  // The service is in the path rather than the query so that a hand-edited link cannot quietly
  // aim a Twitch session at the Epic slot: it has to look like the page it claims to be.
  const match = /^\/connect\/([a-z0-9_-]+)\/?$/i.exec(url.pathname);
  if (!match) return null;

  return { origin: url.origin, serviceId: match[1].toLowerCase(), token };
}

/**
 * The match pattern that grants — and injects into — an instance's origin.
 *
 * Firefox does not support a port in a match pattern: `http://192.168.1.20:8095/*` is accepted
 * without complaint and then never matches anything (Mozilla bugs 1362809 and 1468162), while a
 * pattern without a port matches every port. So on Firefox the pattern names the host, and the
 * exact origin — port included — is enforced separately, by {@link isAllowedInstance}. Chrome
 * honours ports, so there the pattern is exact to begin with.
 *
 * Sending the ported form to Firefox is what kept the page bridge from ever appearing on an
 * instance served on anything but 80 or 443.
 */
export function instancePattern(origin, { firefox }) {
  const url = new URL(origin);
  return firefox ? `${url.protocol}//${url.hostname}/*` : `${url.origin}/*`;
}

/**
 * The content-script matches for the instances the operator allowed: one per distinct pattern,
 * and nothing else.
 *
 * Built from the explicit list rather than from every granted origin. The granted set also holds
 * the services' cookie domains, and registering from it put the bridge on twitch.tv and every
 * Amazon storefront as well as on the instance.
 */
export function bridgeMatches(instances, { firefox }) {
  const patterns = new Set();
  for (const origin of instances) {
    if (!canBeInstance(origin)) continue;
    try {
      patterns.add(instancePattern(origin, { firefox }));
    } catch {
      /* not a URL; nothing to register */
    }
  }
  return [...patterns];
}

/**
 * Whether a tab belongs to an instance the operator explicitly allowed, by exact origin.
 *
 * The check that makes a host-wide Firefox grant safe: another service on another port of the
 * same machine may get the bridge injected, but it cannot get a session out of it.
 */
export function isAllowedInstance(tabUrl, instances) {
  let origin;
  try {
    origin = new URL(tabUrl).origin;
  } catch {
    return false;
  }
  return Array.isArray(instances) && instances.includes(origin) && canBeInstance(origin);
}

/**
 * The instances a pre-0.2.2 install had allowed, recovered from its permissions.
 *
 * Until 0.2.2 an instance was allowed simply by granting its origin, and nothing else recorded
 * it. Without this, updating would silently take the page's one-click button away from everyone
 * who had it. Only concrete origins count — the services' cookie grants are all wildcards — and
 * never a service's own domain.
 */
export function instancesFromGrants(origins) {
  const found = [];
  for (const pattern of origins ?? []) {
    const match = /^(https?):\/\/([^/*]+)\/\*$/.exec(pattern);
    if (!match) continue;
    let origin;
    try {
      origin = new URL(`${match[1]}://${match[2]}`).origin;
    } catch {
      continue;
    }
    if (canBeInstance(origin) && !found.includes(origin)) found.push(origin);
  }
  return found;
}
