import { SERVICES, serviceForUrl, toNetscape, dedupeCookies } from "./cookies.js";
import { canBeInstance, instancePattern, parsePairTarget } from "./pairing.js";
import {
  INSTANCES_KEY,
  cookieOrigins,
  isFirefox,
  readSession,
  sendSession,
  sendSessionViaTab,
} from "./session.js";

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
// Kept so the send can run inside the instance's own tab — see sendSessionViaTab.
let activeTabId = null;

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
    activeTabId = tab?.id ?? null;
    await offerPairing(tab?.url ?? "");
  } catch {
    /* ignore */
  }
})();

/** Remember an instance the operator allowed, so the background can put the bridge on it. */
async function rememberInstance(origin) {
  try {
    const stored = await api.storage.local.get(INSTANCES_KEY);
    const list = Array.isArray(stored?.[INSTANCES_KEY]) ? stored[INSTANCES_KEY] : [];
    if (!list.includes(origin)) {
      await api.storage.local.set({ [INSTANCES_KEY]: [...list, origin] });
    }
  } catch {
    /* no storage; the popup route still works, only the page's one-click button does not */
  }
}

/**
 * When the active tab is a connect page carrying a pairing token, offer to send the session
 * directly instead of making the operator copy and paste it.
 *
 * The tab URL is the entire channel: `activeTab` hands it over on click with no host permission,
 * which is what makes this work against a self-hosted instance whose address cannot be known when
 * the extension is built.
 */
async function offerPairing(tabUrl) {
  const target = parsePairTarget(tabUrl);
  if (!target) return;
  const svc = SERVICES.find((s) => s.id === target.serviceId);
  if (!svc) return; // A connect page for a service this version does not know about.

  // The instance's pattern, in the form this browser can actually match. Firefox stores a pattern
  // with a port and then never matches a page with it, so the ported grant earlier versions asked
  // for never put the bridge on an instance at host:8095.
  const pattern = instancePattern(target.origin, { firefox: isFirefox(api) });

  // Worked out now, before any click. Firefox only lets permissions.request() prompt from inside
  // the click handler with nothing awaited first, so there is no time to check then — and the
  // handler has to know up front whether the send must wait for an answer at all. It must not wait
  // on a prompt it does not need: on Windows that prompt can open behind this popup, where it
  // cannot be clicked, and the send then sits there looking like nothing happened.
  const wanted = canBeInstance(target.origin) ? [...cookieOrigins(svc), pattern] : cookieOrigins(svc);
  const toRequest = [];
  for (const origin of wanted) {
    try {
      if (!(await api.permissions.contains({ origins: [origin] }))) toRequest.push(origin);
    } catch {
      /* no permissions API: the manifest grant is all there is */
    }
  }

  // What the send itself needs is only the cookie grants: the post runs inside this tab under
  // activeTab. The instance grant is for next time — it lets the page's own button do everything —
  // so the send never waits on it.
  const cookieMissing = toRequest.filter((origin) => origin !== pattern);

  document.getElementById("pair-service").textContent = svc.label;
  document.getElementById("pair-host").textContent = new URL(target.origin).host;
  document.getElementById("pair").hidden = false;

  const $send = document.getElementById("pair-send");
  $send.addEventListener("click", async () => {
    // A second press would queue a second prompt and resend a token already spent.
    if ($send.disabled) return;
    $send.disabled = true;

    // First call, with nothing awaited before it, so Firefox still counts it as this click's.
    const granting = toRequest.length
      ? api.permissions.request({ origins: toRequest }).catch(() => false)
      : null;

    // Pressing Send for this exact instance is the operator saying yes to it. Recorded now rather
    // than once the prompt is answered: on Windows that prompt can open behind this popup, and
    // closing the popup to reach it would otherwise lose the answer. Nothing is registered or sent
    // through the entry until the instance's permission is actually held.
    const remembering = canBeInstance(target.origin)
      ? rememberInstance(target.origin)
      : Promise.resolve();

    let sent = false;
    try {
      if (cookieMissing.length) {
        setStatus(
          `Waiting for your permission to read ${svc.label} cookies… If you do not see the ` +
            "prompt, click outside this window to reveal it, allow it, then open the extension " +
            "again and press Send.",
        );
        // Whatever the answer, carry on: whether cookies are readable is settled below.
        await granting;
      }
      await remembering;

      // Put the bridge on this page now rather than waiting for the operator to reload it — but
      // only where it is allowed to be, or the page would offer a button the worker then refuses.
      try {
        if (
          activeTabId != null &&
          canBeInstance(target.origin) &&
          (await api.permissions.contains({ origins: [pattern] }))
        ) {
          await api.scripting.executeScript({ target: { tabId: activeTabId }, files: ["content.js"] });
        }
      } catch {
        /* not granted, or no scripting; the send below is unaffected */
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

      // Post from inside the instance's tab when we can. An extension page is a secure context,
      // so fetching a plain-http instance from here is blocked as mixed content — which is what a
      // bare "NetworkError" turns out to mean. Falling back to a direct fetch still covers https
      // instances and browsers without scripting.
      const viaTab = await sendSessionViaTab(api, activeTabId, target.origin, target.token, text);
      const error = viaTab.unavailable
        ? await sendSession(target.origin, target.token, text)
        : viaTab.error;
      if (error) {
        setStatus(error, "err");
        return;
      }
      sent = true;
      const nextTime = toRequest.includes(pattern)
        ? " Your browser is also asking to let the site's own button do this next time; allow it " +
          "if you would like that (the prompt may be behind this window)."
        : "";
      setStatus(`Sent ${count} cookies for ${svc.label} (${hosts.join(", ")}).${nextTime}`, "ok");
    } catch (e) {
      // Usually the instance being unreachable from this machine — worth saying so rather than
      // showing a bare TypeError from fetch.
      setStatus(`Could not reach ${new URL(target.origin).host}: ${String(e)}`, "err");
    } finally {
      if (!sent) $send.disabled = false;
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
