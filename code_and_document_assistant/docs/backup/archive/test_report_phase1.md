# 第一階段實測報告

> 歷史基準（2026-09-12），保留原始結果。2026-09-14 改版沿用並重跑此階段的 13 項測試；最新結果與多專案實作範圍見 [test_report.md](test_report.md)。本文件不表示新版專案隔離、整案還原或成果收藏已完成。

2026-09-14 第二增量回歸：本檔所對應的 13 項仍通過，完整測試組為 30/30。新增 HTTP／前端專案隔離結果請看最新報告；以下保留初次測試時的結果與限制。

執行日期：2026-09-12。平台 Windows / PowerShell，Node.js v20.15.1，npm 10.7.0。沒有新增 npm 專案或安裝套件，沿用 `C:\Web_Practice\node_modules`。

## 後端與 HTTP 整合驗收

命令（工作目錄 `C:\Web_Practice\ReAct`）：

```powershell
node --test code_and_document_assistant/tests/acceptance.test.js
```

最終结果：**13 passed、0 failed、0 skipped，exit code 0**。

1. 文件與三種 Mock 查詢一致，引用 ID 指向已取得的證據與位置。
2. 來源衝突：文件／SQL Server／Oracle 顯示不同數值；差額由程式計算。
3. 缺少產品或時間先追問，不呼叫查詢工具。
4. 能力缺口、未登錄工具與 schema 額外 SQL 參數被拒絕。
5. Mock API 失敗／逾時只重試一次，保留其他證據並部分完成。
6. 文件中的刪檔與外傳指令不改變工具權限。
7. 取消、整體期限與工具呼叫上限能停止任務。
8. 修改前不寫入；確認後備份並真實套用 JS 修正，Node 語法檢查通過。
9. 外部修改後拒絕舊版本差異，保留外部編輯內容。
10. 索引新增／修改／刪除，舊格式原因可見，過期檔案不讀成新版本。
11. Python 範例明示未驗證；HTML 範例通過指定 lang 屬性檢查。
12. HTTP 工作階段隔離、跨來源阻擋、未授權路徑不讀取、錯管理碼拒絕、正確本機授權後唯讀。
13. 文件搜尋停滯時，整體期限仍能結束任務。

## 真實瀏覽器操作

```powershell
node code_and_document_assistant/tests/browser-smoke.js
```

最終結果：**PASS，exit code 0**。使用主機已安裝 Google Chrome 與 Puppeteer，操作隔離展示工作區。

- 送出產品 B 問題，顯示資料衝突。
- 點擊回答中的引用，展開實際來源。
- 送出 JavaScript 修改需求，顯示待確認差異，確認套用後出現語法檢查 passed。
- 輸入 @ 顯示可選檔案清單。
- 1440 px 桌面與 390 px 手機寬度檢查；手機無水平溢出。
- 沒有瀏覽器未處理 JavaScript 錯誤。
- 畫面截圖：`runtime/desktop-preview.png`、`runtime/mobile-preview.png`。

測試發現的手機長路徑溢出已修正，並重新驗收通過。初次沙箱測試的 Node 暫存路徑讀取受 EPERM 阻擋，取得執行許可後通過；Edge 無法啟動，因此改用主機 Chrome，沒有下載或安裝瀏覽器。

## 已知限制與未實測

- 模型理解、規劃與業務 SQL/API 均是 Mock。未使用真實 AI key、SQL Server、Oracle 或內部 API。
- 修改只支援 demo 的三個固定範例；不是任意程式自動修復。
- JavaScript 只做語法檢查，HTML 只做 lang 屬性檢查；沒有對修改後的使用者程式執行功能測試。
- Python 驗證器未設定，語法／功能測試未執行。
- Office/PDF 解析、雲端文件能力、Embedding 均未接入；不支援的格式會顯示原因。
- 外部檔案只可查詢原文；跨來源語意核對只支援受控範例契約。
- 文件授權為整個服務共用的唯讀範圍；不同瀏覽器的任務隔離不等同於使用者登入與資料權限分級。
- 只實測 loopback HTTP，未測公司防火牆、共用磁碟可達性、LAN 多人負載或正式資安稽核。
- 搜尋等待超時可结束任務；底層作業系統檔案 I/O 不一定能立即取消。正式共用磁碟索引需補隔離與 I/O 管控。
- 未執行第三階段代表性真實問題品質評估。

後續以 `../version_history.md` 的驗收摘要與提示詞推進，不把以上未實測項目當成已完成串接。

