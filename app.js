const TDEE = 2856;
const API_BASE = "https://calorie-tracker-68955s4cu-tylin.vercel.app";

function getDietDate() {
  const now = new Date();

  if (now.getHours() < 3) {
    now.setDate(now.getDate() - 1);
  }

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const today = getDietDate();

document.body.insertAdjacentHTML(
  "afterbegin",
  `<p>Diet Day: ${today}</p>`
);

document
  .getElementById("saveBtn")
  .addEventListener("click", async () => {
    alert("Save button clicked");
    const calories = Number(
      document.getElementById("calories").value
    );

    const protein = Number(
      document.getElementById("protein").value
    );

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

    if (!response.ok) {
      alert("Save failed");
      return;
    }

    const deficit = TDEE - calories;
    const fatLoss = deficit / 7700;

    alert(
      `Saved to Notion\nDeficit: ${deficit}\nFat: ${fatLoss.toFixed(2)}kg`
    );
  });