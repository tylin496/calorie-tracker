

const FAT_KCAL_PER_KG = 7700;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://thom436.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function notionFetch(path, options = {}) {
  return fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

function getWeekBounds(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const format = (value) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const dayOfMonth = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${dayOfMonth}`;
  };

  return {
    start: format(monday),
    end: format(sunday)
  };
}

async function getWeekEntries(today) {
  const { start, end } = getWeekBounds(today);

  const response = await notionFetch(
    `/databases/${process.env.NOTION_DATABASE_ID}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: "Date",
              date: {
                on_or_after: start
              }
            },
            {
              property: "Date",
              date: {
                on_or_before: end
              }
            }
          ]
        },
        sorts: [
          {
            property: "Date",
            direction: "ascending"
          }
        ],
        page_size: 100
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw {
      status: response.status,
      data
    };
  }

  const entries = data.results.map((page) => {
    const properties = page.properties;

    return {
      id: page.id,
      date: properties.Date?.date?.start || "",
      calories: properties.Calories?.number || 0,
      protein: properties.Protein?.number || 0,
      tdee: properties.TDEE?.number || 2705
    };
  });

  return {
    start,
    end,
    entries
  };
}

function summarizeWeek(today, fallbackTdee, entries, start, end) {
  const count = entries.length;
  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const totalProtein = entries.reduce((sum, entry) => sum + entry.protein, 0);
  const totalDeficit = entries.reduce((sum, entry) => {
    const entryTdee = entry.tdee || fallbackTdee;
    return sum + (entryTdee - entry.calories);
  }, 0);
  const todayEntry = entries.find((entry) => entry.date === today) || null;

  return {
    weekStart: start,
    weekEnd: end,
    tdee: fallbackTdee,
    count,
    todayLogged: Boolean(todayEntry),
    todayEntry,
    averageCalories: count ? Math.round(totalCalories / count) : 0,
    averageProtein: count ? Math.round(totalProtein / count) : 0,
    totalDeficit,
    fatLossKg: totalDeficit / FAT_KCAL_PER_KG,
    entries
  };
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const today = req.query.today;
    const tdee = Number(req.query.tdee) || 2705;

    if (!today) {
      return res.status(400).json({
        error: "Missing today"
      });
    }

    const { start, end, entries } = await getWeekEntries(today);
    const summary = summarizeWeek(today, tdee, entries, start, end);

    return res.status(200).json({
      ok: true,
      summary
    });
  } catch (error) {
    console.error(error);

    return res.status(error.status || 500).json({
      error: "API error",
      detail: error.data || error.message || error
    });
  }
}