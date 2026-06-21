import { NextResponse } from "next/server";
import { EngineProvider } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptSecretWithKey } from "@/lib/encryption";
import { resolveAppEncryptionKey } from "@/lib/app-encryption";
import { utcDateOnly, currentIsoWeekKey, currentMonthKey, resolveUsageCounters } from "@/lib/quota-constants";

const createSchema = z.object({
  provider: z.nativeEnum(EngineProvider).default(EngineProvider.VIRUSTOTAL),
  label: z.string().min(1).max(120),
  secret: z.string().min(16).max(512),
  proxyUrl: z.preprocess((v) => (v === "" ? null : v), z.union([z.string().url(), z.null()]).optional()),
});

function mask(s: string) {
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export async function GET() {
  // NVD (CVE_MATCH) credentials are managed in the dedicated CVE settings card,
  // so this VirusTotal-oriented list excludes them.
  const keys = await prisma.apiKey.findMany({
    where: { provider: EngineProvider.VIRUSTOTAL },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    keys: keys.map((k) => {
      const usage = resolveUsageCounters(k);
      return {
        id: k.id,
        provider: k.provider,
        label: k.label,
        proxyUrl: k.proxyUrl,
        usageCountDate: k.usageCountDate,
        usageCount: usage.daily,
        usageCountWeekly: usage.weekly,
        usageCountMonthly: usage.monthly,
        isDisabled: k.isDisabled,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
        secretMasked: "(encrypted)",
      };
    }),
  });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  let secretEncrypted: string;
  try {
    const key = await resolveAppEncryptionKey(prisma);
    secretEncrypted = encryptSecretWithKey(key, parsed.data.secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Encryption failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const today = utcDateOnly(new Date());
  const weekKey = currentIsoWeekKey();
  const monthKey = currentMonthKey();
  const created = await prisma.apiKey.create({
    data: {
      provider: parsed.data.provider,
      label: parsed.data.label,
      secretEncrypted,
      proxyUrl: parsed.data.proxyUrl ?? null,
      usageCountDate: today,
      usageCount: 0,
      usageWeekKey: weekKey,
      usageCountWeekly: 0,
      usageMonthKey: monthKey,
      usageCountMonthly: 0,
      isDisabled: false,
    },
  });

  return NextResponse.json({
    key: {
      id: created.id,
      label: created.label,
      provider: created.provider,
      secretMasked: mask(parsed.data.secret),
    },
  });
}
