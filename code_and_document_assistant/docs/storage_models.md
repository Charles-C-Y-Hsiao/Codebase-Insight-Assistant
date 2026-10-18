# 三種流程的資料保存

本文件說明目前系統依流程區分的保存位置、追溯方式與刪除邊界。

## 一般對話

一般對話處理讀檔、建立檔案或修改既有檔案。

- `runtime/assistant-state/state.json`
  - 保存對話、任務需求、任務版本、工具與事件紀錄、結果、涉及的檔案 ID，以及對話摘要與已確認需求。
  - 這是服務目前顯示對話與追蹤任務的中央索引。
- `<一般專案資料夾>/`
  - 保存使用者確認後實際建立或修改的 `html`、`js`、`md` 等專案檔案。
  - 刪除對話不會回復或刪除這些檔案。
- `runtime/backups/`
  - 每次修改既有檔案前保存原始內容，作為可還原版本。
  - 新建檔案沒有先前內容，因此不會建立同類備份。
- `runtime/audit.jsonl`
  - 記錄授權、建立、套用修改、驗證與刪除等事件；會保存路徑、雜湊、備份位置與驗證狀態，但不保存完整檔案內容。

刪除一般對話時，系統移除 `state.json` 的對話與任務索引；專案實際檔案、共用備份與稽核紀錄保留。

## 一般對話中的圖片創作

一般專案直接使用「創作圖片」時，圖片任務仍屬於目前一般對話，但產物會歸檔到該一般專案內。

- `runtime/assistant-state/state.json`
  - 保存目前對話中的圖片任務索引、提示詞、模型、版本、狀態、結果與圖片歸檔位置。
- `<一般專案資料夾>/.cda/image-generations/<使用者 ID>/<對話 ID>/<系列 ID>/`
  - 保存生成的 PNG。
  - 保存同名 metadata JSON，記錄提示詞、模型、尺寸、版本、上一版任務與錯誤資訊。
  - 保存 `<任務 ID>.task.json` 完整任務快照，可在對話索引刪除後列出並還原任務。
- `runtime/audit.jsonl`
  - 保存授權、既有中央圖片搬移與刪除等操作紀錄。

一般生圖必須同時具備 AI 外送與目前專案的修改權限。直接生成時只傳提示詞；修改上一版圖片時，系統從歸檔讀取 PNG，使用 multipart 二進位附件送至圖片模型。模型回傳的 `b64_json` 會解碼後寫成 PNG。

刪除一般對話時，`state.json` 的即時索引會移除，但 `.cda/image-generations/` 歸檔保留；可透過歸檔 API 還原任務。`.cda` 是排除一般檔案索引的助手歸檔目錄，並非不可修改的保護區。

## 圖片創作專案

圖片創作專案包含圖片討論、候選完整提示詞、系列摘要與版本化產圖；其資料會跨一般對話索引、中央圖片區與圖片專案資料夾保存。

- `runtime/assistant-state/state.json`
  - `imageProjects` 保存圖片專案、系列、專案摘要、系列摘要與摘要版本。
  - `conversations[].jobs` 保存圖片討論、候選提示詞、圖片創作任務及版本關係。
- `runtime/assistant-state/generated-images/<一般專案 ID>/<對話 ID>/<系列 ID>/`
  - 保存圖片創作版本的 PNG 與 metadata JSON。
- `../image-creation/<圖片專案資料夾>/`
  - 保存圖片討論與直接圖片創作所採用的持久化附件與參考圖。
  - 保存圖片輸出的 PNG 與 JSON 副本，方便圖片專案獨立保留成果。
- `runtime/audit.jsonl`
  - 記錄圖片操作被送出或拒絕、系列永久刪除等稽核事件。

圖片討論與圖片創作都會保存原始要求、任務狀態及圖片關聯。圖片討論還保存候選提示詞、Agent 理解、討論結果、歷史篩選資料與錯誤；圖片創作保存實際送往圖片模型的完整提示詞、參考圖、來源草稿、摘要版本與上一版關係。

圖片創作專案的系列可永久刪除，該動作會清除系列任務索引、附件、參考圖、PNG 與 JSON。由於圖片專案任務目前仍部分掛在一般對話索引上，含有這類任務的一般對話會被阻止刪除。

## 延伸文件

- 一般對話刪除與一般生圖歸檔：[conversation_deletion_cleanup.md](conversation_deletion_cleanup.md)
- 圖片創作專案記憶與資料流：[image_project_memory_flow.md](image_project_memory_flow.md)
- 圖片系列永久刪除：[image_project_deletion_cleanup.md](image_project_deletion_cleanup.md)
