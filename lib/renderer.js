/**
 * Cairo helpers for rendering snow piles, fairy-light wires, and snowballs/snowmen
 * onto compact, dirty-checked St.DrawingArea surfaces.
 */

import Cairo from 'cairo';
import { Cfg } from './snowWorld.js';

export class SnowRenderer {
    constructor() {
        this._drawOrder = [];
    }

    destroy() {
        this._drawOrder.length = 0;
    }

    drawPile(cr, p, offsetX = 0, offsetY = 0) {
        const n = p.count;
        const baseY = p.topY - offsetY;
        let c = 0;
        while (c < n) {
            if (p.occ[c] || p.h[c] < 0.3) {
                c++;
                continue;
            }
            const start = c;
            while (c < n && !p.occ[c] && p.h[c] >= 0.3) c++;
            const end = c - 1;

            const leftX = (start > 0 && !p.occ[start - 1]
                ? p.colX(start - 1)
                : p.minX + start * Cfg.ColW) - offsetX;
            const rightX = (end + 1 < n && !p.occ[end + 1]
                ? p.colX(end + 1)
                : p.minX + (end + 1) * Cfg.ColW) - offsetX;

            // Shadow 1.5px below edge
            cr.setSourceRGBA(0.70, 0.78, 0.92, 0.9);
            cr.rectangle(leftX, baseY, rightX - leftX, 1.5);
            cr.fill();

            // Snow mound
            cr.setSourceRGBA(1, 1, 1, 0.97);
            cr.newPath();
            cr.moveTo(leftX, baseY);
            if (start > 0 && !p.occ[start - 1]) {
                cr.lineTo(p.colX(start - 1) - offsetX, baseY - p.h[start - 1]);
            }
            for (let i = start; i <= end; i++) {
                cr.lineTo(p.colX(i) - offsetX, baseY - p.h[i]);
            }
            if (end + 1 < n && !p.occ[end + 1]) {
                cr.lineTo(p.colX(end + 1) - offsetX, baseY - p.h[end + 1]);
            }
            cr.lineTo(rightX, baseY);
            cr.closePath();
            cr.fill();
        }
    }

    drawWire(cr, ls, offsetX = 0, offsetY = 0) {
        if (!ls || ls.wire.length < 2) return;
        cr.save();
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineWidth(1.2);
        cr.setSourceRGBA(0.12, 0.12, 0.12, 0.85);

        let drawing = false;
        for (let i = 0; i < ls.wire.length; i++) {
            const pt = ls.wire[i];
            if (pt.hidden) {
                if (drawing) {
                    cr.stroke();
                    drawing = false;
                }
                continue;
            }
            if (!drawing) {
                cr.newPath();
                cr.moveTo(pt.x - offsetX, pt.y - offsetY);
                drawing = true;
            } else {
                cr.lineTo(pt.x - offsetX, pt.y - offsetY);
            }
        }
        if (drawing) cr.stroke();
        cr.restore();
    }

    _drawRoundedRect(cr, cx, cy, hw, hh, radius, angle, ox, oy, r, g, b) {
        cr.save();
        cr.translate(ox, oy);
        cr.rotate(angle);
        cr.translate(cx - ox, cy - oy);
        const x = -hw;
        const y = -hh;
        const w = hw * 2;
        const h = hh * 2;
        const rad = Math.min(radius, hw, hh);
        cr.newPath();
        cr.arc(x + rad, y + rad, rad, Math.PI, Math.PI * 1.5);
        cr.arc(x + w - rad, y + rad, rad, Math.PI * 1.5, 0);
        cr.arc(x + w - rad, y + h - rad, rad, 0, Math.PI * 0.5);
        cr.arc(x + rad, y + h - rad, rad, Math.PI * 0.5, Math.PI);
        cr.closePath();
        cr.setSourceRGBA(r, g, b, 1);
        cr.fill();
        cr.restore();
    }

