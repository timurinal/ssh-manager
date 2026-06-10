# Packaging & releases

Two pieces live here:

- **`../.github/workflows/release.yml`** — builds installers for Linux, macOS
  (Intel + Apple Silicon) and Windows on every version tag, and uploads them to a
  GitHub Release.
- **`PKGBUILD`** + **`ssh-manager.desktop`** — package for the Arch User Repository (AUR).

---

## 0. One-time prerequisites

This isn't a git repo yet and has no license. Before any release:

```sh
# pick a license — MIT is a common permissive default; this writes a LICENSE file.
# (change the text/holder if you want something else, e.g. Apache-2.0 or GPL-3.0,
#  and update `license=()` in PKGBUILD to match.)

git init
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/timurinal/ssh-manager.git
git push -u origin main
```

> The PKGBUILD installs a `LICENSE` file from the repo root. If you don't add one,
> change `license=('MIT')` to `license=('custom')` and drop the last `install` line
> in `package()`.

---

## 1. Cross-platform installers via GitHub Actions

You **cannot** build macOS or Windows installers from your Linux machine — they need
the macOS SDK / Windows toolchain. GitHub's runners have them, so the workflow does
all three for you.

To cut a release:

```sh
# bump the version in package.json + src-tauri/tauri.conf.json + src-tauri/Cargo.toml first
git tag v0.1.0
git push origin v0.1.0
```

That triggers the workflow. When it finishes you'll have a **draft** GitHub Release
with:

| Platform | Artifacts |
| --- | --- |
| Linux | `.AppImage`, `.deb`, `.rpm` |
| macOS | `.dmg` (arm64 and x86_64) |
| Windows | `.msi`, `-setup.exe` (NSIS) |

Open it under **Releases → Draft**, check the assets, and click **Publish**. No
secrets to configure — `GITHUB_TOKEN` is provided automatically.

> macOS/Windows builds are **unsigned**, so users get a Gatekeeper / SmartScreen
> warning on first launch (right-click → Open on macOS; "More info → Run anyway" on
> Windows). Code-signing needs paid Apple/Windows certificates and can be added to
> the workflow later.

## 2. Publishing to the AUR

The `PKGBUILD` builds from the source tarball of a git tag, so **tag a release first**
(step 1). Then test it locally:

```sh
cd packaging
updpkgsums                 # pins the sha256 of the release tarball
makepkg -si                # build + install to verify it works
```

Once it builds cleanly, publish to the AUR (the AUR is itself a git remote):

```sh
makepkg --printsrcinfo > .SRCINFO   # the AUR requires this metadata file
git clone ssh://aur@aur.archlinux.org/ssh-manager.git aur-ssh-manager
cp PKGBUILD ssh-manager.desktop .SRCINFO aur-ssh-manager/
cd aur-ssh-manager
git add PKGBUILD ssh-manager.desktop .SRCINFO
git commit -m "Initial import: ssh-manager 0.1.0"
git push
```

You need an [AUR account](https://aur.archlinux.org) with your SSH public key added
to it. After each new version: bump `pkgver`, run `updpkgsums`, regenerate `.SRCINFO`,
commit, push.

### Which AUR package type is this?

This is the **build-from-source** variant (`ssh-manager`). Two alternatives you could
add later:

- **`ssh-manager-bin`** — repackages the prebuilt binary/AppImage from your GitHub
  Release. No Rust/Node needed, installs in seconds. Most popular for Tauri apps.
- **`ssh-manager-git`** — builds the latest `main` commit. For people who want HEAD.

The from-source package here is the canonical one; ask if you want the `-bin` variant
scaffolded too.
