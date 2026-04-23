
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { google } from "googleapis";
import express from "express";
import { z } from "zod";

const app = express();
app.use(express.json());

// --- Google Sheets Setup ---
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";

// --- Types ---
interface SurveyRow {
  userId: string;
  name: string;
  accountName: string;
  email: string;
  accountCreatedDate: string;
  plan: string;
  surveyYear: string;
  easeOfNavigation: number | null;
  bugFixSatisfaction: number | null;
  overallPerformance: number | null;
  additionalComments: string | null;
}

// --- Fetch & Parse Sheet Data ---
async function getSurveyData(): Promise<SurveyRow[]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:K`,
  });

  const rows = response.data.values || [];
  if (rows.length < 2) return [];

  // Skip header row
  return rows.slice(1).map((row): SurveyRow => ({
    userId: row[0] || "",
    name: row[1] || "",
    accountName: row[2] || "",
    email: row[3] || "",
    accountCreatedDate: row[4] || "",
    plan: row[5] || "",
    surveyYear: row[6] || "",
    easeOfNavigation: row[7] !== undefined && row[7] !== "" ? Number(row[7]) : null,
    bugFixSatisfaction: row[8] !== undefined && row[8] !== "" ? Number(row[8]) : null,
    overallPerformance: row[9] !== undefined && row[9] !== "" ? Number(row[9]) : null,
    additionalComments: row[10] && row[10] !== "Skipped" ? row[10] : null,
  }));
}

// --- MCP Server Factory ---
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "survey-data-server",
    version: "1.0.0",
  });

  // Tool 1: Get all survey responses
  server.tool(
    "get_all_survey_responses",
    "Fetch all Easy Survey responses from the Google Sheet",
    {},
    async () => {
      const data = await getSurveyData();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // Tool 2: Get summary statistics
  server.tool(
    "get_survey_summary",
    "Get summary statistics: total responses, average scores for navigation ease, bug fix satisfaction, and overall performance, plus plan breakdown",
    {},
    async () => {
      const data = await getSurveyData();

      const valid = (arr: (number | null)[]): number[] =>
        arr.filter((v): v is number => v !== null);

      const avg = (nums: number[]): string =>
        nums.length
          ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
          : "N/A";

      const planBreakdown = data.reduce((acc, d) => {
        acc[d.plan] = (acc[d.plan] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const summary = {
        totalResponses: data.length,
        avgEaseOfNavigation: avg(valid(data.map((d) => d.easeOfNavigation))),
        avgBugFixSatisfaction: avg(valid(data.map((d) => d.bugFixSatisfaction))),
        avgOverallPerformance: avg(valid(data.map((d) => d.overallPerformance))),
        responsesWithComments: data.filter((d) => d.additionalComments).length,
        planBreakdown,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // Tool 3: Filter by account plan
  server.tool(
    "get_responses_by_plan",
    "Filter survey responses by account plan (e.g., Business, Team)",
    {
      plan: z.string().describe("Account plan to filter by, e.g. 'Business' or 'Team'"),
    },
    async ({ plan }) => {
      const data = await getSurveyData();
      const filtered = data.filter(
        (d) => d.plan.toLowerCase() === plan.toLowerCase()
      );
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    }
  );

  // Tool 4: Get low-score / detractor responses
  server.tool(
    "get_low_score_responses",
    "Get responses where any rating is at or below a threshold. Useful for identifying unhappy users / detractors.",
    {
      threshold: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Score threshold (default 5). Returns responses where any score is <= threshold"),
    },
    async ({ threshold = 5 }) => {
      const data = await getSurveyData();
      const filtered = data.filter(
        (d) =>
          (d.easeOfNavigation !== null && d.easeOfNavigation <= threshold) ||
          (d.bugFixSatisfaction !== null && d.bugFixSatisfaction <= threshold) ||
          (d.overallPerformance !== null && d.overallPerformance <= threshold)
      );
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    }
  );

  // Tool 5: Get responses with comments only
  server.tool(
    "get_responses_with_comments",
    "Get all survey responses that have additional comments (excludes entries where comment was skipped)",
    {},
    async () => {
      const data = await getSurveyData();
      const filtered = data.filter((d) => d.additionalComments);
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    }
  );

  // Tool 6: Search by name, account, or email
  server.tool(
    "search_survey_responses",
    "Search survey responses by user name, account name, or email address",
    {
      query: z.string().describe("Search term to match against name, account name, or email"),
    },
    async ({ query }) => {
      const data = await getSurveyData();
      const q = query.toLowerCase();
      const filtered = data.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.accountName.toLowerCase().includes(q) ||
          d.email.toLowerCase().includes(q)
      );
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    }
  );

  // Tool 7: Get responses by survey month/year
  server.tool(
    "get_responses_by_survey_period",
    "Filter survey responses by the survey year/month period (e.g., 'Jan 2025')",
    {
      period: z.string().describe("Survey period to filter by, e.g. 'Jan 2025' or '2025'"),
    },
    async ({ period }) => {
      const data = await getSurveyData();
      const filtered = data.filter((d) =>
        d.surveyYear.toLowerCase().includes(period.toLowerCase())
      );
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    }
  );

  return server;
}

// --- MCP HTTP endpoint (Streamable HTTP transport, stateless) ---
app.post("/mcp", async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. Use POST for MCP requests." });
});

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "survey-mcp-server",
    timestamp: new Date().toISOString(),
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Survey MCP server running on port ${PORT}`);
  console.log(`📊 Spreadsheet ID: ${SPREADSHEET_ID}`);
  console.log(`📋 Sheet Name: ${SHEET_NAME}`);
});
