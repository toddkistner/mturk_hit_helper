const DEFAULTS = {
  enabled: true,
  mode: "best",
  minReward: 0,
  minApprovalRate: 95,
  refreshEnabled: false,
  refreshMinSeconds: 8,
  refreshMaxSeconds: 12,
  maxAge: "",
  audioEnabled: true,
  blockedRequesters: {},
  hiddenHitPatterns: [],
  requesterNotes: {},
  excludedOpportunities: [],
  debugMode: false
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, ...current });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_SETTINGS") {
    chrome.storage.local.get(null).then(sendResponse);
    return true;
  }
  if (message && message.type === "SAVE_SETTINGS") {
    chrome.storage.local.set(message.payload || {}).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message && message.type === "PATCH_SETTINGS") {
    chrome.storage.local.get(null).then((current) => {
      const next = { ...current, ...(message.payload || {}) };
      return chrome.storage.local.set(next).then(() => sendResponse({ ok: true, settings: next }));
    });
    return true;
  }
});
