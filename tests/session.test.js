import { describe, expect, it } from "vitest";

import { SERVICES } from "../src/cookies.js";
import { hasAccess, isFirefox, missingAccess } from "../src/session.js";

/** A browser API that holds exactly the given origin patterns. */
function fakeApi(granted, scheme = "moz-extension") {
  return {
    runtime: { getURL: (p) => `${scheme}://uuid/${p}` },
    permissions: {
      contains: async ({ origins }) => origins.every((o) => granted.includes(o)),
    },
  };
}

const prime = SERVICES.find((s) => s.id === "primegaming");

describe("missingAccess", () => {
  it("reports only the domains that are actually missing", () => {
    // Reporting every marketplace buried the one that mattered under twenty-odd others.
    const granted = prime.domains.filter((d) => d !== "amazon.fr").map((d) => `https://*.${d}/*`);
    return expect(missingAccess(fakeApi(granted), prime)).resolves.toEqual(["amazon.fr"]);
  });

  it("is empty when everything is granted", async () => {
    const granted = prime.domains.map((d) => `https://*.${d}/*`);
    expect(await missingAccess(fakeApi(granted), prime)).toEqual([]);
    expect(await hasAccess(fakeApi(granted), prime)).toBe(true);
  });
});

describe("isFirefox", () => {
  it("tells the browsers apart by the extension's own URL", () => {
    expect(isFirefox(fakeApi([], "moz-extension"))).toBe(true);
    expect(isFirefox(fakeApi([], "chrome-extension"))).toBe(false);
  });
});
