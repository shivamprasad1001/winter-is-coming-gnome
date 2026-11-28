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

# Clean up both enabled and disabled lists in GSettings
if command -v gjs >/dev/null 2>&1; then
  gjs -c "
    const { Gio } = imports.gi;
    try {
      const s = new Gio.Settings({ schema_id: 'org.gnome.shell' });
      let en = s.get_strv('enabled-extensions').filter(x => x !== '$uuid');
      s.set_strv('enabled-extensions', en);
      let dis = s.get_strv('disabled-extensions').filter(x => x !== '$uuid');
      s.set_strv('disabled-extensions', dis);
    } catch (e) {}
  " 2>/dev/null || true
elif command -v python3 >/dev/null 2>&1; then
  python3 -c "
try:
    import gi
    from gi.repository import Gio
    s = Gio.Settings.new('org.gnome.shell')
    en = [x for x in s.get_strv('enabled-extensions') if x != '$uuid']
    s.set_strv('enabled-extensions', en)
    dis = [x for x in s.get_strv('disabled-extensions') if x != '$uuid']
    s.set_strv('disabled-extensions', dis)
except Exception:
    pass
" 2>/dev/null || true
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
