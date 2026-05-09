function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://thom436.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

async function findEntryByDate(date) {
  const response = await notionFetch(
    `/databases/${process.env.NOTION_DATABASE_ID}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          property: "Date",
          date: {
            equals: date
          }
        },
        sorts: [
          {
            property: "Date",
            direction: "descending"
          }
        ],
        page_size: 1
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

  return data.results[0] || null;
}

function buildProperties(date, calories, protein, tdee) {
  return {
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
    },
    TDEE: {
      number: tdee || 2705
    }
  };
}

async function updateEntry(pageId, properties) {
  const response = await notionFetch(
    `/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        properties
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

  return data;
}

async function createEntry(properties) {
  const response = await notionFetch(
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        parent: {
          database_id: process.env.NOTION_DATABASE_ID
        },
        properties
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

  return data;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { date, calories, protein, tdee } = req.body;

    if (!date || !calories || !protein) {
      return res.status(400).json({
        error: "Missing date, calories, or protein"
      });
    }

    const properties = buildProperties(date, calories, protein, tdee);
    const existingEntry = await findEntryByDate(date);

    if (existingEntry) {
      const data = await updateEntry(existingEntry.id, properties);

      return res.status(200).json({
        ok: true,
        mode: "updated",
        id: existingEntry.id,
        data
      });
    }

    const data = await createEntry(properties);

    return res.status(200).json({
      ok: true,
      mode: "created",
      id: data.id,
      data
    });
  } catch (error) {
    console.error(error);

    return res.status(error.status || 500).json({
      error: "API error",
      detail: error.data || error.message || error
    });
  }
}