# Frequently asked questions

This page covers problems people often run into with Next AI Draw.io. For each one, it says what you see, why it happens and what to do.

## Exporting a PDF does nothing

In the web version, when you export a PDF, the page goes to `convert.diagrams.net/node/export` and then nothing happens.

The draw.io editor embedded in the app cannot export a PDF by itself. It relies on an outside conversion service, and that service does not work inside an iframe (a page embedded in another page).

Export the diagram as a PNG image first, then print the image to a PDF.

Related GitHub issues: #539, #125

## The browser cannot reach embed.diagrams.net on an offline or intranet network

On an intranet, the browser says "Cannot find server IP address for embed.diagrams.net".

The app now ships with its own copy of draw.io and serves it from `/drawio`, so the browser no longer needs `embed.diagrams.net`. If you still see this error, the image was built with `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net`, which was the default in the old Dockerfile. Rebuild the image without that build argument. See [Run it offline or on an intranet](./offline-deployment.md).

Environment variables named `NEXT_PUBLIC_*` are **build-time** variables: they are bundled into the JavaScript code. **Setting them at runtime does not work.**

To keep using a separate draw.io server, pass its address with `args` at build time:

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

If you are on an intranet, modify the Dockerfile and build the image on an outside network, then transfer the image to the intranet.

Related GitHub issues: #295, #317

## A self-hosted model only thinks and never draws

A model you deploy locally, such as Qwen or LiteLLM, shows only its thinking and generates no diagram.

There are two possible causes:

- **The model is too small.** Small models have trouble following tool call instructions correctly. Use a model with 32B parameters or more.
- **Tool calls are not turned on.** The model draws through tool calls, so the service that runs the model has to be set up for tool use.

Turn on tool calls in the service that runs the model. For example, with vLLM:

```bash
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen3-32B \
    --enable-auto-tool-choice \
    --tool-call-parser hermes
```

Related GitHub issues: #269, #75

## Uploading an image gives a "No image provided" error

After you upload an image, you see the error "No image provided".

One possible cause is a model without vision support, that is, a model that cannot read images. Examples are Kimi K2, DeepSeek and the Qwen text models.

What to do:

- Use a model that can read images, such as GPT-5.2, Claude 4.5 Sonnet or Gemini 3 Pro.
- Models with `vision` or `vl` in their name can read images.
- Update to the latest version (v0.4.9 or later).

Related GitHub issues: #324, #421, #469
