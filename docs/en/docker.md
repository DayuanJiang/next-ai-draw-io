# Run with Docker

If you only want to run Next AI Draw.io on your own computer, Docker is the best way. This page shows how to start the app in a container, give it your AI provider settings, offer several models from the server and keep the admin panel settings.

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

You can also keep the settings in an env file. Start from `env.example`, the template in the repository. If you cloned the repository, copy it to `.env`. Otherwise, download the file from GitHub:

```bash
# In a clone of the repository
cp env.example .env

# Without the repository
curl -o .env https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/env.example
```

Edit `.env` with your settings, and start the container with `--env-file`:

```bash
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

`docker run --env-file` uses everything after the `=` as the value, including a comment at the end of the line. Some lines in `env.example` end with such a comment:

```bash
# OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: Custom OpenAI-compatible endpoint
```

When you turn on a line like this by removing the `#` at its start, also delete the comment after the value:

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
```

The `env_file` of Docker Compose removes these comments by itself.

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

## Keep the admin panel settings

The [admin panel](./admin-panel.md) saves its settings in the `/app/data` folder inside the container. The `docker-compose.yml` in the repository mounts the `./data` folder there (`./data:/app/data`), so the settings stay when the container is replaced. With `docker run`, add the same mount:

```bash
docker run -d -p 3000:3000 --env-file .env \
  -v $(pwd)/data:/app/data \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

The app in the container runs as the user `nextjs` (user ID 1001), and this user must be able to write to the folder. On Linux, if `./data` does not exist, Docker creates it owned by root, and the admin panel becomes read only. Before you start the container, create the folder with the right owner. Run these commands where you run `docker run` or `docker compose up`:

```bash
mkdir -p data
sudo chown 1001:1001 data
```

## If embed.diagrams.net is blocked

The app does not need embed.diagrams.net. The image on ghcr.io is built without `NEXT_PUBLIC_DRAWIO_BASE_URL`, and so is an image built from the `docker-compose.yml` in the repository. So the app serves its own copy of draw.io from `/drawio`, and the browser never contacts embed.diagrams.net. Only an image built with the build argument `NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net` loads draw.io from there.

To run the app without internet access, see [Run it offline or on an intranet](./offline-deployment.md).
