import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ipResolution = await prisma.ipResolution.findUnique({
      where: { id },
      select: {
        ipAddress: true,
        sightings: {
          select: {
            hostnameNormalized: true,
            lastResolvedAt: true,
          },
          orderBy: { lastResolvedAt: "desc" },
        },
      },
    });

    if (!ipResolution) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ipAddress: ipResolution.ipAddress,
      sightings: ipResolution.sightings,
    });
  } catch (error) {
    console.error("Error fetching IP sightings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
