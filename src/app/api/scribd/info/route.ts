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

    // --- Strategy 1: z-ai page_reader (works in z.ai sandbox) ---
    try {
      const info = await fetchRealScribdDocInfo(url)

      if (info.textContent && info.textContent.length > 100) {
        return NextResponse.json({ ...info, warning: undefined })
      }

      if (info.title && (info.pageImages?.length || 0) > 0) {
        return NextResponse.json({ ...info, warning: undefined })
      }

      if (info.title) {
        return NextResponse.json({
          ...info,
          warning:
            'Document metadata was retrieved, but no readable text content could be extracted. This document may be image-only or behind a paywall.',
        })
      }

      throw new Error('No usable content returned from the page reader.')
    } catch (zaiErr) {
      // z-ai SDK failed (expected on Vercel — internal API not reachable).
      // Try the Edge Function fallback.
      const zaiErrMsg =
        zaiErr instanceof Error ? zaiErr.message : 'Unknown error'

      // --- Strategy 2: Edge Function direct fetch (works on Vercel) ---
      try {
        const edgeRes = await fetch(
          new URL('/api/scribd/edge-fetch', req.url).toString(),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          }
        )

        if (edgeRes.ok) {
          const edgeData = await edgeRes.json()
          if (
            edgeData &&
            (edgeData.textContent || edgeData.pageImages?.length > 0)
          ) {
            return NextResponse.json({
              ...edgeData,
              warning: undefined,
            })
          }
        }

        // Edge fetch also failed — fall through to demo
        throw new Error('Edge fetch returned no content')
      } catch (edgeErr) {
        // --- Strategy 3: Fall back to demo data ---
        const edgeErrMsg =
          edgeErr instanceof Error ? edgeErr.message : 'Unknown error'
        const demo = generateDemoDocInfo(url)
        return NextResponse.json(
          {
            ...demo,
            isDemo: true,
            warning: `Live fetch failed (z-ai: ${zaiErrMsg}; edge: ${edgeErrMsg}). Showing demo data. On Vercel Hobby, the 10s function timeout may prevent real fetches — consider upgrading to Pro or deploying on a platform without Cloudflare restrictions.`,
          },
          { status: 200 }
        )
      }
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to fetch document info.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
