# OpenAI 與公司 AI 連線流程

本文件以 `C:\Web_Practice\ReAct\code_and_document_assistant` 為專案根目錄，整理本機啟動、OpenAI 或公司 AI 端點、檔案外送授權、圖片輸入／創作、Agent Loop 限制與驗收方式。

## 閱讀方式

每個連線動作都從下列角度閱讀：

```text
動作
├─ 目的
├─ 流程
├─ Interface
├─ Interaction
├─ Harness
├─ Validation
├─ Operations
├─ History
├─ Test Data
└─ 保存結果
```

`CDA` 是 Code & Document Assistant 的縮寫；`CDA_*` 是本專案的環境變數前綴。API key 只由後端讀取，不放入前端、JSON 設定、BAT 或 Git。

## 動作：啟動本機 AI 服務

目的：以本次程序環境啟動服務，讓使用者輸入 API key 與實際可用的模型 ID，並避免把 key 寫入永久設定。

流程：

```powershell
Set-Location C:\Web_Practice\ReAct\code_and_document_assistant
.\start_ai.ps1
```

腳本會隱藏輸入 API key，詢問帳號可用的 API 模型 ID，預設在 localhost 啟動並開啟 `http://127.0.0.1:4317/`；終端顯示本機管理碼。

Interface：頂部授權視窗提供管理碼、AI 連線測試、AI 外送授權與模型狀態；中央提供查詢、`@file` 與「AI 修改程式」入口。

Interaction：

1. 先停止舊的 4317 服務。
2. 啟動 `start_ai.ps1` 並輸入本次 key 與實際 API ID，不猜測介面顯示名稱。
3. 在授權視窗按「測試 AI 連線」。
4. 為目標專案或全域參考勾選「允許內容送往目前設定的 AI」並確認。
5. 開啟目標專案、更新索引，再提出問題或使用 `@file`。

Harness：key 只存在此次程序環境，程序結束後恢復原設定；腳本不安裝 npm。未完成 AI 測試或外送授權前，不得把專案內容送往模型。

Validation：連線測試只送固定文字，不送專案內容；通過只代表端點與工具格式成功驗證，仍不代表所有模型能力或額度都可用。

Operations：若組織政策不允許 PowerShell，可在已核准的環境設定 `CDA_MODEL_MODE=real`、`CDA_AI_MODEL`、`CDA_AI_KEY`，再執行 `node server.js`。`CDA_PROJECTS_CONFIG` 指定專案設定檔位置。

History：不保存 key；對話、任務與連線結果依專案規則保存於 `runtime/assistant-state/state.json`，不保存原始認證標頭。

Test Data：假 key、假模型與 Chrome smoke test 可用於本機驗證；真實 key 與公司端點需由使用者自行確認。

保存結果：保存服務狀態、公開連線結果與任務摘要；程序結束後不保留本次輸入的 key。

### 本機 Luna 啟動

可雙擊 `start_ai_luna_local.bat`，或執行：

```powershell
& 'C:\Web_Practice\ReAct\code_and_document_assistant\start_ai_luna_local.bat'
```

它會檢查 4317、啟動 `start_ai.ps1 -Model gpt-5.6-luna`、要求本次 key，並在服務就緒後開啟 localhost。此檔案不啟用 LAN IP、不保存 key；按該視窗的 `Ctrl+C` 停止服務。

## 動作：測試 AI 連線與選擇模型

目的：確認官方 OpenAI 或公司 AI 閘道的 endpoint、認證、模型與工具格式相容。

流程：

```text
助手後端 → 公司 AI 閘道或官方 endpoint → 指定模型
```

Interface：顯示目前模型、測試結果、錯誤類型與是否允許 AI 外送；連線完成後可選「AI 修改程式」。

Interaction：使用者可選擇查詢、AI 修改程式，或使用「人工編輯／靜態驗證」。切換專案會清除 AI 提案許可。

Harness：缺少設定時顯示 `CONFIG_REQUIRED`，不回退 Mock；模型、endpoint、協定與工具 schema 必須通過後端設定驗證。

Validation：Responses 使用 `max_output_tokens`；Chat Completions 使用 `max_completion_tokens`；兩者皆使用 `store:false`。公司端點若不支援欄位、strict tools 或回傳格式，必須依公司文件調整。

