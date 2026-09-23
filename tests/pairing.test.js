import { describe, expect, it } from "vitest";

import {
  bridgeMatches,
  canBeInstance,
  instancePattern,
  instancesFromGrants,
  isAllowedInstance,
  normalizeInstance,
  parsePairTarget,
} from "../src/pairing.js";

/**
 * This function decides where a session gets sent, from a URL the extension did not choose. Its
 * refusals matter more than its acceptances.
 */

describe("parsePairTarget", () => {
  it("reads the instance, service and token from a connect page", () => {
    expect(parsePairTarget("http://192.168.1.20:8095/connect/twitch?pair=abc123")).toEqual({
      origin: "http://192.168.1.20:8095",
      serviceId: "twitch",
      token: "abc123",
    });
  });

  it("works over https and on a bare host", () => {
    expect(parsePairTarget("https://claimer.example/connect/epic?pair=t0k3n")).toEqual({
      origin: "https://claimer.example",
      serviceId: "epic",
      token: "t0k3n",
    });
  });

  it("keeps other query parameters out of the way", () => {
    const target = parsePairTarget("https://c.example/connect/primegaming?foo=1&pair=xyz&bar=2");
    expect(target?.token).toBe("xyz");
    expect(target?.serviceId).toBe("primegaming");
  });

  it("tolerates a trailing slash", () => {
    expect(parsePairTarget("https://c.example/connect/twitch/?pair=abc")?.serviceId).toBe("twitch");
  });

  it("lower-cases the service so the path cannot smuggle a different one", () => {
    expect(parsePairTarget("https://c.example/connect/TWITCH?pair=abc")?.serviceId).toBe("twitch");
  });

  it("ignores a page with no token — the normal case", () => {
    // The popup is usually opened on Twitch or Amazon, not on the instance.
    expect(parsePairTarget("https://www.twitch.tv/")).toBeNull();
    expect(parsePairTarget("https://c.example/connect/twitch")).toBeNull();
  });

  it("ignores a token on a page that is not a connect page", () => {
    expect(parsePairTarget("https://evil.example/?pair=abc")).toBeNull();
    expect(parsePairTarget("https://evil.example/connect?pair=abc")).toBeNull();
    expect(parsePairTarget("https://evil.example/connect/twitch/extra?pair=abc")).toBeNull();
  });

  it("refuses anything that is not plain web traffic", () => {
    // Otherwise a local file or an extension page shaped like a connect URL would be treated as
    // somewhere to send a session.
    expect(parsePairTarget("file:///tmp/connect/twitch?pair=abc")).toBeNull();
    expect(parsePairTarget("moz-extension://uuid/connect/twitch?pair=abc")).toBeNull();
    expect(parsePairTarget("javascript:alert(1)//connect/twitch?pair=abc")).toBeNull();
  });

  it("survives junk", () => {
    expect(parsePairTarget("")).toBeNull();
    expect(parsePairTarget("not a url")).toBeNull();
    expect(parsePairTarget(undefined)).toBeNull();
  });
});

describe("instancePattern", () => {
  // Firefox accepts a pattern with a port and then never matches it, so the bridge never appeared
  // on an instance at host:8095.

  it("drops the port on Firefox, which cannot match one", () => {
    expect(instancePattern("http://192.168.1.20:8095", { firefox: true })).toBe(
      "http://192.168.1.20/*",
    );
  });

  it("keeps the port on Chrome, which honours it", () => {
    expect(instancePattern("http://192.168.1.20:8095", { firefox: false })).toBe(
      "http://192.168.1.20:8095/*",
    );
  });

  it("is unchanged for an instance on the default port", () => {
    expect(instancePattern("https://claimer.example", { firefox: true })).toBe(
      "https://claimer.example/*",
    );
    expect(instancePattern("https://claimer.example", { firefox: false })).toBe(
      "https://claimer.example/*",
    );
  });
});

describe("bridgeMatches", () => {
  it("covers exactly the allowed instances", () => {
    expect(
      bridgeMatches(["http://192.168.1.20:8095", "https://claimer.example"], { firefox: false }),
    ).toEqual(["http://192.168.1.20:8095/*", "https://claimer.example/*"]);
  });

  it("collapses two ports of one host into the single pattern Firefox can use", () => {
    expect(
      bridgeMatches(["http://192.168.1.20:8095", "http://192.168.1.20:9000"], { firefox: true }),
    ).toEqual(["http://192.168.1.20/*"]);
  });

  it("registers nothing when nothing was allowed", () => {
    // Registering from every granted origin put the bridge on twitch.tv and every Amazon site.
    expect(bridgeMatches([], { firefox: true })).toEqual([]);
  });

  it("skips entries that are not origins", () => {
    expect(bridgeMatches(["not a url"], { firefox: true })).toEqual([]);
  });
});

