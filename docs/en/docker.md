# Run with Docker

If you only want to run Next AI Draw.io on your own computer, Docker is the best way. This page shows how to start the app in a container, give it your AI provider settings, and offer several models from the server.

## Start the app

If Docker is not installed yet, install it first: [Get Docker](https://docs.docker.com/get-docker/).

Then run:

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The `-e` options set the AI provider, the model and the API key. Replace them with the settings of the AI provider you want to use. See [AI providers](./ai-providers.md) for the options.

## Use an env file

You can also keep the settings in an env file. Copy `env.example` to `.env`, edit `.env` with your settings, and start the container with `--env-file`:

```bash
cp env.example .env
# Edit .env with your configuration
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

## Offer several models from the server

You can mount an `ai-models.json` file into the container. With it, the server provides several models, and user API keys are not exposed. Mount the file at `/app/ai-models.json`:

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -v $(pwd)/ai-models.json:/app/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

To keep the file at a different path inside the container, set `AI_MODELS_CONFIG_PATH` to that path:

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_api_key \
  -e AI_MODELS_CONFIG_PATH=/config/ai-models.json \
  -v $(pwd)/ai-models.json:/config/ai-models.json:ro \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

## If embed.diagrams.net is blocked

See [Run it offline or on an intranet](./offline-deployment.md) for the configuration options.
