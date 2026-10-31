# 測試索引

本文件是 tests/ 的驗收入口，記錄測試來源、分類、數量與執行方式。

## 測試數量如何計算

- Node.js 會從 tests/ 自動尋找 *.test.js。
- 目前共有 26 個 Node 測試檔案。
- 每個檔案中的 test(...) 會計為一項子測試。
- 目前共 92 項 Node 子測試。
- 84/92 代表 84 項通過、8 項失敗；數字會隨測試程式增減。
- 這個數字不是 state.json、資料庫或其他執行狀態紀錄。
- *.js 瀏覽器測試不包含在 92 項內，必須另外執行。

## Node 自動測試

執行全部 Node 測試：

    Set-Location C:\Web_Practice\ReAct
    node --test .\code_and_document_assistant\tests

目前 92 項依檔案分布：

- 核心流程與 AI
  - acceptance.test.js：13，查詢、工具、修改、授權與驗證整合。
  - ai.test.js：16，Responses、Chat、認證、重試、逾時與 schema。
  - phase2.test.js：14，第二階段工作區、檔案、修改與驗收。
  - context-skills.test.js：3，技能建議、唯讀工具與上下文。
  - conversation-memory.test.js：7，摘要、最近對話、確認需求與外送。
- 記憶、圖片與專案
  - create-images-http.test.js：1，圖片草稿、圖片輸入授權與保存。
  - image-creation-flow.test.js：1，圖片生成與逐版修改。
  - image-project-flow.test.js：1，圖片專案、系列、摘要、複製與刪除。
  - images.test.js：2，圖片格式、大小、數量與所有權。
  - global-reference.test.js：1，全域唯讀參考。
  - project-http.test.js：2，專案 HTTP 授權與工作階段。
  - project-scope.test.js：1，專案範圍與跨專案隔離。
  - projects.test.js：1，建立資料夾的授權確認，以及已移除的 Select2 固定示範入口不再可用。
- 介面與版面靜態檢查
  - composer-condensed-layout.test.js：1，輸入區精簡版面。
  - conversation-memory-layout.test.js：10，記憶與技能面板版面。
  - file-list-tooltip.test.js：1，檔案 tooltip。
  - header-compact-layout.test.js：1，工作台標頭高度。
  - hover-scrollbar-style.test.js：1，捲軸 hover 樣式。
  - intro-structure.test.js：1，頁首結構。
  - layout-shell.test.js：1，三欄主版面。
  - panel-toggle-layout.test.js：2，左右面板展開與收合。
  - task-timeline-icons.test.js：1，時間線圖示。
  - task-timeline.test.js：2，時間線資料與事件。
- 任務、檔案與規則
  - new-files.test.js：2，新檔案逐份確認。
  - task-edit-flow.test.js：4，Edit、View、需求版本與重新送出。
  - verification-rules.test.js：2，驗證規則管理。

## 瀏覽器驗收

這些檔案不是 Node *.test.js 自動計數的一部分，通常需要已安裝 Chrome：

    Set-Location C:\Web_Practice\ReAct
    node .\code_and_document_assistant\tests\image-project-browser.js
    node .\code_and_document_assistant\tests\browser-smoke.js

- image-project-browser.js：圖片專案、系列摘要、產圖確認、管理碼與模式切換。
- image-creation-browser.js：圖片生成、版本預覽與圖片操作。
- create-images-browser.js：貼圖輸入、草稿隔離、授權與重啟清除。
- ai-browser-smoke.js：real AI 介面、工具執行、任務時間線與響應版面。
- browser-smoke.js：查詢、引用、專案切換、人工修改與手機版。
- context-skills-browser.js：上下文、技能建議與模式切換。
- diff-preview-browser.js：Diff2Html 行號與差異預覽。
- review-viewers-browser.js：程式差異、圖片預覽、複製與鍵盤操作。
- task-card-browser.js：任務卡片、Edit、View 與版本入口。
- task-activity-browser.js：任務活動與執行紀錄。
- task-update-floating-browser.js：浮動修改入口。
- sidebar-smoke.js：側欄、專案列、對話與響應版面。
- browser-controls.js：瀏覽器控制元件。
- form-label-browser.js：表單標籤與輸入控制。
- inspector-resizer-browser.js：右側執行詳情寬度調整。
- quick-grant-layout.js：快速授權視窗版面。

## 建議驗證順序

1. 先執行 node --test .\code_and_document_assistant\tests，取得 Node 測試總數與失敗清單。
2. 若修改圖片功能，再執行 image-project-flow.test.js、image-creation-flow.test.js 與 image-project-browser.js。
3. 若修改一般 UI，再執行對應的 *.test.js 與瀏覽器驗收檔。
4. 若修改啟動、授權或 AI 連線，再執行 acceptance.test.js、phase2.test.js、ai.test.js 及相關瀏覽器測試。
5. 報告結果時分開記錄 Node 子測試與瀏覽器驗收，不把兩者合併成同一個數字。

## 最近驗證結果

- 圖片專案整合測試：2/2 通過。
  - image-project-flow.test.js：通過。
  - image-creation-flow.test.js：通過。
- 圖片專案瀏覽器驗收：通過。
- 圖片創作瀏覽器驗收：通過。

## 測試結果的解讀

- 通過代表該測試當次的預期條件成立，不代表公司端點、真實帳號或所有瀏覽器都已驗證。
- Node 測試失敗要記錄檔名、子測試名稱、錯誤與是否為目前變更造成。
- 瀏覽器測試失敗要另外記錄 Chrome 路徑、視窗尺寸與頁面錯誤。
- 歷史測試報告放在 docs/backup/archive/；本文件只描述目前可重跑的測試。
