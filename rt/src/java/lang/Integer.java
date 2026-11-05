package java.lang;

public final class Integer {
    public static final int MIN_VALUE = 0x80000000;
    public static final int MAX_VALUE = 0x7fffffff;

    private final int value;

    public Integer(int value) {
        this.value = value;
    }

    public static native String toString(int i, int radix);

    public static String toString(int i) {
        return toString(i, 10);
    }

    public static native String toUnsignedString(int i, int shift);

    public static String toHexString(int i) {
        return toUnsignedString(i, 4);
    }

    public static String toOctalString(int i) {
        return toUnsignedString(i, 3);
    }

    public static String toBinaryString(int i) {
        return toUnsignedString(i, 1);
    }

    public static native int parseInt(String s, int radix) throws NumberFormatException;

    public static int parseInt(String s) throws NumberFormatException {
        return parseInt(s, 10);
    }

    public static Integer valueOf(String s, int radix) throws NumberFormatException {
        return new Integer(parseInt(s, radix));
    }

    public static Integer valueOf(String s) throws NumberFormatException {
        return new Integer(parseInt(s, 10));
    }

    public static Integer valueOf(int i) {
        return new Integer(i);
    }

    public byte byteValue() {
        return (byte) value;
    }

    public short shortValue() {
        return (short) value;
    }

    public int intValue() {
        return value;
    }

    public long longValue() {
        return value;
    }

    public float floatValue() {
        return value;
    }

    public double doubleValue() {
        return value;
    }

    public String toString() {
        return toString(value, 10);
    }

    public int hashCode() {
        return value;
    }

    public boolean equals(Object obj) {
        return obj instanceof Integer && ((Integer) obj).value == value;
    }
}
