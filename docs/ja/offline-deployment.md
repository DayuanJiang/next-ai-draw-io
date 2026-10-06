# オフラインデプロイ

Next AI Draw.io には draw.io のコピーが同梱されています。`npm run build`（Docker ビルドを含む）が draw.io のリリースを一度だけ `public/drawio` にダウンロードし、アプリは `/drawio` からそれを配信します。利用中のブラウザは `embed.diagrams.net` にアクセスしないため、ビルド時にインターネットに接続できれば、オフライン環境やイントラネットでも動作します。

## Docker Compose のセットアップ

1. リポジトリをクローンし、`.env` ファイルに API キーを定義します。
2. `docker compose up -d` を実行します（リポジトリの `docker-compose.yml` を使います）。
3. `http://localhost:3000` を開きます。

draw.io 用の別コンテナは不要です。

## ビルド環境がインターネットに接続できない場合

ビルドは [draw.io のリリース](https://github.com/jgraph/drawio/releases) から `draw.war`（約 50 MB）をダウンロードします。ビルド環境から GitHub にアクセスできない場合は、次のどちらかを行ってください。

- 別のマシンで `scripts/fetch-drawio.mjs` に書かれたバージョンの `draw.war` をダウンロードし、`public/drawio` に展開します（`WEB-INF` と `META-INF` は削除）。さらにバージョン（例：`v32.0.2`）を `public/drawio/.version` に書き込みます。ビルドはこのコピーを使います。
- インターネットに接続できるマシンでイメージをビルドし、オフライン環境に転送します。

## ほかのサイトの画像

同梱の draw.io は静的ファイルだけで、draw.io の画像プロキシ（`/drawio/proxy`）は含まれません。ほかのサイトの画像を URL で挿入するとキャンバスには表示されますが、エクスポートした PNG・SVG やバージョンのサムネイルには入りません。draw.io はこうした画像をこのプロキシ経由で取得するためです。こうした画像はファイルから挿入してください。draw.io が図の中に保存します。

## 別の draw.io サーバーを使う場合（任意）

ビルド時の変数 `NEXT_PUBLIC_DRAWIO_BASE_URL` で、`jgraph/drawio` イメージなど別の draw.io を使うこともできます。

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

外部の draw.io を使うと、アプリは draw.io 自身のツールバーを使い、次の機能は使えなくなります：AI が変更した図形の強調表示、選択した図形についての依頼、アプリのキャンバスツールバー、Ctrl+Z による AI の変更の取り消し。ブラウザは、別のオリジンから配信されたエディターをページから操作することを許可しないためです。

**`NEXT_PUBLIC_DRAWIO_BASE_URL` は、ユーザーのブラウザからアクセスできる必要があります。**

| シナリオ | URL の値 |
|----------|-----------|
| ローカルホスト | `http://localhost:8080` |
| リモート/サーバー | `http://YOUR_SERVER_IP:8080` |

**`http://drawio:8080` のような Docker 内部のエイリアスは絶対に使用しないでください。** ブラウザはこれらを名前解決できません。
