import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET - list all history items (optionally filter by favorite)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const favoritesOnly = searchParams.get('favorites') === 'true'

    // Use raw SQL when filtering by favorite, since the Prisma client
    // may be cached from a previous schema version without the field.
    if (favoritesOnly) {
      const rows = await db.$queryRaw<
        Array<Record<string, unknown>>
      >`SELECT * FROM DownloadHistory WHERE favorite = 1 ORDER BY createdAt DESC LIMIT 100`
      return NextResponse.json({ items: rows })
    }

    const items = await db.downloadHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ items })
  } catch {
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

    await db.downloadHistory.deleteMany({})
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH - toggle favorite on an item (uses raw SQL for schema-version safety)
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const favorite: boolean = Boolean(body.favorite)

    await db.$executeRaw`UPDATE DownloadHistory SET favorite = ${favorite ? 1 : 0} WHERE id = ${id}`

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
