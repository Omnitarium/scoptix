import { EngineProvider, type PrismaClient } from "@prisma/client";
import { encryptSecretWithKey, decryptSecretWithKey } from "@/lib/encryption";
import { resolveAppEncryptionKey } from "@/lib/app-encryption";
import { utcDateOnly, currentIsoWeekKey, currentMonthKey } from "@/lib/quota-constants";

/**
 * The NVD API key is stored as a single ApiKey row under provider CVE_MATCH,
 * consistent with how every other engine credential is persisted (encrypted
 * secret + app encryption key). NVD needs only one global key, so we keep a
 * single row and replace it on save.
 */
const PROVIDER = EngineProvider.CVE_MATCH;
const LABEL = "NVD API key";

export async function setNvdApiKey(prisma: PrismaClient, plain: string | null) {
  // Always clear the existing key first (single-row semantics).
  await prisma.apiKey.deleteMany({ where: { provider: PROVIDER } });
  if (!plain) return;

  const key = await resolveAppEncryptionKey(prisma);
  const secretEncrypted = encryptSecretWithKey(key, plain);
  await prisma.apiKey.create({
    data: {
      provider: PROVIDER,
      label: LABEL,
      secretEncrypted,
      proxyUrl: null,
      usageCountDate: utcDateOnly(new Date()),
      usageCount: 0,
      usageWeekKey: currentIsoWeekKey(),
      usageCountWeekly: 0,
      usageMonthKey: currentMonthKey(),
      usageCountMonthly: 0,
      isDisabled: false,
    },
  });
}

export async function getNvdApiKey(prisma: PrismaClient): Promise<string | null> {
  const row = await prisma.apiKey.findFirst({
    where: { provider: PROVIDER, isDisabled: false },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  try {
    const key = await resolveAppEncryptionKey(prisma);
    return decryptSecretWithKey(key, row.secretEncrypted);
  } catch {
    return null;
  }
}

export async function hasNvdApiKey(prisma: PrismaClient): Promise<boolean> {
  const count = await prisma.apiKey.count({
    where: { provider: PROVIDER, isDisabled: false },
  });
  return count > 0;
}
