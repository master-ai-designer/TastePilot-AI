import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/discover", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query) return res.status(400).json({ error: "Query is required." });

  if (!process.env.QLOO_API_KEY) {
    return res.json({
      demo: true,
      query,
      message: "TastePilot is ready. Add QLOO_API_KEY to enable live Qloo results.",
      results: []
    });
  }

  try {
    const url = new URL("https://hackathon.api.qloo.com/search");
    url.searchParams.set("query", query);
    url.searchParams.set("type", "urn:entity:movie");

    const response = await fetch(url, {
      headers: { "X-Api-Key": process.env.QLOO_API_KEY }
    });

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Qloo request failed.",
        details: text
      });
    }

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    res.json({ demo: false, query, results: data });
  } catch (error) {
    res.status(500).json({ error: "Server error.", details: error.message });
  }
});

if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`TastePilot running on http://localhost:${port}`));
}

export default app;
