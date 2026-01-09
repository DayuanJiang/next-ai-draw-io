# よくある質問 (FAQ)

---

## 1. PDFをエクスポートできない

**問題**: Web版でPDFエクスポートをクリックすると `convert.diagrams.net/node/export` にリダイレクトされ、その後何も起こらない

**原因**: 埋め込みDraw.ioは直接PDFエクスポートをサポートしておらず、外部変換サービスに依存しているが、iframe内では正常に動作しない

**解決策**: まず画像（PNG）としてエクスポートし、その後PDFに印刷する

**関連Issue**: #539, #125

---

## 2. embed.diagrams.netにアクセスできない（オフライン/イントラネットデプロイ）

**問題**: イントラネット環境で「embed.diagrams.netのサーバーIPアドレスが見つかりません」と表示される

**重要**: `NEXT_PUBLIC_*` 環境変数は**ビルド時**変数であり、JSコードにバンドルされます。**実行時の設定は無効です！**

**解決策**: ビルド時に `args` で渡す必要があります：

```yaml
# docker-compose.yml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://あなたのサーバーIP:8080/
    ports: ["3000:3000"]
    env_file: .env
```

**イントラネットユーザー**: 外部ネットワークでDockerfileを修正してイメージをビルドし、イントラネットに転送する

**関連Issue**: #295, #317

---

## 3. 自前モデルが思考するだけで描画しない

**問題**: ローカルデプロイのモデル（Qwen、LiteLLMなど）が思考過程のみを出力し、図表を生成しない

**考えられる原因**:
1. **モデルが小さすぎる** - 小さいモデルはtool calling指示に正しく従うことが難しい、32B+パラメータのモデルを推奨
2. **tool callingが有効になっていない** - モデルサービスでtool use機能を設定する必要がある

**解決策**: tool callingを有効にする、例えばvLLM：
```bash
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3-32B \
    --enable-auto-tool-choice \
    --tool-call-parser hermes
```

**関連Issue**: #269, #75

---

## 4. 画像アップロード後「画像が提供されていません」と表示される

**考えられる原因**:
1. モデルがビジョン機能をサポートしていない（Kimi K2、DeepSeek、Qwenテキストモデルなど）

**解決策**:
- ビジョン対応モデルを使用：GPT-4o、Claude 3.5 Sonnet、Gemini Pro Vision
- モデル名に `vision` または `vl` が含まれているものは画像をサポート
- 最新バージョン（v0.4.9+）にアップデート

**関連Issue**: #324, #421, #469
