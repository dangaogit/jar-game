package java.lang;

public final class Math {
    public static final double E = 2.718281828459045;
    public static final double PI = 3.141592653589793;

    private Math() {
    }

    public static int abs(int a) {
        return a < 0 ? -a : a;
    }

    public static long abs(long a) {
        return a < 0 ? -a : a;
    }

    public static float abs(float a) {
        return a <= 0.0F ? 0.0F - a : a;
    }

    public static double abs(double a) {
        return a <= 0.0D ? 0.0D - a : a;
    }

    public static int max(int a, int b) {
        return a >= b ? a : b;
    }

    public static long max(long a, long b) {
        return a >= b ? a : b;
    }

    public static native float max(float a, float b);

    public static native double max(double a, double b);

    public static int min(int a, int b) {
        return a <= b ? a : b;
    }

    public static long min(long a, long b) {
        return a <= b ? a : b;
    }

    public static native float min(float a, float b);

    public static native double min(double a, double b);

    public static native double sin(double a);

    public static native double cos(double a);

    public static native double tan(double a);

    public static native double sqrt(double a);

    public static native double ceil(double a);

    public static native double floor(double a);

    public static native double random();

    public static double toRadians(double angdeg) {
        return angdeg / 180.0 * PI;
    }

    public static double toDegrees(double angrad) {
        return angrad * 180.0 / PI;
    }
}
