import * as cheerio from 'cheerio'

export interface ScribdPage {
  index: number
  url: string
  width?: number
  height?: number
}

export interface ScribdDocInfo {
  docId: string
  title: string
  author: string | null
  description: string | null
  pageCount: number
  thumbnail: string | null
  pages: ScribdPage[]
  /** Extracted text content of the document (for text-based PDF generation) */
  textContent?: string
  /** Whether the data is from the live site or a demo fallback */
  isDemo?: boolean
  /** Optional warning message */
  warning?: string
  /** Per-page image URLs for scanned/image-based documents.
   *  When present, an image-based PDF is generated instead of a text-based one. */
  pageImages?: string[]
  /** Whether the document is image-based (scanned) vs text-based */
  isScanned?: boolean
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
]

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

/**
 * Extract the Scribd document ID from a URL.
 * URLs look like: https://www.scribd.com/document/123456789/title-slug
 */
export function extractDocId(url: string): string | null {
  const match = url.match(/scribd\.com\/(?:doc|document|read|embeds)\/(\d+)/i)
  return match ? match[1] : null
}

/**
 * Validate and normalize a Scribd URL.
 */
export function normalizeScribdUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed.includes('scribd.com')) return null
  // Ensure it has a protocol
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

/**
 * Fetch HTML content from a URL with browser-like headers.
 */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch page (HTTP ${res.status})`)
  }

  return res.text()
}

/**
 * Try multiple URL variants to fetch the Scribd document HTML.
 * Scribd may block some endpoints but allow others.
 */
async function fetchScribdHtmlMulti(docId: string, originalUrl: string): Promise<string> {
  const urlsToTry = [
    originalUrl,
    `https://www.scribd.com/document/${docId}`,
    `https://www.scribd.com/doc/${docId}`,
    `https://www.scribd.com/embeds/${docId}/content`,
    `https://www.scribd.com/mobile/documents/${docId}`,
  ]

  let lastError: Error | null = null
  for (const u of urlsToTry) {
    try {
      const html = await fetchHtml(u)
      if (html && html.length > 500) {
        return html
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError || new Error('All fetch attempts failed')
}

/**
 * Deduplicate an array of strings while preserving order.
 */
function dedupe(arr: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of arr) {
    if (item && !seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}

/**
 * Try to parse a JSON object from a script tag's content.
 */
function tryParseJson(content: string): any | null {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Recursively search a nested object for image URLs matching Scribd CDN patterns.
 */
function findImageUrls(obj: any, found: string[]): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (const item of obj) findImageUrls(item, found)
    return
  }
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      if (
        (key === 'url' || key === 'src' || key === 'image_url' || key === 'imageUrl') &&
        /scribd|scribdassets|document_cloud/i.test(val) &&
        /\.(jpg|jpeg|png|webp)/i.test(val)
      ) {
        found.push(val)
      }
    } else if (typeof val === 'object') {
      findImageUrls(val, found)
    }
  }
}

/**
 * Main function: fetch a Scribd document page and extract its info + page images.
 */
