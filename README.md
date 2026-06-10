# SSH Manager

Cross-platform SSH profile manager with an integrated terminal — Windows, macOS, Linux.
GUI sibling of the TUI and CLI versions. Implemented from the Claude Design handoff
(Catppuccin Mocha, JetBrains-IDE × LazyVim aesthetic).

![stack](https://img.shields.io/badge/stack-Tauri%202%20·%20React%2018%20·%20xterm.js-cba6f7)

## Architecture

| Subsystem | Implementation |
| --- | --- |
| Shell / terminal | **xterm.js** in the webview over a **native PTY** (`portable-pty`: forkpty on unix, ConPTY on Windows) |
| SSH transport | system **`ssh`** client spawned in the PTY — real auth, jump hosts (`-J`), port forwards (`-L`), interactive host-key & password prompts |
| Window chrome | frameless Tauri window, custom title bar with drag region + min/max/close |
| Profiles | `~/.config/ssh-manager/profiles.json` (atomic writes) — schema shareable with the TUI/CLI |
| Settings | `~/.config/ssh-manager/settings.json`, applied live (accent, density, fonts, terminal) |
| Import | parses `~/.ssh/config` Host blocks (HostName, User, Port, IdentityFile, ProxyJump) |
| Theming | Catppuccin Mocha CSS custom properties (`src/styles/theme.css` — straight from the design) |
| Fonts | IBM Plex Sans · Inter · JetBrains Mono, bundled via `@fontsource` |

```
src/                  React frontend
  components/         TitleBar, Sidebar, StatusBar, SessionArea, TerminalPane,
                      DetailView, FormView, SettingsView, Palette, EmptyView, Toasts
  lib/                types, IPC bridge + PTY session bus, icons, time helpers
  styles/             theme.css (design tokens) + app.css
src-tauri/src/
  pty.rs              PTY sessions: spawn ssh, stream output, resize, kill
  profiles.rs         JSON storage commands
  sshconfig.rs        ~/.ssh/config importer
```

## Features

- **Sidebar** — fuzzy search, favorites (★), recents, environment color dots (prod/staging/dev/personal), live-session rings
- **Tabbed sessions** — every tab keeps its scrollback while backgrounded; split two panes side by side
- **Real connect lifecycle** — CONNECTING → NORMAL/ERROR powerline states, failure block with Reconnect / Edit host, optional auto-reconnect (one retry) when a live session drops
- **⌘K / ⌃K command palette** — filter hosts, live preview, ↵ connect, ⇥ edit, plus actions (new host, import, settings)
- **Host detail** — connection facts, port forwards, recent session history (recorded automatically)
- **Form** — password / key file / agent auth, jump host, port-forward editor, compression / keep-alive / X11 toggles
- **Settings** — accent color, density, UI font, terminal font size / cursor blink / scrollback / copy-on-select, connection defaults; all apply instantly
- **Keybindings** — ⌘K ⌘T ⌘N ⌘W ⌘D ⌘, ⌃⇥ (mac) · ⌃ variants elsewhere; inside a terminal add ⇧ so plain Ctrl keys reach the shell (⌃⇧C/⌃⇧V copy/paste)

## Development

```sh
npm install
npm run tauri dev      # run the app (vite + cargo)
npm run build          # typecheck + bundle frontend
npm run tauri build    # release binaries / installers
```

On Linux build the AppImage with `npm run tauri:build:linux` (sets `NO_STRIP=true`).
`linuxdeploy` ships an old `strip` that can't parse the `.relr.dyn` (`SHT_RELR`) sections
modern distros emit, so plain `tauri build` aborts the AppImage step on Arch/bleeding-edge
systems; skipping the redundant strip (cargo already strips the release binary) fixes it.
The `.deb` / `.rpm` targets are unaffected.

Linux needs `webkit2gtk-4.1`; all platforms need a Rust toolchain and the `ssh` client on PATH
(bundled with Windows 10+, preinstalled on macOS/Linux).

## Storage format

`profiles.json` is an array of hosts:

```jsonc
{
  "id": "prod-web-01",
  "label": "prod-web-01",
  "user": "deploy", "host": "10.0.4.21", "port": 22,
  "env": "prod",                    // prod | staging | dev | personal
  "auth": "key",                    // password | key | agent
  "identity": "~/.ssh/id_ed25519",
  "jump": "bastion.acme.io",
  "fav": true,
  "forwards": ["127.0.0.1:5432 → db-primary:5432"],
  "compression": true, "keepalive": true, "x11": false,
  "lastAt": "2026-06-10T14:00:00Z", // managed by the app
  "history": []                     // recent sessions, managed by the app
}
```

Passwords are never stored — ssh prompts interactively in the integrated terminal.
