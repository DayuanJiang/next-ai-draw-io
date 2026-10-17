# 使用 Docker 运行

如果您只是想在本地运行 Next AI Draw.io，最好的方式是使用 Docker。本页介绍如何在容器里启动应用、填入 AI 服务商的配置、由服务器提供多个模型，以及保留管理面板的设置。

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

您也可以把配置写在环境变量文件里。请从仓库里的模板 `env.example` 开始。如果您已经克隆了仓库，把它复制为 `.env`；如果没有，从 GitHub 下载这个文件：

```bash
# 在克隆下来的仓库里
cp env.example .env

# 没有仓库时
curl -o .env https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/env.example
```

在 `.env` 里填入您的配置，再加上 `--env-file` 启动容器：

```bash
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

`docker run --env-file` 会把 `=` 后面的所有内容都当作值，行末的注释也算在内。`env.example` 里有些行的末尾带有这样的注释：

```bash
# OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: Custom OpenAI-compatible endpoint
```

当您删掉行首的 `#` 启用这样的一行时，请把值后面的注释也删掉：

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
```

Docker Compose 的 `env_file` 会自动去掉这类注释。

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

## 保留管理面板的设置

[管理面板](./admin-panel.md)把设置保存在容器里的 `/app/data` 目录中。仓库里的 `docker-compose.yml` 会把 `./data` 目录挂载到这里（`./data:/app/data`），所以更换容器后，设置仍然保留。使用 `docker run` 时，请加上同样的挂载：

```bash
docker run -d -p 3000:3000 --env-file .env \
  -v $(pwd)/data:/app/data \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

容器里的应用以用户 `nextjs`（用户 ID 1001）的身份运行，这个用户必须能写入这个目录。在 Linux 上，如果 `./data` 不存在，Docker 会创建它，所有者是 root，管理面板就会变成只读。请在启动容器之前，先创建这个目录并设置正确的所有者。在您运行 `docker run` 或 `docker compose up` 的目录里运行：

```bash
mkdir -p data
sudo chown 1001:1001 data
```

## 无法访问 embed.diagrams.net 时

应用不需要访问 embed.diagrams.net。ghcr.io 上的镜像在构建时没有设置 `NEXT_PUBLIC_DRAWIO_BASE_URL`，用仓库里的 `docker-compose.yml` 构建的镜像也一样。所以应用从 `/drawio` 提供自带的 draw.io，浏览器不会访问 embed.diagrams.net。只有构建时传入构建参数 `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` 的镜像，才会从那里加载 draw.io。

如果要在不能联网的环境里运行应用，请参阅[在离线环境或内网中运行](./offline-deployment.md)。
