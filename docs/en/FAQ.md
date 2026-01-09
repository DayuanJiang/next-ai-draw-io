# Frequently Asked Questions (FAQ)

---

## 1. Cannot Export PDF

**Problem**: Web version redirects to `convert.diagrams.net/node/export` when exporting PDF, then nothing happens

**Cause**: Embedded Draw.io doesn't support direct PDF export, it relies on external conversion service which doesn't work in iframe

**Solution**: Export as image (PNG) first, then print to PDF

**Related Issues**: #539, #125

---

## 2. Cannot Access embed.diagrams.net (Offline/Intranet Deployment)

**Problem**: Intranet environment shows "Cannot find server IP address for embed.diagrams.net"

**Key Point**: `NEXT_PUBLIC_*` environment variables are **build-time** variables, they get bundled into JS code. **Runtime settings don't work!**

**Solution**: Must pass via `args` at build time:

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
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://your-server-ip:8080/
    ports: ["3000:3000"]
    env_file: .env
```

**Intranet Users**: Modify Dockerfile and build image on external network, then transfer to intranet

**Related Issues**: #295, #317

---

## 3. Self-hosted Model Only Thinks But Doesn't Draw

**Problem**: Locally deployed models (e.g., Qwen, LiteLLM) only output thinking process, don't generate diagrams

**Possible Causes**:
1. **Model too small** - Small models struggle to follow tool calling instructions correctly, recommend 32B+ parameter models
2. **Tool calling not enabled** - Model service needs tool use configuration

**Solution**: Enable tool calling, e.g., vLLM:
```bash
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3-32B \
    --enable-auto-tool-choice \
    --tool-call-parser hermes
```

**Related Issues**: #269, #75

---

## 4. "No Image Provided" After Uploading Image

**Problem**: After uploading an image, the system shows "No image provided" error

**Possible Causes**:
1. Model doesn't support vision (e.g., Kimi K2, DeepSeek, Qwen text models)

**Solution**:
- Use vision-capable models: GPT-5.2, Claude 4.5 Sonnet, Gemini 3 Pro
- Models with `vision` or `vl` in name support images
- Update to latest version (v0.4.9+)

**Related Issues**: #324, #421, #469
