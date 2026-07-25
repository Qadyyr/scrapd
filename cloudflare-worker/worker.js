/* eslint-disable */
/**
 * Scribd Proxy Worker for Cloudflare Workers
 *
 * Tries multiple strategies to fetch Scribd pages:
 * 1. Direct fetch (sends full browser headers — may work for some requests)
 * 2. Free scraping API fallback (uses real browser to solve Cloudflare challenges)
 *
 * Setup scraping API (pick one, both have free tiers):
 * - ZenRows: https://zenrows.com → 1000 free JS-rendered requests, no credit card
 *   Set secret: wrangler secret put ZENROWS_API_KEY
 * - ScrapingBee: https://scrapingbee.com → 1000 free credits
 *   Set secret: wrangler secret put SCRAPINGBEE_API_KEY
 */

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}

function isCloudflareChallenge(html) {
  if (!html) return true
  const lower = html.toLowerCase()
  return (
    lower.includes('cf-browser-verification') ||
    lower.includes('cf-challenge-running') ||
    lower.includes('client challenge') ||
    lower.includes('just a moment') ||
    lower.includes("a required part of this site couldn") ||
    (lower.includes('ray id') &&
      lower.includes('performance') &&
      lower.includes('security'))
  )
}

async function directFetch(url) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  })
  const text = await res.text()
  if (isCloudflareChallenge(text)) {
    throw new Error('Cloudflare challenge page received')
  }
  return text
}

async function fetchViaZenRows(url, apiKey) {
  const apiUrl =
    'https://api.zenrows.com/v1/?apikey=' +
    encodeURIComponent(apiKey) +
    '&url=' +
    encodeURIComponent(url) +
    '&js_render=true'
  const res = await fetch(apiUrl, {
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error('ZenRows HTTP ' + res.status + ': ' + body.slice(0, 200))
  }
  const text = await res.text()
  if (isCloudflareChallenge(text)) {
    throw new Error('ZenRows also received Cloudflare challenge')
  }
  return text
}

async function fetchViaScrapingBee(url, apiKey) {
  const apiUrl =
    'https://app.scrapingbee.com/api/v1/?api_key=' +
    encodeURIComponent(apiKey) +
    '&url=' +
    encodeURIComponent(url) +
    '&render_js=true'
  const res = await fetch(apiUrl, {
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      'ScrapingBee HTTP ' + res.status + ': ' + body.slice(0, 200)
    )
  }
  const text = await res.text()
  if (isCloudflareChallenge(text)) {
    throw new Error('ScrapingBee also received Cloudflare challenge')
  }
  return text
}

export default {
  async fetch(request, env) {
    // CORS preflight
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

    // Strategy 1: Direct fetch with full browser headers
    try {
      const html = await directFetch(targetUrl)
      if (html && html.length > 5000) {
        return new Response(html, { status: 200, headers: corsHeaders })
      }
    } catch (e) {
      errors.push('direct: ' + e.message)
    }

    // Strategy 2: ZenRows (free tier: 1000 JS-rendered requests, no card)
    if (env.ZENROWS_API_KEY) {
      try {
        const html = await fetchViaZenRows(targetUrl, env.ZENROWS_API_KEY)
        if (html && html.length > 5000) {
          return new Response(html, { status: 200, headers: corsHeaders })
        }
      } catch (e) {
        errors.push('zenrows: ' + e.message)
      }
    }

    // Strategy 3: ScrapingBee (free tier: 1000 credits)
    if (env.SCRAPINGBEE_API_KEY) {
      try {
        const html = await fetchViaScrapingBee(
          targetUrl,
          env.SCRAPINGBEE_API_KEY
        )
        if (html && html.length > 5000) {
          return new Response(html, { status: 200, headers: corsHeaders })
        }
      } catch (e) {
        errors.push('scrapingbee: ' + e.message)
      }
    }

    // All strategies failed
    const hasKey = env.ZENROWS_API_KEY || env.SCRAPINGBEE_API_KEY
    const msg = hasKey
      ? 'All fetch strategies failed (' +
        errors.join('; ') +
        '). Check your scraping API key and credits.'
      : 'Direct fetch got Cloudflare challenge. ' +
        'For permanent free fetching, sign up at https://zenrows.com (1000 free requests, no credit card) ' +
        'and set ZENROWS_API_KEY as a Worker secret: wrangler secret put ZENROWS_API_KEY'

    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
}
