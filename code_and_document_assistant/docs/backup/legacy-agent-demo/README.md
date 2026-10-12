# ReAct 專案與 Agent 說明

本文件整合原本的 Agent Demo 說明與 Code & Document Assistant 文件導覽。

## Agent Demo

- 使用 CommonJS，不在本專案建立 `node_modules`。
- 環境變數依序讀取：`C:\Web_Practice\ReAct\.env`、`C:\Web_Practice\knowledge_forge_core\.env`、`C:\Web_Practice\.env`。
- 啟動服務：在 `C:\Web_Practice\ReAct` 執行 `node server.js`。
- 臨時輸入 API key：執行 `node cli-agent.js`，結束後不保存 key。
- 工具 Agent：執行 `node tool-agent.js`，目前提供 `get_time` 與 `calc`。
- 工具檔案位於 `tools/time.js`、`tools/calc.js` 與 `tools/index.js`。
- 每次呼叫 OpenAI API 前都會要求確認使用 API key。

## Code & Document Assistant 文件導覽

### 入口與版本

- [README](code_and_document_assistant/docs/README.md)：啟動、依賴、操作方式與限制。
- [版本歷史](code_and_document_assistant/docs/version_history.md)：增量、驗證結果與目前限制。

### Agent 與連線

- [Agent Loop 能力](code_and_document_assistant/docs/agent_loop_capabilities.md)：工具能力、Act 分類與 Harness 視角。
- [AI 連線流程](code_and_document_assistant/docs/ai_connection_flow.md)：real AI、公司端點、模型、授權與圖片能力。

### 專案與任務

- [專案工作區流程](code_and_document_assistant/docs/project_workspace_flow.md)：專案登錄、切換、索引與唯讀參考。
- [任務工作台流程](code_and_document_assistant/docs/task_workbench_flow.md)：查詢、記憶、修改、驗證與時間線。
- [任務版本流程](code_and_document_assistant/docs/task_version_flow.md)：Edit／View、需求版本與重新送出。
- [Select2 模擬流程](code_and_document_assistant/docs/select2_project_flow.md)：固定範例的建立、索引與預覽。

### 封存

- `code_and_document_assistant/docs/archive/`：已整合的歷史流程與完整測試報告。
- `code_and_document_assistant/docs/example_data/`：文件解析與查詢用的範例資料。

目前核心文件的導覽摘要每份不超過 100 字；詳細內容以各文件為準。
