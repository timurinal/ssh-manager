import type { ReactNode } from "react";
import { Icon } from "../lib/icons";
import { fmtDur, shortStamp } from "../lib/time";
import { AUTH_LABEL, type Host, type Prefs } from "../lib/types";

interface Props {
  host: Host;
  prefs: Prefs;
  online: boolean;
  onConnect: () => void;
  onEdit: () => void;
}

function KV({ k, icon, sub, children }: { k: string; icon: string; sub?: string; children: ReactNode }) {
  return (
    <div className="kv-card">
      <span className="k">
        <Icon name={icon} size={12} /> {k}
      </span>
      <span className="v">{children}</span>
      {sub && (
        <span className="v sub" style={{ fontSize: "var(--fs-sm)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export function DetailView({ host, prefs, online, onConnect, onEdit }: Props) {
  const keepAlive = host.keepalive ? `${prefs.keepalive}s` : "off";
  const history = host.history ?? [];
  return (
    <div className="main-scroll" style={{ overflowY: "auto" }}>
      <div className="detail">
        <div className="detail-hd">
          <div className="detail-host">
            <Icon name="server" size={22} />
          </div>
          <div className="detail-title">
            <h1>
              {host.label} <span className={"tag " + host.env}>{host.env}</span>
              {online && (
                <span
                  className="tag"
                  style={{
                    background: "color-mix(in srgb, var(--green) 18%, transparent)",
                    color: "var(--green)",
                  }}
                >
                  ● live
                </span>
              )}
            </h1>
            <span className="addr mono">
              {host.user}@{host.host} : {host.port}
            </span>
          </div>
          <div className="detail-actions">
            <button className="btn btn-ghost btn-lg" onClick={onEdit}>
              <Icon name="edit" size={14} /> Edit
            </button>
            <button className="btn btn-accent btn-lg" onClick={onConnect}>
              <Icon name="terminal" size={15} /> Connect
            </button>
          </div>
        </div>
        <div className="cardgrid">
          <KV k="Hostname" icon="globe">
            {host.host}
          </KV>
          <KV k="Port" icon="hash">
            {host.port}
          </KV>
          <KV k="Username" icon="user">
            {host.user}
          </KV>
          <KV k="Authentication" icon="key" sub={host.auth === "key" ? host.identity || undefined : undefined}>
            {AUTH_LABEL[host.auth]}
          </KV>
          <KV k="Jump host" icon="shield">
            {host.jump || "—"}
          </KV>
          <KV k="Keep-alive" icon="activity">
            {keepAlive} · compression {host.compression ? "on" : "off"}
          </KV>
        </div>
        {host.forwards.length > 0 && (
          <div className="panel">
            <div className="panel-hd">
              <Icon name="forward" size={14} /> Port forwarding <span className="count">{host.forwards.length}</span>
            </div>
            {host.forwards.map((f, i) => (
              <div className="histrow" key={i}>
                <span className="what mono" style={{ color: "var(--subtext0)" }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="panel">
          <div className="panel-hd">
            <Icon name="history" size={14} /> Recent sessions{" "}
            <span className="count">{history.length ? `last ${history.length}` : ""}</span>
          </div>
          {history.length === 0 && (
            <div className="histrow">
              <span className="what" style={{ color: "var(--overlay0)" }}>
                No sessions recorded yet — hit Connect.
              </span>
            </div>
          )}
          {history.map((r, i) => (
            <div className="histrow" key={i}>
              <span className="when mono">{shortStamp(r.at)}</span>
              <span className="what mono">{r.what}</span>
              <span className="dur">{fmtDur(r.durSec)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
