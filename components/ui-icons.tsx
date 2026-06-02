/** Lightweight stroke icons (mockup.jsx parity, no external deps). */

import type { ReactNode } from "react";

type IconProps = { className?: string };

function IconBase({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </IconBase>
  );
}

export function IconLayoutDashboard({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </IconBase>
  );
}

export function IconList({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </IconBase>
  );
}

export function IconPlusCircle({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </IconBase>
  );
}

export function IconArrowUpDown({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
    </IconBase>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </IconBase>
  );
}

export function IconFileText({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </IconBase>
  );
}

export function IconFolder({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </IconBase>
  );
}

export function IconTerminal({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m4 17 6-6-6-6M12 19h8" />
    </IconBase>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </IconBase>
  );
}

export function IconGlobe({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </IconBase>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </IconBase>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </IconBase>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </IconBase>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </IconBase>
  );
}

export function IconArrowUpRight({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M7 17 17 7M7 7h10v10" />
    </IconBase>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </IconBase>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m12 19V5M5 12l7-7 7 7" />
    </IconBase>
  );
}

export function IconArrowDown({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </IconBase>
  );
}

export function IconMinus({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </IconBase>
  );
}

export function IconArrowLeftRight({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M8 3 4 4-4 4M16 21l-4-4 4-4M20 7H4M4 17h16" />
    </IconBase>
  );
}

export function IconKey({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </IconBase>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </IconBase>
  );
}

export function IconCloud({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </IconBase>
  );
}

export function IconMail({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="m22 6-10 7L2 6" />
    </IconBase>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconBase>
  );
}

export function IconGithub({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </IconBase>
  );
}

export function IconHash({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </IconBase>
  );
}

export function IconCreditCard({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <path d="M1 10h22" />
    </IconBase>
  );
}

export function IconDatabase({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </IconBase>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </IconBase>
  );
}
