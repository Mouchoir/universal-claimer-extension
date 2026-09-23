import { SERVICES } from "./cookies.js";
import { canBeInstance, instancePattern, normalizeInstance } from "./pairing.js";
import { INSTANCES_KEY, cookieOrigins, isFirefox } from "./session.js";

/**
 * The extension's own setup page: where every permission is asked for.
 *
 * A tab rather than the toolbar popup, because Firefox on Windows can open a popup's permission
 * prompt behind the popup, where it cannot be clicked — so the operator pressed a button and saw
 * nothing happen. Opened on install, once after an update that broke an instance, and from the
 * popup whenever it finds something missing.
 *
 * Every permissions.request() here is the first call in its click handler, with nothing awaited
 * before it: Firefox only honours a request made while it is still handling the click.
 */

const api = globalThis.browser ?? globalThis.chrome;
const firefox = isFirefox(api);
const params = new URLSearchParams(location.search);

/** The tab this page was opened for, to hand the operator back to once they are done. */
const returnTab = Number(params.get("tab"));
/** The instance this page was opened for, if any — shown filled in, never allowed without a press. */
const suggested = normalizeInstance(params.get("instance") ?? "");
/** The service this page was opened for. Without one, it offers every service. */
const forService = SERVICES.find((s) => s.id === params.get("service")) ?? null;
const wantedOrigins = forService ? cookieOrigins(forService) : SERVICES.flatMap(cookieOrigins);

const $cookiesTitle = document.getElementById("cookies-title");
const $cookiesGrant = document.getElementById("cookies-grant");
const $cookiesState = document.getElementById("cookies-state");
const $instance = document.getElementById("instance");
const $instanceGrant = document.getElementById("instance-grant");
const $instanceState = document.getElementById("instance-state");
const $instances = document.getElementById("instances");

function show($el, text, kind) {
  $el.textContent = text;
  $el.className = `state ${kind ?? ""}`;
}

async function holds(origin) {
  try {
    return await api.permissions.contains({ origins: [origin] });
  } catch {
    return true;
  }
}

async function allowedInstances() {
  try {
    const stored = await api.storage.local.get(INSTANCES_KEY);
    return Array.isArray(stored?.[INSTANCES_KEY]) ? stored[INSTANCES_KEY] : [];
  } catch {
    return [];
  }
}

const hostOf = (pattern) => pattern.replace(/^https:\/\/\*\./, "").replace(/\/\*$/, "");

// --- 1. Cookie access -------------------------------------------------------------------------

/** Kept current so the click can request exactly what is missing without awaiting first. */
let cookiesMissing = [];

/**
 * Whether the cookies this visit is about can be read. A service spanning marketplaces needs one
 * of them, not all; everything else needs all its domains.
 */
function cookiesUsable() {
  if (forService?.anyDomain) return cookiesMissing.length < wantedOrigins.length;
  return cookiesMissing.length === 0;
}

async function refreshCookies() {
  cookiesMissing = [];
  for (const origin of wantedOrigins) if (!(await holds(origin))) cookiesMissing.push(origin);
  $cookiesGrant.hidden = cookiesMissing.length === 0;
  if (cookiesMissing.length === 0) {
    show(
      $cookiesState,
      forService ? `✓ Allowed for ${forService.label}.` : "✓ Allowed for every supported service.",
      "ok",
    );
  } else if (cookiesUsable()) {
    show($cookiesState, `✓ Usable. Not allowed: ${cookiesMissing.map(hostOf).join(", ")}.`, "ok");
  } else {
    show($cookiesState, `Not allowed yet: ${cookiesMissing.map(hostOf).join(", ")}.`);
  }
}

if (forService) {
  $cookiesTitle.textContent = `1. Read your ${forService.label} session`;
  $cookiesGrant.textContent = `Allow access to ${forService.label}`;
}

$cookiesGrant.addEventListener("click", () => {
  const request = api.permissions.request({ origins: cookiesMissing });
  void request
    .catch(() => false)
    .then(async (granted) => {
      await refreshCookies();
      if (!granted) {
        show($cookiesState, "Declined. Nothing can be read until this is allowed.", "err");
        return;
      }
      await maybeHandBack();
    });
});

// --- 2. The instance --------------------------------------------------------------------------

