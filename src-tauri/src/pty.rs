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

#[cfg(test)]
mod tests {
    use super::*;

    fn base_args() -> SpawnArgs {
        SpawnArgs {
            id: "s1".into(),
            host: "example.com".into(),
            port: 22,
            user: "alice".into(),
            auth: "agent".into(),
            identity: None,
            jump: None,
            forwards: vec![],
            compression: false,
            x11: false,
            keepalive: 0,
            strict_host_key: true,
            cols: 80,
            rows: 24,
        }
    }

    fn argv(a: &SpawnArgs) -> Vec<String> {
        build_command(a)
            .get_argv()
            .iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect()
    }

    /// True if `args` appear consecutively in `argv`.
    fn has_seq(argv: &[String], args: &[&str]) -> bool {
        argv.windows(args.len()).any(|w| w == args)
    }

    #[test]
    fn minimal_agent_command() {
        let argv = argv(&base_args());
        assert_eq!(argv[0], "ssh");
        assert!(has_seq(&argv, &["-p", "22"]));
        assert_eq!(argv.last().unwrap(), "alice@example.com");
        // nothing else sneaks in
        assert!(!argv.contains(&"-C".into()));
        assert!(!argv.contains(&"-X".into()));
        assert!(!argv.contains(&"-i".into()));
        assert!(!argv.contains(&"-J".into()));
        assert!(!argv.contains(&"-L".into()));
        assert!(!argv.iter().any(|a| a.starts_with("ServerAliveInterval")));
        assert!(!argv.iter().any(|a| a.starts_with("StrictHostKeyChecking")));
    }

    #[test]
    fn sets_terminal_env() {
        let cmd = build_command(&base_args());
        assert_eq!(cmd.get_env("TERM").unwrap().to_str(), Some("xterm-256color"));
        assert_eq!(cmd.get_env("COLORTERM").unwrap().to_str(), Some("truecolor"));
    }

    #[test]
    fn custom_port() {
        let mut a = base_args();
        a.port = 2222;
        assert!(has_seq(&argv(&a), &["-p", "2222"]));
    }

    #[test]
    fn keepalive_adds_server_alive_interval() {
        let mut a = base_args();
        a.keepalive = 30;
        assert!(has_seq(&argv(&a), &["-o", "ServerAliveInterval=30"]));
    }

    #[test]
    fn compression_and_x11_flags() {
        let mut a = base_args();
        a.compression = true;
        a.x11 = true;
        let argv = argv(&a);
        assert!(argv.contains(&"-C".into()));
        assert!(argv.contains(&"-X".into()));
    }

    #[test]
    fn relaxed_host_key_uses_accept_new() {
        let mut a = base_args();
        a.strict_host_key = false;
        assert!(has_seq(&argv(&a), &["-o", "StrictHostKeyChecking=accept-new"]));
    }

    #[test]
    fn key_auth_with_identity() {
        let mut a = base_args();
        a.auth = "key".into();
        a.identity = Some("~/.ssh/id_ed25519".into());
        let argv = argv(&a);
        assert!(has_seq(&argv, &["-i", "~/.ssh/id_ed25519"]));
        assert!(has_seq(&argv, &["-o", "IdentitiesOnly=yes"]));
    }

    #[test]
    fn key_auth_with_empty_identity_omits_dash_i() {
        let mut a = base_args();
        a.auth = "key".into();
        a.identity = Some("".into());
        let argv = argv(&a);
        assert!(!argv.contains(&"-i".into()));
        assert!(!argv.iter().any(|s| s == "IdentitiesOnly=yes"));
    }

    #[test]
    fn password_auth_forces_interactive_prompt() {
        let mut a = base_args();
        a.auth = "password".into();
        let argv = argv(&a);
        assert!(has_seq(&argv, &["-o", "PreferredAuthentications=password,keyboard-interactive"]));
        assert!(has_seq(&argv, &["-o", "PubkeyAuthentication=no"]));
    }

    #[test]
    fn jump_host() {
        let mut a = base_args();
        a.jump = Some("bastion.example.com".into());
        assert!(has_seq(&argv(&a), &["-J", "bastion.example.com"]));
    }

    #[test]
    fn empty_jump_is_ignored() {
        let mut a = base_args();
        a.jump = Some("".into());
        assert!(!argv(&a).contains(&"-J".into()));
    }

    #[test]
    fn forward_display_form_becomes_dash_l_spec() {
        let mut a = base_args();
        a.forwards = vec!["127.0.0.1:5432 → db-primary:5432".into()];
        assert!(has_seq(&argv(&a), &["-L", "127.0.0.1:5432:db-primary:5432"]));
    }

    #[test]
    fn blank_forward_entries_are_skipped() {
        let mut a = base_args();
        a.forwards = vec!["".into(), "   ".into()];
        assert!(!argv(&a).contains(&"-L".into()));
    }

    #[test]
    fn destination_is_last_argument() {
        // ssh treats everything after the destination as a remote command;
        // all options must come before user@host.
        let mut a = base_args();
        a.auth = "key".into();
        a.identity = Some("~/.ssh/id_rsa".into());
        a.jump = Some("bastion".into());
        a.compression = true;
        a.keepalive = 15;
        a.forwards = vec!["127.0.0.1:8080 → web:80".into()];
        assert_eq!(argv(&a).last().unwrap(), "alice@example.com");
    }

    #[test]
    fn spawn_args_deserializes_with_defaults() {
        // The frontend may omit serde(default) fields; strict_host_key defaults true.
        let a: SpawnArgs = serde_json::from_str(
            r#"{ "id": "s1", "host": "h", "port": 22, "user": "u", "auth": "agent",
                 "identity": null, "jump": null, "cols": 80, "rows": 24 }"#,
        )
        .unwrap();
        assert!(a.strict_host_key);
        assert!(!a.compression);
        assert!(!a.x11);
        assert_eq!(a.keepalive, 0);
        assert!(a.forwards.is_empty());
    }

    #[test]
    fn spawn_args_accepts_camel_case() {
        let a: SpawnArgs = serde_json::from_str(
            r#"{ "id": "s1", "host": "h", "port": 22, "user": "u", "auth": "agent",
                 "identity": null, "jump": null, "cols": 80, "rows": 24,
                 "strictHostKey": false, "keepalive": 60 }"#,
        )
        .unwrap();
        assert!(!a.strict_host_key);
        assert_eq!(a.keepalive, 60);
    }
}
