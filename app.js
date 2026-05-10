let TDEE = 2705;
let PROTEIN_TARGET = 180;
let DEFICIT_TARGET = 500;
const API_BASE = "https://calorie-tracker-omega-ten.vercel.app";
const ACCESS_KEY_STORAGE_KEY = "calorieTrackerAccessKey";
const LAST_LOGGED_DATE_STORAGE_KEY = "calorieTrackerLastLoggedDate";
const CALENDAR_INITIAL_HISTORY_MONTHS = 6;
const CALENDAR_HISTORY_CHUNK_MONTHS = 3;

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
let didAutoOpenQuickEntry = false;
let celebrationTimer = null;
let calendarVisibleMonth = null;
let calendarHistoryMonths = CALENDAR_INITIAL_HISTORY_MONTHS;
let calendarIsExtending = false;
let latestWeekSummary = null;

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
  const isAtDietToday = currentDate === getDietDate();

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
}

function updateTargetForm() {
  const tdeeInput = document.getElementById("tdeeInput");
  const proteinInput = document.getElementById("proteinTargetInput");
  const deficitInput = document.getElementById("deficitTargetInput");
  const summary = document.getElementById("targetSummary");

  if (tdeeInput) tdeeInput.value = roundInt(TDEE);
  if (proteinInput) proteinInput.value = roundInt(PROTEIN_TARGET);
  if (deficitInput) deficitInput.value = roundInt(DEFICIT_TARGET);
  if (summary) summary.textContent = `TDEE ${formatInt(TDEE)} kcal · Protein ${formatInt(PROTEIN_TARGET)}g · Deficit ${formatInt(DEFICIT_TARGET)} kcal`;
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
  }

  if (protein) {
    protein.value = todayEntry ? roundInt(todayEntry.protein) : "";
  }

  if (caloriesCard) {
    const calorieIntakeTarget = Math.max(0, TDEE - DEFICIT_TARGET);
    caloriesCard.dataset.target = `Target ${formatInt(calorieIntakeTarget)} kcal`;
  }

  if (proteinCard) {
    proteinCard.dataset.target = `Target ${formatInt(PROTEIN_TARGET)}g`;
  }
  const proteinUnit = document.querySelector('[data-unit="protein"]');
  if (proteinUnit) {
    proteinUnit.textContent = "g";
  }

  if (deleteBtn) {
    deleteBtn.hidden = !todayEntry;
    deleteBtn.textContent = "Delete Entry";
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
    const editToggle = document.getElementById("entryEditToggle");
    if (editToggle) {
      editToggle.hidden = true;
      editToggle.setAttribute("aria-expanded", "false");
      editToggle.textContent = "Edit Entry";
    }

    setEntryFormVisible(!todayEntry || isQuickEntryOpen());
  }
}

function setEntryFormVisible(isVisible) {
  const form = document.getElementById("today-form");
  if (!form) return;
  const isQuickEntryOverlayOpen = isQuickEntryOpen();

  if (!isQuickEntryOverlayOpen) {
    form.classList.remove("quick-entry");
  }

  form.hidden = false;
  form.classList.toggle("entry-form-collapsed", !isVisible);
  form.setAttribute("aria-hidden", String(!isVisible));
  form.inert = !isVisible;

  form.querySelectorAll(".input-card, #saveBtn").forEach((element) => {
    element.hidden = false;
  });

  const deleteBtn = document.getElementById("deleteBtn");
  if (deleteBtn) {
    deleteBtn.hidden = !todayEntry;
  }
}

function hideEntryFormWhileLoading() {
  const form = document.getElementById("today-form");
  const editToggle = document.getElementById("entryEditToggle");

  if (form) {
    form.classList.remove("entry-form-collapsed");
    form.removeAttribute("aria-hidden");
    form.inert = false;
    form.hidden = true;
  }

  if (editToggle) {
    editToggle.hidden = true;
    editToggle.setAttribute("aria-expanded", "false");
    editToggle.textContent = "Edit Entry";
  }
}

