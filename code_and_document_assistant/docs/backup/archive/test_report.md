# 專案實測報告與改版紀錄

## 對話記憶與受控技能增量（2026-09-20）

- 完整任務原始紀錄繼續保存在本機；新增已確認需求、取代關係、壓縮摘要與壓縮時間。模型只取得摘要、最近四輪及最多兩輪依關鍵字找回的較早內容，不傳送整份歷史。
- 任務可確認為需求；「改成／改用」等變更語句先要求使用者確認是否取代。長對話自動更新摘要，服務重啟保留記憶，外部資料夾權限仍依原規則撤銷。
- 新增需求釐清、任務規劃、驗證檢查三種唯讀技能。系統在本機建議並顯示原因，使用者按開始才呼叫模型；需求釐清由後端限制為 1–3 個問題，技能工具清單不包含修改或新增檔案。
- 完整 `node --test` 回歸 **52/52 通過**。新增測試涵蓋原文保留、摘要、最近／相關舊內容、需求確認與取代、技能建議不自動執行、唯讀工具限制，以及模型請求確實帶入壓縮上下文。
- `context-skills-browser.js` 通過：建議階段沒有模型請求，按開始後只提供 `finish` 工具，確認需求後重新整理仍保留。既有 `browser-smoke.js`、`ai-browser-smoke.js`、`create-images-browser.js` 亦通過；未呼叫付費 API，也未重啟使用者 4317 服務。

## 逐檔建立與圖片貼入增量（2026-09-19）

- AI 可對目前可寫專案提出 1–20 份新檔；逐份預覽、確認建立或略過。拒絕覆寫、越界、建立資料夾及過期／撤銷授權；靜態驗證失敗保留已建立檔案。
- 問題欄支援貼入 PNG／JPEG／WebP，每次最多 5 張，每張預設 10MB、介面可設定 1–20MB。圖片與設定僅存本次服務記憶體，重新整理仍在，重啟清除；外送需提交問題且有 AI 權限。
- 修改工作台改用 flex／gap，內部 margin 歸零；執行紀錄每項上下 margin 由 6px 改為 1px。
- 完整 `node --test` 回歸 **48/48 通過**；涵蓋路徑限制、逐檔決策順序、取消、圖片格式／大小／數量、所有權、外送權限、兩種 API 圖片格式及實際服務重啟後清除圖片與設定。
- `node tests/create-images-browser.js`、`node tests/ai-browser-smoke.js`、`node tests/browser-smoke.js` 三套瀏覽器測試均通過。新流程確認貼圖不觸發模型、重載保留、逐份按鈕、確認後才寫入、略過不寫入、驗證失敗保留檔案，以及 390px 版面無水平溢出。
- 新增／修改的主要伺服器及前端 JavaScript 通過 `node --check`。測試使用隔離服務、暫存專案與假模型；未使用付費 API，未關閉使用者的 4317 服務。未宣稱真實模型圖片理解或生成檔案的瀏覽器功能測試已通過。
- 操作及限制見 [查詢與修改工作台](../../task_workbench_flow.md)。以下保留較早版本的測試紀錄。

## 對話內執行紀錄增量（2026-09-19）

