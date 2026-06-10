import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Icon } from "../lib/icons";
import { bindSession, killPty, resizePty, spawnSsh, writePty } from "../lib/ipc";
import { addr, type Host, type Prefs, type Session } from "../lib/types";

const isMac = navigator.userAgent.includes("Mac");
const MOD = isMac ? "⌘" : "⌃";

/* Catppuccin Mocha — matches the design tokens in theme.css */
const xtermTheme = (accent: string) => ({
  background: "#11111b",
  foreground: "#cdd6f4",
  cursor: accent,
  cursorAccent: "#11111b",
  selectionBackground: "#585b7080",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
});

const SCROLLBACK: Record<Prefs["scrollback"], number> = { "1k": 1_000, "10k": 10_000, "∞": 100_000 };

const dim = (s: string) => `\x1b[2m${s}\x1b[0m\r\n`;

interface Props {
  session: Session;
  host: Host;
  prefs: Prefs;
  visible: boolean;
  focused: boolean;
  canSplit: boolean;
  splitActive: boolean;
  onFirstData: () => void;
  onExit: (code: number) => void;
  onRetry: () => void;
  onEditHost: () => void;
  onDisconnect: () => void;
  onSplit: () => void;
  onFocused: () => void;
}

export function TerminalPane({
  session,
  host,
  prefs,
  visible,
  focused,
  canSplit,
  splitActive,
  onFirstData,
  onExit,
  onRetry,
  onEditHost,
  onDisconnect,
  onSplit,
  onFocused,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedAttempts = useRef(0);
  const bannerAttempt = useRef(0);
  const gotDataThisAttempt = useRef(false);
  const cbRef = useRef({ onFirstData, onExit, onFocused });
  cbRef.current = { onFirstData, onExit, onFocused };
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  /* create the terminal once per session */
  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: prefsRef.current.termFs,
      lineHeight: 1.2,
      cursorBlink: prefsRef.current.cursorBlink,
      cursorStyle: "block",
      scrollback: SCROLLBACK[prefsRef.current.scrollback],
      theme: xtermTheme(prefsRef.current.accent),
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current!);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {
      /* container not laid out yet */
    }

    // fresh terminal instance: (re-)write the connect banner if still connecting
    bannerAttempt.current = 0;
    if (sessionRef.current.status === "connecting") {
      term.write(dim(`Connecting to ${host.host} port ${host.port}…`));
      if (host.jump) term.write(dim(`Routing through jump host ${host.jump}…`));
      bannerAttempt.current = sessionRef.current.attempts;
    }

    term.onData((data) => void writePty(session.id, data).catch(() => {}));

    /* app shortcuts + clipboard pass through / get intercepted before xterm */
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const k = e.key.toLowerCase();
      if (isMac && e.metaKey && ["k", "t", "n", "w", "d", ","].includes(k)) return false;
      if (!isMac && e.ctrlKey && e.shiftKey && ["k", "t", "n", "w", "d"].includes(k)) return false;
      if (e.ctrlKey && e.key === "Tab") return false;
      if (e.ctrlKey && e.shiftKey && k === "c" && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (e.ctrlKey && e.shiftKey && k === "v") {
        void navigator.clipboard.readText().then((t) => {
          if (t) void writePty(session.id, t).catch(() => {});
        });
        return false;
      }
      return true;
    });

    term.onSelectionChange(() => {
      if (prefsRef.current.copyOnSelect && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
      }
    });

    const focusListener = () => cbRef.current.onFocused();
    term.textarea?.addEventListener("focus", focusListener);

    const unbind = bindSession(
      session.id,
      (bytes) => {
        if (!gotDataThisAttempt.current) {
          gotDataThisAttempt.current = true;
          cbRef.current.onFirstData();
        }
        term.write(bytes);
      },
      (code) => cbRef.current.onExit(code),
    );

    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        fit.fit();
        void resizePty(session.id, term.cols, term.rows).catch(() => {});
      } catch {
        /* ignore */
      }
    });
    ro.observe(containerRef.current!);

    return () => {
      ro.disconnect();
      unbind();
      term.textarea?.removeEventListener("focus", focusListener);
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  /* spawn ssh (initial connect and each retry) */
  useEffect(() => {
    if (session.status !== "connecting") return;
    if (spawnedAttempts.current >= session.attempts) return;
    spawnedAttempts.current = session.attempts;
    gotDataThisAttempt.current = false;

    const term = termRef.current!;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
    if (bannerAttempt.current < session.attempts) {
      bannerAttempt.current = session.attempts;
      if (session.attempts > 1) term.write("\r\n\x1b[33m↻ reconnecting…\x1b[0m\r\n");
      term.write(dim(`Connecting to ${host.host} port ${host.port}…`));
      if (host.jump) term.write(dim(`Routing through jump host ${host.jump}…`));
    }

    void spawnSsh({
      id: session.id,
      host: host.host,
      port: host.port,
      user: host.user,
      auth: host.auth,
      identity: host.identity || null,
      jump: host.jump || null,
      forwards: host.forwards ?? [],
      compression: host.compression,
      x11: host.x11,
      keepalive: host.keepalive ? prefsRef.current.keepalive : 0,
      strictHostKey: prefsRef.current.stricthostkey,
      cols: term.cols,
      rows: term.rows,
    }).catch((err) => {
      term.write(`\x1b[31m${String(err)}\x1b[0m\r\n`);
      cbRef.current.onExit(255);
    });
  }, [session.status, session.attempts, session.id, host]);

  /* live-apply preference changes */
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = prefs.termFs;
    term.options.cursorBlink = prefs.cursorBlink;
    term.options.scrollback = SCROLLBACK[prefs.scrollback];
    term.options.theme = xtermTheme(prefs.accent);
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [prefs.termFs, prefs.cursorBlink, prefs.scrollback, prefs.accent]);

  /* focus the shell when this pane becomes the visible/focused one
     (also while connecting — host-key and password prompts need input) */
  useEffect(() => {
    if (visible && focused && session.status !== "error") termRef.current?.focus();
  }, [visible, focused, session.status]);

  const clear = () => termRef.current?.clear();
  const disconnect = () => {
    void killPty(session.id).catch(() => {});
    onDisconnect();
  };

  return (
    <div className={"pane" + (focused ? " focus" : "") + (visible ? "" : " hidden")}>
      <div className="term-toolbar">
        <span className="tt-host">
          <span className={"dot " + host.env} />
          <b style={{ color: "var(--subtext0)" }}>{host.label}</b>
          <span style={{ color: "var(--overlay1)" }}>{addr(host)}</span>
        </span>
        <span className="spacer" />
        {canSplit && (
          <button className={splitActive ? "on" : ""} onClick={onSplit} title={`Split / unsplit (${MOD}D)`}>
            <Icon name="columns" size={13} /> Split
          </button>
        )}
        <button onClick={clear} title="Clear (Ctrl-L)">
          <Icon name="refresh" size={13} /> Clear
        </button>
        <button onClick={disconnect} title="Disconnect">
          <Icon name="power" size={13} /> Disconnect
        </button>
      </div>
      <div className="term" onClick={() => termRef.current?.focus()}>
        <div className="xterm-wrap" ref={containerRef} />
        {session.status === "error" && (
          <div className="term-error">
            <div className="te-hd">
              <Icon name="alert" size={15} /> Connection failed
            </div>
            <div className="te-body">
              Could not establish a session with <code>{addr(host)}</code>
              {host.jump ? (
                <>
                  {" "}
                  via <code>{host.jump}</code>
                </>
              ) : null}
              . The full ssh output is above.
            </div>
            <div className="te-acts">
              <button className="btn btn-accent" onClick={onRetry}>
                <Icon name="refresh" size={14} /> Reconnect
              </button>
              <button className="btn btn-ghost" onClick={onEditHost}>
                <Icon name="edit" size={14} /> Edit host
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
