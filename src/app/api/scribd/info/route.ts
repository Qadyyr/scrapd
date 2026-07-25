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
      // Fall back to demo data with a helpful message
      const demo = generateDemoDocInfo(url)
      const errMsg =
        fetchErr instanceof Error ? fetchErr.message : 'Unknown error'

      // Check if CF_WORKER_URL is configured and provide appropriate guidance
      const hasWorker = !!process.env.CF_WORKER_URL
      const guidance = hasWorker
        ? `Live fetch failed (${errMsg}). Check that your Cloudflare Worker is deployed and accessible.`
        : `Live fetch failed (${errMsg}). To enable real downloads on Vercel: deploy the Cloudflare Worker from the cloudflare-worker/ directory (npx wrangler deploy) and set the CF_WORKER_URL environment variable to the worker URL. See cloudflare-worker/README.md for instructions.`

      return NextResponse.json(
        {
          ...demo,
          isDemo: true,
          warning: guidance,
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
