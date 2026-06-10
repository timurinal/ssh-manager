import { Icon } from "../lib/icons";
import { addr, type Host, type Prefs, type Session } from "../lib/types";

const MOD = navigator.userAgent.includes("Mac") ? "⌘" : "⌃";
import { TerminalPane } from "./TerminalPane";

interface TabBarProps {
  sessions: Session[];
  hosts: Host[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

function TabBar({ sessions, hosts, activeId, onActivate, onClose, onNew }: TabBarProps) {
  const hostOf = (id: string) => hosts.find((h) => h.id === id);
  return (
    <div className="tabbar">
      {sessions.map((s) => {
        const h = hostOf(s.hostId);
        if (!h) return null;
        return (
          <div
            key={s.id}
            className={"tab" + (s.id === activeId ? " active" : "")}
            onClick={() => onActivate(s.id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(s.id);
            }}
            title={addr(h)}
          >
            <span
              className={"dot " + (s.status === "error" ? "off" : h.env)}
              style={s.status === "connecting" ? { background: "var(--yellow)" } : undefined}
            />
            <span className="tab-title">{h.label}</span>
            <button
              className="tab-close"
              title={`Close tab (${MOD}W)`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.id);
              }}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        );
      })}
      <button className="tab-new" onClick={onNew} title={`New session (${MOD}T)`}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

interface Props {
  sessions: Session[];
  hosts: Host[];
  prefs: Prefs;
  activeId: string | null;
  splitWith: string | null;
  focusedId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
  onFirstData: (id: string) => void;
  onExit: (id: string, code: number) => void;
  onRetry: (id: string) => void;
  onEditHost: (hostId: string) => void;
  onToggleSplit: (id: string) => void;
  onFocused: (id: string) => void;
}

export function SessionArea({
  sessions,
  hosts,
  prefs,
  activeId,
  splitWith,
  focusedId,
  onActivate,
  onClose,
  onNewTab,
  onFirstData,
  onExit,
  onRetry,
  onEditHost,
  onToggleSplit,
  onFocused,
}: Props) {
  const visibleIds = new Set<string>();
  if (activeId) visibleIds.add(activeId);
  if (splitWith && splitWith !== activeId) visibleIds.add(splitWith);

  return (
    <>
      <TabBar
        sessions={sessions}
        hosts={hosts}
        activeId={activeId}
        onActivate={onActivate}
        onClose={onClose}
        onNew={onNewTab}
      />
      {/* every session stays mounted so scrollback survives backgrounding */}
      <div className="split">
        {sessions.map((s) => {
          const host = hosts.find((h) => h.id === s.hostId);
          if (!host) return null;
          const visible = visibleIds.has(s.id);
          const focused = visible && (visibleIds.size === 1 || s.id === (focusedId ?? activeId));
          return (
            <TerminalPane
              key={s.id}
              session={s}
              host={host}
              prefs={prefs}
              visible={visible}
              focused={focused}
              canSplit={sessions.length > 1}
              splitActive={!!splitWith}
              onFirstData={() => onFirstData(s.id)}
              onExit={(code) => onExit(s.id, code)}
              onRetry={() => onRetry(s.id)}
              onEditHost={() => onEditHost(s.hostId)}
              onDisconnect={() => onClose(s.id)}
              onSplit={() => onToggleSplit(s.id)}
              onFocused={() => onFocused(s.id)}
            />
          );
        })}
      </div>
    </>
  );
}