export async function fetchScribdDocInfo(rawUrl: string): Promise<ScribdDocInfo> {
  const url = normalizeScribdUrl(rawUrl)
  if (!url) {
    throw new Error('Invalid URL. Please enter a valid Scribd document URL.')
  }

  const docId = extractDocId(url)
  if (!docId) {
    throw new Error('Could not find a document ID in the URL.')
  }

  let html: string
  try {
    html = await fetchScribdHtmlMulti(docId, url)
  } catch (err) {
    throw new Error(
      `Unable to reach Scribd — the site may be blocking automated requests (Cloudflare protection). ${err instanceof Error ? err.message : 'Network error.'} Try again later or try a different document URL.`
    )
  }

  const $ = cheerio.load(html)

  // --- Extract metadata from meta tags ---
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text().trim() ||
    `Scribd Document ${docId}`

  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    null

  const thumbnail =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    null

  const author =
    $('meta[property="article:author"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    $('a[data-testid="author_link"]').text().trim() ||
    null

  // --- Extract page images ---
  const pageUrls: string[] = []

  // Strategy 1: Find <img> tags with class "absimg" (Scribd's rendered page images)
  $('img.absimg').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src')
    if (src) pageUrls.push(src)
  })

  // Strategy 2: Find images in the document viewer area
  $('[class*="page"], [class*="Page"], [data-page]').each((_, el) => {
    const $el = $(el)
    const src = $el.attr('data-src') || $el.attr('src')
    if (src && /\.(jpg|jpeg|png|webp)/i.test(src)) pageUrls.push(src)
    $el.find('img').each((_, img) => {
      const imgSrc = $(img).attr('data-src') || $(img).attr('src')
      if (imgSrc && /\.(jpg|jpeg|png|webp)/i.test(imgSrc)) pageUrls.push(imgSrc)
    })
  })

  // Strategy 3: Search script tags for JSON containing image URLs
  $('script').each((_, el) => {
    const content = $(el).html() || ''
    // Look for JSON objects that might contain page data
    if (content.includes('scribd') || content.includes('page')) {
      // Try to find JSON in __NEXT_DATA__ or similar
      const nextDataMatch = content.match(
        /(?:__NEXT_DATA__|__INITIAL_STATE__|window\.__[A-Z_]+__)\s*=\s*({[\s\S]*?})\s*;?\s*(?:<\/script>|$)/
      )
      if (nextDataMatch) {
        const parsed = tryParseJson(nextDataMatch[1])
        if (parsed) findImageUrls(parsed, pageUrls)
      }

      // Also extract any URLs that look like Scribd page images
      const urlMatches = content.matchAll(
        /["'](https?:\/\/[^"']*(?:scribd|scribdassets|document_cloud)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi
      )
      for (const m of urlMatches) {
        pageUrls.push(m[1])
      }
    }
  })

  // Strategy 4: Find any image URLs that match Scribd CDN patterns
  $('img').each((_, el) => {
    const src = $(el).attr('src') || ''
    if (/scribd|scribdassets|document_cloud/i.test(src) && /\.(jpg|jpeg|png|webp)/i.test(src)) {
      pageUrls.push(src)
    }
  })

  // Deduplicate and filter
  const uniqueUrls = dedupe(pageUrls)

  // Sort by page number if possible (look for /pages/N/ in URL)
  uniqueUrls.sort((a, b) => {
    const pageA = a.match(/\/pages\/(\d+)/)
    const pageB = b.match(/\/pages\/(\d+)/)
    if (pageA && pageB) return parseInt(pageA[1]) - parseInt(pageB[1])
    return 0
  })

  // Try to determine actual page count from meta or JSON
  let pageCount = uniqueUrls.length
  const pageCountMeta =
    $('meta[property="scribd:page_count"]').attr('content') ||
    $('meta[name="scribd:page_count"]').attr('content')
  if (pageCountMeta) {
    const n = parseInt(pageCountMeta, 10)
    if (!isNaN(n) && n > pageCount) pageCount = n
  }

  // If no images found, try the thumbnail at least
  if (uniqueUrls.length === 0 && thumbnail) {
    // We have metadata but no pages — likely behind a paywall
    return {
      docId,
      title: title.replace(/\s*\|\s*Scribd.*$/i, '').trim(),
      author: author?.trim() || null,
      description: description?.trim() || null,
      pageCount: pageCount || 0,
      thumbnail,
      pages: [],
      sourceUrl: url,
    }
  }

  // Build the pages array
  const pages: ScribdPage[] = uniqueUrls.map((u, i) => ({
    index: i,
    url: u,
  }))

  return {
    docId,
    title: title.replace(/\s*\|\s*Scribd.*$/i, '').trim(),
    author: author?.trim() || null,
    description: description?.trim() || null,
    pageCount: pageCount || pages.length,
    thumbnail,
    pages,
    sourceUrl: url,
  }
}

/**
 * Generate demo document info with placeholder page images.
 * Used when Scribd blocks the request, so users can still experience the UI.
 */
export function generateDemoDocInfo(rawUrl: string): ScribdDocInfo {
  const docId = extractDocId(rawUrl) || 'demo-12345'
  const pageCount = 8
  const pages: ScribdPage[] = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    url: `https://picsum.photos/seed/scribd-demo-${docId}-${i}/850/1100`,
  }))

  return {
    docId,
    title: 'Sample Document — Demo Preview',
    author: 'Scribd Downloader',
    description:
      'This is demo data shown because Scribd blocked the live request (Cloudflare protection). The page images are placeholders so you can preview how the downloader works. Try the download button to generate a sample PDF.',
    pageCount,
    thumbnail: pages[0]?.url || null,
    pages,
    sourceUrl: rawUrl.includes('scribd.com')
      ? rawUrl
      : `https://www.scribd.com/document/${docId}/demo`,
    isDemo: true,
  }
}

