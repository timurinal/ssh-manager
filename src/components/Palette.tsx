import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../lib/icons";
import { relTime } from "../lib/time";
import { addr, AUTH_LABEL, type Host } from "../lib/types";

const MOD = navigator.userAgent.includes("Mac") ? "⌘" : "⌃";

interface Action {
  type: "action";
  id: string;
  label: string;
  icon: string;
  kbd?: string;
  run: () => void;
}
type Item = ({ type: "host" } & Host) | Action;

interface Props {
  hosts: Host[];
  onConnect: (id: string) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onImport: () => void;
  onSettings: () => void;
  onClose: () => void;
}

export function Palette({ hosts, onConnect, onNew, onEdit, onImport, onSettings, onClose }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSel(0), [q]);

  const ql = q.trim().toLowerCase();
  const hostMatches = hosts.filter(
    (p) =>
      !ql ||
      p.label.toLowerCase().includes(ql) ||
      p.host.toLowerCase().includes(ql) ||
      p.user.toLowerCase().includes(ql) ||
      p.env.includes(ql),
  );
  const actions: Action[] = [
    { type: "action", id: "new", label: "New connection…", icon: "plus", kbd: `${MOD}N`, run: onNew },
    { type: "action", id: "import", label: "Import ssh config", icon: "download", run: onImport },
    { type: "action", id: "settings", label: "Open settings", icon: "settings", kbd: `${MOD},`, run: onSettings },
  ];
  const actionMatches = actions.filter((a) => !ql || a.label.toLowerCase().includes(ql));
  const items: Item[] = [...hostMatches.map((h) => ({ type: "host" as const, ...h })), ...actionMatches];
  const clamped = Math.min(sel, Math.max(0, items.length - 1));
  const current = items[clamped];

  const run = (it: Item | undefined) => {
    if (!it) return;
    if (it.type === "host") onConnect(it.id);
    else it.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(current);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (current && current.type === "host") onEdit(current.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const hl = (label: string): ReactNode => {
    if (!ql) return label;
    const i = label.toLowerCase().indexOf(ql);
    if (i < 0) return label;
    return (
      <>
        {label.slice(0, i)}
        <span className="hl">{label.slice(i, i + ql.length)}</span>
        {label.slice(i + ql.length)}
      </>
    );
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search hosts or run a command…"
            spellCheck={false}
            style={{
              flex: 1,
              border: 0,
              background: "transparent",
              outline: "none",
              color: "var(--text)",
              font: "inherit",
              fontFamily: "var(--mono-font)",
              fontSize: 16,
            }}
          />
          <span className="scope">{current && current.type === "host" ? "connect to host" : "command"}</span>
        </div>
        <div className="pal-body">
          <div className="pal-list">
            {hostMatches.length > 0 && <div className="pal-cat">Hosts · {hostMatches.length}</div>}
            {hostMatches.map((p, i) => (
              <div
                key={p.id}
                className={"pal-item" + (clamped === i ? " sel" : "")}
                onMouseEnter={() => setSel(i)}
                onClick={() => onConnect(p.id)}
              >
                <span className={"dot " + p.env} />
                <div className="pi-main">
                  <span className="pi-label">{hl(p.label)}</span>
                  <div className="pi-sub">{addr(p)}</div>
                </div>
                <span className={"tag " + p.env}>{p.env}</span>
              </div>
            ))}
            {actionMatches.length > 0 && <div className="pal-cat">Actions</div>}
            {actionMatches.map((a, i) => {
              const idx = hostMatches.length + i;
              return (
                <div
                  key={a.id}
                  className={"pal-item" + (clamped === idx ? " sel" : "")}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => a.run()}
                >
                  <Icon name={a.icon} size={14} style={{ color: "var(--accent)" }} />
                  <div className="pi-main">
                    <span className="pi-label">{hl(a.label)}</span>
                  </div>
                  {a.kbd && <span className="kbd">{a.kbd}</span>}
                </div>
              );
            })}
            {items.length === 0 && (
              <div
                style={{
                  padding: "20px 12px",
                  textAlign: "center",
                  color: "var(--overlay0)",
                  fontSize: "var(--fs-xs)",
                }}
              >
                No matches
              </div>
            )}
          </div>
          <div className="pal-preview">
            {current && current.type === "host" ? (
              <>
                <div className="pv-top">
                  <div className="pv-ico">
                    <Icon name="server" size={18} />
                  </div>
                  <div>
                    <h3>{current.label}</h3>
                    <div className="pv-addr">{addr(current)}</div>
                  </div>
                </div>
                <div className="pv-kv">
                  <div className="row">
                    <span className="pk">Env</span>
                    <span className={"tag " + current.env}>{current.env}</span>
                  </div>
                  <div className="row">
                    <span className="pk">Auth</span>
                    <span className="pvv">
                      {AUTH_LABEL[current.auth]}
                      {current.auth === "key" && current.identity ? " · " + current.identity.split("/").pop() : ""}
                    </span>
                  </div>
                  {current.jump && (
                    <div className="row">
                      <span className="pk">Via</span>
                      <span className="pvv">{current.jump}</span>
                    </div>
                  )}
                  {current.forwards[0] && (
                    <div className="row">
                      <span className="pk">Forward</span>
                      <span className="pvv">{current.forwards[0]}</span>
                    </div>
                  )}
                  <div className="row">
                    <span className="pk">Last</span>
                    <span className="pvv">{relTime(current.lastAt)}</span>
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button className="btn btn-accent" style={{ width: "100%" }} onClick={() => onConnect(current.id)}>
                  <Icon name="terminal" size={14} /> Connect in new tab
                </button>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  color: "var(--overlay1)",
                }}
              >
                <Icon name="command" size={26} />
                <span style={{ fontSize: "var(--fs-sm)" }}>Run an action</span>
              </div>
            )}
          </div>
        </div>
        <div className="pal-foot">
          <span className="hintk">
            <span className="kbd">↑↓</span> navigate
          </span>
          <span className="hintk">
            <span className="kbd">↵</span> connect
          </span>
          <span className="hintk">
            <span className="kbd">⇥</span> edit
          </span>
          <span className="spacer" />
          <span className="hintk">
            <span className="kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
