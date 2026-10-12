# 本機資料夾授權管理碼流程

2026-09-16：授權視窗新增「個別專案／全域唯讀參考」類型。兩層沿用相同 request → 主機管理碼 approve 流程；全域拒絕建立資料夾、寫入與驗證，並自動加入新任務的讀取範圍。操作見封存的 [雙層授權流程](dual_layer_authorization_flow.md)。

## 快速重新授權入口

點專案旁＋，檢視自動帶入的路徑、權限與分鐘數，輸入本次管理碼並確認。`public/sidebar.js` 依序呼叫既有 request／approve 路由，後端檢查本機、工作階段與管理碼。成功保存 `grantDefaults`；重啟保留設定但清除權限。舊專案缺設定採唯讀 60 分鐘，變更設定用完整授權視窗。管理碼不存入磁碟或瀏覽器 storage。

## 管理碼是什麼

2026-09-15 前端入口：按左側「新增專案／管理授權」，在彈出視窗內填寫路徑、權限與管理碼。授權成功後按「開啟此專案」才切換；關閉視窗可繼續原專案。生成及後端驗證規則不變。

「本機資料夾授權管理碼」由後端在服務啟動時自動產生，現在是 6 碼十六進位字串，字元為 `0–9` 與 `a–f`。前端不產生、不保存，也不能自行指定。服務重啟後通常會產生新碼；舊碼會失效。它目前是展示版的主機確認碼，不等同於公司登入、AD、SSO 或正式權限系統。

## 產生與授權流程

```mermaid
flowchart TD
    A[啟動 server.js] --> B[createApp 建立應用程式]
    B --> C[crypto.randomBytes(3).toString hex]
    C --> D[6 碼十六進位 adminToken 保存在後端記憶體]
    D --> E[app.listen 啟動 HTTP 服務]
    E --> F[終端輸出本機資料夾授權管理碼]
    F --> G[使用者在前端輸入管理碼]
    G --> H[按提出授權請求]
    H --> I[POST /api/roots/request]
    I --> J[建立 pending 授權請求]
    J --> K[按主機端確認授權]
    K --> L[前端送出 request id + adminToken]
    L --> M{remoteAddress 是 localhost 且管理碼相同?}
    M -- 否 --> N[403 授權失敗]
    M -- 是 --> O{有勾選建立且目標不存在？}
    O -- 是 --> O1[createDirectory 建立最後一層空資料夾]
    O -- 否 --> O2[使用既有資料夾]
    O1 --> P[workspace.authorize 讀取並檢查資料夾]
    O2 --> P
    P --> Q[建立 read/write/verify/ai 權限與期限]
    Q --> R[更新索引並顯示檔案]
```

## 檔案與函式對照

- 建立管理碼：`server.js` 的 `createApp()` 使用 `crypto.randomBytes(3).toString('hex')` 產生 6 碼十六進位字串。
- 顯示管理碼：`server.js` 的 `app.listen(... callback)` 將管理碼輸出到啟動服務的終端。
- 輸入管理碼：`public/index.html` 的 `#admin`，由使用者在本機頁面輸入。
- 提出請求：`public/app.js` 的 `#request-root.onclick` 呼叫 `POST /api/roots/request`，此時尚未讀取資料夾。
- 儲存請求：`server.js` 建立 `pending` 請求並驗證路徑欄位。
- 確認授權：`public/app.js` 的 `#approve-root.onclick` 將請求 ID 與管理碼送到後端。
- 後端驗證：`server.js` 的 `/api/roots/:id/approve` 檢查 localhost、管理碼與請求狀態。
- 建立新資料夾：`Workspace.createDirectory()` 只在確認後建立最後一層空資料夾，不覆寫既有資料夾。
- 實際授權：`Workspace.authorize()` 檢查絕對路徑、資料夾、權限與期限。
- 寫入稽核：`Workspace.audit()` 記錄授權時間、路徑、權限與期限。
- 建立索引：`Workspace.update()` 掃描已授權資料夾並解析檔案。
- 顯示檔案：`inventory()`、`renderFiles()` 將 `/api/files` 回傳內容放入 `#files`。

## 對應到你截圖的 403

截圖顯示授權請求仍是「待主機端核准（尚未讀取）」，代表流程停在 `POST /api/roots/:id/approve`。常見原因是：

1. 管理碼不是目前服務視窗剛輸出的管理碼。
2. 目前瀏覽器不是 `http://127.0.0.1:4317/` 或 `http://localhost:4317/`。
3. 服務重啟過，前一組管理碼已失效。
4. 4317 埠上仍是另一個舊服務。

重新雙擊 BAT 後，請只使用同一個終端視窗輸出的管理碼。先確認網址是 `http://127.0.0.1:4317/`，再按「提出授權請求」及「主機端確認授權」。

## 授權成功後的資料流

```text
主機管理碼
  ↓ 僅用於後端確認
既有資料夾，或本機確認後新建的最後一層空資料夾
  ↓ Workspace.authorize()
read + 選擇性 write / verify / ai 權限
  ↓ Workspace.update()
檔案索引：path、mtime、hash、segments、locator
  ↓ public/app.js inventory()
#files 收折清單（預設 open）
```

管理碼只在後端記憶體中保存，不寫入索引、不放入前端 JavaScript、不寫入回應內容及稽核資料。3 bytes 轉成十六進位後固定為 6 碼，共有 16,777,216 種組合；實際部署仍應改接公司認證與正式主機管理機制，並限制服務只接受可信任的本機操作。

