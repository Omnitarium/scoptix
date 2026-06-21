import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";

export const SCAN_QUEUE_NAME = "recon-scan";
export const CVE_FETCH_QUEUE_NAME = "recon-cve-fetch";

export function getScanQueue() {
  const connection = getRedis();
  return new Queue(SCAN_QUEUE_NAME, { connection });
}

export function getCveFetchQueue() {
  const connection = getRedis();
  return new Queue(CVE_FETCH_QUEUE_NAME, { connection });
}
