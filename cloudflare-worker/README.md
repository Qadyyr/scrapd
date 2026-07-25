# Scribd Proxy — Cloudflare Worker + Browserless

Fetches Scribd pages using a **real headless browser** (via Browserless.io)
that solves Cloudflare's managed challenge automatically.

**Total cost: $0/month** — Cloudflare Workers (100k req/day) + Browserless (300 free requests/month)

## Quick Setup (5 minutes)

### Step 1: Deploy the Worker (if not already done)

1. Create a free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Go to **Workers & Pages** → **Create** → **Create Worker**
3. Name it `scribd-proxy`, click **Deploy**
4. Click **Edit code**, delete everything, paste the contents of `worker.js`
5. Click **Save and Deploy**
6. Copy the worker URL (e.g., `https://scribd-proxy.yourname.workers.dev`)

### Step 2: Get a free Browserless API key

1. Sign up at **https://www.browserless.io** (free, no credit card)
2. Go to Dashboard → copy your **API key**

### Step 3: Add the API key to your Worker

1. Cloudflare Dashboard → **Workers & Pages** → `scribd-proxy` → **Settings**
2. Scroll to **Variables and Secrets** → click **Add**
3. Type: **Secret**
4. Name: `BROWSERLESS_API_KEY`
5. Value: *(paste your Browserless API key)*
6. Click **Save and Deploy**

### Step 4: Add the Worker URL to Vercel

1. Vercel → your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `CF_WORKER_URL`
   - **Value:** `https://scribd-proxy.yourname.workers.dev`
3. Click **Save**
4. **Deployments** → **Redeploy**

## How It Works

```
Vercel app → Cloudflare Worker → Browserless.io (real Chrome browser)
                                        ↓
                              Loads Scribd page in Chrome
                                        ↓
                              Cloudflare challenge auto-solves (JS runs)
                                        ↓
                              Returns full page HTML with JSONP URLs
                                        ↓
Vercel app ← Worker ← Browserless ← Full Scribd HTML
                                        ↓
                    Vercel fetches JSONP from CDN (no Cloudflare)
                                        ↓
                    Generates PDF from page images
```

1. **Worker** tries direct fetch first (free, no Browserless credits used)
2. If Cloudflare challenges → **Worker** calls **Browserless** (real Chrome)
3. **Browserless** loads the page, Chrome runs Cloudflare's challenge JS
4. After 8 seconds, returns the real page HTML (with `docManager.addPage()` calls)
5. Vercel parses the HTML, extracts JSONP URLs, fetches page images from CDN
6. Generates the real PDF

## Why This Works

Cloudflare's managed challenge requires **JavaScript execution** — it runs a
challenge script that sets a cookie, then reloads the page. Standard HTTP
fetches (Worker's `fetch()`) can't execute JavaScript. But a real browser
(Browserless/Puppeteer) can — it loads the page, Chrome runs the challenge
script automatically, the cookie is set, and the real content loads.

## Free Tier Limits

| Service | Free Limit |
|---------|-----------|
| Cloudflare Workers | 100,000 requests/day |
| Browserless.io | 300 requests/month |

> 300 requests/month is plenty for personal use. The direct fetch (Strategy 1)
> is always free and doesn't use Browserless credits — it only falls back to
> Browserless when Cloudflare challenges.

## Files

- `worker.js` — Cloudflare Worker code
- `wrangler.toml` — Wrangler config
