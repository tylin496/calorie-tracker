function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://tylin496.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function isAuthorized(req) {
  const expectedKey = process.env.APP_ACCESS_KEY;
  return Boolean(expectedKey) && req.headers["x-app-key"] === expectedKey;
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

function toValidNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function buildProperties(tdee, proteinTarget, deficitTarget) {
  return {
    Name: {
      title: [
        {
          text: {
            content: "Settings"
          }
        }
      ]
    },
    TDEE: {
      number: tdee
    },
    Protein: {
      number: proteinTarget
    },
    Calories: {
      number: deficitTarget
    }
  };
}

async function findSettingsPage() {
  const response = await notionFetch(
    `/databases/${process.env.NOTION_DATABASE_ID}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          property: "Name",
          title: {
            equals: "Settings"
          }
        },
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

async function updateSettings(pageId, properties) {
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

async function createSettings(properties) {
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

function readConfig(page) {
  const properties = page?.properties || {};

  return {
    tdee: properties.TDEE?.number || 2705,
    proteinTarget: properties.Protein?.number || 180,
    deficitTarget: properties.Calories?.number || 500
  };
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {
    if (req.method === "GET") {
      const settingsPage = await findSettingsPage();

      return res.status(200).json({
        ok: true,
        config: readConfig(settingsPage)
      });
    }

    const tdee = toValidNumber(req.body.tdee);
    const proteinTarget = toValidNumber(req.body.proteinTarget);
    const deficitTarget = toValidNumber(req.body.deficitTarget);

    if (!tdee || !proteinTarget || deficitTarget === null) {
      return res.status(400).json({
        error: "Invalid targets"
      });
    }

    const properties = buildProperties(
      Math.round(tdee),
      Math.round(proteinTarget),
      Math.round(deficitTarget)
    );
    const settingsPage = await findSettingsPage();
    const data = settingsPage
      ? await updateSettings(settingsPage.id, properties)
      : await createSettings(properties);

    return res.status(200).json({
      ok: true,
      config: readConfig(data)
    });
  } catch (error) {
    console.error(error);

    return res.status(error.status || 500).json({
      error: "API error"
    });
  }
}
