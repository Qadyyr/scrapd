import { NextRequest, NextResponse } from 'next/server'
import { fetchScribdDocInfo, generateDemoDocInfo } from '@/lib/scribd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    try {
      const info = await fetchScribdDocInfo(url)

      if (info.pages.length === 0) {
        return NextResponse.json(
          {
            ...info,
            warning:
              'No page images could be extracted. This document may be behind a paywall, require login, or use protected rendering that prevents image extraction.',
          },
          { status: 200 }
        )
      }

      return NextResponse.json(info)
    } catch (fetchErr) {
      // If the real fetch fails (e.g. Cloudflare blocking), fall back to demo data
      // so the user can still experience the UI flow.
      const demo = generateDemoDocInfo(url)
      const errMsg =
        fetchErr instanceof Error ? fetchErr.message : 'Unknown error'
      return NextResponse.json(
        {
          ...demo,
          isDemo: true,
          warning: `Live fetch failed (${errMsg}). Showing demo data with placeholder images so you can preview the download flow.`,
        },
        { status: 200 }
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch document info.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
