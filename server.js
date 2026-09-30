const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const envFiles = [
  path.join(__dirname, ".env"),
  "C:\\Web_Practice\\knowledge_forge_core\\.env",
  "C:\\Web_Practice\\.env",
];
const envPath = envFiles.find((file) => fs.existsSync(file));
if (envPath) dotenv.config({ path: envPath });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.MODEL || process.env.KNOWLEDGE_FORGE_OPENAI_MODEL || "gpt-5.4-mini";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => res.json({ ok: true, model: MODEL }));

app.post("/api/agent", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const input = String(req.body.message || "").trim();
    if (!apiKey) return res.status(400).json({ error: "OPENAI_API_KEY is not set" });
    if (!input) return res.status(400).json({ error: "message is required" });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, instructions: "你是教學型 coding agent，請分步驟回答。", input }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "OpenAI API error" });
    res.json({ reply: data.output_text || "" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Agent server ready: http://localhost:${PORT}`));
