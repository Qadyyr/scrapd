import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { fetchImageBuffer } from '@/lib/scribd'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DownloadPage {
  index: number
  url: string
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_ ]/gi, '')
      .trim()
      .slice(0, 60) || 'document'
  )
}

function parsePageRange(range: string | undefined, totalPages: number): number[] {
  if (!range || range.trim() === '') {
    return Array.from({ length: totalPages }, (_, i) => i)
  }
  const result = new Set<number>()
  const parts = range.split(',').map((p) => p.trim())
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim())
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (!isNaN(start) && !isNaN(end)) {
        const lo = Math.max(1, Math.min(start, end))
        const hi = Math.min(totalPages, Math.max(start, end))
        for (let i = lo; i <= hi; i++) result.add(i - 1)
      }
    } else {
      const n = parseInt(part, 10)
      if (!isNaN(n) && n >= 1 && n <= totalPages) {
        result.add(n - 1)
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      docId,
      title,
      author,
      pages,
      sourceUrl,
      thumbnail,
      pageRange,
    }: {
      docId: string
      title: string
      author?: string | null
      pages: DownloadPage[]
      sourceUrl: string
      thumbnail?: string | null
      pageRange?: string
    } = body

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { error: 'No pages provided for ZIP generation.' },
        { status: 400 }
      )
    }

    const selectedIndices = parsePageRange(pageRange, pages.length)
    const selectedPages = selectedIndices
      .map((i) => pages[i])
      .filter((p): p is DownloadPage => Boolean(p))

    if (selectedPages.length === 0) {
      return NextResponse.json(
        { error: 'No valid pages in the selected range.' },
        { status: 400 }
      )
    }

    const zip = new JSZip()
    const folderName = sanitizeFilename(title || `document-${docId}`)
    const folder = zip.folder(folderName) || zip

    let downloadedCount = 0
    let totalBytes = 0

    for (const page of selectedPages) {
      try {
        const imgBuffer = await fetchImageBuffer(page.url)
        totalBytes += imgBuffer.byteLength

        const bytes = new Uint8Array(imgBuffer)
        const isPng =
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        const ext = isPng ? 'png' : 'jpg'
        const pageNum = String(page.index + 1).padStart(3, '0')

        folder.file(`page-${pageNum}.${ext}`, imgBuffer)
        downloadedCount++
      } catch {
        // Skip failed pages
      }
    }

    if (downloadedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to download any page images.' },
        { status: 500 }
      )
    }

    const zipBytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    const zipSize = zipBytes.byteLength

    // Save to download history
    try {
      await db.downloadHistory.create({
        data: {
          url: sourceUrl,
          docId,
          title: title || `Document ${docId}`,
          author: author || null,
          pageCount: downloadedCount,
          thumbnail: thumbnail || null,
          format: 'zip',
          status: 'completed',
          fileSize: zipSize,
        },
      })
    } catch {
      // silent
    }

    return new NextResponse(zipBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(
          folderName
        )}.zip"`,
        'Content-Length': String(zipSize),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate ZIP.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
