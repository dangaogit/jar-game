export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** A drawable pixel buffer (the screen back buffer or an Image). */
export interface Surface {
  w: number;
  h: number;
  mutable: boolean;
  canvas: AnyCanvas | null;
  ctx: Ctx2D | null;
  /** clip currently applied to ctx (see graphics.ts) */
  clipKey: string;
  fill: string;
  font: string;
  /** ctx was created with willReadFrequently (see readPixels) */
  readable?: boolean;
}

export interface SurfaceFactory {
  create(w: number, h: number, mutable: boolean): Surface;
  /** decodes PNG/JPEG/GIF bytes; rejects if the data is not an image */
  decode(bytes: Uint8Array): Promise<Surface>;
  measureText(css: string, text: string): number;
}

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context2d(canvas: AnyCanvas, willReadFrequently: boolean): Ctx2D {
  const ctx = canvas.getContext('2d', { willReadFrequently }) as Ctx2D;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/**
 * getImageData for pixel reads made by the game. Surfaces start out GPU-backed, which makes drawing fast but
 * every readback slow, so the first read moves the surface to a CPU-backed (willReadFrequently) canvas.
 */
export function readPixels(s: Surface, x: number, y: number, w: number, h: number): ImageData {
  if (!s.readable) {
    const canvas = makeCanvas(s.w, s.h);
    const ctx = context2d(canvas, true);
    if (s.w > 0 && s.h > 0) ctx.drawImage(s.canvas!, 0, 0);
    ctx.save();
    s.canvas = canvas;
    s.ctx = ctx;
    s.readable = true;
    s.clipKey = '';
    s.fill = '';
    s.font = '';
  }
  return s.ctx!.getImageData(x, y, w, h);
}

export class CanvasSurfaceFactory implements SurfaceFactory {
  private measureCtx: Ctx2D | null = null;
  private widthCache = new Map<string, number>();

  create(w: number, h: number, mutable: boolean): Surface {
    const canvas = makeCanvas(w, h);
    const ctx = context2d(canvas, false);
    if (mutable) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    return { w, h, mutable, canvas, ctx, clipKey: '', fill: '', font: '' };
  }

  async decode(bytes: Uint8Array): Promise<Surface> {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const s = this.create(bitmap.width, bitmap.height, false);
    s.ctx!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return s;
  }

  measureText(css: string, text: string): number {
    const key = css + '\u0000' + text;
    let w = this.widthCache.get(key);
    if (w === undefined) {
      if (!this.measureCtx) this.measureCtx = makeCanvas(1, 1).getContext('2d') as Ctx2D;
      this.measureCtx.font = css;
      w = Math.round(this.measureCtx.measureText(text).width);
      if (this.widthCache.size > 20000) this.widthCache.clear();
      this.widthCache.set(key, w);
    }
    return w;
  }
}

/** Reads [width, height] from PNG, GIF, JPEG or BMP headers. */
export function imageSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return [dv.getUint32(16), dv.getUint32(20)];
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return [dv.getUint16(6, true), dv.getUint16(8, true)];
  if (b[0] === 0x42 && b[1] === 0x4d) return [dv.getInt32(18, true), Math.abs(dv.getInt32(22, true))];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) return null;
      const marker = b[p + 1];
      const len = dv.getUint16(p + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [dv.getUint16(p + 7), dv.getUint16(p + 5)];
      }
      p += 2 + len;
    }
  }
  return null;
}

/** No-op rendering for headless runs (tests, Node). Images only report their dimensions. */
export class HeadlessSurfaceFactory implements SurfaceFactory {
  create(w: number, h: number, mutable: boolean): Surface {
    return { w, h, mutable, canvas: null, ctx: null, clipKey: '', fill: '', font: '' };
  }

  async decode(bytes: Uint8Array): Promise<Surface> {
    const size = imageSize(bytes);
    if (!size) throw new Error('unsupported image');
    return this.create(size[0], size[1], false);
  }

  measureText(css: string, text: string): number {
    const size = Number(/(\d+)px/.exec(css)?.[1] ?? 12);
    let w = 0;
    for (let i = 0; i < text.length; i++) w += text.charCodeAt(i) < 0x80 ? Math.ceil(size / 2) : size;
    return w;
  }
}
