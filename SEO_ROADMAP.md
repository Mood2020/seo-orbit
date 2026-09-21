# Orbit SEO roadmap

## Capability map

The reference products consistently expose these capability groups:

- Technical crawl: crawl history, status distribution, crawl depth, internal-link graph, orphan pages, broken links, redirects, duplicate title/description/H1, image checks, robots and sitemap.
- Site and competitor keywords: ranked keywords for a domain, average position, competitor comparison and keyword gap.
- Keyword research: related and long-tail terms, search volume, monthly trend, intent and competitor pages.
- Rank tracking: selected keywords, daily history, device/location filters, competitor positions and shareable reports.
- Links: backlink discovery for a site and competitors, referring domains and reportable link sources.
- Reporting: scheduled or shareable reports with evidence, charts and export.
- Google data: Search Console and GA4 are separate authenticated data sources, not substitutes for a public crawl.

## Current honest scope

The static Pages client now provides a real bounded crawl, HTML audit, link probe contract, redirect/image/Schema findings, content extraction, deterministic scoring, browser-local history, HTML/CSV/JSON exports and local-on-next-crawl alerts. Phase two adds server contracts for KV-backed snapshots, share tokens, Google OAuth/query boundaries, rank/backlink providers and scheduler webhooks; those integrations remain disabled until their bindings and secrets are configured.

## Target architecture

1. Keep GitHub Pages as the public client and APK shell.
2. Add a small API service for authenticated jobs, crawl queues, snapshots and report links.
3. Keep provider credentials server-side. The client receives normalized records, source, timestamp and coverage instead of invented values.
4. Store raw provider responses separately from normalized tables so every score can be traced back to evidence.
5. Make each module source-aware: `crawl`, `pagespeed`, `gsc`, `ga4`, `serp`, `keyword-provider`, or `backlink-provider`.

## Delivery order

1. Finish the browser crawl graph and issue evidence in the static client.
2. Add API configuration and a normalized report contract without changing the current UI contract.
3. Add persisted projects and crawl snapshots.
4. Add Search Console and GA4 OAuth.
5. Add a paid or user-supplied SERP/keyword provider for rank and keyword data.
6. Add backlink provider integration and shareable/scheduled reports.

## Phase two API contract

- `GET /api/integrations/status` reports configured sources without exposing secrets.
- `GET /api/integrations/google/start?service=gsc|ga4` starts OAuth when Google secrets, KV, redirect URI and token encryption are configured.
- `GET /api/integrations/google/callback` exchanges the OAuth code and stores an encrypted token in KV.
- `POST /api/gsc/query` and `POST /api/ga4/query` proxy authenticated, source-labelled Google data.
- `POST /api/projects` and `POST /api/projects/:id/snapshots` persist normalized snapshot summaries plus the evidence report in KV.
- `POST /api/reports/share` creates a 30-day share token; `GET /api/reports/share/:token` reads it.
- `POST /api/providers/rank` and `POST /api/providers/backlinks` call server-side provider URLs only when their secrets exist.
- `POST /api/schedules` forwards to an explicitly configured scheduler webhook; the Worker does not pretend to run dynamic cron without one.
