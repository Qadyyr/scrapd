import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * Extract endpoint that accepts the FULL page HTML.
 * The bookmarklet just grabs document.documentElement.outerHTML and sends it here.
 * We do ALL the parsing server-side — simpler, more reliable, less error-prone.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { html, title, url: sourceUrl } = body as {
      html: string
      title: string
      url: string
    }

    if (!html || html.length < 1000) {
      return NextResponse.json(
        { error: 'No HTML content received. Make sure you are on a Scribd document page.' },
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
      if (urls.length > 0) break // Found URLs with this pattern, no need to try more
    }

    if (urls.length === 0) {
      // Return debug info about what we found
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
            hasImages: html.includes('/images/'),
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

    // Extract metadata from HTML
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
      isScanned: true,
      isDemo: false,
      sourceUrl: sourceUrl || '',
      source: 'bookmarklet',
    }

    return NextResponse.json(result, { headers: CORS_HEADERS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed.'
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
