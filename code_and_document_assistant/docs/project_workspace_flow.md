# 專案載入與工作區流程

本文件以 `C:\Web_Practice\ReAct\code_and_document_assistant` 為專案根目錄，整理專案登錄、授權、載入、切換、對話恢復，以及跨專案參考與修改的完整流程。

## 閱讀方式

每個工作區動作都使用同一組觀察角度：

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

工作區的核心原則是：A 是唯一修改目標，明確加入的 B 只能作為唯讀參考。

## 動作：登錄專案並提出首次授權

目的：記住專案位置，再由使用者核准讀取、修改、靜態驗證、AI 與期限等操作範圍。

流程：

```text
新增既有專案
→ 輸入絕對路徑與權限
→ 提出 pending 授權請求
→ 輸入本機本次管理碼
→ 主機確認本機、身分與請求狀態
→ 授權成功並建立索引
→ 保存登錄，但不自動切換修改目標
```

Interface：左側「新增專案／管理授權」視窗、專案清單、權限選項與「開啟此專案」按鈕；中央頂部持續顯示目前目標與唯讀參考。

Interaction：使用者可輸入 `C:\Work\project_a` 這類資料夾路徑；若目標不存在，可勾選建立空資料夾，但父資料夾必須已存在，且只建立最後一層。

Harness：登錄只記住位置，不代表已取得讀取權限；授權成功前不得讀取目標內容。新建、讀取、修改、靜態驗證、AI 與期限是不同授權條件。

Validation：確認路徑為絕對路徑、父資料夾存在、管理碼有效、請求身分一致、請求狀態有效，且不覆寫既有資料夾。

Operations：啟動頁面為 `http://127.0.0.1:4317/`；設定檔見 `config/projects.example.json`，但設定檔不會自動授權。

History：專案 `grantDefaults` 保存於 `runtime/assistant-state/state.json`，不保存管理碼；重啟只恢復預填設定，不恢復權限。

Test Data：既有資料夾、新建最後一層資料夾、無效路徑、父資料夾不存在、管理碼錯誤與重複授權請求。

保存結果：保存專案 ID、名稱、路徑與預設授權設定；授權期限到期或服務重啟後仍需重新確認。

### 程式對應

- `server.js`：`createApp()`、`persistProjects()`，載入設定並保存專案資料。
- `public/app.js`：`#request-root.onclick`、`#approve-root.onclick`，送出路徑、建立選項與授權請求。
- `server.js`：`POST /api/roots/request`、`POST /api/roots/:id/approve`，建立 pending 請求並檢查身分與管理碼。
- `src/workspace.js`：`createDirectory()`、`authorize()`、`update([root.id])`，建立最後一層空資料夾、授權與索引。

## 動作：使用雙層授權範圍

目的：允許一個全域唯讀參考根目錄，同時讓目前目標專案擁有獨立寫入授權。

流程：

```text
授權 C:\Web_Practice\ReAct 為全域唯讀參考
→ 子專案與 demo 可搜尋
→ 另為目前目標專案授予寫入權
→ 重疊路徑去重
→ 一般專案彼此重疊仍拒絕
```

Interface：中央顯示目前目標與唯讀參考；全域參考不會切換目標，也不會建立新的專案對話。

Interaction：全域參考範圍外仍需明確加入 B；有效的全域參考會自動加入新任務。

Harness：A 仍是唯一修改目標；全域授權只提供唯讀搜尋。助手、runtime、備份與依賴等內容應排除在參考範圍外。

Validation：一般專案的父子根目錄重疊時由 `ProjectScope` 拒絕；全域唯讀根目錄與子專案可以重疊，但寫入仍只能落在目標專案。

Operations：完整雙層授權細節見 [backup/archive/dual_layer_authorization_flow.md](backup/archive/dual_layer_authorization_flow.md)。重啟後兩層均需重新授權。

History：保存登錄與授權預設，但不保存管理碼或重啟後仍有效的權限。

Test Data：全域根目錄、子專案、一般父子專案重疊、明確加入的個別參考與未加入的第三個專案。

保存結果：保存範圍設定與授權狀態；每次實際存取仍重新檢查期限與範圍。

## 動作：展開專案、切換目標與快速重新授權

目的：讓使用者在同一側欄管理專案、對話、期限與授權，而不誤觸換掉目前工作。

流程：

```text
點專案列箭頭／資料夾／名稱／倒數／空白處
→ 展開或收合對話
→ 點名稱時切換修改目標
→ 點「＋」重新授權，點「⋯」管理
→ 需要時選擇「開啟此專案」
```

