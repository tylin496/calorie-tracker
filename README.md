# Calorie Tracker

A small calorie and protein tracker backed by a Notion database through Vercel API routes.

## Required Vercel Environment Variables

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `APP_ACCESS_KEY` - private key required by the frontend for all API requests

## Notion Database Fields

The API expects these properties:

- `Name` - title
- `Date` - date
- `Calories` - number
- `Protein` - number
- `TDEE` - number

## Files

- `index.html` - app shell
- `style.css` - responsive UI styles
- `app.js` - frontend state, save/delete, summary rendering
- `api/save.js` - create or update a Notion entry
- `api/summary.js` - weekly summary
- `api/delete.js` - archive a Notion entry
