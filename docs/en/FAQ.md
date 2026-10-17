# Frequently asked questions

This page covers problems people often run into with Next AI Draw.io. For each one, it says what you see, why it happens and what to do.

## Exporting a PDF does nothing

The app's Export dialog saves a draw.io file, a PNG image, an SVG image or an editable SVG. A PDF comes from draw.io's own menu (☰ at the top left of the canvas): choose **Export as**, then **PDF**. What you see next depends on which draw.io the app uses.

**The draw.io that comes with the app.** The web app, the Docker image and the desktop app use it, unless the app was built with `NEXT_PUBLIC_DRAWIO_BASE_URL`. This copy of draw.io makes a PDF by printing. It opens its PDF dialog, and **Print** in that dialog opens the print dialog of your browser or system. There, choose to save as a PDF, for example **Save as PDF** in Chrome or **Microsoft Print to PDF** on Windows.

**An external draw.io**, set with `NEXT_PUBLIC_DRAWIO_BASE_URL`, such as `https://embed.diagrams.net`. The page goes to `convert.diagrams.net/node/export`, and then nothing happens. This draw.io sends the diagram to its conversion service at `convert.diagrams.net` to make the PDF, and that download fails inside the app. Choose **Print** in draw.io's menu instead, then save as a PDF in the print dialog. You can also rebuild the app without `NEXT_PUBLIC_DRAWIO_BASE_URL`, so it uses the draw.io that comes with it.

Related GitHub issues: #539, #125

## The browser cannot reach embed.diagrams.net on an offline or intranet network

On an intranet, the browser says "Cannot find server IP address for embed.diagrams.net".

The app ships with its own copy of draw.io and serves it from `/drawio`, so the browser does not need `embed.diagrams.net`. The current Dockerfile leaves `NEXT_PUBLIC_DRAWIO_BASE_URL` empty, so every image built from it uses this copy, the published image too. Only an image built with `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` loads draw.io from `embed.diagrams.net`. That value was the default in the Dockerfile before v0.5.0.

If you see this error, use an image of v0.5.0 or later, or rebuild your image without that build argument. You do not need to change the Dockerfile. The build downloads draw.io, so for an intranet, build the image on a machine with internet access and transfer it to the intranet. See [Build without internet access](./offline-deployment.md#build-without-internet-access).

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

## The model cannot read an image you upload

After you send an image, you see one of these:

- The chat shows "This model doesn't support image input.", with the provider's error below it.
- The model answers as if there were no image, for example by saying that no image was provided.

The model you chose has no vision support, that is, it cannot read images. Examples are Kimi K2, DeepSeek and the Qwen text models. The app sends the image to whichever model you chose, and the provider decides whether that model can take it. When the provider rejects the image, the app shows the message above. Some providers silently drop the image, and the model then answers without it.

What to do:

- In model settings, choose a model that can read images, such as GPT-5.2, Claude Sonnet 4.5 or Gemini 3 Pro.
- For any other model, check the provider's page for that model to see whether it takes image input. Models with `vision` or `vl` in their name usually do.
- If an image is refused for a model that reads images, update to v0.5.0 or later. Older versions guessed from the model name whether a model reads images, and the guess was sometimes wrong.

Related GitHub issues: #324, #421, #469, #874