async function renderInstances() {
  const list = await allowedInstances();
  $instances.replaceChildren();
  if (list.length === 0) return;

  const lead = document.createElement("p");
  lead.className = "muted";
  lead.textContent = "Allowed instances:";
  const ul = document.createElement("ul");
  for (const origin of list) {
    const li = document.createElement("li");
    const pattern = instancePattern(origin, { firefox });
    const granted = await holds(pattern);
    li.textContent = granted ? `${origin} ✓` : `${origin} — permission missing`;

    if (!granted) {
      const again = document.createElement("button");
      again.className = "quiet";
      again.textContent = "Allow again";
      again.addEventListener("click", () => {
        // First call in the handler; the pattern was worked out while rendering.
        const request = api.permissions.request({ origins: [pattern] });
        void request
          .catch(() => false)
          .then(async (ok) => {
            await renderInstances();
            if (!ok) {
              show($instanceState, "Declined.", "err");
              return;
            }
            show($instanceState, `✓ ${origin} allowed again.`, "ok");
            await maybeHandBack();
          });
      });
      li.appendChild(again);
    }

    const remove = document.createElement("button");
    remove.className = "quiet";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => void forget(origin));
    li.appendChild(remove);
    ul.appendChild(li);
  }
  $instances.append(lead, ul);
}

async function remember(origin) {
  const list = await allowedInstances();
  if (!list.includes(origin)) await api.storage.local.set({ [INSTANCES_KEY]: [...list, origin] });
}

async function forget(origin) {
  const list = (await allowedInstances()).filter((o) => o !== origin);
  await api.storage.local.set({ [INSTANCES_KEY]: list });
  // Give the permission back too, unless another allowed instance still needs the same pattern —
  // on Firefox two ports of one host share it.
  const pattern = instancePattern(origin, { firefox });
  if (!list.some((o) => instancePattern(o, { firefox }) === pattern)) {
    try {
      await api.permissions.remove({ origins: [pattern] });
    } catch {
      /* already gone */
    }
  }
  show($instanceState, `${origin} removed.`);
  await renderInstances();
}

$instanceGrant.addEventListener("click", () => {
  const origin = normalizeInstance($instance.value);
  if (!origin) {
    show($instanceState, "That does not look like an address, e.g. http://192.168.1.20:8095", "err");
    return;
  }
  if (!canBeInstance(origin)) {
    show($instanceState, "That is one of the services' own sites, not a Universal Claimer instance.", "err");
    return;
  }
  // First call in the handler, so Firefox still counts it as this click's.
  const request = api.permissions.request({ origins: [instancePattern(origin, { firefox })] });
  void request
    .catch(() => false)
    .then(async (granted) => {
      if (!granted) {
        show($instanceState, "Declined. The instance's page will still work through the toolbar popup.", "err");
        return;
      }
      await remember(origin);
      await renderInstances();
      show($instanceState, `✓ ${origin} allowed. Its connect button now does everything.`, "ok");
      await maybeHandBack();
    });
});

// --- Handing back -----------------------------------------------------------------------------

/**
 * Return the operator to the page this was opened for — but only once everything that page needs
 * is in place. Going back with the cookies still missing sent them straight round again.
 */
async function maybeHandBack() {
  if (!suggested || !Number.isInteger(returnTab) || returnTab < 0) return;
  if (!(await allowedInstances()).includes(suggested)) return;
  if (!(await holds(instancePattern(suggested, { firefox })))) return;
  if (!cookiesUsable()) {
    show($cookiesState, "One more step: allow access above, then you are done.", "err");
    return;
  }
  try {
    const tab = await api.tabs.get(returnTab);
    if (!tab?.url || new URL(tab.url).origin !== suggested) return;
    // The worker puts the bridge on that page as soon as the permission lands, so it needs no
    // reload: its own button now does the rest.
    await api.tabs.update(returnTab, { active: true });
    const self = await api.tabs.getCurrent();
    if (self?.id != null) await api.tabs.remove(self.id);
  } catch {
    /* the tab is gone; staying here is fine */
  }
}

// --- Start ------------------------------------------------------------------------------------

if (suggested) $instance.value = suggested;
void refreshCookies();
void renderInstances();
