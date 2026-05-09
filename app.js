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

  setStatus("Daily completed ✓");

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

  const todayCard = today
    ? `
      <section class="card today-card logged">
        <h2>Today</h2>
        <div>Calories: ${today.calories}</div>
        <div>Protein: ${today.protein}g</div>
      </section>
    `
    : `
      <section class="card today-card">
        <h2>Today</h2>
        <p>No entry</p>
      </section>
    `;

  el.innerHTML = `
    ${todayCard}

    <section class="card week-card">
      <h2>Week</h2>
      <div>Avg: ${summary.averageCalories} kcal</div>
      <div>Fat loss: ${summary.fatLossKg.toFixed(2)} kg</div>
    </section>
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