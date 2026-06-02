import { NextResponse } from "next/server";
import { z } from "zod";
import { ScanDeleteError, deleteScanJobs } from "@/lib/scan-delete";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await deleteScanJobs(prisma, parsed.data.ids);
    return NextResponse.json({
      ok: true,
      deleted: result.deletedIds.length,
      deletedIds: result.deletedIds,
      missingIds: result.missingIds,
    });
  } catch (error) {
    if (error instanceof ScanDeleteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
