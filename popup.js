
async function sendToActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return null;
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabs[0].id, message, (response) => resolve(response || null));
  });
}

async function getWatchList() {
  const response = await sendToActiveTab({ type: "GET_WATCH_LIST" });
  return Array.isArray(response && response.entries) ? response.entries : [];
}

async function removeWatchListEntries(keys) {
  return sendToActiveTab({ type: "REMOVE_WATCH_ITEMS", keys: keys || [] });
}

function formatWatchEntry(entry) {
  const key = String(entry && entry.key ? entry.key : "").trim();
  const requester = String(entry && entry.requester ? entry.requester : "").trim();
  const title = String(entry && entry.title ? entry.title : "").trim();
  const baselineAgeSeconds = Number(entry && entry.baselineAgeSeconds);
  const ageLabel = Number.isFinite(baselineAgeSeconds) ? (" • " + Math.max(0, Math.round(baselineAgeSeconds)) + "s") : "";
  return [key, requester, title].filter(Boolean).join(" | ") + ageLabel;
}

function lines(text) {
  return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function parseBlocked(text) {
  const out = {};
  lines(text).forEach((line) => {
    const parts = line.split("|");
    const key = (parts[0] || "").trim();
    const reason = (parts[1] || "Blocked").trim();
    if (key) out[key] = reason || "Blocked";
  });
  return out;
}

function stringifyBlocked(map) {
  return Object.entries(map || {}).map(([k, v]) => `${k}|${v}`).join("\n");
}

function parseNotes(text) {
  const out = {};
  lines(text).forEach((line) => {
    const parts = line.split("|");
    const key = (parts[0] || "").trim();
    if (!key) return;
    out[key] = {
      score: Number(parts[1] || 0) || 0,
      speed: Number(parts[2] || 0) || 0,
      note: parts.slice(3).join("|").trim()
    };
  });
  return out;
}

function stringifyNotes(map) {
  return Object.entries(map || {}).map(([k, v]) => `${k}|${v.score || 0}|${v.speed || 0}|${v.note || ""}`).join("\n");
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el.type === "checkbox") el.checked = !!value;
  else el.value = value ?? "";
}

function getValue(id) {
  const el = document.getElementById(id);
  return el.type === "checkbox" ? el.checked : el.value;
}

function fillMultiSelect(id, values) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  (values || []).forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  });
}

function getMultiValues(id) {
  return Array.from(document.getElementById(id).options).map((o) => o.value);
}

function removeSelected(id) {
  const el = document.getElementById(id);
  Array.from(el.selectedOptions).forEach((opt) => opt.remove());
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => resolve(settings || {}));
  });
}

function saveSettings(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload }, (res) => resolve(res));
  });
}

(async function init() {
  const settings = await getSettings();
  setValue("enabled", settings.enabled ?? true);
  setValue("refreshEnabled", settings.refreshEnabled ?? false);
  setValue("audioEnabled", settings.audioEnabled ?? true);
  setValue("revealHiddenRows", settings.revealHiddenRows ?? false);
  setValue("debugMode", settings.debugMode ?? false);
  setValue("mode", settings.mode || "best");
  setValue("minReward", settings.minReward ?? 0);
  setValue("minApprovalRate", settings.minApprovalRate ?? 95);
  setValue("refreshMinSeconds", settings.refreshMinSeconds ?? 8);
  setValue("refreshMaxSeconds", settings.refreshMaxSeconds ?? 12);
  setValue("maxAge", settings.maxAge || "");
  setValue("minVisibleHitCount", settings.minVisibleHitCount ?? 2);
  setValue("ghostSuppressAfterSeen", settings.ghostSuppressAfterSeen ?? 2);
  setValue("ghostSuppressMinutes", settings.ghostSuppressMinutes ?? 10);
  setValue("watchDelay", settings.watchDelay || "2m");
  fillMultiSelect("blockedRequesters", Object.entries(settings.blockedRequesters || {}).map(([k, v]) => `${k}|${v}`));
  setValue("requesterNotes", stringifyNotes(settings.requesterNotes || {}));
  fillMultiSelect("hiddenHitPatterns", settings.hiddenHitPatterns || []);
  fillMultiSelect("excludedOpportunities", settings.excludedOpportunities || []);
  fillMultiSelect("watchList", (await getWatchList()).map(formatWatchEntry));

  document.getElementById("removeWatch").addEventListener("click", async () => {
    const selected = Array.from(document.getElementById("watchList").selectedOptions).map((opt) => opt.value);
    const keys = selected.map((value) => String(value).split(" | ")[0].trim()).filter(Boolean);
    await removeWatchListEntries(keys);
    fillMultiSelect("watchList", (await getWatchList()).map(formatWatchEntry));
  });

  document.getElementById("removeBlocked").addEventListener("click", () => removeSelected("blockedRequesters"));
  document.getElementById("removeHidden").addEventListener("click", () => removeSelected("hiddenHitPatterns"));
  document.getElementById("removeExcluded").addEventListener("click", () => removeSelected("excludedOpportunities"));

  document.getElementById("dumpMapping").addEventListener("click", async () => {
    await sendToActiveTab({ type: "DUMP_MAPPING" });
  });

  document.getElementById("rerankNow").addEventListener("click", async () => {
    await sendToActiveTab({ type: "RERANK_NOW" });
  });

  document.getElementById("save").addEventListener("click", async () => {
    const payload = {
      enabled: !!getValue("enabled"),
      refreshEnabled: !!getValue("refreshEnabled"),
      audioEnabled: !!getValue("audioEnabled"),
      revealHiddenRows: !!getValue("revealHiddenRows"),
      debugMode: !!getValue("debugMode"),
      mode: getValue("mode"),
      minReward: Number(getValue("minReward")) || 0,
      minApprovalRate: Number(getValue("minApprovalRate")) || 0,
      refreshMinSeconds: Math.max(5, Number(getValue("refreshMinSeconds")) || 8),
      refreshMaxSeconds: Math.max(5, Number(getValue("refreshMaxSeconds")) || 12),
      maxAge: String(getValue("maxAge") || "").trim(),
      minVisibleHitCount: Math.max(0, Number(getValue("minVisibleHitCount")) || 0),
      ghostSuppressAfterSeen: Math.max(1, Number(getValue("ghostSuppressAfterSeen")) || 2),
      ghostSuppressMinutes: Math.max(1, Number(getValue("ghostSuppressMinutes")) || 10),
      watchDelay: String(getValue("watchDelay") || "").trim(),
      blockedRequesters: parseBlocked(getMultiValues("blockedRequesters").join("\n")),
      hiddenHitPatterns: getMultiValues("hiddenHitPatterns"),
      requesterNotes: parseNotes(getValue("requesterNotes")),
      excludedOpportunities: getMultiValues("excludedOpportunities")
    };
    if (payload.refreshMaxSeconds < payload.refreshMinSeconds) {
      payload.refreshMaxSeconds = payload.refreshMinSeconds;
    }
    await saveSettings(payload);
    window.close();
  });
})();