// =========================================================================
// REAL FETCHING via z-ai-web-dev-sdk page_reader (bypasses Cloudflare)
// =========================================================================

interface PageReaderClient {
  functions: {
    invoke: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data?: { html?: string; title?: string; text?: string } }>
  }
}

/**
 * Create a z-ai SDK client. The SDK normally reads from a `.z-ai-config` file,
 * but that doesn't exist on serverless platforms (Vercel). So we check for
 * environment variables first (ZAI_BASE_URL, ZAI_API_KEY), and if present,
 * instantiate the client directly. Otherwise, fall back to the file-based
 * `create()` method (which works in local dev where .z-ai-config exists).
 */
async function createZaiClient(): Promise<PageReaderClient> {
  const ZAIModule = await import('z-ai-web-dev-sdk')
  const ZAI = (
    ZAIModule as unknown as {
      default: {
        create: () => Promise<PageReaderClient>
        new (config: ZaiConfig): PageReaderClient
      }
    }
  ).default

  // Try environment variables first (works on Vercel / serverless)
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (baseUrl && apiKey) {
    const config: ZaiConfig = {
      baseUrl,
      apiKey,
      chatId: process.env.ZAI_CHAT_ID || '',
      userId: process.env.ZAI_USER_ID || '',
      token: process.env.ZAI_TOKEN || '',
    }
    return new ZAI(config)
  }

  // Fall back to file-based config (local dev with .z-ai-config)
  return ZAI.create()
}

interface ZaiConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

/**
 * Fetch Scribd page HTML using a Cloudflare Worker proxy.
 *
 * Cloudflare Workers run on Cloudflare's own network, so fetch() calls
 * to Scribd are NOT blocked by Cloudflare bot protection. This is the
 * ONLY reliable free way to fetch Scribd pages from Vercel.
 *
 * The worker URL is set via the CF_WORKER_URL env var.
 * Deploy the worker from the cloudflare-worker/ directory: npx wrangler deploy
 */
