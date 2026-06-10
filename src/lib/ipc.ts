// Typed bridge to the Rust backend: profile storage, ssh-config import,
// and the PTY session bus.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Host, Prefs } from "./types";

/* ---------------- storage ---------------- */

export const loadHosts = () => invoke<Host[] | null>("load_hosts");
export const saveHosts = (hosts: Host[]) => invoke<void>("save_hosts", { hosts });
export const loadPrefs = () => invoke<Partial<Prefs> | null>("load_prefs");
export const savePrefs = (prefs: Prefs) => invoke<void>("save_prefs", { prefs });

export interface ImportedHost {
  label: string;
  host: string;
  port: number;
  user: string;
  auth: string;
  identity: string;
  jump: string;
}
export const importSshConfig = () => invoke<ImportedHost[]>("import_ssh_config");

/* ---------------- PTY ---------------- */

export interface SpawnSshArgs {
  id: string;
  host: string;
  port: number;
  user: string;
  auth: string;
  identity: string | null;
  jump: string | null;
  forwards: string[];
  compression: boolean;
  x11: boolean;
  keepalive: number;
  strictHostKey: boolean;
  cols: number;
  rows: number;
}

export const spawnSsh = (args: SpawnSshArgs) => invoke<void>("spawn_ssh", { args });
export const writePty = (id: string, data: string) => invoke<void>("write_pty", { id, data });
export const resizePty = (id: string, cols: number, rows: number) =>
  invoke<void>("resize_pty", { id, cols, rows });
export const killPty = (id: string) => invoke<void>("kill_pty", { id });

/* ---------------- session bus ----------------
   One global listener per event; terminals register per-session handlers.
   Output arriving before a terminal mounts is queued and flushed. */

type OutputHandler = (data: Uint8Array) => void;
type ExitHandler = (code: number) => void;

const outputHandlers = new Map<string, OutputHandler>();
const exitHandlers = new Map<string, ExitHandler>();
const pendingOutput = new Map<string, Uint8Array[]>();

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

let busStarted = false;
export function startPtyBus() {
  if (busStarted) return;
  busStarted = true;
  void listen<{ id: string; data: string }>("pty-output", (e) => {
    const { id, data } = e.payload;
    const bytes = b64ToBytes(data);
    const handler = outputHandlers.get(id);
    if (handler) handler(bytes);
    else {
      const q = pendingOutput.get(id) ?? [];
      q.push(bytes);
      pendingOutput.set(id, q);
    }
  });
  void listen<{ id: string; code: number }>("pty-exit", (e) => {
    exitHandlers.get(e.payload.id)?.(e.payload.code);
  });
}

export function bindSession(id: string, onOutput: OutputHandler, onExit: ExitHandler) {
  outputHandlers.set(id, onOutput);
  exitHandlers.set(id, onExit);
  const queued = pendingOutput.get(id);
  if (queued) {
    pendingOutput.delete(id);
    queued.forEach(onOutput);
  }
  return () => {
    outputHandlers.delete(id);
    exitHandlers.delete(id);
    pendingOutput.delete(id);
  };
}
