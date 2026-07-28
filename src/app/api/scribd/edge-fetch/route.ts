import { NextRequest, NextResponse } from 'next/server'

/**
 * Edge Function: Fetches a Scribd page directly from Vercel's Edge Network.
 *
 * Vercel Edge Functions run on Cloudflare's global network (Vercel uses
 * Cloudflare for edge). This means fetch() calls originate from Cloudflare's
 * own IPs, which are NOT blocked by Cloudflare's bot protection.
 *
 * This route does NOT use cheerio, Prisma, or the z-ai SDK — it's pure
 * fetch + regex parsing, compatible with the Edge Runtime.
 *
 * If the Edge fetch fails (e.g., Cloudflare still blocks it), the caller
 * should fall back to the z-ai page_reader or demo data.
 */

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
]

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function extractDocId(url: string): string | null {
  const match = url.match(/scribd\.com\/(?:doc|document|read|embeds)\/(\d+)/i)
  return match ? match[1] : null
}

/**
 * Parse Scribd HTML using regex (no cheerio needed for Edge Runtime).
 * Extracts: title, description, thumbnail, author, page_count, contentUrls
 */
function parseScribdHtml(html: string, docId: string, sourceUrl: string) {
  // Title
  let title = `Scribd Document ${docId}`
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)
  if (ogTitle) {
    title = ogTitle[1]
      .replace(/\s*\|\s*Scribd.*$/i, '')
      .replace(/\s*\|\s*PDF.*$/i, '')
      .replace(/\s*\|\s*[A-Z][^|]{0,40}(\s*\|\s*[^|]{0,40})*$/i, '')
      .trim()
  } else {
    const titleTag = html.match(/<title>([^<]*)<\/title>/i)
    if (titleTag) title = titleTag[1].replace(/\s*\|\s*Scribd.*$/i, '').trim()
  }

  // Description
  let description: string | null = null
  const ogDesc = html.match(
    /<meta\s+property="og:description"\s+content="([^"]*)"/i
  )
  if (ogDesc) description = ogDesc[1]
  if (!description) {
    const metaDesc = html.match(
      /<meta\s+name="description"\s+content="([^"]*)"/i
    )
    if (metaDesc) description = metaDesc[1]
  }

  // Thumbnail
  let thumbnail: string | null = null
  const ogImage = html.match(
    /<meta\s+property="og:image"\s+content="([^"]*)"/i
  )
  if (ogImage) thumbnail = ogImage[1]
  if (!thumbnail) {
    const imageSrc = html.match(/<link\s+rel="image_src"\s+href="([^"]*)"/i)
    if (imageSrc) thumbnail = imageSrc[1]
  }

  // Author
  let author: string | null = null
  const authorMeta = html.match(
    /<meta\s+(?:property="article:author"|name="author")\s+content="([^"]*)"/i
  )
  if (authorMeta) author = authorMeta[1]
  if (!author) {
    const uploadedBy = html.match(/Uploaded by\s+([^<\n"<>]{2,60})/i)
    if (uploadedBy) author = uploadedBy[1].trim()
  }
  if (author) {
    author = author
      .replace(/["'<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
  }

  // Page count
  let pageCount = 0
  const pcMatch =
    html.match(/"page_count"\s*:\s*(\d+)/) ||
    html.match(/"pageCount"\s*:\s*(\d+)/) ||
    html.match(/(\d+)\s+pages/i)
  if (pcMatch) pageCount = parseInt(pcMatch[1], 10) || 0

  // Extract contentUrl JSONP URLs (per-page content on CDN)
  const contentUrls: string[] = []
  const contentUrlRegex =
    /contentUrl:\s*"(https:\/\/html\.scribdassets\.com\/[^"]+)"/g
  let urlMatch
  while ((urlMatch = contentUrlRegex.exec(html)) !== null) {
    contentUrls.push(urlMatch[1])
  }

  return {
    docId,
    title,
    author,
    description,
    thumbnail,
    pageCount,
    contentUrls,
    sourceUrl,
  }
}

/**
 * Fetch a JSONP page file from CDN and extract text/image URL.
 * Uses regex parsing (no cheerio for Edge compatibility).
 */
async function fetchJsonpPage(
  jsonpUrl: string
): Promise<{ text: string; imageUrl: string | null } | null> {
  try {
    const res = await fetch(jsonpUrl, {
      headers: {
        'User-Agent': randomUA(),
        Accept: '*/*',
        Referer: 'https://www.scribd.com/',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null

    const raw = await res.text()

    // Extract HTML from JSONP wrapper: window.pageN_callback(["<html>"])
    const jsonpMatch = raw.match(/callback\(\s*\["([\s\S]*?)"\s*\]\s*\)/)
    let pageHtml = raw
    if (jsonpMatch) {
      try {
        pageHtml = JSON.parse('"' + jsonpMatch[1] + '"')
      } catch {
        pageHtml = jsonpMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      }
    }

    // Check for scanned page images: <img class="absimg" orig="...">
    let imageUrl: string | null = null
    const origMatch = pageHtml.match(
      /<img[^>]*\borig=["'](https?:\/\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
    )
    if (origMatch) {
      imageUrl = origMatch[1].replace(/^http:\/\//i, 'https://')
    }

    if (!imageUrl) {
      // Check for src attribute
      const srcMatch = pageHtml.match(
        /<img[^>]*\bsrc=["'](https?:\/\/[^"']*scribd[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
      )
      if (srcMatch) {
        imageUrl = srcMatch[1].replace(/^http:\/\//i, 'https://')
      }
    }

    if (!imageUrl) {
      // Check for background-image
      const bgMatch = pageHtml.match(
        /background-image\s*:\s*url\(["']?(https?:\/\/[^"')\s]+\.(?:jpg|jpeg|png|webp)[^"')\s]*)["']?\)/i
      )
      if (bgMatch) {
        imageUrl = bgMatch[1].replace(/^http:\/\//i, 'https://')
      }
    }

    // Extract text from positioned spans (text documents)
    let text = ''
    if (!imageUrl) {
      // Extract text from <span class="a" ...>text</span>
      const spanTexts: string[] = []
      const spanRegex = /<span[^>]*class=["']a["'][^>]*>([^<]*)<\/span>/gi
      let spanMatch
      while ((spanMatch = spanRegex.exec(pageHtml)) !== null) {
        const t = spanMatch[1].trim()
        if (t && t !== '&nbsp;') spanTexts.push(t)
      }
      text = spanTexts.join(' ').replace(/\s+/g, ' ').trim()
    }

    return { text, imageUrl }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const url: string = body.url

    if (!url || typeof url !== 'string' || !url.includes('scribd.com')) {
      return NextResponse.json(
        { error: 'A valid Scribd URL is required.' },
        { status: 400 }
      )
    }

    const docId = extractDocId(url)
    if (!docId) {
      return NextResponse.json(
        { error: 'Could not find a document ID in the URL.' },
        { status: 400 }
      )
    }

    // --- Direct fetch from Vercel Edge (Cloudflare's own network) ---
    const fetchStrategies = [
      // Strategy 1: Direct fetch with browser headers
      async () => {
        const res = await fetch(url, {
          headers: {
            'User-Agent': randomUA(),
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.text()
      },
      // Strategy 2: Fetch with different UA (mobile)
      async () => {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.text()
      },
    ]

    let html = ''
    let lastError = ''
    for (const strategy of fetchStrategies) {
      try {
        html = await strategy()
        if (html && html.length > 1000 && html.includes('scribd')) break
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unknown error'
      }
    }

    if (!html || html.length < 1000) {
      return NextResponse.json(
        {
          error: `Edge fetch failed: ${lastError || 'empty response'}. Cloudflare may be blocking this request.`,
        },
        { status: 502 }
      )
    }

    // Parse the HTML
    const parsed = parseScribdHtml(html, docId, url)

    // Fetch per-page JSONP content from CDN (no Cloudflare on CDN)
    let textContent = ''
    let pageImages: string[] = []
    let isScanned = false

    if (parsed.contentUrls.length > 0) {
      const pageResults = await Promise.allSettled(
        parsed.contentUrls.slice(0, 30).map((cu) => fetchJsonpPage(cu))
      )

      const pageTexts: string[] = []
      const scannedImages: string[] = []

      for (const result of pageResults) {
        if (result.status !== 'fulfilled' || !result.value) continue
        const { text, imageUrl } = result.value
        if (imageUrl) scannedImages.push(imageUrl)
        if (text) pageTexts.push(text)
      }

      if (scannedImages.length > 0) {
        pageImages = scannedImages
        isScanned = true
      }
      if (pageTexts.length > 0) {
        textContent = pageTexts.join('\n\n')
      }

      if (parsed.contentUrls.length > parsed.pageCount) {
        parsed.pageCount = parsed.contentUrls.length
      }
    }

    return NextResponse.json({
      docId: parsed.docId,
      title: parsed.title,
      author: parsed.author,
      description: parsed.description,
      pageCount:
        parsed.pageCount ||
        (textContent ? Math.ceil(textContent.length / 2500) : 1),
      thumbnail: parsed.thumbnail,
      pages: parsed.thumbnail ? [{ index: 0, url: parsed.thumbnail }] : [],
      sourceUrl: parsed.sourceUrl,
      textContent: textContent || undefined,
      pageImages: pageImages.length > 0 ? pageImages : undefined,
      isScanned,
      isDemo: false,
      source: 'edge',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Edge fetch failed.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
