let TDEE = Number(localStorage.getItem("tdee")) || 2705;
let PROTEIN_TARGET = Number(localStorage.getItem("proteinTarget")) || 180;
let DEFICIT_TARGET = Number(localStorage.getItem("deficitTarget")) || 500;
const API_BASE = "https://calorie-tracker-omega-ten.vercel.app";
const ACCESS_KEY_STORAGE_KEY = "calorieTrackerAccessKey";

let todayLogged = false;
let todayEntry = null;
let currentDate = getDietDate();
let toastTimer = null;
let autoSubmitArmed = true;
let didAutoOpenQuickEntry = false;
let calendarMonth = getMonthStart(currentDate);

function getDietDate() {
  const now = new Date();
  if (now.getHours() < 3) now.setDate(now.getDate() - 1);
  return formatDate(now);
}

function getTodayDate() {
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
  return new Date(`${dateString}T12:00:00`) > new Date(`${getTodayDate()}T12:00:00`);
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function showToast(message) {
  let toast = document.querySelector(".toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

function getStoredAccessKey() {
  return localStorage.getItem(ACCESS_KEY_STORAGE_KEY);
}

function clearAccessKey() {
  localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
}

function createAuthError(message) {
  const error = new Error(message);
  error.isAuthError = true;
  return error;
}

function showAccessGate(message = "") {
  const gate = document.getElementById("accessGate");
  const error = document.getElementById("accessError");
  const input = document.getElementById("accessKeyInput");

  document.body.classList.add("auth-locked");
  if (gate) gate.hidden = false;
  if (error) error.textContent = message;

  setTimeout(() => {
    input?.focus();
  }, 60);
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
  const isAtToday = currentDate === getTodayDate();

  if (btn) {
    btn.setAttribute("aria-label", `Selected day ${currentDate}`);
  }

  if (label) {
    label.textContent = currentDate === getDietDate() ? "Today" : currentDate;
  }

  if (nextBtn) {
    nextBtn.setAttribute("aria-disabled", String(isAtToday));
  }
}

function updateTargetForm() {
  const tdeeInput = document.getElementById("tdeeInput");
  const proteinInput = document.getElementById("proteinTargetInput");
  const deficitInput = document.getElementById("deficitTargetInput");

  if (tdeeInput) tdeeInput.value = TDEE;
  if (proteinInput) proteinInput.value = PROTEIN_TARGET;
  if (deficitInput) deficitInput.value = DEFICIT_TARGET;
}

function updateEntryForm() {
  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");
  const deleteBtn = document.getElementById("deleteBtn");
  const saveBtn = document.getElementById("saveBtn");
  const isViewingToday = currentDate === getDietDate();

  if (calories) calories.value = todayEntry ? todayEntry.calories : "";
  if (protein) protein.value = todayEntry ? todayEntry.protein : "";
  if (deleteBtn) deleteBtn.hidden = !todayEntry;
  if (saveBtn) {
    if (todayEntry) {
      saveBtn.textContent = "Update Entry";
    } else {
      saveBtn.textContent = isViewingToday ? "Commit Today" : `Save ${currentDate}`;
    }
  }
}

function setLoading(isLoading) {
  const saveBtn = document.getElementById("saveBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  if (saveBtn) saveBtn.disabled = isLoading;
  if (deleteBtn) deleteBtn.disabled = isLoading;
}

function isQuickEntryOpen() {
  return document.getElementById("today-form")?.classList.contains("quick-entry") || false;
}

function openQuickEntry() {
  const form = document.getElementById("today-form");
  const backdrop = document.getElementById("quickEntryBackdrop");
  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");

  if (!form || !calories || !protein) return;

  form.classList.add("quick-entry");
  document.body.classList.add("quick-entry-open");
  if (backdrop) backdrop.hidden = false;

  if (!todayEntry) {
    calories.value = "";
    protein.value = "";
  }

  autoSubmitArmed = true;
  setStatus("Enter calories");

  setTimeout(() => {
    calories.focus();
    calories.select();
  }, 80);
}

function closeQuickEntry() {
  const form = document.getElementById("today-form");
  const backdrop = document.getElementById("quickEntryBackdrop");

  if (form) form.classList.remove("quick-entry");
  document.body.classList.remove("quick-entry-open");
  if (backdrop) backdrop.hidden = true;
}

function openCalendar() {
  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");

  calendarMonth = getMonthStart(currentDate);
  renderCalendar();

  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("calendar-open");
}

function closeCalendar() {
  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");

  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("calendar-open");
}

function shiftCalendarMonth(months) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + months, 1);
  renderCalendar();
}

function renderCalendar() {
  const title = document.getElementById("calendarTitle");
  const grid = document.getElementById("calendarGrid");
  const nextMonthBtn = document.getElementById("nextMonthBtn");
  const today = new Date(`${getTodayDate()}T12:00:00`);

  if (!title || !grid) return;

  title.textContent = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const firstDayOffset = (calendarMonth.getDay() + 6) % 7;
  const firstCell = new Date(calendarMonth);
  firstCell.setDate(calendarMonth.getDate() - firstDayOffset);

  const currentMonth = calendarMonth.getMonth();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + i);

    const dateString = formatDate(date);
    const isOutsideMonth = date.getMonth() !== currentMonth;
    const isSelected = dateString === currentDate;
    const isFuture = date > today;

    cells.push(`
      <button
        class="calendar-day ${isOutsideMonth ? "outside" : ""} ${isSelected ? "selected" : ""}"
        type="button"
        data-date="${dateString}"
        ${isFuture ? "disabled" : ""}
      >
        ${date.getDate()}
      </button>
    `);
  }

  grid.innerHTML = cells.join("");

  if (nextMonthBtn) {
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    nextMonthBtn.setAttribute("aria-disabled", String(nextMonth > today));
  }
}