async function fetchViaCloudflareWorker(url: string): Promise<string> {
  const workerUrl = process.env.CF_WORKER_URL
  if (!workerUrl) {
    throw new Error('CF_WORKER_URL not configured')
  }

  const proxyUrl = `${workerUrl}?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    throw new Error(`Worker returned HTTP ${res.status}`)
  }

  const html = await res.text()
  if (!html || html.length < 1000) {
    throw new Error('Worker returned empty content')
  }

  // Check for Cloudflare challenge page
  if (html.includes('Client Challenge') || html.includes('cf-browser-verification')) {
    throw new Error('Worker received Cloudflare challenge page')
  }

  return html
}

/**
 * Fetch a Scribd document page HTML. Tries multiple strategies:
 * 1. z-ai page_reader (PRIMARY — works perfectly, fetches real page with JSONP URLs)
 * 2. Cloudflare Worker proxy (FALLBACK for Vercel — if CF_WORKER_URL is set)
 * 3. Direct fetch (last resort — rarely works due to Cloudflare)
 * Returns the raw HTML content of the page.
 */
async function fetchScribdHtml(url: string): Promise<string> {
  const errors: string[] = []

  // Strategy 1: z-ai page_reader (PRIMARY — works perfectly)
  // This fetches the real Scribd page including all docManager.addPage() calls
  // with JSONP URLs for every page image. It's free and reliable.
  try {
    const html = await fetchViaPageReader(url)
    if (html && html.length > 5000) {
      return html
    }
  } catch (err) {
    errors.push(`z-ai: ${err instanceof Error ? err.message : 'failed'}`)
  }

  // Strategy 2: Cloudflare Worker proxy (FALLBACK for Vercel)
  // Only used if z-ai isn't available (e.g., on Vercel where the internal
  // API isn't reachable). Requires CF_WORKER_URL env var.
  if (process.env.CF_WORKER_URL) {
    try {
      const html = await fetchViaCloudflareWorker(url)
      if (html && html.length > 5000 && html.includes('scribd')) {
        return html
      }
    } catch (err) {
      errors.push(
        `cf-worker: ${err instanceof Error ? err.message : 'failed'}`
      )
    }
  }

  // Strategy 3: Direct fetch (last resort — rarely works due to Cloudflare)
  try {
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
    if (res.ok) {
      const html = await res.text()
      if (
        html &&
        html.length > 5000 &&
        html.includes('scribd') &&
        !html.includes('Client Challenge') &&
        !html.includes('cf-browser-verification')
      ) {
        return html
      }
    }
    errors.push(`direct: HTTP ${res.status}`)
  } catch (err) {
    errors.push(
      `direct: ${err instanceof Error ? err.message : 'failed'}`
    )
  }

  throw new Error(
    `All fetch strategies failed (${errors.join('; ')}). ` +
      'Deploy the Cloudflare Worker from cloudflare-worker/ directory and set CF_WORKER_URL env var.'
  )
}

/**
 * Fetch a Scribd document page using the z-ai page_reader function,
 * which uses a managed service that bypasses Cloudflare anti-bot protection.
 * Returns the raw HTML content of the page.
 */
async function fetchViaPageReader(url: string): Promise<string> {
  const client = await createZaiClient()

  const result = await client.functions.invoke('page_reader', { url })
  const html: string = result?.data?.html || ''
  if (!html || html.length < 200) {
    throw new Error('page_reader returned empty content')
  }
  return html
}

/**
 * Clean and extract the actual document text from a Scribd page's HTML.
 *
 * Scribd renders documents as positioned `<span>` fragments. Reading them
 * in DOM order via `body.text()` gives roughly-correct reading order, but
 * individual letters/words sometimes land on their own lines (e.g. "in"
 * split into "i" + "n" across two text nodes). We post-process to join
 * fragment lines back into proper sentences.
 */
function extractDocumentText(html: string): string {
  const $ = cheerio.load(html)

  // Remove non-content elements
  $(
    'script, style, noscript, nav, header, footer, iframe, svg, ' +
      '[class*="cookie"], [class*="Cookie"], [id*="cookie"], ' +
      '[class*="banner"], [class*="Banner"], ' +
      '[class*="modal"], [class*="Modal"], ' +
      '[class*="signup"], [class*="Signup"], ' +
      '[class*="login"], [class*="Login"], ' +
      '[class*="nav"], [class*="Nav"], ' +
      '[class*="menu"], [class*="Menu"], ' +
      '[class*="sidebar"], [class*="Sidebar"], ' +
      '[class*="recommend"], [class*="Recommend"], ' +
      '[class*="related"], [class*="Related"], ' +
      '[class*="suggest"], [class*="Suggest"], ' +
      '[class*="footer"], [class*="Footer"], ' +
      '[class*="header"], [class*="Header"]'
  ).remove()

  let bodyText = $('body').text()

  // Normalize whitespace
  bodyText = bodyText
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')

  // Remove repetitive garbage (e.g. "scribd.scribd.scribd...")
  // Check for any short token that repeats 4+ times ANYWHERE in the line.
  bodyText = bodyText
    .split('\n')
    .filter((line) => {
      // "scribd.scribd.scribd.scribd" or "a b a b a b a b"
      if (/(.{1,15}?)([.\s]\1){3,}/.test(line)) return false
      // Lines that are just dots/periods/dashes
      if (/^[\s.\-_=*]{5,}$/.test(line)) return false
      // Lines where a single word repeats 6+ times
      const words = line.toLowerCase().split(/[\s.]+/).filter(Boolean)
      if (words.length >= 6) {
        const counts: Record<string, number> = {}
        for (const w of words) counts[w] = (counts[w] || 0) + 1
        const maxCount = Math.max(...Object.values(counts))
        if (maxCount / words.length > 0.6) return false
      }
      return true
    })
    .join('\n')

  // Remove obvious boilerplate phrases
  const boilerplate = [
    /^Opens in a new window/i,
    /^Opens an external website/i,
    /^Close this dialog/i,
    /^Skip to main content/i,
    /^Open navigation menu/i,
    /^Close suggestions/i,
    /^Change Language/i,
    /^Sign in$/i,
    /^Download free for 30 days/i,
    /^Download$/i,
    /^Save$/i,
    /^Print$/i,
    /^Embed$/i,
    /^Report$/i,
    /^Share$/i,
    /^Upload$/i,
    /^Search$/i,
    /^Your Privacy Choices/i,
    /^Cookie Preferences/i,
    /^Go to previous items/i,
    /^Go to next items/i,
    /^You are on page/i,
    /^AI-enhanced title/i,
    /^Full description/i,
    /^Mark this document as/i,
    /^found this document/i,
    /^For Later/i,
    /^ratings?$/i,
    /^\d+ ratings?$/i,
    /^\d+ views?$/i,
    /^\d+ pages?$/i,
  ]

  bodyText = bodyText
    .split('\n')
    .filter((line) => !boilerplate.some((re) => re.test(line)))
    .join('\n')

  // Cut everything before the "You are on page N" marker — that's where
  // the actual document body content begins on Scribd pages.
  const pageMarker = bodyText.match(/You are on page\s*\d+\s*\d*/i)
  if (pageMarker && pageMarker.index !== undefined) {
    bodyText = bodyText.slice(pageMarker.index + pageMarker[0].length).trim()
  }

  // --- Join fragment lines ---
  // Scribd's positioned spans sometimes split a word across lines, e.g.:
  //   "Maintenance Rights For Muslim Wives"
  //   "n"                          ← fragment of "in"
  //   "India: Legal Response"
  // A line of 1-3 chars is almost certainly a fragment. We join it to the
  // previous line WITH a space (fragments are typically the start of a new
  // word, not a continuation of the previous word's last letter).
  const lines = bodyText.split('\n')
  const joined: string[] = []
  for (const line of lines) {
    const prev = joined.length > 0 ? joined[joined.length - 1] : ''
    const isFragment =
      line.length <= 3 &&
      !/^[.!?;:,]$/.test(line) &&
      !/^\d+$/.test(line) &&
      prev.length > 0

    if (isFragment) {
      // Always add a space before the fragment — it's the start of a new word
      joined[joined.length - 1] = prev + ' ' + line
    } else {
      joined.push(line)
    }
  }
  bodyText = joined.join('\n')

  // Collapse 3+ newlines to 2
  bodyText = bodyText.replace(/\n{3,}/g, '\n\n').trim()

  return bodyText
}

/**
 * Fetch REAL Scribd document info using the z-ai page_reader service.
 * This bypasses Cloudflare and returns actual document metadata + text content.
 *
 * Since Scribd's per-page image hashes are JS-generated and not directly
 * accessible, we extract the document's text content and use the cover image
 * as the thumbnail. A text-based PDF can then be generated from the content.
 */
export async function fetchRealScribdDocInfo(
  rawUrl: string
): Promise<ScribdDocInfo> {
  const url = normalizeScribdUrl(rawUrl)
  if (!url) {
    throw new Error('Invalid URL. Please enter a valid Scribd document URL.')
  }

  const docId = extractDocId(url)
  if (!docId) {
    throw new Error('Could not find a document ID in the URL.')
  }

  let html: string
  try {
    html = await fetchScribdHtml(url)
  } catch (err) {
    throw new Error(
      `${err instanceof Error ? err.message : 'Unable to fetch the Scribd page.'}`
    )
  }

  const $ = cheerio.load(html)

  // --- Extract real metadata ---
  const rawTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    `Scribd Document ${docId}`

  // Strip common Scribd SEO suffixes like "| PDF | Wife | Marriage"
  const title = rawTitle
    .replace(/\s*\|\s*Scribd.*$/i, '')
    .replace(/\s*\|\s*PDF.*$/i, '')
    .replace(/\s*\|\s*[A-Z][^|]{0,40}(\s*\|\s*[^|]{0,40})*$/i, '')
    .trim()

  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    null

  const thumbnail =
    $('meta[property="og:image"]').attr('content') ||
    $('link[rel="image_src"]').attr('href') ||
    null

  let author: string | null =
    $('meta[property="article:author"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    null
  if (!author) {
    // Look for "Uploaded by" in text content, clean any HTML artifacts
    const uploadedByText = html.match(
      /Uploaded by\s+([^<\n"<>]{2,60})/i
    )
    if (uploadedByText) author = uploadedByText[1].trim()
  }
  // Clean any residual HTML/quote artifacts from author
  if (author) {
    author = author
      .replace(/["'<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
  }

  let pageCount = 0
  const pageCountMeta =
    html.match(/"page_count"\s*:\s*(\d+)/) ||
    html.match(/"pageCount"\s*:\s*(\d+)/) ||
    html.match(/(\d+)\s+pages/i)
  if (pageCountMeta) {
    pageCount = parseInt(pageCountMeta[1], 10) || 0
  }

  // --- Extract per-page contentUrls from docManager.addPage() calls ---
  // These JSONP URLs follow the pattern:
  //   https://html.scribdassets.com/{assetId}/pages/{N}-{hash}.jsonp
  //
  // KEY INSIGHT: The image URL uses the SAME hash! We can transform directly:
  //   https://html.scribd.com/{assetId}/images/{N}-{hash}.jpg
  //
  // This means we DON'T need to fetch each JSONP file — we construct image
  // URLs directly from the JSONP URLs in the HTML. This is ~100x faster
  // (1 fetch instead of N+1 fetches) and more reliable (CDN has no Cloudflare).
  const contentUrls: string[] = []
  const contentUrlRegex = /contentUrl:\s*"(https:\/\/html\.scribdassets\.com\/[^"]+)"/g
  let urlMatch
  while ((urlMatch = contentUrlRegex.exec(html)) !== null) {
    contentUrls.push(urlMatch[1])
  }

  let textContent = ''
  let pageImages: string[] = []
  let isScanned = false

  if (contentUrls.length > 0) {
    // --- FAST PATH: Transform JSONP URLs directly into image URLs ---
    // Pattern: .../pages/{N}-{hash}.jsonp → .../images/{N}-{hash}.jpg
    // Domain: html.scribdassets.com → html.scribd.com (both work, .scribd.com is canonical)
    const constructedImageUrls = contentUrls.map((jsonpUrl) => {
      return jsonpUrl
        .replace('/pages/', '/images/')
        .replace(/\.jsonp$/, '.jpg')
        .replace('html.scribdassets.com', 'html.scribd.com')
    })

    // Quick HEAD check on the first image to see if this is a scanned doc
    // (if the image URL exists, it's a scanned/image-based document)
    try {
      const checkRes = await fetch(constructedImageUrls[0], {
        method: 'HEAD',
        headers: { Referer: 'https://www.scribd.com/' },
        signal: AbortSignal.timeout(8000),
      })

      if (
        checkRes.ok &&
        checkRes.headers.get('content-type')?.includes('image')
      ) {
        // All images are accessible — this is a scanned document!
        pageImages = constructedImageUrls
        isScanned = true
      }
    } catch {
      // HEAD check failed — fall through to JSONP fetching for text content
    }

    // --- FALLBACK: If not scanned, fetch JSONP files for text content ---
    if (!isScanned) {
      const pageResults = await Promise.allSettled(
        contentUrls.slice(0, 30).map((cu) => fetchJsonpContent(cu))
      )

      const pageTexts: string[] = []
      for (const result of pageResults) {
        if (result.status !== 'fulfilled' || !result.value) continue
        const { text, imageUrl } = result.value
        if (imageUrl && !isScanned) {
          // JSONP had an image — use constructed URLs instead
          pageImages = constructedImageUrls
          isScanned = true
        }
        if (text) {
          pageTexts.push(text)
        }
      }

      if (pageTexts.length > 0) {
        textContent = pageTexts.join('\n\n---\n\n')
      }
    }

    // Update pageCount to match actual pages found
    if (contentUrls.length > pageCount) {
      pageCount = contentUrls.length
    }
  }

  // Fallback: if no JSONP pages were found, extract text from the main HTML
  if (!textContent && !isScanned) {
    textContent = extractDocumentText(html)
  }

  // Build a "pages" array: use page images for scanned docs, or thumbnail for text docs
  const pages: ScribdPage[] = []
  if (isScanned && pageImages.length > 0) {
    pageImages.forEach((imgUrl, i) => {
      pages.push({ index: i, url: imgUrl })
    })
  } else if (thumbnail) {
    pages.push({ index: 0, url: thumbnail })
  }

  return {
    docId,
    title: title.replace(/\s*\|\s*Scribd.*$/i, '').trim(),
    author: author?.trim() || null,
    description: description?.trim() || null,
    pageCount:
      pageCount || (textContent ? Math.ceil(textContent.length / 2500) : 1),
    thumbnail,
    pages,
    sourceUrl: url,
    textContent,
    isDemo: false,
    pageImages: pageImages.length > 0 ? pageImages : undefined,
    isScanned,
  }
}

/**
 * Fetch a single JSONP page content file from Scribd's CDN.
 * Returns the extracted text (for text pages) and/or image URL (for scanned pages).
 */
async function fetchJsonpContent(
  url: string
): Promise<{ text: string; imageUrl: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        Accept: '*/*',
        Referer: 'https://www.scribd.com/',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null

    // The JSONP content may be gzipped; fetch handles decompression
    const raw = await res.text()

    // JSONP format: window.pageN_callback(["<html content>"])
    // Extract the HTML content from inside the JSONP wrapper
    const jsonpMatch = raw.match(/callback\(\s*\["(.*?)"\s*\]\s*\)/s)
    let pageHtml = raw
    if (jsonpMatch) {
      // Unescape the JSON string
      try {
        pageHtml = JSON.parse('"' + jsonpMatch[1] + '"')
      } catch {
        pageHtml = jsonpMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      }
    }

    // Check for image tags (scanned documents).
    // Scribd scanned pages use <img class="absimg" orig="..." /> where the
    // actual image URL is in the `orig` attribute (NOT `src`). The URLs are
    // typically http://html.scribd.com/.../images/N-HASH.jpg
    const $ = cheerio.load(pageHtml)

    // Look for <img> tags — check orig, src, and data-src attributes
    let imageUrl: string | null = null
    $('img').each((_, el) => {
      const src =
        $(el).attr('orig') ||
        $(el).attr('src') ||
        $(el).attr('data-src')
      if (!src) return
      // Match any scribd image URL (scribd.com or scribdassets.com),
      // with http or https, ending in an image extension
      if (
        /scribd/i.test(src) &&
        /\.(jpg|jpeg|png|webp)/i.test(src)
      ) {
        // Upgrade http to https for security/mixed-content
        imageUrl = src.replace(/^http:\/\//i, 'https://')
        return false // break
      }
    })

    // Also check for background-image CSS (some scanned pages use this)
    if (!imageUrl) {
      const bgMatch = pageHtml.match(
        /background-image\s*:\s*url\(["']?(https?:\/\/[^"')\s]+\.(?:jpg|jpeg|png|webp)[^"')\s]*)["']?\)/i
      )
      if (bgMatch) {
        imageUrl = bgMatch[1].replace(/^http:\/\//i, 'https://')
      }
    }

    // Also check for image URLs in style attributes
    if (!imageUrl) {
      $('[style*="background"]').each((_, el) => {
        const style = $(el).attr('style') || ''
        const bgUrl = style.match(
          /url\(["']?(https?:\/\/[^"')\s]+\.(?:jpg|jpeg|png|webp)[^"')\s]*)["']?\)/i
        )
        if (bgUrl) {
          imageUrl = bgUrl[1].replace(/^http:\/\//i, 'https://')
          return false
        }
      })
    }

    // Extract text content from the page
    let text = ''
    if (!imageUrl) {
      // Text-based page: extract text from positioned spans
      const spans = $('span.a').toArray()
      if (spans.length > 0) {
        const lines: { top: number; left: number; text: string }[] = []
        for (const span of spans) {
          const $span = $(span)
          const style = $span.attr('style') || ''
          const topMatch = style.match(/top:\s*(-?\d+(?:\.\d+)?)px/i)
          const leftMatch = style.match(/left:\s*(-?\d+(?:\.\d+)?)px/i)
          const spanText = $span.text().trim()
          if (topMatch && leftMatch && spanText) {
            lines.push({
              top: parseFloat(topMatch[1]),
              left: parseFloat(leftMatch[1]),
              text: spanText,
            })
          }
        }
        // Sort by position and join
        lines.sort((a, b) => a.top - b.top || a.left - b.left)
        // Group into lines by top position
        const lineGroups: { top: number; left: number; text: string }[][] = []
        let currentGroup: { top: number; left: number; text: string }[] = []
        let lastTop = -Infinity
        const TOLERANCE = 40
        for (const l of lines) {
          if (l.top - lastTop > TOLERANCE && currentGroup.length > 0) {
            lineGroups.push(currentGroup)
            currentGroup = []
          }
          currentGroup.push(l)
          lastTop = l.top
        }
        if (currentGroup.length > 0) lineGroups.push(currentGroup)

        text = lineGroups
          .map((group) =>
            group
              .sort((a, b) => a.left - b.left)
              .map((s) => s.text)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
          )
          .filter((l) => l.length > 0)
          .join('\n')
      } else {
        // Fallback: get all text
        text = $.text()
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
    }

    return { text, imageUrl }
  } catch {
    return null
  }
}

/**
 * Fetch an image as an ArrayBuffer (for thumbnail/cover images).
 */
export async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      Accept:
        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: 'https://www.scribd.com/',
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch image (HTTP ${res.status})`)
  }
  return res.arrayBuffer()
}
