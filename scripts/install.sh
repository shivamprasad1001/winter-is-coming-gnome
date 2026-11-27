#!/usr/bin/env bash
# Install (or update) WinterIsComing for GNOME Shell.
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

gnome-extensions pack "$src" \
  --force \
  --out-dir "$tmp" \
  --extra-source=prefs.js \
  --extra-source=lib \
  --extra-source=LICENSE \
  --schema=schemas/org.gnome.shell.extensions.winter-is-coming.gschema.xml

bundle="$tmp/$uuid.shell-extension.zip"
gnome-extensions install --force "$bundle"
echo "Installed $uuid."

if gnome-extensions enable "$uuid" 2>/dev/null; then
  echo "Enabled $uuid! Look for the ❄ icon in your top bar."
else
  echo "Almost done: log out and log back in once (required on Wayland), then either:"
  echo "  • Open the Extensions app and switch WinterIsComing ON, or"
  echo "  • Run: gnome-extensions enable $uuid"
fi
