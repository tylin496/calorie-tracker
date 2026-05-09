let TDEE = Number(localStorage.getItem("tdee")) || null;
const API_BASE = "https://calorie-tracker-omega-ten.vercel.app";
let todayLogged = false;
let todayEntry = null;
let currentDate = getDietDate();

function getDietDate() {
  const now = new Date();

  if (now.getHours() < 3) {
    now.setDate(now.getDate() - 1);
  }

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map((part) => Number(part));

  const date = new Date(`${value}T12:00:00`);

  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

function parseQuickEntry(value) {
  const cleanedValue = value.trim();

  if (cleanedValue.includes(",")) {
    const [calories, protein] = cleanedValue
      .split(",")
      .map((part) => Number(part.trim()));

    return {
      calories,
      protein
    };
  }

  if (/^\d{7}$/.test(cleanedValue)) {
    return {
      calories: Number(cleanedValue.slice(0, 4)),
      protein: Number(cleanedValue.slice(4))
    };
  }

  return {
    calories: 0,
    protein: 0
  };
}

function formatShortDateRange(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);

  const month = startDate.toLocaleString("en-US", {
    month: "short"
  });

  return `${month} ${startDate.getDate()}–${endDate.getDate()}`;
}

function formatSignedKcal(value) {
  const sign = value >= 0 ? "-" : "+";
  return `${sign}${Math.abs(value)} kcal`;
}

function getDeficitLabel(value) {
  return value >= 0 ? "Deficit" : "Surplus";
}

function getWeekdayLabel(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short"
  });
}

