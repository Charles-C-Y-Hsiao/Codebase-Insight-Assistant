# 查詢與修改工作台

本文件說明從輸入需求到完成查詢、修改、驗證與保存的工作台流程。`id="task-*"` 的 Edit／View、需求版本與短確認延續見 [task_version_flow.md](task_version_flow.md)；差異檢視與圖片預覽見封存的 [程式差異比較與圖片預覽](backup/archive/diff_and_image_preview_flow.md)。

相對路徑皆以 `C:\Web_Practice\ReAct\code_and_document_assistant` 為專案根目錄。

## 工作台總覽

目的：讓使用者從選擇專案、提出需求、執行 Agent Loop，到查看回答、確認修改、驗證與保存結果。

流程：選擇專案 → 提出需求 → 執行 Agent Loop → 查看結果 → 確認修改 → 驗證 → 保存。

Interface：提供查詢文件、AI 修改程式、人工編輯／靜態驗證三個入口。（程式：`#question`、`#mode-query`、`#mode-ai-edit`、`#mode-edit`）

Interaction：使用者選擇專案與檔案、輸入需求、查看任務、確認修改或取消操作。（程式：`submit()`、`/api/jobs`）

Harness：依 AI 模式、專案授權、任務選項與工具白名單建立執行範圍。（程式：`server.js`、`ProjectScope`、`Engine`）

Validation：檢查來源、內容版本、工具輸出、修改提案與靜態驗證結果。

Operations：處理服務、連線、授權、逾時、重試與重啟。

History：保存任務、工具摘要、證據、回答、驗證與耗時。

Test Data：使用 demo、固定 Mock 問題、測試專案與測試文件。

保存結果：`runtime/assistant-state/state.json`、`runtime/audit.jsonl`、`runtime/backups` 與實際專案檔案。

## 動作：選擇專案與任務入口

目的：決定目前任務的目標專案、可讀檔案與操作模式。

流程：選擇專案 → 更新索引 → 選取檔案 → 選擇查詢、AI 修改或人工編輯入口。

Interface：顯示專案、路徑、檔案、索引狀態與三種入口。（程式：`#project-list`、`#files`、`catalog()`、`inventory()`）

Interaction：切換專案、選取檔案、加入唯讀參考、建立對話或切換操作模式。

Harness：限制授權路徑，區分目標專案與唯讀參考專案，禁止跨專案修改。（程式：`ProjectScope`、`target(req)`）

Validation：檢查路徑、索引、檔案版本與授權是否仍有效。

Operations：處理新增專案、授權、續期、撤銷與重新索引。

History：保存 `projectId`、`conversationId` 與檔案關聯。

Test Data：使用 demo 或測試資料夾。

保存結果：專案登錄、對話關聯與任務來源保存於 `runtime/assistant-state/state.json`。

## 動作：提出需求

目的：建立一個可以執行、追蹤與保存的任務。

流程：輸入問題 → 選取檔案或圖片 → 選擇模式與選項 → 送出任務。

Interface：顯示輸入框、模式、技能建議、自動記憶與附件。（程式：`#question`、`#ai-auto-memory`、`#draft-images`）

Interaction：輸入、修改、取消與送出需求。（程式：`submit()`、`/api/jobs`）

Harness：檢查模型模式、檔案範圍、AI 外送、修改、驗證與圖片權限。

Validation：檢查問題長度、檔案類型、圖片數量與附件大小。

Operations：確認 AI 連線與服務狀態。

History：建立對話與任務紀錄。

Test Data：使用固定 Mock 問題與測試附件。

保存結果：任務保存於 `conversations[].jobs[]`。

## 動作：執行 Agent Loop

目的：讓 Agent 在受控範圍內搜尋、讀取、觀察並產生回答或提案。

流程：搜尋 → 讀取 → Observe → Repeat 或 Stop → 回答或提案。

Interface：顯示 Decide、Act、Observe、Repeat、工具結果、來源與耗時。（程式：`show()`、`renderTaskActivity()`）

Interaction：使用者查看進度、補充需求或取消任務。（程式：`poll()`、`/api/jobs/:id/cancel`）

Harness：限制白名單工具、輪數、時間、輸出大小、路徑與資料外送。（程式：`Engine`、`ai-agent.js`、`tools.js`）

Validation：檢查工具 schema、來源引用、檔案版本與結果格式。

Operations：處理重試、逾時、取消與部分完成。

