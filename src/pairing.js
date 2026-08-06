// Pure helpers for the one-click pairing flow — no browser APIs, so they are unit-tested in Node.

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
