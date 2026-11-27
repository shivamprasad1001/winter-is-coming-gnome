#!/usr/bin/env bash
set -euo pipefail

uuid="winter-is-coming@linux"
schema="org.gnome.shell.extensions.winter-is-coming"
ext_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
conf_dir="${XDG_CONFIG_HOME:-$HOME/.config}/winter-is-coming"

if command -v gnome-extensions >/dev/null 2>&1; then
  gnome-extensions disable "$uuid" 2>/dev/null || true
  gnome-extensions uninstall "$uuid" 2>/dev/null || true
fi

if [ "${1:-}" = "--purge" ]; then
  if command -v gsettings >/dev/null 2>&1; then
    [ -d "$ext_dir/schemas" ] && gsettings --schemadir "$ext_dir/schemas" reset-recursively "$schema" 2>/dev/null || true
    gsettings reset-recursively "$schema" 2>/dev/null || true
  fi
  rm -rf "$conf_dir"
fi

rm -rf "$ext_dir"

echo "WinterIsComing removed."
