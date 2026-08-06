import { describe, expect, it } from "vitest";

import { parsePairTarget } from "../src/pairing.js";

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
