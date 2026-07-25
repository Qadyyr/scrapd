import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - list all history items
export async function GET() {
  try {
    const items = await db.downloadHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load history.', items: [] },
      { status: 500 }
    )
  }
}

// DELETE - delete a single item (with ?id=) or clear all
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (id) {
      await db.downloadHistory.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    // Clear all
    await db.downloadHistory.deleteMany({})
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
