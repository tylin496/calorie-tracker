let TDEE = 2705;
let PROTEIN_TARGET = 180;
let DEFICIT_TARGET = 500;
const API_BASE = "https://calorie-tracker-omega-ten.vercel.app";
const ACCESS_KEY_STORAGE_KEY = "calorieTrackerAccessKey";
const LAST_LOGGED_DATE_STORAGE_KEY = "calorieTrackerLastLoggedDate";

let todayLogged = false;
let todayEntry = null;
let currentDate = getDietDate();
let toastTimer = null;
let autoSubmitArmed = true;
let didAutoOpenQuickEntry = false;
let didOptimisticQuickEntryOpen = false;
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

function getWeekday(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short" });
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

  if (label) {
    const displayLabel = getDisplayDateLabel(currentDate, { todayStyle: "compact" });
    label.textContent = displayLabel;
    if (btn) {
      btn.setAttribute("aria-label", `Selected day ${displayLabel}`);
    }
  }

  if (nextBtn) {
    nextBtn.setAttribute("aria-disabled", String(isAtToday));
  }
}

function updateTargetForm() {
  const tdeeInput = document.getElementById("tdeeInput");
  const proteinInput = document.getElementById("proteinTargetInput");
  const deficitInput = document.getElementById("deficitTargetInput");
  const summary = document.getElementById("targetSummary");

  if (tdeeInput) tdeeInput.value = roundInt(TDEE);
  if (proteinInput) proteinInput.value = roundInt(PROTEIN_TARGET);
  if (deficitInput) deficitInput.value = roundInt(DEFICIT_TARGET);
  if (summary) summary.textContent = `${formatInt(TDEE)} kcal · ${formatInt(PROTEIN_TARGET)}g protein · ${formatInt(DEFICIT_TARGET)} kcal deficit`;
}

function applyConfig(config) {
  TDEE = roundInt(config?.tdee) || 2705;
  PROTEIN_TARGET = roundInt(config?.proteinTarget) || 180;
  DEFICIT_TARGET = roundInt(config?.deficitTarget) || 500;
  updateTargetForm();
}

