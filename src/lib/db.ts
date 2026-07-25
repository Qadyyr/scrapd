import { PrismaClient } from '@prisma/client'

// Use a versioned global key to bust any cached PrismaClient instances
// from previous schema versions. Bump this version after every db:push.
const SCHEMA_VERSION = 'v2'

const globalKey = `__prisma_${SCHEMA_VERSION}` as keyof typeof globalThis

const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>

export const db =
  globalForPrisma[globalKey] ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma[globalKey] = db
}
