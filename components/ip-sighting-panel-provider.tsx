"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { IpSightingPanel } from "@/components/ip-sighting-panel";

export type OpenIpPanelOptions = {
  /** When set, panel sightings are limited to this observed scan. */
  scanJobId?: string;
};

type IpSightingPanelContextValue = {
  ipResolutionId: string | null;
  openIpPanel: (id: string, options?: OpenIpPanelOptions) => void;
  closeIpPanel: () => void;
};

const IpSightingPanelContext = createContext<IpSightingPanelContextValue | null>(null);

export function IpSightingPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ipResolutionId, setIpResolutionId] = useState<string | null>(null);
  const [scanJobId, setScanJobId] = useState<string | null>(null);

  const closeIpPanel = useCallback(() => {
    setIpResolutionId(null);
    setScanJobId(null);
  }, []);
  const openIpPanel = useCallback((id: string, options?: OpenIpPanelOptions) => {
    if (!id) return;
    setIpResolutionId(id);
    setScanJobId(options?.scanJobId?.trim() || null);
  }, []);

  useEffect(() => {
    setIpResolutionId(null);
    setScanJobId(null);
  }, [pathname]);

  const value = useMemo(
    () => ({ ipResolutionId, openIpPanel, closeIpPanel }),
    [ipResolutionId, openIpPanel, closeIpPanel],
  );

  return (
    <IpSightingPanelContext.Provider value={value}>
      {children}
      {ipResolutionId ? (
        <IpSightingPanel
          ipResolutionId={ipResolutionId}
          scanJobId={scanJobId}
          onClose={closeIpPanel}
        />
      ) : null}
    </IpSightingPanelContext.Provider>
  );
}

export function useIpSightingPanel() {
  const ctx = useContext(IpSightingPanelContext);
  if (!ctx) {
    throw new Error("useIpSightingPanel must be used within IpSightingPanelProvider");
  }
  return ctx;
}
