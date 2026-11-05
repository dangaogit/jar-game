import type { JVM } from '../vm/jvm';
import { bytesOf } from '../vm/natives/lang';
import type { JArray, JObject, JValue } from '../vm/runtime';
import type { Ctx2D, Surface, SurfaceFactory } from './surface';

const HCENTER = 1;
const VCENTER = 2;
const RIGHT = 8;
const BOTTOM = 32;
const BASELINE = 64;

export interface FontSpec {
  css: string;
  size: number;
  height: number;
  baseline: number;
}

export interface FontSizes {
  small: number;
  medium: number;
  large: number;
}

interface GState {
  s: Surface;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  color: number;
  /** 0..255; only below 255 after Nokia DirectGraphics.setARGBColor */
  alpha: number;
  font: FontSpec;
  stroke: number;
}

// [a, b, c, d, e, f] in units of (w, h) for each MIDP transform, mapping region-local (u, v) to destination
function transformMatrix(t: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (t) {
    case 2: // MIRROR
      return [-1, 0, 0, 1, w, 0];
    case 3: // ROT180
      return [-1, 0, 0, -1, w, h];
    case 1: // MIRROR_ROT180
      return [1, 0, 0, -1, 0, h];
    case 5: // ROT90
      return [0, 1, -1, 0, h, 0];
    case 6: // ROT270
      return [0, -1, 1, 0, 0, w];
    case 7: // MIRROR_ROT90
      return [0, -1, -1, 0, h, w];
    case 4: // MIRROR_ROT270
      return [0, 1, 1, 0, 0, 0];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

const swapsAxes = (t: number) => t >= 4;

function anchorX(x: number, w: number, anchor: number) {
  if (anchor & HCENTER) return x - (w >> 1);
  if (anchor & RIGHT) return x - w;
  return x;
}

function anchorY(y: number, h: number, anchor: number) {
  if (anchor & VCENTER) return y - (h >> 1);
  if (anchor & BOTTOM) return y - h;
  return y;
}

function cssColor(rgb: number, alpha = 255) {
  if (alpha < 255) return `rgba(${(rgb >> 16) & 0xff},${(rgb >> 8) & 0xff},${rgb & 0xff},${alpha / 255})`;
  return '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');
}

/** Nokia DirectGraphics pixel formats -> ARGB */
function pixelToArgb(v: number, format: number, transparency: boolean): number {
  let a = 255;
  let r: number;
  let g: number;
  let b: number;
  switch (format) {
    case 8888:
      return transparency ? v : v | 0xff000000;
    case 888:
      return v | 0xff000000;
    case 4444:
      a = ((v >> 12) & 0xf) * 17;
      r = ((v >> 8) & 0xf) * 17;
      g = ((v >> 4) & 0xf) * 17;
      b = (v & 0xf) * 17;
      break;
    case 444:
      r = ((v >> 8) & 0xf) * 17;
      g = ((v >> 4) & 0xf) * 17;
      b = (v & 0xf) * 17;
      break;
    case 565:
      r = (v >> 11) & 0x1f;
      g = (v >> 5) & 0x3f;
      b = v & 0x1f;
      r = (r << 3) | (r >> 2);
      g = (g << 2) | (g >> 4);
      b = (b << 3) | (b >> 2);
      break;
    case 555:
    case 1555:
      a = format === 1555 ? ((v >> 15) & 1 ? 255 : 0) : 255;
      r = (v >> 10) & 0x1f;
      g = (v >> 5) & 0x1f;
      b = v & 0x1f;
      r = (r << 3) | (r >> 2);
      g = (g << 3) | (g >> 2);
      b = (b << 3) | (b >> 2);
      break;
    case 332:
      r = Math.round((((v >> 5) & 7) * 255) / 7);
      g = Math.round((((v >> 2) & 7) * 255) / 7);
      b = (v & 3) * 85;
      break;
    default:
      return v;
  }
  if (!transparency) a = 255;
  return ((a << 24) | (r << 16) | (g << 8) | b) | 0;
}

function argbToPixel(c: number, format: number): number {
  const a = (c >>> 24) & 0xff;
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  switch (format) {
    case 8888:
      return c;
    case 888:
      return c & 0xffffff;
    case 4444:
      return ((a >> 4) << 12) | ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    case 444:
      return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    case 565:
      return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    case 555:
      return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    case 1555:
      return (a >= 128 ? 0x8000 : 0) | ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    case 332:
      return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
    default:
      return c;
  }
}

/** applies g's clip and color to its surface context; returns null when drawing is a no-op */
function prep(g: GState): Ctx2D | null {
  const s = g.s;
  const ctx = s.ctx;
  if (!ctx || g.cw <= 0 || g.ch <= 0) return null;
  const key = `${g.cx},${g.cy},${g.cw},${g.ch}`;
  if (s.clipKey !== key) {
    ctx.restore();
    ctx.save();
    if (g.cx > 0 || g.cy > 0 || g.cw < s.w || g.ch < s.h) {
      ctx.beginPath();
      ctx.rect(g.cx, g.cy, g.cw, g.ch);
      ctx.clip();
    }
    s.clipKey = key;
    s.fill = '';
    s.font = '';
  }
  const fill = cssColor(g.color, g.alpha);
  if (s.fill !== fill) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    s.fill = fill;
  }
  return ctx;
}

