# 在 Claude Code 裡使用

MCP 伺服器讓 Claude Code 根據您專案裡的檔案繪製 draw.io 圖表。圖表顯示在您瀏覽器裡的一塊即時畫布上，這塊畫布和網頁版的一樣：您可以手動編輯，Claude 再次修改圖表之前會先讀取您的改動。

## 安裝

需要 Node.js 18 或更新版本。在終端機裡執行：

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

`--scope user` 讓所有專案都能用這些工具。不加的話，只有在執行指令的那個資料夾裡才能用。

也可以從 Claude Code 社群外掛市集把它作為外掛安裝（需要 Claude Code 2.1.275 或更新版本）：

```text
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

開啟新的 Claude Code 工作階段。連線成功後，`/mcp` 會列出 `drawio`。

Codex、VS Code、Cursor 和其他用戶端的用法，見 [MCP 伺服器 README](../../packages/mcp-server/README.md)。

## 畫第一張圖

請 Claude 把它能讀到的內容畫成圖：

```text
讀一下這個儲存庫，畫出它的架構
```

Claude 會用自己的工具讀取程式碼，在您的瀏覽器裡開啟預覽，並在那裡畫圖。較大的圖表會分幾次畫完，您可以看到它逐步成形。

其他效果不錯的請求：

- 「把結帳 API 的請求流程畫成時序圖」
- 「把 docs/architecture.md 轉成帶 AWS 圖示的圖表」
- 「開啟 diagrams/system.drawio，加上新的佇列服務」

<!-- demo: mcp -->

## 一起修改圖表

- **手動編輯。** 預覽就是完整的 draw.io 編輯器。您可以移動圖形、修改標籤或更改樣式；Claude 再次編輯前會讀取圖表，包括您的改動。
- **選取圖形。** 在預覽裡選取圖形，然後說「把這些改成藍色」或「把這個拆成兩個服務」。Claude 會讀取您選取的內容。
- **檢視改動。** Claude 的修改會被框出幾秒鐘。在預覽裡按 Ctrl+Z，可以撤回它的上一次修改。
- **回到更早的版本。** 最近 20 個版本以卡片形式顯示在畫布旁邊，您可以比較或還原其中一個。也可以讓 Claude 復原。

## 儲存和匯出

每次修改都會儲存到 `~/.next-ai-drawio/<session-id>.drawio`，連同最近 20 個版本；最新的 50 張圖表會被保留。想在之後的對話裡繼續畫某張圖，告訴 Claude 您要哪張圖即可：它會找到儲存的圖表並重新開啟。

需要檔案時，請讓 Claude 匯出：`.drawio`、`.png`、`.svg` 或 `.drawio.svg`。`.drawio.svg` 檔案是一張圖片，draw.io 也能開啟和編輯它，適合放在 README 檔案裡。

## 自己的畫圖規則

把規則寫在 `~/.next-ai-drawio/instructions.md` 裡，例如「始終使用簡約風格」。每次呼叫時，這些規則都會加到繪圖指南裡，所以修改規則後不必重新啟動就會生效。只讀取前 5000 個字元。

## 設定

環境變數可以改變伺服器的運作方式。新增伺服器時用 `-e` 傳入：

```bash
claude mcp add --scope user drawio -e DRAWIO_LANG=ja -- npx @next-ai-drawio/mcp-server@latest
```

| 變數 | 預設值 | 作用 |
|---|---|---|
| `PORT` | `6002` | 預覽連接埠；被佔用時，會使用下一個可用的連接埠，最高到 6020 |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | 儲存圖表和 `instructions.md` 的資料夾；設為 `off` 則不儲存 |
| `DRAWIO_AUTO_SCREENSHOT` | 未設定 | 設為 `true` 時，每次建立和編輯的結果都會附帶一張截圖（每次呼叫 2 到 10 秒） |
| `DRAWIO_LANG` | 未設定 | 固定編輯器和預覽的語言：`en`、`zh`、`zh-tw`、`ja`、`de` 等 |
| `DRAWIO_DARK` | `auto` | `1` 以深色啟動，`0` 以淺色啟動，`auto` 跟隨系統 |
| `BROWSER` | 未設定 | 設為 `none` 時不會自動開啟預覽 |

所有變數，以及如何使用自行架設的 draw.io，見 [MCP 伺服器 README](../../packages/mcp-server/README.md#configuration)。

## 問題排解

- **預覽沒有開啟。** 向 Claude 要預覽的 URL，然後自己開啟；URL 裡的 `?mcp=` 部分會把頁面連接到這個工作階段。
- **在 VS Code 的 Simple Browser 或 Cursor 的瀏覽器裡，預覽一片空白。** 這個頁面不允許被嵌入到其他頁面中。請在一般瀏覽器裡開啟這個 URL。
- **截圖或 PNG/SVG 匯出逾時。** 它們由預覽分頁負責產生，而瀏覽器會降低背景分頁的執行速度。請把這個分頁切到前景，再試一次。
- **「No active session」。** Claude 需要先啟動工作階段；請讓它重新啟動 drawio 工作階段。