History：保存工具紀錄、證據、公開事件與回答。

Test Data：使用 Mock 模型與測試文件。

保存結果：任務事件與結果保存於 `runtime/assistant-state/state.json`。

## 動作：使用原有對話記憶

目的：在不把全部歷史送給模型的情況下保留有效上下文。

流程：讀取 jobs 與 memory → 篩選同一工作階段、專案與對話 → 組合摘要、確認需求、最近對話與相關歷史。

Interface：顯示已確認需求與摘要。（程式：`#memory-details`、`#confirmed-requirements`、`#memory-summary`、`renderMemory()`）

Interaction：使用者可以確認需求、建立新對話或延續任務。（程式：`/api/conversation-memory/confirm`）

Harness：只使用有效授權的歷史；記憶不能成為系統指令，也不能擴大工具或寫入權限。（程式：`saved.context()`、`ConversationMemory.canSend()`）

Validation：檢查記憶來源、專案、對話與目前授權。

Operations：執行本機整理，不呼叫 LLM、不使用 API key。

History：保留完整任務原文與整理後的 memory。

Test Data：測試確認需求、需求取代、長對話與關鍵字找回。

保存結果：原始紀錄與記憶保存於 `runtime/assistant-state/state.json`。

### 原有記憶機制

- 模型可取得 `memory.confirmed` 中 active 的需求、`memory.summary`、最近四輪，以及依目前問題關鍵字找回的最多兩輪較早內容；不是固定五筆，實際數量會隨對話與預算變化。
- `Confirm requirement` 會建立 active 項目；含有「改成／改為／改用／不要／取消／取代／替換」等字串的新需求，可能要求取代最近一筆有效需求。舊項目改為 `superseded`，由 `replaces` 保存關係，不會刪除。
- `compact()` 取出 active 需求、較早任務的 question，以及 result.conclusions；沒有結論時使用 progress 或 status。摘要超過 12000 字元時截斷，較早任務最多整理 20 筆。
- 完整 LLM 回應不會整份加入 confirmed requirements；結論、事實與推論可能進入摘要或最近／找回的歷史內容。

## 動作：啟用自動記憶整理

目的：在 real AI 模式下，使用模型把對話整理成可重用的目標、決定、限制、已完成與待辦。

流程：勾選自動記憶 → `/api/jobs` 傳送 `autoMemory` → 任務完成或達到預算門檻 → 摘要模型更新 memory → 顯示摘要狀態。

Interface：顯示自動記憶選項、摘要版本、更新時間、觸發原因與用量。（程式：`#auto-memory-label`、`#ai-auto-memory`、`#conversation-memory`）

Interaction：勾選只影響下一次文字任務；取消後不再新增模型摘要請求；圖片與人工編輯不受此選項控制。（程式：`submit()`、`/api/jobs`）

Harness：只有 real AI、連線已驗證、專案允許 AI 外送且來源授權有效時，才可將記憶送給模型。（程式：`ConversationMemory.refresh()`、`canSend()`）

Validation：檢查摘要 schema、sourceJobIds、fingerprint、摘要大小與授權。

Operations：摘要可分批呼叫，使用有限重試與取消；失敗時保留上一版摘要。

History：保存摘要版本、更新事件、觸發原因、來源任務與可取得的 token 用量。

Test Data：未勾選、勾選、取消、摘要成功、摘要失敗與授權失效。

保存結果：`memory.structured`、`memory.summary` 與更新紀錄保存於 `runtime/assistant-state/state.json`。

### 自動記憶的內容與預算

- 記憶欄位為目標、決定、限制、已完成、待辦；提案、已套用與已驗證必須分開描述。
- 一般提問不會每次都額外呼叫摘要模型；任務結束、修改提案待確認、套用、還原、手動確認需求或達到預算門檻時才可能更新。
- 未壓縮且完整歷史可容納時使用完整歷史；接近預算時保留近期內容並整理較舊內容；超出預算時使用有效摘要、近期內容與關鍵字找回內容。
- `memoryBudgetTokens` 預設 8000；`contextBudgetTokens` 預設 32000，必須預留記憶、輸出與至少 2000 token 指令空間。這是本機估算預算，不是整個 Agent Loop 的精確 token 上限。
- 摘要失敗、需求改口過時或無法在預算內組成安全上下文時，必須明確顯示限制，不得假裝完整更新。

## 動作：使用技能建議

目的：在送出需求前協助使用者選擇需求釐清、任務規劃或驗證檢查流程。

