# 常见问题解答 (FAQ)

---

## 1. 无法导出 PDF

**问题**: Web 版点击导出 PDF 后跳转到 `convert.diagrams.net/node/export` 然后无响应

**原因**: 嵌入式 Draw.io 不支持直接 PDF 导出，依赖外部转换服务，在 iframe 中无法正常工作

**解决方案**: 先导出为图片（PNG），再打印转成 PDF

**相关 Issue**: #539, #125

---

## 2. 无法访问 embed.diagrams.net（离线/内网部署）

**问题**: 内网环境提示"找不到 embed.diagrams.net 的服务器 IP 地址"

**关键点**: `NEXT_PUBLIC_*` 环境变量是**构建时**变量，会被打包到 JS 代码中，**运行时设置无效**！

**解决方案**: 必须在构建时通过 `args` 传入：

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

**内网用户**: 在外网修改 Dockerfile 并构建镜像，再传到内网使用

**相关 Issue**: #295, #317

---

## 3. 自建模型只思考不画图

**问题**: 本地部署的模型（如 Qwen、LiteLLM）只输出思考过程，不生成图表

**可能原因**:
1. **模型太小** - 小模型难以正确遵循 tool calling 指令，建议使用 32B+ 参数的模型
2. **未开启 tool calling** - 模型服务需要配置 tool use 功能

**解决方案**: 开启 tool calling，例如 vLLM：
```bash
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3-32B \
    --enable-auto-tool-choice \
    --tool-call-parser hermes
```

**相关 Issue**: #269, #75

---

## 4. 上传图片后提示"未提供图片"

**问题**: 上传图片后，系统显示"未提供图片"错误

**可能原因**:
1. 模型不支持视觉功能（如 Kimi K2、DeepSeek、Qwen 文本模型）

**解决方案**:
- 使用支持视觉的模型：GPT-5.2、Claude 4.5 Sonnet、Gemini 3 Pro
- 模型名带 `vision` 或 `vl` 的支持图片
- 更新到最新版本（v0.4.9+）

**相关 Issue**: #324, #421, #469
