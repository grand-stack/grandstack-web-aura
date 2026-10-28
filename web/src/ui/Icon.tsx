// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { SVGProps } from "react";

// 24x24 stroke icons. Decorative: always paired with text or an aria-label on the button that holds them.
const PATHS = {
  sync: <><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v5h-5" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  back: <><path d="M15 5l-7 7 7 7" /></>,
  x: <><path d="M6 6l12 12M18 6L6 18" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  alert: <><path d="M12 5v8M12 18v.01" /></>,
  warn: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
  pause: <><rect x="5" y="4" width="5" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1" fill="currentColor" /></>,
  stop: <><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></>,
  dot: <><circle cx="12" cy="12" r="6" fill="currentColor" /></>,
  spinner: <><path d="M20 12a8 8 0 1 1-3-6.2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></>,
  auto: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>,
  logo: <><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.6 10.6 15.4 7.4M8.6 13.4l6.8 3.2" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "check" || name === "alert" || name === "spinner" ? 2.6 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
