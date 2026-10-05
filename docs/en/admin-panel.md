# Admin Panel

Instead of hand-editing `.env`, you can manage server settings in a web admin panel.

## Enabling the panel

1. Set the `ADMIN_PASSWORD` environment variable (leave unset to disable the panel).
2. Visit `/admin` and sign in.

## What you can configure

1. **Models** — add providers with their API keys and model lists, using the same UI as the in-app model settings. Saved models become server-side models available to all users, merged with any `AI_MODELS_CONFIG` / `ai-models.json` from your environment at request time (the panel does not modify those env files).
2. **Other sections** — access codes, generation parameters, features, observability, and quota. Saved settings are written to `data/settings.json` and apply immediately — no restart needed (a few settings such as Langfuse and DynamoDB are marked "Restart Required").

## Precedence

Settings saved in the panel override environment variables, which override built-in defaults. Removing a saved value falls back to the environment variable.

## Notes

- Secrets are stored in plaintext in `data/settings.json` (file mode 600). Keep the file private.
- On serverless platforms (Vercel, Cloudflare Workers) there is no persistent disk, so the panel is read-only — configure via environment variables there.
- With Docker, the `data/` directory is persisted via the volume in `docker-compose.yml`.
- `NEXT_PUBLIC_*` variables are baked in at build time and cannot be changed in the panel.
