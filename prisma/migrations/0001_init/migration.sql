-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EngineProvider" AS ENUM ('VIRUSTOTAL', 'WAYBACK_MACHINE', 'URLSCAN');

-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScanPhase" AS ENUM ('T1_APEX', 'T2_SUBDOMAINS', 'T3_WAYBACK_APEX', 'T4_WAYBACK_SUBDOMAINS', 'T5_CONSOLIDATE', 'T6_ANALYSIS');

-- CreateEnum
CREATE TYPE "DeepScanState" AS ENUM ('SKIPPED', 'PENDING', 'IN_PROGRESS', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('URL_STRING', 'RESPONSE_BODY');

-- CreateTable
CREATE TABLE "target_domain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "domain_normalized" TEXT NOT NULL,
    "notes" TEXT,
    "cached_url_count" INTEGER NOT NULL DEFAULT 0,
    "cached_finding_count" INTEGER NOT NULL DEFAULT 0,
    "cached_subdomain_count" INTEGER NOT NULL DEFAULT 0,
    "cached_ip_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdomain" (
    "id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "hostname_normalized" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "source_flags" JSONB,

    CONSTRAINT "subdomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_job" (
    "id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "status" "ScanJobStatus" NOT NULL,
    "phase" "ScanPhase",
    "progress_current" INTEGER,
    "progress_total" INTEGER,
    "config" JSONB NOT NULL,
    "bullmq_job_id" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observed_subdomain_count" INTEGER,
    "observed_url_count" INTEGER,
    "observed_finding_count" INTEGER,
    "observed_ip_count" INTEGER,
    "observed_version" INTEGER,

    CONSTRAINT "scan_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_category" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "extension_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_suffix_rule" (
    "id" SERIAL NOT NULL,
    "extension_category_id" INTEGER NOT NULL,
    "suffix" TEXT NOT NULL,

    CONSTRAINT "extension_suffix_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_url" (
    "id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "subdomain_id" TEXT,
    "scan_job_id" TEXT,
    "url_text" TEXT NOT NULL,
    "url_sha256" CHAR(64) NOT NULL,
    "engines" "EngineProvider"[],
    "extension_category_id" INTEGER,
    "pathname_extension" TEXT,
    "deep_scan_state" "DeepScanState" NOT NULL DEFAULT 'SKIPPED',
    "fetched_at" TIMESTAMP(3),
    "content_storage_key" TEXT,
    "content_length" BIGINT,
    "external_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovered_url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_finding" (
    "id" TEXT NOT NULL,
    "discovered_url_id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "scan_job_id" TEXT,
    "source" "FindingSource" NOT NULL,
    "finding_type" TEXT NOT NULL,
    "snippet" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_observed_subdomain" (
    "id" TEXT NOT NULL,
    "scan_job_id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "subdomain_id" TEXT,
    "hostname_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_observed_subdomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_observed_url" (
    "id" TEXT NOT NULL,
    "scan_job_id" TEXT NOT NULL,
    "target_domain_id" TEXT NOT NULL,
    "discovered_url_id" TEXT,
    "subdomain_id" TEXT,
    "hostname_normalized" TEXT NOT NULL,
    "url_text" TEXT NOT NULL,
    "url_sha256" CHAR(64) NOT NULL,
    "pathname_extension" TEXT,
    "extension_category_id" INTEGER,
    "engines" "EngineProvider"[] DEFAULT ARRAY[]::"EngineProvider"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_observed_url_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "provider" "EngineProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "proxy_url" TEXT,
    "usage_count_date" DATE NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "usage_week_key" TEXT NOT NULL,
    "usage_count_weekly" INTEGER NOT NULL DEFAULT 0,
    "usage_month_key" TEXT NOT NULL,
    "usage_count_monthly" INTEGER NOT NULL DEFAULT 0,
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_domain_domain_normalized_key" ON "target_domain"("domain_normalized");

-- CreateIndex
CREATE INDEX "subdomain_target_domain_id_idx" ON "subdomain"("target_domain_id");

-- CreateIndex
CREATE UNIQUE INDEX "subdomain_target_domain_id_hostname_normalized_key" ON "subdomain"("target_domain_id", "hostname_normalized");

-- CreateIndex
CREATE INDEX "scan_job_target_domain_id_created_at_idx" ON "scan_job"("target_domain_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_job_status_idx" ON "scan_job"("status");

-- CreateIndex
CREATE UNIQUE INDEX "extension_category_slug_key" ON "extension_category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "extension_suffix_rule_suffix_key" ON "extension_suffix_rule"("suffix");

-- CreateIndex
CREATE INDEX "discovered_url_target_domain_id_created_at_idx" ON "discovered_url"("target_domain_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "discovered_url_subdomain_id_created_at_idx" ON "discovered_url"("subdomain_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "discovered_url_extension_category_id_idx" ON "discovered_url"("extension_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "discovered_url_target_domain_id_url_sha256_key" ON "discovered_url"("target_domain_id", "url_sha256");

-- CreateIndex
CREATE INDEX "analysis_finding_discovered_url_id_idx" ON "analysis_finding"("discovered_url_id");

-- CreateIndex
CREATE INDEX "analysis_finding_target_domain_id_idx" ON "analysis_finding"("target_domain_id");

-- CreateIndex
CREATE INDEX "analysis_finding_target_domain_id_finding_type_idx" ON "analysis_finding"("target_domain_id", "finding_type");

-- CreateIndex
CREATE INDEX "analysis_finding_finding_type_idx" ON "analysis_finding"("finding_type");

-- CreateIndex
CREATE INDEX "analysis_finding_created_at_idx" ON "analysis_finding"("created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_observed_subdomain_target_domain_id_idx" ON "scan_observed_subdomain"("target_domain_id");

-- CreateIndex
CREATE INDEX "scan_observed_subdomain_scan_job_id_idx" ON "scan_observed_subdomain"("scan_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "scan_observed_subdomain_scan_job_id_hostname_normalized_key" ON "scan_observed_subdomain"("scan_job_id", "hostname_normalized");

-- CreateIndex
CREATE INDEX "scan_observed_url_target_domain_id_idx" ON "scan_observed_url"("target_domain_id");

-- CreateIndex
CREATE INDEX "scan_observed_url_scan_job_id_idx" ON "scan_observed_url"("scan_job_id");

-- CreateIndex
CREATE INDEX "scan_observed_url_scan_job_id_hostname_normalized_idx" ON "scan_observed_url"("scan_job_id", "hostname_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "scan_observed_url_scan_job_id_url_sha256_key" ON "scan_observed_url"("scan_job_id", "url_sha256");

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

-- CreateIndex
CREATE INDEX "api_key_provider_is_disabled_idx" ON "api_key"("provider", "is_disabled");

-- AddForeignKey
ALTER TABLE "subdomain" ADD CONSTRAINT "subdomain_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_job" ADD CONSTRAINT "scan_job_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_suffix_rule" ADD CONSTRAINT "extension_suffix_rule_extension_category_id_fkey" FOREIGN KEY ("extension_category_id") REFERENCES "extension_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_url" ADD CONSTRAINT "discovered_url_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_url" ADD CONSTRAINT "discovered_url_subdomain_id_fkey" FOREIGN KEY ("subdomain_id") REFERENCES "subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_url" ADD CONSTRAINT "discovered_url_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_url" ADD CONSTRAINT "discovered_url_extension_category_id_fkey" FOREIGN KEY ("extension_category_id") REFERENCES "extension_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_finding" ADD CONSTRAINT "analysis_finding_discovered_url_id_fkey" FOREIGN KEY ("discovered_url_id") REFERENCES "discovered_url"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_finding" ADD CONSTRAINT "analysis_finding_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_finding" ADD CONSTRAINT "analysis_finding_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_subdomain" ADD CONSTRAINT "scan_observed_subdomain_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_subdomain" ADD CONSTRAINT "scan_observed_subdomain_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_subdomain" ADD CONSTRAINT "scan_observed_subdomain_subdomain_id_fkey" FOREIGN KEY ("subdomain_id") REFERENCES "subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_url" ADD CONSTRAINT "scan_observed_url_scan_job_id_fkey" FOREIGN KEY ("scan_job_id") REFERENCES "scan_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_url" ADD CONSTRAINT "scan_observed_url_target_domain_id_fkey" FOREIGN KEY ("target_domain_id") REFERENCES "target_domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_url" ADD CONSTRAINT "scan_observed_url_discovered_url_id_fkey" FOREIGN KEY ("discovered_url_id") REFERENCES "discovered_url"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_url" ADD CONSTRAINT "scan_observed_url_subdomain_id_fkey" FOREIGN KEY ("subdomain_id") REFERENCES "subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_observed_url" ADD CONSTRAINT "scan_observed_url_extension_category_id_fkey" FOREIGN KEY ("extension_category_id") REFERENCES "extension_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

