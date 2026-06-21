import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setNvdApiKey, hasNvdApiKey } from "@/lib/nvd-key";
import { getCveFetchState } from "@/lib/cve-fetch";

const bodySchema = z.object({
  apiKey: z.preprocess((v) => (v === "" ? null : v), z.union([z.string().min(20).max(200), z.null()])),
});

export async function GET() {
  const [state, keyPresent, oldest] = await Promise.all([
    getCveFetchState(prisma),
    hasNvdApiKey(prisma),
    prisma.cve.findFirst({ orderBy: { published: "asc" }, select: { published: true } }),
  ]);
  return NextResponse.json({
    hasApiKey: keyPresent,
    status: state.status,
    coveredUntil: state.coveredUntil?.toISOString() ?? null,
    oldestPublished: oldest?.published.toISOString() ?? null,
    lastFetchedAt: state.lastFetchedAt?.toISOString() ?? null,
    totalStored: state.totalStored,
    progressCurrent: state.progressCurrent,
    progressTotal: state.progressTotal,
    errorMessage: state.errorMessage,
  });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  await setNvdApiKey(prisma, parsed.data.apiKey);
  return NextResponse.json({ ok: true, hasApiKey: Boolean(parsed.data.apiKey) });
}
