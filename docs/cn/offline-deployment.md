# 离线部署

Next AI Draw.io 自带一份 draw.io。`npm run build`（包括 Docker 构建）会把 draw.io 的发布包下载到 `public/drawio`，只下载一次，应用从 `/drawio` 提供它。使用时浏览器不会访问 `embed.diagrams.net`，所以只要构建时能联网，应用就能在离线网络或内网里使用。

## Docker Compose 设置

1. 克隆仓库并在 `.env` 文件中定义 API 密钥。
2. 运行 `docker compose up -d`（使用仓库里的 `docker-compose.yml`）。
3. 打开 `http://localhost:3000`。

不需要单独的 draw.io 容器。

## 构建机器不能联网时

构建会从 [draw.io 发布页](https://github.com/jgraph/drawio/releases) 下载 `draw.war`（约 50 MB）。如果构建机器访问不了 GitHub：

- 在另一台机器上下载 `scripts/fetch-drawio.mjs` 里写明的那个版本的 `draw.war`，解压到 `public/drawio`（删掉 `WEB-INF` 和 `META-INF`），再把版本号（例如 `v32.0.2`）写进 `public/drawio/.version`。构建时就会使用这份副本。
- 或者在能联网的机器上构建镜像，再拷到离线网络里。

## 来自其他网站的图片

自带的 draw.io 只有静态文件，没有 draw.io 的图片代理（`/drawio/proxy`）。用网址插入的其他网站的图片能在画布上显示，但导出的 PNG、SVG 和版本缩略图里不会有它，因为 draw.io 要通过这个代理去取这类图片。这类图片请改用文件插入，draw.io 会把它保存在图里。

## 使用单独的 draw.io 服务器（可选）

仍然可以用构建时变量 `NEXT_PUBLIC_DRAWIO_BASE_URL` 让应用使用别处的 draw.io，比如 `jgraph/drawio` 镜像：

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

使用外部 draw.io 时，应用改用 draw.io 自己的工具栏，以下功能不可用：标出 AI 改了哪些图形、针对选中的图形提问、应用自己的画布工具栏、用 Ctrl+Z 撤回 AI 的修改。浏览器不允许页面控制来自其他域名的编辑器。

**`NEXT_PUBLIC_DRAWIO_BASE_URL` 必须是用户浏览器可访问的地址。**

| 场景 | URL 值 |
|----------|-----------|
| 本地主机 (Localhost) | `http://localhost:8080` |
| 远程/服务器 | `http://YOUR_SERVER_IP:8080` |

**切勿使用** Docker 内部别名（如 `http://drawio:8080`），因为浏览器无法解析它们。
