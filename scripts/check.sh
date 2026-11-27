#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Checking JS syntax (ESM)"
for f in "$root"/*.js "$root"/lib/*.js "$root"/tests/*.js; do
  node --input-type=module --check < "$f"
  echo "    OK  ${f#"$root"/}"
done

echo "==> Validating GSettings schema"
tmp_schema="$(mktemp -d "${TMPDIR:-/tmp}/winter-schema.XXXXXX")"
trap 'rm -rf "$tmp_schema" "$tmp_pack"' EXIT
glib-compile-schemas --strict "$root/schemas" --targetdir="$tmp_schema"
echo "    OK  schemas/org.gnome.shell.extensions.winter-is-coming.gschema.xml"

echo "==> Running GJS unit & Cairo render tests"
gjs -m "$root/tests/test_snow_world.js"

echo "==> Verifying extension bundle pack"
tmp_pack="$(mktemp -d "${TMPDIR:-/tmp}/winter-pack.XXXXXX")"
gnome-extensions pack "$root" \
  --force \
  --out-dir "$tmp_pack" \
  --extra-source=prefs.js \
  --extra-source=lib \
  --extra-source=LICENSE \
  --schema=schemas/org.gnome.shell.extensions.winter-is-coming.gschema.xml
echo "    OK  $(basename "$tmp_pack"/*.shell-extension.zip)"
