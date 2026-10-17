# Admin panel

The admin panel lets you manage your server's settings on a web page, without editing `.env` by hand. This page shows how to turn it on, what you can change there and where your settings are saved.

## Turn on the panel

1. Set the `ADMIN_PASSWORD` environment variable. While it is not set, the panel is turned off.
2. Open `/admin` and sign in with that password.

## Offer models to all users

In the Models section, add providers with their API keys and model lists. The credential fields are the same as in the Models tab of the app's [Settings](./settings.md).

Saved models become server-side models that every user can use. At request time, they are merged with any `AI_MODELS_CONFIG` or `ai-models.json` from your environment. The panel does not change those environment files.

## Change the other settings

The other sections of the panel hold these settings:

| Section | What you set there |
|---|---|
| Replies | Generation parameters, which set how the AI replies |
| Access | Access codes |
| Optional Features | Feature switches |
| Call Logs | Records of model calls (observability) |
| Usage Limits | Quotas |

Saved settings are written to the settings file (`data/settings.json` by default) and apply right away, with no restart. A few settings, such as the Langfuse and DynamoDB ones, are marked "Needs restart": they apply after you restart the server.

The panel can change only the settings it shows, and it refuses to save any other variable. Set these in the environment:

- `NEXT_PUBLIC_*` variables, which are fixed when the app is built
- `ADMIN_PASSWORD`, which turns on the panel, and `SETTINGS_FILE`, which tells the app where the settings file is
- The reasoning and thinking settings of each provider, such as `OPENAI_REASONING_EFFORT` and `ANTHROPIC_THINKING_BUDGET_TOKENS`
- Other variables that the panel does not show, such as `DEBUG_LLM_PAYLOAD` and `CLIENT_IP_HEADER`

## Which value is used

A setting can have a value in more than one place. The app uses the first one it finds in this order:

1. A value saved in the panel
2. The environment variable
3. The built-in default

If you remove a value saved in the panel, the environment variable is used again.

## Where your settings are saved

By default, settings are saved in `data/settings.json`, in the folder the server runs from. To save them somewhere else, set the `SETTINGS_FILE` environment variable to the path of the file.

- Secrets, such as API keys, are stored as plain text in the settings file. The file has mode 600, so only its owner can read and write it. Keep the file private.
- The panel becomes read-only on any host where the app cannot create the folder of the settings file or cannot write to it. The panel then shows a notice at the top, and its fields and the "Save changes" button are turned off. The app checks the folder once and keeps the result until the server restarts.
- Serverless platforms, such as Vercel and Cloudflare Workers, have no disk that keeps files, so the panel is read-only there. On those platforms, set everything with environment variables.

## Keep the settings with Docker

The `docker-compose.yml` in the repository mounts the `./data` folder on the host at `/app/data` in the container (`./data:/app/data`), so your saved settings stay when the container is replaced. If you set `SETTINGS_FILE`, keep the file inside `/app/data`.

The app in the container runs as the user `nextjs` (uid 1001), and this user must be able to write to the folder. On Linux, if `./data` does not exist, Docker creates it owned by root. The app then cannot write to it, and the panel becomes read-only. Before you start the container, create the folder with the right owner in the folder that holds `docker-compose.yml`:

```bash
mkdir -p data
sudo chown 1001:1001 data
```

If the panel is already read-only for this reason, run the `chown` command and restart the container.
