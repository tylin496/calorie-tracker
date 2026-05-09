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
      <h2>Today</h2>
      <p>No entry for today yet.</p>

      <h2>This Week</h2>
      <p>No entries yet.</p>
    `;
    return;
  }

  const todayEntry = summary.todayEntry;
  const todayDeficit = todayEntry ? (todayEntry.tdee || TDEE) - todayEntry.calories : 0;
  const todayStatus = todayDeficit >= 0 ? "DEFICIT" : "SURPLUS";
  const compliance = Math.round((summary.count / 7) * 100);

  const todayHtml = todayEntry
    ? `
      <h2>Today</h2>
      <p>Calories: ${todayEntry.calories} kcal</p>
      <p>Protein: ${todayEntry.protein} g</p>
      <p>${todayStatus}: ${todayDeficit} kcal</p>
      <p>Estimated fat loss: ${(todayDeficit / 7700).toFixed(2)} kg</p>
    `
    : `
      <h2>Today</h2>
      <p>No entry for today yet.</p>
    `;

  summaryElement.innerHTML = `
    ${todayHtml}

    <h2>This Week</h2>
    <p>${summary.weekStart} to ${summary.weekEnd}</p>
    <p>Days logged: ${summary.count} / 7</p>
    <p>Compliance: ${compliance}%</p>
    <p>Average calories: ${summary.averageCalories} kcal</p>
    <p>Average protein: ${summary.averageProtein} g</p>
    <p>Weekly deficit: ${summary.totalDeficit} kcal</p>
    <p>Estimated fat loss: ${summary.fatLossKg.toFixed(2)} kg</p>
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
  const caloriesInput = document.getElementById("calories");
  const proteinInput = document.getElementById("protein");

  const defaultValue =
    caloriesInput?.value && proteinInput?.value
      ? `${caloriesInput.value},${proteinInput.value}`
      : "";

  const entry = window.prompt(
    `${currentDate} (Calories,Protein)`,
    defaultValue
  );

  if (entry === null) {
    caloriesInput?.focus();
    return;
  }

  const [calories, protein] = entry
    .split(",")
    .map((value) => Number(value.trim()));

  if (!calories || !protein) {
    alert("Use format: calories,protein (e.g. 2200,180)");
    caloriesInput?.focus();
    return;
  }

  if (caloriesInput) {
    caloriesInput.value = calories;
  }

  if (proteinInput) {
    proteinInput.value = protein;
  }

  saveEntry(calories, protein);
}

const appTitle = document.querySelector("h1");

if (appTitle) {
  appTitle.insertAdjacentHTML(
    "beforebegin",
    `<p id="diet-day"></p><p id="tdee-display"></p><p id="status">App loaded. Ready.</p><button id="quickEntryBtn">Quick Entry / Edit Day</button><button id="refreshSummaryBtn">Refresh Summary</button>`
  );
} else {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p id="diet-day"></p><p id="tdee-display"></p><p id="status">App loaded. Ready.</p><button id="quickEntryBtn">Quick Entry / Edit Day</button><button id="refreshSummaryBtn">Refresh Summary</button>`
  );
}

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