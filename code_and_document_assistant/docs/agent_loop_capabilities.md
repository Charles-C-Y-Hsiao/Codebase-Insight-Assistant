# Agent Loop：目前工具能力與 Act 分類

本文件以 `C:\Web_Practice\ReAct\code_and_document_assistant` 為專案根目錄，整理專案助手目前的 Agent Loop、工具邊界、驗證流程與操作模式。

## 閱讀方式

每個動作都用同一組結構閱讀：

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

這三層不是三個互相分離的功能，而是同一個動作的不同觀察角度：

```text
Interface   → 使用者看見什麼？
Interaction → 使用者可以做什麼？
Harness     → Agent 實際被允許做什麼？
```

## 動作：判斷改動屬於哪一層

目的：在修改功能前先保留目的與脈絡，避免只從 CSS 選擇器或 DOM ID 開始改動。

流程：

```text
說明目的 → 判斷 Interface／Interaction／Harness
→ 檢查是否影響真實 LLM 流程 → 設計可驗證結果
```

Interface：使用者看到的位置、間距、圖示、tooltip、任務卡片、時間線、差異與驗證紀錄。

Interaction：使用者選取專案、提出需求、確認修改或取消操作；例如取消 `#mode-query` 後，應明確回到 query 模式。

Harness：決定模型可使用哪些工具、可讀寫哪些檔案、何時等待確認、如何備份、如何驗證及如何留下紀錄。

Validation：確認使用者真的能完成該操作，而不是只有畫面看起來正確。

Operations：每完成數個 UI 調整，就補強一條可實際操作的完整流程。

History：用小型待辦保存觀察、目的、目前實作與下一步，例如 `#tools`、`#events`、`#plan`。

Test Data：

```text
觀察：Codex 顯示工具執行紀錄
目的：讓使用者知道 Agent 做了什麼
你的版本：#tools、#events、#plan
下一步：讓真實 LLM 工具結果也進入同一套紀錄
```

保存結果：介面狀態、互動狀態與 Harness 規則應能分別追蹤。

## 動作：執行受控 Agent Loop

目的：讓專案助手具備類似 ReAct 的多輪工具流程，但不把 Codex 的原生權限誤認為 API key 自動提供的能力。

流程：

```text
Thought（隱藏）
  ↓
Decide → Act → Observe
           ↑       │
           └─ Repeat
                   │
                   ↓ Stop
             finish → Final Answer
```

Interface：時間線公開顯示行動摘要與結果，例如 `Decide：規劃 tooltip`、`Act：搜尋檔案`、`Observe：取得搜尋結果`，不直接顯示原始 Thought。

Interaction：使用者提出需求、查看工具結果、等待確認、確認修改或取消任務。

Harness：

- `Decide`：模型依需求、上下文與工具定義選擇下一步。
- `Act`：提出並執行受控工具呼叫。
- `Observe`：接收搜尋結果、檔案內容、差異、錯誤與驗證結果。
- `Repeat`：依結果繼續下一輪，受最大輪數、工具次數、輸出長度與時間限制。
- `Stop`：完成、等待確認、發生錯誤或達到執行上限時停止。
- `Final Answer`：由 `finish` 整理結論、依據、推論、未確認事項與驗證結果。

Validation：`Stop` 不一定等於 `Final Answer`；修改或建立檔案時，`Stop` 可能只代表暫停等待確認。

Operations：目前的核心優先順序是：選定專案與授權 → 搜尋／讀取 → LLM 提出差異 → 使用者確認 → 主機寫入與備份 → 靜態驗證 → 顯示紀錄。

History：工具行為與結果應進入任務時間線，而不是直接顯示開發環境指令。

Test Data：目前工具對應為 `read_file`、`search_documents`、`calculate`、`propose_edit`、`propose_new_files` 與 `finish`。

保存結果：任務狀態、差異、工具結果、驗證結果與稽核資料由專案後端保存；Codex 的 UI、終端機、原生執行紀錄與安全沙箱不會因 API key 自動出現。

## 動作：使用 API key 連接 LLM

目的：說明 API key 能啟用什麼，以及不能代替哪些後端權限。

流程：API key 只提供給專案後端呼叫 OpenAI API，再由後端依工具定義控制 Agent Loop。

Interface：顯示公開行動摘要與 Final Answer，不顯示模型原始內部思考。

Interaction：使用者可提出問題、查看進度、確認提案或等待任務停止。

Harness：API key 不會自動提供以下能力：

- 任意執行 PowerShell 或 Shell。
- 任意讀取或修改本機檔案。
- Codex 原生執行紀錄與隱藏 Thought。
- 自動安全控管與使用者授權。

真正能否讀取、修改或執行，取決於後端是否提供工具，以及工具的路徑、權限、時間與輸出限制。

Validation：確認每個工具都有固定用途、授權範圍、逾時與輸出上限。

Operations：API key、Codex 工作區權限、終端機權限與原生介面是不同層次，不能互相推論。

History：記錄模型要求的工具、工具結果、停止原因與最終摘要；不保存或公開原始 Thought。

Test Data：使用 `read_file`、`search_documents`、`propose_edit` 與 `finish` 測試最小閉環。

保存結果：保留受控工具結果與公開摘要，不把 API key 或模型隱藏推理寫入前端紀錄。

## 動作：產生並驗證修改提案

目的：讓 EDIT 流程在寫入前先發現可安全檢查的錯誤，並保留使用者對寫入的最終控制權。

流程：

```text
AI 讀取授權檔案並提出差異
→ 依檔案類型與啟用白名單執行唯讀預檢
→ 失敗時交回 AI 修正，最多三輪
→ 顯示差異與驗證紀錄
→ 使用者確認套用，或選擇強制套用
→ 再次確認版本、授權、備份、寫入與套用後驗證
```

