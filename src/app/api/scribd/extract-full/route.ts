import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// In-memory store for extracted data (keyed by random ID)
// Data expires after 10 minutes. This works on Vercel because the
// bookmarklet sends the HTML → gets back an ID → redirects to /?extract_id=ID
// → the page load fetches the stored data by ID. All within seconds.
const extractStore = new Map<string, { data: any; timestamp: number }>()
const STORE_TTL = 10 * 60 * 1000 // 10 minutes

// Clean up old entries periodically
function cleanStore() {
  const now = Date.now()
  for (const [key, value] of extractStore.entries()) {
    if (now - value.timestamp > STORE_TTL) {
      extractStore.delete(key)
    }
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * POST: Receive full HTML from bookmarklet, parse it, store result, return ID.
 * GET: Retrieve stored result by ID (called by the app after redirect).
 */
export async function POST(req: NextRequest) {
  try {
    cleanStore()

    const body = await req.json().catch(() => ({}))
    const { html, title, url: sourceUrl } = body as {
      html: string
      title: string
      url: string
    }

    if (!html || html.length < 1000) {
      return NextResponse.json(
        { error: 'No HTML content received.' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    // Extract docId from sourceUrl
    const docIdMatch = sourceUrl?.match(/scribd\.com\/(?:doc|document|read|embeds)\/(\d+)/i)
    const docId = docIdMatch ? docIdMatch[1] : 'unknown'

    // Find ALL JSONP URLs using multiple regex patterns
    const urls: string[] = []
    const seen = new Set<string>()

    const patterns = [
      /contentUrl:\s*["'](https:\/\/html\.scribdassets\.com\/[^"']+\.jsonp)["']/g,
      /contentUrl:["'\s]*(https:\/\/html\.scribdassets\.com\/[^"'\s)]+\.jsonp)/g,
      /(https:\/\/html\.scribdassets\.com\/[a-z0-9]+\/pages\/[0-9]+-[a-f0-9]+\.jsonp)/g,
      /["'](https:\/\/html\.scribdassets\.com\/[^"']+\.jsonp)["']/g,
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1] || match[0]
        if (!seen.has(url)) {
          seen.add(url)
          urls.push(url)
        }
      }
      if (urls.length > 0) break
    }

    if (urls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No page URLs found in the HTML',
          debug: {
            htmlLength: html.length,
            hasDocManager: html.includes('docManager'),
            hasAddPage: html.includes('addPage'),
            hasContentUrl: html.includes('contentUrl'),
            hasScribdassets: html.includes('scribdassets'),
            hasPages: html.includes('/pages/'),
            title: title || 'unknown',
          },
        },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    // Transform JSONP URLs → image URLs
    const pageImages = urls.map((jsonpUrl) => {
      return jsonpUrl
        .replace('/pages/', '/images/')
        .replace(/\.jsonp$/, '.jpg')
        .replace('html.scribdassets.com', 'html.scribd.com')
    })

    // Fetch text content from JSONP files (for 403 image pages — text fallback)
    const pageTexts: string[] = []
    try {
      const textResults = await Promise.allSettled(
        urls.slice(0, 50).map(async (jsonpUrl) => {
          const res = await fetch(jsonpUrl, {
            headers: { Referer: 'https://www.scribd.com/' },
            signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) return ''
          const raw = await res.text()
          const clean = raw.replace(/\\"/g, '"')
          const spans = clean.match(/<span class=a[^>]*>([^<]*)<\/span>/g) || []
          const texts = spans
            .map((s) => s.replace(/<[^>]+>/g, '').replace(/\xa0/g, ' ').trim())
            .filter((t) => t.length > 0)
          return texts.join(' ')
        })
      )
      for (const result of textResults) {
        pageTexts.push(result.status === 'fulfilled' ? (result.value || '') : '')
      }
    } catch {
      // silent
    }

    const textContent = pageTexts.filter((t) => t.length > 10).join('\n\n---\n\n')

    // Extract metadata
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)
    const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)
    const pcMatch = html.match(/"page_count"\s*:\s*(\d+)/)

    const cleanTitle = (titleMatch?.[1] || title || `Scribd Document ${docId}`)
      .replace(/\s*\|\s*Scribd.*$/i, '')
      .replace(/\s*\|\s*PDF.*$/i, '')
      .trim()

    const result = {
      success: true,
      docId,
      title: cleanTitle,
      author: null,
      description: descMatch?.[1] || null,
      pageCount: pcMatch ? parseInt(pcMatch[1]) : pageImages.length,
      thumbnail: thumbMatch?.[1] || pageImages[0] || null,
      pages: pageImages.map((url, i) => ({ index: i, url })),
      pageImages,
      pageTexts: pageTexts.length > 0 ? pageTexts : undefined,
      textContent: textContent || undefined,
      isScanned: true,
      isDemo: false,
      sourceUrl: sourceUrl || '',
      source: 'bookmarklet',
    }

    // Store the result with a random ID
    const extractId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    extractStore.set(extractId, { data: result, timestamp: Date.now() })

    // Return the ID — the bookmarklet will redirect to /?extract_id=ID
    return NextResponse.json(
      { success: true, extractId, pageCount: pageImages.length, title: cleanTitle },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed.'
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

/**
 * GET: Retrieve stored extraction result by ID.
 * Called by the app after the bookmarklet redirects to /?extract_id=ID
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const extractId = searchParams.get('id')

  if (!extractId || !extractStore.has(extractId)) {
    return NextResponse.json(
      { success: false, error: 'No extraction data found for this ID. It may have expired.' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  const entry = extractStore.get(extractId)!
  const age = Date.now() - entry.timestamp

  if (age > STORE_TTL) {
    extractStore.delete(extractId)
    return NextResponse.json(
      { success: false, error: 'Extraction data expired. Please run the bookmarklet again.' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  // Return the stored data and clean up
  const data = entry.data
  extractStore.delete(extractId) // One-time use
  return NextResponse.json(data, { headers: CORS_HEADERS })
}