- 每次需求下方顯示摘要、模型／token、經過時間及完整公開執行紀錄。執行中預設展開，完成或歷史紀錄預設收合，手動收合不被更新覆蓋。
- 選取任務會同步右側詳情、來源與驗證；另一項任務的輪詢不能搶走選取。修改工作台位於選取的任務卡內。
- 起迄時間、修改模式、還原旗標與套用工具的驗證紀錄納入保存；不持久化可重播的修改提案。
- 修正上次失敗的測試設定：案例未授權 verify 卻期待取得命令。現在分別驗證授權後 Node 命令紀錄，以及未授權時的 `not_run`；未放寬正式權限。
- PowerShell：`$testFiles = @(rg --files tests -g '*.test.js'); node --test $testFiles`：**43/43 通過**，涵蓋 AI、解析、授權、專案隔離、持久化、套用與還原。
- `node tests/ai-browser-smoke.js`：**通過**。離線模型驗證對話內時間線、手動收合、兩項任務的右側選取、取消、重載後的驗證紀錄、用量及手機版無水平溢出。
- `node tests/browser-smoke.js`：**通過**。原有查詢、展開依據及引用、專案切換、草稿提示、人工修改、靜態檢查、還原及響應版面回歸；無未處理頁面 JavaScript 錯誤。
- 測試使用臨時資料夾與隔離服務，結束後關閉。未呼叫付費 API，未重啟或關閉使用者的 4317 服務。
- 本次沒有新增任意命令、多檔修改或使用者專案的瀏覽器功能驗證能力。新版使用方式與重啟注意事項見 [查詢與修改工作台](../../task_workbench_flow.md)。

## OpenAI／公司 AI 連線增量（2026-09-16）

已實作 Responses 與 OpenAI 相容 Chat adapter，可設定完整 URL、模型／省略模型、認證標頭與 key 環境變數。加入原生工具／Chat JSON 指令、逐來源 AI 外送檢查、有限工具循環、版本及引用核對、單檔提案、取消、期限與有限重試。提供隱藏輸入 key 的 start_ai.ps1 與前端固定文字連線測試。npm 依賴沿用既有安裝。

### 實際命令與結果

工作目錄 `C:\Web_Practice\ReAct\code_and_document_assistant`：

```powershell
node --test tests/ai.test.js
node --test tests/ai.test.js tests/global-reference.test.js tests/acceptance.test.js tests/phase2.test.js tests/project-http.test.js tests/project-scope.test.js tests/projects.test.js
node tests/ai-browser-smoke.js
node tests/browser-smoke.js
```

- AI 新測試 9/9 通過；完整後端回歸 41/41 通過，exit code 0。
- 涵蓋 Responses 原生工具、Chat 原生工具、Chat JSON 指令、端點指定模型、自訂認證、schema 拒絕、無效引用、重複呼叫、未許可修改、AI 外送禁止與撤銷、版本提案與確認後寫入。
- 429 只重試一次、401 不重試；本機真實 HTTP 連線逾時及取消有界結束，不顯示供應商原始錯誤內容。
- real 模式 Chrome 使用程式內假端點，連線測試只送固定文字、授權 AI 外送、取得修改提案、確認前磁碟不變、確認後寫入與 Node 靜態檢查均通過，頁面無 key 與 JavaScript 錯誤。
- 既有 Mock Chrome 查詢／來源、授權、對話、參考、草稿、修改／驗證／還原及手機寬度回歸通過。
- 測試使用假 key 與隔離暫存專案；測試 Chrome 與服務已關閉，使用者 4317 服務未重啟。

### 尚未驗證

未使用使用者 OpenAI key，未呼叫官方付費模型或公司端點；不能宣稱帳號、模型存取、公司閘道格式／TLS／額度已通過。真實 SQL／Oracle／內部 API、一般程式功能測試與真實問題品質未在此次驗收。模型語意審核不是獨立事實驗證；成本未知，token 僅記錄端點有回傳者。

操作見 [AI 連線流程](../../ai_connection_flow.md)。

## 雙層授權（2026-09-16）

完成全域唯讀參考＋個別專案可寫根目錄、前端授權類型與續期／撤銷入口、自動加入搜尋、同路徑去重、共用排除政策、全域授權到期移除與重啟失效。正式檔案及舊成果未搬動；實際 ReAct 全域授權仍由使用者在本機介面確認。AI 仍為 Mock／尚未串接。

工作目錄：`C:\Web_Practice\ReAct\code_and_document_assistant`。

