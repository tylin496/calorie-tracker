const TDEE = 2856;
const API_BASE = "https://calorie-tracker-tylin.vercel.app";

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

const today = getDietDate();

document.body.insertAdjacentHTML(
  "afterbegin",
  `<p>Diet Day: ${today}</p><p id="status">App loaded. Ready.</p>`
);

const saveButton = document.getElementById("saveBtn");

if (!saveButton) {
  alert("Error: saveBtn not found");
  throw new Error("saveBtn not found");
}

saveButton.addEventListener("click", async () => {
  alert("Save button clicked");
  setStatus("Saving...");

  const calories = Number(
    document.getElementById("calories").value
  );

  const protein = Number(
    document.getElementById("protein").value
  );

  if (!calories || !protein) {
    setStatus("Please enter calories and protein.");
    alert("Please enter calories and protein.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: today,
        calories,
        protein
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

    setStatus("Saved to Notion.");

    alert(
      `Saved to Notion\nDeficit: ${deficit}\nFat: ${fatLoss.toFixed(2)}kg`
    );
  } catch (error) {
    console.error(error);
    setStatus(`Network error: ${error.message}`);
    alert(`Network error: ${error.message}`);
  }
});