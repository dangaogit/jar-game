package java.lang;

import java.io.UnsupportedEncodingException;

/** Backed by a host (JS) string; every operation is native. */
public final class String {
    public String() {
        init("");
    }

    public String(String value) {
        init(value);
    }

    public String(char[] value) {
        initChars(value, 0, value.length);
    }

    public String(char[] value, int offset, int count) {
        initChars(value, offset, count);
    }

    public String(byte[] bytes) {
        initBytes(bytes, 0, bytes.length, null);
    }

    public String(byte[] bytes, int off, int len) {
        initBytes(bytes, off, len, null);
    }

    public String(byte[] bytes, String enc) throws UnsupportedEncodingException {
        initBytes(bytes, 0, bytes.length, enc);
    }

    public String(byte[] bytes, int off, int len, String enc) throws UnsupportedEncodingException {
        initBytes(bytes, off, len, enc);
    }

    public String(StringBuffer buffer) {
        init(buffer.toString());
    }

    private native void init(String s);

    private native void initChars(char[] value, int offset, int count);

    private native void initBytes(byte[] bytes, int off, int len, String enc);

    public native int length();

    public native char charAt(int index);

    public native void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin);

    public native byte[] getBytes(String enc) throws UnsupportedEncodingException;

    public byte[] getBytes() {
        try {
            return getBytes(null);
        } catch (UnsupportedEncodingException e) {
            return new byte[0];
        }
    }

    public native boolean equals(Object anObject);

    public native boolean equalsIgnoreCase(String anotherString);

    public native int compareTo(String anotherString);

    public native boolean regionMatches(boolean ignoreCase, int toffset, String other, int ooffset, int len);

    public native boolean startsWith(String prefix, int toffset);

    public boolean startsWith(String prefix) {
        return startsWith(prefix, 0);
    }

    public native boolean endsWith(String suffix);

    public native int hashCode();

    public int indexOf(int ch) {
        return indexOf(ch, 0);
    }

    public native int indexOf(int ch, int fromIndex);

    public int lastIndexOf(int ch) {
        return lastIndexOf(ch, length() - 1);
    }

    public native int lastIndexOf(int ch, int fromIndex);

    public int indexOf(String str) {
        return indexOf(str, 0);
    }

    public native int indexOf(String str, int fromIndex);

    public int lastIndexOf(String str) {
        return lastIndexOf(str, length());
    }

    public native int lastIndexOf(String str, int fromIndex);

    public String substring(int beginIndex) {
        return substring(beginIndex, length());
    }

    public native String substring(int beginIndex, int endIndex);

    public native String concat(String str);

    public native String replace(char oldChar, char newChar);

    public native String toLowerCase();

    public native String toUpperCase();

    public native String trim();

    public String toString() {
        return this;
    }

    public native char[] toCharArray();

    public native String intern();

    public static String valueOf(Object obj) {
        return obj == null ? "null" : obj.toString();
    }

    public static String valueOf(char[] data) {
        return new String(data);
    }

    public static String valueOf(char[] data, int offset, int count) {
        return new String(data, offset, count);
    }

    public static String valueOf(boolean b) {
        return b ? "true" : "false";
    }

    public static native String valueOf(char c);

    public static String valueOf(int i) {
        return Integer.toString(i, 10);
    }

    public static String valueOf(long l) {
        return Long.toString(l, 10);
    }

    public static String valueOf(float f) {
        return Float.toString(f);
    }

    public static String valueOf(double d) {
        return Double.toString(d);
    }
}
