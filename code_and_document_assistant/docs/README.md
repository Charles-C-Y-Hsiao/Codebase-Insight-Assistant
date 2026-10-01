# code_and_document_assistant — 多專案操作版

本文件是專案入口，提供啟動方式、功能總覽、限制與詳細文件索引。實際流程以各專題文件為準。

## Diff2Html 單欄行號預覽

已建立獨立的 Diff2Html 格式預覽頁，不會影響正式任務的程式差異比較。啟動原本服務後，開啟 `http://127.0.0.1:4317/diff-preview.html`。

- 頁面使用固定的獨立程式碼範例；刪除列顯示舊行號、新增列顯示新行號，每列只保留一欄行號。
- 可直接調整 `public/diff-preview.css` 與 `public/diff-preview.js`，重新整理預覽頁立即確認結果。
- 已驗證：`node .\code_and_document_assistant\tests\diff-preview-browser.js` 通過，確認 Diff2Html 輸出每列僅有一個行號。

## 文件導覽

- [AI 連線流程](ai_connection_flow.md)：啟動 AI、公司端點、模型、API key、外送授權、圖片能力、錯誤排查與驗收。
- [環境驗證與部署](environment_validation_and_deployment.md)：公司環境的離線測試、端點驗證、功能驗收、排錯與部署順序。
- [查詢與修改工作台](task_workbench_flow.md)：查詢、記憶、技能、AI 修改、人工編輯、驗證、任務時間線與保存限制。
- [任務編輯流程](task_version_flow.md)：任務 Edit／View、需求版本、短確認與重新送出。
- [專案載入流程](project_workspace_flow.md)：專案切換、索引、側欄、檔案選取與重新授權。
- [雙層授權流程](archive/dual_layer_authorization_flow.md)：全域唯讀參考、個別專案寫入與權限邊界（封存流程說明）。
- [差異與圖片預覽](archive/diff_and_image_preview_flow.md)：程式差異比較、圖片預覽與逐版檢視（封存流程說明）。
- [LLM 工具執行流程](archive/llm_tool_execution_flow.md)：模型如何選擇受控工具、取得證據與回報結果（歷史流程說明）。
- [Select2 專案流程](select2_project_flow.md)：固定 Mock 範例的建立、索引與預覽。

2026-09-16 AI 增量：已實作官方 OpenAI／公司 OpenAI 相容連線與受控搜尋、讀檔、單檔提案。以假端點測試通過；實際帳號與公司端點待連線驗收。啟動方式見 [AI 連線流程](ai_connection_flow.md)，PowerShell 執行 `./start_ai.ps1`。

