  <script src="app.js?v=20260510-0236"></script>

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://thom436.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const { date, calories, protein } = req.body;

  if (!date || !calories || !protein) {
    return res.status(400).json({
      error: "Missing date, calories, or protein"
    });
  }

  const response = await fetch(
    "https://api.notion.com/v1/pages",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        parent: {
          database_id: process.env.NOTION_DATABASE_ID
        },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: date
                }
              }
            ]
          },
          Date: {
            date: {
              start: date
            }
          },
          Calories: {
            number: calories
          },
          Protein: {
            number: protein
          }
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return res.status(response.status).json({
      error: "Notion API error",
      detail: data
    });
  }

  return res.status(200).json({
    ok: true,
    data
  });
}