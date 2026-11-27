/**
 * Core desktop snow physics, snow piles, snowballs, snowman stacking, and fairy lights.
 * Ported from WinterIsComing (yike-shi/WINTER_IS_COMING).
 */

export const Cfg = {
    TargetFlakes: 160,
    ColW: 3,
    WindowPileMax: 16,
    GroundPileMax: 34,
    TaskbarPileMax: 18,
    TaskbarGain: 2.0,
    Gravity: 900,
    PollInterval: 1 / 12,
    MaxClumps: 900,
    FallSpeed: 1.5,
    FlakesInFront: true,
    InFrontFraction: 0.4,
    FrameMs: 42,
    BallStartRadius: 3,
    BallMaxRadius: 28,
    MaxBalls: 20,
    LightSpacing: 22,
    LightSpan: 120,
    LightSag: 9,
    LightInset: 14,
    BulbGlow: 19,
    BulbCore: 5.5,
};

export const SNOW_AMOUNTS = {
    light: 80,
    medium: 160,
    heavy: 320,
};

const LAYERS = [
    { sizeMin: 1.8, sizeMax: 3.0, speedMin: 22, speedMax: 38, alphaMin: 0.30, alphaMax: 0.50, swayMin: 5, swayMax: 10, wind: 0.5 },
    { sizeMin: 3.0, sizeMax: 4.8, speedMin: 40, speedMax: 65, alphaMin: 0.60, alphaMax: 0.80, swayMin: 9, swayMax: 16, wind: 0.8 },
    { sizeMin: 4.8, sizeMax: 7.5, speedMin: 70, speedMax: 105, alphaMin: 0.85, alphaMax: 1.00, swayMin: 14, swayMax: 24, wind: 1.1 },
];

const GROUND_ID = -2;
const BURST_ID = -3;
const SPREAD = [
    [0, 1.0],
    [-1, 0.75],
    [1, 0.75],
    [-2, 0.45],
    [2, 0.45],
    [-3, 0.2],
    [3, 0.2],
];

function rnd(a, b) {
    return a + Math.random() * (b - a);
}

function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

function winContains(w, x, y) {
    return x >= w.l && x < w.r && y >= w.t && y < w.b;
}

class Flake {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.size = 4;
        this.alpha = 1;
        this.swayAmp = 0;
        this.swayFreq = 1;
        this.phase = 0;
        this.windFactor = 1;
        this.layer = 0;
        this.clump = false;
        this.inFront = false;
        this.ignoreId = -1;
        this.ignoreUntil = 0;
    }
}

export class Pile {
    constructor(minX, topY, width, maxH) {
        this.minX = minX;
        this.topY = topY;
        this.width = width;
        this.maxH = maxH;
        const n = Math.max(1, Math.ceil(width / Cfg.ColW));
        this.count = n;
        this.h = new Float32Array(n);
        this.caps = new Float32Array(n);
        this.occ = new Uint8Array(n);
        this.dirty = false;
        this.renderDirty = true;

        for (let i = 0; i < n; i++) {
            const edgeDist = Math.min(i + 0.5, n - i - 0.5) * Cfg.ColW;
            const t = Math.min(1, edgeDist / (maxH * 2.2));
            this.caps[i] = maxH * Math.sqrt(t);
        }
    }

    get total() {
        let s = 0;
        for (let i = 0; i < this.count; i++) s += this.h[i];
        return s;
    }

    col(x) {
        const c = Math.floor((x - this.minX) / Cfg.ColW);
        return c >= 0 && c < this.count ? c : -1;
    }

    colX(c) {
        return this.minX + (c + 0.5) * Cfg.ColW;
    }

    surface(c) {
        return this.topY - this.h[c];
    }

    add(c, amount) {
        let changed = false;
        for (let k = 0; k < SPREAD.length; k++) {
            const i = c + SPREAD[k][0];
            if (i < 0 || i >= this.count || this.occ[i]) continue;
            const prev = this.h[i];
            const next = Math.min(this.caps[i], prev + amount * SPREAD[k][1]);
            if (next !== prev) {
                this.h[i] = next;
                changed = true;
            }
        }
        if (changed) {
            this.dirty = true;
            this.renderDirty = true;
        }
    }

