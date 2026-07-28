import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { fetchImageBuffer } from '@/lib/scribd'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
      textContent,
    }: {
      docId: string
      title: string
      author?: string | null
      pages: DownloadPage[]
      sourceUrl: string
      thumbnail?: string | null
      textContent?: string
    } = body

    const zip = new JSZip()
    const folderName = sanitizeFilename(title || `document-${docId}`)
    const folder = zip.folder(folderName) || zip

    let downloadedCount = 0
    let totalBytes = 0

    // Add the document text content as a .txt file (primary content)
    if (textContent && textContent.trim().length > 0) {
      const header =
        `${title}\n` +
        (author ? `by ${author}\n` : '') +
        '\n' +
        `Source: ${sourceUrl}\n` +
        `Downloaded: ${new Date().toISOString()}\n` +
        `${'='.repeat(60)}\n\n`
      folder.file('document.txt', header + textContent)
      downloadedCount++
      totalBytes += Buffer.byteLength(header + textContent, 'utf8')
    }

    // Add metadata.json
    const meta = {
      title,
      author: author || null,
      sourceUrl,
      docId,
      downloadedAt: new Date().toISOString(),
      format: 'zip',
      textIncluded: Boolean(textContent),
      imageCount: pages?.length || 0,
    }
    folder.file('metadata.json', JSON.stringify(meta, null, 2))
    totalBytes += Buffer.byteLength(JSON.stringify(meta), 'utf8')

    // Add any page images (e.g., the cover thumbnail)
    if (pages && pages.length > 0) {
      for (const page of pages) {
        try {
          const imgBuffer = await fetchImageBuffer(page.url)
          totalBytes += imgBuffer.byteLength

          const bytes = new Uint8Array(imgBuffer)
          const isPng =
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47
          const ext = isPng ? 'png' : 'jpg'
          const pageNum = String(page.index + 1).padStart(3, '0')

          folder.file(`page-${pageNum}.${ext}`, imgBuffer)
          downloadedCount++
        } catch {
          // Skip failed images
        }
      }
    }

    if (downloadedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to create any content for the ZIP archive.' },
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