function newGState(s: Surface, font: FontSpec): GState {
  return { s, tx: 0, ty: 0, cx: 0, cy: 0, cw: s.w, ch: s.h, color: 0, alpha: 255, font, stroke: 0 };
}

function setClip(g: GState, x: number, y: number, w: number, h: number) {
  let x0 = x + g.tx;
  let y0 = y + g.ty;
  let x1 = x0 + w;
  let y1 = y0 + h;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(g.s.w, x1);
  y1 = Math.min(g.s.h, y1);
  g.cx = x0;
  g.cy = y0;
  g.cw = Math.max(0, x1 - x0);
  g.ch = Math.max(0, y1 - y0);
}

function drawLine(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number) {
  if (y0 === y1) {
    ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1);
    return;
  }
  if (x0 === x1) {
    ctx.fillRect(x0, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1);
    return;
  }
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function arcPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, start: number, arc: number, fill: boolean) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  if (Math.abs(arc) >= 360) {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    if (fill) ctx.moveTo(cx, cy);
    const a0 = (-start * Math.PI) / 180;
    const a1 = (-(start + arc) * Math.PI) / 180;
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, a0, a1, arc > 0);
    if (fill) ctx.closePath();
  }
}

function argbToImageData(
  rgb: Int32Array,
  offset: number,
  scan: number,
  w: number,
  h: number,
  alpha: boolean,
): ImageData {
  const img = new ImageData(w, h);
  const px = img.data;
  let p = 0;
  for (let row = 0; row < h; row++) {
    let i = offset + row * scan;
    for (let col = 0; col < w; col++, i++, p += 4) {
      const c = rgb[i];
      px[p] = (c >> 16) & 0xff;
      px[p + 1] = (c >> 8) & 0xff;
      px[p + 2] = c & 0xff;
      px[p + 3] = alpha ? (c >>> 24) & 0xff : 0xff;
    }
  }
  return img;
}