function formatMonthDay(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getDietDayLabel() {
  const isViewingToday = currentDate === getDietDate();
  return `${isViewingToday ? "Today" : "Viewing"} · ${formatMonthDay(currentDate)}`;
}

function updateQuickEntryButton() {
  const quickEntryButton = document.getElementById("quickEntryBtn");

  if (!quickEntryButton) {
    return;
  }

  quickEntryButton.textContent = todayLogged ? "Edit Entry" : "+ Log Entry";
}

function showToast(message) {
  let toast = document.getElementById("toast");

  if (!toast) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="toast" class="toast" hidden></div>`
    );

    toast = document.getElementById("toast");
  }

  toast.textContent = message;
  toast.hidden = false;

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function setStatus(message) {
  const status = document.getElementById("status");

  if (status) {
    status.textContent = message;
  }
}

function updateTDEEDisplay() {
  const tdeeElement = document.getElementById("tdee-display");

  if (tdeeElement) {
    tdeeElement.textContent = `TDEE: ${TDEE} kcal (tap to edit)`;
  }
}

function updateDietDayDisplay() {
  const dietDayElement = document.getElementById("diet-day");

  if (dietDayElement) {
    dietDayElement.textContent = getDietDayLabel();
  }
}

function shiftDietDay(days) {
  const date = new Date(`${currentDate}T12:00:00`);
  date.setDate(date.getDate() + days);

  currentDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  todayLogged = false;
  todayEntry = null;
  updateQuickEntryButton();

  updateDietDayDisplay();
  document.getElementById("calories").value = "";
  document.getElementById("protein").value = "";
  loadWeekSummary(false);
}

function resetDietDay() {
  currentDate = getDietDate();
  todayLogged = false;
  todayEntry = null;
  updateQuickEntryButton();

  updateDietDayDisplay();
  document.getElementById("calories").value = "";
  document.getElementById("protein").value = "";
  loadWeekSummary(false);
}

function editDietDay() {
  resetDietDay();
}

function updateTodayInputs(entry) {
  const caloriesInput = document.getElementById("calories");
  const proteinInput = document.getElementById("protein");

  if (!entry) {
    return;
  }

  if (caloriesInput && entry.calories) {
    caloriesInput.value = entry.calories;
  }

  if (proteinInput && entry.protein) {
    proteinInput.value = entry.protein;
  }
}

function editTDEE() {
  const nextValue = window.prompt("Set your TDEE", TDEE);

  if (nextValue === null) {
    return;
  }

  const parsedValue = Number(nextValue);

  if (!parsedValue) {
    alert("Invalid TDEE");
    return;
  }

  TDEE = parsedValue;
  localStorage.setItem("tdee", TDEE);
  updateTDEEDisplay();
  loadWeekSummary(false);
}

function renderSummary(summary) {
  const summaryElement = document.getElementById("weekly-summary");

  if (!summaryElement) {
    return;
  }

  const isViewingToday = currentDate === getDietDate();

  if (!summary || summary.count === 0) {
    summaryElement.innerHTML = `
      <section class="card today-card">
        <div class="card-header">
          <h2>${isViewingToday ? "Today" : "Selected Day"}</h2>
        </div>
        ${isViewingToday ? "" : `<p class="warning-text">Viewing historical day: ${currentDate}</p>`}
        <p class="empty-state">No entry for this day yet.</p>
      </section>

      <section class="card week-card">
        <div class="card-header">
          <h2>This Week</h2>
        </div>
        <p class="empty-state">No entries yet.</p>
      </section>
    `;
    return;
  }

  const todayEntry = summary.todayEntry;
  const todayDeficit = todayEntry ? (todayEntry.tdee || TDEE) - todayEntry.calories : 0;
  const todayStatus = getDeficitLabel(todayDeficit);
  const compliance = Math.round((summary.count / 7) * 100);
  const averageDailyDeficit = summary.count ? Math.round(summary.totalDeficit / summary.count) : 0;
  const fatProgress = Math.min(Math.round(Math.abs(summary.fatLossKg) * 100), 100);
  const fatProgressLabel = summary.fatLossKg >= 0 ? "Fat loss progress" : "Surplus progress";
  const weekRange = formatShortDateRange(summary.weekStart, summary.weekEnd);
  // const isViewingToday = currentDate === getDietDate();
  const loggedStatus = todayEntry ? "Logged" : "Missing";
  const dailyRows = summary.entries
    .map((entry) => `
      <div class="daily-row">
        <span>${getWeekdayLabel(entry.date)} ${formatMonthDay(entry.date)}</span>
        <span>${entry.calories} kcal</span>
        <span>${entry.protein}g</span>
      </div>
    `)
    .join("");

  const todayHtml = todayEntry
    ? `
      <section class="card today-card">
        <div class="card-header">
          <h2>${isViewingToday ? "Today" : "Selected Day"}</h2>
          <div class="pill-row">
            <span class="status-pill logged">${loggedStatus}</span>
            <span class="status-pill ${todayDeficit >= 0 ? "deficit" : "surplus"}">
              ${todayStatus}
            </span>
          </div>
        </div>

        ${isViewingToday ? "" : `<p class="warning-text">Viewing historical day: ${currentDate}</p>`}

        <div class="metric-grid">
          <div class="metric">
            <span class="metric-label">Calories</span>
            <span class="metric-value">${todayEntry.calories}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Protein</span>
            <span class="metric-value">${todayEntry.protein}g</span>
          </div>
          <div class="metric">
            <span class="metric-label">${todayStatus}</span>
            <span class="metric-value">${formatSignedKcal(todayDeficit)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Fat</span>
            <span class="metric-value">${(todayDeficit / 7700).toFixed(2)}kg</span>
          </div>
        </div>
      </section>
    `
    : `
      <section class="card today-card">
        <div class="card-header">
          <h2>${isViewingToday ? "Today" : "Selected Day"}</h2>
          <span class="status-pill missing">Missing</span>
        </div>
        ${isViewingToday ? "" : `<p class="warning-text">Viewing historical day: ${currentDate}</p>`}
        <p class="empty-state">No entry for this day yet.</p>
      </section>
    `;

  summaryElement.innerHTML = `
    ${todayHtml}

    <section class="card week-card">
      <div class="card-header">
        <h2>This Week</h2>
        <span class="subtle-text">${weekRange}</span>
      </div>

      <div class="progress-row">
        <span>Compliance</span>
        <span>${summary.count} / 7 days · ${compliance}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min(compliance, 100)}%"></div>
      </div>

      <div class="progress-row">
        <span>${fatProgressLabel}</span>
        <span>${Math.abs(summary.fatLossKg).toFixed(2)} / 1.00 kg · ${fatProgress}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${summary.fatLossKg >= 0 ? "deficit-fill" : "surplus-fill"}" style="width: ${fatProgress}%"></div>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <span class="metric-label">Avg kcal</span>
          <span class="metric-value">${summary.averageCalories}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg protein</span>
          <span class="metric-value">${summary.averageProtein}g</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg deficit/day</span>
          <span class="metric-value">${formatSignedKcal(averageDailyDeficit)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Weekly fat</span>
          <span class="metric-value">${summary.fatLossKg.toFixed(2)}kg</span>
        </div>
      </div>

      <div class="daily-list">
        <h3>Logged Days</h3>
        ${dailyRows || `<p class="empty-state">No logged days yet.</p>`}
      </div>
    </section>
  `;
}

async function loadWeekSummary(shouldPromptIfMissing = false) {
  setStatus("Loading weekly summary...");

  try {
    const response = await fetch(`${API_BASE}/api/summary?today=${currentDate}&tdee=${TDEE}`);
    const result = await response.json();

    if (!response.ok) {
      console.error(result);
      setStatus(`Summary failed: ${result.error || response.status}`);
      return;
    }
    const latestEntry = result.summary.entries?.at(-1) || null;

    if (!TDEE && latestEntry?.tdee) {
      TDEE = latestEntry.tdee;
      localStorage.setItem("tdee", TDEE);
      updateTDEEDisplay();
    }

    if (!TDEE) {
      TDEE = 2705;
      updateTDEEDisplay();
    }
    todayLogged = Boolean(result.summary.todayLogged);
    updateQuickEntryButton();
    todayEntry = result.summary.todayEntry || null;
    updateTodayInputs(todayEntry);
    renderSummary(result.summary);
    setStatus("Ready.");

    if (shouldPromptIfMissing && !todayLogged) {
      openQuickEntry();
    }
  } catch (error) {
    console.error(error);
    setStatus("Unable to load summary. Tap Quick Entry.");
  }
}

async function saveEntry(calories, protein) {
  setStatus("Saving...");

  try {
    const response = await fetch(`${API_BASE}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: currentDate,
        calories,
        protein,
        tdee: TDEE
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(result);
      setStatus(`Save failed: ${result.error || response.status}`);
      alert(`Save failed: ${result.error || response.status}`);
      return;
    }

    const deficit = TDEE - calories;
    const fatLoss = deficit / 7700;

    setStatus(result.mode === "updated" ? "Updated today's entry." : "Saved to Notion.");
    todayLogged = true;
    updateQuickEntryButton();

    showToast(
      `${result.mode === "updated" ? "Updated" : "Saved"} ${currentDate} • ${formatSignedKcal(deficit)} • ${fatLoss.toFixed(2)}kg`
    );

    await loadWeekSummary(false);
  } catch (error) {
    console.error(error);
    setStatus(`Network error: ${error.message}`);
    alert(`Network error: ${error.message}`);
  }
}

