# Contributing

Contributions are welcome!

## Development Workflow

1. Fork and clone the repository.
2. Make your changes in a feature branch.
3. Run the verification suite before opening a pull request:
   ```sh
   make check
   ```
4. Test live inside GNOME Shell:
   ```sh
   make install
   ```
   *(On Wayland, log out and back in if GNOME Shell has not scanned a newly installed extension yet, or when reloading changed ESM modules.)*

## Guidelines

- Keep `lib/snowWorld.js` free of GNOME Shell / UI imports so simulation logic stays testable in standalone `gjs -m`.
- Follow the formatting in `.editorconfig` (4-space indentation for JS, 2-space for JSON/YAML/shell, tabs for `Makefile`).
- Update `tests/test_snow_world.js` and `CHANGELOG.md` when adding or changing behavior.
- This project connects to zero external servers and collects no telemetry; keep it offline-only.