function handleCalendarDayClick(event) {
  const btn = event.target.closest("[data-date]");
  if (!btn || btn.disabled) return;

  setDietDay(btn.dataset.date);
  closeCalendar();
}

function setDietDay(date) {
  currentDate = date;
  todayLogged = false;
  todayEntry = null;

  updateDietDayDisplay();
  updateEntryForm();
  loadWeekSummary();
}

function shiftDietDay(days) {
  const d = new Date(`${currentDate}T12:00:00`);
  d.setDate(d.getDate() + days);

  if (d > new Date(`${getTodayDate()}T12:00:00`)) return;

  setDietDay(formatDate(d));
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
    calories,
    protein
  };
}

async function fetchJson(url, options = {}, didRetry = false) {
  const accessKey = getStoredAccessKey();

  if (!accessKey) {
    showAccessGate();
    throw createAuthError("Access key required");
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "X-App-Key": accessKey
    }
  });
  let data = null;

  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    if (res.status === 401 && !didRetry) {
      clearAccessKey();
      showAccessGate("Access key incorrect");
      throw createAuthError("Access key incorrect");
    }

    throw new Error(data.error || data.detail?.message || "Request failed");
  }

  return data;
}

async function saveEntry(calories, protein) {
  setLoading(true);
  setStatus("Saving...");

  try {
    await fetchJson(`${API_BASE}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: currentDate,
        calories,
        protein,
        tdee: TDEE
      })
    });

    todayLogged = true;
    setStatus(`Saved · ${TDEE - calories} kcal`);
    showToast(`Saved · ${TDEE - calories} kcal`);
    closeQuickEntry();
    await loadWeekSummary("Entry saved");
  } catch (error) {
    setStatus("Save failed");
    alert(error.message || "Save failed");
  } finally {
    setLoading(false);
  }
}

async function deleteEntry() {
  if (!todayEntry || !confirm("Delete this entry?")) return;

  setLoading(true);
  setStatus("Deleting...");

  try {
    await fetchJson(`${API_BASE}/api/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: currentDate })
    });

    todayLogged = false;
    todayEntry = null;
    updateEntryForm();
    setStatus("Deleted");
    showToast("Entry deleted");
    await loadWeekSummary("Entry deleted");
  } catch (error) {
    setStatus("Delete failed");
    alert(error.message || "Delete failed");
  } finally {
    setLoading(false);
  }
}

function calculateRecovery(today, summary) {
  if (!today) return 0;

  const calorieScore = Math.max(0, 1 - Math.abs(TDEE - today.calories) / TDEE) * 40;
  const proteinScore = Math.min(today.protein / PROTEIN_TARGET, 1) * 30;
  const consistencyScore = summary.consistency === "Stable" ? 30 : summary.consistency === "Moderate" ? 20 : 10;

  return Math.round(calorieScore + proteinScore + consistencyScore);
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
  return currentDate === getDietDate() ? "Today" : `Editing ${currentDate}`;
}

function getCalorieResult(calories) {
  const deficit = TDEE - calories;
  const gap = DEFICIT_TARGET - deficit;

  return {
    deficit,
    tone: deficit >= DEFICIT_TARGET ? "deficit" : "surplus",
    status: "赤字",
    detail:
      deficit >= DEFICIT_TARGET
        ? `${deficit} kcal · 達標`
        : `${deficit} kcal · 差 ${Math.abs(gap)} kcal`
  };
}

function getProteinResult(protein) {
  const gap = Math.max(PROTEIN_TARGET - protein, 0);

  if (gap === 0) {
    return {
      status: "Protein target hit",
      detail: `${protein}g / ${PROTEIN_TARGET}g`
    };
  }

  return {
    status: gap <= 10 ? "Almost there" : "Protein short",
    detail: `${protein}g / ${PROTEIN_TARGET}g · ${gap}g short`
  };
}

