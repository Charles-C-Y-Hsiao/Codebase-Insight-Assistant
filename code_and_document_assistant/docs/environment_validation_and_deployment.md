# 環境驗證與部署

本文件提供公司環境導入 Code & Document Assistant 時的驗證、排錯與部署順序。

英文檔名使用 `environment_validation_and_deployment.md`，適合程式專案、搜尋與後續自動化；中文主標題仍保留為「環境驗證與部署」。

## 1. 執行前準備

- 確認專案位置：`C:\Web_Practice\ReAct`
- 確認公司提供以下資料：
  - AI API endpoint 完整 URL
  - API key
  - 模型 ID 或部署名稱
  - 使用的協定：Responses 或 Chat Completions
  - 認證標頭名稱與前綴
  - 是否支援原生工具呼叫
  - 是否允許圖片輸入
  - 是否允許將專案檔案送往公司端點
- 不要將 API key、Bearer token、Cookie、密碼或 SSO 憑證寫入：
  - JSON 設定檔
  - PowerShell 或 BAT 檔
  - 前端程式
  - Git 或文件截圖

## 2. 本機環境檢查

在 PowerShell 執行：

```powershell
Set-Location C:\Web_Practice\ReAct
```

```powershell
node --version
```

```powershell
npm --version
```

```powershell
python --version
```

```powershell
Test-Path .\code_and_document_assistant\server.js
```

預期結果：

- Node.js 可執行，建議使用專案文件記錄的 v20 版本。
- npm 可執行。
- Python 可執行，以支援文件解析與靜態驗證。
- `server.js` 存在。

若 Python 路徑不同，在本次 PowerShell 設定：

```powershell
$env:CDA_PYTHON = 'Python.exe 的完整路徑'
```

## 3. 執行離線測試

先不使用公司 API key，確認專案本身正常。

```powershell
node --test .\code_and_document_assistant\tests\acceptance.test.js .\code_and_document_assistant\tests\phase2.test.js
```

```powershell
node .\code_and_document_assistant\evaluation\run.js
```

```powershell
node .\code_and_document_assistant\tests\browser-smoke.js
```

AI 與瀏覽器相關測試：

```powershell
node .\code_and_document_assistant\tests\ai.test.js
```

```powershell
node .\code_and_document_assistant\tests\ai-browser-smoke.js
```

```powershell
node .\code_and_document_assistant\tests\project-browser-smoke.js
```

```powershell
node .\code_and_document_assistant\tests\task-card-browser.js
```

```powershell
node .\code_and_document_assistant\tests\review-viewers-browser.js
```

判斷方式：

- `PASS`：可進入公司端點驗證。
- Node 語法錯誤：先修正本機程式。
- Chrome 找不到：設定 `CDA_BROWSER` 指向核准的 Chrome 執行檔。
- 版面或瀏覽器環境造成的測試差異：記錄後與 API 連線問題分開處理。

## 4. 建立公司 AI 設定

複製設定範例：

```powershell
Copy-Item .\code_and_document_assistant\config\ai.company.example.json .\code_and_document_assistant\config\ai.local.json
```

修改 `config/ai.local.json` 的非機密設定：

- `provider`
  - 公司 OpenAI 相容端點使用 `openai-compatible`。
- `protocol`
  - Responses 使用 `responses`。
  - Chat Completions 使用 `chat-completions`。
- `endpoint`
  - 填入公司提供的完整 URL。
  - 程式不會自動補上 `/v1`。
- `model`
  - 填入公司提供的模型 ID 或部署名稱。
- `omitModel`
  - 只有 endpoint 已固定模型時才設為 `true`。
- `keyEnvironmentVariable`
  - 設定公司要求的環境變數名稱，例如 `CDA_COMPANY_AI_KEY`。
- `authHeader`
  - Bearer 認證通常為 `Authorization`。
  - 公司要求 API key 標頭時可能是 `api-key`。
- `authPrefix`
  - Bearer 認證通常為 `Bearer `。
  - 直接放 key 的標頭使用空字串。
