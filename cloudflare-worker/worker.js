/* eslint-disable */
/**
 * Scribd Proxy Worker for Cloudflare Workers
 *
 * Uses Browserless.io (free tier: 300 requests/month) to run a real headless
 * browser that solves Cloudflare's managed challenge. The browser loads the
 * Scribd page, waits for Cloudflare to clear, then returns the full HTML
 * with all the JSONP page URLs.
 *
 * Setup:
 * 1. Sign up at https://www.browserless.io (free, no credit card)
 * 2. Copy your API key from the dashboard
 * 3. Set it as a Worker secret:
 *    wrangler secret put BROWSERLESS_API_KEY
 *    (or via Cloudflare Dashboard → Worker → Settings → Variables)
 *
 * Cost: $0/month (free tier: 300 requests/month, sufficient for personal use)
 */

const BROWSERLESS_URL = 'wss://chrome.browserless.io' // free tier endpoint

function isCloudflareChallenge(html) {
  if (!html) return true
  const lower = html.toLowerCase()
  return (
    lower.includes('cf-browser-verification') ||
    lower.includes('cf-challenge-running') ||
    lower.includes('just a moment') ||
    lower.includes("a required part of this site couldn") ||
    (lower.includes('ray id') &&
      lower.includes('performance') &&
      lower.includes('security'))
  )
}

/**
 * Use Browserless.io to load a page with a real headless browser.
 * The browser executes Cloudflare's challenge JavaScript, so the challenge
 * is solved and we get the real page content.
 */
async function fetchViaBrowserless(targetUrl, apiKey) {
  // Browserless REST API: scrape a page with a real browser
  const apiUrl =
    'https://chrome.browserless.io/content?token=' +
    encodeURIComponent(apiKey)

  const body = JSON.stringify({
    url: targetUrl,
    waitFor: 8000, // wait 8s for Cloudflare challenge to resolve
    bestAttempt: true,
    setJavaScriptEnabled: true,
  })

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: body,
    signal: AbortSignal.timeout(45000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      'Browserless HTTP ' + res.status + ': ' + text.slice(0, 200)
    )
  }

  const html = await res.text()
  if (isCloudflareChallenge(html)) {
    throw new Error('Browserless also received Cloudflare challenge')
  }
  return html
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

async function directFetch(url) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  })
  const text = await res.text()
  if (isCloudflareChallenge(text)) {
    throw new Error('Cloudflare challenge page')
  }
  return text
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    const url = new URL(request.url)
    const targetUrl = url.searchParams.get('url')

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const corsHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-cache',
    }

    const errors = []

    // Strategy 1: Direct fetch (free, no API credits)
    try {
      const html = await directFetch(targetUrl)
      if (html && html.length > 5000 && !isCloudflareChallenge(html)) {
        return new Response(html, { status: 200, headers: corsHeaders })
      }
    } catch (e) {
      errors.push('direct: ' + e.message)
    }

    // Strategy 2: Browserless.io (real headless browser, solves Cloudflare)
    if (env.BROWSERLESS_API_KEY) {
      try {
        const html = await fetchViaBrowserless(
          targetUrl,
          env.BROWSERLESS_API_KEY
        )
        if (html && html.length > 5000) {
          return new Response(html, { status: 200, headers: corsHeaders })
        }
      } catch (e) {
        errors.push('browserless: ' + e.message)
      }
    }

    // All strategies failed
    const hasKey = env.BROWSERLESS_API_KEY
    const msg = hasKey
      ? 'All strategies failed (' +
        errors.join('; ') +
        '). Check your Browserless API key and credits.'
      : 'Direct fetch blocked by Cloudflare. ' +
        'Sign up at https://www.browserless.io (free, no credit card) ' +
        'and set BROWSERLESS_API_KEY as a Worker secret. ' +
        'Free tier: 300 requests/month.'

    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
}
