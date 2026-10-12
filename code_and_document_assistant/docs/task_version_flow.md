# 任務版本與任務延續

本文件說明文字任務的 Edit、View、需求版本保存、短確認延續與重新送出。相對路徑皆以 `C:\Web_Practice\ReAct\code_and_document_assistant` 為專案根目錄；完整工作台流程見 [task_workbench_flow.md](task_workbench_flow.md)。

## 版本總覽

目的：保留舊需求與執行結果，同時讓使用者建立新的可執行版本。

流程：一個對話 → 多個任務 → 一個任務包含 v1、v2、v3 等需求版本。

Interface：顯示 Edit、View、版本清單與目前版本。（程式：`#task-question-edit-*`、`#task-question-view-*`）

Interaction：載入、修改、重新送出或延續版本。（程式：`editTask()`、`/api/jobs`）

Harness：禁止重播舊提案，檢查來源版本、檔案版本與目前授權。（程式：`resolveRequest()`、`sourceVersion`、`revision`）

Validation：確認版本存在、來源正確且沒有被篡改。

Operations：處理服務重啟、過期提案與執行狀態。

History：保存舊版本與各版本執行結果。

Test Data：測試 v1、v2、v3 的建立與查看。

保存結果：`runtime/assistant-state/state.json` 的 `conversations[].jobs[].versions[]`。

## 動作：查看任務版本

目的：查看目前版本與歷史需求，不改變執行狀態。

流程：開啟任務 → 點擊 View → 展開版本清單 → 選擇版本。

Interface：顯示目前版本、舊版本、狀態與結果。（程式：`#task-question-versions-*`、`renderTask()`）

Interaction：查看版本或選擇版本進一步編輯。（程式：`editTask(job, version)`）

Harness：歷史版本只能查看，不會重播舊提案或恢復授權。

Validation：確認版本 revision 與來源關係。

Operations：處理歷史任務載入與目前對話切換。

History：保存完整需求、結果、工具與驗證紀錄。

Test Data：測試 v1、v2、v3 的顯示與選取。

保存結果：歷史版本保存在 `runtime/assistant-state/state.json`。

## 動作：編輯需求

目的：修改需求內容並建立新的任務版本，不覆寫舊版本。

流程：點擊 Edit → 載入選定版本 → 修改文字 → 送出 → 建立下一個 revision。

Interface：將需求載入輸入框並顯示編輯狀態。（程式：`#question`、`state.editingTask`）

Interaction：修改、取消或重新送出。（程式：`editTask()`、`endTaskEdit()`、`submit()`）

Harness：執行中、套用中或待確認時禁止編輯，不覆寫舊版本。（程式：`resolveRequest()`）

Validation：確認 `editJobId`、`sourceVersion` 與來源任務。

Operations：處理送出失敗、背景輪詢與草稿保留。

History：保存來源版本、新 revision 與新版本結果。

Test Data：測試從 v1 編輯成 v2。

保存結果：`revision`、`sourceVersion` 與 `versions[]` 保存於 `runtime/assistant-state/state.json`。

## 動作：重新送出需求

目的：讓編輯後的需求重新執行，但保留原版本與原結果。

流程：載入舊版本 → 修改需求 → 送出 → 重新讀取目前檔案 → 建立新提案或新結果。

Interface：顯示最新版本與本次執行結果。（程式：`show()`、`#task-*`）

Interaction：使用者重新送出並查看新結果。（程式：`submit()`、`/api/jobs`）

Harness：不直接套用舊提案，必須重新檢查檔案與授權。

Validation：檢查目前檔案版本與來源版本。

Operations：處理模型、工具、逾時與取消限制。

History：保存每一版的工具、驗證、回答與完成狀態。

Test Data：測試舊檔案已被外部修改的情況。

保存結果：需求版本保存於 `runtime/assistant-state/state.json`；檔案備份另存於 `runtime/backups`。

## 動作：短確認訊息延續任務

目的：讓「好修改」、「確認」、「繼續」等短訊息延續明確任務。

流程：收到短確認 → 搜尋目前專案與對話 → 判斷候選 → 延續或要求使用者選擇。

Interface：顯示候選任務與選擇介面。（程式：`chooseContinuation()`）

Interaction：使用者選擇延續對象或補充完整需求。（程式：`continuationJobId`）

Harness：短確認不能授予新權限、不重播舊提案，且必須重新檢查目前檔案。（程式：`resolveRequest()`）

Validation：確認任務狀態、版本與候選唯一性。

Operations：處理 `needs_input`、`partial`、`failed` 與取消。

History：保存 `continuationOf`、來源版本與來源檔案。

Test Data：測試單一候選、多個候選與無候選。

保存結果：延續關係保存於 `runtime/assistant-state/state.json`。

## 動作：處理輸入框狀態

目的：讓輸入框反映目前編輯狀態，不覆蓋使用者的新草稿。

流程：Edit 或載入版本時填入需求 → 成功送出後清空 → 執行中保持空白 → 失敗時保留草稿。

Interface：Edit 或載入版本時填入需求，成功送出後清空，執行中不覆蓋新草稿。（程式：`#question`、`questionBaseline`）

Interaction：使用者可以修改、取消或重新輸入，送出失敗時保留草稿。（程式：`submit()`、`endTaskEdit()`）

Harness：輸入框內容不能直接改變已保存版本，重新送出前必須建立新的任務版本。（程式：`resolveRequest()`、`revision`）

Validation：確認編輯中的任務與來源版本。

Operations：處理背景輪詢與送出失敗。

History：保存已送出的需求版本，不保存未送出的草稿。

Test Data：測試送出、取消、失敗與背景更新。

保存結果：已送出的需求進入 `runtime/assistant-state/state.json`；未送出的內容只留在目前頁面。

## 動作：區分需求版本與檔案備份版本

目的：避免把使用者需求版本與實際檔案備份混為一談。

流程：保存 v1、v2、v3 需求版本；套用修改時另產生 `MMDDhhmm_序號` 備份版本。

Interface：分別顯示需求版本與檔案差異。（程式：版本清單、`#execution-update-preview`）

Interaction：使用者選擇需求版本或查看備份。

Harness：需求版本不能直接重播寫入，檔案還原必須重新檢查目前內容。

Validation：確認需求版本與檔案版本。

Operations：處理備份、還原與孤立紀錄。

History：保存任務 revision 與套用事件。

Test Data：測試多次修改與還原。

保存結果：`runtime/assistant-state/state.json` 保存需求版本；`runtime/backups` 保存檔案內容；`runtime/audit.jsonl` 保存操作事件。

## 驗收與限制

Interface：顯示版本、狀態、Diff 與草稿狀態；Interaction：驗證 Edit、View、短確認、重新送出與取消；Harness：驗證版本不可重播、授權不可擴大、目前檔案必須重新檢查。

Validation：Edit 後產生新 revision、舊版本可查看、版本未被覆寫、檔案外部修改時拒絕套用。

Operations：服務重啟後可查看歷史，但不恢復執行中的提案或過期授權。

History：保留 revision、來源版本、任務結果、工具紀錄與驗證結果。

Test Data：`needs_input` 短確認、多個候選任務、v1 重新送出、草稿保留與清空。

保存結果：文字任務與需求版本進入 `runtime/assistant-state/state.json`；實際檔案備份與稽核資料進入 `runtime/backups` 與 `runtime/audit.jsonl`。
