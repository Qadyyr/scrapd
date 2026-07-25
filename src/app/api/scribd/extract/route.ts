import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Extract endpoint — receives JSONP URLs extracted by the bookmarklet
 * (which runs in the user's browser, naturally bypassing Cloudflare).
 *
 * The bookmarklet extracts contentUrl JSONP URLs from the Scribd page DOM
 * and sends them here. We transform them into image URLs and return
 * the document info — no server-side Cloudflare bypass needed!
 *
 * POST body: { urls: string[], title: string, sourceUrl: string, thumbnail?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      urls,
      title,
      sourceUrl,
      thumbnail,
      author,
      description,
      pageCount: rawPageCount,
    }: {
      urls: string[]
      title: string
      sourceUrl: string
      thumbnail?: string
      author?: string
      description?: string
      pageCount?: number
    } = body

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'No page URLs provided. Make sure you ran the bookmarklet on a Scribd document page.' },
        { status: 400 }
      )
    }

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
        { error: 'No valid Scribd page URLs found in the extracted data.' },
        { status: 400 }
      )
    }

    // Quick HEAD check on the first image to confirm accessibility
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

    const pageCount = rawPageCount || pageImages.length

    const result = {
      success: true,
      docId,
      title: title || `Scribd Document ${docId}`,
      author: author || null,
      description: description || null,
      pageCount,
      thumbnail: thumbnail || pageImages[0] || null,
      pages: pageImages.map((url, i) => ({ index: i, url })),
      pageImages,
      isScanned: true, // All documents with page images are treated as image-based
      isDemo: false,
      sourceUrl,
      source: 'bookmarklet',
      imagesAccessible,
      warning: imagesAccessible
        ? undefined
        : 'Image URLs constructed but first image check failed. Download may still work.',
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Extraction failed.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
