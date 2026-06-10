import type { RefObject } from "react";
import { Icon } from "../lib/icons";
import { addr, ENV_COLOR, type Host } from "../lib/types";

const MOD = navigator.userAgent.includes("Mac") ? "⌘" : "⌃";

interface RowProps {
  p: Host;
  active: boolean;
  online: boolean;
  onClick: () => void;
  onConnect: () => void;
  onFav: () => void;
}

function ProfileRow({ p, active, online, onClick, onConnect, onFav }: RowProps) {
  return (
    <div
      className={"prow" + (active ? " active" : "")}
      onClick={onClick}
      onDoubleClick={onConnect}
      title={addr(p) + "  ·  double-click to connect"}
    >
      <span
        className={"dot " + (online ? p.env : "off")}
        style={
          online
            ? { boxShadow: `0 0 0 3px color-mix(in srgb, var(--${ENV_COLOR[p.env]}) 22%, transparent)` }
            : undefined
        }
      />
      <div className="prow-main">
        <span className="prow-label">{p.label}</span>
        <span className="prow-sub mono">{addr(p)}</span>
      </div>
      <span
        className={"prow-star" + (p.fav ? " on" : "")}
        onClick={(e) => {
          e.stopPropagation();
          onFav();
        }}
      >
        <Icon name="star" size={13} fill={p.fav ? "currentColor" : "none"} />
      </span>
    </div>
  );
}

interface Props {
  hosts: Host[];
  selectedId: string | null;
  query: string;
  setQuery: (q: string) => void;
  online: string[];
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onFav: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onSettings: () => void;
  searchRef: RefObject<HTMLInputElement>;
}

export function Sidebar({
  hosts,
  selectedId,
  query,
  setQuery,
  online,
  onSelect,
  onConnect,
  onFav,
  onNew,
  onImport,
  onSettings,
  searchRef,
}: Props) {
  const q = query.trim().toLowerCase();
  const match = (p: Host) =>
    !q ||
    p.label.toLowerCase().includes(q) ||
    p.host.toLowerCase().includes(q) ||
    p.user.toLowerCase().includes(q) ||
    p.env.includes(q);
  const filtered = hosts.filter(match);
  const favs = filtered.filter((p) => p.fav);
  const recent = [...filtered]
    .filter((p) => p.lastAt)
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
    .slice(0, 3);
  const isOn = (id: string) => online.includes(id);

  const group = (icon: string, label: string, items: Host[], keyp: string, fillStar = false) =>
    items.length > 0 && (
      <div style={{ display: "contents" }} key={keyp}>
        <div className="side-head">
          <Icon name={icon} size={12} fill={fillStar ? "currentColor" : "none"} /> {label}{" "}
          <span className="count">{items.length}</span>
        </div>
        {items.map((p) => (
          <ProfileRow
            key={keyp + p.id}
            p={p}
            active={p.id === selectedId}
            online={isOn(p.id)}
            onClick={() => onSelect(p.id)}
            onConnect={() => onConnect(p.id)}
            onFav={() => onFav(p.id)}
          />
        ))}
      </div>
    );

  return (
    <aside className="sidebar">
      <div className="side-top">
        <div className="search">
          <Icon name="search" size={14} />
          <input
            ref={searchRef}
            placeholder="Search hosts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {query ? (
            <span className="kbd" onClick={() => setQuery("")} style={{ cursor: "pointer" }}>
              esc
            </span>
          ) : (
            <span className="kbd">{MOD}K</span>
          )}
        </div>
        <button className="btn btn-accent" style={{ width: "100%" }} onClick={onNew}>
          <Icon name="plus" size={14} stroke={2.2} /> New connection
        </button>
      </div>
      <div className="side-scroll" style={{ overflowY: "auto" }}>
        {filtered.length === 0 && q !== "" && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--overlay0)",
              fontSize: "var(--fs-xs)",
            }}
          >
            No hosts match “{query}”.
          </div>
        )}
        {!q && group("star", "Favorites", favs, "f", true)}
        {!q && group("clock", "Recent", recent, "r")}
        {group("server", q ? "Results" : "All hosts", filtered, "a")}
      </div>
      <div className="side-foot">
        <span className="av">
          <Icon name="terminal" size={11} stroke={2.2} />
        </span>
        <span>
          ~/.config/ssh-manager · {hosts.length} host{hosts.length === 1 ? "" : "s"}
        </span>
        <span className="ico">
          <button title="Import ssh config" onClick={onImport}>
            <Icon name="download" size={15} />
          </button>
          <button title={`Settings (${MOD},)`} onClick={onSettings}>
            <Icon name="settings" size={15} />
          </button>
        </span>
      </div>
    </aside>
  );
}
