# オフラインや社内ネットワークで使う

Next AI Draw.io は、社内ネットワーク（イントラネット）のように、インターネットに接続できないネットワークでも動かせます。このページでは、そうした環境でビルドして実行する方法と、必要なときに別の draw.io サーバーを使う方法を説明します。

## オフラインで動く仕組み

Next AI Draw.io には draw.io のコピーが同梱されています。`npm run build` は draw.io のリリースを一度だけ `public/drawio` にダウンロードします。Docker ビルドでも同じです。アプリはこのコピーを `/drawio` から配信します。

アプリを使っている間、ブラウザは `embed.diagrams.net` にアクセスしません。そのため、ビルド時にインターネットに接続できれば、アプリはオフライン環境や社内ネットワークでも動作します。

## Docker Compose で実行する

1. リポジトリをクローンし、`.env` ファイルに API キーを定義します。
2. `docker compose up -d` を実行します。リポジトリの `docker-compose.yml` が使われます。
3. `http://localhost:3000` を開きます。

draw.io 用の別のコンテナは必要ありません。

## インターネットに接続できない環境でビルドする

ビルドでは [draw.io のリリース](https://github.com/jgraph/drawio/releases) から `draw.war`（約 50 MB）をダウンロードします。ビルドするマシンから GitHub にアクセスできない場合は、次のどちらかを行ってください。

- **draw.io を手で配置する**：別のマシンで、`packages/mcp-server/src/drawio-version.json` に書かれたバージョンの `draw.war` をダウンロードします。それを `public/drawio` に展開し、中の `WEB-INF` と `META-INF` のフォルダを削除します。さらにバージョン（例：`v32.0.2`）を `public/drawio/.version` に書き込みます。ビルドはこのコピーを使います。
- **別の場所でイメージをビルドする**：インターネットに接続できるマシンでイメージをビルドし、オフライン環境に転送します。

## ほかのサイトの画像を挿入する

同梱の draw.io は、静的ファイル（サーバーがそのまま送るファイル）の集まりです。画像プロキシ（`/drawio/proxy`）は含まれていません。画像プロキシは draw.io サーバーの一部で、draw.io の代わりにほかのサイトの画像を取得します。

ほかのサイトの画像を URL で挿入しても、キャンバスには表示されます。エクスポートした PNG や SVG の画像と、バージョンの画像には入りません。draw.io はこうした画像をこのプロキシ経由で取得するためです。

こうした画像はファイルから挿入してください。draw.io が図の中に保存します。

## 別の draw.io サーバーを使う

これは任意です。`jgraph/drawio` イメージなど、別の draw.io をアプリから使うこともできます。`NEXT_PUBLIC_DRAWIO_BASE_URL` にそのアドレスを設定します。この変数はアプリのビルド時に読み込まれるので、ビルド引数として渡します。

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
    volumes:
      - ./data:/app/data
    depends_on: [drawio]
```

`volumes` の項目は、[管理パネル](./admin-panel.md)で保存した設定（`data/settings.json`）をコンテナの外に置くので、コンテナを入れ替えても設定は残ります。

外部の draw.io を使うと、アプリは draw.io 自身のツールバーを使い、次の機能は使えなくなります。

- AI が変更した図形を枠で示す機能
- 選択した図形について AI に頼む機能
- アプリのキャンバスツールバー
- Ctrl+Z による AI の変更の取り消し

ブラウザが、別のオリジン（ホスト名、ポート、プロトコルのどれかが違うもの）から配信されたエディタをページから操作することを許可しないためです。

**`NEXT_PUBLIC_DRAWIO_BASE_URL` は、ユーザーのブラウザからアクセスできるアドレスにしてください。**

| draw.io を動かす場所 | 値 |
|---|---|
| 自分のコンピューター（localhost） | `http://localhost:8080` |
| リモートのサーバー | `http://YOUR_SERVER_IP:8080` |

**`http://drawio:8080` のような Docker 内部の名前は使わないでください。** これらはコンテナ同士が互いに接続するための名前で、ブラウザはこの名前から接続先を見つけられません。
