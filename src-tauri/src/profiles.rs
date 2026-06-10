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
    load_json_in(&config_dir()?, file)
}

fn save_json(file: &str, value: &serde_json::Value) -> Result<(), String> {
    save_json_in(&config_dir()?, file, value)
}

fn load_json_in(dir: &std::path::Path, file: &str) -> Result<Option<serde_json::Value>, String> {
    let path = dir.join(file);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string())
}

fn save_json_in(dir: &std::path::Path, file: &str, value: &serde_json::Value) -> Result<(), String> {
    let path = dir.join(file);
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    /// Unique per-test temp dir, removed on drop.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("ssh-manager-test-{tag}-{}", std::process::id()));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn load_missing_file_returns_none() {
        let tmp = TempDir::new("missing");
        assert_eq!(load_json_in(&tmp.0, "profiles.json").unwrap(), None);
    }

    #[test]
    fn save_then_load_round_trips() {
        let tmp = TempDir::new("roundtrip");
        let value = json!([{ "id": "web", "label": "Web", "port": 22, "fav": true }]);
        save_json_in(&tmp.0, "profiles.json", &value).unwrap();
        assert_eq!(load_json_in(&tmp.0, "profiles.json").unwrap(), Some(value));
    }

    #[test]
    fn save_overwrites_existing_file() {
        let tmp = TempDir::new("overwrite");
        save_json_in(&tmp.0, "settings.json", &json!({ "termFs": 13 })).unwrap();
        save_json_in(&tmp.0, "settings.json", &json!({ "termFs": 15 })).unwrap();
        assert_eq!(
            load_json_in(&tmp.0, "settings.json").unwrap(),
            Some(json!({ "termFs": 15 }))
        );
    }

    #[test]
    fn save_leaves_no_tmp_file_behind() {
        let tmp = TempDir::new("atomic");
        save_json_in(&tmp.0, "profiles.json", &json!({})).unwrap();
        assert!(tmp.0.join("profiles.json").exists());
        assert!(!tmp.0.join("profiles.json.tmp").exists());
    }

    #[test]
    fn load_corrupt_json_is_an_error_not_a_panic() {
        let tmp = TempDir::new("corrupt");
        fs::write(tmp.0.join("profiles.json"), "{ not json").unwrap();
        assert!(load_json_in(&tmp.0, "profiles.json").is_err());
    }

    #[test]
    fn preserves_unicode_content() {
        let tmp = TempDir::new("unicode");
        let value = json!({ "label": "сервер → продакшн" });
        save_json_in(&tmp.0, "profiles.json", &value).unwrap();
        assert_eq!(load_json_in(&tmp.0, "profiles.json").unwrap(), Some(value));
    }
}
