/**
 * Ultra-lean GPU sprite renderer for WinterIsComing on GNOME Shell.
 * Uses a single 32x32 soft-disc Cogl.Texture2D and 3 depth-layer Cogl.Pipelines
 * (far, middle, near/clumps) via Clutter.Effect: 3 draw batches total, 0 CPU uploads.
 */

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import { Cfg, LIGHT_COLORS } from './snowWorld.js';

const TEX_SIZE = 32;
const GLOW_BUCKETS = 4;

const sharedBox = new Clutter.ActorBox();

function createSoftDiscData() {
    const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
    const half = TEX_SIZE / 2;
    const inv = 1 / half;
    let idx = 0;
    for (let y = 0; y < TEX_SIZE; y++) {
        const dy = (y + 0.5 - half) * inv;
        for (let x = 0; x < TEX_SIZE; x++) {
            const dx = (x + 0.5 - half) * inv;
            const d = Math.sqrt(dx * dx + dy * dy);
            let a = 0;
            if (d < 1) {
                a = d < 0.45 ? 1 - 0.4 * (d / 0.45) : 0.6 * (1 - (d - 0.45) / 0.55);
            }
            const v = Math.max(0, Math.min(255, Math.round(a * 255)));
            data[idx++] = v;
            data[idx++] = v;
            data[idx++] = v;
            data[idx++] = v;
        }
    }
    return data;
}

function makePipeline(context, texture, r, g, b, a) {
    const p = Cogl.Pipeline.new(context);
    p.set_layer_texture(0, texture);
    p.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
    p.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
    const col = new Cogl.Color();
    col.init_from_4f(r * a, g * a, b * a, a);
    p.set_color(col);
    return p;
}

export class GpuSpriteAtlas {
    constructor() {
        this._ready = false;
        this._texture = null;
        this._layerPipelines = null;
        this._glowPipelines = null;
        this._corePipelines = null;
    }

    ensure(paintContext) {
        if (this._ready) return true;
        let ctx = null;
        try {
            const fb = paintContext?.get_framebuffer?.();
            ctx = fb ? fb.get_context() : null;
        } catch {
            ctx = null;
        }
        if (!ctx) {
            try {
                ctx = Clutter.get_default_backend().get_cogl_context();
            } catch {
                ctx = null;
            }
        }
        if (!ctx) return false;

        this._texture = Cogl.Texture2D.new_from_data(
            ctx,
            TEX_SIZE,
            TEX_SIZE,
            Cogl.PixelFormat.RGBA_8888_PRE,
            TEX_SIZE * 4,
            createSoftDiscData()
        );

        // One pipeline per depth layer (far=0.42, mid=0.72, near/clumps=0.95)
        this._layerPipelines = [
            makePipeline(ctx, this._texture, 1, 1, 1, 0.42),
            makePipeline(ctx, this._texture, 1, 1, 1, 0.72),
            makePipeline(ctx, this._texture, 1, 1, 1, 0.95),
        ];

        this._glowPipelines = [];
        this._corePipelines = [];
        for (let c = 0; c < LIGHT_COLORS.length; c++) {
            const [r, g, b] = LIGHT_COLORS[c];
            const glows = [];
            for (let i = 0; i < GLOW_BUCKETS; i++) {
                const a = 0.4 + 0.4 * (i / (GLOW_BUCKETS - 1));
                glows.push(makePipeline(ctx, this._texture, r, g, b, a));
            }
            this._glowPipelines.push(glows);

            const cr = r + (1 - r) * 0.2;
            const cg = g + (1 - g) * 0.2;
            const cb = b + (1 - b) * 0.2;
            this._corePipelines.push(makePipeline(ctx, this._texture, cr, cg, cb, 0.95));
        }

        this._ready = true;
        return true;
    }

    destroy() {
        this._layerPipelines = null;
        this._glowPipelines = null;
        this._corePipelines = null;
        this._texture = null;
        this._ready = false;
    }
}

