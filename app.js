let TDEE = 2705;
let PROTEIN_TARGET = 180;
let DEFICIT_TARGET = 500;
const API_BASE = (() => {
  if (typeof window === "undefined") return "https://calorie-tracker-omega-ten.vercel.app";
  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return origin;
  return "https://calorie-tracker-omega-ten.vercel.app";
})();
let authUser = null;
const AUTH_TOKEN_STORAGE_KEY = "calorieTrackerAuthToken";
function getStoredAuthToken() {
  try {
    return window.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}
function setStoredAuthToken(token) {
  try {
    if (token) {
      window.localStorage?.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode); silently ignore.
  }
}
const LAST_LOGGED_DATE_STORAGE_KEY = "calorieTrackerLastLoggedDate";
const MIN_DIET_DATE = "2026-02-09";
const CALENDAR_INITIAL_HISTORY_MONTHS = 6;
const CALENDAR_HISTORY_CHUNK_MONTHS = 3;

// Cut phase tracking (Notion/server is source of truth)
const CUT_PHASE_NAMES = ["Aggressive Cut", "Moderate Cut", "Cruise", "Maintenance"];
const CUT_PHASE_DEFAULT_DEFICITS = [805, 655, 455, 150];
let cutStartDate = null;       // YYYY-MM-DD string or null
let activeCutPhase = null;     // 0 | 1 | 2 | 3 | null
let cutPhaseDeficits = [...CUT_PHASE_DEFAULT_DEFICITS];

// The date the app defaults to on launch: yesterday if before 6am, today otherwise
const DIET_INITIAL_DATE = (() => {
  const now = new Date();
  if (now.getHours() < 6) now.setDate(now.getDate() - 1);
  return formatDate(now);
})();

let todayLogged = false;
let todayEntry = null;
let currentDate = DIET_INITIAL_DATE;
let toastTimer = null;
let celebrationTimer = null;
let calendarVisibleMonth = null;
let calendarHistoryMonths = CALENDAR_INITIAL_HISTORY_MONTHS;
let calendarIsExtending = false;
let latestWeekSummary = null;
let latestPhaseLog = null;
let viewportResizeHandler = null;
let quickEntryScrollY = 0;

const HAPTIC_PATTERNS = {
  tap: 8,
  select: 12,
  success: [18, 30, 18],
  warning: [28, 40, 28],
  error: [50, 40, 50]
};

function triggerHaptic(kind = "tap") {
  if (!navigator.vibrate) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const pattern = HAPTIC_PATTERNS[kind] || HAPTIC_PATTERNS.tap;
  navigator.vibrate(pattern);
}

function getDietDate() {
  return formatDate(new Date());
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthStart(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isFutureDate(dateString) {
  return new Date(`${dateString}T12:00:00`) > new Date(`${getDietDate()}T12:00:00`);
}

function isBeforeMinDietDate(dateString) {
  return new Date(`${dateString}T12:00:00`) < new Date(`${MIN_DIET_DATE}T12:00:00`);
}

function setStatus(msg, variant = null) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.dataset.variant = variant || "";
}

function showToast(message) {
  let toast = document.querySelector(".toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove("visible");
  void toast.offsetWidth;
  toast.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

function getLastLoggedDate() {
  return localStorage.getItem(LAST_LOGGED_DATE_STORAGE_KEY);
}

function rememberLoggedDate(dateString) {
  localStorage.setItem(LAST_LOGGED_DATE_STORAGE_KEY, dateString);
}

function forgetLoggedDate(dateString) {
  if (getLastLoggedDate() === dateString) {
    localStorage.removeItem(LAST_LOGGED_DATE_STORAGE_KEY);
  }
}

function createAuthError(message) {
  const error = new Error(message);
  error.isAuthError = true;
  return error;
}

function showAccessGate(message = "") {
  const gate = document.getElementById("accessGate");
  const error = document.getElementById("accessError");

  document.body.classList.add("auth-locked");
  if (gate) gate.hidden = false;
  if (error) error.textContent = message;
}

function hideAccessGate() {
  const gate = document.getElementById("accessGate");
  const error = document.getElementById("accessError");

  document.body.classList.remove("auth-locked");
  if (gate) gate.hidden = true;
  if (error) error.textContent = "";
}

function updateDietDayDisplay() {
  const btn = document.getElementById("diet-day");
  const label = document.getElementById("diet-day-label");
  const nextBtn = document.getElementById("nextDayBtn");
  const prevBtn = document.getElementById("prevDayBtn");
  const isAtDietToday = currentDate === getDietDate();
  const isAtMinDietDate = currentDate === MIN_DIET_DATE || isBeforeMinDietDate(currentDate);

  if (label) {
    const displayLabel = getDisplayDateLabel(currentDate, { todayStyle: "compact" });
    label.textContent = displayLabel;
    if (btn) {
      btn.setAttribute("aria-label", `Selected day ${displayLabel}`);
    }
  }

  if (nextBtn) {
    nextBtn.setAttribute("aria-disabled", String(isAtDietToday));
    nextBtn.disabled = isAtDietToday;
  }

  if (prevBtn) {
    prevBtn.setAttribute("aria-disabled", String(isAtMinDietDate));
    prevBtn.disabled = isAtMinDietDate;
  }
}

function formatDailyIntakeTargetSummary() {
  const calorieTarget = Math.max(0, roundInt(TDEE - DEFICIT_TARGET));
  return `${formatInt(calorieTarget)} kcal · ${formatInt(PROTEIN_TARGET)} g`;
}

function updateTargetForm() {
  const tdeeInput = document.getElementById("tdeeInput");
  const proteinInput = document.getElementById("proteinTargetInput");
  const deficitInput = document.getElementById("deficitTargetInput");
  const summary = document.getElementById("targetSummary");

  if (tdeeInput) tdeeInput.value = roundInt(TDEE);
  if (proteinInput) proteinInput.value = roundInt(PROTEIN_TARGET);
  if (deficitInput) deficitInput.value = roundInt(DEFICIT_TARGET);
  if (summary) {
    summary.textContent = formatDailyIntakeTargetSummary();
    summary.title = `TDEE ${formatInt(TDEE)} kcal · deficit ${formatInt(DEFICIT_TARGET)} kcal`;
  }
}

// ── Cut phases ────────────────────────────────────────────────────────────────


function getConfigPayload(overrides = {}) {
  return {
    tdee: Math.round(overrides.tdee ?? TDEE),
    proteinTarget: Math.round(overrides.proteinTarget ?? PROTEIN_TARGET),
    deficitTarget: Math.round(overrides.deficitTarget ?? DEFICIT_TARGET),
    cutStartDate,
    activeCutPhase,
    cutPhaseDeficits: cutPhaseDeficits.map((value) => Math.round(value))
  };
}

function saveConfigToServer(overrides = {}) {
  return fetchJson(`${API_BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getConfigPayload(overrides))
  });
}

function applyCutPhaseConfig(config) {
  if (!config?.hasCutPhaseSettings) return;

  cutStartDate = config.cutStartDate || null;
  activeCutPhase = Number.isInteger(config.activeCutPhase)
    && config.activeCutPhase >= 0
    && config.activeCutPhase < CUT_PHASE_NAMES.length
    ? config.activeCutPhase
    : null;

  if (Array.isArray(config.cutPhaseDeficits)) {
    cutPhaseDeficits = CUT_PHASE_DEFAULT_DEFICITS.map((defaultValue, index) => {
      const number = Number(config.cutPhaseDeficits[index]);
      return Number.isFinite(number) && number >= 0
        ? Math.round(number)
        : defaultValue;
    });
  }

  updateCutPhaseUI();
}

function getCutWeek(dateString = getDietDate()) {
  if (!cutStartDate) return null;
  const start = new Date(cutStartDate + "T00:00:00");
  const viewedDate = new Date(`${dateString}T00:00:00`);
  const diffDays = Math.floor((viewedDate - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 7) + 1;
}

function isCutPhaseActiveForDate(dateString) {
  if (activeCutPhase === null) return false;
  if (!cutStartDate) return true;
  return dateString >= cutStartDate;
}

function getCutPhaseLabel(dateString = getDietDate()) {
  if (!isCutPhaseActiveForDate(dateString)) return null;
  const name = CUT_PHASE_NAMES[activeCutPhase];
  const week = getCutWeek(dateString);
  return week ? `${name} · Week ${week}` : name;
}

function getCutPhaseNameFromIndex(index) {
  const number = Number(index);
  return Number.isInteger(number) && number >= 0 && number < CUT_PHASE_NAMES.length
    ? CUT_PHASE_NAMES[number]
    : null;
}

function getCutWeekFromSnapshot(entry) {
  const week = Number(entry?.cutWeek);
  if (Number.isFinite(week) && week > 0) return Math.round(week);

  if (!entry?.cutStartDate || !entry?.date) return null;
  const start = new Date(`${entry.cutStartDate}T00:00:00`);
  const entryDate = new Date(`${entry.date}T00:00:00`);
  const diffDays = Math.floor((entryDate - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 7) + 1;
}

function formatEntryCutPhaseLabel(entry) {
  const phaseName = entry?.cutPhaseName || getCutPhaseNameFromIndex(entry?.cutPhaseIndex);
  if (!phaseName) return null;
  if (entry?.cutStartDate && entry?.date && entry.date < entry.cutStartDate) return null;

  const week = getCutWeekFromSnapshot(entry);
  return week ? `${phaseName} · Week ${week}` : phaseName;
}

function isCurrentWeekRange(summary) {
  const today = getDietDate();
  return summary.weekStart <= today && today <= summary.weekEnd;
}

function getWeekCutPhaseLabel(summary) {
  const entries = summary.entries || [];
  const datedEntries = entries
    .filter((entry) => formatEntryCutPhaseLabel(entry))
    .sort((a, b) => a.date.localeCompare(b.date));
  const selectedEntry = formatEntryCutPhaseLabel(summary.todayEntry);
  if (selectedEntry) return selectedEntry;

  const latestPastEntry = [...datedEntries].reverse().find((entry) => entry.date <= currentDate);
  const historicalEntry = formatEntryCutPhaseLabel(latestPastEntry || datedEntries[0]);
  if (historicalEntry) return historicalEntry;

  return isCurrentWeekRange(summary) ? getCutPhaseLabel(currentDate) : null;
}

function getCutPhaseSnapshot(dateString) {
  if (!isCutPhaseActiveForDate(dateString)) {
    return { cutStartDate, cutPhaseIndex: null, cutPhaseName: null, cutWeek: null };
  }
  const cutWeek = getCutWeek(dateString);
  return {
    cutStartDate,
    cutPhaseIndex: activeCutPhase,
    cutPhaseName: CUT_PHASE_NAMES[activeCutPhase],
    cutWeek,
    deficitTarget: DEFICIT_TARGET
  };
}

function buildPhaseLogPlainText(phase) {
  const latestEntry = phase.latestEntry || {};
  const phaseName = latestEntry.cutPhaseName || getCutPhaseNameFromIndex(latestEntry.cutPhaseIndex) || "Latest phase";
  const range = formatDateRange(phase.start, phase.end).replace(/, \d{4}/g, "");
  const entries = phase.entries || [];
  const lines = [
    `${phaseName} (${range})`,
    `${phase.count || 0}/${phase.days || 0} days logged`,
    `Avg ${formatInt(phase.averageCalories || 0)} kcal, ${formatInt(phase.averageProtein || 0)}g protein`,
    `Total deficit ${formatInt(phase.totalDeficit || 0)} kcal (${formatFatLossKg(phase.fatLossKg || 0)} kg est)`,
    "",
    "Daily"
  ];

  if (!entries.length) {
    lines.push("No entries");
    return lines.join("\n");
  }

  entries.forEach((entry) => {
    const entryTdee = entry.tdee || TDEE;
    const deficit = roundInt(entryTdee - entry.calories);
    const deficitText = deficit < 0
      ? `+${formatInt(Math.abs(deficit))}`
      : `-${formatInt(deficit)}`;

    lines.push(
      `${formatPlainDateLabel(entry.date)}: ${formatInt(entry.calories)} kcal, ${formatInt(entry.protein)}g, ${deficitText}`
    );
  });

  return lines.join("\n");
}

async function copyAllPhases(button, phases) {
  try {
    button.classList.remove("copied");
    button.classList.add("copying");
    if (!phases) {
      const data = await fetchJson(`${API_BASE}/api/phases`);
      phases = data.phases || [];
    }
    if (!phases.length) { showToast("No phases found"); button.classList.remove("copying"); return; }

    const texts = await Promise.all(phases.map(async (p) => {
      const res = await fetchJson(`${API_BASE}/api/phase?start=${encodeURIComponent(p.start)}&end=${encodeURIComponent(p.end)}&tdee=${encodeURIComponent(TDEE)}`);
      return buildPhaseLogPlainText(res.phase);
    }));

    await copyTextToClipboard(texts.join("\n\n---\n\n"));
    button.disabled = true;
    button.classList.remove("copying");
    button.classList.add("copied");
    triggerHaptic("success");
    setTimeout(() => { button.classList.remove("copied"); button.disabled = false; }, 1400);
  } catch {
    button.classList.remove("copying", "copied");
    button.disabled = false;
    showToast("Copy failed");
  }
}

async function fetchLatestPhaseLog() {
  const data = await fetchJson(`${API_BASE}/api/phase?end=${encodeURIComponent(currentDate)}&tdee=${encodeURIComponent(TDEE)}`);
  return data.phase;
}

function updateCutPhaseUI() {
  const startInput = document.getElementById("cutStartDateInput");
  if (startInput) startInput.value = cutStartDate || "";

  CUT_PHASE_NAMES.forEach((_, i) => {
    const deficitInput = document.getElementById(`cutPhaseDeficit${i}`);
    if (deficitInput) deficitInput.value = cutPhaseDeficits[i];

    const btn = document.getElementById(`cutPhaseActivateBtn${i}`);
    const row = document.getElementById(`cutPhaseRow${i}`);
    const isActive = activeCutPhase === i;

    if (btn) {
      btn.textContent = isActive ? "Active" : "Activate";
      btn.classList.toggle("is-active", isActive);
      btn.disabled = isActive;
    }
    if (row) row.classList.toggle("is-active", isActive);
  });

  const summary = document.getElementById("cutPhaseSummary");
  if (summary) summary.textContent = activeCutPhase !== null ? CUT_PHASE_NAMES[activeCutPhase] : "";
}

async function handleCopyCutPhases(button) {
  openPhasePicker(button);
}

function openPhasePicker(copyButton) {
  const panel = document.getElementById("phasePickerPanel");
  const backdrop = document.getElementById("phasePickerBackdrop");
  const list = document.getElementById("phasePickerList");
  if (!panel || !backdrop || !list) return;

  triggerHaptic("tap");
  list.innerHTML = `<div class="phase-picker-loading">Loading…</div>`;
  panel.hidden = false;
  backdrop.hidden = false;

  fetchJson(`${API_BASE}/api/phases`)
    .then(data => {
      const phases = data.phases || [];
      if (!phases.length) {
        list.innerHTML = `<div class="phase-picker-loading">No phases found</div>`;
        return;
      }
      const allBtn = `<button class="phase-picker-item phase-picker-item-all" type="button" data-phase-all>
        <span class="phase-picker-item-name">All</span>
        <span class="phase-picker-item-range">${phases.length} phases</span>
      </button>`;

      list.innerHTML = allBtn + phases.map((phase, i) => {
        const range = formatDateRange(phase.start, phase.end).replace(/, \d{4}/g, "");
        return `<button class="phase-picker-item" type="button" data-phase-index="${i}"
          data-phase-start="${phase.start}" data-phase-end="${phase.end}">
          <span class="phase-picker-item-name">${phase.name}</span>
          <span class="phase-picker-item-range">${range}</span>
        </button>`;
      }).join("");

      list.querySelector("[data-phase-all]")?.addEventListener("click", () => {
        closePhasePicker();
        copyAllPhases(copyButton, phases);
      });

      list.querySelectorAll(".phase-picker-item:not([data-phase-all])").forEach(item => {
        item.addEventListener("click", () => {
          const start = item.dataset.phaseStart;
          const end = item.dataset.phaseEnd;
          closePhasePicker();
          copyPhaseByRange(start, end, copyButton);
        });
      });
    })
    .catch(() => {
      list.innerHTML = `<div class="phase-picker-loading">Failed to load phases</div>`;
    });
}

function closePhasePicker() {
  const panel = document.getElementById("phasePickerPanel");
  const backdrop = document.getElementById("phasePickerBackdrop");
  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
}

async function copyPhaseByRange(start, end, button) {
  try {
    button.classList.remove("copied");
    button.classList.add("copying");
    const data = await fetchJson(`${API_BASE}/api/phase?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&tdee=${encodeURIComponent(TDEE)}`);
    await copyTextToClipboard(buildPhaseLogPlainText(data.phase));
    button.disabled = true;
    button.classList.remove("copying");
    button.classList.add("copied");
    button.setAttribute("aria-label", "Phase data copied");
    triggerHaptic("success");
    setTimeout(() => {
      button.classList.remove("copied");
      button.disabled = false;
      button.setAttribute("aria-label", "Copy all phase data");
    }, 1400);
  } catch (error) {
    button.classList.remove("copying", "copied");
    button.disabled = false;
    button.setAttribute("aria-label", "Copy all phase data");
    showToast("Copy failed");
  }
}

function handlePhaseActivate(index) {
  triggerHaptic("select");

  // Capture the deficit input value first
  const deficitInput = document.getElementById(`cutPhaseDeficit${index}`);
  if (deficitInput) {
    const val = Number(deficitInput.value);
    if (Number.isFinite(val) && val >= 0) cutPhaseDeficits[index] = Math.round(val);
  }

  activeCutPhase = index;
  DEFICIT_TARGET = cutPhaseDeficits[index];
  updateCutPhaseUI();
  updateTargetForm();
  updateEntryForm();

  saveConfigToServer()
    .then(data => { applyConfig(data.config); loadWeekSummary(); })
    .catch(() => { loadWeekSummary(); });
}

function handleCutStartDateChange(event) {
  cutStartDate = event.target.value || null;
  updateCutPhaseUI();
  // Re-render week card so label updates
  saveConfigToServer()
    .then(data => { applyConfig(data.config); loadWeekSummary(); })
    .catch(() => {
      if (document.getElementById("weekly-summary")?.innerHTML) loadWeekSummary();
    });
}

function handlePhaseDeficitBlur(index, value) {
  const val = Number(value);
  if (!Number.isFinite(val) || val < 0) return;
  cutPhaseDeficits[index] = Math.round(val);
  if (activeCutPhase === index) {
    DEFICIT_TARGET = cutPhaseDeficits[index];
    updateTargetForm();
    updateEntryForm();
  }
  saveConfigToServer()
    .then(data => { applyConfig(data.config); loadWeekSummary(); })
    .catch(() => {
      if (document.getElementById("weekly-summary")?.innerHTML) loadWeekSummary();
    });
}

function handleCutPhasePanelClick(event) {
  const copyBtn = event.target.closest("[data-copy-cut-phases]");
  if (copyBtn) {
    event.preventDefault();
    event.stopPropagation();
    handleCopyCutPhases(copyBtn);
    return;
  }

  const btn = event.target.closest("[data-phase-activate]");
  if (!btn) return;
  const index = Number(btn.dataset.phaseActivate);
  if (!Number.isNaN(index)) handlePhaseActivate(index);
}

// ─────────────────────────────────────────────────────────────────────────────

function applyConfig(config) {
  TDEE = roundInt(config?.tdee) || 2705;
  PROTEIN_TARGET = roundInt(config?.proteinTarget) || 180;
  DEFICIT_TARGET = roundInt(config?.deficitTarget) || 500;
  applyCutPhaseConfig(config);
  updateTargetForm();
}

function updateEntryForm() {
  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");
  const deleteBtn = document.getElementById("deleteBtn");
  const saveBtn = document.getElementById("saveBtn");
  const isViewingToday = currentDate === getDietDate();
  const form = document.getElementById("today-form");

  if (calories) {
    calories.value = todayEntry ? roundInt(todayEntry.calories) : "";
    calories.inputMode = "numeric";
    calories.autocomplete = "off";
    calories.placeholder = "";
  }

  if (protein) {
    protein.value = todayEntry ? roundInt(todayEntry.protein) : "";
    protein.inputMode = "numeric";
    protein.autocomplete = "off";
    protein.placeholder = "";
  }

  const proteinUnit = document.querySelector('[data-unit="protein"]');
  if (proteinUnit) {
    proteinUnit.textContent = "g";
  }

  if (deleteBtn) {
    deleteBtn.hidden = !todayEntry;
    deleteBtn.textContent = "Delete entry";
    deleteBtn.setAttribute("aria-label", "Delete this entry");
  }
  if (saveBtn) {
    if (todayEntry) {
      saveBtn.textContent = "Update entry";
    } else {
      saveBtn.textContent = isViewingToday ? "Commit today" : "Save entry";
    }
  }
  if (form) {
    form.classList.toggle("compact-entry-fields", window.matchMedia?.("(max-width: 620px)")?.matches ?? false);
    setEntryFormVisible(isQuickEntryOpen());
  }
}

function setEntryFormVisible(isVisible) {
  const form = document.getElementById("today-form");
  if (!form) return;
  const isQuickEntryOverlayOpen = isQuickEntryOpen();
  const showInline = isVisible && isQuickEntryOverlayOpen;

  if (!isQuickEntryOverlayOpen) {
    form.classList.remove("quick-entry");
  }

  form.classList.toggle("entry-form-collapsed", !showInline);
  form.setAttribute("aria-hidden", String(!showInline));
  form.inert = !showInline;
  form.hidden = !showInline;

  form.querySelectorAll(".input-card, #saveBtn").forEach((element) => {
    element.hidden = false;
  });

  const deleteBtn = document.getElementById("deleteBtn");
  if (deleteBtn) {
    deleteBtn.hidden = !todayEntry;
  }
}

function hideEntryFormWhileLoading() {
  if (isQuickEntryOpen()) return;

  const form = document.getElementById("today-form");
  if (!form) return;

  form.classList.add("entry-form-collapsed");
  form.setAttribute("aria-hidden", "true");
  form.inert = true;
  form.hidden = true;
}


function setLoading(isLoading) {
  const saveBtn = document.getElementById("saveBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  if (saveBtn) {
    if (isLoading) {
      saveBtn.dataset.idleText = saveBtn.textContent;
      saveBtn.textContent = "Saving...";
    } else if (saveBtn.dataset.idleText && saveBtn.textContent === "Saving...") {
      saveBtn.textContent = saveBtn.dataset.idleText;
      delete saveBtn.dataset.idleText;
    } else {
      delete saveBtn.dataset.idleText;
    }

    saveBtn.disabled = isLoading;
    saveBtn.classList.toggle("is-loading", isLoading);
  }
  if (deleteBtn) deleteBtn.disabled = isLoading;
}

function isQuickEntryOpen() {
  return document.body.classList.contains("quick-entry-open");
}

function isCalendarOpen() {
  return document.body.classList.contains("calendar-open");
}

function lockQuickEntryScroll() {
  quickEntryScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${quickEntryScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockQuickEntryScroll() {
  const scrollY = quickEntryScrollY || 0;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, scrollY);
  quickEntryScrollY = 0;
}

function isCompactQuickEntry() {
  return window.matchMedia?.("(max-width: 620px)")?.matches ?? false;
}

function clearQuickEntryPosition(form) {
  if (!form) return;
  form.style.top = "";
  form.style.bottom = "";
  form.style.left = "";
  form.style.transform = "";
  form.style.maxHeight = "";
  form.style.overflowY = "";
}

// Mobile: bottom sheet flush above the keyboard. Desktop: centred modal via CSS.
function adjustQuickEntryForKeyboard() {
  const form = document.getElementById("today-form");
  if (!form || !isQuickEntryOpen()) return;

  if (!isCompactQuickEntry()) {
    clearQuickEntryPosition(form);
    document.body.classList.remove("quick-entry-keyboard");
    return;
  }

  const vv = window.visualViewport;
  const edgeGap = 8;

  form.style.left = "50%";
  form.style.transform = "translateX(-50%)";
  form.style.overflowY = "auto";

  if (!vv) {
    form.style.top = "auto";
    form.style.bottom = `${edgeGap}px`;
    form.style.maxHeight = `calc(100dvh - ${edgeGap * 2}px)`;
    return;
  }

  const visibleBottom = vv.offsetTop + vv.height;
  const keyboardInset = Math.max(0, window.innerHeight - visibleBottom);
  const isKeyboardOpen = keyboardInset > 50;

  document.body.classList.toggle("quick-entry-keyboard", isKeyboardOpen);

  // When keyboard dismisses, iOS may auto-scroll the page — pin it back.
  if (!isKeyboardOpen) window.scrollTo(0, quickEntryScrollY || 0);

  // Bottom edge of the sheet aligns with the top of the keyboard (visible viewport bottom).
  form.style.top = "auto";
  form.style.bottom = `${Math.round(isKeyboardOpen ? keyboardInset + edgeGap : edgeGap)}px`;
  form.style.maxHeight = `${Math.round(Math.max(180, vv.height - edgeGap * 2))}px`;
}

function openQuickEntry(focusField = "calories") {
  triggerHaptic("tap");

  const form = document.getElementById("today-form");
  if (form) form.hidden = false;
  const backdrop = document.getElementById("quickEntryBackdrop");
  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");

  if (!form || !calories || !protein) return;

  if (!isQuickEntryOpen()) {
    lockQuickEntryScroll();
  }

  form.classList.remove("entry-form-collapsed");
  form.setAttribute("aria-hidden", "false");
  form.inert = false;
  form.classList.add("quick-entry");
  form.classList.toggle("compact-entry-fields", window.matchMedia?.("(max-width: 620px)")?.matches ?? false);
  document.body.classList.add("quick-entry-open");
  if (backdrop) backdrop.hidden = false;

  if (!todayEntry) {
    calories.value = "";
    protein.value = "";
  }

  const focusTarget = focusField === "protein" ? protein : calories;

  [calories, protein].forEach((input) => {
    input.type = "number";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.removeAttribute("readonly");
    input.removeAttribute("disabled");
  });

  form.removeEventListener("pointerdown", handleQuickEntryPointerFocus);
  form.addEventListener("pointerdown", handleQuickEntryPointerFocus, { passive: true });
  if (window.__quickEntryUserGesture === true) {
    forceQuickEntryFocus(focusTarget);
  } else {
    adjustQuickEntryForKeyboard();
  }

  teardownQuickEntryViewportListeners();
  if (window.visualViewport) {
    viewportResizeHandler = adjustQuickEntryForKeyboard;
    window.visualViewport.addEventListener("resize", viewportResizeHandler);
    window.visualViewport.addEventListener("scroll", viewportResizeHandler);
  }
  window.addEventListener("resize", adjustQuickEntryForKeyboard);
  adjustQuickEntryForKeyboard();
  requestAnimationFrame(adjustQuickEntryForKeyboard);
}

function teardownQuickEntryViewportListeners() {
  if (window.visualViewport && viewportResizeHandler) {
    window.visualViewport.removeEventListener("resize", viewportResizeHandler);
    window.visualViewport.removeEventListener("scroll", viewportResizeHandler);
    viewportResizeHandler = null;
  }
  window.removeEventListener("resize", adjustQuickEntryForKeyboard);
}

function forceQuickEntryFocus(input) {
  if (!input) return;

  const focus = () => {
    if (!isQuickEntryOpen()) return;
    input.focus();
    input.select?.();
    adjustQuickEntryForKeyboard();
    requestAnimationFrame(() => adjustQuickEntryForKeyboard());
  };

  focus();
  requestAnimationFrame(focus);
  setTimeout(focus, 60);
  setTimeout(focus, 180);
  setTimeout(focus, 360);
}

function handleQuickEntryPointerFocus(event) {
  if (!isQuickEntryOpen()) return;
  if (event.target.closest("button")) return;

  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");
  const tappedInput = event.target.matches("input") ? event.target : null;
  const focusTarget = tappedInput || (document.activeElement === protein ? protein : calories);

  focusTarget?.focus();
  focusTarget?.select?.();
  adjustQuickEntryForKeyboard();
  requestAnimationFrame(() => adjustQuickEntryForKeyboard());
}

function closeQuickEntry(options = {}) {
  if (options.haptic !== false) triggerHaptic("tap");

  const form = document.getElementById("today-form");

  teardownQuickEntryViewportListeners();
  if (form) {
    clearQuickEntryPosition(form);
    form.removeEventListener("pointerdown", handleQuickEntryPointerFocus);
  }
  document.body.classList.remove("quick-entry-keyboard");

  setEntryFormVisible(false);
  const backdrop = document.getElementById("quickEntryBackdrop");

  if (form) {
    form.classList.remove("quick-entry");
    form.classList.toggle("compact-entry-fields", window.matchMedia?.("(max-width: 620px)")?.matches ?? false);
  }
  document.body.classList.remove("quick-entry-open");
  unlockQuickEntryScroll();
  if (backdrop) backdrop.hidden = true;
}

function showCelebration(options = {}) {
  const { variant = "logged" } = options;
  let celebration = document.getElementById("saveCelebration");
  const isDoubleHit = variant === "double-hit";

  if (!celebration) {
    celebration = document.createElement("div");
    celebration.id = "saveCelebration";
    celebration.className = "save-celebration";
    celebration.setAttribute("role", "status");
    celebration.setAttribute("aria-live", "polite");
    celebration.innerHTML = `
      <div class="celebration-confetti" aria-hidden="true">
        ${Array.from({ length: 18 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}
      </div>
      <div class="celebration-card">
        <span class="celebration-icon" aria-hidden="true">✓</span>
        <strong>Logged</strong>
        <span>Saved.</span>
      </div>
    `;
    document.body.appendChild(celebration);
  }

  celebration.classList.toggle("double-hit", isDoubleHit);
  const confetti = celebration.querySelector(".celebration-confetti");
  const icon = celebration.querySelector(".celebration-icon");
  const title = celebration.querySelector(".celebration-card strong");
  const text = celebration.querySelector(".celebration-card span:last-child");

  if (confetti) {
    const confettiCount = isDoubleHit ? 34 : 18;
    confetti.innerHTML = Array.from({ length: confettiCount }, (_, index) => `<span style="--i:${index}"></span>`).join("");
  }
  if (icon) icon.textContent = isDoubleHit ? "★" : "✓";
  if (title) title.textContent = isDoubleHit ? "Double hit!" : "Logged";
  if (text) text.textContent = isDoubleHit ? "Deficit and protein cleared." : "Saved.";

  clearTimeout(celebrationTimer);
  celebration.classList.remove("visible");
  void celebration.offsetWidth;
  celebration.classList.add("visible");

  celebrationTimer = setTimeout(() => {
    celebration.classList.remove("visible");
  }, 2100);
}

function openCalendar() {
  triggerHaptic("tap");

  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");
  const dietTodayString = getDietDate();

  renderCalendar();

  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("calendar-open");

  // Double-RAF: first frame shows panel, second frame has stable layout (avoids
  // modal-in CSS transform skewing getBoundingClientRect values)
  const grid = document.getElementById("calendarGrid");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const todayButton = grid?.querySelector(`.calendar-day.today`);
    const selectedButton = grid?.querySelector(`.calendar-day.selected`);
    const scrollTarget = selectedButton || todayButton;

    scrollCalendarToSelectedDate(grid, scrollTarget);
    updateCalendarMonthLabel(grid);
  }));
}

function scrollCalendarToSelectedDate(grid, scrollTarget) {
  if (!grid || !scrollTarget) {
    grid?.querySelector(`[data-month="${getDietDate().slice(0, 7)}"]`)?.scrollIntoView({ block: "start" });
    return;
  }

  const gridRect = grid.getBoundingClientRect();
  const targetRect = scrollTarget.getBoundingClientRect();
  const targetCenter = targetRect.top + targetRect.height / 2;
  const gridCenter = gridRect.top + gridRect.height / 2;

  grid.scrollTop += targetCenter - gridCenter;
}

function closeCalendar(options = {}) {
  if (options.haptic !== false) triggerHaptic("tap");

  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");

  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("calendar-open");
}

function openDeleteConfirm() {
  if (!todayEntry) return;
  triggerHaptic("warning");

  const panel = document.getElementById("deleteConfirmPanel");
  const backdrop = document.getElementById("deleteConfirmBackdrop");
  const confirmBtn = document.getElementById("confirmDeleteBtn");

  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("delete-confirm-open");
  confirmBtn?.focus();
}

function closeDeleteConfirm(options = {}) {
  if (options.haptic !== false) triggerHaptic("tap");

  const panel = document.getElementById("deleteConfirmPanel");
  const backdrop = document.getElementById("deleteConfirmBackdrop");

  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("delete-confirm-open");
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const dietTodayString = getDietDate();
  const dietToday = new Date(`${dietTodayString}T12:00:00`);

  if (!grid) return;

  // Set initial month label to the currently selected date
  const label = document.getElementById("calendarMonthLabel");
  if (label) label.innerHTML = getCalendarMonthLabel(new Date(`${currentDate}T12:00:00`));

  renderCalendarMonths(grid, dietToday, dietTodayString);

  grid.onscroll = () => {
    extendCalendarIfNeeded(grid);
    updateCalendarMonthLabel(grid);
  };
}

function renderCalendarMonths(grid, dietToday, dietTodayString) {
  const weeks = [];
  let weekCells = [];

  // Start from Monday of the week containing (calendarHistoryMonths ago)
  const historyAnchor = new Date(dietToday.getFullYear(), dietToday.getMonth() - calendarHistoryMonths, 1);
  const anchorOffset = (historyAnchor.getDay() + 6) % 7; // Mon=0
  const startDate = new Date(historyAnchor);
  startDate.setDate(historyAnchor.getDate() - anchorOffset);
  const minDate = new Date(`${MIN_DIET_DATE}T12:00:00`);

  // If the selected date is before our start, extend back to include it
  const selectedAnchor = new Date(`${currentDate}T12:00:00`);
  if (selectedAnchor < startDate) {
    const selOffset = (selectedAnchor.getDay() + 6) % 7;
    startDate.setTime(selectedAnchor.getTime());
    startDate.setDate(selectedAnchor.getDate() - selOffset);
  }

  if (startDate < minDate) {
    startDate.setTime(minDate.getTime());
  }

  // End at Sunday of current week + 4 more weeks.
  // These disabled future rows fill the 8-row window so today sits centred
  // and there's nothing past row 8 to scroll into.
  const todayOffset = (dietToday.getDay() + 6) % 7; // Mon=0
  const endDate = new Date(dietToday);
  endDate.setDate(dietToday.getDate() + (6 - todayOffset) + 28);

  const cursor = new Date(startDate);
  let isFirst = true;
  let cellIndex = 0;

  while (cursor <= endDate) {
    // Mark first cell and every calendar month's 1st for label tracking
    const isMonthMarker = isFirst || cursor.getDate() === 1;
    isFirst = false;
    weekCells.push(renderCalendarDay(cursor, dietToday, dietTodayString, isMonthMarker ? "month-start" : ""));
    cursor.setDate(cursor.getDate() + 1);
    cellIndex++;

    // Flush completed week row
    if (cellIndex % 7 === 0) {
      weeks.push(`<div class="calendar-week">${weekCells.join("")}</div>`);
      weekCells = [];
    }
  }
  if (weekCells.length > 0) {
    weeks.push(`<div class="calendar-week">${weekCells.join("")}</div>`);
  }

  grid.innerHTML = `<div class="calendar-grid">${weeks.join("")}</div>`;
}

function getCalendarMonthLabel(monthDate) {
  const month = monthDate.toLocaleDateString("en-US", { month: "long" });
  const year = monthDate.toLocaleDateString("en-US", { year: "numeric" });
  return `<strong>${month}</strong> ${year}`;
}

function updateCalendarMonthLabel(grid) {
  const label = document.getElementById("calendarMonthLabel");
  if (!label) return;
  const markers = [...grid.querySelectorAll(".calendar-day[data-month]")];
  const containerRect = grid.getBoundingClientRect();
  const referenceY = containerRect.top + containerRect.height * 0.45;
  let current = markers[0];

  for (const marker of markers) {
    const rect = marker.getBoundingClientRect();
    if (rect.top <= referenceY) {
      current = marker;
    } else {
      break;
    }
  }

  if (current?.dataset.month) {
    const newMonth = current.dataset.month;
    label.innerHTML = getCalendarMonthLabel(new Date(`${newMonth}-01T12:00:00`));
    if (newMonth !== calendarVisibleMonth) {
      calendarVisibleMonth = newMonth;
      grid.querySelectorAll(".calendar-day[data-day-month]").forEach(btn => {
        btn.classList.toggle("viewed-calendar-month", btn.dataset.dayMonth === calendarVisibleMonth);
      });
    }
  }
}

function extendCalendarIfNeeded(grid) {
  if (calendarIsExtending || grid.scrollTop > 96) return;
  const earliestButton = grid.querySelector(".calendar-day[data-date]");
  if (earliestButton?.dataset.date && earliestButton.dataset.date <= MIN_DIET_DATE) return;

  calendarIsExtending = true;
  const previousHeight = grid.scrollHeight;
  const dietTodayString = getDietDate();
  const dietToday = new Date(`${dietTodayString}T12:00:00`);

  calendarHistoryMonths += CALENDAR_HISTORY_CHUNK_MONTHS;
  renderCalendarMonths(grid, dietToday, dietTodayString);

  requestAnimationFrame(() => {
    grid.scrollTop += grid.scrollHeight - previousHeight;
    updateCalendarMonthLabel(grid);
    calendarIsExtending = false;
  });
}


function renderCalendarDay(date, dietToday, dietTodayString, extraClass = "") {
  const dateString = formatDate(date);
  const dayMonth = dateString.slice(0, 7);
  const isSelected = dateString === currentDate;
  const isToday = dateString === dietTodayString;
  const isFuture = date > dietToday;
  const isTooEarly = isBeforeMinDietDate(dateString);
  const isMonthStart = extraClass === "month-start";
  const isFutureMonth = dayMonth > dietTodayString.slice(0, 7);

  const classes = [
    "calendar-day",
    dayMonth === calendarVisibleMonth ? "viewed-calendar-month" : "",
    isFutureMonth ? "future-calendar-month" : "",
    extraClass,
    isSelected ? "selected" : "",
    isToday ? "today" : ""
  ].filter(Boolean).join(" ");

  return `
    <button
      class="${classes}"
      type="button"
      data-date="${dateString}"
      data-day-month="${dayMonth}"
      ${isMonthStart ? `data-month="${dayMonth}"` : ""}
      ${isFuture || isTooEarly ? "disabled" : ""}
    >
      ${date.getDate()}
    </button>
  `;
}



function handleCalendarDayClick(event) {
  const btn = event.target.closest("[data-date]");
  if (!btn || btn.disabled) return;

  triggerHaptic("select");
  setDietDay(btn.dataset.date);
  closeCalendar({ haptic: false });
}

function foldSettingsPanels() {
  document.querySelectorAll(".settings-panel[open]").forEach(el => el.removeAttribute("open"));
}

function setDietDay(date, { direction = null, skipAnimation = false } = {}) {
  if (!isValidDateString(date) || isFutureDate(date) || isBeforeMinDietDate(date)) return;
  if (date === currentDate) return;

  currentDate = date;
  foldSettingsPanels();
  calendarVisibleMonth = date.slice(0, 7);
  todayLogged = false;
  todayEntry = null;

  updateDietDayDisplay();
  updateTargetForm();
  hideEntryFormWhileLoading();

  document.querySelectorAll('[data-unit="protein"]').forEach((el) => {
    el.textContent = "g";
  });

  if (direction && !skipAnimation) {
    const animClass = direction === "forward" ? "day-nav-forward" : "day-nav-backward";
    [document.getElementById("daily-result"), document.getElementById("weekly-summary")].forEach((el) => {
      if (!el) return;
      el.classList.remove("day-nav-forward", "day-nav-backward");
      void el.offsetWidth;
      el.classList.add(animClass);
      el.addEventListener("animationend", () => el.classList.remove(animClass), { once: true });
    });
  }

  renderInitialLoadingState();
  loadWeekSummary();
}

function shiftDietDay(days) {
  const d = new Date(`${currentDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const nextDate = formatDate(d);

  if (isFutureDate(nextDate) || isBeforeMinDietDate(nextDate)) return;

  triggerHaptic("select");
  setDietDay(nextDate, { direction: days > 0 ? "forward" : "backward" });
}

function initCarouselSwipe() {
  const viewport = document.getElementById("swipe-viewport");
  const track = document.getElementById("swipe-track");
  if (!viewport || !track) return;

  const GAP = 16;
  const THRESHOLD = 50;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTarget = null;
  let activeDrag = false;
  let dragCancelled = false;
  let transitioning = false;

  function overlayOpen() {
    return document.body.classList.contains("calendar-open") ||
      document.body.classList.contains("quick-entry-open") ||
      document.body.classList.contains("auth-locked") ||
      document.body.classList.contains("delete-confirm-open");
  }

  function pw() { return viewport.offsetWidth; }
  function co() { return -(pw() + GAP); }

  function setTrackX(x, animated) {
    track.style.transition = animated ? "transform 380ms cubic-bezier(0.25, 1, 0.5, 1)" : "none";
    track.style.transform = `translateX(${x}px)`;
  }

  function resetToCenter() { setTrackX(co(), false); }

  function populateSidePanels() {
    ["swipe-panel-prev", "swipe-panel-next"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = dailySkeletonHtml() + weekSkeletonHtml();
    });
  }

  function updateSizes() {
    const w = pw();
    document.querySelectorAll(".swipe-panel").forEach((el, i) => {
      el.style.width = `${w}px`;
      el.style.marginRight = i < 2 ? `${GAP}px` : "";
    });
    resetToCenter();
  }

  function snapBack() {
    setTrackX(co(), true);
    track.addEventListener("transitionend", () => { transitioning = false; }, { once: true });
  }

  function commitSwipe(days) {
    transitioning = true;
    const target = co() + (days > 0 ? -(pw() + GAP) : (pw() + GAP));
    triggerHaptic("select");
    setTrackX(target, true);
    track.addEventListener("transitionend", () => {
      resetToCenter();
      populateSidePanels();
      const d = new Date(`${currentDate}T12:00:00`);
      d.setDate(d.getDate() + days);
      setDietDay(formatDate(d), { direction: days > 0 ? "forward" : "backward", skipAnimation: true });
      transitioning = false;
    }, { once: true });
  }

  updateSizes();
  populateSidePanels();
  window.addEventListener("resize", updateSizes);

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || transitioning) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTarget = e.target;
    activeDrag = false;
    dragCancelled = false;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1 || dragCancelled || transitioning) return;
    if (overlayOpen()) { dragCancelled = true; resetToCenter(); return; }
    if (touchStartTarget instanceof Element && touchStartTarget.closest("input, textarea, select, button")) {
      dragCancelled = true;
      return;
    }

    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    if (!activeDrag) {
      if ((Math.abs(deltaY) > Math.abs(deltaX) * 1.2) && (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8)) {
        dragCancelled = true;
        return;
      }
      if (Math.abs(deltaX) > 8) activeDrag = true;
      else return;
    }

    e.preventDefault();

    const d = new Date(`${currentDate}T12:00:00`);
    d.setDate(d.getDate() + (deltaX < 0 ? 1 : -1));
    const atBoundary = (deltaX < 0 && isFutureDate(formatDate(d))) || (deltaX > 0 && isBeforeMinDietDate(formatDate(d)));

    setTrackX(co() + (atBoundary ? deltaX * 0.08 : deltaX), false);
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    if (!activeDrag) { activeDrag = false; dragCancelled = false; return; }
    activeDrag = false;
    dragCancelled = false;

    if (overlayOpen()) { snapBack(); return; }

    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(deltaX) < THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
      snapBack();
      return;
    }

    const days = deltaX < 0 ? 1 : -1;
    const d = new Date(`${currentDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    if (isFutureDate(formatDate(d)) || isBeforeMinDietDate(formatDate(d))) {
      snapBack();
      return;
    }

    commitSwipe(days);
  }, { passive: true });
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    if (document.body.classList.contains("quick-entry-open")) {
      event.preventDefault();
      closeQuickEntry();
      return;
    }

    if (document.body.classList.contains("delete-confirm-open")) {
      event.preventDefault();
      closeDeleteConfirm();
      return;
    }

    if (document.body.classList.contains("calendar-open")) {
      event.preventDefault();
      closeCalendar();
      return;
    }
  }

  const activeElement = document.activeElement;
  const isTyping = activeElement?.matches?.("input, textarea, select, button") || activeElement?.isContentEditable;
  const isOverlayOpen = document.body.classList.contains("calendar-open") || document.body.classList.contains("quick-entry-open") || document.body.classList.contains("auth-locked") || document.body.classList.contains("delete-confirm-open");

  if (isTyping || isOverlayOpen || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    shiftDietDay(-1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    shiftDietDay(1);
  }
}

function getFormValues() {
  const calories = Number(document.getElementById("calories")?.value);
  const protein = Number(document.getElementById("protein")?.value);

  if (!Number.isFinite(calories) || calories < 0) {
    throw new Error("Calories must be a valid number");
  }

  if (!Number.isFinite(protein) || protein < 0) {
    throw new Error("Protein must be a valid number");
  }

  return {
    calories: roundInt(calories),
    protein: roundInt(protein)
  };
}

async function fetchJson(url, options = {}) {
  const token = getStoredAuthToken();
  let res;
  try {
    res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch {
    throw new Error("Network error. Restart with: node scripts/dev-server.mjs");
  }

  let data = null;
  let parseOk = true;

  try {
    data = await res.json();
  } catch {
    data = {};
    parseOk = false;
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setStoredAuthToken("");
      authUser = null;
      updateAuthUI();
      await setupGoogleSignIn();
      showAccessGate(
        res.status === 403
          ? "This Google account is not allowed"
          : "Session expired — sign in again"
      );
      throw createAuthError(parseOk && data.error ? data.error : "Unauthorized");
    }

    const message = parseOk && (data.error || data.detail?.message);
    throw new Error(message || `Request failed (${res.status})`);
  }

  return data;
}

function updateAuthUI() {
  const bar = document.getElementById("authUserBar");
  const label = document.getElementById("authUserLabel");
  const avatar = document.getElementById("authUserAvatar");

  if (!bar || !label) return;

  if (!authUser) {
    bar.hidden = true;
    if (avatar) avatar.hidden = true;
    return;
  }

  bar.hidden = false;
  label.textContent = authUser.name || authUser.email;

  if (avatar && authUser.picture) {
    avatar.src = authUser.picture;
    avatar.alt = authUser.name || authUser.email;
    avatar.hidden = false;
  } else if (avatar) {
    avatar.hidden = true;
  }
}

let googleTokenClient = null;

async function setupGoogleSignIn() {
  const configRes = await fetch(`${API_BASE}/api/auth/config`, { credentials: "include" });
  const configData = await configRes.json().catch(() => ({}));

  if (!configRes.ok || !configData.googleClientId) {
    throw new Error("Google sign-in is not configured on the server");
  }

  const signInBtn = document.getElementById("googleSignInBtn");
  if (signInBtn) signInBtn.disabled = true;

  await new Promise((resolve, reject) => {
    const start = () => {
      if (!window.google?.accounts?.oauth2?.initTokenClient) {
        window.setTimeout(start, 40);
        return;
      }

      googleTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: configData.googleClientId,
        scope: "openid email profile",
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            setStatus("Locked");
            showAccessGate(tokenResponse.error);
            return;
          }

          completeGoogleSignIn({ accessToken: tokenResponse.access_token });
        }
      });

      if (signInBtn) {
        signInBtn.disabled = false;
        signInBtn.onclick = () => {
          googleTokenClient?.requestAccessToken({ prompt: "select_account" });
        };
      }

      resolve();
    };

    start();
  });
}

async function completeGoogleSignIn(payload) {
  const error = document.getElementById("accessError");
  if (error) error.textContent = "";
  setStatus("Signing in...");

  try {
    const data = await fetchJson(`${API_BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (data?.token) setStoredAuthToken(data.token);
    authUser = data.user;
    hideAccessGate();
    updateAuthUI();
    setStatus("");
    await loadConfig();
    await loadWeekSummary();
  } catch (signInError) {
    setStatus("Locked");
    showAccessGate(signInError.message || "Could not sign in");
  }
}

async function restoreSession() {
  const token = getStoredAuthToken();
  const sessionRes = await fetch(`${API_BASE}/api/auth/session`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!sessionRes.ok) {
    if (sessionRes.status === 401 || sessionRes.status === 403) {
      setStoredAuthToken("");
    }
    return false;
  }

  const data = await sessionRes.json().catch(() => null);
  if (!data?.user) return false;

  authUser = data.user;
  hideAccessGate();
  updateAuthUI();
  try {
    await loadConfig();
  } catch (configError) {
    if (configError?.isAuthError) throw configError;
    console.warn("loadConfig failed:", configError);
    setStatus("Could not load settings");
  }
  try {
    await loadWeekSummary();
  } catch (summaryError) {
    if (summaryError?.isAuthError) throw summaryError;
    console.warn("loadWeekSummary failed:", summaryError);
  }
  return true;
}

async function signOut() {
  const token = getStoredAuthToken();
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch {
    // Still clear local UI if network fails.
  }

  setStoredAuthToken("");
  authUser = null;
  updateAuthUI();
  showAccessGate();
  setStatus("Locked");
  await setupGoogleSignIn().catch(() => {
    showAccessGate("Could not load Google sign-in");
  });
}

async function loadConfig() {
  const data = await fetchJson(`${API_BASE}/api/config`);
  applyConfig(data.config);
}

async function repairEntryPhaseIfNeeded(entry) {
  if (!entry || !cutStartDate || entry.date >= cutStartDate) return;
  if (entry.cutPhaseIndex === null || entry.cutPhaseIndex === undefined) return;
  try {
    await fetchJson(`${API_BASE}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: entry.date,
        calories: Math.round(entry.calories),
        protein: Math.round(entry.protein),
        tdee: entry.tdee || TDEE,
        calorieTarget: entry.calorieTarget ?? Math.max(0, (entry.tdee || TDEE) - DEFICIT_TARGET),
        proteinTarget: entry.proteinTarget ?? PROTEIN_TARGET,
        ...getCutPhaseSnapshot(entry.date)
      })
    });
  } catch {
    // best-effort silent repair
  }
}

async function saveEntry(calories, protein) {
  setLoading(true);
  const roundedCalories = roundInt(calories);
  const roundedProtein = roundInt(protein);
  const calorieTarget = Math.max(0, roundInt(TDEE - DEFICIT_TARGET));
  const savedDeficit = roundInt(TDEE - roundedCalories);
  const shouldCelebrateTodayCommit = !todayEntry && currentDate === DIET_INITIAL_DATE;

  try {
    await fetchJson(`${API_BASE}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: currentDate,
        calories: roundedCalories,
        protein: roundedProtein,
        tdee: TDEE,
        calorieTarget,
        proteinTarget: PROTEIN_TARGET,
        ...getCutPhaseSnapshot(currentDate)
      })
    });

    todayLogged = true;
    rememberLoggedDate(currentDate);
    const savedDeficitTarget = Math.max(0, roundInt(TDEE - calorieTarget));
    const didDoubleHit = savedDeficit >= savedDeficitTarget && roundedProtein >= PROTEIN_TARGET;
    closeQuickEntry({ haptic: false });
    await loadWeekSummary();
    triggerHaptic("success");
    triggerSaveReward();
    if (didDoubleHit || shouldCelebrateTodayCommit) {
      showCelebration({ variant: didDoubleHit ? "double-hit" : "logged" });
    }
  } catch (error) {
    setStatus("Could not save");
    alert(error.message || "Could not save");
  } finally {
    setLoading(false);
  }
}

function triggerSaveReward() {
  const card = document.querySelector(".daily-card");
  if (!card) return;

  card.classList.remove("saved-pulse");
  void card.offsetWidth;
  card.classList.add("saved-pulse");
}

function setSummaryRefreshing(isRefreshing) {
  const daily = document.getElementById("daily-result");
  const weekly = document.getElementById("weekly-summary");

  daily?.classList.toggle("content-refreshing", isRefreshing);
  weekly?.classList.toggle("content-refreshing", isRefreshing);

  if (isRefreshing) {
    if (daily && !daily.innerHTML.trim()) {
      daily.innerHTML = dailySkeletonHtml();
    }
    if (weekly && !weekly.innerHTML.trim()) {
      weekly.innerHTML = weekSkeletonHtml();
    }
  }
}

function dailySkeletonHtml() {
  return `
    <section class="daily-card loading-card">
      <div class="daily-card-top">
        <div class="daily-card-top-left">
          <div class="skel" style="width:48px;height:20px;border-radius:5px"></div>
          <div class="skel" style="width:22px;height:22px;border-radius:6px"></div>
        </div>
        <div class="daily-card-top-right">
          <div class="skel" style="width:58px;height:22px;border-radius:100px"></div>
        </div>
      </div>
      <div class="daily-metrics">
        <div class="skel" style="height:76px;border-radius:12px"></div>
        <div class="skel" style="height:76px;border-radius:12px"></div>
      </div>
      <div class="skel-settlement">
        <div class="skel-line">
          <div class="skel-line-top">
            <div class="skel" style="width:64px;height:13px;border-radius:4px"></div>
            <div class="skel" style="width:88px;height:13px;border-radius:4px"></div>
          </div>
          <div class="skel" style="height:9px;border-radius:999px"></div>
        </div>
        <div class="skel-line">
          <div class="skel-line-top">
            <div class="skel" style="width:52px;height:13px;border-radius:4px"></div>
            <div class="skel" style="width:72px;height:13px;border-radius:4px"></div>
          </div>
          <div class="skel" style="height:9px;border-radius:999px"></div>
        </div>
      </div>
    </section>
  `;
}

function weekSkeletonHtml() {
  return `
    <section class="card week-card loading-card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-header-title-row">
            <div class="skel" style="width:80px;height:20px;border-radius:5px"></div>
            <div class="skel" style="width:22px;height:22px;border-radius:6px"></div>
          </div>
        </div>
        <div class="card-actions">
          <div class="skel" style="width:52px;height:22px;border-radius:100px"></div>
        </div>
      </div>
      <div class="week-snapshot">
        <div class="skel" style="height:74px;border-radius:10px"></div>
        <div class="skel" style="height:74px;border-radius:10px"></div>
        <div class="skel" style="height:74px;border-radius:10px"></div>
      </div>
      <div class="week-trend-panel">
        <div class="week-trend-header">
          <div class="skel" style="width:76px;height:12px;border-radius:4px"></div>
          <div class="skel" style="width:64px;height:12px;border-radius:4px"></div>
        </div>
        <div class="skel-trend-bars">
          <div class="skel" style="height:72px;border-radius:6px 6px 3px 3px"></div>
          <div class="skel" style="height:52px;border-radius:6px 6px 3px 3px"></div>
          <div class="skel" style="height:86px;border-radius:6px 6px 3px 3px"></div>
          <div class="skel" style="height:62px;border-radius:6px 6px 3px 3px"></div>
          <div class="skel" style="height:78px;border-radius:6px 6px 3px 3px"></div>
          <div class="skel" style="height:44px;border-radius:6px 6px 3px 3px"></div>
          <div class="skel" style="height:94px;border-radius:6px 6px 3px 3px"></div>
        </div>
      </div>
    </section>
  `;
}

function renderInitialLoadingState() {
  const daily = document.getElementById("daily-result");
  const weekly = document.getElementById("weekly-summary");
  if (daily) daily.innerHTML = dailySkeletonHtml();
  if (weekly) weekly.innerHTML = weekSkeletonHtml();
}

function getCopySummaryButtonHtml(disabled = false) {
  return `
    <button
      class="copy-summary-btn"
      type="button"
      data-copy-week-summary
      aria-label="Copy weekly summary"
      title="Copy weekly summary"
      ${disabled ? "disabled" : ""}
    >
      <span class="copy-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
          <rect x="9" y="3" width="10" height="13" rx="2.5" opacity="0.5"/>
          <rect x="5" y="8" width="10" height="13" rx="2.5"/>
        </svg>
      </span>
      <span class="check-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
    </button>
  `;
}

function deleteEntry() {
  openDeleteConfirm();
}

async function confirmDeleteEntry() {
  if (!todayEntry) return;

  setLoading(true);
  closeDeleteConfirm({ haptic: false });

  try {
    await fetchJson(`${API_BASE}/api/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: currentDate })
    });

    todayLogged = false;
    todayEntry = null;
    forgetLoggedDate(currentDate);
    updateEntryForm();
    await loadWeekSummary();
    triggerHaptic("warning");
  } catch (error) {
    setStatus("Could not delete");
    alert(error.message || "Could not delete");
  } finally {
    setLoading(false);
  }
}

function getConsistency(entries) {
  if (entries.length < 3) return "Building";

  const deficits = entries.map((entry) => (entry.tdee || TDEE) - entry.calories);
  const average = deficits.reduce((sum, value) => sum + value, 0) / deficits.length;
  const variance = deficits.reduce((sum, value) => sum + Math.abs(value - average), 0) / deficits.length;

  if (variance < 250) return "Stable";
  if (variance < 500) return "Moderate";
  return "Variable";
}

function getDayLabel() {
  return getDisplayDateLabel(currentDate, { todayStyle: "plain" });
}

function getDisplayDateLabel(dateString, options = {}) {
  const { todayStyle = "compact" } = options;
  const date = new Date(`${dateString}T12:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const shortDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  if (dateString === getDietDate()) {
    return todayStyle === "plain" ? "Today" : `${weekday} · Today`;
  }
  return `${weekday}, ${shortDate}`;
}

function formatDateRange(startDateString, endDateString) {
  if (!startDateString || !endDateString) return "";

  const start = new Date(`${startDateString}T12:00:00`);
  const end = new Date(`${endDateString}T12:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`;
  }

  const startOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  const endOptions = { month: "short", day: "numeric", year: "numeric" };

  return `${start.toLocaleDateString("en-US", startOptions)}-${end.toLocaleDateString("en-US", endOptions)}`;
}

function formatPlainDateLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function roundInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function formatInt(value) {
  return roundInt(value).toLocaleString();
}

function formatFatLossKg(value) {
  const kg = Number(value);
  if (!Number.isFinite(kg) || kg <= 0) return "0";
  if (kg >= 10) return Math.round(kg).toLocaleString();
  if (kg >= 1) {
    return kg.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }
  return kg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const METRIC_NOTE_PERFECT = "Perfect!";
const METRIC_NOTE_ON_TARGET = "On target";

function formatMetricOffset(delta, unit) {
  const v = roundInt(delta);
  if (v === 0) return METRIC_NOTE_ON_TARGET;
  const direction = v > 0 ? "over" : "under";
  return `${direction} by ${formatInt(Math.abs(v))} ${unit}`;
}

function formatCalorieSurplusNote(surplus) {
  return `${formatInt(surplus)} kcal surplus`;
}

function renderMetricAddPrompt() {
  return `
    <strong class="metric-add-prompt" aria-hidden="true">
      <span class="metric-add-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" focusable="false">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </strong>
  `;
}

function getProgressPercent(value, target) {
  const safeTarget = Math.max(roundInt(target), 1);
  return Math.max(0, Math.min(100, Math.round((roundInt(value) / safeTarget) * 100)));
}

function getCalorieResult(calories, tdee = TDEE, deficitTarget = DEFICIT_TARGET) {
  const rawDelta = roundInt(tdee - calories);
  const isSurplus = rawDelta < 0;
  const deficit = Math.max(rawDelta, 0);
  const surplus = Math.max(-rawDelta, 0);
  const roundedDeficitTarget = roundInt(deficitTarget);
  const deficitTolerance = roundedDeficitTarget * 0.1;
  const exceeded = !isSurplus && deficit >= Math.max(roundedDeficitTarget - deficitTolerance, 0);
  const isPerfect = !isSurplus && deficit === roundedDeficitTarget;

  return {
    deficit,
    surplus,
    isSurplus,
    isPerfect,
    progress: isSurplus ? 100 : exceeded ? 100 : getProgressPercent(deficit, roundedDeficitTarget),
    celebrated: exceeded,
    tone: isSurplus ? "surplus" : "logged",
    status: isSurplus ? "Surplus" : "Deficit"
  };
}

function getProteinResult(protein, proteinTarget = PROTEIN_TARGET) {
  const roundedProtein = roundInt(protein);
  const roundedProteinTarget = roundInt(proteinTarget);
  const gap = Math.max(roundInt(roundedProteinTarget - roundedProtein), 0);
  const isPerfect = roundedProtein === roundedProteinTarget;

  return {
    status: "Protein",
    isPerfect,
    progress: getProgressPercent(roundedProtein, roundedProteinTarget),
    celebrated: gap <= (roundedProteinTarget * 0.1)
  };
}

function buildWeeklyPlainTextSummary(summary) {
  const entries = summary.entries || [];
  const range = formatDateRange(summary.weekStart, summary.weekEnd).replace(/, \d{4}/g, "");
  const targetSnapshots = entries.map((entry) => {
    const tdee = entry.tdee || TDEE;
    const calorieTarget = entry.calorieTarget ?? Math.max(0, tdee - DEFICIT_TARGET);
    const proteinTarget = entry.proteinTarget ?? PROTEIN_TARGET;
    return `${formatInt(tdee)}/${formatInt(calorieTarget)}/${formatInt(proteinTarget)}`;
  });
  const uniqueTargets = [...new Set(targetSnapshots)];
  const targetLine = uniqueTargets.length === 1
    ? `Targets ${uniqueTargets[0]} (TDEE/cal/protein)`
    : "Targets vary by day";
  const lines = [
    `Week summary (${range})`,
    targetLine,
    `${summary.count || 0}/7 days logged, ${summary.consistency || getConsistency(entries)}`,
    `Avg ${formatInt(summary.averageCalories || 0)} kcal, ${formatInt(summary.averageProtein || 0)}g protein`,
    `Total deficit ${formatInt(summary.totalDeficit || 0)} kcal (${formatFatLossKg(summary.fatLossKg || 0)} kg est)`,
    "",
    "Daily"
  ];

  if (!entries.length) {
    lines.push("No entries");
    return lines.join("\n");
  }

  entries.forEach((entry) => {
    const tdee = entry.tdee || TDEE;
    const calorieTarget = entry.calorieTarget ?? Math.max(0, tdee - DEFICIT_TARGET);
    const proteinTarget = entry.proteinTarget ?? PROTEIN_TARGET;
    const deficit = roundInt(tdee - entry.calories);
    const deficitText = deficit < 0
      ? `+${formatInt(Math.abs(deficit))}`
      : `-${formatInt(deficit)}`;
    const targetsText = uniqueTargets.length > 1
      ? `, target ${formatInt(calorieTarget)} kcal/${formatInt(proteinTarget)}g`
      : "";

    lines.push(
      `${formatPlainDateLabel(entry.date)}: ${formatInt(entry.calories)} kcal, ${formatInt(entry.protein)}g, ${deficitText}${targetsText}`
    );
  });

  return lines.join("\n");
}

function buildTodayPlainTextSummary(today, entryCalorieTarget, entryDeficitTarget, entryProteinTarget) {
  const tdee = today.tdee || TDEE;
  const deficit = roundInt(tdee - today.calories);
  const deficitText = deficit < 0 ? `+${formatInt(Math.abs(deficit))}` : `-${formatInt(deficit)}`;
  const dateLabel = formatPlainDateLabel(today.date);
  return [
    `${dateLabel}: ${formatInt(roundInt(today.calories))} kcal, ${formatInt(roundInt(today.protein))}g, ${deficitText}`,
    `Target ${formatInt(tdee)}/${formatInt(entryCalorieTarget)}/${formatInt(entryProteinTarget)} (TDEE/cal/protein)`
  ].join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea copy path for browsers with partial clipboard support.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  window.focus();
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command failed");
  } finally {
    textarea.remove();
  }
}

function getEntryTargets(entry) {
  const entryTdee = entry.tdee || TDEE;
  const entryCalorieTarget = entry.calorieTarget ?? Math.max(0, entryTdee - DEFICIT_TARGET);
  const entryDeficitTarget = Math.max(0, entryTdee - entryCalorieTarget);
  const entryProteinTarget = entry.proteinTarget ?? PROTEIN_TARGET;
  return { entryTdee, entryCalorieTarget, entryDeficitTarget, entryProteinTarget };
}

function formatTrendDayValueHtml(trendDay) {
  if (!trendDay?.entry) return "";
  return `
    <span class="trend-value-line trend-value-kcal">${formatInt(trendDay.entry.calories)}</span>
    <span class="trend-value-line trend-value-protein">${formatInt(trendDay.entry.protein)}</span>
  `;
}

function formatTrendDayValueLabel(trendDay) {
  if (!trendDay?.entry) return "Not logged";
  const { calorieResult, entryDeficitTarget, entryProteinTarget } = trendDay;
  const deficitText = calorieResult.isSurplus
    ? `+${formatInt(calorieResult.surplus)} kcal surplus`
    : `${formatInt(calorieResult.deficit)} / ${formatInt(entryDeficitTarget)} kcal deficit`;
  return `${deficitText}, ${formatInt(trendDay.entry.protein)} / ${formatInt(entryProteinTarget)} g protein`;
}

const TREND_BAR_TRACK_HEIGHT = 96;
const TREND_BAR_MIN_HEIGHT = 10;
// Placeholder silhouette: left (deficit) lower, right (protein) higher — matches typical logged days.
const TREND_BAR_MISSING_KCAL_RATIO = 0.35;
const TREND_BAR_MISSING_PROTEIN_RATIO = 0.46;

function getMissingTrendBarHeights() {
  return {
    kcalHeight: Math.max(TREND_BAR_MIN_HEIGHT, Math.round(TREND_BAR_TRACK_HEIGHT * TREND_BAR_MISSING_KCAL_RATIO)),
    proteinHeight: Math.max(TREND_BAR_MIN_HEIGHT, Math.round(TREND_BAR_TRACK_HEIGHT * TREND_BAR_MISSING_PROTEIN_RATIO))
  };
}

function progressToTrendBarHeight(progress) {
  const clamped = Math.max(0, Math.min(130, roundInt(progress)));
  return Math.max(
    TREND_BAR_MIN_HEIGHT,
    Math.round((clamped / 100) * TREND_BAR_TRACK_HEIGHT)
  );
}

function getTrendDayMetrics(entry) {
  if (!entry) {
    const { kcalHeight, proteinHeight } = getMissingTrendBarHeights();
    return {
      entry: null,
      kcalHeight,
      kcalOverHeight: 0,
      proteinHeight,
      proteinOverHeight: 0,
      kcalState: "missing",
      proteinState: "missing"
    };
  }

  const { entryTdee, entryCalorieTarget, entryDeficitTarget, entryProteinTarget } = getEntryTargets(entry);
  const calorieResult = getCalorieResult(entry.calories, entryTdee, entryDeficitTarget);
  const proteinResult = getProteinResult(entry.protein, entryProteinTarget);

  const kcalProgress = getProgressPercent(entry.calories, entryCalorieTarget);
  const kcalBaseHeight = progressToTrendBarHeight(Math.min(100, kcalProgress));
  const proteinBaseHeight = progressToTrendBarHeight(Math.min(100, proteinResult.progress));

  return {
    entry,
    calorieResult,
    proteinResult,
    entryDeficitTarget,
    entryProteinTarget,
    kcalHeight: kcalBaseHeight,
    kcalOverHeight: progressToTrendBarHeight(kcalProgress) - kcalBaseHeight,
    proteinHeight: proteinBaseHeight,
    proteinOverHeight: progressToTrendBarHeight(proteinResult.progress) - proteinBaseHeight,
    kcalState: calorieResult.isSurplus ? "surplus" : calorieResult.celebrated ? "celebrated" : "neutral",
    proteinState: proteinResult.celebrated ? "celebrated" : "neutral"
  };
}

function renderTrendLegend() {
  return `
    <div class="trend-legend" aria-hidden="true">
      <span class="trend-legend-item"><span class="trend-legend-swatch trend-legend-swatch-kcal"></span>deficit</span>
      <span class="trend-legend-item"><span class="trend-legend-swatch trend-legend-swatch-protein"></span>protein</span>
    </div>
  `;
}

function renderTrendBars(entries) {
  const weekEntries = entries || [];
  const entryByDate = new Map(weekEntries.map((entry) => [entry.date, entry]));
  const start = getWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return `
    <div class="trend-bars" aria-label="Weekly progress trend">
      ${days
        .map((date) => {
          const dateString = formatDate(date);
          const entry = entryByDate.get(dateString);
          const isMissing = !entry;
          const trendDay = getTrendDayMetrics(entry);
          const { kcalHeight, kcalOverHeight, proteinHeight, proteinOverHeight, kcalState, proteinState } = trendDay;
          const isSelected = dateString === currentDate;
          const isFuture = isFutureDate(dateString);
          const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
          const shortDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const valueLabel = formatTrendDayValueLabel(trendDay);
          const barTitle = entry ? `${dateString}: ${valueLabel}` : `${dateString}: No data`;

          return `
            <button
              type="button"
              class="trend-day ${isSelected ? "selected" : ""} ${isMissing ? "missing" : ""} ${isFuture ? "future" : ""}"
              data-date="${dateString}"
              aria-label="Select ${weekday}, ${shortDate}. ${valueLabel}"
              ${isFuture ? "disabled" : ""}
              ${isSelected ? "aria-current=\"date\"" : ""}
            >
              <span class="trend-value">${formatTrendDayValueHtml(trendDay)}</span>
              <div class="trend-bar-pair" title="${barTitle}">
                <div class="trend-bar-slot">
                  ${kcalOverHeight > 0 ? `<div class="trend-bar-cap trend-bar-kcal ${kcalState}" style="height:${kcalOverHeight}px"></div>` : ""}
                  <div class="trend-bar trend-bar-kcal ${kcalState}" style="height:${kcalHeight}px"></div>
                </div>
                <div class="trend-bar-slot">
                  ${proteinOverHeight > 0 ? `<div class="trend-bar-cap trend-bar-protein ${proteinState}" style="height:${proteinOverHeight}px"></div>` : ""}
                  <div class="trend-bar trend-bar-protein ${proteinState}" style="height:${proteinHeight}px"></div>
                </div>
              </div>
              <span class="trend-weekday">${weekday}<span class="trend-date">${date.getDate()}</span></span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function getWeekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

function handleTrendDayClick(event) {
  const button = event.target.closest(".trend-day[data-date]");
  if (!button || button.disabled) return;

  const date = button.dataset.date;
  if (!date) return;

  setDietDay(date);
}

async function handleCopyWeeklySummaryClick(event) {
  const button = event.target.closest("[data-copy-week-summary]");
  if (!button || !latestWeekSummary) return;
  event.preventDefault();
  event.stopPropagation();

  try {
    button.classList.remove("copied");
    button.classList.add("copying");
    await copyTextToClipboard(buildWeeklyPlainTextSummary(latestWeekSummary));
    button.disabled = true;
    button.classList.remove("copying");
    button.classList.add("copied");
    button.setAttribute("aria-label", "Weekly summary copied");
    triggerHaptic("success");
    setTimeout(() => {
      button.classList.remove("copied");
      button.disabled = false;
      button.setAttribute("aria-label", "Copy weekly summary");
    }, 1400);
  } catch (error) {
    button.classList.remove("copying", "copied");
    button.disabled = false;
    button.setAttribute("aria-label", "Copy weekly summary");
    showToast("Copy failed");
  }
}

async function handleCopyTodaySummaryClick(event) {
  const button = event.target.closest("[data-copy-today-summary]");
  if (!button || !todayEntry) return;
  event.preventDefault();
  event.stopPropagation();

  const entryTdee = todayEntry.tdee || TDEE;
  const entryCalorieTarget = todayEntry.calorieTarget ?? Math.max(0, entryTdee - DEFICIT_TARGET);
  const entryDeficitTarget = Math.max(0, entryTdee - entryCalorieTarget);
  const entryProteinTarget = todayEntry.proteinTarget ?? PROTEIN_TARGET;

  try {
    button.classList.remove("copied");
    button.classList.add("copying");
    await copyTextToClipboard(buildTodayPlainTextSummary(todayEntry, entryCalorieTarget, entryDeficitTarget, entryProteinTarget));
    button.disabled = true;
    button.classList.remove("copying");
    button.classList.add("copied");
    button.setAttribute("aria-label", "Today copied");
    triggerHaptic("success");
    setTimeout(() => {
      button.classList.remove("copied");
      button.disabled = false;
      button.setAttribute("aria-label", "Copy today's summary");
    }, 1400);
  } catch {
    button.classList.remove("copying", "copied");
    button.disabled = false;
    button.setAttribute("aria-label", "Copy today's summary");
    showToast("Copy failed");
  }
}

function handleDailyMetricClick(event) {
  const metric = event.target.closest("[data-edit-field]");
  if (!metric) return;

  const field = metric.dataset.editField;
  if (field !== "calories" && field !== "protein") return;

  event.preventDefault();
  window.__quickEntryUserGesture = true;
  openQuickEntry(field);
  window.__quickEntryUserGesture = false;
}

function renderSummary(summary) {
  const dailyEl = document.getElementById("daily-result");
  const weeklyEl = document.getElementById("weekly-summary");
  if (!dailyEl || !weeklyEl) return;

  const today = summary.todayEntry;
  const rawConsistency = summary.consistency || getConsistency(summary.entries || []);
  const consistency = rawConsistency === "Stable" ? "Consistent" : rawConsistency;
  const consistencyTone = rawConsistency.toLowerCase();
  const isCompactLayout = window.matchMedia?.("(max-width: 620px)")?.matches;
  const loggedDays = summary.count || 0;
  const _weekStart = new Date(`${summary.weekStart}T12:00:00`);
  const _weekEnd = new Date(`${summary.weekEnd}T12:00:00`);
  const _dietToday = new Date(`${getDietDate()}T12:00:00`);
  const _effectiveEnd = _dietToday < _weekEnd ? _dietToday : _weekEnd;
  const daysElapsed = Math.round((_effectiveEnd - _weekStart) / (1000 * 60 * 60 * 24)) + 1;
  const weeklyPillText = loggedDays >= daysElapsed ? "Full week" : `${loggedDays} ${loggedDays === 1 ? "day" : "days"}`;
  const weekRangeText = formatDateRange(summary.weekStart, summary.weekEnd).replace(/, \d{4}/g, "");
  const dailyHeadingText = currentDate === getDietDate() ? "Today" : "This Day";
  latestWeekSummary = summary;
  let dailyHtml = "";

  if (today) {
    const entryTdee = today.tdee || TDEE;
    const entryCalorieTarget = today.calorieTarget ?? Math.max(0, entryTdee - DEFICIT_TARGET);
    const entryDeficitTarget = Math.max(0, entryTdee - entryCalorieTarget);
    const entryProteinTarget = today.proteinTarget ?? PROTEIN_TARGET;
    const calorieResult = getCalorieResult(today.calories, entryTdee, entryDeficitTarget);
    const proteinResult = getProteinResult(today.protein, entryProteinTarget);
    const roundedCalories = roundInt(today.calories);
    const roundedProtein = roundInt(today.protein);
    const calorieIntakeTarget = Math.max(0, entryCalorieTarget);
    const deficitOverTarget = Math.max(roundInt(calorieResult.deficit - entryDeficitTarget), 0);
    const proteinOverTarget = Math.max(roundInt(roundedProtein - entryProteinTarget), 0);
    // "Perfect" = landed exactly on the target (not a surplus, not over, but deficit/protein == target)
    const caloriePerfect = !calorieResult.isSurplus && deficitOverTarget === 0 && roundInt(calorieResult.deficit) === roundInt(entryDeficitTarget);
    const proteinPerfect = proteinOverTarget === 0 && roundedProtein === entryProteinTarget;
    const doubleHit = (deficitOverTarget > 0 || caloriePerfect) && (proteinOverTarget > 0 || proteinPerfect);
    const statusPillText = doubleHit ? "Double hit" : "Logged";
    // Reward tone: calories and protein cards — deficit card is always plain
    const calorieMetricTone = calorieResult.isSurplus ? "caution" : (deficitOverTarget > 0 || caloriePerfect) ? "rewarded" : calorieResult.celebrated ? "on-track" : "";
    const proteinMetricTone = (proteinOverTarget > 0 || proteinPerfect) ? "rewarded" : proteinResult.celebrated ? "on-track" : "";
    const calorieAlmostThere = calorieResult.celebrated && !calorieResult.isSurplus && deficitOverTarget === 0 && !caloriePerfect;
    const proteinAlmostThere = proteinResult.celebrated && roundedProtein < entryProteinTarget;
    const calorieMetricText = calorieResult.isSurplus
      ? formatCalorieSurplusNote(calorieResult.surplus)
      : caloriePerfect
        ? METRIC_NOTE_PERFECT
        : `${formatInt(calorieResult.deficit)} kcal deficit`;
    const proteinDelta = roundedProtein - entryProteinTarget;
    const proteinMetricText = proteinPerfect
      ? METRIC_NOTE_PERFECT
      : proteinDelta >= 0
        ? `+${formatInt(proteinDelta)} g`
        : `${formatInt(Math.abs(proteinDelta))} g short`;

    dailyHtml = `
      <section class="daily-card ${calorieResult.tone} ${doubleHit ? "double-hit" : ""}">
        <div class="daily-card-top">
          <div class="daily-card-top-left">
            <h2 class="daily-card-heading">${dailyHeadingText}</h2>
            <button class="copy-summary-btn" type="button" data-copy-today-summary aria-label="Copy today's summary" title="Copy today's summary">
              <span class="copy-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" focusable="false"><rect x="9" y="3" width="10" height="13" rx="2.5" opacity="0.5"/><rect x="5" y="8" width="10" height="13" rx="2.5"/></svg></span>
              <span class="check-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><polyline points="20 6 9 17 4 12"/></svg></span>
            </button>
          </div>
          <div class="daily-card-top-right">
            <span class="status-pill ${doubleHit ? "double-hit" : "logged"}">${statusPillText}</span>
          </div>
        </div>

        <div class="daily-metrics">
          <button class="daily-metric metric-button ${calorieMetricTone}" type="button" data-edit-field="calories" aria-label="Edit calories" style="--metric-progress:${(() => { const over = !calorieResult.isSurplus && roundedCalories > calorieIntakeTarget; return calorieResult.isSurplus ? 100 : over ? Math.min(50, Math.round((roundedCalories - calorieIntakeTarget) / calorieIntakeTarget * 100)) : Math.min(100, Math.round(roundedCalories / calorieIntakeTarget * 100)); })()}%" ${!calorieResult.isSurplus && roundedCalories > calorieIntakeTarget ? `data-metric-over="true"` : ""}>
            <span class="metric-label">Calories</span>
            <strong>${formatInt(roundedCalories)} <small>kcal</small></strong>
            <span class="metric-note ${deficitOverTarget > 0 || caloriePerfect || calorieAlmostThere ? "reward" : calorieResult.isSurplus ? "negative" : ""}">${calorieMetricText}</span>
          </button>
          <button class="daily-metric metric-button ${proteinMetricTone}" type="button" data-edit-field="protein" aria-label="Edit protein" style="--metric-progress:${proteinResult.progress}%">
            <span class="metric-label">Protein</span>
            <strong>${formatInt(roundedProtein)} <small>g</small></strong>
            <span class="metric-note ${proteinOverTarget > 0 || proteinPerfect || proteinAlmostThere ? "reward" : ""}">${proteinMetricText}</span>
          </button>
        </div>

      </section>
    `;
  } else {
    dailyHtml = `
      <section class="daily-card empty">
        <div class="daily-card-top">
          <h2 class="daily-card-heading">${dailyHeadingText}</h2>
          <span class="status-pill missing">No entry</span>
        </div>
        <div class="daily-metrics">
          <button class="daily-metric metric-button metric-add" type="button" data-edit-field="calories" aria-label="Add calories, tap to enter">
            <span class="metric-label">Calories</span>
            ${renderMetricAddPrompt()}
            <span class="metric-add-target">${isCompactLayout ? `Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))}` : `Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))} kcal`}</span>
          </button>
          <button class="daily-metric metric-button metric-add" type="button" data-edit-field="protein" aria-label="Add protein, tap to enter">
            <span class="metric-label">Protein</span>
            ${renderMetricAddPrompt()}
            <span class="metric-add-target">${isCompactLayout ? `Target ${formatInt(PROTEIN_TARGET)} g` : `Target ${formatInt(PROTEIN_TARGET)} g`}</span>
          </button>
        </div>
        <p class="empty-state">Tap Calories or Protein to log today.</p>
      </section>
    `;
  }

  const cutLabel = getWeekCutPhaseLabel(summary);

  // Weekly metric water levels
  const weekCalorieTarget = Math.max(1, Math.round(TDEE - DEFICIT_TARGET));
  const weekAvgCal = roundInt(summary.averageCalories || 0);
  const weekAvgProtein = roundInt(summary.averageProtein || 0);
  const weekFatLossKg = summary.fatLossKg || 0;
  const weekFatLossTarget = (DEFICIT_TARGET * 7) / 7700;

  const weekCalOverTarget = weekAvgCal > weekCalorieTarget && (TDEE - weekAvgCal) > 0;
  const weekCalProgress = weekCalOverTarget
    ? Math.min(50, Math.round((weekAvgCal - weekCalorieTarget) / weekCalorieTarget * 100))
    : Math.min(100, Math.round(weekAvgCal / weekCalorieTarget * 100));
  const weekCalRewarded = !weekCalOverTarget && (TDEE - weekAvgCal) >= DEFICIT_TARGET * 0.9;
  const weekCalOver = weekCalOverTarget;

  const weekProteinProgress = Math.min(100, Math.round(weekAvgProtein / Math.max(1, PROTEIN_TARGET) * 100));
  const weekProteinRewarded = weekAvgProtein >= PROTEIN_TARGET;

  const weekFatRewarded = weekFatLossKg >= weekFatLossTarget * 0.9;

  const weekHtml = `
    <section class="card week-card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-header-title-row">
            <h2>This Week</h2>
            ${getCopySummaryButtonHtml()}
          </div>
          ${cutLabel ? `<p class="cut-phase-label">${cutLabel}</p>` : ""}
        </div>
        <div class="card-actions">
          <span class="status-pill logged">${weeklyPillText}</span>
        </div>
      </div>
      <div class="week-snapshot">
        <div class="metric ${weekCalRewarded ? "rewarded" : ""}" style="--metric-progress:${weekCalProgress}%"${weekCalOver ? ` data-metric-over="true"` : ""}>
          <span class="metric-label">Avg calories</span>
          <span class="metric-value">${formatInt(summary.averageCalories || 0)} <small>kcal</small></span>
        </div>
        <div class="metric ${weekProteinRewarded ? "rewarded" : ""}" style="--metric-progress:${weekProteinProgress}%">
          <span class="metric-label">Avg protein</span>
          <span class="metric-value">${formatInt(summary.averageProtein || 0)} <small>g</small></span>
        </div>
        <div class="metric ${weekFatRewarded ? "rewarded" : ""}" style="--metric-progress:100%">
          <span class="metric-label">Fat loss</span>
          <span class="metric-value">${formatFatLossKg(summary.fatLossKg || 0)} <small>kg</small></span>
        </div>
      </div>
      <div class="week-trend-panel">
        <div class="week-trend-header">
          <div class="week-trend-header-start">
            <span>Daily intake</span>
            ${renderTrendLegend()}
          </div>
          <strong class="trend-status ${consistencyTone}">${consistency}</strong>
        </div>
        ${renderTrendBars(summary.entries || [])}
      </div>
    </section>
  `;

  dailyEl.innerHTML = dailyHtml;
  weeklyEl.innerHTML = weekHtml;
}