```powershell
node --test tests/global-reference.test.js tests/project-scope.test.js tests/project-http.test.js tests/acceptance.test.js tests/phase2.test.js tests/projects.test.js
node --check public/app.js
node --check public/sidebar.js
node --check server.js
node --test tests/global-reference.test.js tests/project-scope.test.js tests/project-http.test.js
node tests/sidebar-smoke.js
node tests/browser-smoke.js
```

- 後端完整套件 32/32 通過；最後索引優先順序與設定欄位調整後，相關授權／HTTP 套件再次 4/4 通過。語法檢查通過。
- 新 HTTP 驗收：父層全域＋A 可寫、B 唯讀、A/demo 搜尋、排除資料、同路徑去重、全域不可選為目標、B 修改與驗證拒絕、新增／刪除索引、撤銷、重啟清除權限。
- Chrome 側欄通過：全域選項禁用寫入／驗證／建立，授權自動呈現 B 文件、不切換目標、全域到期隱藏 B 並保留 A；原側欄／授權／手機寬度回歸也通過。
- 既有 Chrome 查詢、來源、對話、草稿、跨專案參考、修改／驗證／還原與雙分頁回歸通過，無頁面 JavaScript 錯誤。
- 原測試外部專案放於助手 runtime，會命中新排除政策；測試素材已改為 OS 隔離暫存目錄，助手狀態放在其獨立子目錄。前次沙箱 EPERM 後在核准環境重跑。使用者資料未被遷移或刪除。
- 舊來源點擊測試使用通用 `.citation`，記錄的引用與實際點擊可能不同；改為給選定引用唯一測試 ID 後通過，未更動來源顯示功能。
- 測試伺服器與 Chrome 已結束，隔離測試資料清理完成；未重啟使用者 4317 服務。Select2 CDN 瀏覽器、真實 AI／SQL／API 本次未測。

操作及限制：[雙層授權流程](dual_layer_authorization_flow.md)。

## 平面側欄、快速重新授權與倒數（2026-09-15）

後續微調：每一專案列以 flex 垂直置中；除「＋」與「⋯」外，箭頭、資料夾、名稱、授權倒數及列內空白區皆可展開／收合對話。點名稱仍同時切換修改目標。

後續功能：每筆專案對話尾端提供 `fi-rc-trash` 刪除按鈕；使用者確認後，後端以工作階段身分與目標專案雙重檢查再刪除。進行中的該對話任務會先取消，並禁止完成時重新寫回已刪除的對話。

已完成平面專案列、選取底色、指定 fi class 的本機 SVG、頂部＋／⋯、逐專案授權＋與管理選單、分專案新增對話、最近活動排序、分頁收折狀態恢復。專案對話展開／收合使用 `fi-rc-folder-open`／`fi-rc-folder`；時間位於名稱後方，一小時以上只顯示整小時，一小時以下只顯示分鐘。專案列 hover 或鍵盤聚焦覆蓋前方展開按鈕至末端操作，才顯示＋／⋯。grantDefaults 保存上次權限與期限，重啟不恢復授權；舊登錄預設唯讀 60 分鐘。倒數每 5 分鐘更新，到期隱藏檔案並保留對話。背景分頁返回也重新核對。

工作目錄：`C:\Web_Practice\ReAct\code_and_document_assistant`。

```powershell
node --check public/sidebar.js
node --test tests/project-http.test.js tests/project-scope.test.js tests/acceptance.test.js tests/phase2.test.js tests/projects.test.js
node tests/sidebar-smoke.js
node tests/browser-smoke.js
```