export const FlakeLayerEffect = GObject.registerClass({
    GTypeName: 'WinterFlakeLayerEffect',
}, class FlakeLayerEffect extends Clutter.Effect {
    _init(atlas, world, mode) {
        super._init();
        this._atlas = atlas;
        this._world = world;
        this._mode = mode; // 'back' | 'bulbs' | 'front'
        this._glowBuckets = Array.from({ length: LIGHT_COLORS.length }, () =>
            Array.from({ length: GLOW_BUCKETS }, () => [])
        );
        this._coreBuckets = Array.from({ length: LIGHT_COLORS.length }, () => []);
    }

    vfunc_paint_node(node, paintContext, _flags) {
        if (!this._world || !this._atlas || !this._atlas.ensure(paintContext)) return;

        if (this._mode === 'back') {
            this._paintBackFlakes(node);
        } else if (this._mode === 'front') {
            this._paintFrontFlakes(node);
        } else if (this._mode === 'bulbs') {
            this._paintBulbs(node);
        }
    }

    _paintBackFlakes(node) {
        const flakes = this._world.flakes;
        const p0 = new Clutter.PipelineNode(this._atlas._layerPipelines[0]);
        const p1 = new Clutter.PipelineNode(this._atlas._layerPipelines[1]);
        let c0 = 0;
        let c1 = 0;

        for (let i = 0; i < flakes.length; i++) {
            const f = flakes[i];
            if (f.clump || f.layer >= 2) continue;
            const r = f.size * 1.1;
            sharedBox.init(f.x - r, f.y - r, f.x + r, f.y + r);
            if (f.layer === 0) {
                p0.add_texture_rectangle(sharedBox, 0, 0, 1, 1);
                c0++;
            } else {
                p1.add_texture_rectangle(sharedBox, 0, 0, 1, 1);
                c1++;
            }
        }
        if (c0 > 0) node.add_child(p0);
        if (c1 > 0) node.add_child(p1);
    }

    _paintFrontFlakes(node) {
        const flakes = this._world.flakes;
        const p2 = new Clutter.PipelineNode(this._atlas._layerPipelines[2]);
        let c2 = 0;

        for (let i = 0; i < flakes.length; i++) {
            const f = flakes[i];
            if (!f.clump && f.layer !== 2) continue;
            const r = f.size * 1.1;
            sharedBox.init(f.x - r, f.y - r, f.x + r, f.y + r);
            p2.add_texture_rectangle(sharedBox, 0, 0, 1, 1);
            c2++;
        }
        if (c2 > 0) node.add_child(p2);
    }

    _paintBulbs(node) {
        if (!this._world.lightsOn || this._world.lights.size === 0) return;

        const gBuckets = this._glowBuckets;
        const cBuckets = this._coreBuckets;
        for (let c = 0; c < LIGHT_COLORS.length; c++) {
            for (let b = 0; b < GLOW_BUCKETS; b++) gBuckets[c][b].length = 0;
            cBuckets[c].length = 0;
        }

        const t = this._world.time;
        const glowR = Cfg.BulbGlow * 0.5;
        const coreR = Cfg.BulbCore * 0.5 * 1.3;

        for (const ls of this._world.lights.values()) {
            const bulbs = ls.bulbs;
            for (let i = 0; i < bulbs.length; i++) {
                const b = bulbs[i];
                if (b.hidden) continue;
                const reveal = ls.reveal(i, t);
                if (reveal <= 0) continue;
                const k = 0.75 + 0.25 * Math.sin(t * b.speed + b.phase);

                let gi = Math.round(k * (GLOW_BUCKETS - 1) * reveal);
                if (gi < 0) gi = 0;
                else if (gi >= GLOW_BUCKETS) gi = GLOW_BUCKETS - 1;
                gBuckets[b.color][gi].push(b.x, b.y);
                cBuckets[b.color].push(b.x, b.y);
            }
        }

        for (let c = 0; c < LIGHT_COLORS.length; c++) {
            for (let bi = 0; bi < GLOW_BUCKETS; bi++) {
                const coords = gBuckets[c][bi];
                if (coords.length === 0) continue;
                const pnode = new Clutter.PipelineNode(this._atlas._glowPipelines[c][bi]);
                for (let j = 0; j < coords.length; j += 2) {
                    const x = coords[j];
                    const y = coords[j + 1];
                    sharedBox.init(x - glowR, y - glowR, x + glowR, y + glowR);
                    pnode.add_texture_rectangle(sharedBox, 0, 0, 1, 1);
                }
                node.add_child(pnode);
            }
            const cCoords = cBuckets[c];
            if (cCoords.length > 0) {
                const pnode = new Clutter.PipelineNode(this._atlas._corePipelines[c]);
                for (let j = 0; j < cCoords.length; j += 2) {
                    const x = cCoords[j];
                    const y = cCoords[j + 1];
                    sharedBox.init(x - coreR, y - coreR, x + coreR, y + coreR);
                    pnode.add_texture_rectangle(sharedBox, 0, 0, 1, 1);
                }
                node.add_child(pnode);
            }
        }
    }
});
