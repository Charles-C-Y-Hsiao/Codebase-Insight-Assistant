# Select2 模擬需求與實測紀錄

## 完成結果

模擬需求：「在指定的新專案資料夾建立產品選擇器，使用 jQuery + Select2 CDN，支援名稱搜尋、多選、清除與選取摘要。」

固定 Mock 範本生成內容；路徑授權、磁碟建立、索引、CDN 載入與 Chrome 互動為真實操作。未呼叫公司 AI、SQL Server、Oracle 或內部 API。此功能不需要 npm 安裝。

## 專案資料夾與資料流

本文件說明的是使用 jQuery + Select2 建立小功能 的實例流程：

```text
public 操作介面
  → server.js API
  → src/projects.js 建立提案
  → templates/select2/index.html 固定範本
  → runtime/.../projects/.../index.html 實際檔案
  → 更新索引與 CDN 預覽
```

### 直接相關資料夾

- `public/`：操作介面、建立提案、確認建立、更新索引與開啟預覽。
- `src/`：授權、建立資料夾、寫入檔案、備份、驗證、索引及預覽流程；核心為 `projects.js`。
- `templates/select2/`：固定範本，包含 jQuery／Select2 CDN、搜尋、多選、清除與摘要。
- `runtime/`：實際生成的 `index.html`、備份、稽核紀錄、截圖與測試結果。
- `tests/`：建立流程、索引、CDN 載入、搜尋、多選、清除及 CDN 失敗測試。

### 間接或目前無直接關聯

- `docs/`：流程、操作、驗收與限制說明，不參與生成。
- `config/`：服務埠號、限制與未來真實連線設定範例。
- `examples/`：折扣 JS／Python／HTML 修改範例；未來可用來示範修改 Select2 專案。
- `evaluation/`：助手搜尋、回答、引用與工具流程評估。
- `python/`：未來文件解析輔助工具，目前 Select2 不需要使用。

### 實際與 Mock 邊界

- 項目：建立資料夾、寫入 `index.html`、索引與 HTML 檢查
  - 狀態：實際執行
- 項目：jQuery／Select2 CDN 與瀏覽器互動
  - 狀態：實際載入並測試
- 項目：範本、產品 A～D 資料與需求理解
  - 狀態：Mock／固定內容
- 項目：AI 任意產生程式、SQL Server、Oracle、內部 API
  - 狀態：尚未接入

目前已跑通的是「固定 Select2 範本的受控建立流程」，不是 AI 任意開發功能。

## 直接打開本次生成的小功能

已成功實測的檔案：

`C:\Web_Practice\ReAct\code_and_document_assistant\runtime\select2-walkthrough-XXXXXXcZQbh1\projects\select2_product_picker\index.html`

可用 Chrome 直接開啟。父資料夾及生成檔案已保留；測試服務已關閉，測試授權與預覽 URL 隨之失效。它是獨立的小網頁，不需助手服務才能執行，但需能連上 CDN。

截圖：`runtime/select2-preview.png`、`runtime/select2-mobile.png`。機器可讀結果：`runtime/select2-walkthrough-result.json`。重跑測試會建立另一份獨立範例並更新結果 JSON；不覆蓋先前專案。

## 在助手自己重跑一次

1. 在原本服務視窗按 Ctrl+C，再双擊 `code_and_document_assistant_auto_ip.bat`，開啟 localhost 頁面。
2. 按左側「新增專案／管理授權」，在視窗內輸入此次啟動的本機管理碼。
3. 如果要用新位置，在視窗內提供已存在的父資料夾，勾選允許修改及所需靜態驗證，再提出並確認授權。成功後按「開啟此專案」，或關閉視窗後點左側專案名稱。也可先使用既有 demo 工作區。
4. 展開「展示與測試」內的「建立新專案 · Select2 模擬需求」，輸入如 `select2_product_picker_2`。父資料夾選單只允許目前目標；此處建立子資料夾，不會自動登錄另一個獨立專案。
5. 按「模擬需求並預覽新增內容」，檢視計畫與新增 index.html 全文。此時目標子資料夾尚未建立；可取消。
6. 按「主機確認建立專案」。確認後才建立子資料夾與檔案；若名稱已存在會拒絕。
7. 檢視靜態驗證及已索引檔案 ID，點「開啟 Select2 功能預覽」。瀏覽器會載入固定版本 CDN。
8. 搜尋「標準」，選產品 A；清空搜尋文字，再搜尋「進階」並選 B。摘要應顯示 2 項。按「清除選取」回到尚未選擇；搜尋不存在的字詞會顯示找不到。

