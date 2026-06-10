//! Minimal ~/.ssh/config importer: Host blocks with HostName / User / Port /
//! IdentityFile / ProxyJump. Wildcard patterns are skipped.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedHost {
    pub label: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth: String,
    pub identity: String,
    pub jump: String,
}

#[tauri::command]
pub fn import_ssh_config() -> Result<Vec<ImportedHost>, String> {
    let path = dirs::home_dir()
        .ok_or("could not resolve home directory")?
        .join(".ssh")
        .join("config");
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let mut hosts: Vec<ImportedHost> = vec![];
    let mut current: Option<ImportedHost> = None;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (key, value) = match line.split_once(|c: char| c.is_whitespace() || c == '=') {
            Some((k, v)) => (k.trim().to_ascii_lowercase(), v.trim().trim_matches('"').to_string()),
            None => continue,
        };
        if key == "host" {
            if let Some(h) = current.take() {
                hosts.push(h);
            }
            // Only import concrete single-alias entries.
            let alias = value.split_whitespace().next().unwrap_or("").to_string();
            if alias.is_empty() || alias.contains('*') || alias.contains('?') || value.split_whitespace().count() > 1 {
                current = None;
            } else {
                current = Some(ImportedHost {
                    label: alias.clone(),
                    host: alias,
                    port: 22,
                    user: String::new(),
                    auth: "agent".into(),
                    identity: String::new(),
                    jump: String::new(),
                });
            }
            continue;
        }
        let Some(h) = current.as_mut() else { continue };
        match key.as_str() {
            "hostname" => h.host = value,
            "user" => h.user = value,
            "port" => h.port = value.parse().unwrap_or(22),
            "identityfile" => {
                h.identity = value;
                h.auth = "key".into();
            }
            "proxyjump" => h.jump = value,
            _ => {}
        }
    }
    if let Some(h) = current.take() {
        hosts.push(h);
    }
    Ok(hosts)
}
