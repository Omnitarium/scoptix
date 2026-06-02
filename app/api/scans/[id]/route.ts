import { NextResponse } from "next/server";
import { ScanDeleteError, deleteScanJobs } from "@/lib/scan-delete";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scan = await prisma.scanJob.findUnique({
    where: { id },
    include: { targetDomain: true },
  });
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ scan });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const result = await deleteScanJobs(prisma, [id]);
    return NextResponse.json({
      ok: true,
      deleted: result.deletedIds.length,
      deletedIds: result.deletedIds,
    });
  } catch (error) {
    if (error instanceof ScanDeleteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