- 語法檢查成功；後端 31/31 passed、0 failed、0 skipped。
- 新版 Chrome 驗收 PASS：初始收合、展開狀態恢復、分專案新增對話、權限預填、錯碼拒絕、快速續期不切換目標、到期隱藏檔案、重啟保留設定但清除授權、390px 無水平溢出、頁面零外部請求。
- 舊版 Chrome 回歸 PASS：查詢／來源、修改／驗證／還原、授權／開啟、草稿提示、參考專案與雙分頁隔離。調整新版按鈕選擇器、舊檔案計數文字與非同步切換等待；中途舊測試的點擊時機逾時，改為等待元素穩定後重跑成功。
- 所有命令最終 exit code 0。使用隔離 runtime 及隨機 localhost 埠，測試啟動的 Chrome 與服務均已關閉，暫存測試資料清理完成。
- 畫面：`runtime/sidebar-preview.png`。本次未重跑 Select2 外部 CDN 流程；更新其檔案計數斷言以符合現況。

後續介面修正：修復 `#project-section-toggle` 以 CSS 選擇器誤用 ID 查詢造成的 null TypeError；展開使用 `fi-br-angle-small-down`，收合使用 `fi-br-angle-small-right`。側欄展開寬度由 230px 調整為 290px；原 `fi-rr-folder-open` 改為依展開狀態使用 `fi-rc-folder-open`／`fi-rc-folder`。時間移至名稱同一行，顯示整小時或分鐘；＋／⋯只在完整專案列 hover 或鍵盤 focus 顯示。新版側欄與既有 Chrome 流程再次通過；測試服務已關閉。

圖示已改為使用者指定的 Flaticon UIcons CDN：regular-chubby 與 bold-rounded。CSP 只允許 `cdn-uicons.flaticon.com` 提供圖示樣式與字型。原有 4317 使用者服務未由本次測試重啟；使用新版時須自行以 BAT 重啟。

## 空白初始程式檔（2026-09-15）

空白 JS / CJS / MJS / Python / HTML / CSS / JSON 現在納入檔案清單並標示「空白初始檔」，可載入編輯器、建立差異並套用第一份內容；搜尋會排除它們，因此不會產生空白證據。空白文件仍顯示未索引原因。新增單元與 Chrome 驗收覆蓋這個流程；回歸結果為 **31/31 passed、0 failed**，Chrome 操作驗收通過。

## 新建專案根資料夾（2026-09-15）

授權視窗新增「路徑不存在時建立新的空資料夾」。提出請求不讀取或建立路徑；只有同一工作階段在 localhost 輸入本次終端管理碼並確認後，後端才建立指定的最後一層資料夾、授權與索引。父資料夾必須已存在；既有目標會被拒絕，不會覆寫內容。

已執行：

```powershell
node --check server.js
node --check src/workspace.js
node --check public/app.js
node --test tests/project-http.test.js tests/project-scope.test.js tests/acceptance.test.js tests/phase2.test.js tests/projects.test.js
node tests/browser-smoke.js
```

結果：語法檢查通過；後端 **30/30 passed、0 failed**。新增測試確認提出請求前目標不存在、主機確認後才建立、既有資料夾保留 `keep.txt` 而被拒絕覆寫。Chrome 驗收通過，涵蓋勾選建立、確認後的空資料夾、寫入範例檔、索引與後續人工修改／還原。

## 三主題前端操作改版（2026-09-15）

本次實作專案樹與對話清單、授權彈出視窗／明確開啟、新增唯讀參考視窗與標籤、查詢／修改模式、草稿保留提示、差異自動展開、來源主動展開，以及收合的展示區。新增 GET /api/conversation-list，列出對話不會建立新紀錄；依原有身分與專案過濾。

### 命令與結果

工作目錄 `C:\Web_Practice\ReAct`：

```powershell
node --check code_and_document_assistant/public/app.js
node --test code_and_document_assistant/tests/project-http.test.js code_and_document_assistant/tests/project-scope.test.js code_and_document_assistant/tests/acceptance.test.js code_and_document_assistant/tests/phase2.test.js code_and_document_assistant/tests/projects.test.js
node code_and_document_assistant/tests/browser-smoke.js
node code_and_document_assistant/tests/project-browser-smoke.js
```

