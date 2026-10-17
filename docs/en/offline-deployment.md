# Run it offline or on an intranet

Next AI Draw.io can run on a network without internet access, such as a company intranet. This page shows how to build and run it there, and how to use a separate draw.io server if you want one.

## How the app works offline

Next AI Draw.io ships with its own copy of draw.io. `npm run build` downloads the draw.io release into `public/drawio` once, and the Docker build does the same. The app then serves this copy from `/drawio`.

While you use the app, the browser never contacts `embed.diagrams.net`. So the app works on an offline or intranet network, as long as the build had internet access.

## Run it with Docker Compose

1. Clone the repository and define your API keys in `.env`.
2. Run `docker compose up -d`. It uses the `docker-compose.yml` in the repository.
3. Open `http://localhost:3000`.

You do not need a separate draw.io container.

## Build without internet access

The build downloads `draw.war` (about 50 MB) from the [draw.io releases](https://github.com/jgraph/drawio/releases). If the build machine cannot reach GitHub, choose one of these:

- **Copy draw.io by hand.** On another machine, download `draw.war` for the version in `packages/mcp-server/src/drawio-version.json`. Unzip it into `public/drawio`, then delete the `WEB-INF` and `META-INF` folders in it. Write the version, for example `v32.0.2`, into `public/drawio/.version`. The build then uses this copy.
- **Build the image elsewhere.** Build the image on a machine with internet access, then transfer it to the offline network.

## Insert images from other websites

The bundled draw.io is a set of static files (files the server sends as they are). It has no image proxy (`/drawio/proxy`), the part of a draw.io server that fetches images from other sites for draw.io.

An image that you insert by its web address from another site still shows on the canvas. Exported PNG and SVG images and the version pictures leave it out, because draw.io fetches such images through that proxy.

Insert these images from a file instead. draw.io then stores them inside the diagram.

## Use a separate draw.io server

This is optional. You can still point the app at another draw.io, such as the `jgraph/drawio` image. Set `NEXT_PUBLIC_DRAWIO_BASE_URL` to its address. This variable is read when the app is built, so pass it as a build argument:

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080
    ports: ["3000:3000"]
    env_file: .env
    volumes:
      - ./data:/app/data
    depends_on: [drawio]
```

The `volumes` entry keeps the settings you save in the [admin panel](./admin-panel.md) (`data/settings.json`) outside the container, so they stay when the container is replaced.

With an external draw.io, the app uses draw.io's own toolbar, and these features are off:

- Outlining the shapes the AI changed
- Asking about the shapes you selected
- The app's canvas toolbar
- Undoing AI changes with Ctrl+Z

Browsers do not let a page control an editor served from a different origin (a different host name, port or protocol).

**`NEXT_PUBLIC_DRAWIO_BASE_URL` must be reachable from the user's browser.**

| Where draw.io runs | Value |
|---|---|
| On your own computer (localhost) | `http://localhost:8080` |
| On a remote server | `http://YOUR_SERVER_IP:8080` |

**Do not use** Docker's internal names, such as `http://drawio:8080`. These are the names containers use to reach each other, and the browser cannot find the server by them.
