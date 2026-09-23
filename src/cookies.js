// Pure helpers for the session exporter — no browser APIs, so they are unit-tested in Node.
// The Netscape format produced here is what Universal Claimer's importer (parseCookiesTxt)
// consumes, including the `#HttpOnly_` prefix convention for HttpOnly cookies.

/** Supported services and the cookie domains their session spans. */
export const SERVICES = [
  { id: "twitch", label: "Twitch", domains: ["twitch.tv"] },
  { id: "epic", label: "Epic Games", domains: ["epicgames.com"] },
  { id: "microsoft", label: "Microsoft Rewards", domains: ["microsoft.com", "live.com", "bing.com"] },
  {
    id: "primegaming",
    label: "Amazon Prime Gaming",
    // One marketplace is enough: an account lives on one, and the others add nothing to its
    // session. Holding every one is not required to read it.
    anyDomain: true,
    // Every marketplace, not just the .com ones. Amazon sessions are per-marketplace and
    // Prime Gaming serves whichever matches the account's region, so exporting only .com
    // hands the instance a session that is signed out on luna.amazon.fr — which is exactly
    // what it reported. The browser matches subdomains, so each root covers gaming.* and
    // luna.* beneath it.
    domains: [
      "amazon.ae",
      "amazon.ca",
      "amazon.co.jp",
      "amazon.co.uk",
      "amazon.com",
      "amazon.com.au",
      "amazon.com.be",
      "amazon.com.br",
      "amazon.com.mx",
      "amazon.com.tr",
      "amazon.de",
      "amazon.eg",
      "amazon.es",
      "amazon.fr",
      "amazon.ie",
      "amazon.in",
      "amazon.it",
      "amazon.nl",
      "amazon.pl",
      "amazon.sa",
      "amazon.se",
      "amazon.sg",
    ],
  },
];

/** Resolve which service a page URL belongs to (by registrable-ish domain suffix), or null. */
export function serviceForUrl(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const svc of SERVICES) {
    if (svc.domains.some((d) => host === d || host.endsWith(`.${d}`))) return svc.id;
  }
  return null;
}

/**
 * Serialize browser cookies (chrome.cookies / browser.cookies shape) to the Netscape
 * cookies.txt format. HttpOnly cookies are emitted with the `#HttpOnly_` domain prefix so the
 * flag survives the round-trip; session cookies get an expiry of 0.
 */
export function toNetscape(cookies) {
  const lines = ["# Netscape HTTP Cookie File", "# Exported locally by Universal Claimer.", ""];
  for (const c of cookies) {
    const domain = c.domain ?? "";
    const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.session ? 0 : Math.round(Number(c.expirationDate ?? 0));
    const prefix = c.httpOnly ? "#HttpOnly_" : "";
    lines.push(
      [prefix + domain, includeSubdomains, c.path || "/", secure, String(expiry), c.name, c.value ?? ""].join("\t"),
    );
  }
  return lines.join("\n") + "\n";
}

/** De-duplicate cookies by (name, domain, path) — several getAll calls can overlap. */
export function dedupeCookies(cookies) {
  const seen = new Set();
  const out = [];
  for (const c of cookies) {
    const key = JSON.stringify([c.name, c.domain, c.path]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
