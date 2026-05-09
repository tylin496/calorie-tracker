export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }


  const {
    date,
    calories,
    protein
  } = req.body;


  const response = await fetch(
    "https://api.notion.com/v1/pages",
    {
      method: "POST",

      headers: {
        "Authorization":
          `Bearer ${process.env.NOTION_TOKEN}`,

        "Notion-Version":
          "2022-06-28",

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({

        parent: {
          database_id:
            process.env.NOTION_DATABASE_ID
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


  const data =
    await response.json();


  return res.status(200).json(data);

}