import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "../lib/icons";

export interface Crumb {
  t: string;
  b?: boolean;
}

interface Props {
  crumb: Crumb[];
  onTogglePalette: () => void;
}

const win = () => getCurrentWindow();
const MOD = navigator.userAgent.includes("Mac") ? "⌘" : "⌃";

export function TitleBar({ crumb, onTogglePalette }: Props) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="tb-mark">
        <Icon name="terminal" size={12} stroke={2.4} />
      </div>
      <span className="tb-app">SSH Manager</span>
      {crumb.length > 0 && (
        <div className="tb-crumb">
          <span className="sep">/</span>
          {crumb.map((c, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span className="sep">/</span>}
              {c.b ? <b>{c.t}</b> : <span>{c.t}</span>}
            </span>
          ))}
        </div>
      )}
      <div className="tb-spacer" data-tauri-drag-region />
      <button
        className="iconbtn tb"
        title={`Quick connect (${MOD}K)`}
        onClick={onTogglePalette}
        style={{ width: "auto", padding: "0 9px", gap: 7 }}
      >
        <Icon name="search" size={14} />
        <span className="kbd">{MOD}K</span>
      </button>
      <div style={{ width: 1, height: 16, background: "var(--surface0)", margin: "0 4px" }} />
      <div className="tb-ctrls">
        <button className="tb-ctrl" title="Minimize" onClick={() => void win().minimize()}>
          <Icon name="minus" size={15} />
        </button>
        <button className="tb-ctrl" title="Maximize" onClick={() => void win().toggleMaximize()}>
          <Icon name="square" size={11} stroke={2} />
        </button>
        <button className="tb-ctrl close" title="Close" onClick={() => void win().close()}>
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
