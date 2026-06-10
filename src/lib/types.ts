export type Env = "prod" | "staging" | "dev" | "personal";
export type Auth = "password" | "key" | "agent";

export interface HistoryEntry {
  /** ISO timestamp of session start */
  at: string;
  what: string;
  durSec: number;
}

export interface Host {
  id: string;
  label: string;
  user: string;
  host: string;
  port: number;
  env: Env;
  auth: Auth;
  identity: string;
  jump: string;
  fav: boolean;
  /** display form: "127.0.0.1:5432 → db-primary:5432" */
  forwards: string[];
  compression: boolean;
  keepalive: boolean;
  x11: boolean;
  /** ISO timestamp of last connect */
  lastAt?: string;
  history?: HistoryEntry[];
}

export type Density = "compact" | "regular" | "comfy";
export type UiFont = "IBM Plex Sans" | "Inter" | "System";
export type Scrollback = "1k" | "10k" | "∞";

export interface Prefs {
  accent: string;
  density: Density;
  uiFont: UiFont;
  termFs: number;
  cursorBlink: boolean;
  scrollback: Scrollback;
  copyOnSelect: boolean;
  keepalive: number;
  compression: boolean;
  stricthostkey: boolean;
  autoreconnect: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  accent: "#cba6f7",
  density: "regular",
  uiFont: "IBM Plex Sans",
  termFs: 13,
  cursorBlink: true,
  scrollback: "10k",
  copyOnSelect: true,
  keepalive: 30,
  compression: true,
  stricthostkey: true,
  autoreconnect: true,
};

export type SessionStatus = "connecting" | "connected" | "error";

export interface Session {
  id: string;
  hostId: string;
  status: SessionStatus;
  attempts: number;
  startedAt: number;
  everConnected: boolean;
}

export const addr = (p: Pick<Host, "user" | "host" | "port">) => `${p.user}@${p.host}:${p.port}`;

export const ENV_COLOR: Record<Env, string> = {
  prod: "red",
  staging: "yellow",
  dev: "green",
  personal: "mauve",
};

export const AUTH_LABEL: Record<Auth, string> = {
  key: "Public key",
  password: "Password",
  agent: "SSH agent",
};

export const NEW_HOST = (prefs: Prefs): Omit<Host, "id"> & { id?: string } => ({
  label: "",
  host: "",
  port: 22,
  user: "",
  env: "dev",
  auth: "key",
  identity: "~/.ssh/id_ed25519",
  jump: "",
  fav: false,
  forwards: [],
  compression: prefs.compression,
  keepalive: prefs.keepalive > 0,
  x11: false,
});

export type FormHost = ReturnType<typeof NEW_HOST>;
