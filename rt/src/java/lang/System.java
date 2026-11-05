package java.lang;

import java.io.PrintStream;

public final class System {
    public static final PrintStream out = new PrintStream(new jargame.ConsoleStream(1));
    public static final PrintStream err = new PrintStream(new jargame.ConsoleStream(2));

    private System() {
    }

    public static native long currentTimeMillis();

    public static native void arraycopy(Object src, int srcPos, Object dst, int dstPos, int length);

    public static native int identityHashCode(Object x);

    public static native String getProperty(String key);

    public static void exit(int status) {
        Runtime.getRuntime().exit(status);
    }

    public static void gc() {
    }
}
