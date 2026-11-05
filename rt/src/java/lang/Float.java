package java.lang;

public final class Float {
    public static final float POSITIVE_INFINITY = 1.0f / 0.0f;
    public static final float NEGATIVE_INFINITY = -1.0f / 0.0f;
    public static final float NaN = 0.0f / 0.0f;
    public static final float MAX_VALUE = 3.4028235e+38f;
    public static final float MIN_VALUE = 1.4e-45f;

    private final float value;

    public Float(float value) {
        this.value = value;
    }

    public Float(double value) {
        this.value = (float) value;
    }

    public static native String toString(float f);

    public static native float parseFloat(String s) throws NumberFormatException;

    public static Float valueOf(String s) throws NumberFormatException {
        return new Float(parseFloat(s));
    }

    public static Float valueOf(float f) {
        return new Float(f);
    }

    public static boolean isNaN(float v) {
        return v != v;
    }

    public static boolean isInfinite(float v) {
        return v == POSITIVE_INFINITY || v == NEGATIVE_INFINITY;
    }

    public static native int floatToIntBits(float value);

    public static native float intBitsToFloat(int bits);

    public boolean isNaN() {
        return isNaN(value);
    }

    public float floatValue() {
        return value;
    }

    public double doubleValue() {
        return value;
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
        return floatToIntBits(value);
    }

    public boolean equals(Object obj) {
        return obj instanceof Float && floatToIntBits(((Float) obj).value) == floatToIntBits(value);
    }
}
