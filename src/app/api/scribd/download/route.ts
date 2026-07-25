import { NextRequest, NextResponse } from 'next/server'
import {
  PDFDocument,
  StandardFonts,
  PDFFont,
  rgb,
  PDFPage,
} from 'pdf-lib'
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

/**
 * Generate a text-based PDF from the document's text content.
 * Uses pdf-lib's StandardFonts with proper word-wrapping and pagination.
 */
async function generateTextPdf(params: {
  title: string
  author: string | null
  description: string | null
  textContent: string
  sourceUrl: string
}): Promise<Uint8Array> {
  const { title, author, description, textContent, sourceUrl } = params

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(title)
  pdfDoc.setAuthor(author || 'Unknown')
  pdfDoc.setCreator('Scribd Downloader')
  pdfDoc.setProducer('Scribd Downloader')
  pdfDoc.setSubject(description || 'Downloaded from Scribd')

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  // A4 page dimensions in points (1pt = 1/72 inch; A4 = 595 x 842 pt)
  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 56 // ~0.78 inch margins
  const contentWidth = pageWidth - margin * 2

  let currentPage: PDFPage = pdfDoc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
  }

  function drawWrappedText(
    text: string,
    font: PDFFont,
    size: number,
    lineHeight: number,
    color = rgb(0.15, 0.15, 0.15)
  ) {
    const words = text.split(/\s+/).filter(Boolean)
    let line = ''

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      const width = font.widthOfTextAtSize(testLine, size)
      if (width > contentWidth && line) {
        ensureSpace(lineHeight)
        currentPage.drawText(line, {
          x: margin,
          y: y - size,
          size,
          font,
          color,
        })
        y -= lineHeight
        line = word
      } else {
        line = testLine
      }
    }
    if (line) {
      ensureSpace(lineHeight)
      currentPage.drawText(line, {
        x: margin,
        y: y - size,
        size,
        font,
        color,
      })
      y -= lineHeight
    }
  }

  // --- Title page ---
  y = pageHeight - margin * 2
  drawWrappedText(title, boldFont, 24, 30, rgb(0.1, 0.1, 0.1))
  y -= 12

  if (author) {
    drawWrappedText(`by ${author}`, italicFont, 13, 18, rgb(0.4, 0.4, 0.4))
    y -= 8
  }

  if (description) {
    y -= 6
    drawWrappedText(description, font, 10, 14, rgb(0.45, 0.45, 0.45))
    y -= 8
  }

  // Divider line
  y -= 14
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= 24

  // --- Body content ---
  const paragraphs = textContent
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  for (const para of paragraphs) {
    drawWrappedText(para, font, 11, 16, rgb(0.15, 0.15, 0.15))
    y -= 8 // paragraph spacing
  }

  // --- Footer on last page ---
  y -= 20
  ensureSpace(30)
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  })
  y -= 16
  const footerText = `Downloaded from Scribd via Scribd Downloader • ${new Date().toLocaleDateString()}`
  drawWrappedText(footerText, italicFont, 8, 11, rgb(0.6, 0.6, 0.6))

  // Add page numbers to all pages
  const pages = pdfDoc.getPages()
  pages.forEach((page, i) => {
    const numText = `${i + 1} / ${pages.length}`
    const numWidth = font.widthOfTextAtSize(numText, 9)
    page.drawText(numText, {
      x: (pageWidth - numWidth) / 2,
      y: 28,
      size: 9,
      font,
      color: rgb(0.55, 0.55, 0.55),
    })
  })

  return pdfDoc.save()
}

/**
 * Generate an image-based PDF (legacy path, used when textContent is empty
 * but page image URLs are available).
 */
async function generateImagePdf(pages: DownloadPage[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setCreator('Scribd Downloader')
  pdfDoc.setProducer('Scribd Downloader')

  for (const page of pages) {
    try {
      const imgBuffer = await fetchImageBuffer(page.url)
      const bytes = new Uint8Array(imgBuffer)
      const isPng =
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8

      let img
      if (isPng) {
        img = await pdfDoc.embedPng(bytes)
      } else if (isJpeg) {
        img = await pdfDoc.embedJpg(bytes)
      } else {
        try {
          img = await pdfDoc.embedJpg(bytes)
        } catch {
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
    } catch {
      // skip failed page
    }
  }

  return pdfDoc.save()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      docId,
      title,
      author,
      description,
      pages,
      sourceUrl,
      thumbnail,
      textContent,
    }: {
      docId: string
      title: string
      author?: string | null
      description?: string | null
      pages: DownloadPage[]
      sourceUrl: string
      thumbnail?: string | null
      textContent?: string
    } = body

    let pdfBytes: Uint8Array
    let isTextPdf = false

    // Prefer text-based PDF when we have real text content
    if (textContent && textContent.trim().length > 100) {
      pdfBytes = await generateTextPdf({
        title: title || 'Scribd Document',
        author: author || null,
        description: description || null,
        textContent,
        sourceUrl,
      })
      isTextPdf = true
    } else if (pages && pages.length > 0) {
      pdfBytes = await generateImagePdf(pages)
    } else {
      return NextResponse.json(
        { error: 'No content available for PDF generation.' },
        { status: 400 }
      )
    }

    const pdfSize = pdfBytes.byteLength

    // Save to download history
    try {
      await db.downloadHistory.create({
        data: {
          url: sourceUrl,
          docId,
          title: title || `Document ${docId}`,
          author: author || null,
          pageCount: pdfDoc_pageCount(pdfBytes),
          thumbnail: thumbnail || null,
          format: 'pdf',
          status: isTextPdf ? 'completed' : 'completed',
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
          sanitizeFilename(title || 'document')
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

// Helper to estimate page count without re-parsing the PDF fully.
// We count "/Type /Page" occurrences in the raw bytes as a rough heuristic.
function pdfDoc_pageCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString('latin1')
  const matches = text.match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : 1
}
