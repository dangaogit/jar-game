package com.nokia.mid.ui;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

final class DirectGraphicsImpl implements DirectGraphics {
    private final Graphics g;

    DirectGraphicsImpl(Graphics g) {
        this.g = g;
    }

    /**
     * Nokia manipulation (flips, then counter-clockwise rotation) to a MIDP Sprite transform (mirror, then
     * clockwise rotation).
     */
    static int toTransform(int manipulation) {
        boolean h = (manipulation & FLIP_HORIZONTAL) != 0;
        boolean v = (manipulation & FLIP_VERTICAL) != 0;
        boolean mirror = h != v;
        int cw = v ? 180 : 0;
        int ccw = manipulation & ~(FLIP_HORIZONTAL | FLIP_VERTICAL);
        cw = ((cw + 360 - ccw) % 360 + 360) % 360;
        switch (cw) {
            case 90:
                return mirror ? 7 : 5;
            case 180:
                return mirror ? 1 : 3;
            case 270:
                return mirror ? 4 : 6;
            default:
                return mirror ? 2 : 0;
        }
    }

    private int saveColor() {
        return (g.$getAlpha() << 24) | g.getColor();
    }

    public void setARGBColor(int argbColor) {
        g.$setARGBColor(argbColor);
    }

    public int getAlphaComponent() {
        return g.$getAlpha();
    }

    public int getNativePixelFormat() {
        return TYPE_USHORT_4444_ARGB;
    }

    public void drawImage(Image img, int x, int y, int anchor, int manipulation) {
        if (img == null) {
            throw new NullPointerException();
        }
        g.drawRegion(img, 0, 0, img.getWidth(), img.getHeight(), toTransform(manipulation), x, y,
                anchor == 0 ? Graphics.TOP | Graphics.LEFT : anchor);
    }

    private void polygon(int[] xs, int xOff, int[] ys, int yOff, int n, int argb, boolean fill) {
        int old = saveColor();
        g.$setARGBColor(argb);
        g.$polygon(xs, xOff, ys, yOff, n, fill);
        g.$setARGBColor(old);
    }

    public void drawTriangle(int x1, int y1, int x2, int y2, int x3, int y3, int argbColor) {
        polygon(new int[] {x1, x2, x3}, 0, new int[] {y1, y2, y3}, 0, 3, argbColor, false);
    }

    public void fillTriangle(int x1, int y1, int x2, int y2, int x3, int y3, int argbColor) {
        polygon(new int[] {x1, x2, x3}, 0, new int[] {y1, y2, y3}, 0, 3, argbColor, true);
    }

    public void drawPolygon(int[] xPoints, int xOffset, int[] yPoints, int yOffset, int nPoints, int argbColor) {
        polygon(xPoints, xOffset, yPoints, yOffset, nPoints, argbColor, false);
    }

    public void fillPolygon(int[] xPoints, int xOffset, int[] yPoints, int yOffset, int nPoints, int argbColor) {
        polygon(xPoints, xOffset, yPoints, yOffset, nPoints, argbColor, true);
    }

    public void drawPixels(int[] pixels, boolean transparency, int offset, int scanlength, int x, int y, int width,
            int height, int manipulation, int format) {
        if (pixels == null) {
            throw new NullPointerException();
        }
        g.$drawPixels(pixels, transparency, offset, scanlength, x, y, width, height, toTransform(manipulation), format);
    }

    public void drawPixels(short[] pixels, boolean transparency, int offset, int scanlength, int x, int y,
            int width, int height, int manipulation, int format) {
        if (pixels == null) {
            throw new NullPointerException();
        }
        g.$drawPixels(pixels, transparency, offset, scanlength, x, y, width, height, toTransform(manipulation), format);
    }

    public void drawPixels(byte[] pixels, byte[] transparencyMask, int offset, int scanlength, int x, int y,
            int width, int height, int manipulation, int format) {
        if (pixels == null) {
            throw new NullPointerException();
        }
        int[] argb = new int[width * height];
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                int v = pixels[offset + row * scanlength + col] & 0xFF;
                int c;
                if (format == TYPE_BYTE_332_RGB) {
                    c = 0xFF000000 | ((((v >> 5) & 7) * 255 / 7) << 16) | ((((v >> 2) & 7) * 255 / 7) << 8)
                            | ((v & 3) * 85);
                } else {
                    c = 0xFF000000 | (v << 16) | (v << 8) | v;
                }
                if (transparencyMask != null && transparencyMask[offset + row * scanlength + col] == 0) {
                    c &= 0x00FFFFFF;
                }
                argb[row * width + col] = c;
            }
        }
        g.$drawPixels(argb, transparencyMask != null, 0, width, x, y, width, height, toTransform(manipulation),
                TYPE_INT_8888_ARGB);
    }

    public void getPixels(int[] pixels, int offset, int scanlength, int x, int y, int width, int height,
            int format) {
        g.$getPixels(pixels, offset, scanlength, x, y, width, height, format);
    }

    public void getPixels(short[] pixels, int offset, int scanlength, int x, int y, int width, int height,
            int format) {
        g.$getPixels(pixels, offset, scanlength, x, y, width, height, format);
    }

    public void getPixels(byte[] pixels, byte[] transparencyMask, int offset, int scanlength, int x, int y,
            int width, int height, int format) {
        int[] argb = new int[width * height];
        g.$getPixels(argb, 0, width, x, y, width, height, TYPE_INT_8888_ARGB);
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                int c = argb[row * width + col];
                int i = offset + row * scanlength + col;
                pixels[i] = (byte) ((((c >> 16) & 0xFF) * 77 + ((c >> 8) & 0xFF) * 150 + (c & 0xFF) * 29) >> 8);
                if (transparencyMask != null) {
                    transparencyMask[i] = (byte) ((c >>> 24) >= 128 ? 1 : 0);
                }
            }
        }
    }
}
