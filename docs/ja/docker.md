# Dockerで実行する

ローカルで実行したいだけであれば、Dockerを使用するのが最も良い方法です。

まず、Dockerがまだインストールされていない場合はインストールしてください: [Dockerを入手](https://docs.docker.com/get-docker/)

次に、以下を実行します。

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

または、envファイルを使用します。

```bash
cp env.example .env
# .envを構成に合わせて編集します
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

ブラウザで[http://localhost:3000](http://localhost:3000)を開きます。

環境変数は、お好みのAIプロバイダー設定に置き換えてください。利用可能なオプションについては、[AIプロバイダー](./ai-providers.md)を参照してください。

> **オフラインデプロイ:** `embed.diagrams.net`がブロックされている場合は、構成オプションについて[オフラインデプロイ](./offline-deployment.md)を参照してください。
