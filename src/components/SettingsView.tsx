import type { ReactNode } from "react";
import { Icon } from "../lib/icons";
import type { Prefs } from "../lib/types";

const isMac = navigator.userAgent.includes("Mac");
const MOD = isMac ? "⌘" : "⌃";

export type SettingsTab = "appearance" | "terminal" | "connection" | "keys" | "about";

const NAV: [SettingsTab, string, string][] = [
  ["appearance", "palette", "Appearance"],
  ["terminal", "terminal", "Terminal"],
  ["connection", "network", "Connection"],
  ["keys", "keyboard", "Keybindings"],
  ["about", "info", "About"],
];

const ACCENTS = ["#cba6f7", "#89b4fa", "#94e2d5", "#a6e3a1", "#fab387", "#f5c2e7", "#f38ba8"];

interface Props {
  tab: SettingsTab;
  setTab: (t: SettingsTab) => void;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
}

export function SettingsView({ tab, setTab, prefs, setPref }: Props) {
  const Row = ({ b, s, children }: { b: string; s: string; children: ReactNode }) => (
    <div className="set-row">
      <div className="sr-text">
        <b>{b}</b>
        <span>{s}</span>
      </div>
      <div className="sr-ctrl">{children}</div>
    </div>
  );
  const Toggle = ({ k }: { k: "cursorBlink" | "copyOnSelect" | "compression" | "stricthostkey" | "autoreconnect" }) => (
    <button className={"swt" + (prefs[k] ? " on" : "")} onClick={() => setPref(k, !prefs[k])}>
      <i />
    </button>
  );

  const seg = <K extends "density" | "uiFont" | "scrollback">(k: K, opts: Prefs[K][]) => (
    <div className="seg">
      {opts.map((o) => (
        <button key={String(o)} className={prefs[k] === o ? "on" : ""} onClick={() => setPref(k, o)}>
          {String(o)}
        </button>
      ))}
    </div>
  );

  const stepper = (val: string, dec: () => void, inc: () => void) => (
    <div className="stepper">
      <button onClick={dec}>
        <Icon name="minus" size={13} />
      </button>
      <span className="val">{val}</span>
      <button onClick={inc}>
        <Icon name="plus" size={13} />
      </button>
    </div>
  );

  return (
    <div className="settings">
      <div className="set-nav">
        <div className="nav-h">Settings</div>
        {NAV.map(([k, ic, lbl]) => (
          <div key={k} className={"nav-item" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            <Icon name={ic} size={15} /> {lbl}
          </div>
        ))}
      </div>
      <div className="set-body">
        {tab === "appearance" && (
          <>
            <div className="set-h1">Appearance</div>
            <div className="set-sub">Theme, accent and typography. Changes apply instantly.</div>
            <div className="set-grp">
              <div className="set-grp-h">Accent color</div>
              <div className="color-pills" style={{ padding: "4px 0" }}>
                {ACCENTS.map((c) => (
                  <div
                    key={c}
                    className={"color-pill" + (prefs.accent === c ? " on" : "")}
                    style={{ background: c, width: 30, height: 30 }}
                    onClick={() => setPref("accent", c)}
                  >
                    {prefs.accent === c && <Icon name="check" size={14} stroke={2.6} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="set-grp">
              <div className="set-grp-h">Layout</div>
              <Row b="Density" s="Row height and padding throughout the app">
                {seg("density", ["compact", "regular", "comfy"])}
              </Row>
              <Row b="UI font" s="Used for labels, menus and dialogs">
                {seg("uiFont", ["IBM Plex Sans", "Inter", "System"])}
              </Row>
            </div>
          </>
        )}
        {tab === "terminal" && (
          <>
            <div className="set-h1">Terminal</div>
            <div className="set-sub">Defaults for the integrated terminal emulator.</div>
            <div className="set-grp">
              <Row b="Font size" s="Monospace size in the terminal">
                {stepper(
                  `${prefs.termFs}px`,
                  () => setPref("termFs", Math.max(10, prefs.termFs - 1)),
                  () => setPref("termFs", Math.min(22, prefs.termFs + 1)),
                )}
              </Row>
              <Row b="Cursor blink" s="Blink the block cursor when focused">
                <Toggle k="cursorBlink" />
              </Row>
              <Row b="Scrollback" s="Lines kept in history per session">
                {seg("scrollback", ["1k", "10k", "∞"])}
              </Row>
              <Row b="Copy on select" s="Selecting text copies it to the clipboard">
                <Toggle k="copyOnSelect" />
              </Row>
            </div>
          </>
        )}
        {tab === "connection" && (
          <>
            <div className="set-h1">Connection defaults</div>
            <div className="set-sub">Applied to new hosts unless overridden per profile.</div>
            <div className="set-grp">
              <Row b="Keep-alive interval" s="ServerAliveInterval, seconds">
                {stepper(
                  `${prefs.keepalive}s`,
                  () => setPref("keepalive", Math.max(0, prefs.keepalive - 15)),
                  () => setPref("keepalive", prefs.keepalive + 15),
                )}
              </Row>
              <Row b="Compression" s="Enable -C by default">
                <Toggle k="compression" />
              </Row>
              <Row b="Strict host-key checking" s="Off auto-accepts new keys (changed keys still refused)">
                <Toggle k="stricthostkey" />
              </Row>
              <Row b="Reconnect automatically" s="Retry once when a live session drops">
                <Toggle k="autoreconnect" />
              </Row>
            </div>
          </>
        )}
        {tab === "keys" && (
          <>
            <div className="set-h1">Keybindings</div>
            <div className="set-sub">
              {isMac
                ? "Shortcuts use ⌘ and never collide with the shell."
                : "Inside a terminal, add ⇧ (e.g. ⌃⇧W) so plain Ctrl keys reach the shell."}
            </div>
            <div className="keylist set-grp">
              {(
                [
                  ["Quick connect / palette", [MOD, "K"]],
                  ["New session", [MOD, "T"]],
                  ["Close tab", [MOD, "W"]],
                  ["Next tab", ["⌃", "⇥"]],
                  ["Split pane", [MOD, "D"]],
                  ["New host", [MOD, "N"]],
                  ["Open settings", [MOD, ","]],
                  ["Copy / paste in terminal", ["⌃⇧", "C / V"]],
                ] as [string, string[]][]
              ).map((r, i) => (
                <div className="keyrow" key={i}>
                  <span className="kk">{r[0]}</span>
                  <span className="kbcombo">
                    {r[1].map((k, j) => (
                      <span className="kbd" key={j}>
                        {k}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "about" && (
          <>
            <div className="set-h1">About</div>
            <div className="set-sub" />
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div className="tb-mark" style={{ width: 44, height: 44, borderRadius: 11 }}>
                <Icon name="terminal" size={22} stroke={2.4} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>SSH Manager</div>
                <div className="mono" style={{ fontSize: "var(--fs-sm)", color: "var(--overlay1)" }}>
                  GUI · v0.1.0
                </div>
              </div>
            </div>
            <div className="set-grp" style={{ maxWidth: 560 }}>
              <Row b="Cross-platform" s="Windows · macOS · Linux via Tauri 2">
                —
              </Row>
              <Row b="Terminal" s="xterm.js over a native PTY, driven by the system ssh client">
                —
              </Row>
              <Row b="Profiles" s="~/.config/ssh-manager/profiles.json — shareable with the TUI & CLI">
                —
              </Row>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
