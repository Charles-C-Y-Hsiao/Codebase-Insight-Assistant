const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");

const rl = readline.createInterface({ input, output });
const MODEL = "gpt-5.4-mini";

async function main() {
  const apiKey = (await rl.question("OpenAI API Key: ")).trim();
  const message = (await rl.question("你想問 agent 什麼: ")).trim();
  rl.close();

  if (!apiKey || !message) {
    console.log("API key 和問題都必須輸入。");
    return;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions: "你是教學型 coding agent，請用繁體中文分步驟回答。",
      input: message,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenAI API error");
  console.log("\nAgent 回答:\n");
  console.log(data.output_text || "(沒有文字輸出)");
}

main().catch((error) => console.error("錯誤:", error.message));