Interface：顯示差異、預檢狀態、每輪結果、失敗原因與確認／強制套用入口。

Interaction：使用者可以不套用，或在預檢失敗後明確選擇強制套用。

Harness：`propose_edit` 只提出方案；寫入前仍需版本檢查、路徑授權、備份、使用者確認與稽核紀錄。強制套用不能略過這些規則。

Validation：第一版已完成：候選內容在顯示確認按鈕前預檢；真實 AI 預檢失敗時最多重新提出三輪；CSS 目前檢查括號、註解、字串與「屬性: 值」結構。

Operations：驗證規則管理視窗與側欄唯讀清單只允許固定驗證器啟用或停用。

History：保留最後一版差異、每輪結果、強制套用選擇、規則異動與套用後結果。

Test Data：初始規則為 JavaScript 語法、Python compile、HTML 基本結構、JSON 語法與 CSS 基本語法。

保存結果：寫入後保存版本、備份、驗證結果與稽核紀錄；目前 CSS 未安裝或執行正式 CSS linter。

## 動作：管理受控驗證器

目的：提供固定的驗證能力，不把管理頁變成任意程式執行入口。

Interface：一般頁面唯讀顯示啟用規則、適用副檔名、預檢狀態與最後結果。

Interaction：管理者透過獨立驗證規則管理視窗，以六碼十六進位本機主機確認碼新增或停用受控規則。

Harness：白名單不接受任意 PowerShell、Python、Shell 指令或參數；每個驗證器都有固定實作、逾時與輸出上限。

Validation：規則第一版全服務共用，不依專案各自設定；後續才評估專案層級規則。

Operations：若未來採用 Stylelint 等正式 CSS linter，必須先納入固定版本、固定啟動方式與限制，才可由管理介面啟用。

History：稽核規則異動、預檢輪次、失敗原因、強制套用與套用後結果。

Test Data：使用不同副檔名的 JavaScript、Python、HTML、JSON、CSS 範例測試適用規則。

保存結果：驗證規則設定與執行結果由後端保存，前端只呈現受控結果。

## 動作：維持 Shell 與系統資源邊界

目的：在未開放任意程式執行的前提下，逐步評估是否增加受控 Shell 工具。

Interface：向使用者顯示工具是否可用、需要何種授權，以及工具結果與停止原因。

Interaction：使用者必須知道何時需要授權或確認，不能把未授權操作誤認為執行失敗。

Harness：目前不開放任意 PowerShell、Shell、程式執行、未受限網址或系統資源存取。

Validation：若未來增加 Shell 工具，至少限制指令白名單、工作目錄、檔案路徑、輸出長度、執行時間、授權確認與完整時間線。

Operations：採用受控工具，而不是直接開放任意 PowerShell，以降低命令注入、越權讀寫與未授權執行風險。

History：每次工具呼叫、授權、輸出、錯誤與停止原因都應可追蹤。

Test Data：使用固定且無破壞性的測試指令驗證工作目錄、輸出上限與逾時行為。

保存結果：只保存受控執行結果與稽核資料，不保存未授權的任意系統操作。

## 動作：執行 PLAN／EDIT／VERIFY

目的：區分唯讀規劃、需要確認的修改，以及唯讀驗證，不把三者混成同一種 Agent 能力。

流程：

```text
PLAN：拆解任務與驗收條件
EDIT：提出差異 → 使用者確認 → 套用、備份、驗證
VERIFY：整理證據、未驗證項目與建議測試
```

Interface：可公開顯示「已讀取 3 個檔案」、「已拆出 4 個步驟」、「未修改任何檔案」等摘要。

Interaction：PLAN 與 VERIFY 只能查看結果；EDIT 可以查看差異、確認、取消或等待套用。

Harness：

- `plan-task`：唯讀任務規劃，使用 `search_documents`、`read_file`、`calculate`、`finish`。
- EDIT：可以修改檔案，但必須經過使用者確認、備份與驗證。
- `verify-result`：唯讀驗證檢查，不能使用 `propose_edit` 或 `propose_new_files`。

Validation：單元測試確認 PLAN／VERIFY 可出現且不自動修改檔案；瀏覽器測試驗證 EDIT 的修改、確認、套用、靜態驗證與還原。

Operations：VERIFY 必須區分已有證據、只有靜態檢查、尚未執行的功能測試與建議人工測試。

History：保存步驟、相依關係、驗收條件、差異、備份、驗證證據與未確認事項。

Test Data：

```text
PLAN
已讀取 3 個檔案
已拆出 4 個執行步驟
已列出 2 個驗收條件
未修改任何檔案
```

```text
VERIFY
已檢查 3 個檔案
HTML 靜態檢查：通過
瀏覽器功能測試：未執行
仍有 2 項待人工確認
```

保存結果：PLAN／VERIFY 是只讀分析技能；EDIT 才會產生差異、寫入、備份與明顯外部結果。

## 目前能力邊界與下一步

目前已有：三層視角、受控 Agent Loop、工具白名單、EDIT 確認流程、提案前預檢、固定驗證器、PLAN／VERIFY 唯讀技能，以及時間線與稽核方向。

目前限制：沒有任意 PowerShell、Shell、程式執行、未受限網址或系統資源存取；Codex 的原生 UI、工作區權限、終端機與沙箱不會由 API key 自動複製。

下一個決策：若要讓專案助手更接近 Codex，先決定是否需要受控 Shell 工具，再定義白名單、工作目錄、路徑邊界、輸出長度、逾時、授權、時間線與稽核規則。