- JavaScript 語法檢查通過；後端 30/30 passed、0 failed、0 skipped，exit code 0，包含新增對話清單不建立紀錄的斷言。
- Chrome 操作 PASS，exit code 0：授權視窗與手動開啟、專案收折不切換、問題及候選修改的留下／放棄／Escape、模式切換、@project／參考視窗／移除標籤、側欄收合後目標仍可見、對話恢复與雙分頁隔離。
- 查詢保留右側收合；點來源展開並核對實際證據 ID；新修改差異自動展開；實際單檔修改／靜態驗證／還原通過。
- Chrome 390px 頁面無水平溢出，沒有 JS 錯誤。截圖保留於 runtime/desktop-preview.png、runtime/mobile-preview.png。
- 畫面檢查後補上已展開之非目前專案的對話載入；新增重整後真實對話清單斷言，Chrome 再驗證 PASS。另對新授權請求隱藏上次成功的開啟按鈕，避免把舊成果誤認成這次請求結果。
- Select2 從新版授權視窗與「展示與測試」完成建立、索引、真實 CDN/SRI、搜尋、多選、清除、空結果、手機版、直接開檔及 CDN 阻斷提示；exit code 0。產出為 runtime/select2-walkthrough-XXXXXX8ick3f/projects/select2_product_picker/index.html，未搬動舊成果。

驗收期間修正來源導覽平滑捲動干擾連續點擊，改為直接定位。證據斷言改查實際點選的 ID；中途測試參數錯誤已修正後重跑通過。Chrome 使用已核准的沙箱外啟動方式。

### 未涵蓋

未接入真實 AI；未新增整案版本、成果收藏、草稿磁碟保存或搬移歷史資料。模式切換保留記憶體內容，關閉頁面不保證保存草稿。原有 CSS 中使用者調整的輸入高度／間距保留，本次僅新增新元件樣式。

## 多專案改版第二增量（2026-09-14）

已將 ProjectScope 接進 HTTP 與前端，新增磁碟專案登錄／對話保存、目標選單、對話選單、新對話、唯讀參考清單及 @project 選項。設定檔只登錄，重啟不恢復外部授權或可執行提案。每個任務固定原始目標、參考範圍與對話。

### 本次實測

工作目錄 `C:\Web_Practice\ReAct`：

```powershell
node --test code_and_document_assistant/tests/project-http.test.js code_and_document_assistant/tests/project-scope.test.js code_and_document_assistant/tests/acceptance.test.js code_and_document_assistant/tests/phase2.test.js code_and_document_assistant/tests/projects.test.js
node code_and_document_assistant/tests/browser-smoke.js
node code_and_document_assistant/tests/project-browser-smoke.js
```

- 後端：30/30 passed、0 failed、0 skipped，exit code 0。
- 新 HTTP 測試：A 寫入成功、B 唯讀、C 不可讀／不可作為 @file；參考專案不得驗證；不傳目標預設 demo，無法讀取外部專案。
- 任務與對話：跨專案／跨對話套用或還原被拒；A/B 對話不混用，新對話不刪旧紀錄；同一身分重啟恢復歷史，外部權限失效、舊提案不能重播。
- 設定與索引：設定登錄不讀取不存在的資料夾；projectId 重授權後不變；更新 A 不隱式更新 C；助手內部狀態資料夾不可授權為專案。
- Chrome：原查詢、引用、@file、授權、修改／靜態驗證／單檔還原通過；新增切換清除編輯器與檔案標籤、恢復各專案對話、選擇舊對話、@project 只讀、兩分頁目標獨立及手機寬度檢查，無 JS 錯誤。
- Select2 Chrome：先切換目標再建立；實際 CDN/SRI、搜尋、多選、清除、空結果、直接開檔、CDN 阻斷提示均通過，exit code 0。新測試產出 `runtime/select2-walkthrough-XXXXXXdHRuhy/projects/select2_product_picker/index.html`，舊成果未搬動。