function updateEntryForm() {
  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");
  const deleteBtn = document.getElementById("deleteBtn");
  const saveBtn = document.getElementById("saveBtn");
  const caloriesCard = calories?.closest(".input-card");
  const proteinCard = protein?.closest(".input-card");
  const isViewingToday = currentDate === getDietDate();
  const form = document.getElementById("today-form");

  if (calories) {
    calories.value = todayEntry ? roundInt(todayEntry.calories) : "";
    calories.placeholder = "";
  }

  if (protein) {
    protein.value = todayEntry ? roundInt(todayEntry.protein) : "";
    protein.placeholder = "";
  }

  if (caloriesCard) {
    const calorieIntakeTarget = Math.max(0, TDEE - DEFICIT_TARGET);
    caloriesCard.dataset.target = `Target ${formatInt(calorieIntakeTarget)} kcal`;
  }

  if (proteinCard) {
    proteinCard.dataset.target = `Target ${formatInt(PROTEIN_TARGET)}g`;
  }

  if (deleteBtn) {
    deleteBtn.hidden = !todayEntry;
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", "Delete this entry");
  }
  if (saveBtn) {
    if (todayEntry) {
      saveBtn.textContent = "Update Entry";
    } else {
      saveBtn.textContent = isViewingToday ? "Commit Today" : "Save Entry";
    }
  }
  if (form) {
    const shouldCollapsePastEntry = Boolean(todayEntry) && !isViewingToday && !isQuickEntryOpen();
    let editToggle = document.getElementById("entryEditToggle");

    if (shouldCollapsePastEntry && !editToggle) {
      editToggle = document.createElement("button");
      editToggle.id = "entryEditToggle";
      editToggle.type = "button";
      editToggle.className = "entry-edit-toggle";
      editToggle.setAttribute("aria-expanded", "false");
      editToggle.textContent = "Edit Entry";
      form.parentNode?.insertBefore(editToggle, form);

      editToggle.addEventListener("click", () => {
        const isExpanded = editToggle.getAttribute("aria-expanded") === "true";
        editToggle.setAttribute("aria-expanded", String(!isExpanded));
        editToggle.textContent = isExpanded ? "Edit Entry" : "Hide Entry Form";
        form.hidden = isExpanded;
      });
    }

    if (editToggle) {
      editToggle.hidden = !shouldCollapsePastEntry;

      if (!shouldCollapsePastEntry) {
        editToggle.setAttribute("aria-expanded", "false");
        editToggle.textContent = "Edit Entry";
      }
    }

    if (shouldCollapsePastEntry) {
      form.hidden = editToggle?.getAttribute("aria-expanded") !== "true";
    } else {
      form.hidden = false;
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
  if (form) form.hidden = false;
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

function openQuickEntryOptimistically() {
  if (currentDate !== getDietDate() || getLastLoggedDate() === currentDate) return;

  didAutoOpenQuickEntry = true;
  didOptimisticQuickEntryOpen = true;
  openQuickEntry();
}

function closeQuickEntry() {
  const form = document.getElementById("today-form");
  if (form && todayEntry && currentDate !== getDietDate()) {
    form.hidden = true;
  }
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
    calories: roundInt(calories),
    protein: roundInt(protein)
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

async function loadConfig() {
  const data = await fetchJson(`${API_BASE}/api/config`);
  applyConfig(data.config);
}

async function saveEntry(calories, protein) {
  setLoading(true);
  setStatus("Saving...");
  const roundedCalories = roundInt(calories);
  const roundedProtein = roundInt(protein);
  const savedDeficit = roundInt(TDEE - roundedCalories);

  try {
    await fetchJson(`${API_BASE}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: currentDate,
        calories: roundedCalories,
        protein: roundedProtein,
        tdee: TDEE
      })
    });

    todayLogged = true;
    rememberLoggedDate(currentDate);
    setStatus(`Saved · ${formatInt(savedDeficit)} kcal`);
    showToast(`Saved · ${formatInt(savedDeficit)} kcal`);
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
    forgetLoggedDate(currentDate);
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

function roundInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function formatInt(value) {
  return roundInt(value).toLocaleString();
}

function getProgressPercent(value, target) {
  const safeTarget = Math.max(roundInt(target), 1);
  return Math.max(0, Math.min(100, Math.round((roundInt(value) / safeTarget) * 100)));
}

function getCalorieResult(calories, tdee = TDEE) {
  const rawDelta = roundInt(tdee - calories);
  const isSurplus = rawDelta < 0;
  const deficit = Math.max(rawDelta, 0);
  const surplus = Math.max(-rawDelta, 0);
  const gap = roundInt(DEFICIT_TARGET - deficit);
  const exceeded = !isSurplus && deficit >= DEFICIT_TARGET;

  return {
    deficit,
    surplus,
    isSurplus,
    gap: Math.max(gap, 0),
    progress: isSurplus ? 100 : exceeded ? 100 : getProgressPercent(deficit, DEFICIT_TARGET),
    celebrated: exceeded,
    tone: isSurplus ? "surplus" : "logged",
    status: isSurplus ? "Surplus" : "Deficit",
    detail: isSurplus
      ? `${formatInt(surplus)} kcal surplus`
      : `${formatInt(deficit)} kcal deficit`
  };
}

function getProteinResult(protein) {
  const roundedProtein = roundInt(protein);
  const gap = Math.max(roundInt(PROTEIN_TARGET - roundedProtein), 0);

  return {
    status: "Protein",
    gap,
    progress: getProgressPercent(roundedProtein, PROTEIN_TARGET),
    celebrated: gap === 0,
    detail: `${formatInt(roundedProtein)}g logged`
  };
}

function renderTrendBars(entries) {
  const weekEntries = entries || [];
  const entryByDate = new Map(weekEntries.map((entry) => [entry.date, entry]));
  const maxCalories = Math.max(
    TDEE,
    ...weekEntries.map((entry) => Math.max(entry.calories || 0, entry.tdee || 0))
  );
  const start = getWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return `
    <div class="trend-bars" aria-label="Weekly calorie trend">
      ${days
        .map((date) => {
          const dateString = formatDate(date);
          const entry = entryByDate.get(dateString);
          const isMissing = !entry;
          const height = entry ? Math.max(18, Math.round(((entry.calories || 0) / maxCalories) * 76)) : 34;
          const isSelected = dateString === currentDate;
          const isFuture = isFutureDate(dateString);
          const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
          const shortDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

          return `
            <button
              type="button"
              class="trend-day ${isSelected ? "selected" : ""} ${isMissing ? "missing" : ""} ${isFuture ? "future" : ""}"
              data-date="${dateString}"
              aria-label="Select ${weekday}, ${shortDate}"
              ${isFuture ? "disabled" : ""}
              ${isSelected ? "aria-current=\"date\"" : ""}
            >
              <div class="trend-bar" style="height:${height}px" title="${dateString}: ${entry ? `${formatInt(entry.calories)} kcal` : "No data"}"></div>
              <span class="trend-weekday">${weekday}</span>
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

function renderSummary(summary) {
  const dailyEl = document.getElementById("daily-result");
  const weeklyEl = document.getElementById("weekly-summary");
  if (!dailyEl || !weeklyEl) return;

  const today = summary.todayEntry;
  const consistency = summary.consistency || getConsistency(summary.entries || []);
  let dailyHtml = "";

  if (today) {
    const entryTdee = today.tdee || TDEE;
    const calorieResult = getCalorieResult(today.calories, entryTdee);
    const proteinResult = getProteinResult(today.protein);
    const roundedCalories = roundInt(today.calories);
    const roundedProtein = roundInt(today.protein);
    const calorieIntakeTarget = Math.max(0, entryTdee - DEFICIT_TARGET);
    const deficitOverTarget = Math.max(roundInt(calorieResult.deficit - DEFICIT_TARGET), 0);
    const deficitSummary = calorieResult.isSurplus
      ? `<span class="metric-note negative">${formatInt(calorieResult.surplus)} kcal surplus</span>`
      : deficitOverTarget > 0
        ? `<span style="color: var(--accent); font-weight: 800;">+${formatInt(deficitOverTarget)} over goal</span>`
        : `<span>Goal ${formatInt(DEFICIT_TARGET)} kcal</span>`;

    dailyHtml = `
      <section class="daily-card ${calorieResult.tone}">
        <div class="daily-card-top">
          <span class="day-label">${getDayLabel()}</span>
          <span class="status-pill logged">Logged</span>
        </div>

        <div class="daily-metrics">
          <div class="daily-metric">
            <span class="metric-label">Calories</span>
            <strong>${formatInt(roundedCalories)}</strong>
            <span>${calorieResult.isSurplus ? deficitSummary : ""}</span>
          </div>
          <div class="daily-metric">
            <span class="metric-label">Protein</span>
            <strong>${formatInt(roundedProtein)}</strong>
            <span>Target ${formatInt(PROTEIN_TARGET)} g</span>
          </div>
          <div class="daily-metric">
            <span class="metric-label">${calorieResult.isSurplus ? "Surplus" : "Deficit"}</span>
            <strong>${formatInt(calorieResult.isSurplus ? calorieResult.surplus : calorieResult.deficit)}</strong>
            <span>${!calorieResult.isSurplus ? deficitSummary : ""}</span>
          </div>
        </div>

        <div class="settlement-lines">
          <div class="settlement-line ${calorieResult.isSurplus ? "surplus" : calorieResult.celebrated ? "celebrated" : "neutral"}">
            <div class="settlement-line-top">
              <strong>${calorieResult.status}</strong>
              <span>${calorieResult.isSurplus
                ? `${formatInt(calorieResult.surplus)} kcal`
                : `${formatInt(calorieResult.deficit)} / ${formatInt(DEFICIT_TARGET)} kcal`}</span>
            </div>
            <div class="settlement-track" aria-hidden="true">
              <span style="width:${calorieResult.progress}%"></span>
            </div>
          </div>
          <div class="settlement-line ${proteinResult.celebrated ? "celebrated" : "neutral"}">
            <div class="settlement-line-top">
              <strong>${proteinResult.status}</strong>
              <span>${formatInt(roundedProtein)} / ${formatInt(PROTEIN_TARGET)}g</span>
            </div>
            <div class="settlement-track" aria-hidden="true">
              <span style="width:${proteinResult.progress}%"></span>
            </div>
          </div>
        </div>
      </section>
    `;
  } else {
    dailyHtml = `
      <section class="daily-card empty">
        <div class="daily-card-top">
          <span class="day-label">${getDayLabel()}</span>
          <span class="status-pill missing">No Entry</span>
        </div>
        <div class="daily-metrics">
          <div class="daily-metric">
            <span class="metric-label">Calories</span>
            <strong>--</strong>
            <span>Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))} kcal</span>
          </div>
          <div class="daily-metric">
            <span class="metric-label">Protein</span>
            <strong>--</strong>
            <span>Target ${formatInt(PROTEIN_TARGET)}g</span>
          </div>
          <div class="daily-metric">
            <span class="metric-label">Deficit</span>
            <strong>--</strong>
            <span>Goal ${formatInt(DEFICIT_TARGET)} kcal</span>
          </div>
        </div>
        <p class="empty-state">Add calories and protein when ready.</p>
      </section>
    `;
  }

  const weekHtml = `
    <section class="card week-card">
      <div class="card-header">
        <h2>This Week</h2>
        <span class="status-pill logged">${summary.count || 0} days</span>
      </div>
      <div class="week-snapshot">
        <div class="metric">
          <span class="metric-label">Avg kcal</span>
          <span class="metric-value">${formatInt(summary.averageCalories || 0)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg protein</span>
          <span class="metric-value">${formatInt(summary.averageProtein || 0)}g</span>
        </div>
        <div class="metric">
          <span class="metric-label">Fat loss</span>
          <span class="metric-value">${formatInt(Number(summary.fatLossKg || 0) * 1000)}g</span>
        </div>
      </div>
      ${renderTrendBars(summary.entries || [])}
      <p class="subtle-text trend-summary"><strong>Weekly Trend</strong><span>${consistency}</span></p>
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

    if (todayEntry) {
      rememberLoggedDate(currentDate);
    } else {
      forgetLoggedDate(currentDate);
    }

    updateEntryForm();
    renderSummary(data.summary);
    setStatus(successMessage || "");

    if (todayEntry && didOptimisticQuickEntryOpen && isQuickEntryOpen()) {
      closeQuickEntry();
      didOptimisticQuickEntryOpen = false;
    }

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

  setLoading(true);
  setStatus("Saving targets...");

  fetchJson(`${API_BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tdee: Math.round(nextTdee),
      proteinTarget: Math.round(nextProteinTarget),
      deficitTarget: Math.round(nextDeficitTarget)
    })
  })
    .then((data) => {
      applyConfig(data.config);
      setStatus("Targets saved");
      showToast("Targets saved");
      return loadWeekSummary("Targets saved");
    })
    .catch((error) => {
      if (error.isAuthError) {
        setStatus("Locked");
        return;
      }

      setStatus("Target save failed");
      alert(error.message || "Target save failed");
    })
    .finally(() => {
      setLoading(false);
    });
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
  openQuickEntryOptimistically();
  setStatus("Unlocking...");
  loadConfig()
    .then(() => loadWeekSummary())
    .catch((error) => {
      if (error.isAuthError) {
        setStatus("Locked");
        return;
      }

      setStatus("Could not load targets");
    });
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
  document.getElementById("weekly-summary")?.addEventListener("click", handleTrendDayClick);
  document.getElementById("deleteBtn")?.addEventListener("click", deleteEntry);
  document.getElementById("closeQuickEntryBtn")?.addEventListener("click", closeQuickEntry);
  document.getElementById("quickEntryBackdrop")?.addEventListener("click", closeQuickEntry);
  document.getElementById("calories")?.addEventListener("input", handleCaloriesInput);
  document.getElementById("protein")?.addEventListener("input", handleProteinInput);

  updateDietDayDisplay();
  updateTargetForm();

  if (getStoredAccessKey()) {
    hideAccessGate();
    openQuickEntryOptimistically();
    loadConfig()
      .then(() => loadWeekSummary())
      .catch((error) => {
        if (error.isAuthError) {
          setStatus("Locked");
          return;
        }

        setStatus("Could not load targets");
      });
  } else {
    showAccessGate();
    setStatus("Locked");
  }
}

document.addEventListener("DOMContentLoaded", initApp);