- `toolMode`
  - 公司支援原生工具呼叫時使用 `native`。
  - 只有確認公司端點支援 JSON 指令時才使用 `json`。
- `supportsImages`
  - 公司尚未確認圖片輸入前維持 `false`。

## 5. 公司網路檢查

從 endpoint 取出主機名稱後執行：

```powershell
Resolve-DnsName 公司端點主機
```

```powershell
Test-NetConnection 公司端點主機 -Port 443
```

結果解讀：

- DNS 失敗：檢查公司 DNS、VPN 或 Proxy。
- TCP 失敗：檢查防火牆、路由或公司網路白名單。
- TCP 成功：只代表網路可達，不代表 key、模型或 API 格式正確。
- TLS 失敗：檢查公司 CA、Node.js 信任憑證或 HTTPS Proxy。

不要停用 TLS 驗證，也不要先把真實 key 放到 curl 命令列中。

## 6. 啟動 real AI 服務

```powershell
Set-Location C:\Web_Practice\ReAct\code_and_document_assistant
```

```powershell
.\start_ai.ps1 -Config .\config\ai.local.json
```

啟動腳本會：

- 隱藏輸入 API key。
- 將 key 只放在本次程序環境。
- 啟用 real AI 模式。
- 預設啟動 `127.0.0.1:4317`。
- 顯示本次服務的管理碼。

開啟：

```text
http://127.0.0.1:4317/
```

若公司政策禁止執行 PowerShell 腳本，可使用公司核准方式設定環境後啟動：

```powershell
$env:CDA_MODEL_MODE='real';$env:CDA_AI_CONFIG='C:\Web_Practice\ReAct\code_and_document_assistant\config\ai.local.json';$env:CDA_AI_KEY='只在公司核准環境設定';node .\code_and_document_assistant\server.js
```

不要保存包含真實 key 的命令歷史或腳本。

## 7. 測試 AI 連線

在網頁依序操作：

- 輸入終端顯示的管理碼。
- 查看目前 AI 連線狀態。
- 按「測試 AI 連線」。
- 確認只送固定測試文字，不包含專案檔案。
- 確認狀態由 `configured_not_tested` 變成 `connected`。

連線測試成功代表：

- endpoint 有回應。
- API key 可被接受。
- 模型或部署名稱可接受。
- 回應符合專案要求的工具格式。

這不代表實際專案查詢、工具循環或修改流程已完成驗證。

## 8. 授權測試專案與內容外送

先使用公司測試資料夾，不要直接操作正式資料。

- 新增或授權測試專案。
- 授權讀取權限。
- 需要 AI 查詢時，勾選「允許內容送往目前設定的 AI」。
- 需要修改時，另外勾選「允許修改」。
- 需要驗證時，另外勾選「允許靜態驗證」。
- 更新檔案索引。
- 確認檔案清單與實際測試資料夾一致。

注意：

- AI 外送授權與檔案讀取授權分開管理。
- 沒有 AI 外送授權時，不應送出檔案內容。
- 切換專案後，原專案的修改授權不會自動套用。
- 外部專案在服務重啟後通常需要重新授權。

## 9. 測試一般查詢

先測試不修改檔案的問題：

```text
請列出目前測試專案中有哪些檔案，並說明每個檔案的用途。
```

再測試指定檔案：

```text
請閱讀 @index.html，說明頁面主要結構，並引用實際來源位置。
```

確認：

- 有執行搜尋或讀檔工具。
- 回答包含實際來源與引用。
- 沒有引用不存在的檔案。
- 沒有把未讀取內容說成已確認。
- 任務詳細資訊可查看工具紀錄。
- 連線失敗時不會回退成假資料。

## 10. 測試 ReAct 工具循環

使用需要多步搜尋與讀取的問題：

```text
請找出所有包含登入按鈕的檔案，說明目前樣式與可能的修改位置。
```

應觀察：

- Decide：選擇搜尋、讀檔或回答。
- Act：只執行已登錄的白名單工具。
- Observe：取得來源、版本與內容片段。
- Repeat：必要時繼續搜尋或讀取。
- Stop：完成回答或提出 1～3 個澄清問題。
- Final Answer：輸出結論、依據、推論與未確認事項。

