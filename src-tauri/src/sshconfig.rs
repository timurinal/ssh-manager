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
    Ok(parse_ssh_config(&raw))
}

fn parse_ssh_config(raw: &str) -> Vec<ImportedHost> {
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
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_yields_no_hosts() {
        assert!(parse_ssh_config("").is_empty());
    }

    #[test]
    fn parses_full_host_block() {
        let hosts = parse_ssh_config(
            "Host web\n  HostName web.example.com\n  User deploy\n  Port 2222\n  ProxyJump bastion\n",
        );
        assert_eq!(hosts.len(), 1);
        let h = &hosts[0];
        assert_eq!(h.label, "web");
        assert_eq!(h.host, "web.example.com");
        assert_eq!(h.user, "deploy");
        assert_eq!(h.port, 2222);
        assert_eq!(h.jump, "bastion");
        assert_eq!(h.auth, "agent"); // no IdentityFile → agent default
        assert_eq!(h.identity, "");
    }

    #[test]
    fn host_without_hostname_uses_alias_as_host() {
        let hosts = parse_ssh_config("Host bare\n  User me\n");
        assert_eq!(hosts[0].host, "bare");
        assert_eq!(hosts[0].port, 22);
    }

    #[test]
    fn identity_file_switches_auth_to_key() {
        let hosts = parse_ssh_config("Host k\n  IdentityFile ~/.ssh/id_rsa\n");
        assert_eq!(hosts[0].auth, "key");
        assert_eq!(hosts[0].identity, "~/.ssh/id_rsa");
    }

    #[test]
    fn skips_wildcard_and_multi_alias_blocks() {
        let raw = "Host *\n  User root\n\nHost web?\n  HostName x\n\nHost a b\n  HostName y\n\nHost ok\n  HostName z\n";
        let hosts = parse_ssh_config(raw);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].label, "ok");
    }

    #[test]
    fn options_after_skipped_block_do_not_leak() {
        // "User root" under "Host *" must not attach to the next concrete host.
        let raw = "Host *\n  User root\n  Port 9999\nHost real\n  HostName real.example.com\n";
        let hosts = parse_ssh_config(raw);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].user, "");
        assert_eq!(hosts[0].port, 22);
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let raw = "# comment\n\nHost c\n  # inner comment\n  HostName c.example.com\n";
        let hosts = parse_ssh_config(raw);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].host, "c.example.com");
    }

    #[test]
    fn accepts_equals_separator_and_quoted_values() {
        let hosts = parse_ssh_config("Host=eq\nHostName=\"eq.example.com\"\nUser=\"bob\"\n");
        assert_eq!(hosts[0].host, "eq.example.com");
        assert_eq!(hosts[0].user, "bob");
    }

    #[test]
    fn keys_are_case_insensitive() {
        let hosts = parse_ssh_config("HOST up\n  HOSTNAME up.example.com\n  PORT 2200\n");
        assert_eq!(hosts[0].host, "up.example.com");
        assert_eq!(hosts[0].port, 2200);
    }

    #[test]
    fn invalid_port_falls_back_to_22() {
        let hosts = parse_ssh_config("Host p\n  Port banana\n");
        assert_eq!(hosts[0].port, 22);
    }

    #[test]
    fn unknown_keys_are_ignored() {
        let hosts = parse_ssh_config("Host u\n  ForwardAgent yes\n  ControlMaster auto\n");
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].label, "u");
    }

    #[test]
    fn parses_multiple_blocks() {
        let hosts = parse_ssh_config("Host one\nHostName 1.1.1.1\nHost two\nHostName 2.2.2.2\n");
        assert_eq!(hosts.len(), 2);
        assert_eq!(hosts[0].host, "1.1.1.1");
        assert_eq!(hosts[1].host, "2.2.2.2");
    }
}