    relax() {
        if (!this.dirty) return;
        let moved = false;
        for (let i = 0; i < this.count - 1; i++) {
            if (this.occ[i] || this.occ[i + 1]) continue;
            const d = this.h[i] - this.h[i + 1];
            const absD = Math.abs(d);
            if (absD > 1.0) {
                const m = (absD - 1.0) * 0.3 * Math.sign(d);
                this.h[i] = clamp(this.h[i] - m, 0, this.caps[i]);
                this.h[i + 1] = clamp(this.h[i + 1] + m, 0, this.caps[i + 1]);
                if (Math.abs(m) > 0.02) moved = true;
            }
        }
        this.dirty = moved;
        if (moved) this.renderDirty = true;
    }

    clear() {
        this.h.fill(0);
        this.dirty = true;
        this.renderDirty = true;
    }
}

export class Snowball {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.r = Cfg.BallStartRadius;
        this.vx = 0;
        this.vy = 0;
        this.rot = rnd(0, 6.28);
        this.pile = null;
        this.below = null;
        this.falling = false;
        this.dragging = false;
        this.hidden = false;
        this.decor = 0; // 0 = plain, 1 = snowman head, 2 = snowman body
        this.specks = [];

        while (this.specks.length < 18) {
            const d = Math.sqrt(rnd(0, 1)) * 0.86;
            const size = rnd(0.025, 0.06);
            if (d + size < 0.9) {
                this.specks.push({
                    ang: rnd(0, 6.28),
                    dist: d,
                    size,
                    alpha: rnd(0.25, 0.55),
                });
            }
        }
    }

    drop(vx, vy) {
        this.falling = true;
        this.dragging = false;
        this.pile = null;
        this.below = null;
        this.vx = vx;
        this.vy = vy;
    }
}

export const LIGHT_COLORS = [
    [1.00, 0.10, 0.12], // red
    [1.00, 0.62, 0.00], // amber
    [0.05, 0.95, 0.20], // green
    [0.10, 0.42, 1.00], // blue
    [1.00, 0.15, 0.62], // pink
];

const SWING_TIME = 1.4;

export class LightString {
    constructor(hungAt) {
        this.rect = null;
        this.hungAt = hungAt;
        this.swing = 0;
        this.sway = 0;
        this.bulbs = [];
        this.wire = [];
        this.wireDirty = true;
        this._lastWireSig = '';
    }

    updateSwing(t) {
        const tau = t - this.hungAt;
        if (tau >= SWING_TIME) {
            if (this.swing !== 0 || this.sway !== 0) {
                this.swing = 0;
                this.sway = 0;
                this.wireDirty = true;
            }
            return;
        }
        const e = Math.exp(-4.0 * tau);
        this.swing = 0.9 * e * Math.sin(13 * tau);
        this.sway = 3.5 * e * Math.sin(9.5 * tau);
        this.wireDirty = true;
    }

    reveal(i, t) {
        return clamp((t - this.hungAt - i * 0.015) / 0.08, 0, 1);
    }

    wireY(x) {
        const x0 = this.rect.l + Cfg.LightInset;
        const w = Math.max(1, this.rect.width - 2 * Cfg.LightInset);
        const span = w / Math.max(1, Math.round(w / Cfg.LightSpan));
        const f = clamp(((x - x0) / span) % 1, 0, 1);
        return this.rect.t + 3 + Cfg.LightSag * (1 + this.swing) * Math.sin(Math.PI * f);
    }

