import { Icon } from "../lib/icons";

export type ToastKind = "ok" | "info" | "warn";
export interface Toast {
  id: string;
  text: string;
  kind: ToastKind;
}

const ICON_OF: Record<ToastKind, string> = { ok: "check", warn: "alert", info: "info" };

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <Icon name={ICON_OF[t.kind]} className={t.kind} /> {t.text}
        </div>
      ))}
    </div>
  );
}
