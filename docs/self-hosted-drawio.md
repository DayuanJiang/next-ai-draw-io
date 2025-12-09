# Self-Hosted Draw.io Configuration

In some corporate environments, `embed.diagrams.net` is blocked by network policies. This guide explains how to use a self-hosted draw.io instance with Next AI Draw.io.

## Configuration

Set the `NEXT_PUBLIC_DRAWIO_BASE_URL` environment variable to point to your self-hosted draw.io instance. This is a **build-time** configuration, meaning you need to rebuild the Docker image to change the URL.

## Docker Build

```bash
# Build with custom draw.io URL
docker build --build-arg NEXT_PUBLIC_DRAWIO_BASE_URL=http://your-drawio-server:8080 -t next-ai-draw-io .

# Run the custom build
docker run -d -p 3000:3000 --env-file .env next-ai-draw-io
```

## Docker Compose

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports:
      - "8080:8080"

  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://drawio:8080
    ports:
      - "3000:3000"
    env_file:
      - .env
```

## Running Draw.io Locally

You can run the official draw.io Docker image:

```bash
docker run -d -p 8080:8080 jgraph/drawio:latest
```

Then build Next AI Draw.io with:

```bash
docker build --build-arg NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080 -t next-ai-draw-io .
```

## Notes

- The default draw.io URL is `https://embed.diagrams.net`
- Changes to `NEXT_PUBLIC_DRAWIO_BASE_URL` require rebuilding the Docker image
- For local development, you can set this in `.env.local`
