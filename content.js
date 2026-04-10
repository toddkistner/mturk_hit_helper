(() => {
  const STATE = {
    settings: null,
    topItem: null,
    items: [],
    scanTimer: null,
    refreshTimer: null,
    audioArmed: false,
    audioContext: null,
    lastAlertId: null,
    nextRefreshAt: null,
    countdownTimer: null,
    debugRows: [],
    watchRefreshId: 0,
    watchSnapshotSignature: "",
    rerankInFlight: false,
    rerankQueued: false,
    mutationObserver: null,
    mutationRerankTimer: null
  };

  const IDS = {
    style: "mhh-style",
    status: "mhh-status",
    alert: "mhh-alert",
    arm: "mhh-audio-arm",
    countdown: "mhh-refresh-countdown",
    toolbar: "mhh-toolbar",
    hideToggle: "mhh-hide-toggle"
  };

  function log(...args) {
    console.log("[MHH React]", ...args);
  }

  function debugEnabled() {
    return !!STATE.settings?.debugMode;
  }

  function clearDebugDecorations() {
    document.querySelectorAll(".mhh-debug-tag").forEach((el) => el.remove());
    document.querySelectorAll(".mhh-debug-outline").forEach((el) => el.classList.remove("mhh-debug-outline"));
  }

  function dumpMappingToConsole() {
    if (!STATE.debugRows.length) {
      console.table([]);
      return;
    }
    console.table(STATE.debugRows);
  }

  function anchorInfo(anchor) {
    if (!anchor) {
      return { anchorTag: "", anchorText: "" };
    }
    return {
      anchorTag: anchor.tagName || "",
      anchorText: textOf(anchor).slice(0, 80)
    };
  }

  function waitForRows(timeout = 3000) {
    return new Promise((resolve) => {
      const start = Date.now();

      function check() {
        const rows = getDomRows();
        if (rows.length > 0) {
          resolve(true);
        } else if (Date.now() - start > timeout) {
          resolve(false);
        } else {
          window.requestAnimationFrame(check);
        }
      }

      check();
    });
  }

  function textOf(node) {
    return String(node && node.textContent ? node.textContent : "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeLoose(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function parseApprovalRate(value) {
    const match = String(value || "").match(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/);
    return match ? parseFloat(match[1]) : null;
  }

  function parseDuration(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return null;
    let total = 0;
    let matched = false;
    const re = /(\d+)\s*(d|h|m|s)\b/g;
    let m;
    while ((m = re.exec(text))) {
      matched = true;
      const n = Number(m[1] || 0);
      const unit = m[2];
      if (unit === "d") total += n * 86400;
      else if (unit === "h") total += n * 3600;
      else if (unit === "m") total += n * 60;
      else if (unit === "s") total += n;
    }
    return matched ? total : null;
  }

  function parseAgeText(value) {
    const text = normalize(String(value || "").replace(/\bago\b/g, "").trim());
    if (!text) return null;
    return parseDuration(text);
  }

  function parseCreatedTimingInfo(value) {
    const rawText = String(value || "").trim();
    const text = normalize(rawText);
    if (!text) {
      return { direction: "unknown", seconds: null, text: rawText };
    }

    const seconds = parseDuration(text.replace(/\bago\b/g, "").replace(/\bin\b/g, "").trim());
    let direction = "unknown";
    if (/\bin\b/.test(text)) direction = "future";
    else if (/\bago\b/.test(text)) direction = "past";

    return {
      direction,
      seconds: seconds != null ? seconds : null,
      text: rawText
    };
  }

  function ensureStyle() {
    if (document.getElementById(IDS.style)) return;
    const style = document.createElement("style");
    style.id = IDS.style;
    style.textContent = `
      .mhh-hidden { display: none !important; }
      .mhh-top { outline: 4px solid #22c55e !important; outline-offset: -2px !important; }
      .mhh-good { background: rgba(34,197,94,0.10) !important; }
      .mhh-ok { background: rgba(250,204,21,0.16) !important; }
      .mhh-bad { background: rgba(239,68,68,0.10) !important; }
      .mhh-pill, .mhh-badge {
        display: inline-block !important;
        margin-left: 8px !important;
        padding: 2px 6px !important;
        border-radius: 999px !important;
        font: 700 11px/1.2 Arial, sans-serif !important;
        color: #fff !important;
        background: #111827 !important;
      }
      .mhh-badge { background: #166534 !important; }
      .mhh-debug-outline { box-shadow: inset 0 0 0 3px #60a5fa !important; }
      .mhh-debug-tag {
        display: inline-block !important;
        margin-left: 8px !important;
        padding: 2px 6px !important;
        border-radius: 999px !important;
        font: 700 11px/1.2 Arial, sans-serif !important;
        color: #fff !important;
        background: #1d4ed8 !important;
      }
      #mhh-toolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 10px;
        width: 100%;
        margin: 12px auto 14px auto;
        text-align: center;
      }
      #mhh-status, #mhh-refresh-countdown, #mhh-audio-arm, #mhh-hide-toggle {
        position: static !important;
        z-index: auto !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 40px !important;
        max-width: min(100%, 420px) !important;
        font: 13px/1.3 Arial, sans-serif !important;
        color: #fff !important;
        border-radius: 10px !important;
        padding: 10px 14px !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.18) !important;
        white-space: nowrap !important;
      }
      #mhh-status {
        background: #1f2937 !important;
        pointer-events: none !important;
      }
      #mhh-refresh-countdown {
        background: #374151 !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
      }
      #mhh-audio-arm {
        background: #2563eb !important;
        border: 0 !important;
        cursor: pointer !important;
      }
      #mhh-hide-toggle {
        background: #7c3aed !important;
        border: 0 !important;
        cursor: pointer !important;
      }
      #mhh-alert {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        font: 13px/1.4 Arial, sans-serif;
        color: #fff;
        background: #111827;
        border-radius: 10px;
        padding: 10px 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.25);
        opacity: 0;
        transform: translateY(12px);
        transition: all .16s ease;
        pointer-events: none;
      }
      #mhh-alert.show { opacity: 1; transform: translateY(0); }
    `;
    document.head.appendChild(style);
  }

  
  function toolbarMountParent() {
    const root = getHitSetTableRoot();
    if (!root) {
      return document.body;
    }
    return root.parentElement || getHitSetTableContainer() || document.body;
  }

  function ensureToolbar() {
    let el = document.getElementById(IDS.toolbar);
    const parent = toolbarMountParent();
    if (!el) {
      el = document.createElement("div");
      el.id = IDS.toolbar;
    }
    if (parent && el.parentElement !== parent) {
      const root = getHitSetTableRoot();
      if (root) {
        if (root.parentElement === parent) {
          parent.insertBefore(el, root);
        } else {
          parent.prepend(el);
        }
      } else {
        parent.prepend(el);
      }
    }
    return el;
  }

  function revealHiddenRowsEnabled() {
    return !!STATE.settings?.revealHiddenRows;
  }

  function shouldHideRow(item) {
    return !revealHiddenRowsEnabled() && !!(item.hidden || item.blocked);
  }

function ensureBox(id, tagName = "div") {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tagName);
      el.id = id;
    }
    const host = id === IDS.alert ? document.body : ensureToolbar();
    if (el.parentElement !== host) {
      host.appendChild(el);
    }
    return el;
  }

  
  function updateHideToggleLabel(button) {
    const btn = button || ensureBox(IDS.hideToggle, "button");
    btn.textContent = revealHiddenRowsEnabled() ? "Showing hidden rows • click to rehide" : "Hidden rows off • click to show";
    return btn;
  }

  function toggleRevealHiddenRows() {
    patchSettings({ revealHiddenRows: !STATE.settings?.revealHiddenRows }, rerank);
  }

function showStatus(message) {
    ensureBox(IDS.status).textContent = message;
  }

  function showAlert(message) {
    const el = ensureBox(IDS.alert);
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
  }

  function refreshCountdownText() {
    if (!STATE.settings?.refreshEnabled) {
      return "⏸ Reload paused • click to enable";
    }
    if (!STATE.nextRefreshAt) {
      return "⏳ Reload enabled • scheduling...";
    }
    const remaining = Math.max(0, Math.ceil((STATE.nextRefreshAt - Date.now()) / 1000));
    return "⏳ Next reload in " + remaining + "s • click to pause";
  }

  function showCountdown(message) {
    const el = ensureBox(IDS.countdown);
    el.textContent = message;
    el.title = STATE.settings?.refreshEnabled ? "Click to pause auto-refresh" : "Click to enable auto-refresh";
  }

  function stopCountdown() {
    if (STATE.countdownTimer) clearInterval(STATE.countdownTimer);
    if (STATE.refreshTimer) clearTimeout(STATE.refreshTimer);
    STATE.countdownTimer = null;
    STATE.refreshTimer = null;
    STATE.nextRefreshAt = null;
    showCountdown(refreshCountdownText());
  }

  function startCountdown() {
    if (STATE.countdownTimer) clearInterval(STATE.countdownTimer);
    showCountdown(refreshCountdownText());
    STATE.countdownTimer = setInterval(() => {
      showCountdown(refreshCountdownText());
    }, 250);
  }

  function updateAudioButtonLabel(button) {
    const btn = button || ensureBox(IDS.arm, "button");
    if (!STATE.settings?.audioEnabled) {
      btn.textContent = "Enable audio alerts";
    } else if (STATE.audioArmed) {
      btn.textContent = "Audio alerts enabled";
    } else {
      btn.textContent = "Audio alerts on • click to arm";
    }
    return btn;
  }

  function armAudioButton() {
    const btn = updateAudioButtonLabel(ensureBox(IDS.arm, "button"));
    btn.onclick = async () => {
      const enableAlerts = !STATE.settings?.audioEnabled;
      if (enableAlerts) {
        STATE.settings = { ...STATE.settings, audioEnabled: true };
        updateAudioButtonLabel(btn);
        patchSettings({ audioEnabled: true }, () => updateAudioButtonLabel(btn));
      }

      try {
        if (!STATE.audioContext) STATE.audioContext = new AudioContext();
        if (STATE.audioContext.state === "suspended") await STATE.audioContext.resume();
        STATE.audioArmed = true;
        updateAudioButtonLabel(btn);
        beep();
      } catch (err) {
        log("Audio arm failed", err);
        btn.textContent = "Audio enable failed";
      }
    };
  }

  function toggleRefreshEnabled() {
    patchSettings({ refreshEnabled: !STATE.settings?.refreshEnabled }, () => {
      if (STATE.settings?.refreshEnabled) scheduleRefresh();
      else stopCountdown();
    });
  }

  function beep() {
    if (!STATE.settings || !STATE.settings.audioEnabled || !STATE.audioArmed || !STATE.audioContext) return;
    try {
      const ctx = STATE.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch (err) {
      log("Beep failed", err);
    }
  }

  function onHitsSearchPage() {
    const url = new URL(window.location.href);
    const path = url.pathname || "/";
    const isProjectsListPage = path === "/projects" || path === "/projects/" || path === "/" || path === "";
    const isProjectTaskPage = /^\/projects\/[^/]+\/tasks(?:\/|$)/.test(path);
    const hasMainContent = !!document.getElementById("MainContent");
    const hasHitGroupsHeader = normalize(document.body.textContent || "").includes("hit groups");
    const hasHitSetTableReactRoot = !!document.querySelector('[data-react-class*="hitSetTable/HitSetTable"], [data-react-class*="HitSetTable"]');
    const result = isProjectsListPage && !isProjectTaskPage && hasMainContent && hasHitGroupsHeader && hasHitSetTableReactRoot;
    log("Page check", { href: window.location.href, path, result });
    return result;
  }

  function getHitSetTableRoot() {
    return document.querySelector('[data-react-class*="hitSetTable/HitSetTable"], [data-react-class*="HitSetTable"]');
  }

  function getHitSetTableContainer() {
    const root = getHitSetTableRoot();
    if (!root) return null;
    return root.closest("#MainContent") || root.parentElement || root;
  }

  function getReactData() {
    const el = getHitSetTableRoot();
    if (!el) return null;
    const raw = el.getAttribute("data-react-props");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      log("Failed to parse react props", err);
      return null;
    }
  }

  function getHydratedHitNodes() {
    const searchRoots = [
      getHitSetTableContainer(),
      document.getElementById("MainContent"),
      document.body
    ].filter(Boolean);

    const seen = new Set();
    const rows = [];

    for (const root of searchRoots) {
      const candidates = Array.from(root.querySelectorAll("tbody tr, table tbody tr, table tr, .table-row, [role='row']"));
      for (const row of candidates) {
        if (!(row instanceof HTMLElement) || seen.has(row)) continue;
        seen.add(row);

        const text = normalize(textOf(row));
        if (!text) continue;
        if (text.includes("requester") && text.includes("reward") && text.includes("actions")) continue;
        if (text.includes("show details") || text.includes("hide details") || text.includes("items per page")) continue;

        const hasAcceptControl = !!acceptControlFromRow(row);
        const looksLikeHitRow = hasAcceptControl || (
          row.querySelector("a[href*='/requesters/']") &&
          /\$\s*\d/.test(textOf(row))
        );

        if (looksLikeHitRow) rows.push(row);
      }
      if (rows.length) break;
    }

    return rows;
  }

  function scoreHydratedMatch(row, raw) {
    if (!(row instanceof HTMLElement) || !raw) return -1;

    const rowText = normalize(textOf(row));
    const rowTextLoose = normalizeLoose(textOf(row));
    if (!rowText) return -1;

    let score = 0;
    const requester = normalize(raw.requester_name || "");
    const title = normalize(raw.title || "");
    const titleLoose = normalizeLoose(raw.title || "");
    const reward = Number(raw.monetary_reward?.amount_in_dollars || 0);
    const rewardText = reward ? reward.toFixed(2) : "0.00";
    const rewardAlt = String(reward || 0);

    if (requester && rowText.includes(requester)) score += 4;
    if (title && rowText.includes(title)) {
      score += 5;
    } else if (titleLoose && rowTextLoose.includes(titleLoose)) {
      score += 5;
    }
    if (reward && (rowText.includes(`$${rewardText}`) || rowText.includes(rewardText) || rowText.includes(rewardAlt))) score += 2;

    const requesterId = normalize(raw.requester_id || requesterIdFromUrl(raw.requester_url));
    if (requesterId) {
      const links = Array.from(row.querySelectorAll('a[href*="/requesters/"]'));
      if (links.some((a) => normalize(a.getAttribute("href") || "").includes(requesterId))) score += 2;
    }

    return score;
  }

  function getDomRows() {
    return getHydratedHitNodes();
  }

  function acceptControlFromRow(row) {
    if (!row) return null;
    const nodes = Array.from(row.querySelectorAll("button, a, input, span, div"));
    return nodes.find((n) => {
      const t = normalize(textOf(n) || n.value || "");
      return t === "accept & work" || t === "accept";
    }) || null;
  }

  function requesterIdFromUrl(url) {
    const m = String(url || "").match(/\/requesters\/([^/]+)\//);
    return m ? m[1] : "";
  }


  const GHOST_STORAGE_KEY = "mhhGhostStateV1";
  const WATCH_STORAGE_KEY = "mhhWatchStateV1";

  function loadGhostState() {
    try {
      return JSON.parse(sessionStorage.getItem(GHOST_STORAGE_KEY) || "{}");
    } catch (err) {
      return {};
    }
  }

  function saveGhostState(state) {
    try {
      sessionStorage.setItem(GHOST_STORAGE_KEY, JSON.stringify(state || {}));
    } catch (err) {}
  }

  function loadWatchState() {
    try {
      return JSON.parse(sessionStorage.getItem(WATCH_STORAGE_KEY) || "{}");
    } catch (err) {
      return {};
    }
  }

  function saveWatchState(state) {
    try {
      sessionStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(state || {}));
    } catch (err) {}
  }

  function listWatchEntries() {
    const store = pruneWatchState(loadWatchState());
    saveWatchState(store);
    return Object.entries(store).map(([key, value]) => ({
      key,
      requester: value && value.requester ? value.requester : "",
      title: value && value.title ? value.title : "",
      watchedAt: value && value.watchedAt ? value.watchedAt : 0,
      until: value && value.until ? value.until : 0,
      baselineAgeSeconds: value && Number.isFinite(Number(value.baselineAgeSeconds)) ? Number(value.baselineAgeSeconds) : null,
      baselineCreationTime: value && value.baselineCreationTime ? value.baselineCreationTime : "",
      baselineCreatedDirection: value && value.baselineCreatedDirection ? value.baselineCreatedDirection : "unknown",
      baselineCreatedDisplayText: value && value.baselineCreatedDisplayText ? value.baselineCreatedDisplayText : ""
    })).sort((a, b) => String(a.title || a.key).localeCompare(String(b.title || b.key)));
  }

  function removeWatchItems(keys) {
    const store = pruneWatchState(loadWatchState());
    let changed = false;
    for (const key of (keys || [])) {
      const normalizedKey = String(key || "").trim();
      if (normalizedKey && Object.prototype.hasOwnProperty.call(store, normalizedKey)) {
        delete store[normalizedKey];
        changed = true;
      }
    }
    if (changed) saveWatchState(store);
    return { ok: true, removed: changed, entries: listWatchEntries() };
  }

  function pruneWatchState(state) {
    const next = {};
    const now = Date.now();
    for (const [key, value] of Object.entries(state || {})) {
      if (!value || typeof value !== "object") continue;
      if (value.until && value.until <= now) continue;
      next[key] = value;
    }
    return next;
  }

  function watchKeyForItem(item) {
    return String(item.hitSetId || item.id || "").trim();
  }

  function getStableItemKey(item) {
    const key = watchKeyForItem(item);
    if (key) return key.replace(/"/g, "");
    return normalize([(item && item.requester) || "", (item && item.title) || "", String(item && item.reward || "")].join("|"));
  }

  function currentAgeSecondsForItem(item) {
    if (Number.isFinite(item.createdAgeSeconds)) return item.createdAgeSeconds;
    if (item.creationTime) {
      const createdMs = Date.parse(item.creationTime);
      if (!Number.isNaN(createdMs)) {
        return Math.max(0, (Date.now() - createdMs) / 1000);
      }
    }
    return null;
  }

  function createdDirectionForItem(item) {
    const direction = String(item && item.createdDirection ? item.createdDirection : "").trim().toLowerCase();
    if (direction === "future" || direction === "past") return direction;
    if (item && item.creationTime) return "past";
    return "unknown";
  }

  function refreshToleranceSeconds(currentAgeSeconds) {
    if (!Number.isFinite(currentAgeSeconds)) return 20;
    if (currentAgeSeconds < 120) return 35;
    if (currentAgeSeconds < 3600) return 90;
    return 300;
  }

  function watchSnapshotSignatureForItems(items) {
    return (items || []).map((item) => [
      watchKeyForItem(item),
      item.creationTime || "",
      item.createdDirection || "",
      item.createdDisplayText || "",
      Number.isFinite(item.createdAgeSeconds) ? Math.round(item.createdAgeSeconds) : "",
      Number.isFinite(item.hitCount) ? item.hitCount : ""
    ].join("|")).join("||");
  }

  function currentWatchRefreshId(items) {
    const signature = watchSnapshotSignatureForItems(items);
    if (signature !== STATE.watchSnapshotSignature) {
      STATE.watchSnapshotSignature = signature;
      STATE.watchRefreshId = (STATE.watchRefreshId || 0) + 1;
    }
    return STATE.watchRefreshId || 0;
  }

  function addTopItemToWatchList() {
    if (!STATE.topItem) return;
    const key = watchKeyForItem(STATE.topItem);
    if (!key) return;

    const delaySeconds = parseDuration(STATE.settings.watchDelay);
    if (!delaySeconds || delaySeconds <= 0) {
      showAlert("Watch delay is not configured");
      return;
    }

    const currentAgeSeconds = currentAgeSecondsForItem(STATE.topItem);
    const currentDirection = createdDirectionForItem(STATE.topItem);
    const store = pruneWatchState(loadWatchState());
    const now = Date.now();
    store[key] = {
      watchedAt: now,
      until: now + delaySeconds * 1000,
      baselineAgeSeconds: Number.isFinite(currentAgeSeconds) ? currentAgeSeconds : null,
      baselineCreationTime: STATE.topItem.creationTime || "",
      baselineCreatedDirection: currentDirection,
      baselineCreatedDisplayText: STATE.topItem.createdDisplayText || "",
      lastSeenAt: now,
      lastSeenAgeSeconds: Number.isFinite(currentAgeSeconds) ? currentAgeSeconds : null,
      lastSeenCreationTime: STATE.topItem.creationTime || "",
      lastSeenCreatedDirection: currentDirection,
      lastSeenCreatedDisplayText: STATE.topItem.createdDisplayText || "",
      lastEvaluatedRefreshId: 0,
      requester: STATE.topItem.requester || "",
      title: STATE.topItem.title || ""
    };
    saveWatchState(store);
    showAlert("Watching top HIT for " + STATE.settings.watchDelay);
    rerank();
  }

  function applyWatchSuppression(item, store, refreshId) {
    const key = watchKeyForItem(item);
    if (!key) {
      return { ...item, watchSuppressed: false, watchReleasedByRefresh: false };
    }

    const now = Date.now();
    const entry = store[key];
    if (!entry) {
      return { ...item, watchSuppressed: false, watchReleasedByRefresh: false };
    }

    if (!entry.until || entry.until <= now) {
      delete store[key];
      return { ...item, watchSuppressed: false, watchReleasedByRefresh: false };
    }

    if (entry.lastEvaluatedRefreshId === refreshId) {
      return {
        ...item,
        watchSuppressed: true,
        filteredOut: item.filteredOut || true,
        hidden: true
      };
    }

    const currentAgeSeconds = currentAgeSecondsForItem(item);
    const currentDirection = createdDirectionForItem(item);
    const baselineDirection = String(entry.baselineCreatedDirection || "unknown").toLowerCase();
    const lastSeenDirection = String(entry.lastSeenCreatedDirection || baselineDirection || "unknown").toLowerCase();
    let refreshed = false;

    if (baselineDirection === "future") {
      if (lastSeenDirection === "future" && currentDirection === "past") {
        refreshed = true;
      }
    } else {
      if (currentDirection === "future") {
        refreshed = true;
      }

      if (!refreshed && entry.lastSeenCreationTime && item.creationTime) {
        const lastSeenMs = Date.parse(entry.lastSeenCreationTime);
        const currentMs = Date.parse(item.creationTime);
        if (!Number.isNaN(lastSeenMs) && !Number.isNaN(currentMs) && currentMs > lastSeenMs + 1000) {
          refreshed = true;
        }
      }

      if (!refreshed && Number.isFinite(Number(entry.lastSeenAgeSeconds)) && Number.isFinite(currentAgeSeconds)) {
        const elapsedSeconds = Math.max(0, (now - Number(entry.lastSeenAt || now)) / 1000);
        const expectedAgeSeconds = Number(entry.lastSeenAgeSeconds) + elapsedSeconds;
        const toleranceSeconds = refreshToleranceSeconds(currentAgeSeconds);
        if (currentAgeSeconds + toleranceSeconds < expectedAgeSeconds) {
          refreshed = true;
        }
      }
    }

    if (refreshed) {
      delete store[key];
      return { ...item, watchSuppressed: false, watchReleasedByRefresh: true };
    }

    entry.lastSeenAt = now;
    entry.lastSeenAgeSeconds = Number.isFinite(currentAgeSeconds) ? currentAgeSeconds : null;
    entry.lastSeenCreationTime = item.creationTime || "";
    entry.lastSeenCreatedDirection = currentDirection;
    entry.lastSeenCreatedDisplayText = item.createdDisplayText || "";
    entry.lastEvaluatedRefreshId = refreshId;
    store[key] = entry;

    return {
      ...item,
      watchSuppressed: true,
      filteredOut: item.filteredOut || true,
      hidden: true
    };
  }

  function pruneGhostState(state) {
    const next = {};
    const now = Date.now();
    for (const [key, value] of Object.entries(state || {})) {
      if (!value || typeof value !== "object") continue;
      if (value.suppressUntil && value.suppressUntil <= now && (!value.lowSeenCount || value.lowSeenCount <= 0)) continue;
      if (value.lastSeenAt && (now - value.lastSeenAt) > 86400000 && (!value.suppressUntil || value.suppressUntil <= now)) continue;
      next[key] = value;
    }
    return next;
  }

  function extractHitCount(raw, row) {
    const rawCandidates = [
      raw && raw.assignable_hits_count,
      raw && raw.available_hits_count,
      raw && raw.project_available_hits_count,
      raw && raw.hit_count,
      raw && raw.hits_count,
      raw && raw.number_of_hits
    ];

    for (const candidate of rawCandidates) {
      const n = Number(candidate);
      if (Number.isFinite(n)) return n;
    }

    if (row) {
      const cells = rowCells(row);
      const countCell = cells[2] || null;
      const countText = textOf(countCell || "");
      const match = countText.replace(/,/g, "").match(/\b\d+\b/);
      if (match) return Number(match[0]);
    }

    return null;
  }

  function extractCreatedInfo(raw, row) {
    const rawCandidates = [
      raw && raw.created_since_text,
      raw && raw.creation_time_text,
      raw && raw.created_text,
      raw && raw.creationTimeText
    ];

    for (const candidate of rawCandidates) {
      const info = parseCreatedTimingInfo(candidate);
      if (info.direction !== "unknown" && info.seconds != null) {
        return info;
      }
    }

    if (raw && raw.creation_time) {
      const createdMs = Date.parse(raw.creation_time);
      if (!Number.isNaN(createdMs)) {
        return {
          direction: "past",
          seconds: Math.max(0, (Date.now() - createdMs) / 1000),
          text: raw.creation_time
        };
      }
    }

    if (row) {
      const desktopCreatedCell = row instanceof HTMLElement ? row.querySelector(":scope > .desktop-row > .created-column") : null;
      const cells = rowCells(row);
      const createdCell = desktopCreatedCell || cells[4] || null;
      const createdText = textOf(createdCell || "");
      const info = parseCreatedTimingInfo(createdText);
      if (info.direction !== "unknown" && info.seconds != null) {
        return info;
      }
    }

    return { direction: "unknown", seconds: null, text: "" };
  }

  function applyGhostSuppression(item) {
    const key = String(item.hitSetId || item.id || "").trim();
    if (!key) {
      return { ...item, lowCountGhostSuppressed: false };
    }

    const minVisibleHitCount = Math.max(0, Number(STATE.settings.minVisibleHitCount || 0));
    const ghostHitCountThreshold = Math.max(0, Number(STATE.settings.ghostHitCountThreshold || 1));
    const ghostSuppressAfterSeen = Math.max(1, Number(STATE.settings.ghostSuppressAfterSeen || 2));
    const ghostSuppressMinutes = Math.max(1, Number(STATE.settings.ghostSuppressMinutes || 10));
    const now = Date.now();

    const store = pruneGhostState(loadGhostState());
    const entry = { ...(store[key] || {}) };
    const hitCount = Number.isFinite(item.hitCount) ? item.hitCount : null;
    const isLowCount = hitCount != null && hitCount <= ghostHitCountThreshold;

    entry.lastSeenAt = now;
    if (hitCount != null) entry.lastHitCount = hitCount;

    if (isLowCount) {
      entry.lowSeenCount = Number(entry.lowSeenCount || 0) + 1;
      if (entry.lowSeenCount >= ghostSuppressAfterSeen) {
        entry.suppressUntil = now + ghostSuppressMinutes * 60000;
      }
    } else if (hitCount != null && hitCount >= minVisibleHitCount) {
      entry.lowSeenCount = 0;
      entry.suppressUntil = 0;
    }

    store[key] = entry;
    saveGhostState(store);

    const lowCountFiltered = hitCount != null && hitCount < minVisibleHitCount;
    const lowCountGhostSuppressed = !!(entry.suppressUntil && entry.suppressUntil > now);

    return {
      ...item,
      lowCountFiltered,
      lowCountGhostSuppressed,
      ghostLowSeenCount: Number(entry.lowSeenCount || 0),
      filteredOut: item.filteredOut || lowCountFiltered || lowCountGhostSuppressed,
      hidden: item.hidden || lowCountFiltered || lowCountGhostSuppressed
    };
  }

  function hiddenEntryForItem(item) {
    return "group:" + normalize(item.requester + "|" + item.title);
  }

  function hiddenByPattern(title, item) {
    const patterns = STATE.settings.hiddenHitPatterns || [];
    const value = normalize(title);
    const groupKey = item ? hiddenEntryForItem(item) : "";
    return patterns.some((pattern) => {
      const normalizedPattern = String(pattern || "").trim();
      if (!normalizedPattern) return false;
      if (normalizedPattern.startsWith("group:")) {
        return !!groupKey && normalize(normalizedPattern) === groupKey;
      }
      try { return new RegExp(normalizedPattern, "i").test(value); }
      catch (err) { return value.includes(normalize(normalizedPattern)); }
    });
  }

  function excludedOpportunity(item) {
    const list = STATE.settings.excludedOpportunities || [];
    const key = normalize(item.requester + "|" + item.title);
    return list.includes(key);
  }

  function approvalRateForItem(item) {
    return parseApprovalRate(item.requesterInfo && item.requesterInfo.taskApprovalRate ? item.requesterInfo.taskApprovalRate : "");
  }

  function scoreItem(item) {
    const blocked = !!STATE.settings.blockedRequesters[item.requesterId] || !!STATE.settings.blockedRequesters[normalize(item.requester)];
    const hidden = hiddenByPattern(item.title, item);
    const manuallyExcluded = excludedOpportunity(item);
    const notes = STATE.settings.requesterNotes[item.requesterId] || STATE.settings.requesterNotes[normalize(item.requester)] || {};
    const noteScore = Number(notes.score || 0);
    const noteSpeed = Number(notes.speed || 0);

    let score = 0;
    score += Math.min(item.reward * 20, 40);
    if (item.approvalRate != null) score += Math.max(0, Math.min((item.approvalRate - 90) * 1.5, 20));
    score += Math.max(0, Math.min(noteScore, 25));
    score += Math.max(0, Math.min(noteSpeed, 15));

    let ageSeconds = currentAgeSecondsForItem(item);
    if (ageSeconds != null) {
      const boostWindowSeconds = 3600;
      if (ageSeconds < boostWindowSeconds) {
        score += ((boostWindowSeconds - ageSeconds) / boostWindowSeconds) * 10;
      }
    }

    if (STATE.settings.mode === "reward") {
      score += item.reward * 30;
    } else if (STATE.settings.mode === "acceptance") {
      score += Math.max(0, ((item.approvalRate == null ? 95 : item.approvalRate) - 90) * 1.8);
      score += noteScore * 1.5 + noteSpeed * 1.5;
    }

    const maxAgeSeconds = parseDuration(STATE.settings.maxAge);
    const tooOld = maxAgeSeconds != null && ageSeconds != null && ageSeconds > maxAgeSeconds;

    const filteredOut = (
      blocked ||
      hidden ||
      tooOld ||
      item.reward < Number(STATE.settings.minReward || 0) ||
      (item.approvalRate != null && item.approvalRate < Number(STATE.settings.minApprovalRate || 0))
    );

    return {
      ...item,
      blocked,
      hidden: hidden || tooOld,
      tooOld,
      manuallyExcluded,
      filteredOut,
      excluded: filteredOut || manuallyExcluded,
      score: Math.round(score * 100) / 100
    };
  }

  function classFor(item) {
    if (item.filteredOut || item.manuallyExcluded) return "mhh-bad";
    return "";
  }

  function clearDecorations() {
    document.querySelectorAll(".mhh-pill,.mhh-badge,.mhh-debug-tag").forEach((el) => el.remove());
    document.querySelectorAll(".mhh-hidden,.mhh-top,.mhh-good,.mhh-ok,.mhh-bad,.mhh-debug-outline").forEach((el) => {
      el.classList.remove("mhh-hidden", "mhh-top", "mhh-good", "mhh-ok", "mhh-bad", "mhh-debug-outline");
    });
    document.querySelectorAll('[data-mhh-row-styled="1"]').forEach((el) => {
      el.style.removeProperty("background");
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.style.removeProperty("box-shadow");
      el.style.removeProperty("position");
      el.removeAttribute("data-mhh-row-styled");
    });
    document.querySelectorAll('.mhh-pill-host').forEach((el) => {
      el.remove();
    });
    clearDebugDecorations();
  }

  function rowCells(row) {
    const tableCells = Array.from(row.querySelectorAll(":scope > td, :scope > th")).filter((el) => el instanceof HTMLElement);
    if (tableCells.length) return tableCells;

    const desktopRow = row.querySelector(":scope > .desktop-row");
    if (desktopRow instanceof HTMLElement) {
      const desktopCells = Array.from(desktopRow.querySelectorAll(":scope > .column")).filter((el) => el instanceof HTMLElement);
      if (desktopCells.length) return desktopCells;
    }

    return [];
  }

  function applyRowVisuals(row, toneClass, isTop) {
    const toneMap = {
      "mhh-good": "rgba(34,197,94,0.10)",
      "mhh-ok": "rgba(250,204,21,0.16)",
      "mhh-bad": "rgba(239,68,68,0.10)"
    };
    const background = isTop ? toneMap["mhh-good"] : (toneClass ? toneMap[toneClass] : "");
    const containerTargets = [row];

    const desktopRow = row.querySelector(":scope > .desktop-row");
    if (desktopRow instanceof HTMLElement) containerTargets.push(desktopRow);

    const mobileRow = row.querySelector(":scope > .mobile-row");
    if (mobileRow instanceof HTMLElement) containerTargets.push(mobileRow);

    containerTargets.forEach((el) => {
      el.setAttribute("data-mhh-row-styled", "1");
      if (background) {
        el.style.setProperty("background", background, "important");
      }
      if (isTop) {
        el.style.setProperty("box-shadow", "inset 0 0 0 2px #22c55e", "important");
      }
    });

    row.setAttribute("data-mhh-row-styled", "1");
    row.style.setProperty("position", "relative", "important");
    if (isTop) {
      row.style.setProperty("outline", "4px solid #22c55e", "important");
      row.style.setProperty("outline-offset", "-2px", "important");
    }
  }

  function pillCellForRow(row, item) {
    if (row instanceof HTMLElement) {
      const desktopTitleCell = row.querySelector(":scope > .desktop-row > .project-name-column");
      if (desktopTitleCell instanceof HTMLElement) return desktopTitleCell;
    }

    const cells = rowCells(row);
    if (!cells.length) return row;
    return cells[1] || cells[2] || row;
  }

  function pillAnchorForRow(row, item, cell) {
    const anchor = findBestAnchor(row, item && item.title ? item.title : "");
    if (!(anchor instanceof HTMLElement)) return null;
    if (cell instanceof HTMLElement && cell.contains(anchor)) return anchor;
    return null;
  }

  function pillHostForRow(row, item) {
    const cell = pillCellForRow(row, item);
    const itemKey = getStableItemKey(item);

    Array.from(row.querySelectorAll('.mhh-pill-host')).forEach((host) => {
      if (!(host instanceof HTMLElement)) return;
      if (host.getAttribute('data-mhh-item-key') !== itemKey) return;
      if (host.parentElement !== cell) {
        host.remove();
      }
    });

    let host = cell.querySelector('.mhh-pill-host[data-mhh-item-key="' + itemKey + '"]');
    const anchor = pillAnchorForRow(row, item, cell);

    if (!host) {
      host = document.createElement("span");
      host.className = "mhh-pill-host";
      host.setAttribute('data-mhh-pill-host', '1');
      host.setAttribute('data-mhh-item-key', itemKey);
    }

    host.style.setProperty("display", "inline-flex", "important");
    host.style.setProperty("flex-wrap", "wrap", "important");
    host.style.setProperty("gap", "6px", "important");
    host.style.setProperty("align-items", "center", "important");
    host.style.setProperty("justify-content", "flex-start", "important");
    host.style.setProperty("margin", "0 0 0 8px", "important");
    host.style.setProperty("width", "auto", "important");
    host.style.setProperty("max-width", "100%", "important");
    host.style.setProperty("box-sizing", "border-box", "important");
    host.style.setProperty("vertical-align", "middle", "important");

    if (host.parentElement !== cell) {
      if (anchor && anchor.parentNode === cell && anchor.nextSibling) {
        cell.insertBefore(host, anchor.nextSibling);
      } else if (anchor && anchor.parentNode === cell) {
        cell.appendChild(host);
      } else {
        cell.appendChild(host);
      }
    } else if (anchor && anchor.parentNode === cell && host.previousSibling !== anchor) {
      if (anchor.nextSibling) {
        cell.insertBefore(host, anchor.nextSibling);
      } else {
        cell.appendChild(host);
      }
    }

    while (host.firstChild) host.removeChild(host.firstChild);
    return host;
  }

  function decorate(item, isTop) {
    const row = item.row;
    if (!row) return;
    if (shouldHideRow(item)) {
      row.classList.add("mhh-hidden");
      return;
    }

    const toneClass = classFor(item);
    if (toneClass) row.classList.add(toneClass);
    if (isTop) row.classList.add("mhh-top");
    applyRowVisuals(row, toneClass, isTop);

    const anchor = findBestAnchor(row, item.title) || row;
    const host = pillHostForRow(row, item);

    const pillText = item.manuallyExcluded
      ? "Excluded from top"
      : (item.watchSuppressed
        ? "Watch delay"
        : (item.lowCountGhostSuppressed
          ? "Ghost-suppressed"
          : (item.lowCountFiltered
            ? "Low HIT count"
            : (item.blocked
              ? "Blocked requester"
              : (item.tooOld
                ? "Older than max age"
                : (item.hidden
                  ? "Hidden by list"
                  : (item.filteredOut ? "Below requirements" : ("Score " + item.score))))))));

    if (pillText) {
      const pill = document.createElement("span");
      pill.className = "mhh-pill";
      pill.textContent = pillText;
      host.appendChild(pill);
    }

    if (isTop) {
      const badge = document.createElement("span");
      badge.className = "mhh-badge";
      badge.textContent = "Top";
      host.appendChild(badge);
    }

    if (debugEnabled()) {
      anchor.classList.add("mhh-debug-outline");
      const tag = document.createElement("span");
      tag.className = "mhh-debug-tag";
      tag.textContent = "#" + item.debugIndex;
      host.appendChild(tag);
    }
  }


  function findBestAnchor(row, titleText) {
    if (!row) return null;
    const titleNorm = normalize(titleText || "");
    const titleCell = pillCellForRow(row, null);

    if (!(titleCell instanceof HTMLElement)) return row instanceof HTMLElement ? row : null;

    const directTextSpan = titleCell.querySelector(":scope > a, :scope > span, :scope > strong");
    if (directTextSpan instanceof HTMLElement) {
      const directText = normalize(textOf(directTextSpan));
      if (!titleNorm || (directText && directText.includes(titleNorm))) {
        return directTextSpan;
      }
    }

    const candidates = Array.from(titleCell.querySelectorAll(":scope > a, :scope > span, :scope > strong, :scope > p, :scope > div, a, span, strong, p, div")).filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (!titleCell.contains(el)) return false;
      const t = normalize(textOf(el));
      if (!t) return false;
      if (titleNorm && !t.includes(titleNorm)) return false;
      if (el.children.length > 3 && titleNorm && t.length > titleNorm.length + 40) return false;
      return true;
    });

    if (candidates.length) {
      candidates.sort((a, b) => textOf(a).length - textOf(b).length);
      return candidates[0];
    }

    return titleCell;
  }

  function collectItems() {
    const data = getReactData();
    if (!data || !Array.isArray(data.bodyData)) {
      log("No react bodyData found");
      STATE.debugRows = [];
      return [];
    }

    const rows = getDomRows();
    if (!rows.length) {
      log("No hydrated DOM nodes available yet", { bodyData: data.bodyData.length });
    }

    const baseItems = [];
    const items = [];
    const debugRows = [];
    const usedRows = new Set();

    for (let i = 0; i < data.bodyData.length; i++) {
      const raw = data.bodyData[i];

      let bestRow = null;
      let bestScore = -1;

      for (const candidate of rows) {
        if (usedRows.has(candidate)) continue;
        const matchScore = scoreHydratedMatch(candidate, raw);
        if (matchScore > bestScore) {
          bestScore = matchScore;
          bestRow = candidate;
        }
      }

      if (bestRow && bestScore >= 9) {
        usedRows.add(bestRow);
      } else {
        bestRow = null;
      }

      const control = acceptControlFromRow(bestRow);
      const createdInfo = extractCreatedInfo(raw, bestRow);
      const scoredBase = scoreItem({
        id: normalize([(raw.requester_name || ""), (raw.title || ""), String(raw.monetary_reward?.amount_in_dollars || 0)].join("|")),
        hitSetId: raw.hit_set_id,
        requesterId: raw.requester_id || requesterIdFromUrl(raw.requester_url),
        requester: raw.requester_name || "",
        title: raw.title || "",
        reward: Number(raw.monetary_reward?.amount_in_dollars || 0),
        hitCount: extractHitCount(raw, bestRow),
        approvalRate: approvalRateForItem(raw),
        creationTime: raw.creation_time || "",
        createdAgeSeconds: createdInfo.seconds,
        createdDirection: createdInfo.direction,
        createdDisplayText: createdInfo.text,
        row: bestRow,
        control,
        acceptUrl: raw.accept_project_task_url || "",
        debugIndex: i,
        debugMatchScore: bestScore
      });
      baseItems.push(scoredBase);
    }

    const watchStore = pruneWatchState(loadWatchState());
    const refreshId = currentWatchRefreshId(baseItems);

    for (const baseItem of baseItems) {
      const watched = applyWatchSuppression(baseItem, watchStore, refreshId);
      const scored = applyGhostSuppression(watched);
      items.push(scored);

      const anchor = findBestAnchor(baseItem.row, scored.title);
      const info = anchorInfo(anchor);
      debugRows.push({
        index: baseItem.debugIndex,
        requester: scored.requester,
        title: scored.title,
        score: scored.score,
        matchScore: baseItem.debugMatchScore,
        filteredOut: scored.filteredOut,
        manuallyExcluded: scored.manuallyExcluded,
        hasRow: !!baseItem.row,
        hasControl: !!baseItem.control,
        hitCount: scored.hitCount,
        ghostLowSeenCount: scored.ghostLowSeenCount,
        lowCountFiltered: scored.lowCountFiltered,
        lowCountGhostSuppressed: scored.lowCountGhostSuppressed,
        watchSuppressed: scored.watchSuppressed,
        watchReleasedByRefresh: scored.watchReleasedByRefresh,
        createdAgeSeconds: scored.createdAgeSeconds,
        anchorTag: info.anchorTag,
        anchorText: info.anchorText
      });
    }

    saveWatchState(watchStore);

    items.sort((a, b) => b.score - a.score);
    STATE.debugRows = debugRows;

    log("Mapped hydrated rows", {
      domRows: rows.length,
      bodyData: data.bodyData.length,
      matchedRows: debugRows.filter((r) => r.hasRow).length,
      matchedControls: debugRows.filter((r) => r.hasControl).length
    });

    if (debugEnabled()) {
      dumpMappingToConsole();
    }

    return items;
  }


  async function rerank() {
    if (STATE.rerankInFlight) {
      STATE.rerankQueued = true;
      return;
    }

    STATE.rerankInFlight = true;
    try {
      if (!STATE.settings.enabled) {
        clearDecorations();
        STATE.topItem = null;
        showStatus("MTurk HIT Helper is off");
        stopCountdown();
        return;
      }

      if (!onHitsSearchPage()) {
        clearDecorations();
        STATE.topItem = null;
        showStatus("MTurk HIT Helper idle on this page");
        stopCountdown();
        return;
      }

      ensureToolbar();
      const rowsReady = await waitForRows(3000);
      log("Rows ready", rowsReady);
      clearDecorations();
      const items = collectItems();
      STATE.items = items;

      const visible = items.filter((item) => !item.filteredOut && !item.hidden && !item.blocked);
      const renderedCount = items.filter((item) => !shouldHideRow(item)).length;
      const hiddenCount = Math.max(0, items.length - renderedCount);
      const candidates = visible.filter((item) => !item.manuallyExcluded);
      STATE.topItem = candidates.length ? candidates[0] : null;

      items.forEach((item) => decorate(item, STATE.topItem && STATE.topItem.id === item.id));

      if (!items.length) {
        showStatus("No HIT data found");
        return;
      }
      if (!visible.length) {
        showStatus(renderedCount === items.length ? ("Showing all " + items.length + " rows • no eligible top HIT") : ("Found " + items.length + " rows, all filtered out"));
        return;
      }
      if (!STATE.topItem) {
        showStatus("Watching " + visible.length + " visible HITs • no eligible top HIT" + (hiddenCount > 0 ? (" • " + hiddenCount + " hidden") : ""));
        return;
      }
      showStatus("Watching " + visible.length + " visible HITs" + (hiddenCount > 0 ? (" • " + hiddenCount + " hidden") : "") + " • top = " + STATE.topItem.title);

      if (STATE.topItem && STATE.lastAlertId !== STATE.topItem.id) {
        STATE.lastAlertId = STATE.topItem.id;
        showAlert("Top HIT: " + STATE.topItem.title + " • $" + STATE.topItem.reward.toFixed(2));
        beep();
      }
    } finally {
      STATE.rerankInFlight = false;
      if (STATE.rerankQueued) {
        STATE.rerankQueued = false;
        window.setTimeout(rerank, 0);
      }
    }
  }

  function fireRealClick(node) {
    if (!(node instanceof HTMLElement)) return false;
    const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    for (const type of events) {
      node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  }

  function acceptTop() {
    if (!STATE.topItem) return;
    if (STATE.topItem.control) {
      try { STATE.topItem.control.focus(); } catch (err) {}
      log("Accepting via control", STATE.topItem.title);
      fireRealClick(STATE.topItem.control);
      return;
    }
    if (STATE.topItem.acceptUrl) {
      log("Accepting via URL", STATE.topItem.title, STATE.topItem.acceptUrl);
      window.location.href = STATE.topItem.acceptUrl;
    }
  }

  function patchSettings(patch, callback) {
    chrome.runtime.sendMessage({ type: "PATCH_SETTINGS", payload: patch }, (response) => {
      STATE.settings = (response && response.settings) ? response.settings : { ...STATE.settings, ...patch };
      ensureToolbar();
      showCountdown(refreshCountdownText());
      updateAudioButtonLabel();
      updateHideToggleLabel();
      if (callback) callback();
    });
  }

  function blockTopRequester() {
    if (!STATE.topItem) return;
    const next = { ...(STATE.settings.blockedRequesters || {}) };
    next[STATE.topItem.requesterId] = STATE.topItem.requester || "Blocked";
    patchSettings({ blockedRequesters: next }, rerank);
  }

  function hideTopTitle() {
    if (!STATE.topItem) return;
    const hiddenEntry = hiddenEntryForItem(STATE.topItem);
    const next = [...(STATE.settings.hiddenHitPatterns || [])];
    if (!next.includes(hiddenEntry)) next.push(hiddenEntry);
    patchSettings({ hiddenHitPatterns: next }, rerank);
  }

  function excludeTopOpportunity() {
    if (!STATE.topItem) return;
    const key = normalize(STATE.topItem.requester + "|" + STATE.topItem.title);
    const next = [...(STATE.settings.excludedOpportunities || [])];
    if (!next.includes(key)) next.push(key);
    patchSettings({ excludedOpportunities: next }, rerank);
  }

  function hardRefreshPage() {
    if (!STATE.settings.refreshEnabled) return false;
    if (!onHitsSearchPage()) return false;

    const currentUrl = window.location.href;
    log("Hard refresh via URL assign", currentUrl);
    window.location.assign(currentUrl);
    return true;
  }

  function nextRefreshDelay() {
    const min = Math.max(5, Number(STATE.settings.refreshMinSeconds || 8));
    const max = Math.max(min, Number(STATE.settings.refreshMaxSeconds || 12));
    return Math.floor((min + Math.random() * (max - min)) * 1000);
  }

  function scheduleRefresh() {
    if (STATE.refreshTimer) clearTimeout(STATE.refreshTimer);
    if (!STATE.settings.enabled || !STATE.settings.refreshEnabled || !onHitsSearchPage()) {
      stopCountdown();
      return;
    }

    const delay = nextRefreshDelay();
    STATE.nextRefreshAt = Date.now() + delay;
    startCountdown();

    STATE.refreshTimer = setTimeout(() => {
      try {
        hardRefreshPage();
      } catch (err) {
        log("Hard refresh failed", err);
      }
    }, delay);
  }

  function scheduleScan() {
    if (STATE.scanTimer) clearInterval(STATE.scanTimer);
    STATE.scanTimer = setInterval(rerank, 2000);
  }

  function keyHandler(event) {
    const active = document.activeElement;
    const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    if (typing || event.repeat || !STATE.settings.enabled) return;

    const key = normalize(event.key);
    if (key === "z") {
      event.preventDefault();
      event.stopPropagation();
      acceptTop();
    } else if (key === "b") {
      event.preventDefault();
      blockTopRequester();
    } else if (key === "h") {
      event.preventDefault();
      hideTopTitle();
    } else if (key === "x") {
      event.preventDefault();
      excludeTopOpportunity();
    } else if (key === "w") {
      event.preventDefault();
      addTopItemToWatchList();
    } else if (key === "r") {
      event.preventDefault();
      rerank();
    }
  }



  function scheduleMutationRerank() {
    if (STATE.mutationRerankTimer) clearTimeout(STATE.mutationRerankTimer);
    STATE.mutationRerankTimer = setTimeout(() => {
      STATE.mutationRerankTimer = null;
      rerank();
    }, 150);
  }

  function ensureMutationObserver() {
    if (STATE.mutationObserver || !document.body) return;
    STATE.mutationObserver = new MutationObserver((mutations) => {
      if (!onHitsSearchPage()) return;
      for (const mutation of mutations || []) {
        let relevant = false;

        if (mutation.type === 'childList') {
          const nodes = [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])];
          relevant = nodes.some((node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (node.closest?.('.mhh-pill-host, #mhh-toolbar, #mhh-alert')) return false;
            if (node.matches?.('tr, tbody, table, td, [role="row"]')) return true;
            if (node.querySelector?.('tr, tbody, table, td, [role="row"]')) return true;
            return false;
          });
        } else if (mutation.type === 'characterData') {
          const parent = mutation.target && mutation.target.parentElement;
          if (parent && parent.closest && parent.closest('.mhh-pill-host, #mhh-toolbar, #mhh-alert')) {
            relevant = false;
          } else {
            relevant = !!(parent && parent.closest && parent.closest('tr, [role="row"]'));
          }
        }

        if (relevant) {
          scheduleMutationRerank();
          break;
        }
      }
    });
    STATE.mutationObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  }


  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;
    if (message.type === "DUMP_MAPPING") {
      dumpMappingToConsole();
      sendResponse({ ok: true, rows: STATE.debugRows.length });
      return true;
    }
    if (message.type === "RERANK_NOW") {
      rerank();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "GET_WATCH_LIST") {
      sendResponse({ ok: true, entries: listWatchEntries() });
      return true;
    }
    if (message.type === "REMOVE_WATCH_ITEMS") {
      const result = removeWatchItems(Array.isArray(message.keys) ? message.keys : []);
      rerank();
      sendResponse(result);
      return true;
    }
  });

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => resolve(settings || {}));
    });
  }

  async function init() {
    ensureStyle();
    STATE.settings = await loadSettings();
    ensureToolbar();
    ensureBox(IDS.status);
    ensureBox(IDS.alert);
    const countdown = ensureBox(IDS.countdown);
    countdown.onclick = toggleRefreshEnabled;
    const hideToggle = ensureBox(IDS.hideToggle, "button");
    hideToggle.onclick = toggleRevealHiddenRows;
    updateHideToggleLabel(hideToggle);
    showCountdown(refreshCountdownText());
    armAudioButton();
    window.addEventListener("keydown", keyHandler, true);
    rerank();
    scheduleScan();
    scheduleRefresh();
    ensureMutationObserver();
    log("Initialized");
  }

  init();
})();
