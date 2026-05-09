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
    dietDayElement.textContent = `Diet Day: ${currentDate} (tap to change)`;
  }
}

function editDietDay() {
  const nextDate = window.prompt("Set Diet Day (YYYY-MM-DD)", currentDate);

  if (nextDate === null) {
    return;
  }

  if (!isValidDateString(nextDate)) {
    alert("Use format: YYYY-MM-DD");
    return;
  }

  currentDate = nextDate;
  todayLogged = false;
  todayEntry = null;

  updateDietDayDisplay();
  document.getElementById("calories").value = "";
  document.getElementById("protein").value = "";
  loadWeekSummary(false);
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

  if (!summary || summary.count === 0) {
    summaryElement.innerHTML = `
      <section class="card today-card">
        <div class="card-header">
          <h2>Today</h2>
        </div>
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
  const weekRange = formatShortDateRange(summary.weekStart, summary.weekEnd);

  const todayHtml = todayEntry
    ? `
      <section class="card today-card">
        <div class="card-header">
          <h2>Today</h2>
          <span class="status-pill ${todayDeficit >= 0 ? "deficit" : "surplus"}">
            ${todayStatus}
          </span>
        </div>

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
          <h2>Today</h2>
        </div>
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
        <span>${summary.count} / 7 days</span>
        <span>${compliance}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${Math.min(compliance, 100)}%"></div>
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
          <span class="metric-label">Weekly deficit</span>
          <span class="metric-value">${formatSignedKcal(summary.totalDeficit)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Fat</span>
          <span class="metric-value">${summary.fatLossKg.toFixed(2)}kg</span>
        </div>
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

    alert(
      `${result.mode === "updated" ? "Updated" : "Saved"}\nDeficit: ${deficit}\nFat: ${fatLoss.toFixed(2)}kg`
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
  const modalCalories = document.getElementById("modal-calories");
  const modalProtein = document.getElementById("modal-protein");
  const caloriesInput = document.getElementById("calories");
  const proteinInput = document.getElementById("protein");

  if (!modal || !modalDate || !modalCalories || !modalProtein) {
    const fallback = window.prompt(
      `${currentDate} (Calories,Protein)`,
      caloriesInput?.value && proteinInput?.value
        ? `${caloriesInput.value},${proteinInput.value}`
        : ""
    );

    if (fallback === null) {
      return;
    }

    const [calories, protein] = fallback
      .split(",")
      .map((value) => Number(value.trim()));

    if (!calories || !protein) {
      alert("Use format: calories,protein (e.g. 2200,180)");
      return;
    }

    saveEntry(calories, protein);
    return;
  }

  modalDate.textContent = currentDate;
  modalCalories.value = caloriesInput?.value || "";
  modalProtein.value = proteinInput?.value || "";
  modal.hidden = false;
  modalCalories.focus();
}

function closeQuickEntry() {
  const modal = document.getElementById("quickEntryModal");

  if (modal) {
    modal.hidden = true;
  }
}

function submitQuickEntry() {
  const modalCalories = document.getElementById("modal-calories");
  const modalProtein = document.getElementById("modal-protein");
  const caloriesInput = document.getElementById("calories");
  const proteinInput = document.getElementById("protein");

  const calories = Number(modalCalories?.value);
  const protein = Number(modalProtein?.value);

  if (!calories || !protein) {
    alert("Please enter calories and protein.");
    modalCalories?.focus();
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
    `<div class="top-controls"><button id="diet-day" class="chip"></button><button id="tdee-display" class="chip"></button></div><p id="status">App loaded. Ready.</p><div class="action-row"><button id="quickEntryBtn" class="primary-action">+ Log / Edit Day</button><button id="refreshSummaryBtn" class="secondary-action">↻</button></div>`
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="top-controls"><button id="diet-day" class="chip"></button><button id="tdee-display" class="chip"></button></div><p id="status">App loaded. Ready.</p><div class="action-row"><button id="quickEntryBtn" class="primary-action">+ Log / Edit Day</button><button id="refreshSummaryBtn" class="secondary-action">↻</button></div>`
  );
}

document.body.insertAdjacentHTML(
  "beforeend",
  `
    <div id="quickEntryModal" class="modal-backdrop" hidden>
      <div class="modal-card">
        <h2>Log Day</h2>
        <p id="modal-date" class="subtle-text"></p>
        <input id="modal-calories" type="number" inputmode="numeric" placeholder="Calories" />
        <input id="modal-protein" type="number" inputmode="numeric" placeholder="Protein" />
        <button id="modalSaveBtn" class="primary-action">Save</button>
        <button id="modalCancelBtn" class="secondary-action">Cancel</button>
      </div>
    </div>
  `
);

updateDietDayDisplay();

if (TDEE) {
  updateTDEEDisplay();
}

document.getElementById("tdee-display")?.addEventListener("click", editTDEE);
document.getElementById("diet-day")?.addEventListener("click", editDietDay);
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

document.getElementById("modal-protein")?.addEventListener("keydown", (event) => {
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