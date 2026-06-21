"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ComponentType } from "react";
import { apiUrl } from "@/lib/api-url";
import { useTheme } from "@/components/theme-provider";
import { IconScans, IconTargets } from "@/components/nav-icons";
import { getCategoryIconForCategory } from "@/lib/category-icons";
import type { SidebarExtensionCategory } from "@/lib/extension-category";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconLayoutDashboard,
  IconSettings,
  IconShield,
} from "@/components/ui-icons";

type NavIcon = ComponentType<{ className?: string }>;

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  rotateIcon?: boolean;
  match?: (pathname: string, search: URLSearchParams) => boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
  afterTitle?: React.ReactNode;
};

function SidebarLink({
  item,
  active,
  classic,
}: {
  item: NavItem;
  active: boolean;
  classic: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={[
        "scx-sidebar-item group w-full",
        classic && active ? "nav-active text-cream" : "",
        !classic && active ? "scx-sidebar-item-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon
        className={[
          "mr-2.5 size-3.5 shrink-0",
          item.rotateIcon ? "rotate-90" : "",
          classic && active ? "text-accent" : "",
          classic && !active ? "text-muted group-hover:text-accent/90" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ categories }: { categories: SidebarExtensionCategory[] }) {
  const { theme } = useTheme();
  const classic = theme === "dark" || theme === "light-mist";
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = (item: NavItem) =>
    item.match?.(pathname, searchParams) ??
    (item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const sections: NavSection[] = [
    {
      title: "Main",
      items: [{ href: "/", label: "Dashboard", icon: IconLayoutDashboard }],
    },
    {
      title: "Discovery",
      items: [
        {
          href: "/scans",
          label: "All Scans",
          icon: IconScans,
          match: (p) => p === "/scans" || p.startsWith("/scans/"),
        },
        { href: "/targets", label: "Targets", icon: IconTargets },
      ],
    },
    {
      title: "Findings",
      items: [
        {
          href: "/findings",
          label: "All Findings",
          icon: IconAlertTriangle,
          match: (p, sp) => p.startsWith("/findings") && !sp.get("urlCategory"),
        },
      ],
    },
    {
      title: "Intelligence",
      items: [
        {
          href: "/intel/cve",
          label: "CVE Database",
          icon: IconShield,
          match: (p: string) => p.startsWith("/intel/cve"),
        },
      ],
    },
    ...(categories.length > 0
      ? [
          {
            title: "Categories",
            items: categories.map((c) => ({
              href: `/categories/${encodeURIComponent(c.slug)}`,
              label: c.displayName,
              icon: getCategoryIconForCategory(c.iconKey, c.slug),
              match: (p: string) =>
                p === `/categories/${c.slug}` || p.startsWith(`/categories/${c.slug}/`),
            })),
          } satisfies NavSection,
        ]
      : []),
    {
      title: "Settings",
      items: [
        {
          href: "/settings",
          label: "General Settings",
          icon: IconSettings,
          match: (p) => p.startsWith("/settings"),
        },
      ],
    },
  ];

  return (
    <aside
      className={[
        "flex h-full min-h-0 shrink-0 flex-col",
        classic ? "glass-sidebar w-[220px]" : "scx-sidebar w-[220px]",
      ].join(" ")}
    >
      <div className="px-5 pt-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="shadow-lift relative size-8 shrink-0 overflow-hidden rounded-xl border border-line bg-lift">
            <Image
              src={apiUrl("/logo.png")}
              alt="Scoptix"
              width={32}
              height={32}
              className="size-full object-contain p-0.5"
              priority
            />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-wide text-cream">SCOPTIX</div>
            <div className="text-[10px] font-semibold tracking-[0.2em] text-muted">
              Discover • Analyze
            </div>
          </div>
        </Link>
      </div>
      <div className="px-5 py-2.5" aria-hidden>
        <div className="border-b border-line" />
      </div>

      <div className="scx-sidebar-nav !pt-0">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="scx-sidebar-section-title">{section.title}</h3>
            {section.afterTitle}
            {section.items.map((item) => (
              <SidebarLink
                key={`${section.title}-${item.href}-${item.label}`}
                item={item}
                active={isActive(item)}
                classic={classic}
              />
            ))}
          </div>
        ))}
      </div>

      <div className={classic ? "border-t border-line px-4 py-4" : "mt-auto p-3"}>
        {classic ? (
          <div className="glass-panel rounded-xl px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Environment
            </div>
            <div className="mt-1 font-mono text-[11px] text-cream/90">local</div>
          </div>
        ) : (
          <div className="flex items-start rounded-xl border border-line bg-lift p-2.5 shadow-sm">
            <IconCheckCircle className="mr-2 mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <div className="text-[12px] font-semibold text-cream">Scoptix</div>
              <div className="text-[10px] text-muted">Local environment</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
