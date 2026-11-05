package javax.microedition.lcdui;

public class Graphics {
    public static final int HCENTER = 1;
    public static final int VCENTER = 2;
    public static final int LEFT = 4;
    public static final int RIGHT = 8;
    public static final int TOP = 16;
    public static final int BOTTOM = 32;
    public static final int BASELINE = 64;
    public static final int SOLID = 0;
    public static final int DOTTED = 1;

    private Font font;

    Graphics() {
    }

    static Graphics $forScreen() {
        Graphics g = new Graphics();
        g.initScreen();
        g.setFont(null);
        return g;
    }

    static Graphics $forImage(Image img) {
        Graphics g = new Graphics();
        g.initImage(img);
        g.setFont(null);
        return g;
    }

    private native void initScreen();

    private native void initImage(Image img);

    public native void translate(int x, int y);

    public native int getTranslateX();

    public native int getTranslateY();

    public native int getColor();

    public int getRedComponent() {
        return (getColor() >> 16) & 0xFF;
    }

    public int getGreenComponent() {
        return (getColor() >> 8) & 0xFF;
    }

    public int getBlueComponent() {
        return getColor() & 0xFF;
    }

    public int getGrayScale() {
        return (getRedComponent() * 76 + getGreenComponent() * 150 + getBlueComponent() * 29) >> 8;
    }

    public void setColor(int red, int green, int blue) {
        if (red < 0 || red > 255 || green < 0 || green > 255 || blue < 0 || blue > 255) {
            throw new IllegalArgumentException();
        }
        setColor((red << 16) | (green << 8) | blue);
    }

    public native void setColor(int rgb);

    public void setGrayScale(int value) {
        setColor(value, value, value);
    }

    public Font getFont() {
        return font;
    }

    public void setFont(Font f) {
        if (f == null) {
            f = Font.getDefaultFont();
        }
        font = f;
        setFont0(f);
    }

    private native void setFont0(Font f);

    public native void setStrokeStyle(int style);

    public native int getStrokeStyle();

    public native int getClipX();

    public native int getClipY();

    public native int getClipWidth();

    public native int getClipHeight();

    public native void clipRect(int x, int y, int width, int height);

    public native void setClip(int x, int y, int width, int height);

    public native void drawLine(int x1, int y1, int x2, int y2);

    public native void fillRect(int x, int y, int width, int height);

    public native void drawRect(int x, int y, int width, int height);

    public native void drawRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight);

    public native void fillRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight);

    public native void fillArc(int x, int y, int width, int height, int startAngle, int arcAngle);

    public native void drawArc(int x, int y, int width, int height, int startAngle, int arcAngle);

    public native void fillTriangle(int x1, int y1, int x2, int y2, int x3, int y3);

    public native void drawString(String str, int x, int y, int anchor);

    public void drawSubstring(String str, int offset, int len, int x, int y, int anchor) {
        drawString(str.substring(offset, offset + len), x, y, anchor);
    }

    public void drawChar(char character, int x, int y, int anchor) {
        drawString(String.valueOf(character), x, y, anchor);
    }

    public void drawChars(char[] data, int offset, int length, int x, int y, int anchor) {
        drawString(new String(data, offset, length), x, y, anchor);
    }

    public native void drawImage(Image img, int x, int y, int anchor);

    public native void drawRegion(Image src, int xSrc, int ySrc, int width, int height, int transform, int xDest,
            int yDest, int anchor);

    public native void copyArea(int xSrc, int ySrc, int width, int height, int xDest, int yDest, int anchor);

    public native void drawRGB(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height,
            boolean processAlpha);

    public int getDisplayColor(int color) {
        return color & 0xFFFFFF;
    }

    // ---------------------------------------------------------------- vendor extensions (Nokia DirectGraphics)

    /** cached com.nokia.mid.ui.DirectGraphics wrapper */
    public Object $direct;

    public native void $setARGBColor(int argb);

    public native int $getAlpha();

    public native void $polygon(int[] xPoints, int xOffset, int[] yPoints, int yOffset, int nPoints, boolean fill);

    /** pixels: int[] or short[] in a Nokia DirectGraphics format; transform: MIDP Sprite transform */
    public native void $drawPixels(Object pixels, boolean transparency, int offset, int scanlength, int x, int y,
            int width, int height, int transform, int format);

    public native void $getPixels(Object pixels, int offset, int scanlength, int x, int y, int width, int height,
            int format);
}
