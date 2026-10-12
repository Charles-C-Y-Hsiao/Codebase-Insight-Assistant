# 本機專案授權確認流程

本文件以 `C:\Web_Practice\ReAct\code_and_document_assistant` 為專案根目錄，整理本機資料夾管理碼、授權請求、主機確認、權限建立、索引更新與 403 排查。

## 文件定位

```text
Harness
└─ Authorization

跨層支援
├─ Validation
├─ Operations
└─ History
```

它說明的是系統允許 Agent 與工作區做什麼，不是公司登入、AD、SSO 或正式的作業系統權限系統。

## 動作：建立本機管理碼

目的：在服務啟動時建立本次本機授權確認所需的管理碼。

流程：

```text
啟動 server.js → createApp()
→ crypto.randomBytes(3).toString('hex')
→ 後端記憶體保存 adminToken
→ app.listen() 將管理碼輸出到終端
```

Interface：終端顯示本次服務的管理碼；`public/index.html` 的 `#admin` 提供輸入欄位。

Interaction：使用者從目前服務視窗取得 6 碼十六進位管理碼，再於授權視窗輸入。

Harness：前端不產生、不指定，也不能自行推測管理碼。服務重啟後通常產生新碼，舊碼失效。

Validation：管理碼由 `crypto.randomBytes(3).toString('hex')` 產生，固定為 6 碼，字元範圍為 `0–9` 與 `a–f`，共有 16,777,216 種組合。

Operations：管理碼只適合本機展示與確認；實際部署仍應改接公司認證與正式主機管理機制，並限制服務只接受可信任的本機操作。

History：管理碼不寫入 `runtime/assistant-state/state.json`、索引、前端 JavaScript、瀏覽器 storage、回應內容或稽核資料。

Test Data：服務啟動、服務重啟、使用舊碼、輸入錯誤碼、輸入非十六進位文字。

保存結果：只有目前服務程序在後端記憶體中暫時保存管理碼。

## 動作：提出授權請求

目的：在尚未讀取目標資料夾前，建立待主機確認的 pending 請求。

流程：

```text
填寫路徑與權限
→ 按提出授權請求
→ POST /api/roots/request
→ 後端建立 pending request
→ 尚未讀取目標資料夾
```

Interface：左側「新增專案／管理授權」視窗提供路徑、權限、期限與 `#admin` 輸入。

Interaction：`public/app.js` 的 `#request-root.onclick` 送出授權請求；使用者尚未取得授權前不能要求前端列出資料夾內容。

Harness：`server.js` 先建立 pending 請求，不在 request 階段讀取資料夾；請求只記錄必要的路徑欄位與選項。

Validation：檢查請求路徑格式、請求身分與 pending 狀態。

Operations：既有專案可直接指定；目標不存在時，只有在後續主機確認成功後才允許建立最後一層空資料夾。

History：pending request 必須可與後續 approve 的 request ID 對應。

Test Data：既有資料夾、不存在的最後一層、父資料夾不存在、檔案路徑、相對路徑與重複 request。

保存結果：保存待確認的 request ID 與授權選項，不保存管理碼。

## 動作：輸入管理碼並確認授權

目的：確認此次請求確實來自本機服務與有效的主機管理碼，再建立工作區權限。

流程：

```text
按主機端確認授權
→ #approve-root.onclick
→ POST /api/roots/:id/approve
→ 檢查 localhost、管理碼、request ID 與狀態
→ 成功或回傳 403
```

Interface：使用者在前端輸入管理碼後，按「主機端確認授權」。

Interaction：`public/app.js` 的 `#approve-root.onclick` 傳送 request ID 與管理碼；成功後使用者再按「開啟此專案」切換目標。

Harness：`server.js` 的 `/api/roots/:id/approve` 檢查來源是否為 localhost、管理碼是否相同、請求身分是否一致，以及請求是否仍有效。

Validation：任一檢查失敗都不授予此次權限；成功後才可執行 `Workspace.authorize()`。

Operations：授權可包含 `read`、`write`、`verify` 與 `ai`，並設定各自可用期限。

History：`Workspace.audit()` 記錄授權時間、路徑、權限與期限，但不記錄管理碼。

Test Data：正確管理碼、錯誤管理碼、過期 request、不同瀏覽器來源、服務重啟後的舊 request、非 localhost 來源。

