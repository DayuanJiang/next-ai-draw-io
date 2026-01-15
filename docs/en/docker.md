# Run with Docker

If you just want to run it locally, the best way is to use Docker.

First, install Docker if you haven't already: [Get Docker](https://docs.docker.com/get-docker/)

Then run:

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

Or use an env file:

```bash
cp env.example .env
# Edit .env with your configuration
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

### Using server-side model configuration

You can mount an `ai-models.json` file into the container to provide multiple server-side models without exposing user API keys:

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -v $(pwd)/ai-models.json:/app/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

If you prefer to keep the config in a different path inside the container, set `AI_MODELS_CONFIG_PATH`:

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -e AI_MODELS_CONFIG_PATH=/config/ai-models.json \
  -v $(pwd)/ai-models.json:/config/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Replace the environment variables with your preferred AI provider configuration. See [AI Providers](./ai-providers.md) for available options.

> **Offline Deployment:** If `embed.diagrams.net` is blocked, see [Offline Deployment](./offline-deployment.md) for configuration options.
