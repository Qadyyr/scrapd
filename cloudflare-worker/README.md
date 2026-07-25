# Scribd Proxy — Cloudflare Worker

This worker fetches Scribd pages from Cloudflare's own network, bypassing
Cloudflare bot protection. It's the **permanent free solution** for deploying
the Scribd Downloader on Vercel.

**Free plan:** 100,000 requests/day — more than enough for personal use.

## Quick Deploy (2 minutes)

### Option A: One-command deploy (recommended)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up
2. Run this in the `cloudflare-worker/` directory:
   ```bash
   npx wrangler login
   npx wrangler deploy
   ```
3. Copy the worker URL (looks like `https://scribd-proxy.YOUR-SUBDOMAIN.workers.dev`)
4. Add it to your Vercel project:
   - Go to Vercel → Settings → Environment Variables
   - Name: `CF_WORKER_URL`
   - Value: `https://scribd-proxy.YOUR-SUBDOMAIN.workers.dev`
5. Redeploy your Vercel project

### Option B: Manual deploy via dashboard

1. Go to https://dash.cloudflare.com → Workers & Pages → Create
2. Create a new Worker named `scribd-proxy`
3. Copy the contents of `worker.js` into the editor
4. Save and Deploy
5. Copy the worker URL and set it as `CF_WORKER_URL` in Vercel

## How It Works

- Cloudflare Workers run on Cloudflare's own global edge network
- When the worker calls `fetch('https://www.scribd.com/...')`, the request
  comes from Cloudflare's IPs — which Cloudflare's bot protection doesn't block
- The worker returns the raw HTML to the Vercel app
- The app parses the HTML to extract document metadata + JSONP page URLs
- JSONP files are fetched directly from `html.scribdassets.com` (no Cloudflare)

## Cost

- **Cloudflare Workers Free Plan:** 100,000 requests/day, no credit card needed
- **Vercel Hobby:** Free
- **Total cost:** $0/month

## Files

- `worker.js` — the Cloudflare Worker code
- `wrangler.toml` — Wrangler configuration for deployment