圖片創作已提供確認窗、對話時間線預覽與逐版修改保存；需在服務端明確設定核准的官方 OpenAI 圖片模型，且目前尚未以真實 API 帳號驗收。設定與保存位置見 [AI 連線流程](ai_connection_flow.md#圖片能力與創作流程)。

已支援全域唯讀參考＋個別專案寫入：頂部＋選授權類型，先授權 `C:\Web_Practice\ReAct` 為全域唯讀，再授權並開啟欲修改的子專案；demo 預設可搜尋。操作及排除規則見封存的 [雙層授權流程](archive/dual_layer_authorization_flow.md)。AI 外送需另勾許可。

新版側欄：頂部＋新增專案，專案旁＋快速續期，⋯查看路徑、倒數與管理操作。展開專案建立新對話，歷史依最近活動排序。重啟後可使用保存的權限設定重新授權。詳見 [專案載入流程](project_workspace_flow.md#新版側欄與快速重新授權)。

文件與程式助手：已加入真實文件解析、授權工作區、人工／AI 單檔修改提案與靜態驗證。第二階段真實整合尚未全數驗收：公司 AI 端點、SQL Server、Oracle、內部 API 仍待核准設定與實測。Mock 展示保留。

對話記憶增量：完整任務歷史保存在本機，模型使用已確認需求摘要、最近四輪及最多兩輪相關舊內容；長對話自動壓縮但不刪除原文。輸入需求時會建議「需求釐清／任務規劃／驗證檢查」，按開始才執行，且技能不會擴大既有工具或授權。詳細操作見 [查詢與修改工作台](task_workbench_flow.md#對話記憶與技能流程)。

## 啟動

快速啟動：雙擊 [code_and_document_assistant_auto_ip.bat](../code_and_document_assistant_auto_ip.bat)，會啟動 4317 埠服務，等待網頁就緒後開啟 Chrome（找不到時使用預設瀏覽器）。此 BAT 使用區網模式 `0.0.0.0`，終端顯示區網網址；本機瀏覽器開啟 `http://127.0.0.1:4317/`，供管理碼授權及修改確認。無登入保護，僅限可信任網路；不修改防火牆，請勿分享管理碼。若埠已占用會停止並提示，請先確認舊服務；停止服務按 Ctrl+C。BAT 不安裝 npm 套件。下方手動啟動方式仍預設僅本機。

管理碼的產生、前端輸入、後端驗證與授權流程，見封存的 [authorization_flow.md](archive/authorization_flow.md)。

LLM 如何評估任務、搜尋專案並提出修改，以及目前 Mock 與 real 工具循環的差異，見 [LLM 工具執行流程](archive/llm_tool_execution_flow.md)；同頁也說明 PowerShell 的 `Get-Content` 與 `src/` 的意思。

2026-09-13 已完成不需額外資料的第三階段離線收尾：修正短代號誤配與檔名搜尋，26 項回歸與瀏覽器操作通過；11 題合成檢索評估由 7/11 提升至 11/11。這不代表公司真實問題的準確率。版本摘要見 [version_history.md](version_history.md)，完整評估報告保留於 [archive/evaluation_report.md](archive/evaluation_report.md)。

```powershell
Set-Location C:\Web_Practice\ReAct
node .\code_and_document_assistant\server.js
```

開啟 `http://127.0.0.1:4317`。終端會顯示每次啟動產生的 6 碼十六進位本機資料夾授權管理碼；此碼供授權／真實檔案操作，勿分享。停止使用 Ctrl+C。

區網使用時，在啟動前設定 `$env:CDA_HOST = '0.0.0.0'`，其他電腦連 `http://主機IP:4317`。預設僅 loopback，未修改防火牆或實測公司 LAN。服務無登入，讀取授權是整個服務共用；真實資料夾授权、修改確認、驗證與還原則要求 loopback 與管理碼。瀏覽器 session 隔離不能取代公司登入及資料權限。

## 依賴與 npm 位置

- Node.js v20.15.1、npm 10.7.0；沿用 `C:\Web_Practice\node_modules` 的 Express、Ajv 與測試用 Puppeteer。
- 本資料夾沒有 package.json、package-lock.json 或 node_modules；未安裝或更改 npm 套件。
- 已找到內建 Python 3.12.14：`C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`。
- 後端預設依 USERPROFILE 查找此 runtime。其他電腦請用 `CDA_PYTHON` 指定核准的 Python 絕對路徑。
- 解析實測套件：pypdf 6.10.0、lxml 6.1.1、openpyxl 3.1.5。測試產生器另用 python-docx、python-pptx、reportlab。沒有把內建 runtime 複製進專案。
- Python 不存在時會回報解析失敗或驗證未執行，不回傳假結果。

## 現在可以怎麼操作

### 專案切換與唯讀參考（2026-09-15）

更新後需先停止舊服務，再用原 BAT 或 `node code_and_document_assistant/server.js` 啟動。

1. 按左側「新增專案／管理授權」，在彈出視窗填路徑、權限與管理碼。既有資料夾直接授權；新專案可勾選「路徑不存在時建立新的空資料夾」，父資料夾須已存在。成功後按「開啟此專案」才切換，也可關閉視窗留在原專案。
2. 左側直接列專案，點名稱切換、點箭頭展開／收合對話。中央頂部顯示目標與唯讀參考；按「加入參考」或輸入 `@project` 點選 B，標籤 × 可移除。B 僅能讀取／搜尋。
3. 修改 B 要切換目標，不能在 A 的任務直接寫入 B。手動更新索引只更新目前目標及參考範圍。
4. 點專案下的對話可恢復紀錄，「新對話」另建。切換前若有未送出問題或候選修改，會先提示留下或放棄；確認後才清除舊內容。
5. 同一瀏覽器可在服務重啟後查看歷史；外部專案須重新授權，舊任務不會自動繼續或恢復可套用的提案。

可用 `CDA_PROJECTS_CONFIG` 指向含 `projects: [{name, path}]` 的 JSON。範例見 `config/projects.example.json`；只登錄、不讀取資料夾，也不自動授予權限。前端授權的專案則自動保存登錄。已登錄父子路徑重疊時先撤銷不需要的父範圍。

狀態保存在 `runtime/assistant-state/state.json`；含工作階段與歷史來源片段，不含管理碼，請勿分享或提交 Git。瀏覽器身分 cookie 有效 30 天並於載入續期；清除 cookie 或改用另一網址／瀏覽器不會自動恢復原對話。每對話上限 100 個任務，需另建對話後繼續，舊紀錄保留。更多規格與限制見 [封存的專案隔離設計](archive/project_isolation_and_cross_reference.md)。整案還原、成果收藏仍待下一增量，目前只有單檔備份／還原。

### 側欄展開與收合

`#sidebarToggle` 放在「工作區」側欄上方，`#inspectorToggle` 放在「執行詳情」側欄上方；兩者獨立運作。收合後保留 46px 窄欄與箭頭按鈕，主內容區會自動變寬。側欄內容會在自己的欄位內換行並垂直捲動，不會橫向超出。狀態保存於瀏覽器 `localStorage`，重新整理後保留，預設為展開。

### 查詢與文件

1. 日常使用「查詢文件」模式；Mock 一致、衝突、缺條件等按鈕集中在預設收合的「展示與測試」。查詢不自動展開右側，按「查看來源」或證據 ID 才展開。
2. 「指定新資料夾與權限」填入後端主機的絕對路徑，提出請求後，用主機管理碼確認。若要建立新專案根資料夾，勾選「路徑不存在時建立新的空資料夾」；實際建立只會在本機確認時發生，父資料夾須已存在，不建立多層路徑、不覆寫既有資料夾。這不是從遠端瀏覽器上傳檔案的功能。
3. 授權可分開選修改、靜態驗證、允許送 AI，並設定 1–1440 分鐘有效期；預設唯讀一小時。只有 real AI 模式、AI 連線已驗證、專案完成「允許內容送往目前設定的 AI」授權，且請求通過目前工具與權限檢查時，才會將允許的需求、記憶或檔案內容送往模型。詳細條件見 [查詢與修改工作台](task_workbench_flow.md#對話記憶與技能流程) 與 [AI 連線流程](ai_connection_flow.md)。
4. 可在「新增專案／管理授權」視窗查看權限與到期時間、填入既有路徑或撤銷授權。到期立即拒絕讀取與寫入；重啟後外部路徑需重新授權。
5. 輸入 `@` 選擇已索引的檔案，或勾選左側清單。例：「閱讀 @policy.docx」或「搜尋 產品甲」。查詢會先提供本機索引的來源片段；real AI 任務在完成外送授權與連線驗證後，才會由模型整理回答，並保留來源與引用資訊。
6. 更新索引會反映新增、修改、刪除；內容位元組雜湊相同時重用解析。空白 JS / CJS / MJS / Python / HTML / CSS / JSON 會列為「空白初始檔」，可載入編輯器建立第一版，但不會被搜尋或引用為證據；空白文件仍列在「未索引項目」。查詢回傳來源版本、更新時間與精確區段定位。

### 一般程式檔案修改

1. 對工作區授權「允許修改」，需要驗證時另勾「允許靜態驗證」。
2. 選取目標專案的一份 JS / CJS / MJS / Python / HTML / CSS / JSON 檔，按中央「人工編輯／靜態驗證」顯示編輯器。切換回「查詢文件」不會清除候選修改。
3. 按「載入選取檔案」，在候選內容欄編輯，輸入主機管理碼並按「產生差異提案」。這是人工提供修改，尚非 AI 自動修改。
4. 新差異產生後右側自動展開，檢視再按「主機確認套用實際修改」。提案有效 15 分鐘；套用前檢查内容版本與授權版本，使用暫存檔替換並保留備份。
5. 如要復原，按「確認還原這次修改」。只有現況仍等於該次套用結果才會還原；若又被編輯會拒絕覆蓋。
6. 「僅靜態驗證」檢查的是磁碟上目前已索引的版本，不是尚未套用的編輯器內容。

demo 的三個固定 Mock 修改仍可用。既有檔案修改每次處理一份；real AI 另可在目前已授權的可寫專案提出最多 20 份新檔，逐份預覽並確認建立或略過，也適用空專案。不覆寫既有檔案、不建立子資料夾；尚無刪除檔案、多檔交易或 AI 自動修復。下方 Select2 固定範本仍是獨立 Mock 展示入口。

### 建立 Select2 小功能（已跑通的模擬需求）

先點左側已授權且允許修改的父專案，再展開「展示與測試」內的「建立新專案 · Select2 模擬需求」。父資料夾清單只提供目前目標；填寫新專案名稱，按「模擬需求並預覽新增內容」，檢視完整 index.html，再用本機管理碼確認建立。此固定生成器建立的是目標內子資料夾，不會自動登錄成獨立專案。

建立後自動更新索引、封存新增內容，依授權執行 HTML 靜態檢查。「開啟 Select2 功能預覽」會載入固定 CDN；也可以直接雙擊生成的 index.html。預览僅提供這次建立且內容未變更的固定範本，重啟服務、授權失效或手動修改後不能沿用該預覽連結。新增檔案沒有被覆蓋的舊版本，封存是生成內容快照，沒有自動刪除／撤銷建立功能。

已實測 jQuery 3.7.1、Select2 4.0.13 CDN 與 SRI 完整性、搜尋、多選、清除、空結果、手機寬度、CDN 失敗提示。內容與產品資料為固定 Mock，沒有透過對話理解任意需求。操作步驟、生成檔案位置與重跑命令見 [select2_project_flow.md](select2_project_flow.md)。專案載入、授權、索引與 `@file` 流程見 [project_workspace_flow.md](project_workspace_flow.md)。不需要 npm 安裝；CDN 需要網路。

## 真實解析範圍

- 格式：PDF
  - 定位與處理：pypdf 頁面文字，實際頁碼，保留整頁脈絡
  - 限制：無文字頁明示 OCR；未還原複雜表格結構，未做 OCR
- 格式：DOCX
  - 定位與處理：本文標題、段落編號、完整表格與表頭
  - 限制：標準 Heading 樣式；頁首頁尾、註解、文字方塊及修訂語意未處理
- 格式：PPTX
  - 定位與處理：依 presentation 關聯次序，投影片編號與表格內容
  - 限制：不解析圖像、SmartArt、備註或嵌入物件；視覺次序需人工核對
- 格式：XLSX
  - 定位與處理：工作表／列／儲存格、候選表頭、日期格式、合併位置
  - 限制：首個非空列只是候選表頭；複雜多層表頭未做語意推斷
- 格式：XLSX 公式
  - 定位與處理：顯示公式與快取；缺快取明示未計算
  - 限制：不重新計算，快取不保證最新
- 格式：HTML
  - 定位與處理：可見文字與整份原始碼行範圍，排除 script/style 文字
  - 限制：不執行腳本或載入外部資源
- 格式：TXT / MD / 程式
  - 定位與處理：UTF-8 文字與行號，保留檔案脈絡
  - 限制：其他編碼不自動猜測；大型檔案明示超限
- 格式：DOC / PPT / XLS
  - 定位與處理：明示轉檔需求
  - 限制：不直接解析舊二進位格式

搜尋是本機關鍵字與中文雙字詞比對，最多回傳 12 個區段。來源區段不任意切斷表格。解析警告也會顯示在左側提示清單；有警告不一定代表整份文件未索引。

PDF 複雜表格與掃描頁的限制依 [pypdf 官方文件](https://pypdf.readthedocs.io/en/stable/user/extract-text.html) 處理。Office XML 關閉實體解析與網路載入並拒絕 DTD，依 [lxml 解析文件](https://lxml.de/parsing.html) 設定。

## 驗證與執行邊界

- Profile：node-syntax
  - 實際動作：子程序 `node --check` 從 stdin 檢查；MJS 為 module，JS/CJS 為 commonjs
  - 不代表什麼：不執行 import、require 或功能測試；ESM .js 專案需後續 profile
- Profile：python-compile
  - 實際動作：Python `compile(..., 'exec')` 只編譯，不執行
  - 不代表什麼：不執行 import／使用者程式，不做功能測試
- Profile：html-static
  - 實際動作：檢查 html/title/body、lang、重複 id
  - 不代表什麼：非完整 HTML 標準、瀏覽器或視覺驗證
- Profile：json-parse
  - 實際動作：JSON.parse 語法檢查
  - 不代表什麼：不驗證業務 schema
- Profile：CSS
  - 實際動作：未提供 profile，明示未執行
  - 不代表什麼：不宣稱驗證成功

子程序採固定執行檔／參數、stdin 傳入內容、精簡環境與逾時，Python 使用 `-I -B`。Python 編譯與執行的區別可見 [Python compile 文件](https://docs.python.org/3.12/library/functions.html#compile)。這些是靜態分析程序，不是可執行任意使用者程式的隔離沙箱。沒有 shell、npm test 或任意 command API。真實功能測試仍需要公司核准的隔離執行環境與 profile。

## 設定與未接通的部分

- `config/example.json` 是目前啟動設定；HOST/PORT 可由 CDA_HOST、CDA_PORT 覆寫。
- 單檔 8 MiB，總解析索引 32 MiB，200 份檔案，單次索引約 30 秒預算；單解析器 10 秒、输出 8 MiB、Office 展開 32 MiB、PDF 500 頁、最多 2000 區段。
- 修改內容最多 256 KiB；靜態驗證 3 秒；查詢整體 15 秒、工具 800 ms、8 次呼叫、最多重試 1 次、結果 20 筆。
- 公司連線缺少欄位見 `config/connections.example.json`、介面「真實連線缺少哪些設定」、`GET /api/connections`（需 session）。此設定清單尚不是可自動連線的驅動器。
- `CDA_MODEL_MODE=real` 讀取 AI 設定與環境 key；缺設定明示 CONFIG_REQUIRED。`CDA_DATA_MODE=real` 的資料工具仍未接入。未設定模型模式時保留 Mock 展示。
- AI adapter 已支援原生工具與 Chat JSON 指令；設定 real 並授權後會向指定端點送資料。SQL／內部 API 仍需公司核准範例與實作，尚未接入真實 DB。

## 執行驗收

```powershell
Set-Location C:\Web_Practice\ReAct
node --test .\code_and_document_assistant\tests\acceptance.test.js .\code_and_document_assistant\tests\phase2.test.js
node .\code_and_document_assistant\evaluation\run.js
node .\code_and_document_assistant\tests\browser-smoke.js
```

瀏覽器測試使用已安裝 Chrome，`CDA_BROWSER` 可覆寫路徑。測試在隔離目錄建立非機密真實格式文件，結束移除測試工作區；不修改使用者 demo。截圖寫入 `runtime/desktop-preview.png` 與 `runtime/mobile-preview.png`。

## 保存與已知限制

runtime/demo 為展示副本；runtime/backups 保存修改前內容；runtime/audit.jsonl 記錄授權／撤銷／修改／驗證，不寫入檔案內容或 key。runtime 不提交 Git。授權、可執行提案與索引仍在記憶體；專案登錄、瀏覽器工作階段與歷史對話另存 runtime/assistant-state/state.json。重新整理可恢复所選對話，重啟保留歷史但清除外部授權與可執行任務；修改及備份保留。未提供稽核輪替與保存期限管理。

索引的時間預算與程序逾時無法保證作業系統層的共用磁碟 metadata I/O 立即取消；解析器不是完整惡意文件隔離環境。正式共用磁碟、大文件、權限分級及負載仍待公司環境驗收。

交接與下一階段提示詞已整理進 [version_history.md](version_history.md)。完整評估與歷史報告保留於 [archive/evaluation_report.md](archive/evaluation_report.md)、[archive/test_report.md](archive/test_report.md) 與 [archive/phase_guide.md](archive/phase_guide.md)。
新版介面使用方式見 [查詢與修改工作台](task_workbench_flow.md)：每次需求下方顯示可收合的執行紀錄、模型、token 與耗時，右側詳情跟隨選取任務；AI 修改在該任務內查看差異、套用及驗證結果，人工編輯有獨立入口。

新增檔案會在該任務工作台逐份詢問。問題欄可直接貼入 PNG／JPEG／WebP，每次最多 5 張，單張預設 10MB，可由網頁設定 1–20MB。圖片僅在提交後依 AI 授權外送；圖片及大小設定重新整理仍保留，停止／重啟服務後清除。歷史保留附件名稱等摘要，不保存圖片內容。圖片格式依官方 API 規格實作，能力設定見 [AI 連線流程](ai_connection_flow.md#圖片能力與創作流程)。

