-- AlterTable
ALTER TABLE "api_key" ALTER COLUMN "usage_week_key" DROP DEFAULT,
ALTER COLUMN "usage_month_key" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scan_job" ADD COLUMN     "observed_ip_count" INTEGER;

-- AlterTable
ALTER TABLE "target_domain" ADD COLUMN     "cached_ip_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ip_resolution" (
    "id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "latest_resolved_at" TIMESTAMP(3) NOT NULL,
    "latest_seen_by" TEXT NOT NULL,
    "hostname_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_resolution_sighting" (
    "id" TEXT NOT NULL,
    "ip_resolution_id" TEXT NOT NULL,
    "scan_job_id" TEXT,
    "hostname_normalized" TEXT NOT NULL,
    "last_resolved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_resolution_sighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_observed_ip_resolution" (
    "id" TEXT NOT NULL,
    "scan_job_id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "ip_resolution_id" TEXT,
    "ip_address" TEXT NOT NULL,
    "last_resolved_at" TIMESTAMP(3) NOT NULL,
    "reported_by_hostname" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_observed_ip_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ip_resolution_target_domain_id_latest_resolved_at_idx" ON "ip_resolution"("target_domain_id", "latest_resolved_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ip_resolution_target_domain_id_ip_address_key" ON "ip_resolution"("target_domain_id", "ip_address");

-- CreateIndex
CREATE INDEX "ip_resolution_sighting_ip_resolution_id_idx" ON "ip_resolution_sighting"("ip_resolution_id");

-- CreateIndex
CREATE UNIQUE INDEX "ip_resolution_sighting_ip_resolution_id_hostname_normalized_key" ON "ip_resolution_sighting"("ip_resolution_id", "hostname_normalized");

-- CreateIndex
CREATE INDEX "scan_observed_ip_resolution_target_domain_id_idx" ON "scan_observed_ip_resolution"("target_domain_id");

-- CreateIndex
CREATE INDEX "scan_observed_ip_resolution_scan_job_id_idx" ON "scan_observed_ip_resolution"("scan_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "scan_observed_ip_resolution_scan_job_id_ip_address_key" ON "scan_observed_ip_resolution"("scan_job_id", "ip_address");

-- AddForeignKey
ALTER TABLE "ip_resolution" ADD CONSTRAINT "ip_resolution_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_resolution_sighting" ADD CONSTRAINT "ip_resolution_sighting_ip_resolution_id_fkey" FOREIGN KEY ("ip_resolution_id") REFERENCES "ip_resolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_resolution_sighting" ADD CONSTRAINT "ip_resolution_sighting_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_ip_resolution" ADD CONSTRAINT "scan_observed_ip_resolution_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_ip_resolution" ADD CONSTRAINT "scan_observed_ip_resolution_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_ip_resolution" ADD CONSTRAINT "scan_observed_ip_resolution_ip_resolution_id_fkey" FOREIGN KEY ("ip_resolution_id") REFERENCES "ip_resolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
