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

Saved settings are written to `data/settings.json` and apply right away, with no restart. A few settings, such as the Langfuse and DynamoDB ones, are marked "Needs restart": they apply after you restart the server.

`NEXT_PUBLIC_*` variables are fixed when the app is built, so you cannot change them in the panel.

## Which value is used

A setting can have a value in more than one place. The app uses the first one it finds in this order:

1. A value saved in the panel
2. The environment variable
3. The built-in default

If you remove a value saved in the panel, the environment variable is used again.

## Where your settings are saved

- Secrets, such as API keys, are stored as plain text in `data/settings.json`. The file has mode 600, so only its owner can read and write it. Keep the file private.
- With Docker, the volume in `docker-compose.yml` keeps the `data/` folder outside the container, so your saved settings stay when the container is replaced.
- Serverless platforms, such as Vercel and Cloudflare Workers, have no disk that keeps files, so the panel is read-only there. On those platforms, set everything with environment variables.
