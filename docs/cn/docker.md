# 使用 Docker 运行

如果您只是想在本地运行 Next AI Draw.io，最好的方式是使用 Docker。本页介绍如何在容器里启动应用、填入 AI 服务商的配置，以及由服务器提供多个模型。

## 启动应用

如果您还没有安装 Docker，请先安装：[获取 Docker](https://docs.docker.com/get-docker/)。

然后运行：

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

`-e` 选项设置的是 AI 服务商、模型和 API Key。请把它们换成您想用的 AI 服务商的配置。可用的选项见 [AI 服务商](./ai-providers.md)。

## 使用环境变量文件

您也可以把配置写在环境变量文件里。把 `env.example` 复制为 `.env`，在 `.env` 里填入您的配置，再加上 `--env-file` 启动容器：

```bash
cp env.example .env
# 编辑 .env 文件并填入您的配置
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

## 由服务器提供多个模型

您可以把 `ai-models.json` 文件挂载到容器里。有了这个文件，服务器就能提供多个模型，用户的 API Key 也不会暴露。把文件挂载到 `/app/ai-models.json`：

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -v $(pwd)/ai-models.json:/app/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

如果想把文件放在容器里的其他路径，请把 `AI_MODELS_CONFIG_PATH` 设为这个路径：

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -e AI_MODELS_CONFIG_PATH=/config/ai-models.json \
  -v $(pwd)/ai-models.json:/config/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

## 无法访问 embed.diagrams.net 时

可用的配置选项见[在离线环境或内网中运行](./offline-deployment.md)。
