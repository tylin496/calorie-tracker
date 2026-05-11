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
  toast.classList.remove("visible");
  void toast.offsetWidth;
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
  if (summary) summary.textContent = `TDEE ${formatInt(TDEE)} kcal · Protein ${formatInt(PROTEIN_TARGET)} g · Deficit ${formatInt(DEFICIT_TARGET)} kcal`;
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

  if (caloriesCard) {
    const calorieIntakeTarget = Math.max(0, TDEE - DEFICIT_TARGET);
    caloriesCard.dataset.target = `Target ${formatInt(calorieIntakeTarget)} kcal`;
  }

  if (proteinCard) {
    proteinCard.dataset.target = `Target ${formatInt(PROTEIN_TARGET)} g`;
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
    const editToggle = document.getElementById("entryEditToggle");
    if (editToggle) {
      editToggle.hidden = true;
      editToggle.setAttribute("aria-expanded", "false");
      editToggle.textContent = "Edit entry";
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
    editToggle.textContent = "Edit entry";
  }
}

function toggleEntryEditForm(editToggle) {
  const form = document.getElementById("today-form");
  const isExpanded = editToggle.getAttribute("aria-expanded") === "true";
  const nextExpanded = !isExpanded;

  editToggle.setAttribute("aria-expanded", String(nextExpanded));
  editToggle.textContent = nextExpanded ? "Done" : "Edit entry";
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

function isCalendarOpen() {
  return document.body.classList.contains("calendar-open");
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
  form.classList.toggle("compact-entry-fields", window.matchMedia?.("(max-width: 620px)")?.matches ?? false);
  document.body.classList.add("quick-entry-open");
  if (backdrop) backdrop.hidden = false;

  if (!todayEntry) {
    calories.value = "";
    protein.value = "";
  }

  // Must focus synchronously inside the tap event — any async delay (setTimeout)
  // breaks iOS Safari's gesture chain and the keyboard never appears.
  const focusTarget = focusField === "protein" ? protein : calories;
  focusTarget.focus();
  focusTarget.select();
}

function closeQuickEntry() {
  const form = document.getElementById("today-form");

  if (form && todayEntry) {
    const editToggle = document.getElementById("entryEditToggle");

    if (editToggle) {
      editToggle.setAttribute("aria-expanded", "false");
      editToggle.textContent = "Edit entry";
    }

    setEntryFormVisible(false);
  }
  const backdrop = document.getElementById("quickEntryBackdrop");

  if (form) {
    form.classList.remove("quick-entry");
    form.classList.toggle("compact-entry-fields", window.matchMedia?.("(max-width: 620px)")?.matches ?? false);
  }
  document.body.classList.remove("quick-entry-open");
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
  const panel = document.getElementById("calendarPanel");
  const backdrop = document.getElementById("calendarBackdrop");
  const editToggle = document.getElementById("entryEditToggle");
  const dietTodayString = getDietDate();

  renderCalendar();

  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("calendar-open");
  if (editToggle) editToggle.hidden = true;

  // Double-RAF: first frame shows panel, second frame has stable layout (avoids
  // modal-in CSS transform skewing getBoundingClientRect values)
  const grid = document.getElementById("calendarGrid");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const todayButton = grid?.querySelector(`.calendar-day.today`);
    const selectedButton = grid?.querySelector(`.calendar-day.selected`);
    const scrollTarget = todayButton || selectedButton;

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
  const cells = [];

  // Start from Monday of the week containing (calendarHistoryMonths ago)
  const historyAnchor = new Date(dietToday.getFullYear(), dietToday.getMonth() - calendarHistoryMonths, 1);
  const anchorOffset = (historyAnchor.getDay() + 6) % 7; // Mon=0
  const startDate = new Date(historyAnchor);
  startDate.setDate(historyAnchor.getDate() - anchorOffset);

  // If the selected date is before our start, extend back to include it
  const selectedAnchor = new Date(`${currentDate}T12:00:00`);
  if (selectedAnchor < startDate) {
    const selOffset = (selectedAnchor.getDay() + 6) % 7;
    startDate.setTime(selectedAnchor.getTime());
    startDate.setDate(selectedAnchor.getDate() - selOffset);
  }

  // End at Sunday of (current week + 4 more weeks) — hard bottom, nothing to scroll into
  const todayOffset = (dietToday.getDay() + 6) % 7; // Mon=0
  const endDate = new Date(dietToday);
  endDate.setDate(dietToday.getDate() + (6 - todayOffset) + 28);

  const cursor = new Date(startDate);
  let isFirst = true;

  while (cursor <= endDate) {
    // Mark first cell and every calendar month's 1st for label tracking
    const isMonthMarker = isFirst || cursor.getDate() === 1;
    isFirst = false;
    cells.push(renderCalendarDay(cursor, dietToday, dietTodayString, isMonthMarker ? "month-start" : ""));
    cursor.setDate(cursor.getDate() + 1);
  }

  grid.innerHTML = `<div class="calendar-grid">${cells.join("")}</div>`;
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


function renderCalendarDay(date, dietToday, dietTodayString, extraClass = "") {
  const dateString = formatDate(date);
  const isSelected = dateString === currentDate;
  const isToday = dateString === dietTodayString;
  const isFuture = date > dietToday;
  const isMonthStart = extraClass === "month-start";

  const isCurrentMonth = date.getFullYear() === dietToday.getFullYear() && date.getMonth() === dietToday.getMonth();
  const isFutureMonth = date.getFullYear() > dietToday.getFullYear() ||
    (date.getFullYear() === dietToday.getFullYear() && date.getMonth() > dietToday.getMonth());
  const monthClass = isCurrentMonth ? "current-calendar-month" : isFutureMonth ? "future-calendar-month" : "past-calendar-month";

  const classes = ["calendar-day", monthClass, extraClass, isSelected ? "selected" : "", isToday ? "today" : ""]
    .filter(Boolean).join(" ");

  return `
    <button
      class="${classes}"
      type="button"
      data-date="${dateString}"
      ${isMonthStart ? `data-month="${dateString.slice(0, 7)}"` : ""}
      ${isFuture ? "disabled" : ""}
    >
      ${date.getDate()}
    </button>
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
        proteinTarget: PROTEIN_TARGET
      })
    });

    todayLogged = true;
    rememberLoggedDate(currentDate);
    setStatus("Saved");
    closeQuickEntry();
    await loadWeekSummary("Saved");
    triggerSaveReward();
    const savedDeficitTarget = Math.max(0, roundInt(TDEE - calorieTarget));
    const didDoubleHit = savedDeficit > savedDeficitTarget && roundedProtein > PROTEIN_TARGET;
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
          <h2 class="daily-card-heading">${currentDate === getDietDate() ? "Today" : "This Day"}</h2>
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
    const weekRangeText = formatDateRange(weekStart, formatDate(weekEnd)).replace(/, \d{4}/g, "");
    weekly.innerHTML = `
      <section class="card week-card loading-card">
        <div class="card-header">
          <h2>This Week${weekRangeText ? ` <span>${weekRangeText}</span>` : ""}</h2>
          <div class="card-actions">
            ${getCopySummaryButtonHtml(true)}
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" focusable="false">
          <rect x="9" y="3.5" width="9.5" height="12.5" rx="2.4"/>
          <rect x="5.5" y="8" width="9.5" height="12.5" rx="2.4"/>
        </svg>
      </span>
      <span class="check-icon" aria-hidden="true">✓</span>
    </button>
  `;
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
    await loadWeekSummary("Deleted");
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
    progress: isSurplus ? getProgressPercent(surplus, roundedDeficitTarget) : exceeded ? 100 : getProgressPercent(deficit, roundedDeficitTarget),
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
    ? `Targets: TDEE/cal/protein ${uniqueTargets[0]}`
    : "Targets: vary by day";
  const lines = [
    `Calorie tracker context (${range})`,
    targetLine,
    `Week: ${summary.count || 0}/7 days, ${summary.consistency || getConsistency(entries)}`,
    `Avg: ${formatInt(summary.averageCalories || 0)} kcal, ${formatInt(summary.averageProtein || 0)}g protein`,
    `Total: ${formatInt(summary.totalDeficit || 0)} kcal deficit, est fat ${formatInt(Number(summary.fatLossKg || 0) * 1000)}g`,
    "",
    "Daily: date | kcal | protein | deficit"
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
      ? ` | target ${formatInt(calorieTarget)} kcal/${formatInt(proteinTarget)}g`
      : "";

    lines.push(
      `${formatPlainDateLabel(entry.date)} | ${formatInt(entry.calories)} | ${formatInt(entry.protein)}g | ${deficitText}${targetsText}`
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

  try {
    button.disabled = true;
    button.classList.remove("copied");
    button.classList.add("copying");
    await copyTextToClipboard(buildWeeklyPlainTextSummary(latestWeekSummary));
    button.classList.remove("copying");
    button.classList.add("copied");
    button.setAttribute("aria-label", "Weekly summary copied");
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
    const doubleHit = deficitOverTarget > 0 && proteinOverTarget > 0;
    const statusPillText = doubleHit ? "Double hit" : "Logged";
    const deficitAlmostThere = calorieResult.celebrated && !calorieResult.isSurplus && deficitOverTarget === 0;
    const deficitPerfectText = "Perfect!";
    const proteinPerfectText = "Perfect!";
    const proteinMetricTone = proteinOverTarget > 0 ? "rewarded" : proteinResult.celebrated ? "on-track" : "";
    const deficitMetricTone = calorieResult.isSurplus ? "caution" : deficitOverTarget > 0 ? "rewarded" : calorieResult.celebrated ? "on-track" : "";
    // Responsive metric texts
    const calorieMetricText = isCompactLayout ? `Target ${formatInt(calorieIntakeTarget)}` : `Target ${formatInt(calorieIntakeTarget)} kcal`;
    const proteinAlmostThere = proteinResult.celebrated && roundedProtein < entryProteinTarget;
    const proteinMetricText = proteinResult.isPerfect
      ? proteinPerfectText
      : proteinOverTarget > 0
        ? `+${formatInt(proteinOverTarget)} over`
        : proteinAlmostThere
          ? "Almost there!"
          : (isCompactLayout ? `Target ${formatInt(entryProteinTarget)} g` : `Target ${formatInt(entryProteinTarget)} g`);
    const deficitMetricText = calorieResult.isSurplus
      ? (isCompactLayout ? `Surplus ${formatInt(calorieResult.surplus)}` : `Surplus ${formatInt(calorieResult.surplus)} kcal`)
      : calorieResult.isPerfect
        ? deficitPerfectText
        : deficitOverTarget > 0
          ? `+${formatInt(deficitOverTarget)} over`
          : deficitAlmostThere
            ? "Almost there!"
            : (isCompactLayout ? `Target ${formatInt(entryDeficitTarget)}` : `Target ${formatInt(entryDeficitTarget)} kcal`);

    dailyHtml = `
      <section class="daily-card ${calorieResult.tone} ${doubleHit ? "double-hit" : ""}">
        <div class="daily-card-top">
          <h2 class="daily-card-heading">${dailyHeadingText}</h2>
          <span class="status-pill ${doubleHit ? "double-hit" : "logged"}">${statusPillText}</span>
        </div>

        <div class="daily-metrics">
          <button class="daily-metric metric-button" type="button" data-edit-field="calories" aria-label="Edit calories">
            <span class="metric-label">Calories</span>
            <strong>${formatInt(roundedCalories)} <small>kcal</small></strong>
            <span>${calorieMetricText}</span>
          </button>
          <button class="daily-metric metric-button ${proteinMetricTone}" type="button" data-edit-field="protein" aria-label="Edit protein">
            <span class="metric-label">Protein</span>
            <strong>${formatInt(roundedProtein)} <small>g</small></strong>
            <span class="metric-note ${proteinOverTarget > 0 || proteinAlmostThere ? "reward" : ""}">${proteinMetricText}</span>
          </button>
          <div class="daily-metric ${deficitMetricTone}" aria-label="Deficit is calculated from calories and TDEE">
            <span class="metric-label">Deficit</span>
            <strong>${calorieResult.isSurplus ? `+${formatInt(calorieResult.surplus)}` : formatInt(calorieResult.deficit)} <small>kcal</small></strong>
            <span class="metric-note ${calorieResult.isSurplus ? "negative" : deficitOverTarget > 0 || deficitAlmostThere ? "reward" : ""}">${deficitMetricText}</span>
          </div>
        </div>

        <div class="settlement-lines">
          <div class="settlement-line ${calorieResult.isSurplus ? "surplus" : calorieResult.celebrated ? "celebrated" : "neutral"}">
            <div class="settlement-line-top">
              <strong>${calorieResult.status}</strong>
              <span class="settlement-progress-value">${calorieResult.isSurplus
                ? `+${formatInt(calorieResult.surplus)} kcal`
                : `${formatInt(calorieResult.deficit)} / ${formatInt(entryDeficitTarget)} kcal`}</span>
            </div>
            <div class="settlement-track-row">
              <div class="settlement-track" aria-hidden="true">
                <span style="width:${calorieResult.progress}%"></span>
              </div>
            </div>
          </div>
          <div class="settlement-line ${proteinResult.celebrated ? "celebrated" : "neutral"}">
            <div class="settlement-line-top">
              <strong>${proteinResult.status}</strong>
              <span class="settlement-progress-value">${formatInt(roundedProtein)} / ${formatInt(entryProteinTarget)} g</span>
            </div>
            <div class="settlement-track-row">
              <div class="settlement-track" aria-hidden="true">
                <span style="width:${proteinResult.progress}%"></span>
              </div>
            </div>
          </div>
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
          <button class="daily-metric metric-button" type="button" data-edit-field="calories" aria-label="Add calories">
            <span class="metric-label">Calories</span>
            <strong class="metric-placeholder">--</strong>
            <span>${isCompactLayout ? `Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))}` : `Target ${formatInt(Math.max(0, TDEE - DEFICIT_TARGET))} kcal`}</span>
          </button>
          <button class="daily-metric metric-button" type="button" data-edit-field="protein" aria-label="Add protein">
            <span class="metric-label">Protein</span>
            <strong class="metric-placeholder">--</strong>
            <span>${isCompactLayout ? `Target ${formatInt(PROTEIN_TARGET)} g` : `Target ${formatInt(PROTEIN_TARGET)} g`}</span>
          </button>
          <div class="daily-metric">
            <span class="metric-label">Deficit</span>
            <strong class="metric-placeholder">--</strong>
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
        <h2>This Week${getCopySummaryButtonHtml()}</h2>
        <div class="card-actions">
          <span class="status-pill logged">${weeklyPillText}</span>
        </div>
      </div>
      <div class="week-snapshot">
        <div class="metric">
          <span class="metric-label">Avg calories</span>
          <span class="metric-value">${formatInt(summary.averageCalories || 0)} <small>kcal</small></span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg protein</span>
          <span class="metric-value">${formatInt(summary.averageProtein || 0)} <small>g</small></span>
        </div>
        <div class="metric">
          <span class="metric-label">Fat loss</span>
          <span class="metric-value">${formatInt(Number(summary.fatLossKg || 0) * 1000)} <small>g</small></span>
        </div>
      </div>
      <div class="week-trend-panel">
        <div class="week-trend-header">
          <span>Daily intake</span>
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

    if (!didAutoOpenQuickEntry && currentDate === DIET_INITIAL_DATE && !todayEntry && !isCalendarOpen()) {
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
      return loadWeekSummary("Targets saved");
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

function handleAccessSubmit(event) {
  event.preventDefault();

  const input = document.getElementById("accessKeyInput");
  const accessKey = input?.value.trim();

  if (!accessKey) {
    showAccessGate("Access key required");
    return;
  }

  clearAccessKey();
  localStorage.setItem(ACCESS_KEY_STORAGE_KEY, accessKey);
  hideAccessGate();
  setStatus("Unlocking...");
  loadConfig()
    .then(() => loadWeekSummary())
    .catch((error) => {
      clearAccessKey();
      setStatus("Locked");
      showAccessGate(error.isAuthError ? "Access key incorrect" : "Could not unlock. Try again.");
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

  window.matchMedia?.("(max-width: 620px)")?.addEventListener?.("change", (event) => {
    document.getElementById("today-form")?.classList.toggle("compact-entry-fields", event.matches);
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
        clearAccessKey();
        setStatus("Locked");
        showAccessGate(error.isAuthError ? "Access key incorrect" : "Could not unlock. Try again.");
      });
  } else {
    showAccessGate();
    setStatus("Locked");
  }
}

document.addEventListener("DOMContentLoaded", initApp);
