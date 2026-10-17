# Docker で実行する

Next AI Draw.io をローカルで実行したいだけなら、Docker を使うのが最もよい方法です。このページでは、コンテナでアプリを起動する方法、AI プロバイダーの設定を渡す方法、サーバーから複数のモデルを提供する方法を説明します。

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

設定は env ファイルに書くこともできます。`env.example` を `.env` にコピーし、`.env` を自分の設定に合わせて編集してから、`--env-file` を付けてコンテナを起動します。

```bash
cp env.example .env
# .envを構成に合わせて編集します
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

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

## embed.diagrams.net がブロックされている場合

構成オプションについては、[オフラインや社内ネットワークで使う](./offline-deployment.md)を参照してください。
