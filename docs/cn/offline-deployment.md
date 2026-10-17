# 在离线环境或内网中运行

Next AI Draw.io 可以在不能访问互联网的网络里运行，例如公司内网。本页介绍如何在这种环境里构建和运行它，以及在需要时如何使用单独的 draw.io 服务器。

## 应用如何离线工作

Next AI Draw.io 自带一份 draw.io。`npm run build` 会把 draw.io 的发布包下载到 `public/drawio`，只下载一次；Docker 构建也是这样。之后应用从 `/drawio` 提供这份副本。

使用应用时，浏览器不会访问 `embed.diagrams.net`。所以只要构建时能联网，应用就能在离线网络或内网里使用。

## 使用 Docker Compose 运行

1. 克隆仓库，并在 `.env` 文件中定义您的 API Key。
2. 运行 `docker compose up -d`。它会使用仓库里的 `docker-compose.yml`。
3. 打开 `http://localhost:3000`。

您不需要单独的 draw.io 容器。

## 在不能联网的机器上构建

构建时会从 [draw.io 发布页](https://github.com/jgraph/drawio/releases) 下载 `draw.war`（约 50 MB）。如果构建机器访问不了 GitHub，请选择下面两种做法之一：

- **手动放入 draw.io。** 在另一台机器上，下载 `packages/mcp-server/src/drawio-version.json` 里写明的那个版本的 `draw.war`。把它解压到 `public/drawio`，然后删掉其中的 `WEB-INF` 和 `META-INF` 文件夹。再把版本号（例如 `v32.0.2`）写进 `public/drawio/.version`。构建时就会使用这份副本。
- **在别处构建镜像。** 在能联网的机器上构建镜像，再把镜像拷到离线网络里。

## 插入其他网站的图片

自带的 draw.io 是一组静态文件（服务器原样发送的文件）。其中没有图片代理（`/drawio/proxy`）。图片代理是 draw.io 服务器的一部分，负责替 draw.io 获取其他网站的图片。

用网址插入的其他网站的图片，仍然能在画布上显示。导出的 PNG、SVG 图片和版本缩略图里不会有它，因为 draw.io 要通过这个代理去取这类图片。

这类图片请改用文件插入，draw.io 会把它保存在图表里。

## 使用单独的 draw.io 服务器

这一步是可选的。您仍然可以让应用使用别处的 draw.io，比如 `jgraph/drawio` 镜像。把 `NEXT_PUBLIC_DRAWIO_BASE_URL` 设为它的地址。这个变量在构建应用时读取，所以要作为构建参数传入：

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

`volumes` 这一项把您在[管理面板](./admin-panel.md)里保存的设置（`data/settings.json`）放在容器之外，所以更换容器后，这些设置仍然保留。

使用外部 draw.io 时，应用改用 draw.io 自己的工具栏，以下功能不可用：

- 框出 AI 改过的图形
- 针对选中的图形提问
- 应用自己的画布工具栏
- 用 Ctrl+Z 撤回 AI 的修改

浏览器不允许页面控制来自其他源（主机名、端口或协议不同）的编辑器。

**`NEXT_PUBLIC_DRAWIO_BASE_URL` 必须是用户浏览器能访问的地址。**

| draw.io 运行在哪里 | 值 |
|---|---|
| 您自己的电脑（localhost） | `http://localhost:8080` |
| 远程服务器 | `http://YOUR_SERVER_IP:8080` |

**不要使用** Docker 内部的名称，例如 `http://drawio:8080`。这些是容器之间互相访问用的名称，浏览器无法通过它们找到服务器。