    place(r, isHidden) {
        const moved = !this.rect || this.rect.l !== r.l || this.rect.t !== r.t || this.rect.width !== r.width;
        this.rect = r;
        const w = Math.max(0, r.width - 2 * Cfg.LightInset);
        const count = Math.max(2, Math.floor(w / Cfg.LightSpacing));
        if (this.bulbs.length !== count) {
            this.bulbs = [];
            for (let i = 0; i < count; i++) {
                this.bulbs.push({
                    phase: rnd(0, 6.28),
                    speed: rnd(1.2, 3.0),
                    color: i % LIGHT_COLORS.length,
                    x: 0,
                    y: 0,
                    hidden: false,
                });
            }
            this.wireDirty = true;
        }
        for (let i = 0; i < count; i++) {
            const b = this.bulbs[i];
            const x = r.l + Cfg.LightInset + ((i + 0.5) * w) / count;
            const dx = this.sway * (0.6 + 0.4 * Math.sin(b.phase));
            b.x = x + dx;
            b.y = this.wireY(x) + 4;
            b.hidden = isHidden(b.x, b.y);
        }

        if (moved || this.wireDirty || this.wire.length === 0) {
            this.wire.length = 0;
            let occBits = 0;
            let idx = 0;
            for (let x = r.l + Cfg.LightInset * 0.5; x <= r.r - Cfg.LightInset * 0.5; x += 4) {
                const y = this.wireY(x);
                const hidden = isHidden(x, y);
                this.wire.push({ x, y, hidden });
                if (hidden) occBits = (occBits * 31 + idx + 1) | 0;
                idx++;
            }
            const sig = `${r.l}:${r.t}:${r.width}:${occBits}`;
            if (sig !== this._lastWireSig) {
                this._lastWireSig = sig;
                this.wireDirty = true;
            }
        } else {
            // Still check wire occlusion changes if front windows moved
            let occChanged = false;
            for (let i = 0; i < this.wire.length; i++) {
                const pt = this.wire[i];
                const h = isHidden(pt.x, pt.y);
                if (h !== pt.hidden) {
                    pt.hidden = h;
                    occChanged = true;
                }
            }
            if (occChanged) this.wireDirty = true;
        }
    }
}

export class SnowWorld {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.flakes = [];
        this._pool = [];
        this.piles = new Map();
        this._lastRect = new Map();
        this._aliveSet = new Set();
        this.order = [];
        this.ground = null;
        this.groundIsTaskbar = false;
        this._pollAcc = 0;
        this.t = 0;

        this.balls = [];
        this.ballsDirty = false;
        this.lights = new Map();
        this.lightsOn = false;
        this._activeBall = null;
        this._dragBall = null;
        this._dragTx = 0;
        this._dragTy = 0;
        this._dragOx = 0;
        this._dragOy = 0;
        this._dragVx = 0;
        this._dragVy = 0;
        this._lastMx = NaN;