Operations：`CDA_AI_CONFIG` 指定 JSON 設定路徑；`CDA_AI_MODEL` 可覆寫模型。API key 由 `CDA_AI_KEY` 或設定中的 `keyEnvironmentVariable` 指定。

History：保存測試的成功、失敗類型、耗時與 token；不保存 key、認證標頭或原始敏感錯誤本文。

Test Data：固定連線文字、官方 Responses、公司 Chat Completions、錯誤模型、錯誤 endpoint、缺少 key 與不支援工具格式。

保存結果：只有公開測試摘要與錯誤代碼可進入任務紀錄；不把測試成功誤認為專案內容已獲得外送授權。

## 動作：設定公司 AI URL、認證與模型

目的：讓公司閘道以明確設定接入，避免只更換 URL 就假設所有 API 格式相容。

設定檔範例：

```json
{
  "provider": "openai-compatible",
  "protocol": "chat-completions",
  "endpoint": "https://your-approved-gateway.example/v1/chat/completions",
  "model": "company-model-alias",
  "omitModel": false,
  "keyEnvironmentVariable": "CDA_COMPANY_AI_KEY",
  "authHeader": "Authorization",
  "authPrefix": "Bearer ",
  "toolMode": "native"
}
```

Interface：管理頁顯示目前 provider、protocol、模型與能力狀態，不顯示 key 值。

Interaction：複製 `config/ai.company.example.json` 為 `config/ai.local.json`，只修改非機密設定，再執行：

```powershell
.\start_ai.ps1 -Config .\config\ai.local.json
```

Harness：

- Responses 相容端點使用 `protocol: "responses"`。
- Chat Completions 相容端點使用 `protocol: "chat-completions"`。
- URL 固定模型時使用 `omitModel: true`。
- 公司部署別名必須填公司提供的原值。
- Bearer 使用 `Authorization` 與 `Bearer `；api-key 標頭使用 `authHeader: "api-key"` 與空白 prefix。
- 沒有原生工具呼叫時，經確認才可使用 `toolMode: "json"`；後端仍驗證相同工具 schema。

Validation：endpoint 不會自動補 `/v1`，不得包含 key、token、密碼或 fragment；使用 HTTPS，只有 localhost 測試允許 HTTP；禁止自動重新導向與停用 TLS 驗證。其他 payload、簽章、SSO 或原生 Claude 格式必須另寫 adapter。

Operations：公司 CA 必須由組織提供核准的 Node 信任設定；Chat 的 JSON 模式只替代工具呼叫格式，不是任意 API 相容層。

History：`config/ai.local.json` 已加入 gitignore；key 只存在環境變數。

Test Data：Responses、Chat Completions、固定模型 URL、Bearer、api-key、JSON tool mode 與不相容回應。

保存結果：保存非機密連線設定與測試摘要，不保存 key、token、密碼或認證標頭。

## 動作：授權檔案外送並建立 AI 任務

目的：只將使用者明確授權、位於允許範圍內且版本有效的內容送到模型。

流程：

```text
選擇目標與參考範圍
→ 授權 AI 外送
→ 提供相對名稱、ID、版本
→ 搜尋／讀取時才取得原文
→ 每輪重新核對授權與版本
→ 呼叫模型或拒絕外送
```

Interface：檔案清單初始只顯示相對名稱、ID 與版本；使用者可用 `@file` 限定來源，並能看到目前的外送授權狀態。

Interaction：選取未授權的 `@file` 時，請求在模型呼叫前被拒絕；未指定檔案仍可送出問題，但不能宣稱已閱讀專案。

Harness：只有範圍內且允許 AI 外送的檔案才可列給模型。全域 AI 授權不能繞過子專案的 AI 禁止或到期；A 若單獨登錄，也必須有有效 AI 許可。

Validation：每輪與每次重試重新查授權，並核對已取得原文的版本；撤銷會停止後續外送，但已發出的請求無法回收。

Operations：模型沒有任意 SQL、Shell、網址、授權或套用工具；可提出目標內既有程式修改，或最多 20 份待逐檔確認的新程式檔。

History：本版每次只送本次問題、選取圖片與授權檔案；歷史對話可供介面查看，但尚不自動送入多輪上下文。

