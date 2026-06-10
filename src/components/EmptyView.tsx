import { Icon } from "../lib/icons";

export function EmptyView({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="empty">
      <div className="empty-art">
        <Icon name="terminal" size={50} stroke={1.4} />
      </div>
      <h2>No connections yet</h2>
      <p>
        Create your first SSH host, or import everything you already have in{" "}
        <span className="mono" style={{ color: "var(--subtext0)" }}>
          ~/.ssh/config
        </span>
        .
      </p>
      <div className="acts">
        <button className="btn btn-ghost btn-lg" onClick={onImport}>
          <Icon name="download" size={15} /> Import ssh config
        </button>
        <button className="btn btn-accent btn-lg" onClick={onNew}>
          <Icon name="plus" size={15} stroke={2.2} /> New connection
        </button>
      </div>
    </div>
  );
}