    _drawHead(cr, cx, cy, R) {
        cr.setSourceRGBA(0.08, 0.08, 0.08, 1);
        for (const sx of [-1, 1]) {
            cr.newPath();
            cr.arc(cx + sx * R * 0.3, cy - R * 0.22, Math.max(1, R * 0.09), 0, Math.PI * 2);
            cr.fill();
        }

        cr.setSourceRGBA(0.96, 0.52, 0.13, 1);
        cr.newPath();
        cr.moveTo(cx + R * 0.02, cy - R * 0.06);
        cr.lineTo(cx + R * 0.75, cy + R * 0.04);
        cr.lineTo(cx + R * 0.02, cy + R * 0.12);
        cr.closePath();
        cr.fill();

        cr.setSourceRGBA(0.1, 0.1, 0.1, 1);
        for (let k = 0; k < 5; k++) {
            const a = Math.PI * (1.2 + 0.15 * k);
            cr.newPath();
            cr.arc(
                cx + Math.cos(a) * R * 0.42,
                cy - Math.sin(a) * R * 0.42 + R * 0.05,
                Math.max(0.7, R * 0.05),
                0,
                Math.PI * 2
            );
            cr.fill();
        }

        this._drawRoundedRect(cr, cx, cy + R * 0.83, R * 0.85, R * 0.15, R * 0.12, 0, cx, cy, 0.82, 0.16, 0.18);
        this._drawRoundedRect(cr, cx + R * 0.44, cy + R * 1.2, R * 0.14, R * 0.35, R * 0.08, 0.15, cx, cy, 0.82, 0.16, 0.18);
    }

    _drawBody(cr, cx, cy, B) {
        cr.setSourceRGBA(0.08, 0.08, 0.08, 1);
        for (let k = 0; k < 3; k++) {
            cr.newPath();
            cr.arc(cx, cy - B * (0.35 - 0.33 * k), Math.max(0.8, B * 0.07), 0, Math.PI * 2);
            cr.fill();
        }

        cr.save();
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineWidth(Math.max(1.2, B * 0.09));
        cr.setSourceRGBA(0.42, 0.28, 0.16, 1);
        for (const sx of [-1, 1]) {
            cr.newPath();
            cr.moveTo(cx + sx * B * 0.85, cy - B * 0.15);
            cr.lineTo(cx + sx * B * 1.75, cy - B * 0.65);
            cr.stroke();

            cr.newPath();
            cr.moveTo(cx + sx * B * 1.4, cy - B * 0.45);
            cr.lineTo(cx + sx * B * 1.55, cy - B * 0.85);
            cr.stroke();
        }
        cr.restore();
    }

    _drawBall(cr, ball, offsetX, offsetY) {
        const cx = ball.x - offsetX;
        const cy = ball.y - offsetY;
        const R = ball.r;
        const hx = cx - 0.24 * R;
        const hy = cy - 0.28 * R;

        const grad = new Cairo.RadialGradient(hx, hy, 0, hx, hy, R * 1.35);
        grad.addColorStopRGBA(0.0, 1.0, 1.0, 1.0, 1.0);
        grad.addColorStopRGBA(0.55, 0.94, 0.96, 1.0, 1.0);
        grad.addColorStopRGBA(1.0, 0.68, 0.75, 0.88, 1.0);

        cr.newPath();
        cr.arc(cx, cy, R, 0, Math.PI * 2);
        cr.setSource(grad);
        cr.fill();

        for (const sp of ball.specks) {
            const a = sp.ang + ball.rot;
            const sx = cx + Math.cos(a) * sp.dist * R;
            const sy = cy + Math.sin(a) * sp.dist * R;
            cr.setSourceRGBA(0.66, 0.73, 0.87, sp.alpha);
            cr.newPath();
            cr.arc(sx, sy, Math.max(0.6, sp.size * R), 0, Math.PI * 2);
            cr.fill();
        }

        if (ball.decor === 1) this._drawHead(cr, cx, cy, R);
        else if (ball.decor === 2) this._drawBody(cr, cx, cy, R);
    }

    drawBalls(cr, world, offsetX = 0, offsetY = 0) {
        const order = this._drawOrder;
        order.length = 0;
        for (const b of world.balls) {
            if (!b.hidden) order.push(b);
        }
        order.sort((a, b) => {
            if (a.dragging !== b.dragging) return a.dragging ? 1 : -1;
            return b.y - a.y;
        });
        for (const b of order) {
            this._drawBall(cr, b, offsetX, offsetY);
        }
    }

    renderWorld(cr, world) {
        for (const p of world.piles.values()) this.drawPile(cr, p, 0, 0);
        if (world.ground) this.drawPile(cr, world.ground, 0, 0);
        for (const ls of world.lights.values()) this.drawWire(cr, ls, 0, 0);
        this.drawBalls(cr, world, 0, 0);
    }
}
