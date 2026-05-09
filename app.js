let TDEE = Number(localStorage.getItem("tdee")) || 2705;
const API_BASE = "https://calorie-tracker-omega-ten.vercel.app";

let todayLogged = false;
let todayEntry = null;
let currentDate = getDietDate();

/* -----------------------------
   DATE SYSTEM
----------------------------- */

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

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFutureDate(dateString) {
  return new Date(`${dateString}T12:00:00`) > new Date(`${getTodayDate()}T12:00:00`);
}

/* -----------------------------
   STATE MODEL
----------------------------- */

function getDayState() {
  if (todayLogged && todayEntry) return "committed";
  if (todayLogged) return "logged";
  return "draft";
}

/* -----------------------------
   UI HELPERS
----------------------------- */

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function updateQuickEntryButton() {
  const btn = document.getElementById("quickEntryBtn");
  if (!btn) return;

  btn.textContent = todayLogged ? "Edit Entry" : "Commit Entry";
}

/* -----------------------------
   DATE CONTROL (UX CLEAN)
----------------------------- */

function editDietDay() {
  const input = document.createElement("input");
  input.type = "date";
  input.max = getTodayDate();
  input.value = currentDate;

  input.style.position = "fixed";
  input.style.opacity = "0";

  document.body.appendChild(input);

  input.addEventListener("change", () => {
    const value = input.value;

    if (isValidDateString(value) && !isFutureDate(value)) {
      setDietDay(value);
    } else {
      alert("Invalid or future date not allowed");
    }

    document.body.removeChild(input);
  });

  input.showPicker?.();
  input.click();
}

function setDietDay(date) {
  currentDate = date;
  todayLogged = false;
  todayEntry = null;

  updateQuickEntryButton();
  updateDietDayDisplay();
  loadWeekSummary(false);
}

function shiftDietDay(days) {
  const d = new Date(`${currentDate}T12:00:00`);
  d.setDate(d.getDate() + days);

  if (d > new Date(`${getTodayDate()}T12:00:00`)) return;

  setDietDay(formatDate(d));
}

/* -----------------------------
   SAVE / DELETE (CORE UX)
----------------------------- */

async function saveEntry(calories, protein) {
  setStatus("Saving...");

  const res = await fetch(`${API_BASE}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: currentDate,
      calories,
      protein,
      tdee: TDEE
    })
  });

  const result = await res.json();

  if (!res.ok) {
    setStatus("Save failed");
    alert("Save failed");
    return;
  }

  todayLogged = true;

  setStatus(`Daily completed ✓ · ${TDEE - calories} kcal`);

  const card = document.querySelector(".today-card");
  if (card) {
    card.classList.add("logged");
    setTimeout(() => card.classList.remove("logged"), 600);
  }

  showToast(`Saved • ${TDEE - calories} kcal`);

  await loadWeekSummary(false);
}

async function deleteEntry() {
  if (!confirm("Delete this entry?")) return;

  setStatus("Deleting...");

  await fetch(`${API_BASE}/api/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: currentDate })
  });

  todayLogged = false;
  todayEntry = null;

  document.getElementById("calories").value = "";
  document.getElementById("protein").value = "";

  setStatus("Deleted");

  await loadWeekSummary(false);
}

/* -----------------------------
   SUMMARY RENDER (SIMPLIFIED UX)
----------------------------- */

function renderSummary(summary) {
  const el = document.getElementById("weekly-summary");
  if (!el) return;

  const today = summary.todayEntry;
  const isViewingToday = currentDate === getDietDate();

  let todayHtml = "";

  if (today) {
    const todayDeficit = TDEE - today.calories;
    const statusLabel = todayDeficit >= 0 ? "On track" : "Off track";
    const insightLabel =
      todayDeficit >= 0
        ? "Good control today"
        : "Over target today";

    const todayDeficit = TDEE - today.calories;
    const todayStatus = todayDeficit >= 0 ? "deficit" : "surplus";
    const loggedStatus = "Logged";

    todayHtml = `
      <section class="card today-card logged">
        <div class="card-header">
          <h2>${isViewingToday ? "Today" : "Selected Day"}</h2>

          <div class="pill-row">
            <span class="status-pill logged">${loggedStatus}</span>
            <span class="status-pill ${todayStatus}">
              ${todayStatus}
            </span>
          </div>
        </div>

        ${isViewingToday ? "" : `<p class="warning-text">Viewing historical day: ${currentDate}</p>`}

        <div class="metric-grid">
          <div class="metric">
            <span class="metric-label">Calories</span>
            <span class="metric-value">${today.calories}</span>
          </div>

          <div class="metric">
            <span class="metric-label">Protein</span>
            <span class="metric-value">${today.protein}g</span>
          </div>

          <div class="metric">
            <span class="metric-label">Deficit</span>
            <span class="metric-value">${todayDeficit >= 0 ? "-" : "+"}${Math.abs(todayDeficit)} kcal</span>
          </div>
        </div>
        <div class="subtle-text" style="margin-top:10px;">
          ${statusLabel} · ${insightLabel}
        </div>
      </section>
    `;
  } else {
    todayHtml = `
      <section class="card today-card">
        <div class="card-header">
          <h2>${isViewingToday ? "Today" : "Selected Day"}</h2>
          <span class="status-pill missing">Missing</span>
        </div>

        ${isViewingToday ? "" : `<p class="warning-text">Viewing historical day: ${currentDate}</p>`}

        <p class="empty-state">No entry for this day yet.</p>
      </section>
    `;
  }

  const weekHtml = `
    <section class="card week-card">
      <div class="card-header">
        <h2>This Week</h2>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <span class="metric-label">Avg kcal</span>
          <span class="metric-value">${summary.averageCalories}</span>
        </div>

        <div class="metric">
          <span class="metric-label">Fat loss</span>
          <span class="metric-value">${summary.fatLossKg.toFixed(2)} kg</span>
        </div>
      </div>

      <p class="subtle-text">Weekly pattern: ${summary.consistency || "—"}</p>
    </section>
  `;

  el.innerHTML = `
    ${todayHtml}
    ${weekHtml}
  `;
}

/* -----------------------------
   LOAD DATA
----------------------------- */

async function loadWeekSummary() {
  const res = await fetch(`${API_BASE}/api/summary?today=${currentDate}&tdee=${TDEE}`);
  const data = await res.json();

  todayLogged = !!data.summary.todayLogged;
  todayEntry = data.summary.todayEntry;

  updateQuickEntryButton();
  renderSummary(data.summary);
}

/* -----------------------------
   INIT
----------------------------- */

document.getElementById("diet-day")?.addEventListener("click", editDietDay);
document.getElementById("prevDayBtn")?.addEventListener("click", () => shiftDietDay(-1));
document.getElementById("nextDayBtn")?.addEventListener("click", () => shiftDietDay(1));

document.getElementById("quickEntryBtn")?.addEventListener("click", openQuickEntry);

function openQuickEntry() {
  const c = document.getElementById("calories").value;
  const p = document.getElementById("protein").value;

  if (!c || !p) return alert("Fill both");

  saveEntry(Number(c), Number(p));
}

/* boot */
loadWeekSummary();