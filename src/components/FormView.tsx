import { useState } from "react";
import { Icon } from "../lib/icons";
import type { Env, FormHost } from "../lib/types";

const ENVS: [Env, string][] = [
  ["prod", "red"],
  ["staging", "yellow"],
  ["dev", "green"],
  ["personal", "mauve"],
];

interface Props {
  initial: FormHost;
  onSave: (f: FormHost) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

export function FormView({ initial, onSave, onCancel, onDelete }: Props) {
  const [f, setF] = useState<FormHost>(initial);
  const set = <K extends keyof FormHost>(k: K, v: FormHost[K]) => setF((p) => ({ ...p, [k]: v }));
  const isEdit = !!initial.id;
  const valid = f.label.trim() !== "" && f.host.trim() !== "" && f.user.trim() !== "";

  // plain render helpers (not nested components) so inputs keep focus across renders
  const field = (
    k: "label" | "host" | "user" | "identity" | "jump",
    ph: string,
    opts: { icon?: string; mono?: boolean; width?: number } = {},
  ) => (
    <div className={"field" + (opts.mono ? " mono" : "")} style={opts.width ? { width: opts.width } : undefined}>
      {opts.icon && <Icon name={opts.icon} size={14} />}
      <input
        value={f[k]}
        placeholder={ph}
        onChange={(e) => set(k, e.target.value)}
        spellCheck={false}
        autoFocus={k === "label"}
      />
    </div>
  );

  const setForward = (i: number, side: 0 | 1, v: string) => {
    const parts = (f.forwards[i] ?? " → ").split("→").map((s) => s.trim());
    parts[side] = v;
    const next = [...f.forwards];
    next[i] = `${parts[0] ?? ""} → ${parts[1] ?? ""}`;
    set("forwards", next);
  };
  const fwdPart = (i: number, side: 0 | 1) => (f.forwards[i] ?? "").split("→")[side]?.trim() ?? "";

  return (
    <div className="form-wrap">
      <div className="form-hd">
        <div className="detail-host" style={{ width: 38, height: 38, borderRadius: 9 }}>
          <Icon name={isEdit ? "edit" : "plus"} size={18} stroke={2.2} />
        </div>
        <div>
          <h1>{isEdit ? "Edit connection" : "New connection"}</h1>
          <div className="sub">Define how SSH Manager opens and authenticates this host.</div>
        </div>
      </div>
      <div className="form-body" style={{ overflowY: "auto" }}>
        <div className="fsection">
          <div className="fsection-h">
            <Icon name="tag" size={12} /> General
          </div>
          <div className="frow">
            <label className="flabel">
              Label <span className="req">*</span>
            </label>
            {field("label", "Friendly name")}
          </div>
          <div className="frow top">
            <label className="flabel">
              Environment<span className="hint">Colors the host across the app</span>
            </label>
            <div className="color-pills">
              {ENVS.map(([k, col]) => (
                <div
                  key={k}
                  className={"color-pill" + (f.env === k ? " on" : "")}
                  style={{ background: `var(--${col})` }}
                  title={k}
                  onClick={() => set("env", k)}
                >
                  {f.env === k && <Icon name="check" size={13} stroke={2.6} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="fsection">
          <div className="fsection-h">
            <Icon name="globe" size={12} /> Connection
          </div>
          <div className="frow">
            <label className="flabel">
              Host <span className="req">*</span>
            </label>
            {field("host", "hostname or IP", { mono: true, icon: "server" })}
          </div>
          <div className="frow">
            <label className="flabel">Port</label>
            <div className="frow-split">
              <div className="field mono" style={{ width: 120 }}>
                <Icon name="hash" size={14} />
                <input
                  value={String(f.port)}
                  inputMode="numeric"
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    set("port", Number.isFinite(n) ? Math.min(65535, Math.max(1, n)) : 22);
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "var(--overlay0)",
                  fontSize: "var(--fs-xs)",
                  gap: 8,
                }}
              >
                <Icon name="user" size={12} /> connects as
              </div>
            </div>
          </div>
          <div className="frow">
            <label className="flabel">
              Username <span className="req">*</span>
            </label>
            {field("user", "login user", { mono: true, icon: "user" })}
          </div>
        </div>

        <div className="fsection">
          <div className="fsection-h">
            <Icon name="lock" size={12} /> Authentication
          </div>
          <div className="frow">
            <label className="flabel">Method</label>
            <div className="seg">
              {(
                [
                  ["password", "lock", "Password"],
                  ["key", "key", "Key file"],
                  ["agent", "shield", "Agent"],
                ] as const
              ).map(([k, ic, lbl]) => (
                <button key={k} className={f.auth === k ? "on" : ""} onClick={() => set("auth", k)}>
                  <Icon name={ic} size={13} /> {lbl}
                </button>
              ))}
            </div>
          </div>
          {f.auth === "key" && (
            <div className="frow">
              <label className="flabel">Identity file</label>
              {field("identity", "~/.ssh/id_ed25519", { mono: true, icon: "key" })}
            </div>
          )}
          {f.auth === "password" && (
            <div className="frow">
              <label className="flabel" />
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--overlay1)" }}>
                ssh will prompt for the password in the terminal when you connect — nothing is stored.
              </div>
            </div>
          )}
          {f.auth === "agent" && (
            <div className="frow">
              <label className="flabel" />
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--overlay1)" }}>
                Uses keys loaded in your running ssh-agent.
              </div>
            </div>
          )}
        </div>

        <div className="fsection">
          <div className="fsection-h">
            <Icon name="sliders" size={12} /> Advanced
          </div>
          <div className="frow">
            <label className="flabel">
              Jump host<span className="hint">ProxyJump</span>
            </label>
            {field("jump", "user@bastion", { mono: true, icon: "shield" })}
          </div>
          <div className="frow top">
            <label className="flabel">
              Port forwarding<span className="hint">-L local → remote</span>
            </label>
            <div className="fwd">
              {f.forwards.map((_, i) => (
                <div className="fwd-row" key={i}>
                  <div className="field mono" style={{ width: 170 }}>
                    <input
                      value={fwdPart(i, 0)}
                      placeholder="127.0.0.1:5432"
                      spellCheck={false}
                      onChange={(e) => setForward(i, 0, e.target.value)}
                    />
                  </div>
                  <span className="arrow">→</span>
                  <div className="field mono" style={{ width: 170 }}>
                    <input
                      value={fwdPart(i, 1)}
                      placeholder="db-primary:5432"
                      spellCheck={false}
                      onChange={(e) => setForward(i, 1, e.target.value)}
                    />
                  </div>
                  <span
                    className="x"
                    title="Remove"
                    onClick={() =>
                      set(
                        "forwards",
                        f.forwards.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Icon name="x" size={13} />
                  </span>
                </div>
              ))}
              <button className="fwd-add" onClick={() => set("forwards", [...f.forwards, " → "])}>
                <Icon name="plus" size={14} /> Add forward
              </button>
            </div>
          </div>
          <div className="frow top">
            <label className="flabel">Options</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(
                [
                  ["compression", "Compression", "-C · faster over slow links"],
                  ["keepalive", "Keep-alive", "ServerAliveInterval"],
                  ["x11", "X11 forwarding", "-X · forward graphical apps"],
                ] as const
              ).map(([k, t, s]) => (
                <div className="toggle-row" key={k}>
                  <button className={"swt" + (f[k] ? " on" : "")} onClick={() => set(k, !f[k])}>
                    <i />
                  </button>
                  <div className="tt">
                    <b>{t}</b>
                    <span>{s}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="form-foot">
        {isEdit && (
          <button className="btn btn-danger" onClick={() => onDelete(f.id!)}>
            <Icon name="trash" size={14} /> Delete
          </button>
        )}
        <div className="spacer" />
        <button className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-accent"
          disabled={!valid}
          style={!valid ? { opacity: 0.45, cursor: "default" } : undefined}
          onClick={() => valid && onSave(f)}
        >
          <Icon name="check" size={14} stroke={2.4} /> {isEdit ? "Save changes" : "Save host"}
        </button>
      </div>
    </div>
  );
}
