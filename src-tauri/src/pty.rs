//! Real terminal sessions: spawn the system `ssh` client inside a native PTY
//! (forkpty/openpty on unix, ConPTY on Windows) and stream bytes to the
//! frontend, where xterm.js renders them.

use base64::Engine;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(Mutex<HashMap<String, Session>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnArgs {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    /// "password" | "key" | "agent"
    pub auth: String,
    pub identity: Option<String>,
    pub jump: Option<String>,
    /// Stored in the design's display form: "127.0.0.1:5432 → db-primary:5432"
    #[serde(default)]
    pub forwards: Vec<String>,
    #[serde(default)]
    pub compression: bool,
    #[serde(default)]
    pub x11: bool,
    /// ServerAliveInterval seconds; 0 disables.
    #[serde(default)]
    pub keepalive: u32,
    /// false → accept-new (still refuses changed keys)
    #[serde(default = "default_true")]
    pub strict_host_key: bool,
    pub cols: u16,
    pub rows: u16,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Serialize)]
struct OutputPayload<'a> {
    id: &'a str,
    /// base64 so multi-byte UTF-8 split across chunks survives the IPC.
    data: String,
}

#[derive(Clone, Serialize)]
struct ExitPayload<'a> {
    id: &'a str,
    code: u32,
}

fn build_command(a: &SpawnArgs) -> CommandBuilder {
    let mut cmd = CommandBuilder::new("ssh");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    cmd.arg("-p");
    cmd.arg(a.port.to_string());
    if a.keepalive > 0 {
        cmd.arg("-o");
        cmd.arg(format!("ServerAliveInterval={}", a.keepalive));
    }
    if a.compression {
        cmd.arg("-C");
    }
    if a.x11 {
        cmd.arg("-X");
    }
    if !a.strict_host_key {
        cmd.arg("-o");
        cmd.arg("StrictHostKeyChecking=accept-new");
    }
    match a.auth.as_str() {
        "key" => {
            if let Some(identity) = a.identity.as_deref().filter(|s| !s.is_empty()) {
                cmd.arg("-i");
                cmd.arg(identity);
                cmd.arg("-o");
                cmd.arg("IdentitiesOnly=yes");
            }
        }
        // Force the interactive password prompt (it lands in our real PTY).
        "password" => {
            cmd.arg("-o");
            cmd.arg("PreferredAuthentications=password,keyboard-interactive");
            cmd.arg("-o");
            cmd.arg("PubkeyAuthentication=no");
        }
        _ => {} // "agent": default behaviour uses the running ssh-agent
    }
    if let Some(jump) = a.jump.as_deref().filter(|s| !s.is_empty()) {
        cmd.arg("-J");
        cmd.arg(jump);
    }
    for fwd in &a.forwards {
        // "local:port → host:port" → "-L local:port:host:port"
        let spec = fwd.replace('→', ":").split_whitespace().collect::<Vec<_>>().join("");
        if !spec.is_empty() {
            cmd.arg("-L");
            cmd.arg(spec);
        }
    }
    cmd.arg(format!("{}@{}", a.user, a.host));
    cmd
}

#[tauri::command]
pub fn spawn_ssh(app: AppHandle, state: State<'_, PtyState>, args: SpawnArgs) -> Result<(), String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: args.rows,
            cols: args.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut child = pair
        .slave
        .spawn_command(build_command(&args))
        .map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();

    let session_id = args.id.clone();
    state.0.lock().unwrap().insert(
        session_id.clone(),
        Session {
            master: pair.master,
            writer,
            killer,
        },
    );

    // Reader thread: PTY bytes → "pty-output" events.
    let out_app = app.clone();
    let out_id = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let payload = OutputPayload {
                        id: &out_id,
                        data: base64::engine::general_purpose::STANDARD.encode(&buf[..n]),
                    };
                    let _ = out_app.emit("pty-output", payload);
                }
            }
        }
    });

    // Wait thread: process exit → "pty-exit" event + state cleanup.
    std::thread::spawn(move || {
        let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
        if let Some(state) = app.try_state::<PtyState>() {
            state.0.lock().unwrap().remove(&session_id);
        }
        let _ = app.emit("pty-exit", ExitPayload { id: &session_id, code });
    });

    Ok(())
}

#[tauri::command]
pub fn write_pty(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("no such session")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(state: State<'_, PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.0.lock().unwrap();
    let session = sessions.get(&id).ok_or("no such session")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_pty(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.0.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.killer.kill();
    }
    Ok(())
}
