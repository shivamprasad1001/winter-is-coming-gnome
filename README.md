# ❄ WinterIsComing for GNOME Shell

<p>
  <a href="https://github.com/shivamprasad1001/winter-is-coming-gnome/actions/workflows/ci.yml"><img src="https://github.com/shivamprasad1001/winter-is-coming-gnome/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/badge/GNOME%20Shell-45--51-4a86cf?logo=gnome&logoColor=white" alt="GNOME Shell 45-51">
  <img src="https://img.shields.io/badge/Wayland%20%26%20X11-supported-2ea44f" alt="Wayland and X11 supported">
  <img src="https://img.shields.io/badge/version-1.0.0-informational" alt="Version 1.0.0">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

A native Linux / GNOME Shell port of [yike-shi/WINTER_IS_COMING](https://github.com/yike-shi/WINTER_IS_COMING) (**GNOME 45–51**, Wayland & X11).

Snow drifts across your desktop, settles on top of open windows and your bottom dock/screen edge, and flies off when you move or close windows. Roll snowballs with your mouse, push or carry them around, stack three into a snowman, and hang twinkling fairy lights.

## Features

- **Desktop snowfall**: Three depth layers with gusty wind and gentle sway.
- **Window & dock interaction**: Snow piles onto window titlebars (occluded behind front windows) and the bottom dock/edge, and flings off as clumps when windows move, resize, or close.
- **Snowballs & snowmen**: Slide the mouse sideways over snow to roll a snowball, push balls into each other, click-and-drag to carry or throw, and stack three balls into a snowman (coal eyes, carrot nose, smile, red scarf, buttons, and stick arms).
- **Fairy lights**: Twinkling colored bulbs on a swinging wire along the top of every window.
- **Local music**: Choose an audio file already on your device, then play/pause/stop it from the top-bar menu. Autoplay, selected file, and volume are saved in preferences. No audio is downloaded and no network request is made for music.
- **Low overhead**: GPU-batched `Cogl.Texture2D` sprite rendering for flakes/bulbs paired with dirty-checked narrow Cairo strips for snow piles and snowballs.
- **Native integration**: Top-bar **❄** menu, GTK4 / Libadwaita preferences (`prefs.js`), GSettings persistence, and automatic hiding during GNOME Overview and lock screen.
- **Offline by design**: Zero telemetry or network requests.

## Requirements

- **GNOME Shell**: `45` – `51` (tested on GNOME Shell `50.3` Wayland)
- **CLI tools** (for install/build): `gnome-extensions`, `glib-compile-schemas` (plus `gjs` and `node` if running `make check`)
- **Music playback** (optional): GStreamer introspection bindings and audio plugins installed by your distribution. If they are unavailable, snowfall still works and the music controls remain unavailable.

## Installation

### Quick Install (one command)

Paste this into your terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/shivamprasad1001/winter-is-coming-gnome/main/scripts/install.sh | bash
```

> **Auto-Enable Note:** The installer automatically enables WinterIsComing in your GNOME Shell settings (`enabled-extensions`). If you are on Wayland and installing for the first time, GNOME Shell indexes new extension folders upon session start — simply log out and back in, and snow will start falling automatically without any manual toggling!

### From Source

```sh
git clone https://github.com/shivamprasad1001/winter-is-coming-gnome.git
cd winter-is-coming-gnome
make install
```

## Controls

Click the **❄** indicator in the GNOME top bar:

- **Pause snow / Resume snow**
- **Snow amount**: `Light` (80) · `Medium` (160) · `Heavy` (320)
- **Fairy lights ✨**: Toggle window fairy lights
- **Play selected song / Pause music / Stop music**: Control your selected local audio track
- **Clear snow**: Remove all piled snow and snowballs
- **How to play**: Open the quick tips dialog
- **Preferences**: Open GNOME Extensions settings. Under **Mr. Snowman music**, choose a local audio file, toggle autoplay, and set volume.
- **Quit**: Disable the extension

The music player never downloads a track or contacts an online audio source. Select or clear the local file yourself in Preferences.

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
│   ├── indicator.js              # Top-bar menu, music controls & How-to-Play dialog
│   └── musicPlayer.js             # Local GStreamer playback
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
make check    # JS syntax check, schema compile, GJS tests, bundle pack
make test     # Run GJS unit & Cairo rendering tests
make build    # Build distributable dist/winter-is-coming@linux.shell-extension.zip
make clean    # Remove dist/
```

## Uninstall

```sh
curl -fsSL https://raw.githubusercontent.com/shivamprasad1001/winter-is-coming-gnome/main/scripts/uninstall.sh | bash
```

Or from a local clone:

```sh
./scripts/uninstall.sh          # Remove extension (keeps GSettings)
./scripts/uninstall.sh --purge  # Remove extension and reset GSettings
```

## Credits & License

Original macOS & Windows app and desktop snow simulation design by **Shi Yike** ([yike-shi/WINTER_IS_COMING](https://github.com/yike-shi/WINTER_IS_COMING)).

Licensed under the [MIT License](LICENSE).
