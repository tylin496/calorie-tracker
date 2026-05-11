# Calorie Tracker
A small calorie and protein tracker backed by a Notion database through Vercel API routes.

## Required Vercel Environment Variables

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `APP_ACCESS_KEY` - private key required by the frontend for all API requests

## Persistent Targets

Target settings are stored in the same Notion database as a page named `Settings`.

- `TDEE` stores the TDEE target
- `Protein` stores the protein target
- `Calories` stores the deficit target
- `Cut Start Date` stores the active cut start date
- `Cut Phase` stores the active phase index (`0`, `1`, or `2`)
- `Aggressive Deficit`, `Moderate Deficit`, and `Cruise Deficit` store phase deficit targets

## Notion Database Fields

The API expects these properties:

- `Name` - title
- `Date` - date
- `Calories` - number
- `Protein` - number
- `TDEE` - number
- `Calorie Target` - number
- `Protein Target` - number
- `Cut Start Date` - date
- `Cut Phase` - number
- `Cut Phase Name` - text or select
- `Cut Week` - number
- `Deficit Target` - number
- `Aggressive Deficit` - number
- `Moderate Deficit` - number
- `Cruise Deficit` - number

## Files

- `index.html` - app shell
- `style.css` - responsive UI styles
- `app.js` - frontend state, save/delete, summary rendering
- `api/save.js` - create or update a Notion entry
- `api/summary.js` - weekly summary
- `api/delete.js` - archive a Notion entry
- `api/config.js` - read or update persistent targets
