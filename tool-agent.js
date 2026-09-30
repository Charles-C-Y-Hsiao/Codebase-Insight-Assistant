const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const { tools, getToolDescriptions } = require("./tools");

const rl = readline.createInterface({ input, output });
const MODEL = "gpt-5.4-mini";

async function confirmApiCall(label) {
  const answer = await rl.question(`${label}，確定要使用 API key 呼叫 OpenAI? (yes/no): `);
  return answer.trim().toLowerCase() === "yes";
}

async function callOpenAI(apiKey, payload, label) {
  if (!(await confirmApiCall(label))) throw new Error("你取消了 API 呼叫");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenAI API error");
  return data.output_text || "";
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型沒有回傳 JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function main() {
  const apiKey = (await rl.question("OpenAI API Key: ")).trim();
  const task = (await rl.question("你要 agent 完成什麼任務: ")).trim();
  if (!apiKey || !task) throw new Error("API key 和任務都必須輸入");

  const planText = await callOpenAI(apiKey, {
    model: MODEL,
    instructions: `你只能回 JSON。可用工具: ${JSON.stringify(getToolDescriptions())}。格式: {"tool":"工具名","args":{}}。`,
    input: task,
  }, "第 1 次：讓模型選工具");

  const action = parseJson(planText);
  if (!tools[action.tool]) throw new Error(`未知工具: ${action.tool}`);
  const toolResult = tools[action.tool].run(action.args || {});

  const finalText = await callOpenAI(apiKey, {
    model: MODEL,
    instructions: "請用繁體中文整理工具結果，回答使用者任務。",
    input: `任務: ${task}\n工具: ${action.tool}\n工具結果: ${toolResult}`,
  }, "第 2 次：讓模型整理最後答案");

  console.log("\nAgent 回答:\n");
  console.log(finalText);
}

main().catch((error) => console.error("錯誤:", error.message)).finally(() => rl.close());