function renderTrendBars(entries) {
  const weekEntries = entries || [];
  const maxCalories = Math.max(TDEE, ...weekEntries.map((entry) => entry.calories || 0));

  if (!weekEntries.length) {
    return `<p class="empty-state">No weekly trend yet.</p>`;
  }

  return `
    <div class="trend-bars" aria-label="Weekly calorie trend">
      ${weekEntries
        .map((entry) => {
          const height = Math.max(18, Math.round(((entry.calories || 0) / maxCalories) * 76));
          const isSelected = entry.date === currentDate;
          const day = new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });

          return `
            <div class="trend-day ${isSelected ? "selected" : ""}">
              <div class="trend-bar" style="height:${height}px" title="${entry.date}: ${entry.calories} kcal"></div>
              <span>${day}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function getWeekMissingDays(summary) {
  const entries = summary.entries || [];
  const loggedDates = new Set(entries.map((entry) => entry.date));
  const start = new Date(`${summary.weekStart}T12:00:00`);
  const end = new Date(`${summary.weekEnd}T12:00:00`);
  const today = new Date(`${getTodayDate()}T12:00:00`);
  const last = end > today ? today : end;
  const missing = [];

  for (const d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
    const date = formatDate(d);
    if (!loggedDates.has(date)) {
      missing.push(d.toLocaleDateString("en-US", { weekday: "short" }));
    }
  }

  return missing;
}

function renderSummary(summary) {
  const dailyEl = document.getElementById("daily-result");
  const weeklyEl = document.getElementById("weekly-summary");
  if (!dailyEl || !weeklyEl) return;

  const today = summary.todayEntry;
  const consistency = summary.consistency || getConsistency(summary.entries || []);
  let dailyHtml = "";

  if (today) {
    const calorieResult = getCalorieResult(today.calories);
    const proteinResult = getProteinResult(today.protein);
    const recovery = calculateRecovery(today, { ...summary, consistency });
    const recoveryLabel = recovery >= 80 ? "High recovery" : recovery >= 50 ? "Moderate recovery" : "Low recovery";

    dailyHtml = `
      <section class="daily-card ${calorieResult.tone}">
        <div class="daily-card-top">
          <span class="day-label">${getDayLabel()}</span>
          <span class="status-pill logged">Logged</span>
        </div>

        <div class="hero-result">
          <div>
            <span class="hero-value">${today.calories.toLocaleString()}</span>
            <span class="hero-unit">kcal</span>
          </div>
          <div>
            <span class="hero-value secondary">${today.protein}</span>
            <span class="hero-unit">g protein</span>
          </div>
        </div>

        <div class="settlement-lines">
          <div>
            <strong>${calorieResult.status}</strong>
            <span>${calorieResult.detail}</span>
          </div>
          <div>
            <strong>${proteinResult.status}</strong>
            <span>${proteinResult.detail}</span>
          </div>
          <div>
            <strong>${recoveryLabel}</strong>
            <span>Recovery ${recovery} / 100</span>
          </div>
        </div>
      </section>
    `;
  } else {
    dailyHtml = `
      <section class="daily-card empty">
        <div class="daily-card-top">
          <span class="day-label">${getDayLabel()}</span>
          <span class="status-pill missing">Missing</span>
        </div>
        <div class="hero-result">
          <div>
            <span class="hero-value">--</span>
            <span class="hero-unit">kcal</span>
          </div>
          <div>
            <span class="hero-value secondary">--</span>
            <span class="hero-unit">g protein</span>
          </div>
        </div>
        <p class="empty-state">Settle this day by entering calories and protein below.</p>
      </section>
    `;
  }

  const missingDays = getWeekMissingDays(summary);
  const missingHtml = missingDays.length
    ? `<p class="missing-days">Missing: ${missingDays.join(", ")}</p>`
    : `<p class="missing-days complete">No missing days so far.</p>`;

  const weekHtml = `
    <section class="card week-card">
      <div class="card-header">
        <h2>This Week</h2>
        <span class="status-pill logged">${summary.count || 0} days</span>
      </div>
      <div class="week-snapshot">
        <div class="metric">
          <span class="metric-label">Avg kcal</span>
          <span class="metric-value">${summary.averageCalories || 0}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg protein</span>
          <span class="metric-value">${summary.averageProtein || 0}g</span>
        </div>
        <div class="metric">
          <span class="metric-label">Fat loss</span>
          <span class="metric-value">${Number(summary.fatLossKg || 0).toFixed(2)} kg</span>
        </div>
      </div>
      ${renderTrendBars(summary.entries || [])}
      ${missingHtml}
      <p class="subtle-text" style="margin-top:10px;">Weekly pattern: ${consistency}</p>
    </section>
  `;

  dailyEl.innerHTML = dailyHtml;
  weeklyEl.innerHTML = weekHtml;
}

async function loadWeekSummary(successMessage) {
  updateDietDayDisplay();
  setStatus("Loading...");

  try {
    const data = await fetchJson(`${API_BASE}/api/summary?today=${encodeURIComponent(currentDate)}&tdee=${encodeURIComponent(TDEE)}`);

    todayLogged = Boolean(data.summary.todayLogged);
    todayEntry = data.summary.todayEntry;

    updateEntryForm();
    renderSummary(data.summary);
    setStatus(successMessage || "");

    if (!didAutoOpenQuickEntry && currentDate === getDietDate() && !todayEntry) {
      didAutoOpenQuickEntry = true;
      openQuickEntry();
    }
  } catch (error) {
    if (error.isAuthError) {
      setStatus("Locked");
      return;
    }

    setStatus("Could not load summary");
    document.getElementById("daily-result").innerHTML = `
      <section class="daily-card empty">
        <h2>Unable to load data</h2>
        <p class="empty-state">${error.message || "Please try again later."}</p>
      </section>
    `;
    document.getElementById("weekly-summary").innerHTML = "";
  }
}

function handleFormSubmit(event) {
  event.preventDefault();

  try {
    const { calories, protein } = getFormValues();
    saveEntry(calories, protein);
  } catch (error) {
    setStatus(error.message);
  }
}

function handleCaloriesInput(event) {
  const calories = event.currentTarget;
  const protein = document.getElementById("protein");
  const digits = calories.value.replace(/\D/g, "");

  if (digits.length >= 4 && protein && document.activeElement === calories) {
    protein.focus();
    protein.select();
    setStatus("Enter protein");
  }

  autoSubmitArmed = true;
}

function handleProteinInput(event) {
  const protein = event.currentTarget;
  const digits = protein.value.replace(/\D/g, "");

  if (digits.length < 3 || !autoSubmitArmed || todayEntry || currentDate !== getDietDate()) return;

  autoSubmitArmed = false;
  setStatus("Auto submitting...");
  document.getElementById("today-form")?.requestSubmit();
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

  TDEE = Math.round(nextTdee);
  PROTEIN_TARGET = Math.round(nextProteinTarget);
  DEFICIT_TARGET = Math.round(nextDeficitTarget);

  localStorage.setItem("tdee", String(TDEE));
  localStorage.setItem("proteinTarget", String(PROTEIN_TARGET));
  localStorage.setItem("deficitTarget", String(DEFICIT_TARGET));

  setStatus("Targets saved");
  showToast("Targets saved");
  loadWeekSummary("Targets saved");
}

function handleAccessSubmit(event) {
  event.preventDefault();

  const input = document.getElementById("accessKeyInput");
  const accessKey = input?.value.trim();

  if (!accessKey) {
    showAccessGate("Access key required");
    return;
  }

  localStorage.setItem(ACCESS_KEY_STORAGE_KEY, accessKey);
  hideAccessGate();
  setStatus("Unlocking...");
  loadWeekSummary();
}

function initApp() {
  document.getElementById("accessForm")?.addEventListener("submit", handleAccessSubmit);
  document.getElementById("today-form")?.addEventListener("submit", handleFormSubmit);
  document.getElementById("targets-form")?.addEventListener("submit", handleTargetsSubmit);
  document.getElementById("diet-day")?.addEventListener("click", openCalendar);
  document.getElementById("calendarBackdrop")?.addEventListener("click", closeCalendar);
  document.getElementById("prevMonthBtn")?.addEventListener("click", () => shiftCalendarMonth(-1));
  document.getElementById("nextMonthBtn")?.addEventListener("click", () => {
    if (document.getElementById("nextMonthBtn")?.getAttribute("aria-disabled") === "true") return;
    shiftCalendarMonth(1);
  });
  document.getElementById("calendarGrid")?.addEventListener("click", handleCalendarDayClick);
  document.getElementById("prevDayBtn")?.addEventListener("click", () => shiftDietDay(-1));
  document.getElementById("nextDayBtn")?.addEventListener("click", () => shiftDietDay(1));
  document.getElementById("deleteBtn")?.addEventListener("click", deleteEntry);
  document.getElementById("closeQuickEntryBtn")?.addEventListener("click", closeQuickEntry);
  document.getElementById("quickEntryBackdrop")?.addEventListener("click", closeQuickEntry);
  document.getElementById("calories")?.addEventListener("input", handleCaloriesInput);
  document.getElementById("protein")?.addEventListener("input", handleProteinInput);

  updateDietDayDisplay();
  updateTargetForm();

  if (getStoredAccessKey()) {
    hideAccessGate();
    loadWeekSummary();
  } else {
    showAccessGate();
    setStatus("Locked");
  }
}

document.addEventListener("DOMContentLoaded", initApp);
