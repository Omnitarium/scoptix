import { EngineProvider } from "@prisma/client";

type ScanConfigLike = {
  enginesEnabled?: EngineProvider[];
};

export function parseScanEnginesEnabled(config: unknown): EngineProvider[] {
  const engines = (config as ScanConfigLike | null)?.enginesEnabled;
  if (Array.isArray(engines) && engines.length > 0) {
    return engines;
  }
  return [EngineProvider.VIRUSTOTAL];
}

/**
 * Engines to show for an observed-scan URL: snapshot tags first, else tags on the
 * canonical URL limited to engines enabled for this scan (never other scans' engines).
 */
export function enginesObservedInScan(
  snapshotEngines: EngineProvider[] | null | undefined,
  discoveredEngines: EngineProvider[] | null | undefined,
  enabledEngines: EngineProvider[],
): EngineProvider[] {
  const enabled = new Set(enabledEngines);

  if (snapshotEngines && snapshotEngines.length > 0) {
    return snapshotEngines.filter((e) => enabled.has(e));
  }

  const fromDiscovered = (discoveredEngines ?? []).filter((e) => enabled.has(e));
  if (fromDiscovered.length > 0) {
    return fromDiscovered;
  }

  return enabledEngines.length === 1 ? [...enabledEngines] : [];
}

export function formatEngineLabel(engine: string) {
  if (engine === "VIRUSTOTAL") return "VirusTotal";
  if (engine === "WAYBACK_MACHINE") return "Wayback Machine";
  if (engine === "URLSCAN") return "URLScan";
  return engine;
}

export function formatEnginesLabel(
  snapshotEngines: EngineProvider[] | null | undefined,
  discoveredEngines: EngineProvider[] | null | undefined,
  enabledEngines: EngineProvider[],
): string {
  return enginesObservedInScan(snapshotEngines, discoveredEngines, enabledEngines)
    .map((e) => formatEngineLabel(e))
    .join(", ");
}
