# 對話模型與思考深度

- `#composer-submit-actions` 的 `#text-model-picker` 位於服務按鈕左邊，以「短名稱 深度」顯示。目前使用者可在 `#text-model-menu` 選模型與深度，右上角 `#text-model-manage` 齒輪按鈕以自製 tooltip 顯示「模型管理」，點擊開啟 `#text-model-manage-dialog`。目前選中模型以 Font Awesome 的 `fa-solid fa-check` 標示；其 CSS、solid 字型與授權檔保存在本機 `public/vendor/fontawesome-6.7.2/`。
- 第一次使用 real 模式，先加入服務啟動設定的模型。其他模型的實際 API ID 由使用者新增，不從截圖名稱推測。沿用服務端點與後端金鑰，不提供端點或金鑰編輯。
- 模型清單按使用者保存於 `textModelPreferences`；各對話的選擇保存在 `conversation.modelSelection`。管理中可勾選模型、改顯示名稱、指定新對話預設模型、編輯啟用深度與預設深度。
- 初始深度是 `medium`（中），選單不設「預設」項。切換模型時保留仍可用的深度，否則使用該模型的預設深度。取消「將思考深度傳給 API」後，不傳深度欄位，按鈕也不顯示深度；已保存的深度設定仍保留供日後使用。
- 模型被停用／刪除，或選用深度被停用後，對話保留原設定並標示不可用。前後端均阻止新的文字請求，需使用者重新選擇，不會自動改用其他模型。

## 每次操作的設定

`src/text-models.js` 解析目前對話的設定並建立快照。`server.js` 的文字操作路由將快照帶入 `AIClient.withSelection()`，由 `AsyncLocalStorage` 隔離不同操作，不修改全域模型設定。

快照涵蓋一般任務、圖片討論、歷史篩選、前後自動記憶、圖片摘要、圖片提示詞整合與完工說明。任務的 `modelSelection`、`ai.model`／`ai.reasoningEffort` 以及記憶、提示詞整合紀錄可供回查。執行途中切換或停用模型，不影響已開始操作；待確認任務後續的套用／逐檔建立與完工整理也使用原快照。

圖片生成服務維持獨立模型選單與設定，不套用此文字模型選擇。

依 [OpenAI reasoning 文件](https://developers.openai.com/api/docs/guides/reasoning)，Responses 使用 `reasoning: { effort }`，Chat Completions 使用 `reasoning_effort`。各模型可用值與協定支援須依實際 API 確認；新增選單項目不代表端點一定提供該模型。

## API 與檔案

| API | 用途 |
| --- | --- |
| GET /api/text-models | 目前使用者的模型清單與預設值；不含金鑰 |
| POST /api/text-models | 驗證並整份保存清單；revision 防止過期覆寫 |
| GET /api/text-model-selection | 目前對話的選擇與有效性 |
| POST /api/text-model-selection | 保存目前對話的模型與深度 |

後端：`src/text-models.js`、`src/ai-client.js`、`server.js`。前端：`public/text-models-ui.js`、`public/index.html`、`public/styles.css`。

假 API 測試：`tests/text-models.test.js`、`tests/text-models-http.test.js`。瀏覽器互動測試：`tests/text-model-picker-browser.js`，涵蓋管理、對話切換／重載、停用防護與窄版選單。
