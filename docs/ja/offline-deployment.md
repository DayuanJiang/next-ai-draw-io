# オフラインデプロイ

`embed.diagrams.net` の代わりに draw.io をセルフホストすることで、Next AI Draw.io をオフライン環境にデプロイできます。

**注:** `NEXT_PUBLIC_DRAWIO_BASE_URL` は**ビルド時**の変数です。これを変更する場合は、Docker イメージの再ビルドが必要です。

## Docker Compose のセットアップ

1. リポジトリをクローンし、`.env` ファイルに API キーを定義します。
2. `docker-compose.yml` を作成します。

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [drawio]
```

3. `docker compose up -d` を実行し、`http://localhost:3000` にアクセスします。

## 設定と重要な警告

**`NEXT_PUBLIC_DRAWIO_BASE_URL` は、ユーザーのブラウザからアクセスできる必要があります。**

| シナリオ | URL の値 |
|----------|-----------|
| ローカルホスト | `http://localhost:8080` |
| リモート/サーバー | `http://YOUR_SERVER_IP:8080` |

**`http://drawio:8080` のような Docker 内部のエイリアスは絶対に使用しないでください。** ブラウザはこれらを名前解決できません。
