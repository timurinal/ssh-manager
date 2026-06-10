import type { CSSProperties } from "react";
import { Icon } from "../lib/icons";

export interface Seg {
  text: string;
  bg: string;
  fg: string;
  icon?: string;
  iconFill?: string;
  onClick?: () => void;
  title?: string;
}

function PowerLine({ segs, align }: { segs: Seg[]; align: "left" | "right" }) {
  return (
    <div className="pline">
      {segs.map((s, i) => {
        const last = i === segs.length - 1;
        const first = i === 0;
        return (
          <div
            className="pl-cell"
            key={i}
            style={{ background: s.bg, color: s.fg, cursor: s.onClick ? "pointer" : undefined }}
            onClick={s.onClick}
            title={s.title}
          >
            {align === "left" && !last && (
              <span className="pl-tip r" style={{ "--tipc": s.bg } as CSSProperties} />
            )}
            {align === "right" && first && (
              <span className="pl-tip l" style={{ "--tipc": s.bg } as CSSProperties} />
            )}
            {s.icon && (
              <Icon name={s.icon} size={12} fill={s.iconFill ?? "none"} stroke={s.iconFill ? 0 : 1.8} />
            )}
            <span>{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function StatusBar({ left = [], right = [] }: { left?: Seg[]; right?: Seg[] }) {
  return (
    <div className="statusbar">
      <PowerLine segs={left} align="left" />
      <div className="spacer" />
      <PowerLine segs={right} align="right" />
    </div>
  );
}
