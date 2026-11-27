# ❄ WinterIsComing for GNOME Shell

A native Linux / GNOME Shell port of [yike-shi/WINTER_IS_COMING](https://github.com/yike-shi/WINTER_IS_COMING) (**GNOME 45–51**, Wayland & X11).

Snow drifts across your desktop, settles on top of open windows and your bottom dock/screen edge, and flies off when you move or close windows. Roll snowballs with your mouse, push or carry them around, stack three into a snowman, and hang twinkling fairy lights.

## Features

- **Desktop snowfall**: Three depth layers with gusty wind and gentle sway.
- **Window & dock interaction**: Snow piles onto window titlebars (occluded behind front windows) and the bottom dock/edge, and flings off as clumps when windows move, resize, or close.
- **Snowballs & snowmen**: Slide the mouse sideways over snow to roll a snowball, push balls into each other, click-and-drag to carry or throw, and stack three balls into a snowman (coal eyes, carrot nose, smile, red scarf, buttons, and stick arms).
- **Fairy lights**: Twinkling colored bulbs on a swinging wire along the top of every window.
- **Low overhead**: GPU-batched `Cogl.Texture2D` sprite rendering for flakes/bulbs paired with dirty-checked narrow Cairo strips for snow piles and snowballs.
- **Native integration**: Top-bar **❄** menu, GTK4 / Libadwaita preferences (`prefs.js`), GSettings persistence, and automatic hiding during GNOME Overview and lock screen.
- **100% offline**: Zero network requests, zero telemetry.

## Requirements

- **GNOME Shell**: `45` – `51` (tested on GNOME Shell `50.3` Wayland)
- **CLI tools** (for install/build): `gnome-extensions`, `glib-compile-schemas` (plus `gjs` and `node` if running `make check`)

## Installation

```sh
git clone <your-repo-url>
cd winter-is-coming-linux
make install
```

Or run `./scripts/install.sh` directly.

> **Wayland note:** GNOME Shell on Wayland scans newly added extensions at session start. If `gnome-extensions enable winter-is-coming@linux` says the extension does not exist yet, log out and back in once, then run:
> ```sh
> gnome-extensions enable winter-is-coming@linux
> ```

## Controls

Click the **❄** indicator in the GNOME top bar:

- **Pause snow / Resume snow**
- **Snow amount**: `Light` (80) · `Medium` (160) · `Heavy` (320)
- **Fairy lights ✨**: Toggle window fairy lights
- **Clear snow**: Remove all piled snow and snowballs
- **How to play**: Open the quick tips dialog
- **Preferences**: Open the GNOME Extensions settings window (also lets you disable window-top snow accumulation)
- **Quit**: Disable the extension

## Architecture

```text
.
├── extension.js                  # GNOME Shell lifecycle, window tracking, pointer grab
├── prefs.js                      # GTK4 / Libadwaita Preferences UI
├── metadata.json                 # Extension metadata
├── stylesheet.css                # Top-bar & dialog styles
├── lib/
│   ├── snowWorld.js              # Pure JS physics, piles, occlusion, snowballs, lights
│   ├── renderer.js               # Cairo renderer for piles, light wires, and snowballs
│   ├── gpuSprites.js             # Cogl.Texture2D + Clutter.Effect GPU sprite batcher
│   └── indicator.js              # Top-bar ❄ menu & How-to-Play dialog
├── schemas/
│   └── org.gnome.shell.extensions.winter-is-coming.gschema.xml
├── scripts/
│   ├── install.sh                # Pack & install extension bundle
│   ├── uninstall.sh              # Disable & remove extension (--purge resets GSettings)
│   └── check.sh                  # Syntax, schema, unit test, and pack checks
├── tests/
│   └── test_snow_world.js        # GJS unit & Cairo rendering tests
├── Makefile
└── .github/workflows/ci.yml
```

## Development & Testing

```sh
make check    # JS syntax check, strict GSettings schema compile, GJS tests, bundle pack
make test     # Run GJS unit & Cairo rendering tests
make build    # Build distributable dist/winter-is-coming@linux.shell-extension.zip
make clean    # Remove dist/
```

## Uninstall

```sh
./scripts/uninstall.sh          # Remove extension (keeps GSettings)
./scripts/uninstall.sh --purge  # Remove extension and reset GSettings
```

## Credits & License

Original macOS & Windows app and desktop snow simulation design by **Shi Yike** ([yike-shi/WINTER_IS_COMING](https://github.com/yike-shi/WINTER_IS_COMING)).

Licensed under the [MIT License](LICENSE).
