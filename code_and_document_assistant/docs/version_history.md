# 修改版本與驗證歷史

## 紀錄格式與驗證規則（2026-09-29）

- 本文件依日期由新到舊收納功能增量與測試結果。
- 每個日期章節固定記錄：功能變更、驗證範圍、實際命令、驗證結果、限制與相關文件。
- 驗證結果只引用三份報告已記載的實際結果，不把未測試項目寫成完成。
- 相同功能或相同測試只保留最新結果；較早結果只在能說明歷史基準時保留。
- 測試數量、exit code、瀏覽器結果與是否使用真實 API 必須明確寫出。
- 表格改用條列與縮排；不使用粗體；每個日期章節最多 25 行，包含空白行。
- 詳細測試原文保留於 [backup/archive/test_report.md](backup/archive/test_report.md) 與 [backup/archive/test_report_phase1.md](backup/archive/test_report_phase1.md)。

## 版本規則與目前限制（2026-09-29）

- 實際套用修改使用 `MMDDhhmm_序號`；記錄於 `runtime/audit.jsonl`，備份位於 `runtime/backups/`。
- 目前是檔案級備份，不是完整專案快照；整案版本與整案還原仍是下一階段。
- 對話與任務保存於 `runtime/assistant-state/state.json`；重啟保留歷史，但清除外部授權與可執行提案。
- 保存、權限、圖片、解析與 AI 連線的最新細節分別見 [README](README.md)、[AI 連線流程](ai_connection_flow.md) 與 [工作台流程](task_workbench_flow.md)。
- 本文件的歷史測試結果已由 `backup/archive/test_report.md` 與 `backup/archive/test_report_phase1.md` 交叉核對；未把未驗證項目標為完成。

## 可存取性與圖片預覽修正（2026-10-04）

- 功能變更：Select2 圖片模型選單的內層 `role="textbox"` 補上「選擇圖片模型」名稱，避免重複產生 `No label associated with a form field`。
- 功能變更：`#ai-edit-label` 在首次載入與切換專案後預設勾選；使用者仍可自行取消。
- 功能變更：貼入附件與生成圖片的 lazy image 寫入明確 `width`／`height`，避免圖片尺寸警告與版面跳動。
- 排查結果：`#execution-inspector` 僅更新文字、區塊與可展開內容，沒有產生表單欄位；展開已選取的 `#task-activity-*` 不再重繪整張任務卡片。
- 驗證範圍：連續重繪與實際展開活動面板皆未產生 FormLabel Issue，且活動元件在展開後仍保留。
- 驗證命令：
  - `node .\code_and_document_assistant\tests\form-label-browser.js`
  - `node .\code_and_document_assistant\tests\image-creation-browser.js`
- 驗證結果：兩項本機 Chrome 測試通過，涵蓋初始頁、授權、Select2、差異檢視、執行詳情重繪與圖片時間線；exit code 0。
- 驗證結果：使用者在更新後確認 `No label associated with a form field` 不再持續增加。
- 限制：未使用真實 API key 或圖片生成服務；DevTools 既有 Issues 計數須關閉並重開 DevTools 後才能觀察新的工作階段。

## 可選自動對話記憶（2026-10-01）

- 功能變更：
  - 在「允許 AI 修改」右側加入「自動整理記憶（額外 token）」，預設關閉，real AI 模式才顯示。
  - 文字任務明確傳送 `autoMemory`；未勾選維持本機整理，勾選才使用目前端點與模型產生五類記憶。
  - 預算內使用完整文字歷史，超過預算改用有效摘要、近期與相關原文；記錄版本、更新原因及用量。
  - 摘要失敗保留上一版；來源撤權、取消、修訂或刪除時，不提交失效摘要。
- 驗證範圍：模擬 API、HTTP 模式切換、保存／重載、失敗處理與瀏覽器介面；未使用真實 API key。
- 實際命令：
  - `node --test tests/conversation-memory.test.js tests/context-skills.test.js tests/ai.test.js tests/task-edit-flow.test.js tests/task-timeline.test.js`
  - `node tests/task-card-browser.js`
