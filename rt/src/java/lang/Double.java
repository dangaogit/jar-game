package java.lang;

public final class Double {
    public static final double POSITIVE_INFINITY = 1.0 / 0.0;
    public static final double NEGATIVE_INFINITY = -1.0 / 0.0;
    public static final double NaN = 0.0d / 0.0;
    public static final double MAX_VALUE = 1.7976931348623157e+308;
    public static final double MIN_VALUE = 4.9e-324;

    private final double value;

    public Double(double value) {
        this.value = value;
    }

    public static native String toString(double d);

    public static native double parseDouble(String s) throws NumberFormatException;

    public static Double valueOf(String s) throws NumberFormatException {
        return new Double(parseDouble(s));
    }

    public static Double valueOf(double d) {
        return new Double(d);
    }

    public static boolean isNaN(double v) {
        return v != v;
    }

    public static boolean isInfinite(double v) {
        return v == POSITIVE_INFINITY || v == NEGATIVE_INFINITY;
    }

    public static native long doubleToLongBits(double value);

    public static native double longBitsToDouble(long bits);

    public boolean isNaN() {
        return isNaN(value);
    }

    public double doubleValue() {
        return value;
    }

    public float floatValue() {
        return (float) value;
    }

    public int intValue() {
        return (int) value;
    }

    public long longValue() {
        return (long) value;
    }

    public String toString() {
        return toString(value);
    }

    public int hashCode() {
        long bits = doubleToLongBits(value);
        return (int) (bits ^ (bits >>> 32));
    }

    public boolean equals(Object obj) {
        return obj instanceof Double && doubleToLongBits(((Double) obj).value) == doubleToLongBits(value);
    }
}
