import { SERVICES, serviceForUrl, toNetscape, dedupeCookies } from "./cookies.js";
import { canBeInstance, instancePattern, parsePairTarget } from "./pairing.js";
import {
  INSTANCES_KEY,
  accessState,
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

// Kept so the send can run inside the instance's own tab — see sendSessionViaTab.
let activeTabId = null;

(async () => {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    // Preselect the service matching the active tab, when recognizable.
    const id = tab?.url ? serviceForUrl(tab.url) : null;
    if (id) $service.value = id;
    activeTabId = tab?.id ?? null;
    await offerPairing(tab?.url ?? "");
  } catch {
    /* ignore */
  }
})();

/**
 * Open the setup page in a tab, where permission prompts can actually be seen.
 *
 * This popup asks for nothing itself any more. On Windows, Firefox can open a popup's permission
 * prompt behind the popup, where it cannot be clicked, so the button looked dead.
 */
async function openSetup({ instance, tabId, service } = {}) {
  const query = new URLSearchParams();
  if (instance) query.set("instance", instance);
  if (typeof tabId === "number") query.set("tab", String(tabId));
  // Scopes the page to this service, so it asks for what this connection needs and nothing else.
  if (service) query.set("service", service);
  const suffix = query.size ? `?${query}` : "";
  await api.tabs.create({ url: api.runtime.getURL(`setup.html${suffix}`) });
  window.close();
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
  const instanceAllowed =
    canBeInstance(target.origin) &&
    (await allowedInstanceList()).includes(target.origin) &&
    (await holds(pattern));
  const { usable } = await accessState(api, svc);

  document.getElementById("pair-service").textContent = svc.label;
  document.getElementById("pair-host").textContent = new URL(target.origin).host;
  document.getElementById("pair").hidden = false;

  const $send = document.getElementById("pair-send");
  const $allow = document.getElementById("pair-allow");
  const $allowNote = document.getElementById("pair-allow-note");

  // What the send needs is the service's cookies; the post itself runs inside this tab under
  // activeTab. Without the cookies there is nothing to send, so the only useful button is the
  // one that goes and gets them.
  if (!usable) {
    $send.hidden = true;
    $allow.hidden = false;
    $allow.classList.add("primary");
    $allowNote.hidden = false;
    $allowNote.textContent = `First, allow the extension to read your ${svc.label} session.`;
  } else if (!instanceAllowed && canBeInstance(target.origin)) {
    // The send works now; allowing the instance is what makes the page's own button do it next
    // time.
    $allow.hidden = false;
    $allowNote.hidden = false;
    $allowNote.textContent = "Allow this instance once, and its own button does all of this next time.";
  }

  $allow.addEventListener("click", () => {
    void openSetup({
      instance: canBeInstance(target.origin) ? target.origin : undefined,
      tabId: activeTabId ?? undefined,
      service: svc.id,
    });
  });

  $send.addEventListener("click", async () => {
    // A second press would resend a token already spent.
    if ($send.disabled) return;
    $send.disabled = true;
    let sent = false;
    try {
      // Put the bridge on this page now rather than waiting for a reload — but only where it is
      // allowed to be, or the page would offer a button the worker then refuses.
      try {
        if (activeTabId != null && instanceAllowed) {
          await api.scripting.executeScript({ target: { tabId: activeTabId }, files: ["content.js"] });
        }
      } catch {
        /* no scripting; the send below is unaffected */
      }

      setStatus(`Reading your ${svc.label} cookies…`);
      const { text, count, hosts } = await readSession(api, svc.id);
      if (count === 0) {
        setStatus(`No cookies found for ${svc.label}. Are you signed in on that site?`, "err");
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
      setStatus(`Sent ${count} cookies for ${svc.label} (${hosts.join(", ")}).`, "ok");
    } catch (e) {
      // Usually the instance being unreachable from this machine — worth saying so rather than
      // showing a bare TypeError from fetch.
      setStatus(`Could not reach ${new URL(target.origin).host}: ${String(e)}`, "err");
    } finally {
      if (!sent) $send.disabled = false;
    }
  });
}

async function holds(origin) {
  try {
    return await api.permissions.contains({ origins: [origin] });
  } catch {
    return true;
  }
}

async function allowedInstanceList() {
  try {
    const stored = await api.storage.local.get(INSTANCES_KEY);
    return Array.isArray(stored?.[INSTANCES_KEY]) ? stored[INSTANCES_KEY] : [];
  } catch {
    return [];
  }
}

/**
 * Cookie access for a service, for the copy and download buttons. Missing access is granted on
 * the setup page rather than prompted for here, for the same reason as above.
 */
async function ensureAccess(svc) {
  if ((await accessState(api, svc)).usable) return true;
  await openSetup({ service: svc.id });
  return false;
}

async function collect(serviceId = $service.value) {
  const svc = SERVICES.find((s) => s.id === serviceId);
  if (!svc) return { text: "", count: 0, label: "" };
  if (!(await ensureAccess(svc))) {
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
