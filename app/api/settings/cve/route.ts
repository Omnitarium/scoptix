import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setNvdApiKey, hasNvdApiKey } from "@/lib/nvd-key";
import { getCveFetchState } from "@/lib/cve-fetch";
import { verifyNvdApiKey } from "@/engines/nvd";

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

  // Verify against NVD before storing: a wrong key (e.g. an NVIDIA "nvapi-…"
  // key pasted by mistake) otherwise fails much later as an opaque 404.
  if (parsed.data.apiKey) {
    const proxyRow = await prisma.appSetting.findUnique({ where: { key: "global_proxy_url" } });
    const proxyUrl = (proxyRow?.value as { url?: string | null } | undefined)?.url ?? null;
    const check = await verifyNvdApiKey(parsed.data.apiKey, proxyUrl);
    if (!check.ok) {
      return NextResponse.json(
        { error: `NVD rejected this API key: ${check.message ?? "unknown reason"}` },
        { status: 400 },
      );
    }
  }

  await setNvdApiKey(prisma, parsed.data.apiKey);
  return NextResponse.json({ ok: true, hasApiKey: Boolean(parsed.data.apiKey) });
}
