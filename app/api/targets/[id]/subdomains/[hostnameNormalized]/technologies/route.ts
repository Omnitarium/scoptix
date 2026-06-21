import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; hostnameNormalized: string }> },
) {
  try {
    const { id, hostnameNormalized } = await params;
    const targetDomainId = id;

    const subdomain = await prisma.subdomain.findFirst({
      where: { targetDomainId, hostnameNormalized },
      select: { id: true },
    });

    if (!subdomain) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const techs = await prisma.subdomainTechnology.findMany({
      where: { subdomainId: subdomain.id },
      orderBy: [{ confidence: "desc" }, { name: "asc" }],
      select: {
        name: true,
        version: true,
        categories: true,
        confidence: true,
        iconName: true,
        website: true,
        cpe: true,
        lastSeenAt: true,
        cveMatches: {
          select: {
            cveId: true,
            matchedVersion: true,
            cve: { select: { cvssSeverity: true, cvssScore: true } },
          },
          orderBy: { cve: { cvssScore: "desc" } },
          take: 100,
        },
      },
    });

    return NextResponse.json({
      targetDomainId,
      hostnameNormalized,
      summary: { technologyCount: techs.length },
      technologies: techs.map((t) => ({
        name: t.name,
        version: t.version,
        categories: t.categories,
        confidence: t.confidence,
        iconName: t.iconName,
        website: t.website,
        cpe: t.cpe,
        lastSeenAt: t.lastSeenAt.toISOString(),
        cves: t.cveMatches.map((m) => ({
          cveId: m.cveId,
          severity: m.cve.cvssSeverity,
          score: m.cve.cvssScore,
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching subdomain technologies:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