function openQuickEntry() {
  const modal = document.getElementById("quickEntryModal");
  const modalDate = document.getElementById("modal-date");
  const modalEntry = document.getElementById("modal-entry");
  const caloriesInput = document.getElementById("calories");
  const proteinInput = document.getElementById("protein");

  if (!modal || !modalDate || !modalEntry) {
    const fallback = window.prompt(
      `${currentDate} (CCCCPPP, e.g. 2200180)`,
      caloriesInput?.value && proteinInput?.value
        ? `${caloriesInput.value}${proteinInput.value}`
        : ""
    );

    if (fallback === null) {
      return;
    }

    const { calories, protein } = parseQuickEntry(fallback);

    if (!calories || !protein) {
      alert("Use format: CCCCPPP, e.g. 2200180");
      return;
    }

    saveEntry(calories, protein);
    return;
  }

  modalDate.textContent = currentDate;
  modalEntry.value = caloriesInput?.value && proteinInput?.value
    ? `${caloriesInput.value}${proteinInput.value}`
    : "";
  modal.hidden = false;
  modalEntry.focus();
}

function closeQuickEntry() {
  const modal = document.getElementById("quickEntryModal");

  if (modal) {
    modal.hidden = true;
  }
}

function submitQuickEntry() {
  const modalEntry = document.getElementById("modal-entry");
  const caloriesInput = document.getElementById("calories");
  const proteinInput = document.getElementById("protein");

  const { calories, protein } = parseQuickEntry(modalEntry?.value || "");

  if (!calories || !protein) {
    alert("Use format: CCCCPPP, e.g. 2200180");
    modalEntry?.focus();
    return;
  }

  if (caloriesInput) {
    caloriesInput.value = calories;
  }

  if (proteinInput) {
    proteinInput.value = protein;
  }

  closeQuickEntry();
  saveEntry(calories, protein);
}