Interface：專案側欄寬度 290px；標題可收合整個清單；使用 `fi-rc-folder-open`／`fi-rc-folder` 與 `fi-br-angle-small-down`／`fi-br-angle-small-right` 圖示。專案名稱後顯示剩餘時間，超過一小時顯示 `2 hrs`，低於一小時顯示 `47 mins`。

Interaction：專案列的「＋」可快速重新授權／延長，會帶入路徑、上次權限與分鐘數；「⋯」可查看完整路徑、重新授權、撤銷或更新索引。點名稱會切換目標，但不會取消任務。

Harness：撤銷需本分頁已有本次管理碼；後端每次存取仍檢查期限。到期後隱藏檔案，但保留對話與候選內容。

Validation：倒數每 5 分鐘更新並於到期時更新；背景分頁返回時重新核對；重新授權後才重新載入編輯檔案。

Operations：`public/sidebar.js` 管理清單與倒數；`public/sidebar.css` 管理外觀；CSP 僅允許指定 Flaticon UIcons CDN 的樣式與字型。

History：重新整理保留本分頁的展開狀態；對話歷史依最近活動由新到舊排列。

Test Data：有效授權、即將到期、已到期、重新整理、背景分頁返回、撤銷與快速延長。

保存結果：保存專案登錄與對話狀態；不保存管理碼，也不因側欄切換而重新建立錯誤的專案對話。

### 側欄 Hover 與互斥選取規則

- 持續的選取背景在下列五類元素中互斥，同一時間只標示一處：
  - 「專案」區段標題（`#project-heading-main`）。
  - 「圖片創作」區段標題（`#image-project-section-toggle`）。
  - 一般專案列（`.project-row`）。
  - 一般專案下的對話列（`.conversation-row`）。
  - 圖片創作專案列（`.image-project-row`）。
- 點選一般專案時，只標示該專案列；點選其對話時，只標示該對話列。點選圖片創作專案或任一區段標題時，也只標示新點選的元素，並清除先前的選取背景。側欄選取外觀與實際載入的專案、對話分開管理。
- Hover 只顯示在滑鼠所在的列或區段標題，移開後消失。已選取子對話時，滑鼠移到父專案列，父專案仍要暫時顯示 Hover。
- 「只限一處背景變色」指持續的選取背景；滑鼠停在另一個元素時，該元素的暫時 Hover 背景可能與選取背景同時可見。鍵盤焦點也可暫時標示目前操作的列。
- 切換一般專案、對話與圖片創作專案後，應同步更新兩個專案清單與區段標題的選取狀態，避免舊背景留到第二次點擊才清除。

## 動作：恢復日常載入與對話

目的：重啟或切換後恢復正確的瀏覽器身分、目標專案、對話與檔案清單。

流程：

```text
啟動服務
→ 載入 demo、登錄與已保存狀態
→ 建立或恢復瀏覽器身分
→ 恢復本分頁目標或預設 demo
→ 清除舊檔案選取與編輯畫面
→ 恢復目前專案的對話
→ 檢查授權並顯示索引檔案
```

Interface：左側清單提供「＋ 新對話」與歷史對話；中央顯示目前專案、對話與已索引檔案。

Interaction：點對話項目可恢復紀錄；只有「新對話」才建立新紀錄。若有未送出問題或候選修改，切換前選擇「留下繼續編輯」或「放棄並切換」。

Harness：切換不會把背景任務改成新專案，也不會自動取消原任務；服務重啟不會續跑舊任務。授權無效時可查看歷史，但讀檔前必須重新授權。

Validation：確認目前目標、對話身分、專案範圍與授權期限一致；不同分頁可以操作不同專案。

Operations：`sessionStorage` 保存目前目標與最後選取對話 ID；身分 cookie 有效 30 天並於載入時續期。

History：登錄、瀏覽器身分與歷史對話保存於 `runtime/assistant-state/state.json`；舊修改提案不恢復執行能力。

Test Data：無歷史對話、有未送出草稿、有候選修改、有效或失效授權、清除 cookie、換瀏覽器或主機網址。

保存結果：同一身分可在重啟後查看歷史；外部新增、修改或刪除檔案後，使用者需按「更新文件索引」。

### 程式對應

- `src/app-state.js`：`init()`、`conversation()`、`record()`、`save()`，載入與保存登錄、身分及歷史結果。
- `server.js`：`GET /api/session`、`GET /api/catalog`，恢復身分並提供專案清單。
- `public/app.js`：`switchProject()`、`clearTaskView()`、`loadConversation()`，切換、清除畫面與恢復對話。
- `public/app.js`：`allowSwitch()`、`hasDraft()`、`renderProjectList()`，處理未送出內容與清單。
- `server.js`：`GET /api/conversation-list`、`GET /api/conversations`、`POST /api/conversations`，列出、讀取或新增對話。
- `public/app.js`：`inventory()`、`renderFiles()`，顯示範圍內檔案與完整路徑。

