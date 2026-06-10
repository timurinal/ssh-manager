import { beforeEach, describe, expect, it, vi } from "vitest";

/* Capture the listeners the bus registers, so tests can emit fake events. */
type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Listener[]>();

const invokeMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: Listener) => {
    const list = listeners.get(event) ?? [];
    list.push(cb);
    listeners.set(event, list);
    return Promise.resolve(() => {});
  }),
}));

const emit = (event: string, payload: unknown) =>
  (listeners.get(event) ?? []).forEach((cb) => cb({ payload }));

const b64 = (s: string) => btoa(s);

async function freshIpc() {
  vi.resetModules();
  listeners.clear();
  invokeMock.mockClear();
  return import("./ipc");
}

describe("pty bus", () => {
  let ipc: Awaited<ReturnType<typeof freshIpc>>;
  beforeEach(async () => {
    ipc = await freshIpc();
  });

  it("registers listeners only once even if started twice", () => {
    ipc.startPtyBus();
    ipc.startPtyBus();
    expect(listeners.get("pty-output")).toHaveLength(1);
    expect(listeners.get("pty-exit")).toHaveLength(1);
  });

  it("delivers decoded output to a bound session", () => {
    ipc.startPtyBus();
    const out: Uint8Array[] = [];
    ipc.bindSession("s1", (d) => out.push(d), () => {});
    emit("pty-output", { id: "s1", data: b64("hello") });
    expect(out).toHaveLength(1);
    expect(new TextDecoder().decode(out[0])).toBe("hello");
  });

  it("decodes raw bytes, not just ASCII", () => {
    ipc.startPtyBus();
    const out: Uint8Array[] = [];
    ipc.bindSession("s1", (d) => out.push(d), () => {});
    // UTF-8 bytes of "é" arriving as separate chunks must survive intact
    emit("pty-output", { id: "s1", data: btoa("\xc3") });
    emit("pty-output", { id: "s1", data: btoa("\xa9") });
    expect([...out[0], ...out[1]]).toEqual([0xc3, 0xa9]);
  });

  it("queues output that arrives before the terminal binds, then flushes in order", () => {
    ipc.startPtyBus();
    emit("pty-output", { id: "s1", data: b64("first ") });
    emit("pty-output", { id: "s1", data: b64("second") });
    const out: string[] = [];
    ipc.bindSession("s1", (d) => out.push(new TextDecoder().decode(d)), () => {});
    expect(out).toEqual(["first ", "second"]);
    // queue is drained — nothing is replayed on a rebind
    const again: string[] = [];
    ipc.bindSession("s1", (d) => again.push(new TextDecoder().decode(d)), () => {});
    expect(again).toEqual([]);
  });

  it("routes output by session id", () => {
    ipc.startPtyBus();
    const a: string[] = [];
    const b: string[] = [];
    ipc.bindSession("a", (d) => a.push(new TextDecoder().decode(d)), () => {});
    ipc.bindSession("b", (d) => b.push(new TextDecoder().decode(d)), () => {});
    emit("pty-output", { id: "a", data: b64("for-a") });
    emit("pty-output", { id: "b", data: b64("for-b") });
    expect(a).toEqual(["for-a"]);
    expect(b).toEqual(["for-b"]);
  });

  it("delivers exit codes to the bound session only", () => {
    ipc.startPtyBus();
    const codes: number[] = [];
    ipc.bindSession("s1", () => {}, (c) => codes.push(c));
    emit("pty-exit", { id: "s1", code: 130 });
    emit("pty-exit", { id: "other", code: 1 }); // unbound: ignored, no throw
    expect(codes).toEqual([130]);
  });

  it("unbind stops delivery and drops any pending queue", () => {
    ipc.startPtyBus();
    const out: string[] = [];
    const codes: number[] = [];
    const unbind = ipc.bindSession("s1", (d) => out.push(new TextDecoder().decode(d)), (c) => codes.push(c));
    unbind();
    emit("pty-output", { id: "s1", data: b64("late") });
    emit("pty-exit", { id: "s1", code: 0 });
    expect(out).toEqual([]);
    expect(codes).toEqual([]);
    // the "late" chunk was queued post-unbind; a rebind should receive it
    const replay: string[] = [];
    ipc.bindSession("s1", (d) => replay.push(new TextDecoder().decode(d)), () => {});
    expect(replay).toEqual(["late"]);
  });
});

describe("invoke wrappers", () => {
  let ipc: Awaited<ReturnType<typeof freshIpc>>;
  beforeEach(async () => {
    ipc = await freshIpc();
  });

  it("maps each wrapper to the right command and payload shape", async () => {
    await ipc.loadHosts();
    expect(invokeMock).toHaveBeenLastCalledWith("load_hosts");

    const hosts = [{ id: "h1" }] as never;
    await ipc.saveHosts(hosts);
    expect(invokeMock).toHaveBeenLastCalledWith("save_hosts", { hosts });

    await ipc.loadPrefs();
    expect(invokeMock).toHaveBeenLastCalledWith("load_prefs");

    const prefs = { accent: "#fff" } as never;
    await ipc.savePrefs(prefs);
    expect(invokeMock).toHaveBeenLastCalledWith("save_prefs", { prefs });

    await ipc.importSshConfig();
    expect(invokeMock).toHaveBeenLastCalledWith("import_ssh_config");

    await ipc.writePty("s1", "ls\n");
    expect(invokeMock).toHaveBeenLastCalledWith("write_pty", { id: "s1", data: "ls\n" });

    await ipc.resizePty("s1", 120, 40);
    expect(invokeMock).toHaveBeenLastCalledWith("resize_pty", { id: "s1", cols: 120, rows: 40 });

    await ipc.killPty("s1");
    expect(invokeMock).toHaveBeenLastCalledWith("kill_pty", { id: "s1" });
  });

  it("passes spawn args under the args key", async () => {
    const args = {
      id: "s1",
      host: "example.com",
      port: 22,
      user: "alice",
      auth: "agent",
      identity: null,
      jump: null,
      forwards: [],
      compression: false,
      x11: false,
      keepalive: 30,
      strictHostKey: true,
      cols: 80,
      rows: 24,
    };
    await ipc.spawnSsh(args);
    expect(invokeMock).toHaveBeenLastCalledWith("spawn_ssh", { args });
  });
});
