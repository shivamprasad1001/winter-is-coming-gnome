import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { MusicPlayer } from './musicPlayer.js';

const GUIDE_TEXT =
    "It's snowing on your desktop! Here's what you can do:\n\n" +
    '•  Roll a snowball: slide your mouse sideways over snow\n' +
    '•  Push it: roll one snowball into another\n' +
    '•  Carry it: hold the left mouse button on a snowball and drag\n' +
    '•  Build a snowman: stack three snowballs\n' +
    '•  Make snow fly: drag a window\n' +
    '•  Hang fairy lights: ❄ menu → Fairy lights';

export const GuideDialog = GObject.registerClass(
    class GuideDialog extends ModalDialog.ModalDialog {
        _init() {
            super._init({ destroyOnClose: true, styleClass: 'winter-guide-dialog' });
            this.contentLayout.add_child(new St.Label({
                text: 'Welcome to WinterIsComing ❄',
                style_class: 'winter-guide-title',
            }));
            const body = new St.Label({
                text: GUIDE_TEXT,
                style_class: 'winter-guide-body',
            });
            body.clutter_text.line_wrap = true;
            this.contentLayout.add_child(body);
            this.addButton({
                label: 'OK',
                action: () => this.close(),
                key: Clutter.KEY_Escape,
                default: true,
            });
        }
    }
);

export const WinterIndicator = GObject.registerClass(
    class WinterIndicator extends PanelMenu.Button {
        _init(ext) {
            super._init(0.0, 'WinterIsComing');
            this._ext = ext;
            this._musicSettings = ext._settings;
            this._musicPlayer = new MusicPlayer(this._musicSettings);
            this._musicSettingsChangedIds = [
                this._musicSettings.connect('changed::music-volume', () => {
                    this._musicPlayer?.setVolume(this._musicSettings.get_double('music-volume'));
                }),
                this._musicSettings.connect('changed::music-track-uri', () => {
                    this._musicPlayer?.stop();
                    this._syncMusicLabel();
                }),
            ];

            const label = new St.Label({
                text: '❄',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'winter-indicator-label',
            });
            this.add_child(label);
            this._buildMenu();

            if (this._musicSettings.get_boolean('music-autoplay') &&
                this._musicSettings.get_string('music-track-uri')) {
                this._musicPlayer.play();
            }
        }

        _buildMenu() {
            this.menu.removeAll();
            this._pauseItem = new PopupMenu.PopupMenuItem(
                this._ext.paused ? 'Resume snow' : 'Pause snow'
            );
            this._pauseItem.connect('activate', () => {
                this._ext.togglePaused();
                this._pauseItem.label.text = this._ext.paused ? 'Resume snow' : 'Pause snow';
            });
            this.menu.addMenuItem(this._pauseItem);

            const amountSub = new PopupMenu.PopupSubMenuMenuItem('Snow amount');
            this._amountItems = new Map();
            for (const [key, label] of [['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']]) {
                const item = new PopupMenu.PopupMenuItem(label);
                item.connect('activate', () => {
                    this._ext.setSnowAmount(key);
                    this._syncAmounts();
                });
                amountSub.menu.addMenuItem(item);
                this._amountItems.set(key, item);
            }
            this.menu.addMenuItem(amountSub);

            this._lightsItem = new PopupMenu.PopupSwitchMenuItem('Fairy lights ✨', this._ext.lightsOn);
            this._lightsItem.connect('toggled', (_item, state) => this._ext.setLightsOn(state));
            this.menu.addMenuItem(this._lightsItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._musicItem = new PopupMenu.PopupMenuItem('Play selected song');
            this._musicItem.connect('activate', () => {
                if (this._musicPlayer?.playing) this._musicPlayer.pause();
                else this._musicPlayer?.toggle();
                this._syncMusicLabel();
            });
            this.menu.addMenuItem(this._musicItem);

            const stopMusicItem = new PopupMenu.PopupMenuItem('Stop music');
            stopMusicItem.connect('activate', () => {
                this._musicPlayer?.stop();
                this._syncMusicLabel();
            });
            this.menu.addMenuItem(stopMusicItem);

            const clearItem = new PopupMenu.PopupMenuItem('Clear snow');
            clearItem.connect('activate', () => this._ext.clearSnow());
            this.menu.addMenuItem(clearItem);
            const guideItem = new PopupMenu.PopupMenuItem('How to play');
            guideItem.connect('activate', () => this._ext.showGuide());
            this.menu.addMenuItem(guideItem);
            const prefsItem = new PopupMenu.PopupMenuItem('Preferences');
            prefsItem.connect('activate', () => this._ext.openPreferences());
            this.menu.addMenuItem(prefsItem);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const quitItem = new PopupMenu.PopupMenuItem('Quit');
            quitItem.connect('activate', () => Main.extensionManager.disableExtension(this._ext.uuid));
            this.menu.addMenuItem(quitItem);
            this.syncState();
        }

        _syncMusicLabel() {
            if (!this._musicItem || !this._musicSettings) return;
            const hasTrack = Boolean(this._musicSettings.get_string('music-track-uri'));
            this._musicItem.label.text = !hasTrack
                ? 'Choose a song in Preferences'
                : (this._musicPlayer?.playing ? 'Pause music' : 'Play selected song');
            this._musicItem.setSensitive(hasTrack && Boolean(this._musicPlayer?.available));
        }

        syncState() {
            if (!this._ext) return;
            this._syncAmounts();
            if (this._lightsItem && this._lightsItem.state !== this._ext.lightsOn)
                this._lightsItem.setToggleState(this._ext.lightsOn);
            this._syncMusicLabel();
        }

        _syncAmounts() {
            const cur = this._ext.snowAmount;
            for (const [key, item] of this._amountItems.entries()) {
                item.setOrnament(key === cur ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            }
        }

        destroy() {
            if (this._musicSettings && this._musicSettingsChangedIds) {
                for (const id of this._musicSettingsChangedIds)
                    this._musicSettings.disconnect(id);
            }
            this._musicSettingsChangedIds = null;
            this._musicPlayer?.destroy();
            this._musicPlayer = null;
            this._musicSettings = null;
            this._ext = null;
            super.destroy();
        }
    }
);
