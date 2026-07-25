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
 * Set of Unicode code points encodable by pdf-lib's WinAnsi encoding
 * (used by StandardFonts like Helvetica). Anything outside this set is
 * replaced with the closest ASCII equivalent or '?' to avoid the
 * "WinAnsi cannot encode" runtime error.
 *
 * Reference: PDF 1.7 Annex D, WinAnsiEncoding table.
 */
const WIN_ANSI_CODEPOINTS: Set<number> = new Set<number>([
  // Printable ASCII (0x20-0x7E) and Latin-1 supplement (0xA0-0xFF)
  // are all included via the range check below.
  // Extended WinAnsi-specific characters:
  0x20ac, // €
  0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153,
  0x017e, 0x0178,
])

/**
 * Common Unicode → ASCII replacements for characters outside WinAnsi.
 * Keys are code points; values are the ASCII substitute string.
 */
const UNICODE_ASCII_FALLBACK: Record<number, string> = {
  0x2010: '-', // hyphen
  0x2011: '-', // non-breaking hyphen
  0x2012: '-', // figure dash
  0x2015: '—', // horizontal bar → use em-dash (which IS in WinAnsi)
  0x202f: ' ', // narrow no-break space
  0x205f: ' ', // medium mathematical space
  0x2000: ' ', // en quad
  0x2001: ' ', // em quad
  0x2002: ' ', // en space
  0x2003: ' ', // em space
  0x2004: ' ', // three-per-em space
  0x2005: ' ', // four-per-em space
  0x2006: ' ', // six-per-em space
  0x2007: ' ', // figure space
  0x2008: ' ', // punctuation space
  0x2009: ' ', // thin space
  0x200a: ' ', // hair space
  0x00a0: ' ', // no-break space
  0x00ad: '', // soft hyphen (drop)
  0x2028: '\n', // line separator
  0x2029: '\n', // paragraph separator
  0x00b7: '·', // middle dot (in Latin-1, keep)
  0x2024: '.', // one dot leader
  0x2025: '..', // two dot leader
  0x201a: ',', // single low-9 quote
  0x2032: "'", // prime
  0x2033: '"', // double prime
  0x02b3: 'r', // modifier letter small r
  0x02b2: 'l', // modifier letter small l
  0x02b0: 'h', // modifier letter small h
  0x02b1: 'H',
  0x02b4: 'j',
  0x02b5: 'r',
  0x02b6: 'R',
  0x02b7: 'w',
  0x02b8: 'y',
  0x02e0: 'g',
  0x02e1: 'l',
  0x02e2: 's',
  0x02e3: 'x',
  0x02c0: 'B',
  0x02c1: 'B',
  0x2070: '0',
  0x2071: 'i',
  0x2074: '4',
  0x2075: '5',
  0x2076: '6',
  0x2077: '7',
  0x2078: '8',
  0x2079: '9',
  0x2080: '0',
  0x2081: '1',
  0x2082: '2',
  0x2083: '3',
  0x2084: '4',
  0x2085: '5',
  0x2086: '6',
  0x2087: '7',
  0x2088: '8',
  0x2089: '9',
  0x2190: '<-', // leftwards arrow
  0x2192: '->', // rightwards arrow
  0x2194: '<->', // left right arrow
  0x21d2: '=>', // rightwards double arrow
  0x21d0: '<=', // leftwards double arrow
  0x21d4: '<=>', // left right double arrow
  0x2020: '+', // dagger
  0x2021: '++', // double dagger
  0x00b0: '°', // degree (in Latin-1)
  0x2212: '-', // minus sign
  0x2215: '/', // division slash
  0x2216: '\\', // set minus
  0x2217: '*', // asterisk operator
  0x2218: 'o', // ring operator
  0x2219: '*', // bullet operator
  0x2236: ':', // ratio
  0x223c: '~', // tilde operator
  0x2248: '~=', // almost equal to
  0x2260: '!=', // not equal to
  0x2261: '==', // identical to
  0x2264: '<=', // less-than or equal to
  0x2265: '>=', // greater-than or equal to
  0x00d7: 'x', // multiplication sign (in Latin-1, but x is safer)
  0x00f7: '/', // division sign (in Latin-1, but / is safer)
  0x2191: '^',
  0x2193: 'v',
  0x25a0: '#', // black square
  0x25a1: '#', // white square
  0x25cb: 'o', // white circle
  0x25cf: '*', // black circle
  0x25b2: '^', // black up-pointing triangle
  0x25bc: 'v', // black down-pointing triangle
  0x2197: '/', // north east arrow
  0x2198: '\\', // south east arrow
  0x2199: '\\', // south west arrow
  0x2196: '/', // north west arrow
}

