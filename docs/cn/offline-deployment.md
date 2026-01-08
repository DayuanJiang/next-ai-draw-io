# 离线部署

通过自托管 draw.io 来替代 `embed.diagrams.net`，从而离线部署 Next AI Draw.io。

**注意：** `NEXT_PUBLIC_DRAWIO_BASE_URL` 是一个**构建时**变量。修改它需要重新构建 Docker 镜像。

## Docker Compose 设置

1. 克隆仓库并在 `.env` 文件中定义 API 密钥。
2. 创建 `docker-compose.yml`：

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

3. 运行 `docker compose up -d` 并打开 `http://localhost:3000`。

## 配置与重要警告

**`NEXT_PUBLIC_DRAWIO_BASE_URL` 必须是用户浏览器可访问的地址。**

| 场景 | URL 值 |
|----------|-----------|
| 本地主机 (Localhost) | `http://localhost:8080` |
| 远程/服务器 | `http://YOUR_SERVER_IP:8080` |

**切勿使用** Docker 内部别名（如 `http://drawio:8080`），因为浏览器无法解析它们。