首次回歸兩項舊 HTTP 測試因缺目標專案而被拒，已按新契約加入明確目標後全數通過；未放寬 API。首次 Chrome 沙箱啟動逾時，核准沙箱外執行後通過。

### 限制與後續

尚無整案版本／還原、成果收藏、歷史測試遷移、帳號登入／跨瀏覽器對話恢復。索引在同一 Workspace 中按 rootId 分組，未拆独立資料庫；資料夾授權仍為服務共用。對話只保存／重現結果，尚非真實 AI 多輪推理。真實 AI／SQL／API 與評估集未在本次執行。

以下保留之前各增量及階段歷史，未實作描述以日期及本節最新狀態判讀。

## 多專案改版第一增量（2026-09-14）

需求定案見 [project_isolation_and_cross_reference.md](project_isolation_and_cross_reference.md)。第一階段歷史基準保留於 [test_report_phase1.md](test_report_phase1.md)，以下舊日期結果不視為本次新測試。

新增 `src/project-scope.js` 與 `tests/project-scope.test.js`：任務限定目標與明確參考專案，搜尋排除其他專案、參考專案唯讀、空索引不退回全域搜尋、撤銷授權拒絕存取。沿用既有版本核對與單檔備份，未新增依賴。

執行命令（工作目錄 `C:\Web_Practice\ReAct`）：

```powershell
node --test code_and_document_assistant/tests/project-scope.test.js code_and_document_assistant/tests/acceptance.test.js code_and_document_assistant/tests/phase2.test.js code_and_document_assistant/tests/projects.test.js
```

結果：28/28 passed、0 failed、0 skipped，exit code 0。包含 13 項第一階段、13 項第二階段、1 項既有 Select2 與 1 項新範圍綜合測試。新增測試使用 OS 暫存獨立資料夾並清理自身產物。

之後補上重疊根目錄拒絕規則，執行 `node --test code_and_document_assistant/tests/project-scope.test.js` 再驗證：1/1 passed，exit code 0；涵蓋新範圍建立及既有任務遇到新增重疊授權時皆拒絕讀取。

本增量尚未接至 HTTP／前端，不能宣稱現有網頁已隔離專案。持久專案登錄、獨立對話、@project、整案版本／還原、收藏與歷史測試遷移仍待實作；未搬動舊 Select2 成果。此次未重跑瀏覽器/CDN、評估集或真實 AI／資料庫整合。

## Select2 建立流程增補（2026-09-13）

已新增固定 Mock 範本的專案建立功能，實際建立子資料夾與 index.html。`node --test code_and_document_assistant/tests/projects.test.js` 通過 1 項綜合測試；原本 acceptance.test.js 與 phase2.test.js 共 26 項重跑全部通過。`node code_and_document_assistant/tests/project-browser-smoke.js` 在已安裝 Chrome 中完成路徑授權、預覽、確認建立、索引、真實 CDN 搜尋／多選／清除、直接開檔與阻斷 CDN 錯誤顯示，exit code 0。第一次沙箱 Chrome 啟動逾時，取得提升執行權限後完成；中途修正了多選搜尋測試需先清空舊搜尋字串的操作。完整紀錄與限制見 [select2_project_flow.md](../../select2_project_flow.md)。

## 最新收尾驗收（2026-09-13）

第三階段離線搜尋改善後已重跑：26 項回歸全部通過（0 failed、0 skipped）；Chrome 擴充操作驗收 PASS。另以 `node code_and_document_assistant/evaluation/run.js` 驗證合成檢索集：11/11 預期結果、13/13 引用結構檢查通過。三個命令 exit code 0。詳見 [evaluation_report.md](evaluation_report.md) 與 `../../evaluation/results-2026-09-13.json`。這是離線收尾，不包含尚未設定的公司真實整合。

以下保留第二階段明細。

日期：2026-09-13。**可獨立開發部分已完成並驗證；公司 AI／SQL Server／Oracle／內部 API 尚未接入，第二階段整體未宣稱完成。**

