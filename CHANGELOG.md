# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-11-27

### Added
- Native GNOME Shell extension (`GNOME 45–51`, Wayland & X11) porting [yike-shi/WINTER_IS_COMING](https://github.com/yike-shi/WINTER_IS_COMING).
- Three-layer snowfall simulation with gusty wind, window-top and dock/ground snow piles, occlusion behind front windows, and snow flinging when moving/resizing/closing windows.
- Interactive snowball rolling, chain pushing, click-and-drag carrying/throwing, and 3-ball snowman stacking (coal eyes, carrot nose, smile, red scarf, buttons, stick arms).
- Animated twinkling fairy lights with damped swing and left-to-right reveal along open windows.
- Top-bar `❄` menu indicator, welcome guide dialog, GSettings schema (`org.gnome.shell.extensions.winter-is-coming`), and GTK4/Libadwaita preferences window (`prefs.js`).
- GPU-batched `Cogl.Texture2D` sprite rendering (`lib/gpuSprites.js`) and dirty-checked narrow Cairo strips (`lib/renderer.js`) to keep idle CPU low.
- Unit tests (`tests/test_snow_world.js`), `Makefile`, install/uninstall/check scripts, and GitHub Actions CI.
