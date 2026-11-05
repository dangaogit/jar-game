package javax.microedition.lcdui;

public final class Font {
    public static final int STYLE_PLAIN = 0;
    public static final int STYLE_BOLD = 1;
    public static final int STYLE_ITALIC = 2;
    public static final int STYLE_UNDERLINED = 4;
    public static final int SIZE_SMALL = 8;
    public static final int SIZE_MEDIUM = 0;
    public static final int SIZE_LARGE = 16;
    public static final int FACE_SYSTEM = 0;
    public static final int FACE_MONOSPACE = 32;
    public static final int FACE_PROPORTIONAL = 64;
    public static final int FONT_STATIC_TEXT = 0;
    public static final int FONT_INPUT_TEXT = 1;

    private static Font defaultFont;

    private final int face;
    private final int style;
    private final int size;

    private Font(int face, int style, int size) {
        this.face = face;
        this.style = style;
        this.size = size;
        init0(face, style, size);
    }

    private native void init0(int face, int style, int size);

    public static Font getDefaultFont() {
        if (defaultFont == null) {
            defaultFont = new Font(FACE_SYSTEM, STYLE_PLAIN, SIZE_MEDIUM);
        }
        return defaultFont;
    }

    public static Font getFont(int fontSpecifier) {
        return getDefaultFont();
    }

    public static Font getFont(int face, int style, int size) {
        if (face != FACE_SYSTEM && face != FACE_MONOSPACE && face != FACE_PROPORTIONAL) {
            throw new IllegalArgumentException("bad face");
        }
        if (size != SIZE_SMALL && size != SIZE_MEDIUM && size != SIZE_LARGE) {
            throw new IllegalArgumentException("bad size");
        }
        if ((style & ~7) != 0) {
            throw new IllegalArgumentException("bad style");
        }
        return new Font(face, style, size);
    }

    public int getStyle() {
        return style;
    }

    public int getSize() {
        return size;
    }

    public int getFace() {
        return face;
    }

    public boolean isPlain() {
        return style == STYLE_PLAIN;
    }

    public boolean isBold() {
        return (style & STYLE_BOLD) != 0;
    }

    public boolean isItalic() {
        return (style & STYLE_ITALIC) != 0;
    }

    public boolean isUnderlined() {
        return (style & STYLE_UNDERLINED) != 0;
    }

    public native int getHeight();

    public native int getBaselinePosition();

    public native int charWidth(char ch);

    public int charsWidth(char[] ch, int offset, int length) {
        return stringWidth(new String(ch, offset, length));
    }

    public native int stringWidth(String str);

    public int substringWidth(String str, int offset, int len) {
        return stringWidth(str.substring(offset, offset + len));
    }
}