async function loadWeekSummary() {
  const requestedDate = currentDate;

  updateDietDayDisplay();
  hideEntryFormWhileLoading();
  setSummaryRefreshing(true);

  try {
    const data = await fetchJson(`${API_BASE}/api/summary?today=${encodeURIComponent(requestedDate)}&tdee=${encodeURIComponent(TDEE)}`);

    if (requestedDate !== currentDate) return;

    todayLogged = Boolean(data.summary.todayLogged);
    todayEntry = data.summary.todayEntry;

    if (todayEntry) {
      rememberLoggedDate(currentDate);
      repairEntryPhaseIfNeeded(todayEntry);
    } else {
      forgetLoggedDate(currentDate);
    }

    updateEntryForm();
    renderSummary(data.summary);
    setSummaryRefreshing(false);
    setStatus("");
    fetchLatestPhaseLog().then(phase => { latestPhaseLog = phase; }).catch(() => {});
  } catch (error) {
    if (error.isAuthError) {
      setSummaryRefreshing(false);
      setStatus("Locked");
      return;
    }

    setStatus("Could not load summary");
    setSummaryRefreshing(false);
    const dailyResult = document.getElementById("daily-result");
    if (dailyResult) {
      const section = document.createElement("section");
      section.className = "daily-card empty";
      const h2 = document.createElement("h2");
      h2.textContent = "Unable to load data";
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = error.message || "Please try again later.";
      section.appendChild(h2);
      section.appendChild(p);
      dailyResult.replaceChildren(section);
    }
    const weeklySummary = document.getElementById("weekly-summary");
    if (weeklySummary) weeklySummary.innerHTML = "";
  }
}

