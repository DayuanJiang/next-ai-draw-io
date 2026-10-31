# 其他 MCP 用戶端

MCP 伺服器適用於任何能透過 stdio 執行本機 MCP 伺服器的用戶端：Codex CLI、VS Code、DeepSeek Harness、Cursor、Claude Desktop、Cline 等。需要 Node.js 18 或更新版本。Claude Code 的用法見[在 Claude Code 裡使用](./claude-code.md)。

## 讓代理來安裝

把下面這段貼到 Codex、Cursor、VS Code、Cline，或任何能編輯檔案和執行指令的代理裡：

```text
依照 https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md
為你目前所在的用戶端安裝 drawio MCP 伺服器。
安裝到我的所有專案（使用者範圍，Claude Code 用 "--scope user"），
伺服器名稱叫 "drawio"，保留已經設定好的伺服器。
然後告訴我怎樣重新載入，才能看到它的工具。
```

## Codex CLI

```bash
codex mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

Codex 每次呼叫會修改圖表的 drawio 工具前，都會先詢問您；沒有完整權限的 `codex exec` 會出現錯誤「MCP tool call requires approval」。想讓 drawio 工具不經詢問直接執行，請在 `~/.codex/config.toml` 裡這個伺服器的設定下加一行：

```toml
[mcp_servers.drawio]
command = "npx"
args = ["@next-ai-drawio/mcp-server@latest"]
default_tools_approval_mode = "approve"
```

只想允許部分工具時，改用 `[mcp_servers.drawio.tools.<工具名>]`，並設定 `approval_mode = "approve"`。

## VS Code

寫在 `.vscode/mcp.json` 裡：

```json
{
  "servers": {
    "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

## DeepSeek Harness

把外掛安裝到啟動 DSH 時使用的 profile 裡（profile 是 DSH 的一套設定，`dsh web` 用的是 `web`）：

```bash
dsh plugin --profile web add @next-ai-drawio/dsh
```

外掛會用 `npx` 啟動這個 MCP 伺服器。AI 會在回覆裡給出預覽連結，點開後預覽顯示在 DSH 的右側欄裡。DSH 網頁版預設關閉側欄瀏覽器，外掛會把它開啟。

預覽開啟之後，AI 才能截圖檢查自己畫的圖，而且只有支援圖片輸入的模型才能看到截圖；使用純文字模型時，DSH 會用一句文字說明代替圖片。

## Cursor、Claude Desktop、Cline 等

大多數用戶端使用同樣的格式，寫在 `~/.cursor/mcp.json`、`claude_desktop_config.json`、`cline_mcp_settings.json` 或它們自己的 MCP 設定裡：

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

設定寫在伺服器的 `env` 裡，例如 `"env": { "DRAWIO_LANG": "ja" }`。所有變數列在[在 Claude Code 裡使用](./claude-code.md)頁面中。

## 安裝之後

重新啟動用戶端，然後提一個需求，例如「讀一下這個儲存庫，畫出它的架構」。瀏覽器裡會開啟預覽，圖表會邊畫邊顯示。

<!-- demo: mcp -->

預覽頁不允許被嵌入到其他頁面中，所以 VS Code 的 Simple Browser 和 Cursor 的瀏覽器裡會顯示空白。請在一般瀏覽器裡開啟它的 URL。