describe("isAllowedInstance", () => {
  const allowed = ["http://192.168.1.20:8095"];

  it("accepts a page on an allowed instance", () => {
    expect(isAllowedInstance("http://192.168.1.20:8095/connect/epic?pair=abc", allowed)).toBe(true);
  });

  it("refuses another port on the same host", () => {
    // On Firefox the grant and the bridge are host-wide, so this check is the only thing keeping
    // another service on the same machine from asking for a session with a page of its own.
    expect(isAllowedInstance("http://192.168.1.20:8080/connect/epic?pair=abc", allowed)).toBe(
      false,
    );
  });

  it("refuses another scheme, another host, and garbage", () => {
    expect(isAllowedInstance("https://192.168.1.20:8095/connect/epic?pair=a", allowed)).toBe(false);
    expect(isAllowedInstance("http://192.168.1.21:8095/connect/epic?pair=a", allowed)).toBe(false);
    expect(isAllowedInstance("nonsense", allowed)).toBe(false);
    expect(isAllowedInstance("http://192.168.1.20:8095/", undefined)).toBe(false);
  });
});

describe("canBeInstance", () => {
  it("accepts a self-hosted origin", () => {
    expect(canBeInstance("http://192.168.1.20:8095")).toBe(true);
    expect(canBeInstance("https://claimer.example")).toBe(true);
  });

  it("never accepts a service's own site", () => {
    // A page on twitch.tv carrying /connect/twitch?pair=… is not somewhere to send a session.
    expect(canBeInstance("https://www.twitch.tv")).toBe(false);
    expect(canBeInstance("https://luna.amazon.fr")).toBe(false);
    expect(canBeInstance("https://store.epicgames.com")).toBe(false);
  });

  it("refuses anything that is not http(s)", () => {
    expect(canBeInstance("file:///etc")).toBe(false);
    expect(canBeInstance("nonsense")).toBe(false);
  });

  it("is enforced by isAllowedInstance and bridgeMatches as well", () => {
    const planted = ["https://www.twitch.tv"];
    expect(isAllowedInstance("https://www.twitch.tv/connect/twitch?pair=a", planted)).toBe(false);
    expect(bridgeMatches(planted, { firefox: false })).toEqual([]);
  });
});

describe("instancesFromGrants", () => {
  // Earlier versions allowed an instance by granting its origin and recorded nothing else, so an
  // update without this would silently take the page's one-click button away.

  it("recovers the instance an earlier version granted, port included", () => {
    expect(instancesFromGrants(["http://192.168.1.20:8095/*"])).toEqual(["http://192.168.1.20:8095"]);
  });

  it("ignores the services' cookie grants and the any-site wildcard", () => {
    expect(
      instancesFromGrants([
        "https://*.twitch.tv/*",
        "https://*.amazon.fr/*",
        "*://*/*",
        "https://www.twitch.tv/*",
        "https://claimer.example/*",
      ]),
    ).toEqual(["https://claimer.example"]);
  });

  it("copes with nothing granted", () => {
    expect(instancesFromGrants(undefined)).toEqual([]);
    expect(instancesFromGrants([])).toEqual([]);
  });
});

describe("normalizeInstance", () => {
  it("reduces what the operator pastes to an origin", () => {
    expect(normalizeInstance("http://192.168.1.20:8095/dashboard?x=1")).toBe("http://192.168.1.20:8095");
    expect(normalizeInstance("  https://claimer.example/  ")).toBe("https://claimer.example");
  });

  it("accepts a bare host:port, the usual way to write a LAN address", () => {
    expect(normalizeInstance("192.168.1.20:8095")).toBe("http://192.168.1.20:8095");
    expect(normalizeInstance("nas.local")).toBe("http://nas.local");
  });

  it("refuses what is not an http(s) address", () => {
    expect(normalizeInstance("")).toBeNull();
    expect(normalizeInstance(undefined)).toBeNull();
    expect(normalizeInstance("file:///etc/passwd")).toBeNull();
    expect(normalizeInstance("javascript://alert(1)")).toBeNull();
    expect(normalizeInstance("http://")).toBeNull();
  });
});
