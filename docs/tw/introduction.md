# 簡介

Next AI Draw.io 讓您透過和 AI 對話來繪製和修改 draw.io 圖表。您描述一張圖，AI 就在真正的 draw.io 畫布上把它畫出來；之後您可以手動繼續修改，也可以讓 AI 修改。AI 的每次修改都會被框出來，並儲存為一個可以還原的版本。

<!-- demo: tour -->

## 三種使用方式

| 在哪裡用 | 您會得到什麼 | 從這裡開始 |
|---|---|---|
| 在瀏覽器裡 | next-ai-drawio.jiang.jp 上的編輯器。無需安裝；填入自己的 API Key，就不受展示網站每日額度的限制 | [開啟編輯器](https://next-ai-drawio.jiang.jp/) |
| 在桌面上 | 同一個應用程式，支援 Windows、macOS 和 Linux | [最新版本](https://github.com/DayuanJiang/next-ai-draw-io/releases/latest) |
| 在 AI 代理裡 | 一個 MCP 伺服器：Claude Code、Cursor、Codex 和 VS Code 根據您專案裡的檔案，在您瀏覽器裡的同一塊畫布上畫圖 | [在 Claude Code 裡使用](./claude-code.md) |

## 您可以做什麼

- **產生**：用文字描述一張圖，或者從截圖、白板照片、PDF 或網頁開始。
- **手動編輯**：畫布就是 draw.io 編輯器。您可以像在 draw.io 裡一樣移動圖形、更改樣式和新增圖形。
- **讓 AI 修改**：選取幾個圖形，讓 AI 只改這些圖形；也可以讓 AI 修改整張圖。AI 會先讀取您手動做的修改。
- **回到之前的版本**：AI 的每次修改都會在聊天裡產生一張版本卡片。您可以復原最近一次修改，把某個版本和畫布比較，或者還原更早的版本。
- **匯出**：儲存為 `.drawio` 檔案，以便在 draw.io 裡繼續編輯；也可以匯出 PNG 或 SVG。

## 工作原理

一張圖表就是一段 draw.io XML。應用程式會把您的請求和目前的圖表傳送給您選擇的 AI 模型，模型傳回新的或修改後的 XML，畫布會邊接收邊顯示。draw.io 編輯器隨應用程式一起打包，所以應用程式可以直接控制它，並讀回您的修改。

應用程式使用以下技術建置：

- **Next.js**：頁面和 API
- **Vercel AI SDK**（`ai` 和 `@ai-sdk/*`）：以串流方式從多家 AI 服務商取得回答
- **draw.io**：編輯器

## AI 服務商

展示網站有每日用量限制。您可以在「設定」裡選擇其他服務商，並填入自己的 Key；Key 儲存在您的瀏覽器裡，不會存到伺服器上。自己架設應用程式時，用環境變數設定服務商，見 [AI 服務商](./ai-providers.md)。

## 下一步

- 在網頁版裡[繪製和編輯](./editor.md)
- [版本與復原](./versions.md)
- [在 Claude Code 裡使用](./claude-code.md)，或在[其他 MCP 用戶端](./mcp-clients.md)裡使用
- [AWS 架構圖](./aws-architecture.md)，以及[流程圖和時序圖](./flowcharts.md)
- [使用 Docker 執行](./docker.md)
- [常見問題解答](./FAQ.md)
