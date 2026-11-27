import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Cfg, SNOW_AMOUNTS, SnowWorld } from './lib/snowWorld.js';
import { SnowRenderer } from './lib/renderer.js';
import { FlakeLayerEffect, GpuSpriteAtlas } from './lib/gpuSprites.js';
import { GuideDialog, WinterIndicator } from './lib/indicator.js';

const PILE_TOP_PAD = Cfg.WindowPileMax + 2;
const PILE_EXTRA_BOTTOM = 24;
const GROUND_TOP_PAD = Cfg.GroundPileMax + 2;
const PILE_REPAINT_INTERVAL = 0.25;

const StripDrawingArea = GObject.registerClass(
    class StripDrawingArea extends St.DrawingArea {
        _init(drawFn) {
            super._init({
                reactive: false,
                can_focus: false,
            });
            this._drawFn = drawFn;
        }

        vfunc_repaint() {
            const cr = this.get_context();
            try {
                if (this._drawFn) this._drawFn(cr);
            } finally {
                cr.$dispose();
            }
        }

        destroy() {
            this._drawFn = null;
            super.destroy();
        }
    }
);

export default class WinterIsComingExtension extends Extension {
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.winter-is-coming');

        this._paused = false;
        const configuredAmount = this._settings.get_string('snow-amount');
        this._snowAmount = configuredAmount in SNOW_AMOUNTS ? configuredAmount : 'medium';
        Cfg.TargetFlakes = SNOW_AMOUNTS[this._snowAmount];
        this._snowOnWindows = this._settings.get_boolean('snow-on-windows');

        const stageW = Math.max(1, global.stage.width);
        const stageH = Math.max(1, global.stage.height);

        this._world = new SnowWorld(stageW, stageH);
        this._world.lightsOn = this._settings.get_boolean('fairy-lights');
        this._renderer = new SnowRenderer();
        this._atlas = new GpuSpriteAtlas();

        this._overlayRoot = new St.Widget({
            reactive: false,
            can_focus: false,
        });
        this._overlayRoot.set_position(0, 0);
        this._overlayRoot.set_size(stageW, stageH);

        this._backFlakes = new St.Widget({ reactive: false, can_focus: false });
        this._backFlakes.set_size(stageW, stageH);
        this._backFlakes.add_effect(new FlakeLayerEffect(this._atlas, this._world, 'back'));
        this._overlayRoot.add_child(this._backFlakes);

        this._pilesGroup = new St.Widget({ reactive: false, can_focus: false });
        this._pilesGroup.set_size(stageW, stageH);
        this._overlayRoot.add_child(this._pilesGroup);

        this._groundStrip = new StripDrawingArea((cr) => {
            if (this._world?.ground && this._renderer) {
                const g = this._world.ground;
                this._renderer.drawPile(cr, g, 0, g.topY - GROUND_TOP_PAD);
            }
        });
        this._pilesGroup.add_child(this._groundStrip);
        this._syncGroundGeometry();

        this._winStrips = new Map();

        this._bulbsActor = new St.Widget({ reactive: false, can_focus: false });
        this._bulbsActor.set_size(stageW, stageH);
        this._bulbsActor.add_effect(new FlakeLayerEffect(this._atlas, this._world, 'bulbs'));
        this._overlayRoot.add_child(this._bulbsActor);

        this._ballBox = { x: 0, y: 0, w: 1, h: 1 };
        this._ballCanvas = new StripDrawingArea((cr) => {
            if (this._world && this._renderer && this._world.balls.length > 0) {
                this._renderer.drawBalls(cr, this._world, this._ballBox.x, this._ballBox.y);
            }
        });
        this._ballCanvas.connect('button-press-event', (_actor, event) => this._onBallPress(event));
        this._ballCanvas.connect('motion-event', (_actor, event) => this._onBallMotion(event));
        this._ballCanvas.connect('button-release-event', (_actor, event) => this._onBallRelease(event));
        this._ballCanvas.hide();
        this._overlayRoot.add_child(this._ballCanvas);

        this._frontFlakes = new St.Widget({ reactive: false, can_focus: false });
        this._frontFlakes.set_size(stageW, stageH);
        this._frontFlakes.add_effect(new FlakeLayerEffect(this._atlas, this._world, 'front'));
        this._overlayRoot.add_child(this._frontFlakes);

