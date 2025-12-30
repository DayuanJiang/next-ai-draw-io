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

Open [http://localhost:3000](http://localhost:3000) in your browser.

Replace the environment variables with your preferred AI provider configuration. See [AI Providers](./ai-providers.md) for available options.

> **Offline Deployment:** If `embed.diagrams.net` is blocked, see [Offline Deployment](./offline-deployment.md) for configuration options.
