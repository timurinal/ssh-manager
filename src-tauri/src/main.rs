// SSH Manager — Tauri backend.
// Real PTY sessions over the system ssh client, JSON profile storage,
// and an ~/.ssh/config importer.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod profiles;
mod pty;
mod sshconfig;

fn main() {
    tauri::Builder::default()
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            profiles::load_hosts,
            profiles::save_hosts,
            profiles::load_prefs,
            profiles::save_prefs,
            sshconfig::import_ssh_config,
            pty::spawn_ssh,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SSH Manager");
}