流程：輸入需求 → 本機依文字提出最多三種建議 → 使用者選擇 → 按下開始才送出任務。

Interface：顯示技能建議與目前選取狀態。（程式：`#skill-panel`、`renderSkillSuggestions()`）

Interaction：使用者選擇需求釐清、任務規劃或驗證檢查；需求釐清可提出 1–3 個問題並等待回答。

Harness：第一版技能只能使用搜尋、讀檔、計算或結束工具，不能修改、新檔、執行命令或繞過授權。

Validation：區分已驗證、未驗證、建議驗收步驟與不在範圍內項目。

Operations：技能建議本身不呼叫模型；只有使用者按下開始後才進入任務流程。

History：保存技能 ID 與任務結果。

Test Data：測試需求釐清、任務規劃與驗證檢查三種建議。

保存結果：技能選擇與任務結果保存於 `runtime/assistant-state/state.json`。

## 動作：確認 AI 連線與外送條件

目的：確認 real AI 流程具備必要的模型、連線與資料外送條件。

流程：確認 real 模式 → 測試 AI 連線 → 授權專案 AI 外送 → 如需修改再授權寫入與 AI 修改。

Interface：顯示頁首 AI 狀態、連線測試、授權選項與管理碼欄位。（程式：`#current-model`、`#ai-test`、`#allow-ai`、`#admin`）

Interaction：使用者測試連線、提出授權、主機確認與選擇修改權限。（程式：`/api/ai/test`、`/api/roots/request`、`/api/roots/:id/approve`）

Harness：分開管理 real 模式、連線驗證、AI 外送、修改、靜態驗證與主機管理碼；任一條件不足都不能宣稱完整 real AI 修改流程。

Validation：確認 endpoint、模型、API key、工具格式與授權狀態。

Operations：處理 DNS、TCP、TLS、401、400、404、429、逾時與網路錯誤。

History：保存公開連線狀態、授權與任務結果，不保存 API key。

Test Data：使用假端點、假 key、Mock 模式與測試專案。

保存結果：專案狀態與對話保存於 `runtime/assistant-state/state.json`；API key 僅存在本次服務環境。

real AI 的四個獨立條件：`real` 模式允許真實 AI 流程；AI 連線已驗證代表 endpoint、模型與 API key 可實際呼叫；目前專案允許「內容送往目前設定的 AI」代表需求、記憶與檔案可外送；「允許 AI 修改」且專案有寫入授權才允許修改或建立工具。前一項不會自動授予後三項權限，Mock 模式不取得實際技能建議，也不把記憶送給外部模型。

建議順序：確認頁首為 `AI real` → 執行「測試 AI 連線」→ 完成專案 AI 外送授權 → 若要修改再授予寫入、AI 修改與必要的驗證權限 → 建立新檔或套用差異時依逐檔確認與主機管理碼流程執行。

## 動作：修改、建立檔案與圖片輸入

目的：在授權與確認流程下完成既有檔案修改、新檔建立、人工編輯、靜態驗證與圖片輸入。

流程：選擇已授權檔案 → AI 提出差異或人工編輯 → 查看結果 → 主機確認 → 備份、寫入與驗證。

Interface：顯示修改模式、編輯器、Diff、圖片縮圖、確認窗與驗證結果。（程式：`#edit-content`、`#execution-update-preview`、`#draft-images`）

Interaction：使用者編輯、提出提案、逐檔確認建立、取消或移除圖片；可在 `#question` 貼入 PNG、JPEG 或 WebP，送出前移除縮圖。（程式：`/api/proposals`、`/api/jobs/:id/apply`）

Harness：單檔修改需目前版本與寫入授權；新檔最多 20 份、逐份確認、不覆寫既有檔案；圖片只有在 AI 外送授權下送出。

Validation：依授權執行 Node、Python、HTML、JSON 或 CSS 靜態檢查；未授權保留 `not_run`。

Operations：處理提案有效期限、備份、還原、圖片版本、檔案大小與圖片記憶體限制；圖片任務不會因文字任務 Edit 自動重新附加原圖片。

History：保存提案狀態、建立結果、驗證結果與圖片描述；不保存新檔候選內容、原始圖片或完整 proposal。

Test Data：使用測試程式、空白初始檔、圖片輸入與固定 Select2 Mock 流程。

