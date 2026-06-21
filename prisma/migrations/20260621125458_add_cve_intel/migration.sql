-- CreateEnum
CREATE TYPE "CveFetchStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "EngineProvider" ADD VALUE 'CVE_MATCH';

-- AlterEnum
ALTER TYPE "ScanPhase" ADD VALUE 'T5C_CVE_MATCH';

-- CreateTable
CREATE TABLE "cve" (
    "id" TEXT NOT NULL,
    "published" TIMESTAMP(3) NOT NULL,
    "last_modified" TIMESTAMP(3) NOT NULL,
    "cvss_score" DOUBLE PRECISION,
    "cvss_severity" TEXT,
    "cvss_vector" TEXT,
    "description" TEXT NOT NULL,
    "cpe_products" TEXT[],
    "cpe_configs" JSONB NOT NULL,
    "references" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cve_fetch_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "status" "CveFetchStatus" NOT NULL DEFAULT 'IDLE',
    "covered_until" TIMESTAMP(3),
    "last_fetched_at" TIMESTAMP(3),
    "total_stored" INTEGER NOT NULL DEFAULT 0,
    "progress_current" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cve_fetch_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdomain_technology_cve" (
    "id" TEXT NOT NULL,
    "subdomain_technology_id" TEXT NOT NULL,
    "cve_id" TEXT NOT NULL,
    "scan_job_id" TEXT,
    "matched_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subdomain_technology_cve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cve_published_idx" ON "cve"("published" DESC);

-- CreateIndex
CREATE INDEX "cve_cvss_severity_idx" ON "cve"("cvss_severity");

-- CreateIndex
CREATE INDEX "cve_cvss_score_idx" ON "cve"("cvss_score");

-- CreateIndex
CREATE INDEX "subdomain_technology_cve_cve_id_idx" ON "subdomain_technology_cve"("cve_id");

-- CreateIndex
CREATE INDEX "subdomain_technology_cve_scan_job_id_idx" ON "subdomain_technology_cve"("scan_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "subdomain_technology_cve_subdomain_technology_id_cve_id_key" ON "subdomain_technology_cve"("subdomain_technology_id", "cve_id");

-- AddForeignKey
ALTER TABLE "subdomain_technology_cve" ADD CONSTRAINT "subdomain_technology_cve_subdomain_technology_id_fkey" FOREIGN KEY ("subdomain_technology_id") REFERENCES "subdomain_technology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subdomain_technology_cve" ADD CONSTRAINT "subdomain_technology_cve_cve_id_fkey" FOREIGN KEY ("cve_id") REFERENCES "cve"("id") ON DELETE CASCADE ON UPDATE CASCADE;
