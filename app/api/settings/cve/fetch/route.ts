import { NextResponse } from "next/server";
import { z } from "zod";
import { CveFetchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNvdApiKey } from "@/lib/nvd-key";
import { getCveFetchQueue } from "@/lib/queue";
import { resolveStartDate, type CveFetchRange } from "@/lib/cve-fetch";

const bodySchema = z.object({
  range: z.enum(["7d", "30d", "6mo", "1y", "custom"]),
  customStart: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Guard: don't start a second fetch while one is running.
  const state = await prisma.cveFetchState.findUnique({ where: { id: "singleton" } });
  if (state?.status === CveFetchStatus.RUNNING) {
    return NextResponse.json({ error: "A CVE fetch is already running." }, { status: 409 });
  }

  const apiKey = await getNvdApiKey(prisma);
  const proxyRow = await prisma.appSetting.findUnique({ where: { key: "global_proxy_url" } });
  const proxyUrl = (proxyRow?.value as { url?: string | null } | undefined)?.url ?? null;

  const range = parsed.data.range as CveFetchRange;
  const customStart = parsed.data.customStart ? new Date(parsed.data.customStart) : null;
  const startDate = resolveStartDate(range, customStart);

  // Mark RUNNING immediately so the UI reflects state before the worker picks up.
  await prisma.cveFetchState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", status: CveFetchStatus.RUNNING, progressCurrent: 0, progressTotal: 0 },
    update: { status: CveFetchStatus.RUNNING, errorMessage: null, progressCurrent: 0, progressTotal: 0 },
  });

  const queue = getCveFetchQueue();
  await queue.add("cve-fetch", {
    apiKey,
    startDate: startDate.toISOString(),
    proxyUrl,
  });

  return NextResponse.json({ ok: true, startDate: startDate.toISOString() });
}
