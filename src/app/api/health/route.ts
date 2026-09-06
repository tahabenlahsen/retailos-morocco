import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok", database: "ok", timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 })
  }
}
