//! JSON storage at <config_dir>/ssh-manager/ (e.g. ~/.config/ssh-manager/).
//! The schema is owned by the frontend; we persist opaque JSON values so the
//! TUI/CLI siblings can later share the same file.

use std::fs;
use std::path::PathBuf;

fn config_dir() -> Result<PathBuf, String> {
    let dir = dirs::config_dir()
        .ok_or("could not resolve config directory")?
        .join("ssh-manager");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn load_json(file: &str) -> Result<Option<serde_json::Value>, String> {
    let path = config_dir()?.join(file);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string())
}

fn save_json(file: &str, value: &serde_json::Value) -> Result<(), String> {
    let path = config_dir()?.join(file);
    let raw = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    // Write-then-rename so a crash never truncates the config.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_hosts() -> Result<Option<serde_json::Value>, String> {
    load_json("profiles.json")
}

#[tauri::command]
pub fn save_hosts(hosts: serde_json::Value) -> Result<(), String> {
    save_json("profiles.json", &hosts)
}

#[tauri::command]
pub fn load_prefs() -> Result<Option<serde_json::Value>, String> {
    load_json("settings.json")
}

#[tauri::command]
pub fn save_prefs(prefs: serde_json::Value) -> Result<(), String> {
    save_json("settings.json", &prefs)
}
