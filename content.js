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
    debugRows: []
  };

  const IDS = {
    style: "mhh-style",
    status: "mhh-status",
    alert: "mhh-alert",
    arm: "mhh-audio-arm",
    countdown: "mhh-refresh-countdown"
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
      #mhh-status, #mhh-alert, #mhh-refresh-countdown {
        position: fixed;
        right: 16px;
        z-index: 2147483647;
        font: 13px/1.4 Arial, sans-serif;
        color: #fff;
        border-radius: 10px;
        padding: 10px 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.25);
      }
      #mhh-status { top: 16px; background: #1f2937; pointer-events: none; }
      #mhh-refresh-countdown { top: 62px; background: #374151; pointer-events: none; }
      #mhh-alert {
        bottom: 16px;
        background: #111827;
        opacity: 0;
        transform: translateY(12px);
        transition: all .16s ease;
        pointer-events: none;
      }
      #mhh-alert.show { opacity: 1; transform: translateY(0); }
      #mhh-audio-arm {
        position: fixed;
        right: 16px;
        top: 108px;
        z-index: 2147483647;
        font: 13px/1.2 Arial, sans-serif;
        color: #fff;
        background: #2563eb;
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.25);
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBox(id, tagName = "div") {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tagName);
      el.id = id;
      document.body.appendChild(el);
    }
    return el;
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

  function showCountdown(message) {
    ensureBox(IDS.countdown).textContent = message;
  }

  function stopCountdown() {
    if (STATE.countdownTimer) clearInterval(STATE.countdownTimer);
    STATE.countdownTimer = null;
    STATE.nextRefreshAt = null;
    showCountdown("⏸ Reload paused");
  }

  function startCountdown() {
    if (STATE.countdownTimer) clearInterval(STATE.countdownTimer);
    STATE.countdownTimer = setInterval(() => {
      if (!STATE.settings?.refreshEnabled || !STATE.nextRefreshAt) {
        showCountdown("⏸ Reload paused");
        return;
      }
      const remaining = Math.max(0, Math.ceil((STATE.nextRefreshAt - Date.now()) / 1000));
      showCountdown("⏳ Next reload in " + remaining + "s");
    }, 250);
  }

  function armAudioButton() {
    const btn = ensureBox(IDS.arm, "button");
    btn.textContent = STATE.audioArmed ? "Audio alerts enabled" : "Enable audio alerts";
    btn.onclick = async () => {
      try {
        if (!STATE.audioContext) STATE.audioContext = new AudioContext();
        if (STATE.audioContext.state === "suspended") await STATE.audioContext.resume();
        STATE.audioArmed = true;
        btn.textContent = "Audio alerts enabled";
        beep();
      } catch (err) {
        log("Audio arm failed", err);
        btn.textContent = "Audio enable failed";
      }
    };
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
    if (!rowText) return -1;

    let score = 0;
    const requester = normalize(raw.requester_name || "");
    const title = normalize(raw.title || "");
    const reward = Number(raw.monetary_reward?.amount_in_dollars || 0);
    const rewardText = reward ? reward.toFixed(2) : "0.00";
    const rewardAlt = String(reward || 0);

    if (requester && rowText.includes(requester)) score += 4;
    if (title && rowText.includes(title)) score += 5;
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

  function hiddenByPattern(title) {
    const patterns = STATE.settings.hiddenHitPatterns || [];
    const value = normalize(title);
    return patterns.some((pattern) => {
      try { return new RegExp(pattern, "i").test(value); }
      catch (err) { return value.includes(normalize(pattern)); }
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
    const hidden = hiddenByPattern(item.title);
    const manuallyExcluded = excludedOpportunity(item);
    const notes = STATE.settings.requesterNotes[item.requesterId] || STATE.settings.requesterNotes[normalize(item.requester)] || {};
    const noteScore = Number(notes.score || 0);
    const noteSpeed = Number(notes.speed || 0);

    let score = 0;
    score += Math.min(item.reward * 20, 40);
    if (item.approvalRate != null) score += Math.max(0, Math.min((item.approvalRate - 90) * 1.5, 20));
    score += Math.max(0, Math.min(noteScore, 25));
    score += Math.max(0, Math.min(noteSpeed, 15));

    let ageSeconds = null;
    if (item.creationTime) {
      const createdMs = Date.parse(item.creationTime);
      if (!Number.isNaN(createdMs)) {
        ageSeconds = Math.max(0, (Date.now() - createdMs) / 1000);
        const boostWindowSeconds = 3600;
        if (ageSeconds < boostWindowSeconds) {
          score += ((boostWindowSeconds - ageSeconds) / boostWindowSeconds) * 10;
        }
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
    document.querySelectorAll(".mhh-pill,.mhh-badge,.mhh-pill-host").forEach((el) => el.remove());
    document.querySelectorAll(".mhh-hidden,.mhh-top,.mhh-good,.mhh-ok,.mhh-bad").forEach((el) => {
      el.classList.remove("mhh-hidden", "mhh-top", "mhh-good", "mhh-ok", "mhh-bad");
    });
    document.querySelectorAll('[data-mhh-row-styled="1"]').forEach((el) => {
      el.style.removeProperty("background");
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.style.removeProperty("box-shadow");
      el.style.removeProperty("position");
      el.removeAttribute("data-mhh-row-styled");
    });
    clearDebugDecorations();
  }

  function rowCells(row) {
    return Array.from(row.querySelectorAll("td, th")).filter((el) => el instanceof HTMLElement);
  }

  function applyRowVisuals(row, toneClass, isTop) {
    const toneMap = {
      "mhh-good": "rgba(34,197,94,0.10)",
      "mhh-ok": "rgba(250,204,21,0.16)",
      "mhh-bad": "rgba(239,68,68,0.10)"
    };
    const background = isTop ? toneMap["mhh-good"] : (toneClass ? toneMap[toneClass] : "");
    const targets = [row, ...rowCells(row)];
    targets.forEach((el) => {
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

  function pillHostForRow(row, anchor) {
    const firstCell = rowCells(row)[0] || row;
    let host = firstCell.querySelector(":scope > .mhh-pill-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "mhh-pill-host";
      host.style.setProperty("display", "flex", "important");
      host.style.setProperty("flex-wrap", "wrap", "important");
      host.style.setProperty("gap", "6px", "important");
      host.style.setProperty("align-items", "center", "important");
      host.style.setProperty("margin", "4px 0 0 0", "important");

      if (anchor && anchor !== row && anchor.parentElement) {
        anchor.insertAdjacentElement("afterend", host);
      } else if (firstCell.firstChild) {
        firstCell.insertBefore(host, firstCell.firstChild);
      } else {
        firstCell.appendChild(host);
      }
    }
    return host;
  }

  function decorate(item, isTop) {
    const row = item.row;
    if (!row) return;
    if (item.hidden || item.blocked) {
      row.classList.add("mhh-hidden");
      return;
    }
    const toneClass = classFor(item);
    if (toneClass) row.classList.add(toneClass);
    if (isTop) row.classList.add("mhh-top");
    applyRowVisuals(row, toneClass, isTop);

    const anchor = findBestAnchor(row, item.title) || row;
    const host = pillHostForRow(row, anchor);

    if (item.manuallyExcluded || item.filteredOut || isTop) {
      const pill = document.createElement("span");
      pill.className = "mhh-pill";
      pill.textContent = item.manuallyExcluded ? "Excluded from top" : (item.filteredOut ? "Below requirements" : ("Score " + item.score));
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
    const candidates = Array.from(row.querySelectorAll("a, span, div, strong, p"));
    const matched = candidates.filter((el) => {
      const t = normalize(textOf(el));
      return t && titleNorm && t.includes(titleNorm);
    });
    if (matched.length) {
      matched.sort((a, b) => textOf(a).length - textOf(b).length);
      return matched[0];
    }

    const generic = row.querySelector("a, strong, span, div, p");
    return generic || row;
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
      const scored = scoreItem({
        id: normalize([(raw.requester_name || ""), (raw.title || ""), String(raw.monetary_reward?.amount_in_dollars || 0)].join("|")),
        hitSetId: raw.hit_set_id,
        requesterId: raw.requester_id || requesterIdFromUrl(raw.requester_url),
        requester: raw.requester_name || "",
        title: raw.title || "",
        reward: Number(raw.monetary_reward?.amount_in_dollars || 0),
        approvalRate: approvalRateForItem(raw),
        creationTime: raw.creation_time || "",
        row: bestRow,
        control,
        acceptUrl: raw.accept_project_task_url || "",
        debugIndex: i
      });
      items.push(scored);

      const anchor = findBestAnchor(bestRow, scored.title);
      const info = anchorInfo(anchor);
      debugRows.push({
        index: i,
        requester: scored.requester,
        title: scored.title,
        score: scored.score,
        matchScore: bestScore,
        filteredOut: scored.filteredOut,
        manuallyExcluded: scored.manuallyExcluded,
        hasRow: !!bestRow,
        hasControl: !!control,
        anchorTag: info.anchorTag,
        anchorText: info.anchorText
      });
    }

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

    const rowsReady = await waitForRows(3000);
    log("Rows ready", rowsReady);
    clearDecorations();
    const items = collectItems();
    STATE.items = items;

    const visible = items.filter((item) => !item.filteredOut && !item.hidden && !item.blocked);
    const candidates = visible.filter((item) => !item.manuallyExcluded);
    STATE.topItem = candidates.length ? candidates[0] : null;

    items.forEach((item) => decorate(item, STATE.topItem && STATE.topItem.id === item.id));

    if (!items.length) {
      showStatus("No HIT data found");
      return;
    }
    if (!visible.length) {
      showStatus("Found " + items.length + " rows, all filtered out");
      return;
    }
    if (!STATE.topItem) {
      showStatus("Watching " + visible.length + " visible HITs • no eligible top HIT");
      return;
    }
    showStatus("Watching " + visible.length + " visible HITs • top = " + STATE.topItem.title);

    if (STATE.topItem && STATE.lastAlertId !== STATE.topItem.id) {
      STATE.lastAlertId = STATE.topItem.id;
      showAlert("Top HIT: " + STATE.topItem.title + " • $" + STATE.topItem.reward.toFixed(2));
      beep();
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
    const next = [...(STATE.settings.hiddenHitPatterns || []), STATE.topItem.title];
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
    } else if (key === "r") {
      event.preventDefault();
      rerank();
    }
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
  });

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => resolve(settings || {}));
    });
  }

  async function init() {
    ensureStyle();
    STATE.settings = await loadSettings();
    ensureBox(IDS.status);
    ensureBox(IDS.alert);
    ensureBox(IDS.countdown);
    armAudioButton();
    window.addEventListener("keydown", keyHandler, true);
    rerank();
    scheduleScan();
    scheduleRefresh();
    log("Initialized");
  }

  init();
})();