- 驗證結果：相關測試 31 項通過；瀏覽器驗證預設關閉、右側位置、摘要版本與用量顯示通過，exit code 0。
- 全套回歸：88 項中 81 項通過、7 項未通過；涉及其他版面樣式與圖片服務狀態斷言，未宣稱全套通過。
- 限制：記憶 token 為本機估算預算，不是 Agent Loop 全部輸入的精確 token 計數；公司端點仍需實際驗證。
- 相關文件：[工作台流程](task_workbench_flow.md#自動記憶整理與上下文壓縮勾選啟用)。

## 圖片創作與模型選擇（2026-09-30）

- 功能變更：圖片創作支援 `gpt-image-2.5-sunburst` 與 `gpt-image-1` Select2 選擇器。
- 使用流程：
  - 啟動 BAT：啟動本機 Express 圖片服務。
  - 暫時輸入 API key：只存在本次 Node 程序。
  - 載入 AI／圖片模型設定：讀取 `config/ai.local.json`。
  - 開啟瀏覽器工作階段：建立工作階段與 CSRF token。
  - 選擇專案：指定圖片任務的保存範圍。
  - 授權專案使用 AI：核准目前專案外送提示詞。
  - 輸入圖片提示詞：貼上完整圖片創作需求。
  - 選擇圖片模型：預設使用 Sunburst 模型。
  - 確認創作：確認模型與完整提示詞內容。
  - 後端再次檢查權限：驗證專案與模型白名單。
  - 呼叫圖片 API：獨立呼叫 OpenAI Images API。
  - 保存 PNG 與 JSON：保存圖片與版本提示詞紀錄。
  - 顯示在對話時間線：支援預覽、下載與建立新版。
- 驗證命令：`node --check public/image-creation.js src/image-creation.js server.js`。
- 驗證結果：前端、後端與服務路由語法檢查通過。
- 驗證結果：使用者實際產生 PNG，並在 `image` 對話時間線顯示。
- 限制：真實圖片 API 額度與模型費用依使用者帳號計算。
- 相關文件：[AI 連線流程](ai_connection_flow.md)。

## 差異與圖片預覽（2026-09-27）

- 功能變更：差異檢視改用固定版本 diff2html；圖片檢視改用本機 PhotoSwipe 5.4.4。
- 支援逐行紅綠差異、左右並排、長段收合、縮放百分比、拖曳、切換與關閉。
- 介面入口：任務卡片的 `#task-workbench-*`、`.task-diff`、`#diff-details-*` 與 `#verification-details-*`。
- 差異比較只在瀏覽器產生檢視結果；複製保留完整原文；套用仍需主機確認、備份與靜態驗證。
- 差異套件固定為 diff2html UI Slim 3.4.52、jsdiff 5.2.0、highlight.js 11.9.0；首次展開才載入 CDN。
- 圖片入口為 `#image-draft`、`#task-images-*` 與同一 `imageCreation.seriesId` 的完成版本。
- 圖片預覽使用本機 PhotoSwipe 5.4.4；支援縮放、鍵盤、切換、關閉與錯誤提示，不呼叫圖片生成 API。
- 驗證命令：`node code_and_document_assistant/tests/review-viewers-browser.js`，涵蓋差異、複製、CDN 備援、圖片操作與版本範圍。
- 驗證範圍：差異顯示、圖片預覽、套件載入與操作說明。
- 驗證結果：功能已記錄於流程文件；未宣稱真實模型或付費 API 驗證。
- 限制：詳細套件位置與操作仍以封存的 [差異與圖片預覽](backup/archive/diff_and_image_preview_flow.md) 為準。

## 任務需求版本（2026-09-26）

- 功能變更：任務卡片加入 Edit／View；同一卡片保存 v1、v2 等需求版本。
- 舊版本保留需求、工具紀錄與驗證結果；重新送出建立新版本，不覆寫歷史版本。
- 短確認綁定待延續任務；送出或取消編輯後清空問題框。
- 驗證範圍：版本載入、短確認、任務卡片更新與背景更新。
- 驗證結果：功能規格已與 [任務編輯流程](task_version_flow.md) 對齊。
- 限制：需求版本與檔案備份版本分開；不會自動還原已寫入檔案。

## 對話記憶與受控技能（2026-09-20）

- 功能變更：保存已確認需求、取代關係、壓縮摘要、最近四輪與最多兩輪相關舊內容。
- 新增需求釐清、任務規劃、驗證檢查三種唯讀技能；建議階段不呼叫模型。
- 驗證命令：`node --test` 全量回歸。
- 驗證結果：52/52 通過；瀏覽器技能流程、AI 流程、圖片流程均通過。
- 另驗證 `context-skills-browser.js`：按開始後只提供 `finish` 工具，重整後記憶仍保留。
- 限制：未使用付費 API；技能不能修改檔案、建立新檔或擴大授權。
- 詳細流程見 [查詢與修改工作台](task_workbench_flow.md)。

## 逐檔建立與圖片貼入（2026-09-19）

- 功能變更：可提出 1–20 份新檔並逐份確認；問題欄支援 PNG、JPEG、WebP，最多 5 張。
- 圖片單張預設 10MB，可在介面設定 1–20MB；重整保留，重啟清除。
- 驗證命令：`node --test`、`create-images-browser.js`、`ai-browser-smoke.js`、`browser-smoke.js`。
- 驗證結果：48/48 通過；三套瀏覽器測試通過；390px 無水平溢出。
- 驗證涵蓋：逐檔確認、略過、取消、權限、圖片格式／大小／數量與服務重啟清除。
- 限制：使用隔離服務與假模型，未驗證真實模型圖片理解或生成。

## 對話內執行紀錄（2026-09-19）

- 功能變更：任務卡片顯示摘要、模型、token、耗時與公開執行紀錄；右側詳情跟隨選取任務。
- 保存起迄時間、修改模式、還原旗標與套用驗證紀錄；不保存可重播提案。
- 驗證命令：`node --test`、`ai-browser-smoke.js`、`browser-smoke.js`。
- 驗證結果：43/43 通過；兩套 Chrome 流程通過；無頁面 JavaScript 錯誤。
- 驗證涵蓋：手動收合、任務切換、取消、重載、驗證紀錄、修改、還原與手機版。
- 限制：沒有新增任意命令、多檔修改或使用者專案的瀏覽器功能測試。

## OpenAI 與公司 AI 連線（2026-09-16）

- 功能變更：加入 Responses／Chat adapter、完整 endpoint、模型、省略模型、認證標頭、key 環境變數與受控工具循環。
- 驗證命令：`node --test tests/ai.test.js`；完整後端回歸；`ai-browser-smoke.js`；`browser-smoke.js`。
- 驗證結果：AI 新測試 9/9、完整回歸 41/41 通過；real 假端點 Chrome 流程通過。
- 驗證涵蓋：schema、引用、權限、外送禁止、版本提案、確認寫入、429／401、逾時與取消。
- 工具循環：模型選擇受控搜尋／讀檔／計算／單檔提案，後端檢查範圍、schema、權限與版本，再把實際結果回傳模型。
- 介面只顯示實際工具事件；不能因模型文字宣稱已修改，就標示檔案已寫入。
- Mock 使用固定規則與固定範例；real 使用 adapter，不能把 PowerShell、`Get-Content` 或任意 shell 當成專案助手能力。
- 限制：未使用使用者 key、官方付費模型或公司端點；SQL、Oracle、內部 API 未接入。
- 詳細設定與排錯見 [AI 連線流程](ai_connection_flow.md)。

## 雙層授權（2026-09-16）

- 功能變更：全域唯讀參考、個別專案可寫根目錄、授權續期／撤銷、搜尋排除與重啟失效。
- 驗證命令：專案 HTTP／scope／acceptance／phase2／projects 測試、語法檢查與兩套 Chrome 測試。
- 驗證結果：後端 32/32 通過；授權、HTTP、側欄、手機版與重啟清除權限均通過。
- 驗證涵蓋：父層唯讀、A 可寫、B 唯讀、跨專案拒絕、撤銷、索引異動與錯誤管理碼。
- 任務資料固定保存 targetProject、referenceProjects、allowedActions 與對話摘要；參考檔案保留專案、完整路徑、版本／hash。
- 每個索引項目帶 rootId；修改、驗證、還原與提案都核對目標專案、授權範圍及檔案版本，外部變更則拒絕套用。
- 對話可依專案切換與重啟恢復；目標存在分頁 sessionStorage，舊提案不恢復執行能力。
- 來源優先順序為目前目標、個別唯讀參考、全域唯讀參考；同一路徑只顯示一次，全域來源不能成為修改目標。
- 排除助手、runtime、備份、依賴、`.git`、`.env*`、密鑰與暫存；索引仍受檔案數量、大小、深度與逾時限制。
- 到期會隱藏來源檔案；重啟只保留專案登錄與預填值，不恢復外部權限。AI 外送仍需另行授權，不能由全域唯讀權限繞過。
- 授權流程為 request → 主機管理碼 approve → Workspace.authorize → Workspace.update；提出請求階段不讀取資料夾。
- 管理碼由後端啟動時產生 6 碼十六進位值，只存在後端記憶體；不寫入前端、索引、回應或稽核資料。
- 全域唯讀只能搜尋與讀取；個別目標才可依 read／write／verify／ai 權限執行後續流程，建立資料夾也需主機確認。
- 限制：未測 Select2 外部 CDN、真實 AI、SQL、API、正式 LAN 與多人負載。
- 詳細規則見封存的 [雙層授權流程](backup/archive/dual_layer_authorization_flow.md)。

## 側欄與快速重新授權（2026-09-15）

- 功能變更：平面專案列、對話收合、快速續期、管理選單、最近活動排序與倒數隱藏檔案。
- 修正專案展開 ID 查詢造成的 null TypeError；統一使用 Flaticon UIcons CDN。
- 驗證命令：`node --check`、後端測試、`sidebar-smoke.js`、`browser-smoke.js`。
- 驗證結果：後端 31/31 通過；Chrome PASS；390px 無水平溢出；所有命令 exit code 0。
- 驗證涵蓋：收合恢復、權限預填、錯碼拒絕、續期、到期、重啟與雙分頁。
- 限制：本次未重跑 Select2 外部 CDN；使用者 4317 服務未重啟。

## 空白檔案與新建專案根資料夾（2026-09-15）

- 功能變更：空白程式檔可載入編輯器並建立第一版；授權後可建立最後一層空資料夾。
- 建立前不讀取或寫入；主機管理碼確認後建立，父資料夾必須存在，既有資料夾拒絕覆寫。
- 驗證命令：語法檢查、專案 HTTP／scope／acceptance／phase2／projects 測試與 `browser-smoke.js`。
- 驗證結果：空白檔流程 31/31 通過；新資料夾流程 30/30 通過；Chrome 驗收通過。
- 限制：仍是單檔備份；沒有整案版本、整案還原、成果收藏或歷史遷移。

## 三主題前端與多專案改版（2026-09-14）

- 功能變更：專案樹、對話清單、授權視窗、唯讀參考、模式切換、草稿提示、差異與來源展開。
- 驗證命令：專案 HTTP／scope／acceptance／phase2／projects 測試與兩套 Chrome 流程。
- 驗證結果：後端 30/30 通過；Chrome PASS；Select2 CDN／SRI、手機版與雙分頁通過。
- 驗證涵蓋：切換清除編輯器、@project、授權、人工修改、靜態驗證、還原與對話恢復。
- 限制：未接入真實 AI、整案版本、成果收藏、草稿磁碟保存或歷史搬移。

## 多專案隔離第一、二增量（2026-09-14）

- 功能變更：任務限定目標、參考專案、@project、跨專案拒絕、專案登錄與獨立對話。
- 驗證命令：project scope／HTTP／acceptance／phase2／projects 測試與 Chrome 測試。
- 驗證結果：第二增量後端 30/30 通過；第一增量 28/28 通過，重疊根目錄 1/1 通過。
- 驗證涵蓋：A 可寫、B 唯讀、C 不可讀、撤銷、重啟、索引、兩分頁與手機版。
- 限制：當時尚未接至完整 HTTP／前端的部分已由後續增量補上；整案版本與真實 AI 仍未完成。
- 詳細規則見 [封存的專案隔離設計](backup/archive/project_isolation_and_cross_reference.md)。

## Select2 建立與離線搜尋驗收（2026-09-13）

- 功能變更：固定 Mock 範本可建立子資料夾、索引、預覽與 CDN／SRI 錯誤提示。
- 驗證結果：Select2 Chrome 流程通過；離線搜尋 26 項回歸、11/11 預期結果與 13/13 引用檢查通過。
- 驗證涵蓋：搜尋、多選、清除、空結果、手機版、直接開檔與來源定位。
- 評估集：11 題合成案例，開發組 5/5、保留組 6/6、全部首筆結果由 7/11 改善為 11/11。
- 引用結構：檔案、版本、片段與位置 13/13 一致；這不是語意正確率或外部盲測。
- 搜尋改善：完整詞邊界、檔名命中、中文詞組權重、大小寫／全半形正規化；未新增 embedding 或網路服務。
- 效能記錄：平均 1.63ms、中位數 1.17ms、最大 5.57ms；小型資料且含檔案 I/O，不作正式效能保證。
- 限制：內容是固定 Mock，沒有透過對話理解任意需求；不代表公司真實整合。
- 詳細流程見 [Select2 專案流程](select2_project_flow.md) 與 [封存評估報告](backup/archive/evaluation_report.md)。

## 收尾驗收與下一階段條件（2026-09-13）

- 重跑命令：後端 acceptance／phase2、`evaluation/run.js` 與 `browser-smoke.js`。
- 記錄結果：26 項回歸、11/11 檢索預期結果、13/13 引用結構檢查與瀏覽器流程通過。
- 測試使用隔離合成資料；依賴或沙箱阻擋時列為未執行，不列為通過。
- 評估限制：案例不是外部盲測；引用結構通過不等於語意正確；未使用付費 API。
- 下一階段條件：真實 AI、資料庫、內部 API 與程式功能測試，需先取得核准端點、唯讀帳號、資料範圍與隔離 profile。
- 品質評估應保留基準組與未調整案例，記錄命中、引用、完成率、延遲、工具次數與可取得的 token／成本。
- 只有實際測試結果才能更新版本狀態，不以模型自評或合成案例代表公司準確率。

## 第一階段基準驗收（2026-09-12）

- 驗證命令：`node --test tests/acceptance.test.js`、`browser-smoke.js`。
- 驗證結果：後端 13/13 通過；Chrome PASS；桌面與手機版無水平溢出；無未處理 JavaScript 錯誤。
- 驗證涵蓋：查詢、引用、衝突、缺條件、權限、索引、人工修改、備份、還原與 HTTP 隔離。
- 解析涵蓋：PDF、DOCX、PPTX、XLSX、XML 拒絕 DTD、損壞檔案與取消。
- 限制：當時 AI、SQL、Oracle、內部 API、OCR、Office 複雜內容與功能測試未接入。
- 這是歷史基準，不覆蓋後續 real AI、專案隔離與圖片能力驗收。