        this._overlayDestroyedId = this._overlayRoot.connect('destroy', () => {
            this._overlayDestroyedId = 0;
            this._overlayRoot = null;
            this._backFlakes = null;
            this._pilesGroup = null;
            this._groundStrip = null;
            this._bulbsActor = null;
            this._ballCanvas = null;
            this._frontFlakes = null;
            this._winStrips.clear();
        });

        if (Main.layoutManager.panelBox && Main.layoutManager.panelBox.get_parent() === Main.layoutManager.uiGroup) {
            Main.layoutManager.uiGroup.insert_child_below(this._overlayRoot, Main.layoutManager.panelBox);
        } else if (global.window_group && global.window_group.get_parent() === Main.layoutManager.uiGroup) {
            Main.layoutManager.uiGroup.insert_child_above(this._overlayRoot, global.window_group);
        } else {
            Main.layoutManager.uiGroup.add_child(this._overlayRoot);
        }

        this._indicator = new WinterIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settingsChangedIds = [
            this._settings.connect('changed::snow-amount', () => {
                const key = this._settings.get_string('snow-amount');
                if (key in SNOW_AMOUNTS) {
                    this._snowAmount = key;
                    Cfg.TargetFlakes = SNOW_AMOUNTS[key];
                    this._indicator?.syncState();
                }
            }),
            this._settings.connect('changed::fairy-lights', () => {
                if (!this._world) return;
                this._world.lightsOn = this._settings.get_boolean('fairy-lights');
                for (const entry of this._winStrips.values()) entry.forceRepaint = true;
                this._indicator?.syncState();
            }),
            this._settings.connect('changed::snow-on-windows', () => {
                this._snowOnWindows = this._settings.get_boolean('snow-on-windows');
            }),
        ];

        this._catching = false;
        this._dragging = false;
        this._grab = null;
        this._dragX = 0;
        this._dragY = 0;
        this._filterId = 0;
        this._capturedEventId = 0;
        this._guideDialog = null;
        this._pileRepaintAcc = 0;
        this._cachedTaskbarTop = this._computeTaskbarTop();
        this._taskbarCheckAcc = 0;