第一階段原始報告另存 `test_report_phase1.md`，其中 Python 未驗證等描述是當時狀態，已被本報告更新。

## 本次環境

Windows / PowerShell，Node.js v20.15.1，npm 10.7.0。找到 Codex 內建 Python 3.12.14，使用 pypdf 6.10.0、lxml 6.1.1、openpyxl 3.1.5。沿用 C:\Web_Practice 的 npm 套件，未新增 npm 專案、套件或瀏覽器。

## 實際執行命令與結果

工作目錄 `C:\Web_Practice\ReAct`：

```powershell
node --test code_and_document_assistant/tests/acceptance.test.js
```

開始改動前的第一階段基準：13 passed、0 failed。後續更新 Python / HTML 靜態驗收的預期，保留原先全部情境。

```powershell
node --test code_and_document_assistant/tests/acceptance.test.js code_and_document_assistant/tests/phase2.test.js
```

最終結果：**26 passed、0 failed、0 skipped，exit code 0**，本次耗時約 8.33 秒。

```powershell
node code_and_document_assistant/tests/browser-smoke.js
```

擴充後 Chrome 瀏覽器驗收：**PASS，exit code 0**，本次約 8.57 秒。另以 node --check 檢查前端 app.js 與後端 server.js 通過。

## 實測項目

| 類別 | 證據與結果 |
| --- | --- |
| 原 13 項回歸 | 一致、衝突、缺條件、缺能力、API 失敗／逾時、注入、取消、總期限、呼叫上限、修改前確認、版本冲突、索引變動、session／路徑授權等全部通過 |
| PDF | 讀取產生的雙頁 PDF；第二頁位置為 page 2、原文符合預期；空白 PDF 回報無文字與 OCR 需求 |
| DOCX | 標題、段落 2、表格 1、產品／金額表頭與 1234 數值一致 |
| PPTX | 依簡報關聯次序，第二頁正確標 slide 2，表格表頭與數值存在 |
| XLSX | 銷售工作表、D2、表頭、2026-01-02 日期、E1:F1 合併、公式缺快取均符合預期 |
| 解析失敗 | 損壞 ZIP 明示錯誤，空白 PDF 不進索引且原因可見 |
| XML / 取消 | 拒絕 DTD 外部 entity；取消中的解析 promise 結束 |
| 真實索引 | 來源帶 real、位元組版本雜湊及定位；授權過期或撤銷後不能讀取 |
| 一般程式修改 | 非 demo 的 utility.js 可建立人工提案；唯讀被拒絕、篡改提案被拒絕、確認後備份且真實寫入 |
| 靜態驗證 | Node 語法檢查不執行範例寫檔指令；Python 不執行 import／raise，但能抓出函式外 return；HTML 基本結構檢查有效 |
| 驗證權限 | 未授權 verify 明示 not_run；授權續期改版讓舊提案失效 |
| 未設定模型 | 公司 AI 顯示 CONFIG_REQUIRED；惡意模型計畫被 schema 拒絕，工具呼叫為 0 |
| 真實模式 | 要求 real 資料工具時回報 CONFIG_REQUIRED，沒有 Mock 金額 |
| HTTP 寫入邊界 | 真實提案、套用、還原需要主機管理碼與版本；沒碼為 403；還原後內容等於原文 |

測試文件由 tests/generate_fixtures.py 產生，是真實 PDF/Office 格式中的合成內容，不是公司文件，也不是假造的 parser JSON。以固定位置與預期原文逐項斷言，不依赖模型自評。

## 瀏覽器驗收