保存結果：任務結果保存於 `runtime/assistant-state/state.json`；實際檔案與修改前內容保存於專案資料夾與 `runtime/backups`；圖片版本保存於 `runtime/assistant-state/generated-images/<projectId>/<conversationId>/<seriesId>/`。

## 動作：查看任務工作台與執行回饋

目的：讓使用者知道 Agent 做了什麼、取得什麼、目前是否需要確認，以及最後產生什麼結果。

流程：任務卡片 → 公開時間線 → 詳細資訊 → 來源、Diff、驗證與耗時。

Interface：Decide 顯示操作目的，Act 顯示路徑或搜尋詞，Observe 顯示來源與結果，Repeat 顯示下一步；`id="task-*"` 在執行中與等待確認時展開，完成或歷史任務時收合。（程式：`renderTaskActivity()`、`#task-*`）

Interaction：查看任務詳情、來源、修改工作台、Diff 與驗證；可取消執行或選取舊任務。（程式：`poll()`、`#execution-inspector`）

Harness：只顯示程式控制的公開事件，不展示模型隱藏 Thought；未授權驗證顯示 `not_run`，不產生虛構命令紀錄。

Validation：顯示工具 schema、來源版本、驗證命令、stdin、exit code 與限量輸出。

Operations：執行中每 250ms 輪詢；無新資料時不重建整張卡片，頁面可見期間每秒更新經過時間。

History：保存公開事件、工具摘要、模型、token、耗時、來源與驗證。

Test Data：使用查詢、修改、等待確認、取消、失敗與歷史任務。

保存結果：公開任務資料保存於 `runtime/assistant-state/state.json`；頁面重新載入後可恢復歷史查看。

## 動作：保存、重啟與權限限制

目的：說明哪些資料可恢復、哪些權限會失效，以及目前系統的邊界。

流程：任務保存 → 服務重啟 → 載入歷史 → 重新授權外部專案 → 重新建立可執行環境。

Interface：顯示歷史回答、token、建立結果、驗證紀錄、授權狀態與錯誤。（程式：`/api/conversations`、`/api/jobs/:id`）

Interaction：重新整理查看歷史、重新授權、建立新任務或重新提出修改。

Harness：不能由歷史記憶繞過修改、建立、驗證、主機套用或 AI 外送權限；重啟後不恢復可執行提案。

Validation：確認授權、檔案版本、提案期限與外部修改。

Operations：處理服務重啟、外部資料夾重新授權、檔案大小、任務上限與模型限制。

History：保存問題、任務狀態、公開計畫、事件、工具摘要、證據、回答、token、起迄時間、修改模式與驗證紀錄；新檔保存路徑、用途、決定與驗證結果，圖片只保存描述。

Test Data：測試授權撤銷、服務重啟、檔案外部修改、逾時與失敗。

保存結果：`runtime/assistant-state/state.json` 保存對話與公開任務；不保存新檔候選內容、原始圖片、完整 proposal 或含備份路徑的 applied 物件；實際檔案、`runtime/backups` 與 `runtime/audit.jsonl` 分開保存；管理碼與可執行授權不保存。

## 目前限制

Interface：模型執行不是逐 token 串流，快速步驟可能直接顯示完成；桌面版修改前後並排，窄螢幕改直向。（程式：`#task-workbench`、內容容器的 flex／gap）

Interaction：尚未執行瀏覽器功能測試時，人工測試結果不會自動記錄；新檔案取消只取消尚未建立項目。

Harness：支援 `.html`、`.css`、`.js`、`.mjs`、`.cjs`、`.json`、`.py`；單檔最多 32 KiB、整批最多 256 KiB；新檔父資料夾必須存在，不接受連結或超出專案範圍路徑。

Validation：靜態檢查不等於完整功能測試；未授權驗證不執行；模型與 API 實際用量和本機估算分開。

Operations：新檔提案最多保留 60 分鐘；授權過期、撤銷或續期變更後需重新提出；圖片最多 5 張，單張 1–20 MB，服務圖片記憶體總額 512 MiB，最多 4,000 萬像素。

History：`memory.confirmed` 目前沒有項目數量或總字數上限；歷史可恢復查看，但不可重建差異、繼續舊提案或重播套用／還原。

Test Data：Mock、測試資料與真實資料的結果不可互相推論；公司端點、SQL Server、Oracle 與內部 API 仍需個別核准與實測。

保存結果：原始對話仍保存在 `runtime/assistant-state/state.json`；摘要不覆蓋原始任務，實際檔案與備份仍保留於磁碟。