function handleFormSubmit(event) {
  event.preventDefault();

  try {
    const { calories, protein } = getFormValues();
    saveEntry(calories, protein);
  } catch (error) {
    triggerHaptic("error");
    setStatus(error.message);
  }
}

function handleCaloriesInput(event) {
  const calories = event.currentTarget;
  const protein = document.getElementById("protein");
  let digits = calories.value.replace(/\D/g, "");

  if (digits.length > 4) digits = digits.slice(0, 4);
  if (digits !== calories.value) calories.value = digits;

  if (digits.length === 4 && protein && document.activeElement === calories) {
    protein.focus();
    protein.select();
  }
}

function handleProteinInput(event) {
  const protein = event.currentTarget;
  let digits = protein.value.replace(/\D/g, "");

  if (digits.length > 3) digits = digits.slice(0, 3);
  if (digits !== protein.value) protein.value = digits;

  if (digits.length === 3) {
    document.getElementById("today-form")?.requestSubmit();
  }
}

function handleTargetsSubmit(event) {
  event.preventDefault();

  const nextTdee = Number(document.getElementById("tdeeInput")?.value);
  const nextProteinTarget = Number(document.getElementById("proteinTargetInput")?.value);
  const nextDeficitTarget = Number(document.getElementById("deficitTargetInput")?.value);

  if (!Number.isFinite(nextTdee) || nextTdee <= 0) {
    setStatus("Invalid TDEE");
    return;
  }

  if (!Number.isFinite(nextProteinTarget) || nextProteinTarget <= 0) {
    setStatus("Invalid protein target");
    return;
  }

  if (!Number.isFinite(nextDeficitTarget) || nextDeficitTarget < 0) {
    setStatus("Invalid deficit target");
    return;
  }

  setLoading(true);

  fetchJson(`${API_BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tdee: Math.round(nextTdee),
      proteinTarget: Math.round(nextProteinTarget),
      deficitTarget: Math.round(nextDeficitTarget),
      cutStartDate,
      activeCutPhase,
      cutPhaseDeficits: cutPhaseDeficits.map((value) => Math.round(value))
    })
  })
    .then((data) => {
      applyConfig(data.config);
      return loadWeekSummary();
    })
    .catch((error) => {
      if (error.isAuthError) {
        setStatus("Locked");
        return;
      }

      setStatus("Could not save targets");
      alert(error.message || "Could not save targets");
    })
    .finally(() => {
      setLoading(false);
    });
}

function initApp() {
  document.getElementById("signOutBtn")?.addEventListener("click", signOut);
  document.getElementById("today-form")?.addEventListener("submit", handleFormSubmit);
  document.getElementById("targets-form")?.addEventListener("submit", handleTargetsSubmit);
  document.getElementById("diet-day")?.addEventListener("click", openCalendar);
  document.getElementById("closeCalendarBtn")?.addEventListener("click", closeCalendar);
  document.getElementById("calendarBackdrop")?.addEventListener("click", closeCalendar);
  document.getElementById("jumpTodayBtn")?.addEventListener("click", () => {
    const todayString = getDietDate();
    if (currentDate !== todayString) setDietDay(todayString);
    closeCalendar({ haptic: false });
  });
  document.getElementById("calendarGrid")?.addEventListener("click", handleCalendarDayClick);
  document.getElementById("prevDayBtn")?.addEventListener("click", () => shiftDietDay(-1));
  document.getElementById("nextDayBtn")?.addEventListener("click", () => shiftDietDay(1));
  document.getElementById("weekly-summary")?.addEventListener("click", handleTrendDayClick);
  document.getElementById("weekly-summary")?.addEventListener("click", handleCopyWeeklySummaryClick);
  document.getElementById("daily-result")?.addEventListener("click", handleDailyMetricClick);
  document.getElementById("daily-result")?.addEventListener("click", handleCopyTodaySummaryClick);
  document.getElementById("deleteBtn")?.addEventListener("click", deleteEntry);
  document.getElementById("deleteConfirmBackdrop")?.addEventListener("click", closeDeleteConfirm);
  document.getElementById("cancelDeleteBtn")?.addEventListener("click", closeDeleteConfirm);
  document.getElementById("confirmDeleteBtn")?.addEventListener("click", confirmDeleteEntry);
  document.getElementById("phasePickerBackdrop")?.addEventListener("click", closePhasePicker);
  document.getElementById("phasePickerCloseBtn")?.addEventListener("click", closePhasePicker);
  document.getElementById("closeQuickEntryBtn")?.addEventListener("click", closeQuickEntry);
  document.getElementById("quickEntryBackdrop")?.addEventListener("click", closeQuickEntry);
  document.getElementById("calories")?.addEventListener("input", handleCaloriesInput);
  document.getElementById("protein")?.addEventListener("input", handleProteinInput);
  document.addEventListener("keydown", handleGlobalKeydown);
  initCarouselSwipe();

  window.matchMedia?.("(max-width: 620px)")?.addEventListener?.("change", (event) => {
    document.getElementById("today-form")?.classList.toggle("compact-entry-fields", event.matches);
    if (todayEntry || document.getElementById("daily-result")?.innerHTML) {
      loadWeekSummary();
    }
  });
  // Cut phases — clear legacy localStorage keys (migrated to Notion)
  ["calorieTrackerCutStartDate", "calorieTrackerActiveCutPhase", "calorieTrackerCutPhaseDeficits"]
    .forEach(key => localStorage.removeItem(key));

  updateCutPhaseUI();
  document.getElementById("cutStartDateInput")?.addEventListener("change", handleCutStartDateChange);
  document.getElementById("cutPhasesPanel")?.addEventListener("click", handleCutPhasePanelClick);
  CUT_PHASE_NAMES.forEach((_, i) => {
    document.getElementById(`cutPhaseDeficit${i}`)?.addEventListener("blur", (e) => handlePhaseDeficitBlur(i, e.target.value));
  });

  updateDietDayDisplay();
  updateTargetForm();
  setEntryFormVisible(false);
  renderInitialLoadingState();
  showAccessGate();
  setStatus("Locked");

  restoreSession()
    .then((ok) => {
      if (ok) {
        setStatus("");
        return;
      }

      return setupGoogleSignIn();
    })
    .catch((error) => {
      setStatus("Locked");
      showAccessGate(error.message || "Could not start sign-in");
    });
}

document.addEventListener("DOMContentLoaded", initApp);
