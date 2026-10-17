# Docker で実行する

Next AI Draw.io をローカルで実行したいだけなら、Docker を使うのが最もよい方法です。このページでは、コンテナでアプリを起動する方法、AI プロバイダーの設定を渡す方法、サーバーから複数のモデルを提供する方法、管理パネルの設定を残す方法を説明します。

## アプリを起動する

Docker がまだインストールされていない場合は、先にインストールしてください：[Docker を入手](https://docs.docker.com/get-docker/)。

次に、以下を実行します。

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

`-e` オプションでは、AI プロバイダー、モデル、API キーを設定しています。使いたい AI プロバイダーの設定に置き換えてください。利用できるオプションについては、[AI プロバイダー](./ai-providers.md)を参照してください。

## env ファイルを使う

設定は env ファイルに書くこともできます。リポジトリにあるテンプレート `env.example` から始めます。リポジトリをクローンしている場合は、これを `.env` にコピーします。クローンしていない場合は、GitHub からファイルをダウンロードします。

```bash
# クローンしたリポジトリの中で
cp env.example .env

# リポジトリがない場合
curl -o .env https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/env.example
```

`.env` を自分の設定に合わせて編集してから、`--env-file` を付けてコンテナを起動します。

```bash
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

`docker run --env-file` は、`=` より後ろをすべて値として使います。行末のコメントも値に含まれます。`env.example` には、行末にこのようなコメントが付いた行があります。

```bash
# OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: Custom OpenAI-compatible endpoint
```

このような行を、先頭の `#` を消して有効にするときは、値の後ろのコメントも消してください。

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
```

Docker Compose の `env_file` は、このようなコメントを自動で取り除きます。

## サーバーから複数のモデルを提供する

`ai-models.json` ファイルをコンテナにマウントできます。このファイルがあると、サーバーが複数のモデルを提供でき、ユーザーの API キーは公開されません。ファイルは `/app/ai-models.json` にマウントします。

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -v $(pwd)/ai-models.json:/app/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

コンテナ内の別のパスにファイルを置きたい場合は、`AI_MODELS_CONFIG_PATH` にそのパスを設定します。

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -e AI_MODELS_CONFIG_PATH=/config/ai-models.json \
  -v $(pwd)/ai-models.json:/config/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

## 管理パネルの設定を残す

[管理パネル](./admin-panel.md)は、設定をコンテナ内の `/app/data` フォルダーに保存します。リポジトリの `docker-compose.yml` は、`./data` フォルダーをそこにマウントします（`./data:/app/data`）。そのため、コンテナを置き換えても設定は残ります。`docker run` を使う場合は、同じマウントを追加します。

```bash
docker run -d -p 3000:3000 --env-file .env \
  -v $(pwd)/data:/app/data \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

コンテナ内のアプリはユーザー `nextjs`（ユーザー ID 1001）として動くので、このユーザーがフォルダーに書き込める必要があります。Linux では、`./data` がないと Docker が root の所有でフォルダーを作成し、管理パネルは読み取り専用になります。コンテナを起動する前に、正しい所有者でフォルダーを作成してください。`docker run` または `docker compose up` を実行する場所で、次のコマンドを実行します。

```bash
mkdir -p data
sudo chown 1001:1001 data
```

## embed.diagrams.net がブロックされている場合

アプリは embed.diagrams.net を必要としません。ghcr.io のイメージは `NEXT_PUBLIC_DRAWIO_BASE_URL` を設定せずにビルドされています。リポジトリの `docker-compose.yml` でビルドしたイメージも同じです。そのため、アプリは同梱の draw.io を `/drawio` から配信し、ブラウザは embed.diagrams.net にアクセスしません。ビルド引数 `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` を付けてビルドしたイメージだけが、そこから draw.io を読み込みます。

インターネットに接続できない環境でアプリを動かす方法については、[オフラインや社内ネットワークで使う](./offline-deployment.md)を参照してください。
