import { NextRequest, NextResponse } from 'next/server'
import { fetchRealScribdDocInfo, generateDemoDocInfo } from '@/lib/scribd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

    // --- REAL FETCH via z-ai page_reader (bypasses Cloudflare) ---
    try {
      const info = await fetchRealScribdDocInfo(url)

      // If we got real text content, this is a successful live fetch.
      if (info.textContent && info.textContent.length > 100) {
        return NextResponse.json({
          ...info,
          warning: undefined,
        })
      }

      // If no text content but we have metadata, return with a warning
      if (info.title) {
        return NextResponse.json({
          ...info,
          warning:
            'Document metadata was retrieved, but no readable text content could be extracted. This document may be image-only or behind a paywall. Download will produce a minimal PDF.',
        })
      }

      throw new Error('No usable content returned from the page reader.')
    } catch (fetchErr) {
      // Last-resort fallback to demo data
      const demo = generateDemoDocInfo(url)
      const errMsg =
        fetchErr instanceof Error ? fetchErr.message : 'Unknown error'
      return NextResponse.json(
        {
          ...demo,
          isDemo: true,
          warning: `Live fetch failed (${errMsg}). Showing demo data with placeholder content so you can preview the download flow.`,
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
