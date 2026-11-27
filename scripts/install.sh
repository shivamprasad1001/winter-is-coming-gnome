#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="winter-is-coming@linux"

if ! command -v gnome-extensions >/dev/null 2>&1; then
  echo "Error: gnome-extensions CLI not found." >&2
  exit 1
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/winter-is-coming-pack.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

gnome-extensions pack "$root" \
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
  echo "Enabled $uuid. Look for the ❄ icon in your top bar."
else
  echo "Note: Log out and back in on Wayland so GNOME Shell loads the new extension, then run:"
  echo "  gnome-extensions enable $uuid"
fi
