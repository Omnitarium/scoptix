import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { AppShellChrome } from "@/components/app-shell-chrome";
import { IpSightingPanelProvider } from "@/components/ip-sighting-panel-provider";
import { HostnameSightingPanelProvider } from "@/components/hostname-sighting-panel-provider";
import { TechHostsPanelProvider } from "@/components/scans/tech-hosts-panel-provider";
import { CveHostsPanelProvider } from "@/components/scans/cve-hosts-panel-provider";
import { loadSidebarExtensionCategories } from "@/lib/extension-category";
import { prisma } from "@/lib/prisma";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const categories = await loadSidebarExtensionCategories(prisma);

  return (
    <IpSightingPanelProvider>
      <HostnameSightingPanelProvider>
        <TechHostsPanelProvider>
        <CveHostsPanelProvider>
        <div className="relative min-h-screen">
          <AppShellChrome />

          <div className="relative z-10 flex h-[100dvh] min-h-0 overflow-hidden">
            <Suspense fallback={<aside className="scx-sidebar w-[220px] shrink-0" />}>
              <Sidebar categories={categories} />
            </Suspense>
            <div className="scx-main-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </div>
        </div>
        </CveHostsPanelProvider>
        </TechHostsPanelProvider>
      </HostnameSightingPanelProvider>
    </IpSightingPanelProvider>
  );
}
