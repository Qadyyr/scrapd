import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const items = await db.downloadHistory.findMany({
      select: { pageCount: true, fileSize: true, format: true, createdAt: true },
    })

    const totalDownloads = items.length
    const totalPages = items.reduce((sum, i) => sum + (i.pageCount || 0), 0)
    const totalSize = items.reduce((sum, i) => sum + (i.fileSize || 0), 0)
    const pdfCount = items.filter((i) => i.format === 'pdf').length
    const zipCount = items.filter((i) => i.format === 'zip').length

    // Last 7 days activity
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recent = items.filter((i) => new Date(i.createdAt) >= sevenDaysAgo)
    const recentCount = recent.length

    // Today's count
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayCount = items.filter(
      (i) => new Date(i.createdAt) >= todayStart
    ).length

    return NextResponse.json({
      totalDownloads,
      totalPages,
      totalSize,
      pdfCount,
      zipCount,
      recentCount,
      todayCount,
    })
  } catch {
    return NextResponse.json(
      {
        totalDownloads: 0,
        totalPages: 0,
        totalSize: 0,
        pdfCount: 0,
        zipCount: 0,
        recentCount: 0,
        todayCount: 0,
      },
      { status: 200 }
    )
  }
}
