let TDEE = Number(localStorage.getItem("tdee")) || 2705;
const API_BASE = "https://calorie-tracker-omega-ten.vercel.app";
let todayLogged = false;
let todayEntry = null;

function getDietDate() {
  const now = new Date();

  if (now.getHours() < 3) {
    now.setDate(now.getDate() - 1);
  }

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

  const todayHtml = todayEntry
    ? `
      <h2>Today</h2>
      <p>Calories: ${todayEntry.calories} kcal</p>
      <p>Protein: ${todayEntry.protein} g</p>
      <p>TDEE: ${todayEntry.tdee || TDEE} kcal</p>
      <p>Deficit: ${todayDeficit} kcal</p>
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
    <p>Days logged: ${summary.count}</p>
    <p>Average calories: ${summary.averageCalories} kcal</p>
    <p>Average protein: ${summary.averageProtein} g</p>
    <p>Weekly deficit: ${summary.totalDeficit} kcal</p>
    <p>Estimated fat loss: ${summary.fatLossKg.toFixed(2)} kg</p>
  `;
}

async function loadWeekSummary(shouldPromptIfMissing = false) {
  setStatus("Loading weekly summary...");

  try {
    const response = await fetch(`${API_BASE}/api/summary?today=${today}&tdee=${TDEE}`);
    const result = await response.json();

    if (!response.ok) {
      console.error(result);
      setStatus(`Summary failed: ${result.error || response.status}`);
      return;
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
    setStatus(`Summary network error: ${error.message}`);
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
        date: today,
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

  const calories = window.prompt(`Calories for ${today}?`, caloriesInput?.value || "");

  if (calories === null) {
    caloriesInput?.focus();
    return;
  }

  const protein = window.prompt(`Protein for ${today}?`, proteinInput?.value || "");

  if (protein === null) {
    proteinInput?.focus();
    return;
  }

  const caloriesNumber = Number(calories);
  const proteinNumber = Number(protein);

  if (!caloriesNumber || !proteinNumber) {
    alert("Please enter calories and protein.");
    caloriesInput?.focus();
    return;
  }

  if (caloriesInput) {
    caloriesInput.value = caloriesNumber;
  }

  if (proteinInput) {
    proteinInput.value = proteinNumber;
  }

  saveEntry(caloriesNumber, proteinNumber);
}

const today = getDietDate();

document.body.insertAdjacentHTML(
  "afterbegin",
  `<p>Diet Day: ${today}</p><p id="tdee-display"></p><p id="status">App loaded. Ready.</p><button id="quickEntryBtn">Quick Entry / Edit Today</button>`
);

updateTDEEDisplay();

document.getElementById("tdee-display")?.addEventListener("click", editTDEE);
document.getElementById("quickEntryBtn")?.addEventListener("click", openQuickEntry);

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