        this._lastUs = GLib.get_monotonic_time();
        this._frameTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Cfg.FrameMs, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._cachedTaskbarTop = this._computeTaskbarTop();
            this._handleResize();
        });
        this._stageAllocId = global.stage.connect('notify::size', () => {
            this._handleResize();
        });

        if (!this._settings.get_boolean('seen-guide')) {
            this._settings.set_boolean('seen-guide', true);
            this._guideTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._guideTimerId = 0;
                this.showGuide();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    disable() {
        if (this._frameTimerId) {
            GLib.source_remove(this._frameTimerId);
            this._frameTimerId = 0;
        }
        if (this._guideTimerId) {
            GLib.source_remove(this._guideTimerId);
            this._guideTimerId = 0;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._stageAllocId) {
            global.stage.disconnect(this._stageAllocId);
            this._stageAllocId = 0;
        }
        if (this._settings && this._settingsChangedIds) {
            for (const id of this._settingsChangedIds) this._settings.disconnect(id);
            this._settingsChangedIds = null;
        }

        this._endDrag();
        this._setCatching(false);
        this._removeEventFilter();

        if (this._guideDialog) {
            this._guideDialog.close();
            this._guideDialog = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._overlayRoot) {
            if (this._overlayDestroyedId) {
                this._overlayRoot.disconnect(this._overlayDestroyedId);
                this._overlayDestroyedId = 0;
            }
            this._overlayRoot.destroy();
            this._overlayRoot = null;
        }

        this._winStrips.clear();
        this._backFlakes = null;
        this._pilesGroup = null;
        this._groundStrip = null;
        this._bulbsActor = null;
        this._ballCanvas = null;
        this._frontFlakes = null;

        if (this._atlas) {
            this._atlas.destroy();
            this._atlas = null;
        }
        if (this._renderer) {
            this._renderer.destroy();
            this._renderer = null;
        }

        this._settings = null;
        this._world = null;
    }

    get paused() {
        return this._paused;
    }

    get snowAmount() {
        return this._snowAmount;
    }

    get lightsOn() {
        return this._world ? this._world.lightsOn : false;
    }

    togglePaused() {
        this._paused = !this._paused;
        if (this._paused) {
            this._endDrag();
            this._setCatching(false);
            this._overlayRoot?.hide();
        } else {
            this._lastUs = GLib.get_monotonic_time();
            this._overlayRoot?.show();
        }
    }

    setSnowAmount(key) {
        if (!(key in SNOW_AMOUNTS)) return;
        this._snowAmount = key;
        Cfg.TargetFlakes = SNOW_AMOUNTS[key];
        this._settings?.set_string('snow-amount', key);
    }

    setLightsOn(on) {
        if (!this._world) return;
        this._world.lightsOn = Boolean(on);
        this._settings?.set_boolean('fairy-lights', this._world.lightsOn);
        for (const entry of this._winStrips.values()) {
            entry.forceRepaint = true;
        }
    }

    clearSnow() {
        this._endDrag();
        this._setCatching(false);
        if (!this._world) return;
        this._world.clearAll();
        this._groundStrip?.queue_repaint();
        this._world.ground.renderDirty = false;
        for (const [id, entry] of this._winStrips.entries()) {
            const p = this._world.piles.get(id);
            if (p) p.renderDirty = false;
            if (!this._world.lightsOn) {
                entry.actor.hide();
            } else {
                entry.actor.queue_repaint();
            }
        }
        this._ballCanvas?.hide();
        this._backFlakes?.queue_redraw();
        this._frontFlakes?.queue_redraw();
    }

    showGuide() {
        if (this._guideDialog) return;
        this._guideDialog = new GuideDialog();
        this._guideDialog.connect('closed', () => {
            this._guideDialog = null;
        });
        this._guideDialog.open();
    }

    _handleResize() {
        if (!this._overlayRoot || !this._world) return;
        const w = Math.max(1, global.stage.width);
        const h = Math.max(1, global.stage.height);
        this._overlayRoot.set_size(w, h);
        this._backFlakes.set_size(w, h);
        this._pilesGroup.set_size(w, h);
        this._bulbsActor.set_size(w, h);
        this._frontFlakes.set_size(w, h);
        this._world.resize(w, h);
        this._syncGroundGeometry();
    }

    _syncGroundGeometry() {
        if (!this._groundStrip || !this._world?.ground) return;
        const g = this._world.ground;
        this._groundStrip.set_position(0, g.topY - GROUND_TOP_PAD);
        this._groundStrip.set_size(Math.max(1, this._world.w), GROUND_TOP_PAD + 4);
    }

    _tick() {
        if (this._paused || !this._world || !this._overlayRoot) return;

        if (Main.overview.visible || Main.sessionMode.isLocked) {
            if (this._overlayRoot.visible) {
                this._endDrag();
                this._setCatching(false);
                this._overlayRoot.hide();
            }
            this._lastUs = GLib.get_monotonic_time();
            return;
        }
        if (!this._overlayRoot.visible) {
            this._overlayRoot.show();
        }

        const nowUs = GLib.get_monotonic_time();
        const dt = Math.min((nowUs - this._lastUs) / 1_000_000, 1 / 20);
        this._lastUs = nowUs;

        const [mx, my] = global.get_pointer();
        if (this._dragging && this._grab && this._grab.is_revoked()) {
            this._endDrag();
        }

        this._taskbarCheckAcc += dt;
        if (this._taskbarCheckAcc >= 0.5) {
            this._cachedTaskbarTop = this._computeTaskbarTop();
            this._taskbarCheckAcc = 0;
        }

        const ptrX = this._dragging ? this._dragX : mx;
        const ptrY = this._dragging ? this._dragY : my;

        this._world.update(
            dt,
            () => (this._snowOnWindows ? this._readWindows() : []),
            () => this._cachedTaskbarTop,
            ptrX,
            ptrY
        );

        if (this._world.balls.length > 0 || this._dragging) {
            this._installEventFilter();
        } else {
            this._removeEventFilter();
        }
        this._setCatching(this._world.wantsMouse(ptrX, ptrY));

        this._backFlakes.queue_redraw();
        this._frontFlakes.queue_redraw();
        if (this._world.lightsOn && this._world.lights.size > 0) {
            this._bulbsActor.show();
            this._bulbsActor.queue_redraw();
        } else if (this._bulbsActor.visible) {
            this._bulbsActor.hide();
        }

        this._pileRepaintAcc += dt;
        const allowPileRepaint = this._pileRepaintAcc >= PILE_REPAINT_INTERVAL;
        if (allowPileRepaint) this._pileRepaintAcc = 0;

        this._syncPilesAndWires(allowPileRepaint);
        this._syncBalls();
    }

    _syncPilesAndWires(allowPileRepaint) {
        if (!this._pilesGroup || !this._groundStrip) return;
        const g = this._world.ground;
        if (g.renderDirty && allowPileRepaint) {
            this._syncGroundGeometry();
            this._groundStrip.queue_repaint();
            g.renderDirty = false;
        }

        for (const [id, entry] of this._winStrips.entries()) {
            if (!this._world.piles.has(id)) {
                entry.actor.destroy();
                this._winStrips.delete(id);
            }
        }

        const lightsOn = this._world.lightsOn;
        for (const [id, pile] of this._world.piles.entries()) {
            const ls = lightsOn ? this._world.lights.get(id) : null;
            const hasContent = lightsOn || pile.total > 0.3;

            let entry = this._winStrips.get(id);
            if (!hasContent && !pile.renderDirty) {
                if (entry && entry.actor.visible) entry.actor.hide();
                continue;
            }

            if (!entry) {
                const stripId = id;
                const actor = new StripDrawingArea((cr) => {
                    const p = this._world?.piles.get(stripId);
                    const s = this._world?.lightsOn ? this._world.lights.get(stripId) : null;
                    if (!p || !this._renderer) return;
                    const ox = p.minX;
                    const oy = p.topY - PILE_TOP_PAD;
                    this._renderer.drawPile(cr, p, ox, oy);
                    if (s) this._renderer.drawWire(cr, s, ox, oy);
                });
                this._pilesGroup.add_child(actor);
                entry = { actor, x: NaN, y: NaN, width: 0, height: 0, hadWire: false, forceRepaint: true };
                this._winStrips.set(id, entry);
            }

            const stripX = pile.minX;
            const stripY = pile.topY - PILE_TOP_PAD;
            const stripW = Math.max(1, pile.width);
            const stripH = PILE_TOP_PAD + (lightsOn ? PILE_EXTRA_BOTTOM : 4);

            const sizeChanged = entry.width !== stripW || entry.height !== stripH;
            if (entry.x !== stripX || entry.y !== stripY) {
                entry.actor.set_position(stripX, stripY);
                entry.x = stripX;
                entry.y = stripY;
            }
            if (sizeChanged) {
                entry.actor.set_size(stripW, stripH);
                entry.width = stripW;
                entry.height = stripH;
                entry.forceRepaint = true;
            }
            if (entry.hadWire !== Boolean(ls)) {
                entry.hadWire = Boolean(ls);
                entry.forceRepaint = true;
            }

            if (!entry.actor.visible) entry.actor.show();

            const wireDirty = Boolean(ls && ls.wireDirty);
            if (entry.forceRepaint || wireDirty || (pile.renderDirty && allowPileRepaint)) {
                entry.actor.queue_repaint();
                entry.forceRepaint = false;
                pile.renderDirty = false;
                if (ls) ls.wireDirty = false;
            }
        }
    }

    _syncBalls() {
        if (!this._ballCanvas) return;
        const balls = this._world.balls;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let anyVisible = false;

        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            if (b.hidden) continue;
            anyVisible = true;
            const pad = b.r * 2.2 + 4;
            if (b.x - pad < minX) minX = b.x - pad;
            if (b.y - pad < minY) minY = b.y - pad;
            if (b.x + pad > maxX) maxX = b.x + pad;
            if (b.y + pad > maxY) maxY = b.y + pad;
        }

        if (!anyVisible) {
            if (this._ballCanvas.visible) this._ballCanvas.hide();
            this._world.ballsDirty = false;
            return;
        }

        const bx = Math.max(0, Math.floor(minX));
        const by = Math.max(0, Math.floor(minY));
        const bw = Math.max(1, Math.ceil(maxX) - bx);
        const bh = Math.max(1, Math.ceil(maxY) - by);

        const boxChanged =
            this._ballBox.x !== bx ||
            this._ballBox.y !== by ||
            this._ballBox.w !== bw ||
            this._ballBox.h !== bh;

        if (boxChanged) {
            this._ballBox.x = bx;
            this._ballBox.y = by;
            this._ballBox.w = bw;
            this._ballBox.h = bh;
            this._ballCanvas.set_position(bx, by);
            this._ballCanvas.set_size(bw, bh);
        }

        if (!this._ballCanvas.visible) this._ballCanvas.show();
        if (this._world.ballsDirty || boxChanged) {
            this._ballCanvas.queue_repaint();
            this._world.ballsDirty = false;
        }
    }

    _readWindows() {
        const actors = global.get_window_actors();
        const wins = [];
        for (let i = actors.length - 1; i >= 0; i--) {
            const actor = actors[i];
            if (!actor.visible) continue;
            const mw = actor.meta_window;
            if (!mw || mw.minimized || !mw.showing_on_its_workspace()) continue;
            if (mw.is_override_redirect()) continue;
            const wt = mw.get_window_type();
            if (wt !== Meta.WindowType.NORMAL && wt !== Meta.WindowType.DIALOG) continue;

            const rect = mw.get_frame_rect();
            if (rect.width < 80 || rect.height < 40) continue;

            const id = typeof mw.get_id === 'function' ? mw.get_id() : (mw.get_stable_sequence?.() ?? i);
            wins.push({
                id,
                l: rect.x,
                t: rect.y,
                r: rect.x + rect.width,
                b: rect.y + rect.height,
                width: rect.width,
            });
        }
        return wins;
    }

    _computeTaskbarTop() {
        const idx = Main.layoutManager.primaryIndex;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return null;
        const workArea = Main.layoutManager.getWorkAreaForMonitor(idx);
        const monBottom = monitor.y + monitor.height;
        const waBottom = workArea.y + workArea.height;
        if (waBottom < monBottom - 4 && waBottom > monitor.y + monitor.height / 2) {
            return waBottom;
        }
        return null;
    }

    _setCatching(on) {
        const want = Boolean(on || this._dragging);
        if (this._ballCanvas) {
            this._ballCanvas.reactive = want;
        }
        if (on === this._catching) return;
        this._catching = on;
        if (on) {
            try {
                global.display.set_cursor(Meta.Cursor.POINTING_HAND);
            } catch {
                // Ignore
            }
        } else {
            try {
                global.display.set_cursor(Meta.Cursor.DEFAULT);
            } catch {
                // Ignore
            }
        }
    }

    _startDrag(mx, my) {
        if (this._dragging || !this._world || this._paused) return false;
        if (!this._world.mouseDown(mx, my)) return false;
        this._dragging = true;
        this._dragX = mx;
        this._dragY = my;
        if (this._ballCanvas) {
            this._ballCanvas.reactive = true;
            try {
                this._grab = global.stage.grab(this._ballCanvas);
            } catch {
                this._grab = null;
            }
        }
        this._setCatching(true);
        return true;
    }

    _endDrag() {
        if (!this._dragging) return;
        this._dragging = false;
        if (this._grab) {
            try {
                this._grab.dismiss();
            } catch {
                // Ignore
            }
            this._grab = null;
        }
        if (this._world) this._world.mouseUp();
        if (this._ballCanvas) {
            this._ballCanvas.reactive = this._catching;
        }
        if (this._world && this._world.balls.length === 0) {
            this._removeEventFilter();
        }
    }

    _onBallPress(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        const [mx, my] = event.get_coords();
        return this._startDrag(mx, my) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    _onBallMotion(event) {
        if (!this._dragging) return Clutter.EVENT_PROPAGATE;
        const [mx, my] = event.get_coords();
        this._dragX = mx;
        this._dragY = my;
        return Clutter.EVENT_STOP;
    }

    _onBallRelease(event) {
        if (!this._dragging || event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
        this._endDrag();
        return Clutter.EVENT_STOP;
    }

    _onStageEvent(event) {
        if (!this._world || this._paused) return Clutter.EVENT_PROPAGATE;
        const type = event.type();

        if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            if (!this._dragging) {
                const [mx, my] = event.get_coords();
                if (this._startDrag(mx, my)) return Clutter.EVENT_STOP;
            }
        } else if (this._dragging) {
            if (type === Clutter.EventType.BUTTON_RELEASE && event.get_button() === Clutter.BUTTON_PRIMARY) {
                this._endDrag();
                return Clutter.EVENT_STOP;
            }
            if (type === Clutter.EventType.MOTION) {
                const [mx, my] = event.get_coords();
                this._dragX = mx;
                this._dragY = my;
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _installEventFilter() {
        if (this._filterId || this._capturedEventId) return;
        if (typeof Clutter.event_add_filter === 'function') {
            this._filterId = Clutter.event_add_filter(global.stage, (event, _actor) =>
                this._onStageEvent(event)
            );
        } else {
            this._capturedEventId = global.stage.connect('captured-event', (_source, event) =>
                this._onStageEvent(event)
            );
        }
    }

    _removeEventFilter() {
        if (this._filterId) {
            if (typeof Clutter.event_remove_filter === 'function') {
                Clutter.event_remove_filter(this._filterId);
            }
            this._filterId = 0;
        }
        if (this._capturedEventId) {
            global.stage.disconnect(this._capturedEventId);
            this._capturedEventId = 0;
        }
    }
}
