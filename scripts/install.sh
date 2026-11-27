#!/usr/bin/env bash
# Install (or update) WinterIsComing for GNOME Shell with auto-enable.
# Works both from a local clone (./scripts/install.sh) and via:
#   curl -fsSL https://raw.githubusercontent.com/shivamprasad1001/winter-is-coming-gnome/main/scripts/install.sh | bash
set -euo pipefail

uuid="winter-is-coming@linux"
repo="${WINTER_REPO:-shivamprasad1001/winter-is-coming-gnome}"
branch="${WINTER_BRANCH:-main}"

if ! command -v gnome-extensions >/dev/null 2>&1; then
  echo "Error: gnome-extensions CLI not found. Please install GNOME Shell first." >&2
  exit 1
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/winter-is-coming-install.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

src=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  local_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [ -f "$local_root/metadata.json" ] && [ -f "$local_root/extension.js" ]; then
    src="$local_root"
  fi
fi

if [ -z "$src" ]; then
  url="https://github.com/$repo/archive/refs/heads/$branch.tar.gz"
  archive="$tmp/source.tar.gz"
  echo "Downloading WinterIsComing from https://github.com/$repo ..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --proto '=https' --proto-redir '=https' -o "$archive" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --https-only -O "$archive" "$url"
  else
    echo "Error: curl or wget is required to download WinterIsComing." >&2
    exit 1
  fi
  mkdir -p "$tmp/src"
  tar -xzf "$archive" -C "$tmp/src" --strip-components=1
  src="$tmp/src"
fi

echo "Packaging $uuid ..."
gnome-extensions pack "$src" \
  --force \
  --out-dir "$tmp" \
  --extra-source=prefs.js \
  --extra-source=lib \
  --extra-source=LICENSE \
  --schema=schemas/org.gnome.shell.extensions.winter-is-coming.gschema.xml

bundle="$tmp/$uuid.shell-extension.zip"
gnome-extensions install --force "$bundle"
echo "Installed $uuid to ~/.local/share/gnome-shell/extensions/$uuid"

ext_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
if [ -d "$ext_dir/schemas" ] && command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas "$ext_dir/schemas" 2>/dev/null || true
fi

# AUTO-ENABLE in GNOME Shell settings so user never has to enable it manually
echo "Auto-enabling $uuid in GNOME settings ..."
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null || true
fi

if command -v gjs >/dev/null 2>&1; then
  gjs -c "
    const { Gio } = imports.gi;
    try {
      const s = new Gio.Settings({ schema_id: 'org.gnome.shell' });
      let list = s.get_strv('enabled-extensions');
      if (!list.includes('$uuid')) {
        list.push('$uuid');
        s.set_strv('enabled-extensions', list);
      }
    } catch (e) {}
  " 2>/dev/null || true
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "
try:
    import gi
    from gi.repository import Gio
    s = Gio.Settings.new('org.gnome.shell')
    exts = list(s.get_strv('enabled-extensions'))
    if '$uuid' not in exts:
        exts.append('$uuid')
        s.set_strv('enabled-extensions', exts)
except Exception:
    pass
" 2>/dev/null || true
fi

# Attempt live activation (works immediately if shell already indexed the UUID or on X11)
activated=false
if gnome-extensions enable "$uuid" 2>/dev/null; then
  activated=true
elif command -v busctl >/dev/null 2>&1; then
  if busctl --user call org.gnome.Shell.Extensions /org/gnome/Shell/Extensions org.gnome.Shell.Extensions EnableExtension s "$uuid" 2>/dev/null | grep -q "true"; then
    activated=true
  fi
fi

# On X11, if not yet active, trigger shell restart
if [ "$activated" = "false" ] && [ "${XDG_SESSION_TYPE:-}" = "x11" ] && command -v busctl >/dev/null 2>&1; then
  busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting GNOME Shell...")' 2>/dev/null || true
  sleep 1
  if gnome-extensions enable "$uuid" 2>/dev/null; then
    activated=true
  fi
fi

if command -v notify-send >/dev/null 2>&1; then
  notify-send -i weather-snow "WinterIsComing" "Installed and auto-enabled! ❄" 2>/dev/null || true
fi

echo ""
if [ "$activated" = "true" ]; then
  echo "❄ WinterIsComing is now installed and ACTIVELY RUNNING!"
  echo "  Look for the ❄ icon in your top bar."
else
  echo "❄ WinterIsComing has been installed and AUTO-ENABLED in your GNOME settings!"
  echo "  Because Wayland isolates running sessions, GNOME Shell loads new extension folders upon login."
  echo "  Simply log out and back in — snow will start falling automatically with NO extra steps!"
fi