function toggleEntryEditForm(editToggle) {
  const form = document.getElementById("today-form");
  const isExpanded = editToggle.getAttribute("aria-expanded") === "true";
  const nextExpanded = !isExpanded;

  editToggle.setAttribute("aria-expanded", String(nextExpanded));
  editToggle.textContent = nextExpanded ? "Done" : "Edit Entry";
  if (form) {
    setEntryFormVisible(nextExpanded);
    if (nextExpanded) {
      form.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }
}

function handleEntryEditToggleClick(event) {
  const editToggle = event.target?.closest?.("#entryEditToggle");
  if (!editToggle) return;

  event.preventDefault();
  toggleEntryEditForm(editToggle);
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

function openQuickEntry(focusField = "calories") {
  const form = document.getElementById("today-form");
  if (form) form.hidden = false;
  const backdrop = document.getElementById("quickEntryBackdrop");
  const calories = document.getElementById("calories");
  const protein = document.getElementById("protein");

  if (!form || !calories || !protein) return;

  form.classList.remove("entry-form-collapsed");
  form.setAttribute("aria-hidden", "false");
  form.inert = false;
  form.classList.add("quick-entry");
  document.body.classList.add("quick-entry-open");
  if (backdrop) backdrop.hidden = false;

  if (!todayEntry) {
    calories.value = "";
    protein.value = "";
  }

  setTimeout(() => {
    const focusTarget = focusField === "protein" ? protein : calories;
    focusTarget.focus();
    focusTarget.select();
  }, 80);
}

function closeQuickEntry() {
  const form = document.getElementById("today-form");

  if (form && todayEntry) {
    const editToggle = document.getElementById("entryEditToggle");

    if (editToggle) {
      editToggle.setAttribute("aria-expanded", "false");
      editToggle.textContent = "Edit Entry";
    }

    setEntryFormVisible(false);
  }
  const backdrop = document.getElementById("quickEntryBackdrop");

  if (form) form.classList.remove("quick-entry");
  document.body.classList.remove("quick-entry-open");
  if (backdrop) backdrop.hidden = true;
}

function showCelebration() {
  let celebration = document.getElementById("saveCelebration");

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
        <strong>Logged for today</strong>
        <span>Nice work. Entry saved.</span>
      </div>
    `;
    document.body.appendChild(celebration);
  }

  clearTimeout(celebrationTimer);
  celebration.classList.remove("visible");
  void celebration.offsetWidth;
  celebration.classList.add("visible");

  celebrationTimer = setTimeout(() => {
    celebration.classList.remove("visible");
  }, 2100);
}

function openCalendar() {
  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");
  const editToggle = document.getElementById("entryEditToggle");

  renderCalendar();

  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("calendar-open");
  if (editToggle) editToggle.hidden = true;

  // Double-RAF: first frame shows panel, second frame has stable layout (avoids
  // modal-in CSS transform skewing getBoundingClientRect values)
  const grid = document.getElementById("calendarGrid");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const todayButton = grid?.querySelector(".calendar-day.today");
    const selectedButton = grid?.querySelector(".calendar-day.selected");
    const scrollTarget = todayButton || selectedButton;

    if (scrollTarget) {
      scrollTarget.scrollIntoView({ block: "center" });
    } else {
      grid?.querySelector(`[data-month="${getDietDate().slice(0, 7)}"]`)?.scrollIntoView({ block: "center" });
    }

    updateCalendarMonthLabel(grid);
  }));
}

function closeCalendar() {
  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");
  const editToggle = document.getElementById("entryEditToggle");

  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("calendar-open");
  if (editToggle) {
    editToggle.hidden = !(todayEntry && !isQuickEntryOpen());
  }
}

function openDeleteConfirm() {
  if (!todayEntry) return;

  const panel = document.getElementById("deleteConfirmPanel");
  const backdrop = document.getElementById("deleteConfirmBackdrop");
  const confirmBtn = document.getElementById("confirmDeleteBtn");

  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("delete-confirm-open");
  confirmBtn?.focus();
}

function closeDeleteConfirm() {
  const panel = document.getElementById("deleteConfirmPanel");
  const backdrop = document.getElementById("deleteConfirmBackdrop");

  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("delete-confirm-open");
}

function renderCalendar() {
  const title = document.getElementById("calendarTitle");
  const grid = document.getElementById("calendarGrid");
  const dietTodayString = getDietDate();
  const dietToday = new Date(`${dietTodayString}T12:00:00`);

  if (!title || !grid) return;

  title.textContent = "Select date";
  renderCalendarMonths(grid, dietToday, dietTodayString);

  grid.onscroll = () => {
    extendCalendarIfNeeded(grid);
    updateCalendarMonthLabel(grid);
  };
}

function renderCalendarMonths(grid, dietToday, dietTodayString) {
  grid.innerHTML = getCalendarMonths(dietToday, currentDate, calendarHistoryMonths)
    .map((month) => renderCalendarMonth(month, dietToday, dietTodayString))
    .join("");
}

function getCalendarMonthLabel(monthDate) {
  const month = monthDate.toLocaleDateString("en-US", { month: "long" });
  const year = monthDate.toLocaleDateString("en-US", { year: "numeric" });
  return `<strong>${month}</strong> ${year}`;
}

function updateCalendarMonthLabel(grid) {
  const label = document.getElementById("calendarMonthLabel");
  if (!label) return;
  const sections = [...grid.querySelectorAll(".calendar-month")];
  const containerRect = grid.getBoundingClientRect();
  const referenceY = containerRect.top + containerRect.height * 0.45;
  let current = sections[0];

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= referenceY && rect.bottom >= referenceY) {
      current = section;
      break;
    }

    if (rect.top <= referenceY) current = section;
  }

  if (current) {
    calendarVisibleMonth = current.dataset.month;
    label.innerHTML = getCalendarMonthLabel(new Date(`${calendarVisibleMonth}-01T12:00:00`));
  }
}

function extendCalendarIfNeeded(grid) {
  if (calendarIsExtending || grid.scrollTop > 96) return;

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

function getCalendarMonths(endDate, selectedDateString, historyMonths = CALENDAR_INITIAL_HISTORY_MONTHS) {
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const selectedMonth = getMonthStart(selectedDateString);
  const startMonth = new Date(endMonth);
  startMonth.setMonth(startMonth.getMonth() - historyMonths);

  if (selectedMonth < startMonth) {
    startMonth.setFullYear(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  }

  const months = [];
  const cursor = new Date(startMonth);

  while (cursor <= endMonth) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function renderCalendarMonth(monthDate, dietToday, dietTodayString) {
  const monthTitle = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
  const isDietCurrentMonth = monthDate.getFullYear() === dietToday.getFullYear() && monthDate.getMonth() === dietToday.getMonth();
  const firstDayOffset = (monthDate.getDay() + 6) % 7;
  const firstCell = new Date(monthDate);
  firstCell.setDate(monthDate.getDate() - firstDayOffset);

  const currentMonth = monthDate.getMonth();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + i);

    const dateString = formatDate(date);
    const isOutsideMonth = date.getMonth() !== currentMonth;
    const isSelected = dateString === currentDate;
    const isToday = dateString === dietTodayString;
    const isFuture = date > dietToday;

    if (isOutsideMonth) {
      cells.push('<span class="calendar-day calendar-day-placeholder" aria-hidden="true"></span>');
      continue;
    }

    cells.push(`
      <button
        class="calendar-day ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}"
        type="button"
        data-date="${dateString}"
        ${isFuture ? "disabled" : ""}
      >
        ${date.getDate()}
      </button>
    `);
  }

  return `
    <section class="calendar-month ${isDietCurrentMonth ? "current-calendar-month" : "past-calendar-month"}" data-month="${formatDate(monthDate).slice(0, 7)}" aria-label="${monthTitle}">
      <div class="calendar-grid">${cells.join("")}</div>
    </section>
  `;
}

function handleCalendarDayClick(event) {
  const btn = event.target.closest("[data-date]");
  if (!btn || btn.disabled) return;

  setDietDay(btn.dataset.date);
  closeCalendar();
}

function setDietDay(date) {
  if (!isValidDateString(date) || isFutureDate(date)) return;
  if (date === currentDate) return;

  currentDate = date;
  calendarVisibleMonth = date.slice(0, 7);
  todayLogged = false;
  todayEntry = null;

  updateDietDayDisplay();
  updateTargetForm();
  hideEntryFormWhileLoading();

  document.querySelectorAll('[data-unit="protein"]').forEach((el) => {
    el.textContent = "g";
  });

  renderInitialLoadingState();
  loadWeekSummary();
}

function shiftDietDay(days) {
  const d = new Date(`${currentDate}T12:00:00`);
  d.setDate(d.getDate() + days);

  if (d > new Date(`${getDietDate()}T12:00:00`)) return;

  setDietDay(formatDate(d));
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
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
  let parseOk = true;

  try {
    data = await res.json();
  } catch {
    data = {};
    parseOk = false;
  }

  if (!res.ok) {
    if (res.status === 401 && !didRetry) {
      clearAccessKey();
      showAccessGate("Access key incorrect");
      throw createAuthError("Access key incorrect");
    }

    const message = parseOk && (data.error || data.detail?.message);
    throw new Error(message || `Request failed (${res.status})`);
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
  const shouldCelebrateTodayCommit = !todayEntry && currentDate === DIET_INITIAL_DATE;

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
    triggerSaveReward();
    if (shouldCelebrateTodayCommit) {
      showCelebration();
    }
  } catch (error) {
    setStatus("Save failed");
    alert(error.message || "Save failed");
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
      daily.innerHTML = `
        <section class="daily-card loading-card">
          <div class="loading-state">
            <span class="loading-spinner" aria-hidden="true"></span>
            <span>Loading today…</span>
          </div>
        </section>
      `;
    }

    if (weekly && !weekly.innerHTML.trim()) {
      weekly.innerHTML = `
        <section class="card week-card loading-card">
          <div class="loading-state">
            <span class="loading-spinner" aria-hidden="true"></span>
            <span>Loading week…</span>
          </div>
        </section>
      `;
    }
  }
}

function renderInitialLoadingState() {
  const daily = document.getElementById("daily-result");
  const weekly = document.getElementById("weekly-summary");

  if (daily) {
    daily.innerHTML = `
      <section class="daily-card loading-card">
        <div class="daily-card-top">
          <span class="status-pill logged">Loading</span>
        </div>
        <div class="loading-state">
          <span class="loading-spinner" aria-hidden="true"></span>
          <span>Loading your log…</span>
        </div>
      </section>
    `;
  }

  if (weekly) {
    const weekStart = formatDate(getWeekStart(currentDate));
    const weekEnd = new Date(`${weekStart}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekRangeText = formatDateRange(weekStart, formatDate(weekEnd));

    weekly.innerHTML = `
      <section class="card week-card loading-card">
        <div class="card-header">
          <h2>This Week${weekRangeText ? ` <span>${weekRangeText}</span>` : ""}</h2>
          <div class="card-actions">
            <span class="status-pill logged">Loading</span>
          </div>
        </div>
        <div class="loading-state">
          <span class="loading-spinner" aria-hidden="true"></span>
          <span>Syncing summary…</span>
        </div>
      </section>
    `;
  }
}

function deleteEntry() {
  openDeleteConfirm();
}

async function confirmDeleteEntry() {
  if (!todayEntry) return;

  setLoading(true);
  setStatus("Deleting...");
  closeDeleteConfirm();

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

function getProgressPercent(value, target) {
  const safeTarget = Math.max(roundInt(target), 1);
  return Math.max(0, Math.min(100, Math.round((roundInt(value) / safeTarget) * 100)));
}

function getCalorieResult(calories, tdee = TDEE) {
  const rawDelta = roundInt(tdee - calories);
  const isSurplus = rawDelta < 0;
  const deficit = Math.max(rawDelta, 0);
  const surplus = Math.max(-rawDelta, 0);
  const deficitTolerance = DEFICIT_TARGET * 0.1;
  const exceeded = !isSurplus && deficit >= Math.max(DEFICIT_TARGET - deficitTolerance, 0);
  const isPerfect = !isSurplus && deficit === roundInt(DEFICIT_TARGET);

  return {
    deficit,
    surplus,
    isSurplus,
    isPerfect,
    progress: isSurplus ? 100 : exceeded ? 100 : getProgressPercent(deficit, DEFICIT_TARGET),
    celebrated: exceeded,
    tone: isSurplus ? "surplus" : "logged",
    status: isSurplus ? "Surplus" : "Deficit"
  };
}

function getProteinResult(protein) {
  const roundedProtein = roundInt(protein);
  const gap = Math.max(roundInt(PROTEIN_TARGET - roundedProtein), 0);
  const isPerfect = roundedProtein === roundInt(PROTEIN_TARGET);

  return {
    status: "Protein",
    isPerfect,
    progress: getProgressPercent(roundedProtein, PROTEIN_TARGET),
    celebrated: gap <= (PROTEIN_TARGET * 0.1)
  };
}

function buildWeeklyPlainTextSummary(summary) {
  const entries = summary.entries || [];
  const range = formatDateRange(summary.weekStart, summary.weekEnd);
  const lines = [
    `This Week${range ? ` (${range})` : ""}`,
    `Logged days: ${summary.count || 0}/7`,
    `Avg calories: ${formatInt(summary.averageCalories || 0)} kcal`,
    `Avg protein: ${formatInt(summary.averageProtein || 0)}g`,
    `Total deficit: ${formatInt(summary.totalDeficit || 0)} kcal`,
    `Estimated fat loss: ${formatInt(Number(summary.fatLossKg || 0) * 1000)}g`,
    `Consistency: ${summary.consistency || getConsistency(entries)}`,
    "",
    "Daily entries:"
  ];

  if (!entries.length) {
    lines.push("No entries logged.");
    return lines.join("\n");
  }

  entries.forEach((entry) => {
    const deficit = roundInt((entry.tdee || TDEE) - entry.calories);
    const deficitText = deficit < 0
      ? `+${formatInt(Math.abs(deficit))} kcal surplus`
      : `${formatInt(deficit)} kcal deficit`;

    lines.push(
      `${formatPlainDateLabel(entry.date)}: ${formatInt(entry.calories)} kcal, ${formatInt(entry.protein)}g protein, ${deficitText}`
    );
  });

  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command failed");
  } finally {
    textarea.remove();
  }
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
          const valueLabel = entry ? `${formatInt(entry.calories)} kcal` : "No entry";

          return `
            <button
              type="button"
              class="trend-day ${isSelected ? "selected" : ""} ${isMissing ? "missing" : ""} ${isFuture ? "future" : ""}"
              data-date="${dateString}"
              aria-label="Select ${weekday}, ${shortDate}. ${valueLabel}"
              ${isFuture ? "disabled" : ""}
              ${isSelected ? "aria-current=\"date\"" : ""}
            >
              <span class="trend-value">${valueLabel}</span>
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

async function handleCopyWeeklySummaryClick(event) {
  const button = event.target.closest("[data-copy-week-summary]");
  if (!button || !latestWeekSummary) return;

  try {
    button.disabled = true;
    await copyTextToClipboard(buildWeeklyPlainTextSummary(latestWeekSummary));
    showToast("Weekly summary copied");
  } catch (error) {
    showToast("Copy failed");
  } finally {
    button.disabled = false;
  }
}

function handleDailyMetricClick(event) {
  const metric = event.target.closest("[data-edit-field]");
  if (!metric) return;

  const field = metric.dataset.editField;
  if (field !== "calories" && field !== "protein") return;

  event.preventDefault();
  openQuickEntry(field);
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
  const weeklyPillText = loggedDays >= 7 ? "Full week" : `${loggedDays} days`;
  const weekRangeText = formatDateRange(summary.weekStart, summary.weekEnd);
  latestWeekSummary = summary;
  let dailyHtml = "";

  if (today) {
    const entryTdee = today.tdee || TDEE;
    const calorieResult = getCalorieResult(today.calories, entryTdee);
    const proteinResult = getProteinResult(today.protein);
    const roundedCalories = roundInt(today.calories);
    const roundedProtein = roundInt(today.protein);
    const calorieIntakeTarget = Math.max(0, entryTdee - DEFICIT_TARGET);
    const deficitOverTarget = Math.max(roundInt(calorieResult.deficit - DEFICIT_TARGET), 0);
    const proteinOverTarget = Math.max(roundInt(roundedProtein - PROTEIN_TARGET), 0);
    const doubleHit = deficitOverTarget > 0 && proteinOverTarget > 0;
    const statusPillText = doubleHit ? "Double hit" : "Logged";
    const deficitAlmostThere = calorieResult.celebrated && !calorieResult.isSurplus && deficitOverTarget === 0;
    const deficitPerfectText = isCompactLayout ? "Perfect!" : "Perfect hit!";
    const proteinPerfectText = isCompactLayout ? "Perfect!" : "Perfect protein!";
    const proteinMetricTone = proteinOverTarget > 0 ? "rewarded" : proteinResult.celebrated ? "on-track" : "";
    const deficitMetricTone = calorieResult.isSurplus ? "caution" : deficitOverTarget > 0 ? "rewarded" : calorieResult.celebrated ? "on-track" : "";
    // Responsive metric texts
    const calorieMetricText = isCompactLayout ? `Target ${formatInt(calorieIntakeTarget)}` : `Target ${formatInt(calorieIntakeTarget)} kcal`;
    const proteinAlmostThere = proteinResult.celebrated && roundedProtein < PROTEIN_TARGET;
    const proteinMetricText = proteinResult.isPerfect
      ? proteinPerfectText
      : proteinOverTarget > 0
        ? (isCompactLayout ? `+${formatInt(proteinOverTarget)} over` : `+${formatInt(proteinOverTarget)} over goal`)
        : proteinAlmostThere
          ? "Almost there!"
          : (isCompactLayout ? `Target ${formatInt(PROTEIN_TARGET)}g` : `Target ${formatInt(PROTEIN_TARGET)} g`);
    const deficitMetricText = calorieResult.isSurplus
      ? (isCompactLayout ? `Surplus ${formatInt(calorieResult.surplus)}` : `Surplus ${formatInt(calorieResult.surplus)} kcal`)
      : calorieResult.isPerfect
        ? deficitPerfectText
        : deficitOverTarget > 0
          ? (isCompactLayout ? `+${formatInt(deficitOverTarget)} over` : `+${formatInt(deficitOverTarget)} over goal`)
          : deficitAlmostThere
            ? "Almost there!"
            : (isCompactLayout ? `Target ${formatInt(DEFICIT_TARGET)}` : `Target ${formatInt(DEFICIT_TARGET)} kcal`);

    dailyHtml = `
      <section class="daily-card ${calorieResult.tone} ${doubleHit ? "double-hit" : ""}">
        <div class="daily-card-top">
          <span class="status-pill ${doubleHit ? "double-hit" : "logged"}">${statusPillText}</span>
        </div>

        <div class="daily-metrics">
          <button class="daily-metric metric-button" type="button" data-edit-field="calories" aria-label="Edit calories">
            <span class="metric-label">Calories</span>
            <strong>${formatInt(roundedCalories)}</strong>
            <span>${calorieMetricText}</span>
          </button>
          <button class="daily-metric metric-button ${proteinMetricTone}" type="button" data-edit-field="protein" aria-label="Edit protein">
            <span class="metric-label">Protein</span>
            <strong>${formatInt(roundedProtein)}</strong>
            <span class="metric-note ${proteinOverTarget > 0 || proteinAlmostThere ? "reward" : ""}">${proteinMetricText}</span>
          </button>
          <div class="daily-metric ${deficitMetricTone}" aria-label="Deficit is calculated from calories and TDEE">
            <span class="metric-label">Deficit</span>
            <strong>${calorieResult.isSurplus ? `+${formatInt(calorieResult.surplus)}` : formatInt(calorieResult.deficit)}</strong>
            <span class="metric-note ${calorieResult.isSurplus ? "negative" : deficitOverTarget > 0 || deficitAlmostThere ? "reward" : ""}">${deficitMetricText}</span>
          </div>
        </div>

        <div class="settlement-lines">
          <div class="settlement-line ${calorieResult.isSurplus ? "surplus" : calorieResult.celebrated ? "celebrated" : "neutral"}">
            <div class="settlement-line-top">
              <strong>${calorieResult.status}</strong>
            </div>
            <div class="settlement-track-row">
              <div class="settlement-track" aria-hidden="true">
                <span style="width:${calorieResult.progress}%"></span>
              </div>
              <span class="settlement-progress-value">${calorieResult.isSurplus
                ? `+${formatInt(calorieResult.surplus)} kcal`
                : `${formatInt(calorieResult.deficit)} / ${formatInt(DEFICIT_TARGET)} kcal`}</span>
            </div>
          </div>
          <div class="settlement-line ${proteinResult.celebrated ? "celebrated" : "neutral"}">
            <div class="settlement-line-top">
              <strong>${proteinResult.status}</strong>
            </div>
            <div class="settlement-track-row">
              <div class="settlement-track" aria-hidden="true">
                <span style="width:${proteinResult.progress}%"></span>
              </div>
              <span class="settlement-progress-value">${formatInt(roundedProtein)} / ${formatInt(PROTEIN_TARGET)}g</span>
            </div>
          </div>
        </div>
      </section>
    `;
  } else {
    dailyHtml = `
      <section class="daily-card empty">
        <div class="daily-card-top">
          <span class="status-pill missing">No Entry</span>
        </div>
        <div class="daily-metrics">
          <button class="daily-metric metric-button" type="button" data-edit-field="calories" aria-label="Add calories">
            <span class="metric-label">Calories</span>
            <strong>--</strong>
            <span>${isCompactLayout ? `Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))}` : `Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))} kcal`}</span>
          </button>
          <button class="daily-metric metric-button" type="button" data-edit-field="protein" aria-label="Add protein">
            <span class="metric-label">Protein</span>
            <strong>--</strong>
            <span>${isCompactLayout ? `Target ${formatInt(PROTEIN_TARGET)}g` : `Target ${formatInt(PROTEIN_TARGET)} g`}</span>
          </button>
          <div class="daily-metric">
            <span class="metric-label">Deficit</span>
            <strong>--</strong>
            <span>${isCompactLayout ? `Target ${formatInt(DEFICIT_TARGET)}` : `Target ${formatInt(DEFICIT_TARGET)} kcal`}</span>
          </div>
        </div>
        <p class="empty-state">Add calories and protein when ready.</p>
      </section>
    `;
  }

  const weekHtml = `
    <section class="card week-card">
      <div class="card-header">
        <h2>This Week${weekRangeText ? ` <span>${weekRangeText}</span>` : ""}</h2>
        <div class="card-actions">
          <span class="status-pill logged">${weeklyPillText}</span>
          <button class="secondary-btn copy-summary-btn" type="button" data-copy-week-summary>Copy</button>
        </div>
      </div>
      <div class="week-snapshot">
        <div class="metric">
          <span class="metric-label">Avg Calories</span>
          <span class="metric-value">${formatInt(summary.averageCalories || 0)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg Protein</span>
          <span class="metric-value">${formatInt(summary.averageProtein || 0)}g</span>
        </div>
        <div class="metric">
          <span class="metric-label">Fat Loss</span>
          <span class="metric-value">${formatInt(Number(summary.fatLossKg || 0) * 1000)}g</span>
        </div>
      </div>
      <div class="week-trend-panel">
        <div class="week-trend-header">
          <span>Daily Intake</span>
          <strong class="trend-status ${consistencyTone}">${consistency}</strong>
        </div>
        ${renderTrendBars(summary.entries || [])}
      </div>
    </section>
  `;

  dailyEl.innerHTML = dailyHtml;
  weeklyEl.innerHTML = weekHtml;
}

async function loadWeekSummary(successMessage) {
  const requestedDate = currentDate;

  updateDietDayDisplay();
  setStatus("Loading...");
  setSummaryRefreshing(true);

  try {
    const data = await fetchJson(`${API_BASE}/api/summary?today=${encodeURIComponent(requestedDate)}&tdee=${encodeURIComponent(TDEE)}`);

    if (requestedDate !== currentDate) return;

    todayLogged = Boolean(data.summary.todayLogged);
    todayEntry = data.summary.todayEntry;

    if (todayEntry) {
      rememberLoggedDate(currentDate);
    } else {
      forgetLoggedDate(currentDate);
    }

    updateEntryForm();
    renderSummary(data.summary);
    setSummaryRefreshing(false);
    setStatus(successMessage || "");

    if (!didAutoOpenQuickEntry && currentDate === DIET_INITIAL_DATE && !todayEntry) {
      didAutoOpenQuickEntry = true;
      openQuickEntry();
    }
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
  }
}

function handleProteinInput(event) {
  const protein = event.currentTarget;
  const digits = protein.value.replace(/\D/g, "");

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
  document.getElementById("closeCalendarBtn")?.addEventListener("click", closeCalendar);
  document.getElementById("calendarBackdrop")?.addEventListener("click", closeCalendar);
  document.getElementById("calendarGrid")?.addEventListener("click", handleCalendarDayClick);
  document.getElementById("prevDayBtn")?.addEventListener("click", () => shiftDietDay(-1));
  document.getElementById("nextDayBtn")?.addEventListener("click", () => shiftDietDay(1));
  document.getElementById("weekly-summary")?.addEventListener("click", handleTrendDayClick);
  document.getElementById("weekly-summary")?.addEventListener("click", handleCopyWeeklySummaryClick);
  document.getElementById("daily-result")?.addEventListener("click", handleDailyMetricClick);
  document.getElementById("deleteBtn")?.addEventListener("click", deleteEntry);
  document.getElementById("deleteConfirmBackdrop")?.addEventListener("click", closeDeleteConfirm);
  document.getElementById("cancelDeleteBtn")?.addEventListener("click", closeDeleteConfirm);
  document.getElementById("confirmDeleteBtn")?.addEventListener("click", confirmDeleteEntry);
  document.getElementById("closeQuickEntryBtn")?.addEventListener("click", closeQuickEntry);
  document.getElementById("quickEntryBackdrop")?.addEventListener("click", closeQuickEntry);
  document.getElementById("calories")?.addEventListener("input", handleCaloriesInput);
  document.getElementById("protein")?.addEventListener("input", handleProteinInput);
  document.addEventListener("click", handleEntryEditToggleClick);
  document.addEventListener("keydown", handleGlobalKeydown);

  window.matchMedia?.("(max-width: 620px)")?.addEventListener?.("change", () => {
    if (todayEntry || document.getElementById("daily-result")?.innerHTML) {
      loadWeekSummary();
    }
  });
  updateDietDayDisplay();
  updateTargetForm();
  renderInitialLoadingState();

  if (getStoredAccessKey()) {
    hideAccessGate();
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
