package java.lang;

public final class Long {
    public static final long MIN_VALUE = 0x8000000000000000L;
    public static final long MAX_VALUE = 0x7fffffffffffffffL;

    private final long value;

    public Long(long value) {
        this.value = value;
    }

    public static native String toString(long i, int radix);

    public static String toString(long i) {
        return toString(i, 10);
    }

    public static native long parseLong(String s, int radix) throws NumberFormatException;

    public static long parseLong(String s) throws NumberFormatException {
        return parseLong(s, 10);
    }

    public static Long valueOf(long l) {
        return new Long(l);
    }

    public long longValue() {
        return value;
    }

    public int intValue() {
        return (int) value;
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
        return (int) (value ^ (value >>> 32));
    }

    public boolean equals(Object obj) {
        return obj instanceof Long && ((Long) obj).value == value;
    }
}
