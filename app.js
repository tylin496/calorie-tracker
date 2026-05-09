const TDEE = 2856;


function getDietDate() {

  const now = new Date();

  if (now.getHours() < 3) {
    now.setDate(
      now.getDate() - 1
    );
  }

  return now
    .toISOString()
    .slice(0, 10);

}


const today = getDietDate();


document.body.insertAdjacentHTML(
  "afterbegin",
  `<p>Diet Day: ${today}</p>`
);


document
  .getElementById("saveBtn")
  .addEventListener("click", () => {

    const calories = Number(
      document.getElementById("calories").value
    );

    const protein = Number(
      document.getElementById("protein").value
    );

    const deficit =
      TDEE - calories;

    const fatLoss =
      deficit / 7700;

    console.log({
      date: today,
      calories,
      protein,
      deficit,
      fatLoss
    });

    alert(
      `saved\nDeficit: ${deficit}\nFat: ${fatLoss.toFixed(2)}kg`
    );

});