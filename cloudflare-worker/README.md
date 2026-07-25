# Scribd Proxy — Cloudflare Worker

Fetches Scribd pages from Cloudflare's network. Uses a **free scraping API**
to bypass Cloudflare's managed challenge (which requires JavaScript execution).

**Total cost: $0/month** — Cloudflare Workers (100k req/day) + ZenRows (1000 free requests)

## Quick Setup (5 minutes)

### Step 1: Deploy the Worker

1. Create a free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Go to **Workers & Pages** → **Create** → **Create Worker**
3. Name it `scribd-proxy`, click **Deploy**
4. Click **Edit code**, delete everything, paste the contents of `worker.js`
5. Click **Save and Deploy**
6. Copy the worker URL (e.g., `https://scribd-proxy.yourname.workers.dev`)

### Step 2: Get a free scraping API key

Scribd uses Cloudflare's managed challenge, which requires a real browser to
solve. The Worker can't run a browser, so it uses a free scraping API as a
fallback.

**Recommended: ZenRows** (1000 free requests, no credit card)
1. Sign up: https://www.zenrows.com
2. Go to Dashboard → copy your API key
3. Set it as a Worker secret:
   ```bash
   npx wrangler login
   npx wrangler secret put ZENROWS_API_KEY
   # Paste your API key when prompted
   ```

**Alternative: ScrapingBee** (1000 free credits)
1. Sign up: https://scrapingbee.com
2. Go to Dashboard → copy your API key
3. Set it as a Worker secret:
   ```bash
   npx wrangler secret put SCRAPINGBEE_API_KEY
   # Paste your API key when prompted
   ```

> **Note:** You can set the secret via the Cloudflare Dashboard too:
> Workers & Pages → scribd-proxy → Settings → Variables and Secrets → Add

### Step 3: Add the Worker URL to Vercel

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `CF_WORKER_URL`
   - **Value:** `https://scribd-proxy.yourname.workers.dev`
   - **Environments:** Production, Preview, Development
3. Click **Save**
4. Go to **Deployments** → **Redeploy**

### Step 4: Test

Visit your Vercel app, paste a Scribd URL, and click **Fetch Document**.
You should see real document data (not demo mode).

## How It Works

```
User → Vercel app → Cloudflare Worker → ZenRows (real browser) → Scribd
                                                       ↓
                                     Solves Cloudflare challenge
                                                       ↓
                                     Returns page HTML with JSONP URLs
                                                       ↓
Vercel app ← Worker ← ZenRows ← Scribd page HTML
                                                       ↓
                    Vercel fetches JSONP from CDN (no Cloudflare)
                                                       ↓
                    Generates PDF from page images / text
```

1. **Worker** tries direct fetch first (free, no API credit used)
2. If Cloudflare challenges → **Worker** calls **ZenRows** (real browser)
3. **ZenRows** loads the Scribd page in Chrome, solving the challenge
4. Page HTML (with JSONP URLs) is returned to the Vercel app
5. Vercel fetches per-page JSONP from `html.scribdassets.com` (no Cloudflare)
6. Generates PDF from page images (scanned) or text (text docs)

## Free Tier Limits

| Service | Free Limit | Resets |
|---------|-----------|--------|
| Cloudflare Workers | 100,000 requests/day | Daily |
| ZenRows | 1,000 requests | One-time |
| ScrapingBee | 1,000 credits | One-time |

> The direct fetch (Strategy 1) is always free — it only uses the scraping API
> when Cloudflare challenges. For most requests, you won't consume scraping
> credits.
>
> When you run out of free scraping credits, sign up for a new account or
> upgrade. The direct fetch still works without any API key.

## Files

- `worker.js` — Cloudflare Worker code
- `wrangler.toml` — Wrangler config