- 產品 B 查詢顯示衝突；引用按鈕可展開來源。
- @file 清單可選，demo 修改可確認並顯示驗證結果。
- 填入隔離測試資料夾、勾選寫入／驗證、使用管理碼授權。
- 選 custom.js、載入編輯器、提出人工修改、確認套用；磁碟內容真的改成 module.exports = 3。
- 按静態驗證得到 passed；確認還原後磁碟回復 module.exports = 1。
- 1440 px 桌面、390 px 手機寬度無水平溢出，未出現未處理的瀏覽器 JS 錯誤。
- 截圖位於 runtime/desktop-preview.png 與 runtime/mobile-preview.png。

## 尚未完成與原因

| 項目 | 原因／需要補充 |
| --- | --- |
| 公司 AI 真實回應、原生工具呼叫／JSON mapping | 沒有核准 URL、認證、模型、request/response 與工具格式 |
| AI 自動修改一般檔案 | 依賴上述真實模型；目前一般提案由使用者提供候選文字，非 AI 自動生成 |
| 真實文件語意及跨來源支持度核對 | 缺模型與代表性真實標準答案；現階段是原文檢索、引用及 Mock 範例數值比對 |
| SQL Server | 缺主機／資料庫、唯讀帳號、核准 SQL、型別及欄位語意 |
| Oracle | 缺 connectString、唯讀帳號、核准 bind 查詢與欄位語意 |
| 內部 API | 缺固定目的地、確認唯讀的操作、認證及參數／回傳 schema |
| 功能測試執行 | 缺公司核准隔離環境及 profile；沒有開放任意 shell 或執行使用者程式 |
| OCR／複雜表頭／Office 非本文內容 | 未實作，解析警告明示；PDF 複雜表格未宣稱完整還原 |
| 公司 LAN、多使用者、共用磁碟與正式安全驗收 | 未提供實際環境及對照問題，僅驗證 loopback 與隔離資料 |

現有子程序輸入／輸出／時間限制與環境清理不等於完整 OS 沙箱。共享磁碟 metadata I/O、惡意文件資源隔離、稽核保存期限、ESM .js、自訂測試 profile 等仍需後續處理。

不應把第二階段所有連線驗收勾為完成。補齊核准設定後，依 `../version_history.md` 的下一階段條件繼續實作與實測，才進入第三階段品質評估。
## AI 連線診斷增量（2026-09-16）

- `node --test tests/ai.test.js`：10/10 通過；包含 DNS／TLS／連線代碼、巢狀錯誤與秘密不外洩檢查。
- `node --check src/ai-client.js`、`node --check src/ai-config.js` 及 PowerShell Parser 檢查 `start_ai.ps1`：通過。
- 使用 Node.js v20.15.1 對官方 Responses endpoint 發送無認證請求，以及透過 AIClient 使用固定假 key：均收到預期 HTTP 401，驗證本次診斷環境的傳輸可達。
- 未使用使用者 API key，未驗證 Luna 的付費呼叫；未重啟或關閉使用者的 4317 服務。
- 使用者原服務的 AI_NETWORK 根因尚待新版安全代碼確認；操作見 [ai_connection_flow.md](../../ai_connection_flow.md#連線故障排查2026-09-16-更新)。
## 修改工作台介面增量（2026-09-16）

- 新增「AI 修改程式」，人工入口改名「人工編輯／靜態驗證」。中央工作台顯示修改前後、主機確認、驗證及回報 token；右側保留執行細節。
- `node --check public/app.js`：通過。
- `node tests/ai-browser-smoke.js`：通過；假模型下驗證 AI 模式、200 輸入／40 輸出 token、確認前不寫入、套用、靜態驗證訊息及 390px 版面。
- `node tests/browser-smoke.js`：通過；既有查詢、權限、專案切換、人工修改、還原與響應版面回歸。
- 沙箱內 Chrome 啟動逾時；獲准使用隔離的無頭 Chrome 後兩套測試通過。測試服務均關閉，未重啟使用者 4317 服務，未呼叫付費模型。
- 未新增瀏覽器功能驗證能力；工作台明示功能測試尚未執行。API 沒回報的用量與費用仍標未知。

