import type { Locale } from "@/lib/i18n/config"

// Text in `backticks` is shown as code

export type McpTexts = {
    title: string
    description: string
    keywords: string[]
    h1: string
    lede: string
    otherClients: string
    npm: string
    video: string
    installHeading: string
    tabs: {
        claude: string
        codex: string
        vscode: string
        others: string
        agent: string
    }
    /** The one-click install buttons in the VS Code and Cursor tabs */
    oneClick: { vscode: string; cursor: string }
    notes: {
        claudeScope: string
        claudePlugin: string
        codexApproval: string
        codexSome: string
        vscode: string
        others: string
        agent: string
    }
    /** What the agent is asked to do; the README's URL is in it */
    agentPrompt: string
    afterInstall: string
    featuresHeading: string
    features: { title: string; text: string }[]
    compareHeading: string
    compareIntro: string
    compareColumns: [string, string, string]
    /** In the order of COMPARE_LINKS on the page */
    compareRows: { server: string; how: string; fit: string }[]
    toolsHeading: string
    toolsColumns: [string, string]
    /** In the order of TOOLS on the page */
    tools: string[]
    moreHeading: string
    moreText: string
    moreDocs: string
    moreReadme: string
}

const README =
    "https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md"

export const TEXTS: Record<Locale, McpTexts> = {
    en: {
        title: "draw.io MCP server for Claude Code, Cursor, Codex and VS Code",
        description:
            "An MCP server that lets Claude Code, Cursor, Codex, VS Code and other AI agents draw draw.io diagrams from your project's files on a live canvas in your browser. Edit by hand at any time; every AI change is outlined and can be undone.",
        keywords: [
            "draw.io MCP server",
            "drawio MCP",
            "Claude Code diagram",
            "Cursor MCP diagram",
            "architecture diagram from code",
            "MCP server",
        ],
        h1: "A draw.io MCP server for Claude Code, Cursor, Codex and VS Code",
        lede: "Your AI agent reads your project's files and draws the diagram on a live draw.io canvas in your browser. Edit it by hand at any time: the agent reads your changes before it edits again.",
        otherClients: "Install in other clients",
        npm: "npm package",
        video: "The MCP server drawing a diagram from a codebase",
        installHeading: "Install",
        tabs: {
            claude: "Claude Code",
            codex: "Codex CLI",
            vscode: "VS Code",
            others: "Cursor and others",
            agent: "Ask your agent",
        },
        oneClick: { vscode: "Install in VS Code", cursor: "Add to Cursor" },
        notes: {
            claudeScope:
                "`--scope user` makes the tools available in every project. Without it, they exist only in the folder where you ran the command.",
            claudePlugin:
                "Or install it as a plugin from the Claude Code community marketplace (Claude Code 2.1.275 or later):",
            codexApproval:
                'Codex asks before each drawio tool that changes the diagram, and `codex exec` without full access fails with "MCP tool call requires approval". To let the drawio tools run without asking, add one line to the server\'s section in `~/.codex/config.toml`:',
            codexSome:
                'To approve only some tools, use `[mcp_servers.drawio.tools.<tool name>]` with `approval_mode = "approve"` instead.',
            vscode: "Or write it in `.vscode/mcp.json`:",
            others: "Or write it in `~/.cursor/mcp.json`, `claude_desktop_config.json`, `cline_mcp_settings.json` or your client's MCP config:",
            agent: "Paste this into Claude Code, Codex, Cursor, VS Code, Cline or any agent that can edit files and run commands:",
        },
        agentPrompt: `Install the drawio MCP server for the client you are running in, following
${README}
Install it for all my projects (user scope, for Claude Code "--scope user"),
name the server "drawio" and keep the servers that are already configured.
Then tell me how to reload so its tools show up.`,
        afterInstall:
            'Restart the client, then ask, for example, "Read this repo and draw its architecture". The preview opens in your browser and the diagram appears as it is drawn.',
        featuresHeading: "What it does",
        features: [
            {
                title: "Draws from your project",
                text: "The agent reads your code and documents with its own tools. Existing `.drawio` and `.drawio.svg` files open too.",
            },
            {
                title: "Every change is a version",
                text: "The AI's changes are outlined for a few seconds and one Ctrl+Z takes them back. The last 20 versions sit next to the canvas to restore or compare.",
            },
            {
                title: "You and the AI share the canvas",
                text: 'Edit by hand at any time, or select shapes and say "these". The AI reads your edits before it edits again.',
            },
            {
                title: "Real icons",
                text: "The web app's drawing rules and shape libraries for AWS, Azure, GCP, Kubernetes, Cisco and more, so the AI uses real icon names.",
            },
            {
                title: "Checks its own work",
                text: "The AI can look at a screenshot of the rendered diagram and fix overlapping shapes.",
            },
            {
                title: "Export, offline and saved",
                text: "Save `.drawio`, `.png`, `.svg` or `.drawio.svg`. The draw.io editor ships inside the package and works offline, and every diagram is saved for a later conversation.",
            },
        ],
        compareHeading: "Choosing a draw.io MCP server",
        compareIntro:
            "Several MCP servers draw draw.io diagrams. As of October 2026 they differ like this:",
        compareColumns: [
            "Server",
            "How you see and change the diagram",
            "A good fit when",
        ],
        compareRows: [
            {
                server: "This server, `@next-ai-drawio/mcp-server`",
                how: "A live draw.io canvas in your browser. The AI reads it back, including your hand edits and selection; its changes are outlined, Ctrl+Z takes them back, and earlier versions can be restored",
                fit: "You and the AI take turns on the same diagram",
            },
            {
                server: "draw.io's official `@drawio/mcp`",
                how: "Opens each diagram from XML, CSV or Mermaid in the draw.io editor in a new tab; no tool reads it back",
                fit: "You want the diagram in the full draw.io editor and edit it yourself from there",
            },
            {
                server: "draw.io's hosted MCP app, `https://mcp.draw.io/mcp`",
                how: "Shows the diagram inside the chat in Claude.ai, ChatGPT, VS Code or Cursor, with nothing to install; the diagram is sent to draw.io's server",
                fit: "You work in a chat app and want to see the diagram in the conversation",
            },
            {
                server: "draw.io's plugin for Claude Code, Codex CLI and Copilot CLI",
                how: "A skill that writes `.drawio` files; PNG, SVG and PDF export needs draw.io Desktop",
                fit: "You want diagram files in your repository without an MCP server",
            },
            {
                server: "`lgazo/drawio-mcp-server`",
                how: "A draw.io editor on localhost, or your own draw.io through a browser extension; tools create, read, update and delete single shapes, layers and pages",
                fit: "You want fine-grained tools, several documents at once, or Mermaid import",
            },
        ],
        toolsHeading: "Tools",
        toolsColumns: ["Tool", "What it does"],
        tools: [
            "Open the preview and return the drawing guide; `session_id` continues a saved diagram",
            "Draw a new diagram from `mxCell` XML",
            "Add, update or delete cells by id, all or nothing",
            "The current XML, including your edits in the browser",
            "The shapes you selected in the preview",
            "A PNG of a page, for the AI to check",
            "Open a `.drawio` or `.drawio.svg` file; save `.drawio`, `.png`, `.svg` or `.drawio.svg`",
            "Go back to an earlier version; a redo stays possible",
            "Diagrams saved by earlier sessions, newest first",
            "The drawing rules again; the icon styles of a library such as `aws4`",
            "Pages (tabs)",
        ],
        moreHeading: "Configuration and troubleshooting",
        moreText:
            "Environment variables, your own drawing rules, a self-hosted draw.io and fixes for common problems are in the docs and the README.",
        moreDocs: "Use it from Claude Code",
        moreReadme: "MCP server README",
    },
    zh: {
        title: "draw.io MCP 服务器：适用于 Claude Code、Cursor、Codex 和 VS Code",
        description:
            "一个 MCP 服务器，让 Claude Code、Cursor、Codex、VS Code 等 AI 代理根据您项目里的文件，在浏览器里的实时画布上绘制 draw.io 图表。随时可以手动修改，AI 的每次修改都会被框出来，并且可以撤销。",
        keywords: [
            "draw.io MCP",
            "drawio MCP 服务器",
            "Claude Code 画图",
            "Cursor MCP",
            "代码生成架构图",
            "MCP 服务器",
        ],
        h1: "适用于 Claude Code、Cursor、Codex 和 VS Code 的 draw.io MCP 服务器",
        lede: "AI 代理读取您项目里的文件，在浏览器里一块实时的 draw.io 画布上画图。您随时可以手动修改，代理再次修改前会先读取您的改动。",
        otherClients: "在其他客户端安装",
        npm: "npm 包",
        video: "MCP 服务器根据代码库绘制图表",
        installHeading: "安装",
        tabs: {
            claude: "Claude Code",
            codex: "Codex CLI",
            vscode: "VS Code",
            others: "Cursor 等",
            agent: "让代理来装",
        },
        oneClick: { vscode: "在 VS Code 中安装", cursor: "添加到 Cursor" },
        notes: {
            claudeScope:
                "`--scope user` 让所有项目都能用这些工具。不加的话，只有在运行命令的那个文件夹里才能用。",
            claudePlugin:
                "也可以从 Claude Code 社区插件市场安装插件（需要 Claude Code 2.1.275 或更高版本）：",
            codexApproval:
                "Codex 每次调用会修改图表的 drawio 工具前都会询问，没有完全权限的 `codex exec` 会报错“MCP tool call requires approval”。想让 drawio 工具不经询问直接运行，在 `~/.codex/config.toml` 里这个服务器的配置下加一行：",
            codexSome:
                '只想放行部分工具时，改用 `[mcp_servers.drawio.tools.<工具名>]`，并设置 `approval_mode = "approve"`。',
            vscode: "或者手动写在 `.vscode/mcp.json` 里：",
            others: "或者手动写在 `~/.cursor/mcp.json`、`claude_desktop_config.json`、`cline_mcp_settings.json` 或您的客户端的 MCP 配置里：",
            agent: "把下面这段粘贴给 Claude Code、Codex、Cursor、VS Code、Cline，或任何能编辑文件和运行命令的代理：",
        },
        agentPrompt: `按照 ${README}
为你当前所在的客户端安装 drawio MCP 服务器。
安装到我的所有项目（用户范围，Claude Code 用 "--scope user"），
服务器名叫 "drawio"，保留已经配置好的服务器。
然后告诉我怎样重新加载，才能看到它的工具。`,
        afterInstall:
            "重启客户端，然后提一个需求，比如“读一下这个仓库，画出它的架构”。浏览器里会打开预览，图表会边画边显示。",
        featuresHeading: "它能做什么",
        features: [
            {
                title: "根据项目画图",
                text: "代理用自己的工具读取代码和文档。已有的 `.drawio` 和 `.drawio.svg` 文件也能打开。",
            },
            {
                title: "每次修改都是一个版本",
                text: "AI 的修改会被框出几秒钟，按一次 Ctrl+Z 就能撤回。最近 20 个版本显示在画布旁边，可以恢复或对比。",
            },
            {
                title: "您和 AI 共用画布",
                text: "随时可以手动修改，也可以选中图形说“这些”。AI 再次修改前会先读取您的改动。",
            },
            {
                title: "真实的图标",
                text: "使用网页版的绘图规则和图形库，包括 AWS、Azure、GCP、Kubernetes、Cisco 等，AI 用的是真实的图标名称。",
            },
            {
                title: "自己检查结果",
                text: "AI 可以查看渲染后的截图，修正重叠的图形。",
            },
            {
                title: "导出、离线和保存",
                text: "可以保存为 `.drawio`、`.png`、`.svg` 或 `.drawio.svg`。draw.io 编辑器打包在里面，离线也能用；每张图都会保存，之后的对话可以接着画。",
            },
        ],
        compareHeading: "如何选择 draw.io MCP 服务器",
        compareIntro:
            "能画 draw.io 图表的 MCP 服务器有好几个。截至 2026 年 10 月，它们的区别如下：",
        compareColumns: ["服务器", "如何查看和修改图表", "适合的情况"],
        compareRows: [
            {
                server: "本服务器 `@next-ai-drawio/mcp-server`",
                how: "浏览器里一块实时的 draw.io 画布。AI 能读回画布，包括您的手动修改和选中的图形；它的修改会被框出来，Ctrl+Z 可以撤回，也能恢复之前的版本",
                fit: "您和 AI 轮流修改同一张图",
            },
            {
                server: "draw.io 官方的 `@drawio/mcp`",
                how: "把用 XML、CSV 或 Mermaid 生成的图在新标签页的 draw.io 编辑器里打开；没有读回图表的工具",
                fit: "您想在完整的 draw.io 编辑器里自己继续编辑",
            },
            {
                server: "draw.io 托管的 MCP 应用 `https://mcp.draw.io/mcp`",
                how: "在 Claude.ai、ChatGPT、VS Code 或 Cursor 的对话里直接显示图表，无需安装；图表会发送到 draw.io 的服务器",
                fit: "您在聊天应用里工作，想在对话中看到图",
            },
            {
                server: "draw.io 为 Claude Code、Codex CLI 和 Copilot CLI 做的插件",
                how: "一个写 `.drawio` 文件的技能；导出 PNG、SVG 和 PDF 需要 draw.io 桌面版",
                fit: "您想在仓库里得到图表文件，不想用 MCP 服务器",
            },
            {
                server: "`lgazo/drawio-mcp-server`",
                how: "localhost 上的 draw.io 编辑器，或通过浏览器扩展连接您自己的 draw.io；工具可以逐个创建、读取、更新和删除图形、图层和页面",
                fit: "您需要细粒度的工具、同时处理多个文档，或导入 Mermaid",
            },
        ],
        toolsHeading: "工具",
        toolsColumns: ["工具", "作用"],
        tools: [
            "打开预览并返回绘图指南；用 `session_id` 可以接着画已保存的图",
            "用 `mxCell` XML 画一张新图",
            "按 id 添加、更新或删除单元格，要么全部生效，要么都不改",
            "当前的 XML，包括您在浏览器里的修改",
            "您在预览里选中的图形",
            "某一页的 PNG，供 AI 检查",
            "打开 `.drawio` 或 `.drawio.svg` 文件；保存为 `.drawio`、`.png`、`.svg` 或 `.drawio.svg`",
            "回到之前的版本，之后仍可重做",
            "之前的会话保存的图表，最新的在前",
            "再次获取绘图规则；获取 `aws4` 等图形库的图标样式",
            "页面（标签页）",
        ],
        moreHeading: "配置和问题排查",
        moreText:
            "环境变量、自定义绘图规则、自建 draw.io，以及常见问题的解决办法，见文档和 README。",
        moreDocs: "在 Claude Code 里使用",
        moreReadme: "MCP 服务器 README",
    },
    ja: {
        title: "Claude Code、Cursor、Codex、VS Code 向け draw.io MCP サーバー",
        description:
            "Claude Code、Cursor、Codex、VS Code などの AI エージェントが、プロジェクトのファイルをもとに、ブラウザのライブキャンバスに draw.io の図を描ける MCP サーバーです。いつでも手で編集でき、AI の変更はすべて枠で示され、取り消せます。",
        keywords: [
            "draw.io MCP",
            "drawio MCP サーバー",
            "Claude Code 作図",
            "Cursor MCP",
            "コードから構成図",
            "MCP サーバー",
        ],
        h1: "Claude Code、Cursor、Codex、VS Code のための draw.io MCP サーバー",
        lede: "AI エージェントがプロジェクトのファイルを読み、ブラウザに開いたライブの draw.io キャンバスに図を描きます。いつでも手で編集でき、エージェントは次に編集する前にあなたの変更を読み取ります。",
        otherClients: "ほかのクライアントへのインストール",
        npm: "npm パッケージ",
        video: "MCP サーバーがコードベースから図を描く様子",
        installHeading: "インストール",
        tabs: {
            claude: "Claude Code",
            codex: "Codex CLI",
            vscode: "VS Code",
            others: "Cursor など",
            agent: "エージェントに任せる",
        },
        oneClick: { vscode: "VS Code にインストール", cursor: "Cursor に追加" },
        notes: {
            claudeScope:
                "`--scope user` を付けると、すべてのプロジェクトでツールを使えます。付けないと、コマンドを実行したフォルダでしか使えません。",
            claudePlugin:
                "Claude Code のコミュニティマーケットプレイスから、プラグインとしてもインストールできます（Claude Code 2.1.275 以降）。",
            codexApproval:
                "Codex は図を変更する drawio ツールを呼ぶたびに確認を求め、フルアクセスなしの `codex exec` は「MCP tool call requires approval」で失敗します。drawio ツールを確認なしで実行させるには、`~/.codex/config.toml` のこのサーバーのセクションに 1 行追加します。",
            codexSome:
                '一部のツールだけ許可するには、代わりに `[mcp_servers.drawio.tools.<ツール名>]` に `approval_mode = "approve"` を設定します。',
            vscode: "または `.vscode/mcp.json` に手で書きます。",
            others: "または `~/.cursor/mcp.json`、`claude_desktop_config.json`、`cline_mcp_settings.json` など、クライアントの MCP 設定に手で書きます。",
            agent: "Claude Code、Codex、Cursor、VS Code、Cline など、ファイルを編集してコマンドを実行できるエージェントに、次の文を貼り付けます。",
        },
        agentPrompt: `${README}
に従って、いま使っているクライアントに drawio MCP サーバーをインストールして。
すべてのプロジェクト向けに（ユーザースコープ、Claude Code なら "--scope user"）、
サーバー名は "drawio" にして、設定済みのサーバーは残して。
そのあと、ツールが表示されるように再読み込みする方法を教えて。`,
        afterInstall:
            "クライアントを再起動して、たとえば「このリポジトリを読んでアーキテクチャを図にして」と頼みます。ブラウザでプレビューが開き、図が描かれていく様子が見えます。",
        featuresHeading: "できること",
        features: [
            {
                title: "プロジェクトから描く",
                text: "エージェントは自分のツールでコードやドキュメントを読みます。既存の `.drawio` や `.drawio.svg` ファイルも開けます。",
            },
            {
                title: "変更はすべてバージョンに",
                text: "AI の変更は数秒間枠で示され、Ctrl+Z 一回で取り消せます。直近 20 のバージョンがキャンバスの横に並び、復元や比較ができます。",
            },
            {
                title: "あなたと AI で同じキャンバスを",
                text: "いつでも手で編集でき、図形を選んで「これ」と指示することもできます。AI は次に編集する前にあなたの変更を読み取ります。",
            },
            {
                title: "本物のアイコン",
                text: "Web 版と同じ描画ルールと、AWS、Azure、GCP、Kubernetes、Cisco などの図形ライブラリを使うので、AI は実在するアイコン名を使います。",
            },
            {
                title: "仕上がりを自分で確認",
                text: "AI は描画結果のスクリーンショットを見て、重なった図形を直せます。",
            },
            {
                title: "書き出し、オフライン、保存",
                text: "`.drawio`、`.png`、`.svg`、`.drawio.svg` で保存できます。draw.io エディタを同梱しているのでオフラインでも動き、図は保存されるので後の会話で続きを描けます。",
            },
        ],
        compareHeading: "draw.io MCP サーバーの選び方",
        compareIntro:
            "draw.io の図を描ける MCP サーバーはいくつかあります。2026 年 10 月時点での違いは次のとおりです。",
        compareColumns: ["サーバー", "図の見方と変え方", "向いている場面"],
        compareRows: [
            {
                server: "このサーバー `@next-ai-drawio/mcp-server`",
                how: "ブラウザのライブ draw.io キャンバス。AI は手での編集や選択も含めてキャンバスを読み取れます。AI の変更は枠で示され、Ctrl+Z で取り消せ、以前のバージョンも復元できます",
                fit: "あなたと AI が交互に同じ図を直していくとき",
            },
            {
                server: "draw.io 公式の `@drawio/mcp`",
                how: "XML、CSV、Mermaid から作った図を、新しいタブの draw.io エディタで開きます。図を読み取るツールはありません",
                fit: "完全な draw.io エディタで、自分で編集を続けたいとき",
            },
            {
                server: "draw.io がホストする MCP アプリ `https://mcp.draw.io/mcp`",
                how: "Claude.ai、ChatGPT、VS Code、Cursor のチャット内に図を表示します。インストール不要で、図は draw.io のサーバーに送られます",
                fit: "チャットアプリで作業していて、会話の中で図を見たいとき",
            },
            {
                server: "Claude Code、Codex CLI、Copilot CLI 向けの draw.io プラグイン",
                how: "`.drawio` ファイルを書き出すスキルです。PNG、SVG、PDF への書き出しには draw.io Desktop が必要です",
                fit: "MCP サーバーなしで、リポジトリに図のファイルを置きたいとき",
            },
            {
                server: "`lgazo/drawio-mcp-server`",
                how: "localhost の draw.io エディタか、ブラウザ拡張機能経由で自分の draw.io を使います。図形、レイヤー、ページを 1 つずつ作成、読み取り、更新、削除するツールがあります",
                fit: "細かいツール、複数ドキュメントの同時操作、Mermaid の読み込みが必要なとき",
            },
        ],
        toolsHeading: "ツール",
        toolsColumns: ["ツール", "内容"],
        tools: [
            "プレビューを開き、描画ガイドを返します。`session_id` で保存済みの図の続きを描けます",
            "`mxCell` の XML から新しい図を描きます",
            "id を指定してセルを追加、更新、削除します。すべて成功するか、何も変更しません",
            "ブラウザでの編集を含む、現在の XML",
            "プレビューで選択している図形",
            "AI が確認するための、ページの PNG",
            "`.drawio` や `.drawio.svg` ファイルを開きます。`.drawio`、`.png`、`.svg`、`.drawio.svg` で保存します",
            "以前のバージョンに戻します。やり直しもできます",
            "以前のセッションで保存した図。新しい順",
            "描画ルールをもう一度取得します。`aws4` などのライブラリのアイコンスタイルを取得します",
            "ページ（タブ）",
        ],
        moreHeading: "設定とトラブルシューティング",
        moreText:
            "環境変数、独自の描画ルール、セルフホストの draw.io、よくある問題の対処法は、ドキュメントと README にあります。",
        moreDocs: "Claude Code から使う",
        moreReadme: "MCP サーバーの README",
    },
    "zh-Hant": {
        title: "draw.io MCP 伺服器：適用於 Claude Code、Cursor、Codex 和 VS Code",
        description:
            "一個 MCP 伺服器，讓 Claude Code、Cursor、Codex、VS Code 等 AI 代理根據您專案裡的檔案，在瀏覽器裡的即時畫布上繪製 draw.io 圖表。隨時可以手動修改，AI 的每次修改都會被框出來，並且可以復原。",
        keywords: [
            "draw.io MCP",
            "drawio MCP 伺服器",
            "Claude Code 畫圖",
            "Cursor MCP",
            "程式碼產生架構圖",
            "MCP 伺服器",
        ],
        h1: "適用於 Claude Code、Cursor、Codex 和 VS Code 的 draw.io MCP 伺服器",
        lede: "AI 代理讀取您專案裡的檔案，在瀏覽器裡一塊即時的 draw.io 畫布上畫圖。您隨時可以手動修改，代理再次修改前會先讀取您的變更。",
        otherClients: "在其他用戶端安裝",
        npm: "npm 套件",
        video: "MCP 伺服器根據程式碼庫繪製圖表",
        installHeading: "安裝",
        tabs: {
            claude: "Claude Code",
            codex: "Codex CLI",
            vscode: "VS Code",
            others: "Cursor 等",
            agent: "讓代理來裝",
        },
        oneClick: { vscode: "在 VS Code 中安裝", cursor: "新增到 Cursor" },
        notes: {
            claudeScope:
                "`--scope user` 讓所有專案都能用這些工具。不加的話，只有在執行指令的那個資料夾裡才能用。",
            claudePlugin:
                "也可以從 Claude Code 社群外掛市集安裝外掛（需要 Claude Code 2.1.275 或更新版本）：",
            codexApproval:
                "Codex 每次呼叫會修改圖表的 drawio 工具前都會詢問，沒有完整權限的 `codex exec` 會出現錯誤「MCP tool call requires approval」。想讓 drawio 工具不經詢問直接執行，在 `~/.codex/config.toml` 裡這個伺服器的設定下加一行：",
            codexSome:
                '只想允許部分工具時，改用 `[mcp_servers.drawio.tools.<工具名稱>]`，並設定 `approval_mode = "approve"`。',
            vscode: "或者手動寫在 `.vscode/mcp.json` 裡：",
            others: "或者手動寫在 `~/.cursor/mcp.json`、`claude_desktop_config.json`、`cline_mcp_settings.json` 或您的用戶端的 MCP 設定裡：",
            agent: "把下面這段貼給 Claude Code、Codex、Cursor、VS Code、Cline，或任何能編輯檔案和執行指令的代理：",
        },
        agentPrompt: `依照 ${README}
為你目前所在的用戶端安裝 drawio MCP 伺服器。
安裝到我的所有專案（使用者範圍，Claude Code 用 "--scope user"），
伺服器名稱叫 "drawio"，保留已經設定好的伺服器。
然後告訴我怎樣重新載入，才能看到它的工具。`,
        afterInstall:
            "重新啟動用戶端，然後提一個需求，例如「讀一下這個儲存庫，畫出它的架構」。瀏覽器裡會開啟預覽，圖表會邊畫邊顯示。",
        featuresHeading: "它能做什麼",
        features: [
            {
                title: "根據專案畫圖",
                text: "代理用自己的工具讀取程式碼和文件。現有的 `.drawio` 和 `.drawio.svg` 檔案也能開啟。",
            },
            {
                title: "每次修改都是一個版本",
                text: "AI 的修改會被框出幾秒鐘，按一次 Ctrl+Z 就能撤回。最近 20 個版本顯示在畫布旁邊，可以還原或比較。",
            },
            {
                title: "您和 AI 共用畫布",
                text: "隨時可以手動修改，也可以選取圖形說「這些」。AI 再次修改前會先讀取您的變更。",
            },
            {
                title: "真實的圖示",
                text: "使用網頁版的繪圖規則和圖形庫，包括 AWS、Azure、GCP、Kubernetes、Cisco 等，AI 用的是真實的圖示名稱。",
            },
            {
                title: "自己檢查結果",
                text: "AI 可以查看呈現後的截圖，修正重疊的圖形。",
            },
            {
                title: "匯出、離線和儲存",
                text: "可以儲存為 `.drawio`、`.png`、`.svg` 或 `.drawio.svg`。draw.io 編輯器打包在裡面，離線也能用；每張圖都會儲存，之後的對話可以接著畫。",
            },
        ],
        compareHeading: "如何選擇 draw.io MCP 伺服器",
        compareIntro:
            "能畫 draw.io 圖表的 MCP 伺服器有好幾個。截至 2026 年 10 月，它們的差異如下：",
        compareColumns: ["伺服器", "如何查看和修改圖表", "適合的情況"],
        compareRows: [
            {
                server: "本伺服器 `@next-ai-drawio/mcp-server`",
                how: "瀏覽器裡一塊即時的 draw.io 畫布。AI 能讀回畫布，包括您的手動修改和選取的圖形；它的修改會被框出來，Ctrl+Z 可以撤回，也能還原之前的版本",
                fit: "您和 AI 輪流修改同一張圖",
            },
            {
                server: "draw.io 官方的 `@drawio/mcp`",
                how: "把用 XML、CSV 或 Mermaid 產生的圖在新分頁的 draw.io 編輯器裡開啟；沒有讀回圖表的工具",
                fit: "您想在完整的 draw.io 編輯器裡自己繼續編輯",
            },
            {
                server: "draw.io 託管的 MCP 應用 `https://mcp.draw.io/mcp`",
                how: "在 Claude.ai、ChatGPT、VS Code 或 Cursor 的對話裡直接顯示圖表，無需安裝；圖表會傳送到 draw.io 的伺服器",
                fit: "您在聊天應用裡工作，想在對話中看到圖",
            },
            {
                server: "draw.io 為 Claude Code、Codex CLI 和 Copilot CLI 做的外掛",
                how: "一個寫 `.drawio` 檔案的技能；匯出 PNG、SVG 和 PDF 需要 draw.io 桌面版",
                fit: "您想在儲存庫裡得到圖表檔案，不想用 MCP 伺服器",
            },
            {
                server: "`lgazo/drawio-mcp-server`",
                how: "localhost 上的 draw.io 編輯器，或透過瀏覽器擴充功能連接您自己的 draw.io；工具可以逐一建立、讀取、更新和刪除圖形、圖層和頁面",
                fit: "您需要細粒度的工具、同時處理多個文件，或匯入 Mermaid",
            },
        ],
        toolsHeading: "工具",
        toolsColumns: ["工具", "作用"],
        tools: [
            "開啟預覽並傳回繪圖指南；用 `session_id` 可以接著畫已儲存的圖",
            "用 `mxCell` XML 畫一張新圖",
            "依 id 新增、更新或刪除儲存格，要麼全部生效，要麼都不改",
            "目前的 XML，包括您在瀏覽器裡的修改",
            "您在預覽裡選取的圖形",
            "某一頁的 PNG，供 AI 檢查",
            "開啟 `.drawio` 或 `.drawio.svg` 檔案；儲存為 `.drawio`、`.png`、`.svg` 或 `.drawio.svg`",
            "回到之前的版本，之後仍可重做",
            "之前的工作階段儲存的圖表，最新的在前",
            "再次取得繪圖規則；取得 `aws4` 等圖形庫的圖示樣式",
            "頁面（分頁）",
        ],
        moreHeading: "設定和問題排解",
        moreText:
            "環境變數、自訂繪圖規則、自行架設 draw.io，以及常見問題的解決方法，請見文件和 README。",
        moreDocs: "在 Claude Code 裡使用",
        moreReadme: "MCP 伺服器 README",
    },
}