        this._resetGround(h, false);
        for (let i = 0; i < Cfg.TargetFlakes; i++) {
            this._spawnFlake(rnd(0, h));
        }
    }

    get time() {
        return this.t;
    }

    get isDragging() {
        return this._dragBall !== null;
    }

    resize(w, h) {
        this.w = w;
        this.h = h;
        this._resetGround(h, false);
    }

    _resetGround(top, taskbar) {
        for (const b of this.balls) {
            if (this.ground && b.pile === this.ground) {
                b.drop(0, 0);
                this.ballsDirty = true;
            }
        }
        if (this.ground) this._release(this.ground, 0, 0, GROUND_ID);
        this.groundIsTaskbar = taskbar;
        this.ground = new Pile(0, top, this.w, taskbar ? Cfg.TaskbarPileMax : Cfg.GroundPileMax);
    }

    clearAll() {
        for (const p of this.piles.values()) p.clear();
        this.ground.clear();
        if (this.balls.length > 0) this.ballsDirty = true;
        this.balls.length = 0;
        this._activeBall = null;
        this._dragBall = null;
    }

    _obtain() {
        const f = this._pool.length > 0 ? this._pool.pop() : new Flake();
        this.flakes.push(f);
        return f;
    }

    _recycle(i) {
        this._pool.push(this.flakes[i]);
        const last = this.flakes.pop();
        if (i < this.flakes.length) this.flakes[i] = last;
    }

    _spawnFlake(y = null) {
        const f = this._obtain();
        const r = Math.random();
        const li = r < 0.40 ? 0 : (r < 0.68 ? 1 : 2);
        const L = LAYERS[li];
        f.layer = li;
        f.clump = false;
        f.inFront = Cfg.FlakesInFront && li === 0 && Math.random() < Cfg.InFrontFraction;
        f.ignoreId = -1;
        f.ignoreUntil = 0;
        f.size = rnd(L.sizeMin, L.sizeMax);
        f.vx = 0;
        f.vy = rnd(L.speedMin, L.speedMax) * Cfg.FallSpeed;
        f.swayAmp = rnd(L.swayMin, L.swayMax);
        f.swayFreq = rnd(0.6, 1.6);
        f.phase = rnd(0, 6.28);
        f.windFactor = L.wind;
        f.alpha = rnd(L.alphaMin, L.alphaMax);
        f.x = rnd(-40, this.w + 40);
        f.y = y !== null ? y : -rnd(2, 30);
    }

    _spawnClump(x, y, vx, vy, sourceId) {
        const f = this._obtain();
        f.clump = true;
        f.inFront = false;
        f.layer = 2;
        f.size = rnd(2.5, 5);
        f.alpha = 0.95;
        f.vx = vx;
        f.vy = vy;
        f.ignoreId = sourceId;
        f.ignoreUntil = this.t + 0.35;
        f.x = x;
        f.y = y;
    }

    _release(p, vx, vy, id) {
        const fx = clamp(vx * 0.5, -900, 900);
        const fy = clamp(vy * 0.4, -500, 300);
        for (const b of this.balls) {
            if (b.pile === p) {
                b.drop(fx + rnd(-30, 30), fy - rnd(20, 80));
                this.ballsDirty = true;
            }
        }
        const total = p.total;
        if (total > 0.5) {
            const budget = Math.max(0, Cfg.MaxClumps - this.flakes.length + Cfg.TargetFlakes);
            const k = Math.min(1, budget / Math.max(1, total / 3.5));
            for (let c = 0; c < p.count; c++) {
                if (p.h[c] <= 0.6) continue;
                let amount = (p.h[c] / 3.5) * k;
                while (amount > 0) {
                    if (amount < 1 && Math.random() > amount) break;
                    this._spawnClump(
                        p.colX(c) + rnd(-1.5, 1.5),
                        p.topY - rnd(0, p.h[c]),
                        fx + rnd(-40, 40),
                        fy - rnd(10, 80),
                        id
                    );
                    amount -= 1;
                }
            }
        }
        p.clear();
    }

    update(dt, readWindows, readTaskbarTop, mx, my) {
        this.t += dt;
        this._pollAcc += dt;
        if (this._pollAcc >= Cfg.PollInterval) {
            this._pollWindows(this._pollAcc, readWindows(), readTaskbarTop());
            this._pollAcc = 0;
        }
        this._stepFlakes(dt);
        if (this._dragBall !== null) {
            this._stepDrag(this._dragBall, dt, mx, my);
        } else {
            this._updateRolling(mx, my);
        }
        this._stepBalls(dt);
        this._updateLights();
    }

    _pollWindows(dt, wins, taskbarTop) {
        const groundTop = taskbarTop !== null ? taskbarTop : this.h;
        const taskbar = taskbarTop !== null;
        if (Math.abs(groundTop - this.ground.topY) > 1 || taskbar !== this.groundIsTaskbar) {
            this._resetGround(groundTop, taskbar);
        }

        const alive = this._aliveSet;
        alive.clear();
        for (const w of wins) alive.add(w.id);

        for (const id of this.piles.keys()) {
            if (!alive.has(id)) {
                this._release(this.piles.get(id), 0, 0, id);
                this.piles.delete(id);
                this._lastRect.delete(id);
            }
        }

        for (const r of wins) {
            const pile = this.piles.get(r.id);
            const old = this._lastRect.get(r.id);
            if (pile && old) {
                if (Math.abs(old.width - r.width) > 0.5) {
                    this._release(pile, 0, 0, r.id);
                    this.piles.set(r.id, new Pile(r.l, r.t, r.width, Cfg.WindowPileMax));
                } else if (Math.abs(old.l - r.l) > 0.3 || Math.abs(old.t - r.t) > 0.3) {
                    const vx = (r.l - old.l) / dt;
                    const vy = (r.t - old.t) / dt;
                    pile.minX = r.l;
                    pile.topY = r.t;
                    this._release(pile, vx, vy, r.id);
                }
            } else {
                this.piles.set(r.id, new Pile(r.l, r.t, r.width, Cfg.WindowPileMax));
            }
            this._lastRect.set(r.id, r);
        }

        this.order = wins;
        this._computeOcclusion();
        for (const p of this.piles.values()) p.relax();
        this.ground.relax();
    }

    _computeOcclusion() {
        for (let i = 0; i < this.order.length; i++) {
            const p = this.piles.get(this.order[i].id);
            if (!p) continue;
            for (let c = 0; c < p.count; c++) {
                const x = p.colX(c);
                const y = p.topY - 1;
                let o = x < 0 || x > this.w || y < 0;
                if (!o) {
                    for (let j = 0; j < i; j++) {
                        if (winContains(this.order[j], x, y)) {
                            o = true;
                            break;
                        }
                    }
                }
                if ((o ? 1 : 0) !== p.occ[c]) {
                    p.occ[c] = o ? 1 : 0;
                    if (o) p.h[c] = 0;
                    p.dirty = true;
                    p.renderDirty = true;
                }
            }
        }

        for (let c = 0; c < this.ground.count; c++) {
            let o = false;
            if (!this.groundIsTaskbar) {
                const x = this.ground.colX(c);
                const y = this.ground.topY - 1;
                for (let j = 0; j < this.order.length; j++) {
                    if (winContains(this.order[j], x, y)) {
                        o = true;
                        break;
                    }
                }
            }
            if ((o ? 1 : 0) !== this.ground.occ[c]) {
                this.ground.occ[c] = o ? 1 : 0;
                if (o) this.ground.h[c] = 0;
                this.ground.dirty = true;
                this.ground.renderDirty = true;
            }
        }
    }

    _stepFlakes(dt) {
        const wind =
            14 * Math.sin(this.t * 0.11) +
            9 * Math.sin(this.t * 0.37 + 1.3) +
            6 * Math.sin(this.t * 0.9 + 0.4);
        let normal = 0;

        for (let i = this.flakes.length - 1; i >= 0; i--) {
            const f = this.flakes[i];
            const prevY = f.y;

            if (f.clump) {
                f.vy += Cfg.Gravity * dt;
                f.vx *= Math.max(0, 1 - 1.2 * dt);
                f.x += f.vx * dt;
                f.y += f.vy * dt;
            } else {
                const sway = Math.sin(this.t * f.swayFreq + f.phase) * f.swayAmp;
                f.x += (wind * f.windFactor + sway) * dt;
                f.y += f.vy * dt;
                if (f.x < -40) f.x += this.w + 80;
                else if (f.x > this.w + 40) f.x -= this.w + 80;
            }

            let gone = false;
            if (f.y > prevY) {
                if (!f.inFront) {
                    for (let j = 0; j < this.order.length; j++) {
                        const w = this.order[j];
                        const pile = this.piles.get(w.id);
                        if (!pile) continue;
                        if (f.clump && w.id === f.ignoreId && this.t < f.ignoreUntil) continue;
                        const c = pile.col(f.x);
                        if (c < 0 || pile.occ[c]) continue;
                        const s = pile.surface(c);
                        if (prevY <= s && f.y > s) {
                            pile.add(c, f.clump ? 1.6 : f.size * 0.22);
                            gone = true;
                            break;
                        }
                    }
                }

                if (!gone) {
                    const c = this.ground.col(f.x);
                    if (c >= 0 && f.y > this.ground.surface(c)) {
                        if (!this.ground.occ[c]) {
                            const gain = this.groundIsTaskbar ? Cfg.TaskbarGain : 1;
                            this.ground.add(c, (f.clump ? 1.6 : f.size * 0.17) * gain);
                        }
                        gone = true;
                    }
                }
            }

            if (!gone) {
                if (!f.inFront) {
                    for (let j = 0; j < this.order.length; j++) {
                        if (winContains(this.order[j], f.x, f.y)) {
                            gone = true;
                            break;
                        }
                    }
                }
                if (f.y > this.h + 20) gone = true;
                if (f.clump && (f.x < -80 || f.x > this.w + 80)) gone = true;
            }

            if (gone) this._recycle(i);
            else if (!f.clump) normal++;
        }

        const deficit = Math.min(6, Cfg.TargetFlakes - normal);
        for (let k = 0; k < deficit; k++) this._spawnFlake();
    }

    _updateLights() {
        if (!this.lightsOn) {
            if (this.lights.size > 0) this.lights.clear();
            return;
        }
        const alive = this._aliveSet;
        alive.clear();
        for (let i = 0; i < this.order.length; i++) {
            const w = this.order[i];
            alive.add(w.id);
            let s = this.lights.get(w.id);
            if (!s) {
                s = new LightString(this.t);
                this.lights.set(w.id, s);
            }
            s.updateSwing(this.t);
            const front = i;
            s.place(w, (x, y) => {
                if (y < 0) return true;
                for (let j = 0; j < front; j++) {
                    if (winContains(this.order[j], x, y)) return true;
                }
                return false;
            });
        }
        for (const id of this.lights.keys()) {
            if (!alive.has(id)) this.lights.delete(id);
        }
    }

    wantsMouse(mx, my) {
        return this._dragBall !== null || this._ballAt(mx, my) !== null;
    }

    _ballAt(mx, my) {
        let best = null;
        for (const b of this.balls) {
            if (b.falling || b.hidden) continue;
            const dx = mx - b.x;
            const dy = my - b.y;
            const hitR = Math.max(b.r + 6, 12);
            if (dx * dx + dy * dy <= hitR * hitR && (best === null || b.y < best.y)) {
                best = b;
            }
        }
        return best;
    }

    _above(b) {
        for (const x of this.balls) {
            if (x.below === b) return x;
        }
        return null;
    }

    _baseOf(b) {
        let cur = b;
        while (cur.below !== null) cur = cur.below;
        return cur;
    }

    _stack(bottom) {
        const list = [bottom];
        for (let a = this._above(bottom); a !== null && list.length < 10; a = this._above(a)) {
            list.push(a);
        }
        return list;
    }

    mouseDown(mx, my) {
        const b = this._ballAt(mx, my);
        if (!b) return false;

        for (let a = this._above(b); a !== null;) {
            const next = this._above(a);
            a.drop(rnd(-50, 50), -rnd(40, 100));
            a = next;
        }
        for (const x of this._stack(this._baseOf(b))) x.decor = 0;

        b.pile = null;
        b.below = null;
        b.dragging = true;
        this._dragBall = b;
        this._activeBall = null;
        this._dragOx = b.x - mx;
        this._dragOy = b.y - my;
        this._dragTx = mx;
        this._dragTy = my;
        this._dragVx = 0;
        this._dragVy = 0;
        this.ballsDirty = true;
        return true;
    }

    mouseUp() {
        const b = this._dragBall;
        if (!b) return;
        this._dragBall = null;
        b.dragging = false;

        const target = this._stackTarget(b);
        if (target !== null) {
            b.below = target;
            b.vx = 0;
            b.vy = 0;
            const st = this._stack(this._baseOf(b));
            if (st.length === 3) {
                st[1].decor = 2;
                st[2].decor = 1;
            }
        } else {
            b.drop(clamp(this._dragVx * 0.5, -600, 600), clamp(this._dragVy * 0.5, -400, 400));
        }
        this.ballsDirty = true;
    }

    _stepDrag(b, dt, mx, my) {
        this._dragTx = mx;
        this._dragTy = my;
        const tx = this._dragTx + this._dragOx;
        const ty = this._dragTy + this._dragOy;
        if (dt > 0) {
            this._dragVx = this._dragVx * 0.7 + ((tx - b.x) / dt) * 0.3;
            this._dragVy = this._dragVy * 0.7 + ((ty - b.y) / dt) * 0.3;
        }
        if (tx !== b.x || ty !== b.y) {
            b.rot += (tx - b.x) / b.r;
            b.x = tx;
            b.y = ty;
            this.ballsDirty = true;
        }
        this._lastMx = mx;
    }

    _stackTarget(b) {
        let best = null;
        let bestDist = Infinity;
        for (const c of this.balls) {
            if (c === b || c.falling || c.dragging || c.hidden) continue;
            if (this._above(c) !== null || this._stack(this._baseOf(c)).length >= 3) continue;
            const dx = Math.abs(b.x - c.x);
            const dy = c.y - b.y;
            if (dx < c.r + b.r * 0.6 + 6 && dy > -c.r * 0.5 && dy < c.r + b.r + 50 && dx < bestDist) {
                best = c;
                bestDist = dx;
            }
        }
        return best;
    }

    _mouseOver(p, mx, my) {
        const c = p.col(mx);
        if (c < 0 || p.occ[c]) return false;
        return my <= p.topY + 6 && my >= p.topY - p.h[c] - 14;
    }

    _surfaceUnderMouse(mx, my) {
        for (const b of this.balls) {
            if (b.falling || b.dragging || b.hidden || b.below !== null || b.pile === null) continue;
            const p = b.pile;
            if (Math.abs(mx - b.x) < b.r + 8 && my <= p.topY + 6 && my >= p.topY - 2 * b.r - 8) {
                return p;
            }
        }
        if (this.groundIsTaskbar) {
            if (this._mouseOver(this.ground, mx, my)) return this.ground;
            if (my >= this.ground.topY) return null;
        }
        for (const w of this.order) {
            const p = this.piles.get(w.id);
            if (p && this._mouseOver(p, mx, my)) return p;
            if (winContains(w, mx, my)) return null;
        }
        if (!this.groundIsTaskbar && this._mouseOver(this.ground, mx, my)) return this.ground;
        return null;
    }

    _updateRolling(mx, my) {
        const dx = Number.isNaN(this._lastMx) ? 0 : mx - this._lastMx;
        this._lastMx = mx;
        const p = this._surfaceUnderMouse(mx, my);
        if (!p) {
            this._activeBall = null;
            return;
        }
        if (Math.abs(dx) <= 0.2) return;

        let b = null;
        if (
            this._activeBall !== null &&
            this._activeBall.pile === p &&
            this._above(this._activeBall) === null &&
            Math.abs(this._activeBall.x - (mx - dx)) < this._activeBall.r + 25
        ) {
            b = this._activeBall;
        } else {
            let resting = null;
            for (const x of this.balls) {
                if (!x.falling && x.pile === p && Math.abs(x.x - mx) < x.r + 10) {
                    resting = x;
                    break;
                }
            }
            if (resting) {
                if (this._above(resting) !== null) {
                    this._activeBall = null;
                    return;
                }
                b = resting;
            } else {
                const c = p.col(mx);
                if (c < 0 || p.h[c] <= 1.5) {
                    this._activeBall = null;
                    return;
                }
                b = new Snowball();
                b.x = mx;
                b.pile = p;
                b.y = p.topY - b.r + 1.5;
                this.balls.push(b);
                this._trimBalls(b);
                this.ballsDirty = true;
            }
        }
        this._activeBall = b;

        const lo = p.minX + b.r;
        const hi = p.minX + p.width - b.r;
        const newX = lo < hi ? clamp(mx, lo, hi) : b.x;
        const moved = newX - b.x;
        if (Math.abs(moved) <= 0.01) return;
        const oldX = b.x;
        this._roll(b, p, newX);
        this._push(b, oldX, moved > 0 ? 1 : -1, p);
    }

    _roll(b, p, newX) {
        const moved = newX - b.x;
        if (Math.abs(moved) <= 0.01) return;
        if (b.r < Cfg.BallMaxRadius) {
            let collected = 0;
            const from = Math.min(b.x, newX) - b.r * 0.8;
            const to = Math.max(b.x, newX) + b.r * 0.8;
            const frac = Math.min(0.6, (0.6 * Math.abs(moved)) / (1.6 * b.r));
            const c0 = p.col(Math.max(from, p.minX));
            const c1 = p.col(Math.min(to, p.minX + p.width - 0.1));
            if (c0 >= 0 && c1 >= 0) {
                for (let c = c0; c <= c1; c++) {
                    if (p.occ[c]) continue;
                    const take = p.h[c] * frac;
                    if (take > 0) {
                        p.h[c] -= take;
                        collected += take;
                    }
                }
                p.dirty = true;
                p.renderDirty = true;
            }
            const area = Math.PI * b.r * b.r + collected * Cfg.ColW * 0.8;
            b.r = Math.min(Cfg.BallMaxRadius, Math.sqrt(area / Math.PI));
        }
        b.x = newX;
        b.rot += moved / b.r;
        this.ballsDirty = true;
    }

    _push(b, oldX, dir, p) {
        const ahead = [];
        for (const o of this.balls) {
            if (o !== b && !o.falling && !o.dragging && o.pile === p && (o.x - oldX) * dir > 0) {
                ahead.push(o);
            }
        }
        ahead.sort((a, c) => Math.abs(a.x - oldX) - Math.abs(c.x - oldX));
        let pusher = b;
        for (const o of ahead) {
            const need = pusher.x + dir * (pusher.r + o.r);
            if ((need - o.x) * dir <= 0) break;
            const lo = p.minX + o.r;
            const hi = p.minX + p.width - o.r;
            if (need < lo || need > hi) {
                o.x = need;
                o.drop(dir * 140, -40);
                this.ballsDirty = true;
            } else {
                this._roll(o, p, need);
            }
            pusher = o;
        }
    }

    _trimBalls(keep) {
        while (this.balls.length > Cfg.MaxBalls) {
            const idx = this.balls.findIndex(
                (x) => !x.falling && !x.dragging && x.decor === 0 && x !== keep && x !== this._activeBall
            );
            if (idx < 0) break;
            this.balls.splice(idx, 1);
            this.ballsDirty = true;
        }
    }

    _stepBalls(dt) {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const b = this.balls[i];
            let gone = false;
            if (b.falling) {
                b.decor = 0;
                b.hidden = false;
                const prevBottom = b.y + b.r;
                b.vy += Cfg.Gravity * dt;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.rot += (b.vx * dt) / b.r;
                this.ballsDirty = true;
                const p = b.vy > 0 ? this._landingSurface(b.x, prevBottom, b.y + b.r) : null;
                if (p !== null) {
                    this._splat(b, p);
                    gone = true;
                } else if (b.y > this.h + b.r * 2 || b.x < -100 || b.x > this.w + 100) {
                    gone = true;
                }
            } else if (b.dragging) {
                // Position managed by _stepDrag
            } else if (b.below !== null) {
                const u = b.below;
                if (u.falling || u.dragging || !this.balls.includes(u)) {
                    b.drop(u.vx + rnd(-40, 40), Math.min(u.vy, 0) - rnd(30, 80));
                    this.ballsDirty = true;
                } else {
                    const ny = u.y - u.r - b.r * 0.82;
                    if (b.x !== u.x || b.y !== ny || b.hidden !== u.hidden) {
                        b.x = u.x;
                        b.y = ny;
                        b.hidden = u.hidden;
                        this.ballsDirty = true;
                    }
                }
            } else if (b.pile !== null) {
                const c = b.pile.col(b.x);
                const nh = c < 0 || Boolean(b.pile.occ[c]);
                const ny = b.pile.topY - b.r + 1.5;
                if (b.hidden !== nh || b.y !== ny) {
                    b.hidden = nh;
                    b.y = ny;
                    this.ballsDirty = true;
                }
            } else {
                b.drop(0, 0);
                this.ballsDirty = true;
            }

            if (gone) {
                if (b === this._activeBall) this._activeBall = null;
                this.balls.splice(i, 1);
                this.ballsDirty = true;
            }
        }
    }

    _landingSurface(x, top, bottom) {
        for (const w of this.order) {
            const p = this.piles.get(w.id);
            if (!p) continue;
            const c = p.col(x);
            if (c < 0 || p.occ[c]) continue;
            const s = p.surface(c);
            if (top <= s && bottom > s) return p;
        }
        const g = this.ground.col(x);
        if (g >= 0 && bottom > this.ground.surface(g)) return this.ground;
        return null;
    }

    _splat(b, p) {
        const c0 = p.col(b.x);
        if (c0 >= 0) {
            const snow = (Math.PI * b.r * b.r * 0.7) / Cfg.ColW;
            const half = Math.max(2, Math.floor((b.r * 1.4) / Cfg.ColW));
            let sum = 0;
            for (let o = -half; o <= half; o++) sum += 1 - Math.abs(o) / (half + 1);
            for (let o = -half; o <= half; o++) {
                const i = c0 + o;
                if (i < 0 || i >= p.count || p.occ[i]) continue;
                const w = (1 - Math.abs(o) / (half + 1)) / sum;
                p.h[i] = Math.min(p.caps[i], p.h[i] + snow * w);
            }
            p.dirty = true;
            p.renderDirty = true;
        }
        const n = Math.min(14, Math.floor(b.r * 0.6) + 2);
        for (let k = 0; k < n; k++) {
            this._spawnClump(
                b.x + rnd(-b.r, b.r),
                b.y + b.r * 0.5 - rnd(0, b.r * 0.5),
                b.vx * 0.2 + rnd(-90, 90),
                -rnd(60, 180),
                BURST_ID
            );
        }
    }
}