/**
 * Sanitize a string so that every remaining character can be encoded by
 * pdf-lib's WinAnsi encoding (used by StandardFonts).
 *
 * Strategy:
 *  1. Replace common Unicode characters with ASCII equivalents.
 *  2. Keep any character already in the WinAnsi set (ASCII + Latin-1 + extras).
 *  3. Replace anything else with '?' so the text stays readable and the PDF
 *     still generates.
 */
function sanitizeForWinAnsi(text: string): string {
  if (!text) return ''
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    // Fast path: printable ASCII (0x20-0x7E) — always safe
    if (cp >= 0x20 && cp <= 0x7e) {
      out += ch
      continue
    }
    // Latin-1 supplement (0xA0-0xFF) — safe in WinAnsi
    if (cp >= 0xa0 && cp <= 0xff) {
      out += ch
      continue
    }
    // Known WinAnsi extended chars (smart quotes, em-dash, bullet, etc.)
    if (WIN_ANSI_CODEPOINTS.has(cp)) {
      out += ch
      continue
    }
    // Newlines / tabs — keep
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) {
      out += ch
      continue
    }
    // Try the fallback map
    if (cp in UNICODE_ASCII_FALLBACK) {
      out += UNICODE_ASCII_FALLBACK[cp]
      continue
    }
    // Decompose accented chars (NFD) and keep the base ASCII letter
    const decomposed = ch.normalize('NFD')
    let kept = ''
    let replaced = false
    for (const d of decomposed) {
      const dcp = d.codePointAt(0) ?? 0
      if (dcp >= 0x20 && dcp <= 0x7e) {
        kept += d
      } else if (dcp >= 0xa0 && dcp <= 0xff) {
        kept += d
      } else if (WIN_ANSI_CODEPOINTS.has(dcp)) {
        kept += d
      }
      // skip combining marks that fall outside WinAnsi
      replaced = true
    }
    if (kept) {
      out += kept
    } else {
      // Last resort: replace with '?'
      out += '?'
      void replaced
    }
  }
  return out
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
  // Sanitize ALL text up-front so no WinAnsi-incompatible characters ever
  // reach pdf-lib's drawText (which throws on unencodable chars).
  const title = sanitizeForWinAnsi(params.title || 'Scribd Document')
  const author = params.author ? sanitizeForWinAnsi(params.author) : null
  const description = params.description
    ? sanitizeForWinAnsi(params.description)
    : null
  const textContent = sanitizeForWinAnsi(params.textContent || '')
  const sourceUrl = params.sourceUrl

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(sanitizeForWinAnsi(params.title || 'Scribd Document'))
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
    // Safety net: ensure the text is WinAnsi-safe even if the caller
    // forgot to sanitize (defensive against future regressions).
    const safeText = sanitizeForWinAnsi(text)
    const words = safeText.split(/\s+/).filter(Boolean)
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
  const footerText = sanitizeForWinAnsi(
    `Downloaded from Scribd via Scribd Downloader • ${new Date().toLocaleDateString(
      'en-US'
    )}`
  )
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
