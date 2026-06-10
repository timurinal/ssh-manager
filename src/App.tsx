import { useCallback, useEffect, useRef, useState } from "react";
import { DetailView } from "./components/DetailView";
import { EmptyView } from "./components/EmptyView";
import { FormView } from "./components/FormView";
import { Palette } from "./components/Palette";
import { SessionArea } from "./components/SessionArea";
import { SettingsView, type SettingsTab } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { StatusBar, type Seg } from "./components/StatusBar";
import { TitleBar, type Crumb } from "./components/TitleBar";
import { Toasts, type Toast, type ToastKind } from "./components/Toasts";
import * as ipc from "./lib/ipc";
import {
  addr,
  DEFAULT_PREFS,
  ENV_COLOR,
  NEW_HOST,
  type FormHost,
  type Host,
  type Prefs,
  type Session,
} from "./lib/types";

const isMac = navigator.userAgent.includes("Mac");

const FONT_STACKS: Record<Prefs["uiFont"], string> = {
  "IBM Plex Sans": '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  Inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  System: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};

type View = "detail" | "session" | "form" | "settings";

let seq = 0;
const nextSessionId = () => `s${Date.now().toString(36)}-${++seq}`;

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("detail");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [splitWith, setSplitWith] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [formInitial, setFormInitial] = useState<FormHost | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const searchRef = useRef<HTMLInputElement>(null);

  /* ---- boot: load persisted state ---- */
  useEffect(() => {
    void (async () => {
      try {
        const [storedHosts, storedPrefs] = await Promise.all([ipc.loadHosts(), ipc.loadPrefs()]);
        if (storedHosts?.length) {
          setHosts(storedHosts);
          setSelectedId(storedHosts[0].id);
        }
        if (storedPrefs) setPrefs({ ...DEFAULT_PREFS, ...storedPrefs });
      } catch (e) {
        console.error("failed to load config", e);
      }
      setLoaded(true);
    })();
  }, []);

  /* ---- persist on change ---- */
  useEffect(() => {
    if (loaded) void ipc.saveHosts(hosts).catch(console.error);
  }, [hosts, loaded]);
  useEffect(() => {
    if (loaded) void ipc.savePrefs(prefs).catch(console.error);
  }, [prefs, loaded]);

  /* ---- apply appearance prefs to CSS ---- */
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--accent", prefs.accent);
    r.style.setProperty("--ui-font", FONT_STACKS[prefs.uiFont]);
    r.dataset.density = prefs.density;
  }, [prefs]);

  const toast = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2300);
  }, []);

  const hostById = (id: string | null | undefined) => hostsRef.current.find((h) => h.id === id);
  const online = sessions.filter((s) => s.status === "connected").map((s) => s.hostId);

  const patchSession = (sid: string, patch: Partial<Session>) =>
    setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));

  /* ---- connection lifecycle ---- */
  const connect = (hostId: string) => {
    const host = hostById(hostId);
    if (!host) return;
    const existing = sessionsRef.current.find((s) => s.hostId === hostId);
    if (existing) {
      setActiveSessionId(existing.id);
      setFocusedSessionId(existing.id);
      setView("session");
      setPaletteOpen(false);
      return;
    }
    const sid = nextSessionId();
    setSessions((prev) => [
      ...prev,
      { id: sid, hostId, status: "connecting", attempts: 1, startedAt: Date.now(), everConnected: false },
    ]);
    setHosts((prev) => prev.map((h) => (h.id === hostId ? { ...h, lastAt: new Date().toISOString() } : h)));
    setActiveSessionId(sid);
    setFocusedSessionId(sid);
    setView("session");
    setPaletteOpen(false);
    setSelectedId(hostId);
  };

  const recordHistory = (s: Session) => {
    if (!s.everConnected) return;
    const host = hostById(s.hostId);
    if (!host) return;
    const durSec = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
    const entry = { at: new Date(s.startedAt).toISOString(), what: `interactive shell · ${host.user}`, durSec };
    setHosts((prev) =>
      prev.map((h) => (h.id === s.hostId ? { ...h, history: [entry, ...(h.history ?? [])].slice(0, 20) } : h)),
    );
  };

  const closeSession = (sid: string) => {
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (s) recordHistory(s);
    void ipc.killPty(sid).catch(() => {});
    setSessions((prev) => {
      const next = prev.filter((x) => x.id !== sid);
      setActiveSessionId((cur) => {
        if (cur !== sid) return cur;
        const fallback = next[next.length - 1];
        if (!fallback) setView((v) => (v === "session" ? "detail" : v));
        return fallback ? fallback.id : null;
      });
      return next;
    });
    setSplitWith((cur) => (cur === sid ? null : cur));
  };

  const onSessionExit = (sid: string, code: number) => {
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!s) return; // already closed by the user
    if (code === 0) {
      closeSession(sid);
      return;
    }
    if (s.everConnected && prefsRef.current.autoreconnect && s.attempts < 2) {
      toast(`Connection to ${hostById(s.hostId)?.label ?? "host"} dropped — reconnecting…`, "warn");
      patchSession(sid, { status: "connecting", attempts: s.attempts + 1 });
      return;
    }
    patchSession(sid, { status: "error" });
  };

  const retrySession = (sid: string) => {
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!s) return;
    patchSession(sid, { status: "connecting", attempts: s.attempts + 1 });
  };

  const toggleSplit = (sid: string) => {
    if (splitWith) {
      setSplitWith(null);
      return;
    }
    const other = sessionsRef.current.find((s) => s.id !== sid);
    if (other) {
      setActiveSessionId(sid);
      setSplitWith(other.id);
      setFocusedSessionId(sid);
    } else toast("Open another session to split", "info");
  };

  /* ---- host CRUD ---- */
  const openNew = () => {
    setFormInitial(NEW_HOST(prefsRef.current));
    setView("form");
    setPaletteOpen(false);
  };
  const openEdit = (id: string) => {
    const h = hostById(id);
    if (!h) return;
    setFormInitial({ ...h });
    setView("form");
    setSelectedId(id);
    setPaletteOpen(false);
  };
  const saveHost = (f: FormHost) => {
    const forwards = f.forwards.map((s) => s.trim()).filter((s) => s.replace("→", "").trim() !== "");
    if (f.id) {
      setHosts((prev) => prev.map((h) => (h.id === f.id ? ({ ...h, ...f, forwards } as Host) : h)));
      setSelectedId(f.id);
      toast("Saved " + f.label);
    } else {
      const slug =
        f.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "host";
      const ids = hostsRef.current.map((h) => h.id);
      let id = slug;
      let n = 2;
      while (ids.includes(id)) id = `${slug}-${n++}`;
      setHosts((prev) => [...prev, { ...f, id, forwards } as Host]);
      setSelectedId(id);
      toast("Created " + f.label);
    }
    setView("detail");
  };
  const deleteHost = (id: string) => {
    sessionsRef.current.filter((s) => s.hostId === id).forEach((s) => closeSession(s.id));
    setHosts((prev) => prev.filter((h) => h.id !== id));
    setSelectedId(() => {
      const left = hostsRef.current.filter((h) => h.id !== id);
      return left[0] ? left[0].id : null;
    });
    setView("detail");
    toast("Deleted host", "warn");
  };
  const toggleFav = (id: string) => setHosts((prev) => prev.map((h) => (h.id === id ? { ...h, fav: !h.fav } : h)));

  const importConfig = async () => {
    setPaletteOpen(false);
    try {
      const imported = await ipc.importSshConfig();
      const existing = new Set(hostsRef.current.map((h) => h.label));
      const fresh = imported
        .filter((i) => !existing.has(i.label))
        .map(
          (i): Host => ({
            id: "",
            label: i.label,
            host: i.host,
            port: i.port,
            user: i.user || "root",
            env: "personal",
            auth: (["password", "key", "agent"].includes(i.auth) ? i.auth : "agent") as Host["auth"],
            identity: i.identity,
            jump: i.jump,
            fav: false,
            forwards: [],
            compression: prefsRef.current.compression,
            keepalive: prefsRef.current.keepalive > 0,
            x11: false,
          }),
        );
      if (!fresh.length) {
        toast("No new hosts found in ~/.ssh/config", "info");
        return;
      }
      const ids = new Set(hostsRef.current.map((h) => h.id));
      fresh.forEach((h) => {
        let id = h.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "host";
        let n = 2;
        const base = id;
        while (ids.has(id)) id = `${base}-${n++}`;
        ids.add(id);
        h.id = id;
      });
      setHosts((prev) => [...prev, ...fresh]);
      if (!selectedId) setSelectedId(fresh[0].id);
      toast(`Imported ${fresh.length} host${fresh.length === 1 ? "" : "s"} from ~/.ssh/config`, "info");
    } catch (e) {
      toast(String(e), "warn");
    }
  };

  const selectHost = (id: string) => {
    setSelectedId(id);
    setView((v) => (v === "session" ? "session" : "detail"));
  };

  /* ---- keybindings ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
          e.preventDefault();
        }
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        const list = sessionsRef.current;
        if (list.length > 1 && activeSessionId) {
          e.preventDefault();
          const i = list.findIndex((s) => s.id === activeSessionId);
          const nx = list[(i + 1) % list.length];
          setActiveSessionId(nx.id);
          setFocusedSessionId(nx.id);
          setView("session");
        }
        return;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      // on Linux/Windows, plain Ctrl keys must reach the shell — require ⇧
      // for app shortcuts while a terminal is focused (matches the custom
      // key handler in TerminalPane that lets Ctrl+Shift combos bubble up)
      const inTerm = e.target instanceof HTMLElement && !!e.target.closest(".term");
      if (!isMac && inTerm && !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (k === "t") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (k === "n") {
        e.preventDefault();
        openNew();
      } else if (e.key === ",") {
        e.preventDefault();
        setView("settings");
      } else if (k === "w") {
        if (activeSessionId && view === "session") {
          e.preventDefault();
          closeSession(activeSessionId);
        }
      } else if (k === "d") {
        if (activeSessionId && view === "session") {
          e.preventDefault();
          toggleSplit(activeSessionId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen, activeSessionId, view, splitWith]);

  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const selected = hostById(selectedId) ?? hosts[0] ?? null;

  /* ---- status bar ---- */
  const C = "var(--crust)",
    S0 = "var(--surface0)",
    S1 = "var(--surface1)",
    T = "var(--text)",
    ST = "var(--subtext0)",
    A = "var(--accent)",
    G = "var(--green)",
    R = "var(--red)",
    Y = "var(--yellow)";
  const actSession = sessions.find((s) => s.id === activeSessionId);
  let sbLeft: Seg[], sbRight: Seg[];
  if (view === "session" && actSession) {
    const h = hostById(actSession.hostId);
    const mode =
      actSession.status === "connected" ? "NORMAL" : actSession.status === "connecting" ? "CONNECTING" : "ERROR";
    sbLeft = [
      {
        text: mode,
        bg: actSession.status === "error" ? R : A,
        fg: C,
        icon: actSession.status === "error" ? "alert" : "terminal",
      },
      { text: h ? addr(h) : "", bg: S1, fg: T },
      ...(h ? [{ text: h.env, bg: S0, fg: `var(--${ENV_COLOR[h.env]})`, icon: "tag" }] : []),
    ];
    sbRight = [
      { text: `${sessions.length} session${sessions.length > 1 ? "s" : ""}`, bg: S0, fg: ST, icon: "columns" },
      ...(h ? [{ text: h.auth, bg: S1, fg: T, icon: "key" }] : []),
      {
        text: actSession.status === "connected" ? "live" : actSession.status,
        bg: actSession.status === "connected" ? G : actSession.status === "connecting" ? Y : R,
        fg: C,
        icon: "dot",
        iconFill: C,
      },
    ];
  } else {
    sbLeft = [
      { text: view === "form" ? "EDIT" : view === "settings" ? "SETTINGS" : "READY", bg: A, fg: C, icon: "power" },
    ];
    if (selected && view === "detail") sbLeft.push({ text: selected.label, bg: S1, fg: T });
    if (sessions.length)
      sbLeft.push({
        text: `${sessions.length} active`,
        bg: G,
        fg: C,
        icon: "terminal",
        onClick: () => setView("session"),
        title: "Return to sessions",
      });
    sbRight = [
      { text: `${hosts.length} hosts`, bg: S0, fg: ST, icon: "server" },
      { text: "agent", bg: S1, fg: T, icon: "shield" },
      { text: "UTF-8", bg: A, fg: C },
    ];
  }

  const crumb: Crumb[] =
    view === "session" && actSession
      ? [{ t: "Session" }, { t: hostById(actSession.hostId) ? addr(hostById(actSession.hostId)!) : "", b: true }]
      : view === "form"
        ? [{ t: "Hosts" }, { t: formInitial?.id ? formInitial.label : "New connection", b: true }]
        : view === "settings"
          ? [{ t: "Settings", b: true }]
          : selected
            ? [{ t: "Hosts" }, { t: selected.label, b: true }]
            : [{ t: "Hosts", b: true }];

  if (!loaded) return <div className="app-root" style={{ background: "var(--base)" }} />;

  const showEmpty = hosts.length === 0 && view !== "settings" && view !== "form";

  return (
    <div className="app-root">
      <div className="win app">
        <TitleBar crumb={crumb} onTogglePalette={() => setPaletteOpen((o) => !o)} />
        <div className="body">
          <Sidebar
            hosts={hosts}
            selectedId={selectedId}
            query={query}
            setQuery={setQuery}
            online={online}
            onSelect={selectHost}
            onConnect={connect}
            onFav={toggleFav}
            onNew={openNew}
            onImport={() => void importConfig()}
            onSettings={() => setView("settings")}
            searchRef={searchRef}
          />
          <div className="main">
            {showEmpty && <EmptyView onNew={openNew} onImport={() => void importConfig()} />}
            <div
              style={{
                display: !showEmpty && view === "session" && sessions.length > 0 ? "contents" : "none",
              }}
            >
              {sessions.length > 0 && (
                <SessionArea
                  sessions={sessions}
                  hosts={hosts}
                  prefs={prefs}
                  activeId={activeSessionId}
                  splitWith={splitWith}
                  focusedId={focusedSessionId}
                  onActivate={(id) => {
                    setActiveSessionId(id);
                    setFocusedSessionId(id);
                  }}
                  onClose={closeSession}
                  onNewTab={() => setPaletteOpen(true)}
                  onFirstData={(id) => patchSession(id, { status: "connected", everConnected: true })}
                  onExit={onSessionExit}
                  onRetry={retrySession}
                  onEditHost={openEdit}
                  onToggleSplit={toggleSplit}
                  onFocused={setFocusedSessionId}
                />
              )}
            </div>
            {!showEmpty && view === "detail" && selected && (
              <DetailView
                host={selected}
                prefs={prefs}
                online={online.includes(selected.id)}
                onConnect={() => connect(selected.id)}
                onEdit={() => openEdit(selected.id)}
              />
            )}
            {view === "form" && formInitial && (
              <FormView
                key={formInitial.id ?? "new"}
                initial={formInitial}
                onSave={saveHost}
                onCancel={() => setView("detail")}
                onDelete={deleteHost}
              />
            )}
            {view === "settings" && (
              <SettingsView tab={settingsTab} setTab={setSettingsTab} prefs={prefs} setPref={setPref} />
            )}
            <StatusBar left={sbLeft} right={sbRight} />
          </div>
        </div>

        {paletteOpen && (
          <Palette
            hosts={hosts}
            onConnect={connect}
            onNew={openNew}
            onEdit={openEdit}
            onImport={() => void importConfig()}
            onSettings={() => {
              setView("settings");
              setPaletteOpen(false);
            }}
            onClose={() => setPaletteOpen(false)}
          />
        )}

        <Toasts toasts={toasts} />
      </div>
    </div>
  );
}