export function installGraphics(vm: JVM, surfaces: SurfaceFactory, screen: () => Surface, sizes: FontSizes) {
  const fonts = new Map<string, FontSpec>();
  const fontSpec = (face: number, style: number, size: number): FontSpec => {
    const key = `${face}/${style}/${size}`;
    let f = fonts.get(key);
    if (!f) {
      const px = size === 8 ? sizes.small : size === 16 ? sizes.large : sizes.medium;
      const family = face === 32 ? 'monospace' : '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
      const css = `${style & 2 ? 'italic ' : ''}${style & 1 ? 'bold ' : ''}${px}px ${family}`;
      const height = px + 2;
      f = { css, size: px, height, baseline: Math.round(px * 0.86) + 1 };
      fonts.set(key, f);
    }
    return f;
  };
  const defaultFont = () => fontSpec(0, 0, 0);
  const G = (o: JValue) => (o as JObject).peer as GState;
  const surf = (img: JValue): Surface => {
    if (img == null) vm.throwNew('java/lang/NullPointerException');
    return (img as JObject).peer as Surface;
  };

  vm.registerNatives('javax/microedition/lcdui/Font', {
    'init0(III)V': (_t, [self, face, style, size]) => {
      (self as JObject).peer = fontSpec(face as number, style as number, size as number);
    },
    'getHeight()I': (_t, [self]) => ((self as JObject).peer as FontSpec).height,
    'getBaselinePosition()I': (_t, [self]) => ((self as JObject).peer as FontSpec).baseline,
    'charWidth(C)I': (_t, [self, c]) =>
      surfaces.measureText(((self as JObject).peer as FontSpec).css, String.fromCharCode(c as number)),
    'stringWidth(Ljava/lang/String;)I': (_t, [self, s]) => {
      const str = vm.js(s);
      if (str == null) vm.throwNew('java/lang/NullPointerException');
      return surfaces.measureText(((self as JObject).peer as FontSpec).css, str);
    },
  });

  vm.registerNatives('javax/microedition/lcdui/Graphics', {
    'initScreen()V': (_t, [self]) => {
      (self as JObject).peer = newGState(screen(), defaultFont());
    },
    'initImage(Ljavax/microedition/lcdui/Image;)V': (_t, [self, img]) => {
      (self as JObject).peer = newGState(surf(img), defaultFont());
    },
    'translate(II)V': (_t, [self, x, y]) => {
      const g = G(self);
      g.tx += x as number;
      g.ty += y as number;
    },
    'getTranslateX()I': (_t, [self]) => G(self).tx,
    'getTranslateY()I': (_t, [self]) => G(self).ty,
    'getColor()I': (_t, [self]) => G(self).color,
    'setColor(I)V': (_t, [self, rgb]) => {
      G(self).color = (rgb as number) & 0xffffff;
      G(self).alpha = 255;
    },
    '$setARGBColor(I)V': (_t, [self, argb]) => {
      G(self).color = (argb as number) & 0xffffff;
      G(self).alpha = ((argb as number) >>> 24) & 0xff;
    },
    '$getAlpha()I': (_t, [self]) => G(self).alpha,
    '$polygon([II[IIIZ)V': (_t, [self, xs, xOff, ys, yOff, n, fill]) => {
      const g = G(self);
      const N = n as number;
      if (N <= 0) return;
      const ctx = prep(g);
      if (!ctx) return;
      const X = (xs as JArray).data as Int32Array;
      const Y = (ys as JArray).data as Int32Array;
      const o = fill ? 0 : 0.5;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const px = X[(xOff as number) + i] + g.tx + o;
        const py = Y[(yOff as number) + i] + g.ty + o;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) ctx.fill();
      else {
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    '$drawPixels(Ljava/lang/Object;ZIIIIIIII)V': (_t, [self, pixels, transparency, offset, scan, x, y, w, h, tr, format]) => {
      const W = w as number;
      const H = h as number;
      if (W <= 0 || H <= 0) return;
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      const src = (pixels as JArray).data as Int32Array | Int16Array;
      const argb = new Int32Array(W * H);
      for (let row = 0; row < H; row++) {
        let i = (offset as number) + row * (scan as number);
        for (let col = 0; col < W; col++, i++) {
          const v = src instanceof Int16Array ? src[i] & 0xffff : src[i];
          argb[row * W + col] = pixelToArgb(v, format as number, !!transparency);
        }
      }
      const tmp = surfaces.create(W, H, false);
      tmp.ctx!.putImageData(argbToImageData(argb, 0, W, W, H, true), 0, 0);
      const t = tr as number;
      const X0 = (x as number) + g.tx;
      const Y0 = (y as number) + g.ty;
      if (t === 0) {
        ctx.drawImage(tmp.canvas!, X0, Y0);
        return;
      }
      const [ma, mb, mc, md, me, mf] = transformMatrix(t, W, H);
      ctx.setTransform(ma, mb, mc, md, X0 + me, Y0 + mf);
      ctx.drawImage(tmp.canvas!, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    '$getPixels(Ljava/lang/Object;IIIIIII)V': (_t, [self, pixels, offset, scan, x, y, w, h, format]) => {
      const W = w as number;
      const H = h as number;
      const g = G(self);
      if (!g.s.ctx || W <= 0 || H <= 0) return;
      const px = g.s.ctx.getImageData((x as number) + g.tx, (y as number) + g.ty, W, H).data;
      const dst = (pixels as JArray).data as Int32Array | Int16Array;
      let p = 0;
      for (let row = 0; row < H; row++) {
        let i = (offset as number) + row * (scan as number);
        for (let col = 0; col < W; col++, i++, p += 4) {
          const c = (px[p + 3] << 24) | (px[p] << 16) | (px[p + 1] << 8) | px[p + 2];
          dst[i] = argbToPixel(c, format as number);
        }
      }
    },
    'setFont0(Ljavax/microedition/lcdui/Font;)V': (_t, [self, f]) => {
      G(self).font = (f as JObject).peer as FontSpec;
    },
    'setStrokeStyle(I)V': (_t, [self, s]) => {
      G(self).stroke = s as number;
    },
    'getStrokeStyle()I': (_t, [self]) => G(self).stroke,
    'getClipX()I': (_t, [self]) => G(self).cx - G(self).tx,
    'getClipY()I': (_t, [self]) => G(self).cy - G(self).ty,
    'getClipWidth()I': (_t, [self]) => G(self).cw,
    'getClipHeight()I': (_t, [self]) => G(self).ch,
    'setClip(IIII)V': (_t, [self, x, y, w, h]) => setClip(G(self), x as number, y as number, w as number, h as number),
    'clipRect(IIII)V': (_t, [self, x, y, w, h]) => {
      const g = G(self);
      const x0 = Math.max(g.cx, (x as number) + g.tx);
      const y0 = Math.max(g.cy, (y as number) + g.ty);
      const x1 = Math.min(g.cx + g.cw, (x as number) + g.tx + (w as number));
      const y1 = Math.min(g.cy + g.ch, (y as number) + g.ty + (h as number));
      g.cx = x0;
      g.cy = y0;
      g.cw = Math.max(0, x1 - x0);
      g.ch = Math.max(0, y1 - y0);
    },
    'drawLine(IIII)V': (_t, [self, x1, y1, x2, y2]) => {
      const g = G(self);
      const ctx = prep(g);
      if (ctx) drawLine(ctx, (x1 as number) + g.tx, (y1 as number) + g.ty, (x2 as number) + g.tx, (y2 as number) + g.ty);
    },
    'fillRect(IIII)V': (_t, [self, x, y, w, h]) => {
      if ((w as number) <= 0 || (h as number) <= 0) return;
      const g = G(self);
      prep(g)?.fillRect((x as number) + g.tx, (y as number) + g.ty, w as number, h as number);
    },
    'drawRect(IIII)V': (_t, [self, x, y, w, h]) => {
      const W = w as number;
      const H = h as number;
      if (W < 0 || H < 0) return;
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      const X = (x as number) + g.tx;
      const Y = (y as number) + g.ty;
      ctx.fillRect(X, Y, W + 1, 1);
      ctx.fillRect(X, Y + H, W + 1, 1);
      ctx.fillRect(X, Y, 1, H + 1);
      ctx.fillRect(X + W, Y, 1, H + 1);
    },
    'drawRoundRect(IIIIII)V': (_t, [self, x, y, w, h, aw, ah]) => {
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.roundRect((x as number) + g.tx + 0.5, (y as number) + g.ty + 0.5, w as number, h as number, [
        Math.min(aw as number, w as number) / 2,
      ]);
      ctx.stroke();
      void ah;
    },
    'fillRoundRect(IIIIII)V': (_t, [self, x, y, w, h, aw]) => {
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      ctx.beginPath();
      ctx.roundRect((x as number) + g.tx, (y as number) + g.ty, w as number, h as number, [
        Math.min(aw as number, w as number) / 2,
      ]);
      ctx.fill();
    },
    'fillArc(IIIIII)V': (_t, [self, x, y, w, h, s, a]) => {
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      arcPath(ctx, (x as number) + g.tx, (y as number) + g.ty, w as number, h as number, s as number, a as number, true);
      ctx.fill();
    },
    'drawArc(IIIIII)V': (_t, [self, x, y, w, h, s, a]) => {
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      ctx.lineWidth = 1;
      arcPath(ctx, (x as number) + g.tx + 0.5, (y as number) + g.ty + 0.5, w as number, h as number, s as number, a as number, false);
      ctx.stroke();
    },
    'fillTriangle(IIIIII)V': (_t, [self, x1, y1, x2, y2, x3, y3]) => {
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo((x1 as number) + g.tx, (y1 as number) + g.ty);
      ctx.lineTo((x2 as number) + g.tx, (y2 as number) + g.ty);
      ctx.lineTo((x3 as number) + g.tx, (y3 as number) + g.ty);
      ctx.closePath();
      ctx.fill();
    },
    'drawString(Ljava/lang/String;III)V': (_t, [self, str, x, y, anchor]) => {
      const s = vm.js(str);
      if (s == null) vm.throwNew('java/lang/NullPointerException');
      const g = G(self);
      const ctx = prep(g);
      if (!ctx || s.length === 0) return;
      const f = g.font;
      const a = (anchor as number) || 20;
      const w = surfaces.measureText(f.css, s);
      const X = anchorX((x as number) + g.tx, w, a);
      let Y = (y as number) + g.ty;
      if (a & BASELINE) Y -= f.baseline;
      else if (a & BOTTOM) Y -= f.height;
      if (g.s.font !== f.css) {
        ctx.font = f.css;
        g.s.font = f.css;
      }
      ctx.textBaseline = 'middle';
      ctx.fillText(s, X, Y + f.height / 2 + 0.5);
    },
    'drawImage(Ljavax/microedition/lcdui/Image;III)V': (_t, [self, img, x, y, anchor]) => {
      const src = surf(img);
      const g = G(self);
      const ctx = prep(g);
      if (!ctx || !src.canvas) return;
      const a = (anchor as number) || 20;
      ctx.drawImage(src.canvas, anchorX((x as number) + g.tx, src.w, a), anchorY((y as number) + g.ty, src.h, a));
    },
    'drawRegion(Ljavax/microedition/lcdui/Image;IIIIIIII)V': (_t, [self, img, sx, sy, w, h, tr, dx, dy, anchor]) => {
      const src = surf(img);
      const W = w as number;
      const H = h as number;
      const SX = sx as number;
      const SY = sy as number;
      if (SX < 0 || SY < 0 || SX + W > src.w || SY + H > src.h || W < 0 || H < 0) {
        vm.throwNew('java/lang/IllegalArgumentException', 'region exceeds image bounds');
      }
      const g = G(self);
      const ctx = prep(g);
      if (!ctx || !src.canvas || W === 0 || H === 0) return;
      const t = tr as number;
      const a = (anchor as number) || 20;
      const dw = swapsAxes(t) ? H : W;
      const dh = swapsAxes(t) ? W : H;
      const X = anchorX((dx as number) + g.tx, dw, a);
      const Y = anchorY((dy as number) + g.ty, dh, a);
      if (t === 0) {
        ctx.drawImage(src.canvas, SX, SY, W, H, X, Y, W, H);
        return;
      }
      const [ma, mb, mc, md, me, mf] = transformMatrix(t, W, H);
      ctx.setTransform(ma, mb, mc, md, X + me, Y + mf);
      ctx.drawImage(src.canvas, SX, SY, W, H, 0, 0, W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    'copyArea(IIIIIII)V': (_t, [self, sx, sy, w, h, dx, dy, anchor]) => {
      const g = G(self);
      const ctx = prep(g);
      if (!ctx || !g.s.canvas) return;
      const W = w as number;
      const H = h as number;
      const a = (anchor as number) || 20;
      ctx.drawImage(
        g.s.canvas,
        (sx as number) + g.tx,
        (sy as number) + g.ty,
        W,
        H,
        anchorX((dx as number) + g.tx, W, a),
        anchorY((dy as number) + g.ty, H, a),
        W,
        H,
      );
    },
    'drawRGB([IIIIIIIZ)V': (_t, [self, rgb, offset, scan, x, y, w, h, alpha]) => {
      const W = w as number;
      const H = h as number;
      if (W <= 0 || H <= 0) return;
      const g = G(self);
      const ctx = prep(g);
      if (!ctx) return;
      const data = argbToImageData((rgb as JArray).data as Int32Array, offset as number, scan as number, W, H, !!alpha);
      const tmp = surfaces.create(W, H, false);
      tmp.ctx!.putImageData(data, 0, 0);
      ctx.drawImage(tmp.canvas!, (x as number) + g.tx, (y as number) + g.ty);
    },
  });

  vm.registerNatives('javax/microedition/lcdui/Image', {
    'initMutable(II)V': (_t, [self, w, h]) => {
      (self as JObject).peer = surfaces.create(w as number, h as number, true);
    },
    'decode([BII)V': (t, [self, data, off, len]) => {
      const bytes = bytesOf(data as JArray).slice(off as number, (off as number) + (len as number));
      return vm.blockOn(
        t,
        'V',
        surfaces.decode(bytes).then(
          (s) => {
            (self as JObject).peer = s;
            return undefined;
          },
          () => Promise.reject(vm.newThrowable('java/lang/IllegalArgumentException', 'cannot decode image')),
        ),
      );
    },
    'initRGB([IIIZ)V': (_t, [self, rgb, w, h, alpha]) => {
      const s = surfaces.create(w as number, h as number, false);
      if (s.ctx) {
        const W = w as number;
        s.ctx.putImageData(argbToImageData((rgb as JArray).data as Int32Array, 0, W, W, h as number, !!alpha), 0, 0);
      }
      (self as JObject).peer = s;
    },
    'initRegion(Ljavax/microedition/lcdui/Image;IIIII)V': (_t, [self, img, x, y, w, h, tr]) => {
      const src = surf(img);
      const t = tr as number;
      const W = w as number;
      const H = h as number;
      const s = surfaces.create(swapsAxes(t) ? H : W, swapsAxes(t) ? W : H, false);
      if (s.ctx && src.canvas) {
        const [ma, mb, mc, md, me, mf] = transformMatrix(t, W, H);
        s.ctx.setTransform(ma, mb, mc, md, me, mf);
        s.ctx.drawImage(src.canvas, x as number, y as number, W, H, 0, 0, W, H);
        s.ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      (self as JObject).peer = s;
    },
    '$fill(I)V': (_t, [self, argb]) => {
      const s = surf(self);
      if (!s.ctx) return;
      const c = argb as number;
      s.ctx.clearRect(0, 0, s.w, s.h);
      s.ctx.fillStyle = cssColor(c & 0xffffff, (c >>> 24) & 0xff);
      s.ctx.fillRect(0, 0, s.w, s.h);
      s.fill = '';
    },
    'getWidth()I': (_t, [self]) => surf(self).w,
    'getHeight()I': (_t, [self]) => surf(self).h,
    'isMutable()Z': (_t, [self]) => surf(self).mutable,
    'getRGB([IIIIIII)V': (_t, [self, out, offset, scan, x, y, w, h]) => {
      const s = surf(self);
      const W = w as number;
      const H = h as number;
      if (!s.ctx || W <= 0 || H <= 0) return;
      const px = s.ctx.getImageData(x as number, y as number, W, H).data;
      const dst = (out as JArray).data as Int32Array;
      let p = 0;
      for (let row = 0; row < H; row++) {
        let i = (offset as number) + row * (scan as number);
        for (let col = 0; col < W; col++, i++, p += 4) {
          dst[i] = (px[p + 3] << 24) | (px[p] << 16) | (px[p + 1] << 8) | px[p + 2];
        }
      }
    },
  });
}
