# 常见问题解答

这一页列出了使用 Next AI Draw.io 时常遇到的问题。每个问题都说明您会看到什么、为什么会这样，以及该怎么做。

## 导出 PDF 后没有反应

在网页版里导出 PDF 时，页面会跳转到 `convert.diagrams.net/node/export`，然后就没有反应了。

应用里嵌入的 draw.io 编辑器自己不能直接导出 PDF。它要用外部的转换服务，而这个服务在 iframe（嵌入在其他页面里的页面）中无法正常工作。

请先把图表导出为 PNG 图片，再把图片打印成 PDF。

相关的 GitHub Issue：#539、#125

## 在离线或内网环境里，浏览器访问不了 embed.diagrams.net

在内网环境里，浏览器提示“找不到 embed.diagrams.net 的服务器 IP 地址”。

应用现在自带一份 draw.io，从 `/drawio` 提供，所以浏览器不再需要访问 `embed.diagrams.net`。如果仍然看到这个错误，说明镜像是用 `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` 构建的，这是旧版 Dockerfile 的默认值。请去掉这个构建参数，重新构建镜像。详见[在离线环境或内网中运行](./offline-deployment.md)。

`NEXT_PUBLIC_*` 环境变量是**构建时**变量，会被打包进 JS 代码。**在运行时设置它们不会生效。**

如果仍想使用单独的 draw.io 服务器，请在构建时通过 `args` 传入它的地址：

```yaml
# docker-compose.yml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://你的服务器IP:8080/
    ports: ["3000:3000"]
    env_file: .env
```

如果您在内网，请在外网修改 Dockerfile 并构建镜像，再把镜像传到内网使用。

相关的 GitHub Issue：#295、#317

## 自建模型只思考，不画图

本地部署的模型（例如 Qwen、LiteLLM）只输出思考过程，不生成图表。

可能的原因有两个：

- **模型太小。** 小模型很难正确遵循工具调用的指令。请使用 32B 或更多参数的模型。
- **没有开启工具调用。** 模型要通过工具调用来画图，所以运行模型的服务需要配置工具调用功能。

请在运行模型的服务里开启工具调用。以 vLLM 为例：

```bash
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3-32B \
    --enable-auto-tool-choice \
    --tool-call-parser hermes
```

相关的 GitHub Issue：#269、#75

## 上传图片后提示“未提供图片”

上传图片后，您会看到“未提供图片”的错误。

一个可能的原因是模型不支持视觉功能，也就是不能读取图片，例如 Kimi K2、DeepSeek 和 Qwen 的文本模型。

解决方法：

- 使用能读取图片的模型，例如 GPT-5.2、Claude 4.5 Sonnet 或 Gemini 3 Pro。
- 模型名里带 `vision` 或 `vl` 的模型能读取图片。
- 更新到最新版本（v0.4.9 或更高版本）。

相关的 GitHub Issue：#324、#421、#469
