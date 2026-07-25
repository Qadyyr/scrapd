import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_ ]/gi, '')
      .trim()
      .slice(0, 60) || 'document'
  )
}

/**
 * Download the document as a plain text file (.txt).
 * This is the most reliable format — it contains the exact extracted text
 * content with no encoding issues, no font limitations, and no rendering
 * artifacts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      docId,
      title,
      author,
      description,
      sourceUrl,
      thumbnail,
      textContent,
    }: {
      docId: string
      title: string
      author?: string | null
      description?: string | null
      sourceUrl: string
      thumbnail?: string | null
      textContent?: string
    } = body

    if (!textContent || textContent.trim().length < 10) {
      return NextResponse.json(
        { error: 'No text content available for TXT download.' },
        { status: 400 }
      )
    }

    // Build the text file with a header
    const header =
      `${title}\n` +
      (author ? `by ${author}\n` : '') +
      (description ? `\n${description}\n` : '') +
      `\nSource: ${sourceUrl}\n` +
      `Downloaded: ${new Date().toISOString()}\n` +
      `${'='.repeat(70)}\n\n`

    const fullText = header + textContent
    const textBytes = new TextEncoder().encode(fullText)
    const textSize = textBytes.byteLength

    // Save to download history
    try {
      await db.downloadHistory.create({
        data: {
          url: sourceUrl,
          docId,
          title: title || `Document ${docId}`,
          author: author || null,
          pageCount: Math.max(1, Math.ceil(textContent.length / 2500)),
          thumbnail: thumbnail || null,
          format: 'txt',
          status: 'completed',
          fileSize: textSize,
        },
      })
    } catch {
      // silent
    }

    return new NextResponse(textBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(
          sanitizeFilename(title || 'document')
        )}.txt"`,
        'Content-Length': String(textSize),
      },
    })
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to generate TXT.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
