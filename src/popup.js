import { SERVICES, serviceForUrl, toNetscape, dedupeCookies } from "./cookies.js";
import { parsePairTarget } from "./pairing.js";
import { readSession, sendSession } from "./session.js";

// Cross-browser namespace: Firefox exposes `browser` (promises), Chrome exposes `chrome`
// (promises in MV3). Both work with await.
const api = globalThis.browser ?? globalThis.chrome;

const $service = document.getElementById("service");
const $status = document.getElementById("status");

function setStatus(msg, kind) {
  $status.textContent = msg;
  $status.className = `status ${kind ?? ""}`;
}

for (const svc of SERVICES) {
  const opt = document.createElement("option");
  opt.value = svc.id;
  opt.textContent = svc.label;
  $service.appendChild(opt);
}

// Preselect the service matching the active tab, when recognizable.
let activeHost = null;

(async () => {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    try {
      activeHost = tab?.url ? new URL(tab.url).hostname : null;
    } catch {
      activeHost = null;
    }
    const id = tab?.url ? serviceForUrl(tab.url) : null;
    if (id) $service.value = id;
    offerPairing(tab?.url ?? "");
  } catch {
    /* ignore */
  }
})();

/**
 * When the active tab is a connect page carrying a pairing token, offer to send the session
 * directly instead of making the operator copy and paste it.
 *
 * The tab URL is the entire channel: `activeTab` hands it over on click with no host permission,
 * which is what makes this work against a self-hosted instance whose address cannot be known when
 * the extension is built.
 */
function offerPairing(tabUrl) {
  const target = parsePairTarget(tabUrl);
  if (!target) return;
  const svc = SERVICES.find((s) => s.id === target.serviceId);
  if (!svc) return; // A connect page for a service this version does not know about.

  document.getElementById("pair-service").textContent = svc.label;
  document.getElementById("pair-host").textContent = new URL(target.origin).host;
  document.getElementById("pair").hidden = false;

  document.getElementById("pair-send").addEventListener("click", async () => {
    try {
      // One request covering both the service's cookie domains and this instance, because there
      // is only one user gesture to spend: Firefox invalidates permissions.request() once an
      // await has intervened, so a second call after this one would silently never prompt.
      //
      // The instance origin is bundled in because granting it lets the extension put a bridge on
      // the page, which turns every later connection into a single press on the site itself.
      // Neither grant is required for this send to work, so the result is not checked here —
      // whether cookies are actually readable is settled by what comes back below.
      const relevant = activeHost
        ? svc.domains.filter((d) => activeHost === d || activeHost.endsWith(`.${d}`))
        : [];
      const cookieOrigins = (relevant.length ? relevant : svc.domains).map((d) => `https://*.${d}/*`);
      try {
        await api.permissions.request({ origins: [...cookieOrigins, `${target.origin}/*`] });
      } catch {
        /* older engine, or declined; what follows reports the real consequence */
      }

      setStatus(`Reading your ${svc.label} cookies…`);
      const { text, count, hosts } = await readSession(api, svc.id);
      if (count === 0) {
        setStatus(
          `No cookies found for ${svc.label}. Are you signed in on that site, and did you allow access?`,
          "err",
        );
        return;
      }

      // The instance answers CORS for this endpoint, so the send works whether or not the origin
      // grant above was accepted. The pairing token is what authorises the write, not the origin.
      const error = await sendSession(target.origin, target.token, text);
      if (error) {
        setStatus(error, "err");
        return;
      }
      setStatus(`Sent ${count} cookies for ${svc.label} (${hosts.join(", ")}).`, "ok");
      document.getElementById("pair-send").disabled = true;
    } catch (e) {
      // Usually the instance being unreachable from this machine — worth saying so rather than
      // showing a bare TypeError from fetch.
      setStatus(`Could not reach ${new URL(target.origin).host}: ${String(e)}`, "err");
    }
  });
}

/**
 * Firefox (Manifest V3) does not grant manifest host permissions at install — the user opts in,
 * and newly added hosts stay ungranted after an update. Chrome grants them up front. So check
 * before reading cookies and, if they are missing, ask for them from the click that needs them
 * (permissions.request must run in a user gesture).
 */
async function ensureAccess(svc, activeHost) {
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

async function collect(serviceId = $service.value) {
  const svc = SERVICES.find((s) => s.id === serviceId);
  if (!svc) return { text: "", count: 0, label: "" };
  if (!(await ensureAccess(svc, activeHost))) {
    return { text: "", count: 0, label: svc.label, denied: true };
  }
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

document.getElementById("copy").addEventListener("click", async () => {
  try {
    const { text, count, label, denied, hosts } = await collect();
    if (denied) {
      setStatus(`Access to ${label} sites was declined, so cookies can't be read.`, "err");
      return;
    }
    if (count === 0) {
      setStatus(`No cookies found for ${label}. Are you signed in on that site?`, "err");
      return;
    }
    await navigator.clipboard.writeText(text);
    setStatus(`Copied ${count} cookies for ${label} (${hosts.join(", ")}). Paste into Session import.`, "ok");
  } catch (e) {
    setStatus(`Could not read cookies: ${String(e)}`, "err");
  }
});

document.getElementById("download").addEventListener("click", async () => {
  try {
    const { text, count, label, denied, hosts } = await collect();
    if (denied) {
      setStatus(`Access to ${label} sites was declined, so cookies can't be read.`, "err");
      return;
    }
    if (count === 0) {
      setStatus(`No cookies found for ${label}. Are you signed in on that site?`, "err");
      return;
    }
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${$service.value}-cookies.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${count} cookies for ${label}.`, "ok");
  } catch (e) {
    setStatus(`Could not read cookies: ${String(e)}`, "err");
  }
});