若出現工具未登錄、引用不存在或 schema 不符，先檢查：

- 公司端點是否支援原生工具呼叫。
- `toolMode` 是否設定正確。
- 公司端點是否修改了工具回應格式。
- 模型 ID 是否為公司實際可用的部署名稱。

## 11. 測試 AI 修改

只使用測試檔案，先提出小幅度修改：

```text
請將測試頁面的按鈕文字改為「確認」，並保留其他內容。
```

確認：

- 使用「AI 修改程式」入口。
- AI 先讀取檔案目前版本。
- 顯示修改前後差異。
- 尚未確認前不會直接寫入檔案。
- 按「確認套用實際修改」後才寫入。
- 套用前檢查檔案版本。
- 套用前建立備份。
- 執行靜態驗證。
- 完成後產生完工說明。
- `runtime/audit.jsonl` 有修改、備份與驗證紀錄。

接著測試還原：

- 按「確認還原這次修改」。
- 確認檔案回到修改前內容。
- 確認備份仍存在。
- 若檔案已被其他程式修改，系統應拒絕覆蓋最新內容。

## 12. 測試錯誤情境

建議逐一測試：

- 錯誤 API key：預期 `AI_HTTP_401`。
- 錯誤模型：預期 `AI_HTTP_400` 或 `AI_HTTP_404`。
- 不支援工具格式：預期 `AI_SCHEMA`。
- 過期或撤銷 AI 授權：預期 `AI_PERMISSION`。
- API 額度不足：預期 `AI_HTTP_429`。
- 端點逾時：預期 `AI_TIMEOUT`。
- DNS 或 TLS 失敗：預期 `AI_NETWORK`。
- 查詢不存在檔案：不得假裝已讀取。
- 檔案版本已變更：預期 `AI_VERSION`，不得覆蓋最新內容。

## 13. 部署前檢查

- 離線測試全部通過。
- 公司 endpoint 連線測試成功。
- 公司確認模型 ID 或部署名稱。
- API key 沒有寫入檔案或 Git。
- `config/ai.local.json` 未提交。
- `runtime/` 未提交。
- 測試專案查詢、引用與修改流程通過。
- 修改前後差異與備份可以查看。
- 靜態驗證結果符合預期。
- 公司 Proxy、DNS 與 TLS CA 已確認。
- 公司確認專案內容可送往指定端點。
- 公司確認是否允許原生工具呼叫。
- 公司確認是否允許圖片輸入與圖片生成。
- 公司確認服務只開放在 localhost 或受控內網。

## 14. 公司內網啟動

需要其他公司電腦連線時，在啟動前設定：

```powershell
$env:CDA_HOST='0.0.0.0';.\start_ai.ps1 -Config .\config\ai.local.json
```

其他電腦開啟：

```text
http://主機IP:4317/
```

目前服務仍不是完整登入系統：

- 沒有一般使用者登入。
- 管理碼用於授權與修改確認。
- 讀取授權為整個服務共用。
- 僅適合可信任內網與測試部署。
- 正式部署前應加入反向代理、登入、HTTPS、網路白名單與稽核政策。

## 15. 排錯順序

```text
本機環境
↓
離線測試
↓
DNS、TCP、TLS
↓
公司 endpoint、model、API key
↓
測試 AI 連線
↓
AI 外送授權
↓
查詢與引用
↓
ReAct 工具循環
↓
修改、差異、驗證與還原
↓
內網部署
```

## 相關檔案

- `code_and_document_assistant/docs/ai_connection_flow.md`
- `code_and_document_assistant/docs/README.md`
- `code_and_document_assistant/config/ai.company.example.json`
- `code_and_document_assistant/src/ai-config.js`
- `code_and_document_assistant/src/ai-client.js`
- `code_and_document_assistant/src/ai-agent.js`
- `code_and_document_assistant/tests/ai.test.js`
- `code_and_document_assistant/tests/ai-browser-smoke.js`
