import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SERVICES } from "../src/cookies.js";

const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));

/** `https://*.amazon.fr/*` -> `amazon.fr` */
const rootOf = (pattern) => pattern.replace(/^https:\/\/\*\./, "").replace(/\/\*$/, "");
const granted = manifest.host_permissions.map(rootOf);

/**
 * The exporter reads cookies from SERVICES, but the browser only allows what the manifest asked
 * for. The two lists drifted apart once already and nothing said so: 22 Amazon marketplaces were
 * requested and granted, while only three .com domains were ever read — so a French account
 * exported a session with no amazon.fr cookies and the instance reported itself signed out on
 * luna.amazon.fr.
 */
describe("SERVICES against host_permissions", () => {
  it("only reads domains the manifest has permission for", () => {
    // The reverse drift: reading a domain that was never requested silently returns nothing.
    for (const svc of SERVICES) {
      for (const domain of svc.domains) {
        const covered = granted.some((g) => domain === g || domain.endsWith(`.${g}`));
        expect(covered, `${svc.id}: ${domain} is not in host_permissions`).toBe(true);
      }
    }
  });

  it("reads every Amazon marketplace it asked for", () => {
    // Prime Gaming serves whichever marketplace matches the account's region, so any granted
    // marketplace that is never read is a region this extension quietly does not work for.
    const primeDomains = SERVICES.find((s) => s.id === "primegaming").domains;
    const amazonGrants = granted.filter((g) => g.startsWith("amazon."));
    for (const g of amazonGrants) {
      expect(primeDomains, `${g} is granted but never read`).toContain(g);
    }
  });

  it("covers the regional storefronts a non-US account actually uses", () => {
    const primeDomains = SERVICES.find((s) => s.id === "primegaming").domains;
    for (const d of ["amazon.fr", "amazon.de", "amazon.co.uk", "amazon.co.jp"]) {
      expect(primeDomains).toContain(d);
    }
  });
});
