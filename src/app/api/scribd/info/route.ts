import { NextRequest, NextResponse } from 'next/server'
import { fetchRealScribdDocInfo, generateDemoDocInfo } from '@/lib/scribd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const url: string = body.url
    const forceDemo: boolean = body.demo === true

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'A "url" field is required.' },
        { status: 400 }
      )
    }

    if (!url.includes('scribd.com')) {
      return NextResponse.json(
        { error: 'Please provide a valid Scribd URL.' },
        { status: 400 }
      )
    }

    // If demo mode is explicitly requested, return demo data
    if (forceDemo) {
      const demo = generateDemoDocInfo(url)
      return NextResponse.json({ ...demo, isDemo: true })
    }

    // --- REAL FETCH via fetchScribdHtml (tries CF Worker → z-ai → direct) ---
    try {
      const info = await fetchRealScribdDocInfo(url)

      // If we got real text content or page images, this is a successful fetch
      if (
        (info.textContent && info.textContent.length > 100) ||
        (info.pageImages && info.pageImages.length > 0)
      ) {
        return NextResponse.json({ ...info, warning: undefined })
      }

      // If no content but we have metadata, return with a warning
      if (info.title) {
        return NextResponse.json({
          ...info,
          warning:
            'Document metadata was retrieved, but no readable text or page images could be extracted. This document may be behind a paywall.',
        })
      }

      throw new Error('No usable content returned.')
    } catch (fetchErr) {
      // Server-side fetch failed (Cloudflare blocked it).
      // Return a clear status so the frontend can show the bookmarklet option.
      const errMsg =
        fetchErr instanceof Error ? fetchErr.message : 'Unknown error'

      return NextResponse.json(
        {
          needsBrowserExtract: true,
          error: errMsg,
          url,
        },
        { status: 200 }
      )
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to fetch document info.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
