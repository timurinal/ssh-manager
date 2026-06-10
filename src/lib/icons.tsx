// Stroke icon set ported verbatim from the design bundle (demo/data.jsx).
import type { CSSProperties } from "react";

const ICON: Record<string, string> = {
  terminal: "M4 17l6-6-6-6M12 19h8",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  square: "M5 5h14v14H5z",
  x: "M18 6L6 18M6 6l12 12",
  star: "M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z",
  server: "M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01",
  key: "M15 7a4 4 0 11-5.6 3.6L4 16v3h3l1-1h2v-2h2l1.5-1.5A4 4 0 0015 7z",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 016 0v3",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  settings:
    "M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l1.5 1-1.5 3-2-.4-1.5 1.3-.5 2h-3l-.5-2-1.5-1.3-2 .4L3 16l1.5-1L4 12l-1-1 1.5-3 2 .4L8 7l.5-2h3l.5 2 1.5 1 2-.4 1.5 3-1 1z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3.5 9h17M3.5 15h17M12 3c-3 3.5-3 14.5 0 18M12 3c3 3.5 3 14.5 0 18",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  history: "M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4M12 8v4l3 2",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  forward: "M4 12h14M13 6l6 6-6 6",
  copy: "M9 9h10v10H9zM5 15H4V4h11v1",
  edit: "M5 19h2L18 8l-2-2L5 17zM15 5l2 2",
  refresh: "M20 11a8 8 0 10-2.3 6.3M20 5v6h-6",
  tag: "M4 4h7l9 9-7 7-9-9zM8 8h.01",
  hash: "M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16",
  enter: "M9 10l-4 4 4 4M5 14h11a4 4 0 004-4V6",
  check: "M5 12l5 5 9-11",
  sliders: "M4 8h10M18 8h2M4 16h2M10 16h10M14 6v4M6 14v4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  cpu: "M7 7h10v10H7zM4 9v6M20 9v6M9 4h6M9 20h6",
  activity: "M3 12h4l2 6 4-14 2 8h6",
  columns: "M4 4h7v16H4zM13 4h7v16h-7z",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  folder: "M4 6h6l2 2h8v11H4z",
  power: "M12 4v8M6.5 7a8 8 0 1011 0",
  rocket:
    "M5 15c-1 2-1 4-1 4s2 0 4-1M9 11a8 8 0 016-6c3 0 4 1 4 1s0 4-3 7a8 8 0 01-6 3l-2-2a8 8 0 002-3zM14 9h.01",
  trash: "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13",
  link: "M9 13a4 4 0 005.7 0l2.3-2.3a4 4 0 00-5.7-5.7L10 6.3M15 11a4 4 0 00-5.7 0L7 13.3a4 4 0 005.7 5.7L14 17.7",
  dot: "M12 12h.01",
  alert: "M12 3l9 16H3zM12 10v4M12 17h.01",
  book: "M5 4h13v16H7a2 2 0 01-2-2zM18 16H7a2 2 0 00-2 2",
  palette:
    "M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-.6-1.4-.6-2 .5-1 1.1-1H17a4 4 0 004-4c0-4-4-7-9-7zM7.5 12a.5.5 0 100-1 .5.5 0 000 1zM10 8.5a.5.5 0 100-1 .5.5 0 000 1zM15 8.5a.5.5 0 100-1 .5.5 0 000 1z",
  type: "M4 7V5h16v2M9 19h6M12 5v14",
  keyboard: "M4 6h16v12H4zM7 9h.01M11 9h.01M15 9h.01M7 13h.01M15 13h.01M10 13h4",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
  maximize: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  wifi: "M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0M12 19h.01",
  network: "M9 4h6v4H9zM4 16h6v4H4zM14 16h6v4h-6zM12 8v4M12 12H7v4M12 12h5v4",
  database:
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  command:
    "M9 9V6a3 3 0 10-3 3h3zM15 9h3a3 3 0 10-3-3v3zM9 15H6a3 3 0 103 3v-3zM15 15v3a3 3 0 103-3h-3zM9 9h6v6H9z",
};

interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  fill?: string;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, stroke = 1.6, fill = "none", style, className }: IconProps) {
  const d = ICON[name] || "";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      className={className}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {d
        .split("M")
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={"M" + seg} />
        ))}
    </svg>
  );
}