## 可重跑命令及實測

工作目錄 `C:\Web_Practice\ReAct`：

```powershell
node --test code_and_document_assistant/tests/projects.test.js
node --test code_and_document_assistant/tests/acceptance.test.js code_and_document_assistant/tests/phase2.test.js
node code_and_document_assistant/tests/project-browser-smoke.js
```

2026-09-13：上述命令均 exit code 0。專案綜合測試 1/1、既有回歸 26/26；Chrome 流程 PASS。瀏覽器測試使用現有 Chrome，可用 `CDA_BROWSER` 覆寫位置；需要 CDN 網路存取。

- 情境：新父資料夾授權
  - 實測結果：主機管理碼核准；授權請求本身不寫入
- 情境：新增內容預覽
  - 實測結果：提案與完整內容可見，確認前目標不存在
- 情境：建立與索引
  - 實測結果：真實 index.html 建立；自動索引有 ID／版本；HTML 靜態檢查通過
- 情境：邊界
  - 實測結果：錯誤管理碼、跨 session、路徑穿越、保留名稱、非範本、唯讀／撤銷授權均拒絕
- 情境：衝突與取消
  - 實測結果：確認前被外部建立的資料夾不覆蓋；取消與重複套用均拒絕
- 情境：預覽
  - 實測結果：以 CSP sandbox 執行固定範本；其他 session 不可取用，修改後停用舊預覽
- 情境：真實 CDN
  - 實測結果：jQuery 3.7.1、Select2 4.0.13、CSS 與 SRI 正常載入，無替代假實作
- 情境：互動
  - 實測結果：搜尋、多選兩項、摘要、清除與空結果全部通過
- 情境：獨立檔案及版面
  - 實測結果：生成的 index.html 可直接開啟；390px 無水平溢出
- 情境：CDN 失敗
  - 實測結果：測試主動阻斷 CDN，頁面顯示失敗並停用功能

## 實作範圍及限制

- 只支援 `select2-products` 固定範本與單層新專案名稱，生成一份內含 CSS／JavaScript 的 index.html。不是一般 AI 程式生成，也不會根據聊天文字任意變更功能。
- 沿用有效父資料夾修改授權；建立與確認需本機管理碼，提案綁定 session、授權版本、父資料夾身分，等待確認 15 分鐘。
- 新建使用不覆蓋模式；若寫入中出错保留已建立內容並回報部分失敗，沒有自動刪除或多檔交易保證。
- `runtime/backups`（或測試 runtime 下）保存生成內容快照，並非不存在的原始檔備份。後續修改仍走既有單檔提案／版本／備份流程。
- 隔離預覽只執行這次固定範本；檔案內容改變即停用。它不是任意程式執行沙箱。未支援一般修改後的瀏覽器測試、自動修復或 AI 自動驗證。
- 預覽入口保留助手原有 CSP，僅範本回應單獨配置 sandbox 與 CDN。範本不能發出資料查詢、提交表單或取得助手的同源權限。
- 生成範本為 Mock；索引中外部根目錄的 `real` 指實際磁碟來源，不代表其內容由真實 AI 生成。
- 測試服務與瀏覽器結束後關閉，產出保留在 runtime。失敗嘗試的獨立 walkthrough 目錄也保留，避免自動刪除任何可能需確認的內容。

## CDN 來源

依 [Select2 官方安裝說明](https://select2.org/getting-started/installation/) 使用 CDN；jQuery 版本可核對 [官方版本清單](https://releases.jquery.com/jquery/)。本展示固定 jQuery 3.7.1 與 Select2 4.0.13，未宣稱使用最新版本。三個 SRI SHA-384 值由实际下載的公開資源計算，並透過 Chrome 實際載入驗證。

