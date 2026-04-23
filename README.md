# Survey MCP Server

A Model Context Protocol (MCP) server that connects Claude.ai to your Easy Survey Google Sheet data.

## Project Structure

```
survey-mcp-server/
├── src/
│   └── index.ts          # Main MCP server
├── Dockerfile            # Docker build for Railway
├── railway.toml          # Railway deployment config
├── package.json
├── tsconfig.json
├── .env.example          # Environment variable reference
└── .gitignore
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_all_survey_responses` | Fetch every row from the sheet |
| `get_survey_summary` | Avg scores, totals, plan breakdown |
| `get_responses_by_plan` | Filter by Business / Team etc. |
| `get_low_score_responses` | Find detractors (score ≤ threshold) |
| `get_responses_with_comments` | Only rows with real comments |
| `search_survey_responses` | Search by name / account / email |
| `get_responses_by_survey_period` | Filter by survey month/year |

## Local Development

1. Copy `.env.example` to `.env` and fill in values
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in dev mode:
   ```bash
   npm run dev
   ```
4. Test health check:
   ```bash
   curl http://localhost:3000/health
   ```

## Deploy to Railway

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/survey-mcp-server.git
git push -u origin main
```

### Step 2: Create Railway Project
1. Go to https://railway.app
2. Click **New Project → Deploy from GitHub**
3. Select your repository

### Step 3: Add Environment Variables in Railway
Go to your service → **Variables** tab and add:

| Variable | Value |
|----------|-------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste entire service account JSON |
| `SPREADSHEET_ID` | Your Google Sheet ID from the URL |
| `SHEET_NAME` | Your sheet tab name (e.g. Sheet1) |

> Railway automatically sets `PORT` — do not add it manually.

### Step 4: Deploy
Railway will auto-build using the Dockerfile and deploy. Your URL will be:
```
https://your-app-name.railway.app
```

## Connect to Claude.ai

1. Go to **Claude.ai → Settings → Connectors**
2. Click **Add MCP Server**
3. Enter URL: `https://your-app-name.railway.app/mcp`
4. Name it: `Survey Data`
5. Save ✅

## Google Sheet Setup

Your sheet columns should be in this order (A to K):
- A: User ID
- B: Name
- C: Account Name
- D: Email
- E: Account Created Date
- F: Account Plan
- G: Survey Year
- H: Ease of Navigation (0-10)
- I: Bug Fix Satisfaction (0-10)
- J: Overall Performance (0-10)
- K: Additional Comments