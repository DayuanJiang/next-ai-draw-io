# 常见问题解答

这一页列出了使用 Next AI Draw.io 时常遇到的问题。每个问题都说明您会看到什么、为什么会这样，以及该怎么做。

## 导出 PDF 后没有反应

应用自己的“导出”对话框可以保存 draw.io 文件、PNG 图片、SVG 图片或可编辑的 SVG。PDF 要从 draw.io 自己的菜单导出：点击画布左上角的 ☰，选择 **导出为**，再选择 **PDF**。接下来您会看到什么，取决于应用用的是哪一个 draw.io。

**应用自带的 draw.io。** 网页版、Docker 镜像和桌面应用都用它，除非构建应用时设置了 `NEXT_PUBLIC_DRAWIO_BASE_URL`。这份 draw.io 通过打印来生成 PDF。它会打开 PDF 对话框，点击其中的 **打印**，会打开浏览器或系统的打印对话框。请在打印对话框里选择保存为 PDF，例如 Chrome 的 **另存为 PDF**，或 Windows 的 **Microsoft Print to PDF**。

**外部的 draw.io**，也就是用 `NEXT_PUBLIC_DRAWIO_BASE_URL` 设置的 draw.io，例如 `https://embed.diagrams.net`。页面会跳转到 `convert.diagrams.net/node/export`，然后就没有反应了。这种 draw.io 会把图表发给 `convert.diagrams.net` 上的转换服务来生成 PDF，而在应用里，这个下载会失败。请改用 draw.io 菜单里的 **打印**，然后在打印对话框里保存为 PDF。您也可以去掉 `NEXT_PUBLIC_DRAWIO_BASE_URL` 重新构建应用，让它使用自带的 draw.io。

相关的 GitHub Issue：#539、#125

## 在离线或内网环境里，浏览器访问不了 embed.diagrams.net

在内网环境里，浏览器提示“找不到 embed.diagrams.net 的服务器 IP 地址”。

应用自带一份 draw.io，从 `/drawio` 提供，所以浏览器不需要访问 `embed.diagrams.net`。现在的 Dockerfile 把 `NEXT_PUBLIC_DRAWIO_BASE_URL` 留空，所以用它构建的镜像都使用这份 draw.io，官方发布的镜像也一样。只有用 `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` 构建的镜像，才会从 `embed.diagrams.net` 加载 draw.io。v0.5.0 之前的 Dockerfile 默认使用这个值。

如果您看到这个错误，请使用 v0.5.0 或更高版本的镜像，或者去掉这个构建参数，重新构建您的镜像。Dockerfile 不需要修改。构建时要下载 draw.io，所以如果要在内网使用，请在能联网的机器上构建镜像，再把镜像传到内网。详见[在不能联网的机器上构建](./offline-deployment.md#在不能联网的机器上构建)。

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

## 模型读不了您上传的图片

发送图片后，您会看到下面其中一种情况：

- 对话里显示“这个模型不支持图片输入。”，下面是服务商返回的错误。
- 模型的回答像是没有收到图片，例如说没有提供图片。

您选的模型不支持视觉功能，也就是不能读取图片，例如 Kimi K2、DeepSeek 和 Qwen 的文本模型。应用会把图片发给您选的模型，由服务商判断这个模型能不能接收图片。服务商拒绝图片时，应用会显示上面的提示。有些服务商会悄悄丢掉图片，模型就会在没有图片的情况下回答。

解决方法：

- 在模型设置里选择能读取图片的模型，例如 GPT-5.2、Claude Sonnet 4.5 或 Gemini 3 Pro。
- 其他模型请查看服务商的模型页面，确认它是否支持图片输入。模型名里带 `vision` 或 `vl` 的模型通常支持。
- 如果您选的模型能读取图片，图片却仍被拒绝，请更新到 v0.5.0 或更高版本。旧版本会根据模型名猜测模型能否读取图片，有时会猜错。

相关的 GitHub Issue：#324、#421、#469、#874