保存結果：授權成功後保存專案登錄與授權狀態；管理碼仍不保存。

## 動作：建立資料夾並更新索引

目的：在授權成功後，建立必要的空資料夾並載入允許範圍內的檔案。

流程：

```text
要求建立且目標不存在？
→ Workspace.createDirectory()
→ Workspace.authorize()
→ Workspace.update()
→ inventory() → renderFiles() → #files
```

Interface：前端將 `/api/files` 回傳內容放入 `#files`，顯示可操作範圍內的檔案清單。

Interaction：使用者授權成功後按「開啟此專案」；首次索引自動執行，不必再次按更新才能載入。

Harness：`Workspace.createDirectory()` 只建立最後一層空資料夾，不覆寫既有資料夾；`Workspace.authorize()` 檢查絕對路徑、資料夾、權限與期限。

Validation：`Workspace.update()` 只掃描已授權範圍，建立 `path`、`mtime`、`hash`、`segments` 與 `locator` 等索引資料。

Operations：全域唯讀參考與個別專案寫入屬於不同授權層，詳細規則見 [雙層授權流程](dual_layer_authorization_flow.md)。

History：`Workspace.audit()` 保存授權操作的可核對紀錄；索引資料不保存管理碼。

Test Data：既有資料夾、成功建立最後一層、既有目標不覆寫、超出路徑範圍、到期授權與更新索引。

保存結果：建立或更新工作區索引，前端顯示 `#files`；授權到期時可保留歷史與候選內容，但隱藏檔案。

## 動作：快速重新授權

目的：延長既有專案授權，讓使用者不必重新輸入全部設定。

流程：

```text
點專案旁的「＋」
→ 帶入路徑、上次權限與分鐘數
→ 重新 request／approve
→ 保存 grantDefaults
→ 保持原修改目標
```

Interface：`public/sidebar.js` 提供專案旁的快速重新授權入口。

Interaction：使用者檢查帶入的路徑與權限，只輸入本次管理碼即可確認。

Harness：成功後不自動切換目前修改目標；重啟只恢復 `grantDefaults` 預填設定，不恢復權限。

Validation：舊專案缺少設定時採唯讀 60 分鐘；若要變更設定，必須使用完整授權視窗。

Operations：授權成功後重新載入允許的編輯檔案與索引。

History：`grantDefaults` 保存於 `runtime/assistant-state/state.json`，不含管理碼。

Test Data：快速延長、重啟後重新授權、舊專案缺少設定、變更權限、已到期專案。

保存結果：保存預填設定與新授權結果；不保存管理碼。

## 動作：排查授權 403

目的：判斷授權請求是否停在主機確認階段，避免把授權失敗誤認為檔案讀取錯誤。

流程：

```text
確認目前網址 → 確認 4317 服務視窗
→ 確認使用最新管理碼 → 重新提出 request → 再次 approve
```

Interface：畫面若顯示「待主機端核准（尚未讀取）」，代表流程仍停在 `POST /api/roots/:id/approve` 前後。

Interaction：重新啟動服務後，只使用同一個終端視窗輸出的管理碼，再按「提出授權請求」與「主機端確認授權」。

Harness：常見原因包括管理碼錯誤、網址不是 `http://127.0.0.1:4317/` 或 `http://localhost:4317/`、服務重啟造成舊碼失效，以及 4317 仍由另一個舊服務占用。

Validation：確認服務程序、管理碼、瀏覽器網址、request ID 與 approve 狀態一致。

Operations：重啟服務後需重新授權；既有外部資料夾也需重新確認權限。

History：403 只顯示固定錯誤資訊，不暴露管理碼或後端原始錯誤。

Test Data：錯誤管理碼、舊管理碼、錯誤 port、舊服務占用 port、非 localhost 來源與已過期 request。

保存結果：授權失敗不建立讀取、寫入、驗證或 AI 外送權限，也不更新目標檔案索引。

## 與其他文件的關係

- [project_workspace_flow.md](../../project_workspace_flow.md)：專案登錄、切換、索引與日常工作區。
- [dual_layer_authorization_flow.md](dual_layer_authorization_flow.md)：全域唯讀根目錄與個別專案寫入的雙層授權。
- [llm_tool_execution_flow.md](llm_tool_execution_flow.md)：Agent 使用授權範圍執行工具的流程。
- [../README.md](../../README.md)：文件閱讀地圖與整體三層架構。
