# ほかの MCP クライアント

MCP サーバーは、ローカルの MCP サーバーを stdio で動かせるクライアントならどれでも使えます。Codex CLI、VS Code、Cursor、Claude Desktop、Cline などです。Node.js 18 以降が必要です。Claude Code については [Claude Code から使う](./claude-code.md)を参照してください。

## エージェントにインストールしてもらう

Codex、Cursor、VS Code、Cline など、ファイルを編集してコマンドを実行できるエージェントに、次の文を貼り付けます。

```text
https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md
に従って、いま使っているクライアントに drawio MCP サーバーをインストールして。
すべてのプロジェクト向けに（ユーザースコープ、Claude Code なら "--scope user"）、
サーバー名は "drawio" にして、設定済みのサーバーは残して。
そのあと、ツールが表示されるように再読み込みする方法を教えて。
```

## Codex CLI

```bash
codex mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

Codex は図を変更する drawio ツールを呼ぶたびに確認を求め、フルアクセスなしの `codex exec` は「MCP tool call requires approval」で失敗します。drawio ツールを確認なしで実行させるには、`~/.codex/config.toml` のこのサーバーのセクションに 1 行追加します。

```toml
[mcp_servers.drawio]
command = "npx"
args = ["@next-ai-drawio/mcp-server@latest"]
default_tools_approval_mode = "approve"
```

一部のツールだけ許可するには、代わりに `[mcp_servers.drawio.tools.<ツール名>]` に `approval_mode = "approve"` を設定します。

## VS Code

`.vscode/mcp.json` に書きます。

```json
{
  "servers": {
    "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

## Cursor、Claude Desktop、Cline など

ほとんどのクライアントは同じ形式を使います。`~/.cursor/mcp.json`、`claude_desktop_config.json`、`cline_mcp_settings.json`、またはクライアント独自の MCP 設定に書きます。

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

設定はサーバーの `env` に書きます。たとえば `"env": { "DRAWIO_LANG": "ja" }` です。変数の一覧は [Claude Code から使う](./claude-code.md)の「設定」にあります。

## インストールのあと

クライアントを再起動して、たとえば「このリポジトリを読んでアーキテクチャを図にして」と頼みます。ブラウザでプレビューが開き、図が描かれていく様子が見えます。

<!-- demo: mcp -->

プレビューはほかのページへの埋め込みを拒否するため、VS Code の Simple Browser や Cursor のブラウザでは真っ白に表示されます。通常のブラウザで URL を開いてください。