Test Data：未授權 `@file`、到期專案、被撤銷授權、版本 hash 變更、無檔案查詢、20 份新檔上限。

保存結果：保存任務範圍、授權結果、版本、工具證據與對話摘要，不保存未授權檔案原文。

## 動作：輸入圖片與創作圖片

目的：區分圖片作為本次模型輸入，與使用 Images API 產生新圖片的兩種能力。

### 圖片輸入

流程：前端選取圖片 → 依能力設定檢查 → Base64 data URL → Responses 使用 `input_image`，Chat 使用 `image_url`。

Interface：輸入框顯示圖片草稿與能力狀態；未啟用時阻止帶圖送出，但保留草稿。

Interaction：使用者在本次問題中選取圖片；圖片不自動建立專案圖片檔。

Harness：未明確提供 `supportsImages` 時，只有 `provider: "openai"` 且完整模型 ID 為 `gpt-5.6-luna` 才預設啟用；公司別名或 URL 固定模型需明確設定 `true` 或 `false`。圖片以 Base64 傳送，不上傳 OpenAI Files API。

Validation：每輪與重試重新核對 AI 外送權限；端點拒絕含圖請求時保留錯誤，不回退成只送文字。每張圖片限制 1–20 MB，最多 5 張。

Operations：依官方 [Images and vision](https://developers.openai.com/api/docs/guides/images-vision) 接入；公司範例預設 `supportsImages: false`。

History：圖片只屬於本次模型輸入，不自動成為對話長期上下文。

Test Data：OpenAI Luna、公司模型明確支援、未啟用、端點拒絕圖片、1–20 MB、超過 5 張。

保存結果：保存本次任務的圖片輸入摘要與錯誤；不把圖片自動保存成專案檔案。

### 圖片創作

流程：輸入提示詞 → 開啟確認窗 → 確認版本與完整提示詞 → 呼叫官方 Images API → 顯示時間線 → 可修改提示詞產生下一版。

Interface：從輸入框「＋」選單選「創作圖片」；確認窗提供「返回修改」與「開始創作」，每版可下載 PNG。

Interaction：返回修改不消耗圖片 API 請求；未設定圖片模型時停用開始創作；「修改這張圖片」會要求下一輪確認。

Harness：必須在 AI JSON 明確設定組織核准且帳號可用的 `imageGenerationModel`，例如 `gpt-image-1`；API key 仍由 `CDA_AI_KEY` 提供。公司 OpenAI 相容端點尚未接入圖片創作，不自動退回其他模型。

Validation：每次圖片創作都要求目前專案已有 AI 外送授權；模型可用性、額度與費用需以實際帳號確認。

Operations：PNG 與同名 JSON 保存於 `runtime/assistant-state/generated-images/<projectId>/<conversationId>/<seriesId>/`。

History：時間線紀錄保存於 `runtime/assistant-state/state.json`；服務重啟後可查看已完成版本，未完成產圖不會自動續跑。

Test Data：未設定圖片模型、返回修改、完成版本、下一版提示詞、服務重啟與公司端點不支援圖片創作。

保存結果：保存每版 PNG、同名 JSON、提示詞版本與時間線紀錄。

## 動作：執行模型回合、工具與修改完工說明

目的：把模型回合、工具白名單、差異套用與結果摘要放在同一條可核對流程中。

流程：

```text
本次問題與提案許可
→ 核對 AI 外送權限
→ 呼叫固定官方／公司端點
→ 驗證工具白名單與 schema
→ 搜尋／讀檔／計算或回答
→ 單檔提案與差異預覽
→ 主機確認、版本核對、備份、寫入、靜態檢查
→ 撰寫完工說明
```

Interface：`finish.answer` 顯示於任務卡片第一層；完整 Markdown、結論、依據、推論、未確認事項與工具紀錄在詳細資訊。

Interaction：使用者確認修改後才套用；新增檔案最多 20 份並需逐份確認；AI 提案尚待確認時不得宣稱已完成。

Harness：預設每次請求 30 秒、整體 120 秒、最多 8 輪／12 次工具，每輪一個工具；輸出上限 4096 token，單檔原文 32 KiB，文字上下文 256 KiB，API 回應 1 MiB。429、5xx、網路失敗或逾時最多重試一次；401 與格式錯誤不盲目重試；取消會中止 HTTP。

Validation：模型核對對象、日期、單位與條件；程式核對引用 ID、來源與版本。尚無獨立語意審查器，不能保證每句結論都受來源支持。

Operations：套用後另外呼叫一次模型撰寫完工說明；補述前重新核對外送權限。模型補述失敗不影響已完成寫入或驗證，改顯示固定事實摘要；人工修改與 Mock 不呼叫補述。

History：保存實際回傳的 input/output token；缺少時為 `null`。成本為 `null`，不把估算當成實測；公開工具摘要只顯示請求次數、耗時與錯誤類型。

Test Data：搜尋、讀檔、計算、回答、單檔修改、新檔逐份確認、拒絕、截斷、未知工具、格式錯誤、無效引用與取消。

保存結果：保存部分完成原因、證據、差異、備份、驗證與完工說明；不公開原始 API 錯誤本文、認證標頭或模型內部思考。

## 動作：驗收連線與排查錯誤

目的：區分網路可達、端點有回應、key 有效、模型可用與完整 AI 任務成功，避免把其中一項誤認為全部通過。

流程：服務執行時另開 PowerShell 做檢查：

```powershell
Test-NetConnection api.openai.com -Port 443
curl.exe -sS -o NUL -w "HTTP %{http_code}`n" -X POST https://api.openai.com/v1/responses -H "Content-Type: application/json" -d "{}"
```

Interface：網頁顯示固定錯誤代碼與描述，不顯示原始錯誤本文、key 或標頭。

Interaction：依錯誤類型重新輸入 key、確認模型／endpoint、檢查額度、網路、Proxy 或 TLS，而不是盲目重試。

Harness：不帶 key 的官方請求收到 `401` 屬正常，只代表端點回應；`Test-NetConnection` 通過只代表 TCP 可達，不代表 key 或模型已驗證。

Validation：

- `AI_KEY_FORMAT`：重輸原始 key，不含空白、中文、引號或 Bearer 前綴。
- `AI_HTTP_401`：確認 key 有效及所屬專案權限。
- `AI_HTTP_400／404`：核對模型、endpoint 與協定。
- `AI_HTTP_429`：檢查 API 額度與頻率限制。
- `AI_NETWORK + DNS`：檢查服務行程的 DNS／網路環境。
- `AI_NETWORK + TLS`：檢查 Node.js 信任憑證或 HTTPS Proxy，不停用 TLS 驗證。
- `AI_NETWORK + 連線逾時／重設`：檢查路由、Proxy、防火牆或暫時網路故障。

Operations：更新程式後停止舊服務並重新執行 `start_ai.ps1`；依提示重輸 key，重新整理頁面後測試；既有外部資料夾需重新授權。

History：保存白名單錯誤代碼與固定描述；本次診斷不使用使用者 key，也不代表付費模型呼叫成功。

Test Data：TCP 可達、無 key 401、key 格式錯誤、401、400、404、429、DNS、TLS、逾時與連線重設。

保存結果：保存連線測試摘要與錯誤分類，不保存敏感認證資訊。

## 程式與驗收對應

- `start_ai.ps1`：隱藏 key 輸入、本次環境與 localhost 啟動。
- `src/ai-config.js`：設定驗證、固定 endpoint 與 key 環境變數。
- `src/ai-client.js`：Responses／Chat、認證、逾時重試與格式轉換。
- `src/ai-agent.js`：AI 權限、schema、受控工具、引用與版本。
- `tests/ai.test.js`：假模型協定、權限、修改、錯誤、逾時與取消。
- `tests/ai-browser-smoke.js`：假模型 real 模式前端完整驗收。

目前已實作官方 OpenAI Responses，以及公司 OpenAI 相容 Responses／Chat Completions；支援受控搜尋、讀檔、基本計算、單檔修改、新檔逐份確認與答案引用。尚未驗證使用者的官方帳號或公司端點，真實 SQL／內部 API 尚未接入，real 模式不使用 Mock 訂單結果。

相關文件：[task_workbench_flow.md](task_workbench_flow.md)、[version_history.md](version_history.md)、[backup/archive/test_report.md](backup/archive/test_report.md)。本文件依 [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling) 與 [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) 官方文件整理。