## 動作：加入跨專案唯讀參考

目的：讓目前目標 A 可以查詢已授權的 B，但避免查詢範圍意外變成可寫入範圍。

流程：

```text
選擇 A 為目前目標
→ 開啟「加入參考」
→ 勾選已授權 B 或輸入 @project
→ 顯示 A 與 B 的範圍內檔案
→ 建立任務並固定當時的參考清單
```

Interface：頂部顯示 A 與 B 標籤；B 標籤的 × 可移除參考；左側收合後仍能看到目標與參考。

Interaction：使用者可用 `@project` 選擇 B，也可用 `@file` 限定查詢來源；單純輸入文字不會增加權限。要修改 B，必須先切換目標。

Harness：B 只能唯讀搜尋；未加入的 C 不進入本任務搜尋。文件與工具回傳均視為資料，不能擴大權限。

Validation：任務建立後固定當時的參考清單；之後畫面增減參考只影響新任務。API 也拒絕修改或驗證參考專案。

Operations：`public/app.js` 使用 `setReferences()`、`question.oninput`、`select()`；`src/project-scope.js` 使用 `read()`、`search()`。

History：對話保存查詢結果與證據；若要停止舊任務需取消，不會因畫面移除參考而改變舊任務。

Test Data：A 目標、B 已授權唯讀參考、未加入的 C、`@project`、`@file` 與移除參考標籤。

保存結果：保存任務當時的目標、參考清單、對話與查詢證據。

## 動作：查詢、修改與套用工作區檔案

目的：在同一工作區中區分查詢與修改，讓修改只作用於目標專案的單一檔案。

流程：

```text
查詢：送出問題 → 範圍內搜尋 → 回傳證據 → 保存對話
修改：選取 A 的單檔 → 載入候選內容 → 產生差異提案
→ 檢查範圍與版本 → 主機確認套用 → 備份、寫入、驗證、更新索引
```

Interface：查詢可直接送出問題；修改模式才顯示「實際程式檔案修改與驗證」；查詢一般不自動展開右側，按「查看來源」或證據 ID 才展開。

Interaction：查詢／修改切換只改變顯示，保留兩邊尚未送出的內容。使用者可載入、編輯、產生差異提案、確認或取消。

Harness：`src/project-scope.js` 的 `createProposal()`、`apply()` 限定寫入目標；`server.js` 的 `scope()`、`context()`、`jobFor()` 檢查任務範圍與目標；`src/engine.js` 的 `start()`、`manual()`、`apply()` 使用任務綁定範圍。

Validation：套用前檢查目標、授權與檔案版本；hash 不一致時拒絕覆蓋舊差異。套用後執行單檔備份、寫入、依授權靜態驗證與索引更新。

Operations：空白 JS／CJS／MJS／Python／HTML／CSS／JSON 可載入與建立第一份內容，但不進入搜尋或作為證據；「僅靜態驗證」檢查磁碟上已索引版本，不等於功能測試。

History：保存對話、查詢證據、差異、單檔備份與套用後結果；目前還原只針對單檔，整案版本與成果收藏尚待實作。

Test Data：查詢、單檔修改、空白初始檔、外部 hash 變更、未授權 B 修改、靜態驗證與套用後索引。

保存結果：查詢保存對話與證據；修改保存差異、備份、寫入結果、驗證結果與更新後索引。對話保存不代表真實 AI 多輪推理，目前 AI 仍為 Mock。

### 程式對應

- `public/app.js`：`setReferences()`、`question.oninput`、`select()`。
- `src/project-scope.js`：`read()`、`search()`、`createProposal()`、`apply()`。
- `server.js`：`scope()`、`context()`、`jobFor()`。
- `src/engine.js`：`start()`、`manual()`、`apply()`。
- `src/workspace.js`：`apply()`、`verify()`、`update()`，負責版本核對、備份、寫入、驗證與索引。

## 目前限制與相關文件

目前限制：一般專案彼此父子根目錄重疊時拒絕操作；服務重啟後授權需重新確認；切換不會續跑舊任務；還原只支援單檔；目前 AI 為 Mock，且不把任意工具或文件內容當成權限指令。

相關文件：

- [backup/archive/authorization-confirmation-flow.md](backup/archive/authorization-confirmation-flow.md)：管理碼產生與授權確認細節。
- [backup/archive/project_isolation_and_cross_reference.md](backup/archive/project_isolation_and_cross_reference.md)：專案隔離、跨專案參考與後續版本規格。
- [version_history.md](version_history.md)：目前版本與驗證摘要。
- [backup/archive/test_report.md](backup/archive/test_report.md)：完整歷史測試報告。
- [README.md](README.md)：啟動與日常操作說明。
