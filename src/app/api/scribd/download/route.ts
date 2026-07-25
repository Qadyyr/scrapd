import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { fetchImageBuffer } from '@/lib/scribd'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    }: {
      docId: string
      title: string
      author?: string | null
      pages: Array<{ index: number; url: string }>
      sourceUrl: string
      thumbnail?: string | null
    } = body

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { error: 'No pages provided for PDF generation.' },
        { status: 400 }
      )
    }

    const pdfDoc = await PDFDocument.create()
    pdfDoc.setTitle(title || 'Scribd Document')
    pdfDoc.setAuthor(author || 'Unknown')
    pdfDoc.setCreator('Scribd Downloader')
    pdfDoc.setProducer('Scribd Downloader')

    let downloadedCount = 0
    let totalBytes = 0

    for (const page of pages) {
      try {
        const imgBuffer = await fetchImageBuffer(page.url)
        totalBytes += imgBuffer.byteLength

        let img
        const bytes = new Uint8Array(imgBuffer)
        // Detect format by magic bytes
        const isPng =
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8

        if (isPng) {
          img = await pdfDoc.embedPng(bytes)
        } else if (isJpeg) {
          img = await pdfDoc.embedJpg(bytes)
        } else {
          // Default to JPEG for other formats (webp may not work with pdf-lib)
          try {
            img = await pdfDoc.embedJpg(bytes)
          } catch {
            // Skip unsupported image formats
            continue
          }
        }

        const pdfPage = pdfDoc.addPage([img.width, img.height])
        pdfPage.drawImage(img, {
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
        })
        downloadedCount++
      } catch {
        // Skip failed pages but continue
      }
    }

    if (downloadedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to download any page images. The document may be protected.' },
        { status: 500 }
      )
    }

    const pdfBytes = await pdfDoc.save()
    const pdfSize = pdfBytes.byteLength

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
          format: 'pdf',
          status: 'completed',
          fileSize: pdfSize,
        },
      })
    } catch {
      // History save failure shouldn't block the download
    }

    return new NextResponse(pdfBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(
          (title || 'document').slice(0, 60)
        )}.pdf"`,
        'Content-Length': String(pdfSize),
      },
    })
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to generate PDF.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
