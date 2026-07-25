import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Extract endpoint — receives JSONP URLs from the bookmarklet or mobile URL.
 *
 * Works TWO ways:
 * 1. POST (bookmarklet): { urls, title, sourceUrl, thumbnail } in JSON body
 * 2. GET (mobile-friendly): ?urls=URL1,URL2&title=...&source=... as query params
 *    The bookmarklet redirects to this URL, so it works on mobile too!
 *
 * Both methods transform JSONP URLs into image URLs and return doc info.
 */

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

// GET method — for mobile and redirect-based extraction
// The bookmarklet redirects to: /api/scribd/extract?urls=...&title=...
// We process the URLs and redirect back to the app homepage with the result
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const urlsParam = searchParams.get('urls') || ''
  const title = searchParams.get('title') || 'Scribd Document'
  const sourceUrl = searchParams.get('source') || searchParams.get('sourceUrl') || ''
  const thumbnail = searchParams.get('thumbnail') || null
  const pageCountParam = searchParams.get('pageCount')

  // URLs are comma-separated
  const urls = urlsParam
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)

  if (urls.length === 0) {
    return NextResponse.json(
      { error: 'No page URLs provided.' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const response = await processExtraction(
    urls,
    title,
    sourceUrl,
    thumbnail || undefined,
    pageCountParam ? parseInt(pageCountParam) : undefined
  )

  // If processing failed, return the error as JSON
  if (response.status !== 200) {
    return response
  }

  // Success — redirect back to the app homepage with the extracted data
  // encoded in the URL hash so the frontend can pick it up
  const data = await response.json()
  const encoded = encodeURIComponent(JSON.stringify(data))
  const appUrl = new URL(req.url).origin + '/#extracted=' + encoded

  return NextResponse.redirect(appUrl, { headers: CORS_HEADERS })
}

// POST method — for bookmarklet XHR
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      urls,
      title,
      sourceUrl,
      thumbnail,
      pageCount: rawPageCount,
    }: {
      urls: string[]
      title: string
      sourceUrl: string
      thumbnail?: string
      pageCount?: number
    } = body

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'No page URLs provided.' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    return processExtraction(urls, title || 'Scribd Document', sourceUrl, thumbnail, rawPageCount)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed.'
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

async function processExtraction(
  urls: string[],
  title: string,
  sourceUrl: string,
  thumbnail?: string,
  pageCount?: number
) {
  // Extract docId from sourceUrl
  const docIdMatch = sourceUrl.match(/scribd\.com\/(?:doc|document|read|embeds)\/(\d+)/i)
  const docId = docIdMatch ? docIdMatch[1] : 'unknown'

  // Transform JSONP URLs into image URLs:
  //   https://html.scribdassets.com/{id}/pages/{N}-{hash}.jsonp
  //   → https://html.scribd.com/{id}/images/{N}-{hash}.jpg
  const pageImages = urls
    .filter((u) => u.includes('scribdassets.com') && u.endsWith('.jsonp'))
    .map((jsonpUrl) => {
      return jsonpUrl
        .replace('/pages/', '/images/')
        .replace(/\.jsonp$/, '.jpg')
        .replace('html.scribdassets.com', 'html.scribd.com')
    })

  if (pageImages.length === 0) {
    return NextResponse.json(
      { error: 'No valid Scribd page URLs found.' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Quick HEAD check on the first image
  let imagesAccessible = false
  try {
    const checkRes = await fetch(pageImages[0], {
      method: 'HEAD',
      headers: { Referer: 'https://www.scribd.com/' },
      signal: AbortSignal.timeout(8000),
    })
    imagesAccessible = checkRes.ok
  } catch {
    imagesAccessible = false
  }

  const result = {
    success: true,
    docId,
    title: title || `Scribd Document ${docId}`,
    author: null,
    description: null,
    pageCount: pageCount || pageImages.length,
    thumbnail: thumbnail || pageImages[0] || null,
    pages: pageImages.map((url, i) => ({ index: i, url })),
    pageImages,
    isScanned: true,
    isDemo: false,
    sourceUrl,
    source: 'bookmarklet',
    imagesAccessible,
  }

  return NextResponse.json(result, { headers: CORS_HEADERS })
}
