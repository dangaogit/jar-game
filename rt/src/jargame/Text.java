package jargame;

public final class Text {
    private Text() {
    }

    public static native String decodeModifiedUtf8(byte[] bytes);

    public static native byte[] encodeModifiedUtf8(String s);

    public static native byte[] encodeUtf8(String s);
}