const appTitle = document.querySelector("h1");

if (appTitle) {
  appTitle.insertAdjacentHTML(
    "beforebegin",
    `<div class="top-controls"><button id="prevDayBtn" class="chip">‹</button><button id="diet-day" class="chip"></button><button id="nextDayBtn" class="chip">›</button><button id="tdee-display" class="chip"></button></div><p id="status">App loaded. Ready.</p><div class="action-row"><button id="quickEntryBtn" class="primary-action">+ Log Entry</button><button id="refreshSummaryBtn" class="secondary-action">↻</button></div>`
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="top-controls"><button id="prevDayBtn" class="chip">‹</button><button id="diet-day" class="chip"></button><button id="nextDayBtn" class="chip">›</button><button id="tdee-display" class="chip"></button></div><p id="status">App loaded. Ready.</p><div class="action-row"><button id="quickEntryBtn" class="primary-action">+ Log Entry</button><button id="refreshSummaryBtn" class="secondary-action">↻</button></div>`
  );
}

document.body.insertAdjacentHTML(
  "beforeend",
  `
    <div id="quickEntryModal" class="modal-backdrop" hidden>
      <div class="modal-card">
        <h2>Log Entry</h2>
        <p id="modal-date" class="subtle-text"></p>
        <p class="entry-hint">Example: 2200180 = 2200 kcal / 180g protein</p>
        <p class="entry-hint">Use ‹ / › to change the day.</p>
        <input id="modal-entry" type="number" inputmode="numeric" pattern="[0-9]*" maxlength="7" placeholder="2200180" />
        <button id="modalSaveBtn" class="primary-action">Save</button>
        <button id="modalCancelBtn" class="secondary-action">Cancel</button>
      </div>
    </div>
    <div id="toast" class="toast" hidden></div>
  `
);

updateDietDayDisplay();

if (TDEE) {
  updateTDEEDisplay();
}

document.getElementById("tdee-display")?.addEventListener("click", editTDEE);
document.getElementById("diet-day")?.addEventListener("click", editDietDay);
document.getElementById("prevDayBtn")?.addEventListener("click", () => shiftDietDay(-1));
document.getElementById("nextDayBtn")?.addEventListener("click", () => shiftDietDay(1));
document.getElementById("quickEntryBtn")?.addEventListener("click", openQuickEntry);
document.getElementById("refreshSummaryBtn")?.addEventListener("click", () => {
  loadWeekSummary(false);
});

document.getElementById("modalSaveBtn")?.addEventListener("click", submitQuickEntry);
document.getElementById("modalCancelBtn")?.addEventListener("click", closeQuickEntry);
document.getElementById("quickEntryModal")?.addEventListener("click", (event) => {
  if (event.target.id === "quickEntryModal") {
    closeQuickEntry();
  }
});

document.getElementById("modal-entry")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitQuickEntry();
  }
});

const saveButton = document.getElementById("saveBtn");

if (!saveButton) {
  alert("Error: saveBtn not found");
  throw new Error("saveBtn not found");
}

saveButton.addEventListener("click", async () => {
  const calories = Number(document.getElementById("calories").value);
  const protein = Number(document.getElementById("protein").value);

  if (!calories || !protein) {
    setStatus("Please enter calories and protein.");
    alert("Please enter calories and protein.");
    return;
  }

  await saveEntry(calories, protein);
});

loadWeekSummary(true);