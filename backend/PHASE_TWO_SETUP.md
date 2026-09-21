# Orbit API phase two setup

The Worker exposes phase-two contracts but keeps them disabled until storage and provider credentials are configured. Never commit secret values.

## KV storage

1. Create a production KV namespace:

```sh
npx wrangler kv namespace create ORBIT_DATA
```

2. Add the returned namespace ID to `backend/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ORBIT_DATA"
id = "<production-kv-namespace-id>"
```

3. Deploy the Worker from `backend/`.

KV stores project records, crawl snapshots, 30-day share tokens, OAuth state and encrypted Google tokens.

## Google OAuth

Register this callback in Google Cloud Console:

```text
https://orbit-seo-api.newtazn.workers.dev/api/integrations/google/callback
```

Configure these Worker secrets:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI
npx wrangler secret put GOOGLE_TOKEN_ENCRYPTION_KEY
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` is used to encrypt access and refresh tokens before they are written to KV.

## Rank and backlink providers

Each provider must accept a JSON `POST` and return its real response. Configure server-side values:

```sh
npx wrangler secret put RANK_PROVIDER_URL
npx wrangler secret put RANK_PROVIDER_TOKEN
npx wrangler secret put BACKLINK_PROVIDER_URL
npx wrangler secret put BACKLINK_PROVIDER_TOKEN
```

The client receives the provider name, fetch timestamp and raw provider response. It does not invent search volume, rank or backlink counts.

## Scheduling

`POST /api/schedules` forwards a schedule request to `ORBIT_SCHEDULER_URL`. Configure that webhook and its optional token only when a trusted scheduler is available:

```sh
npx wrangler secret put ORBIT_SCHEDULER_URL
npx wrangler secret put ORBIT_SCHEDULER_TOKEN
```

Without the webhook, the API returns `scheduler_not_configured` and the dashboard keeps the schedule disabled.
