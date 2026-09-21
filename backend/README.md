# Orbit SEO API

This Cloudflare Worker provides the server-side boundary required by the GitHub Pages client:

- `GET /health`
- `GET /api/fetch?url=https%3A%2F%2Fexample.com`
- `GET /api/pagespeed?url=...&strategy=mobile`

The fetch endpoint validates public HTTP(S) URLs, follows redirects, applies a 4 MB response cap,
times out after 30 seconds, and returns CORS headers. The PageSpeed endpoint proxies the official
Google API and accepts an optional `PAGESPEED_API_KEY` Worker secret.

## Deploy

1. Install Wrangler and log in to Cloudflare.
2. Run `wrangler deploy --config backend/wrangler.toml` from the repository root.
3. In Orbit SEO settings, enter the Worker URL, for example `https://orbit-seo-api.<account>.workers.dev`.

The GitHub Pages app cannot execute this Worker by itself. A GitHub Actions deployment is included
in `.github/workflows/cloudflare.yml` and runs when the repository has `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.
