package java.lang;

public class Runtime {
    private static final Runtime runtime = new Runtime();

    private Runtime() {
    }

    public static Runtime getRuntime() {
        return runtime;
    }

    public native void exit(int status);

    public long freeMemory() {
        return 1536L * 1024L;
    }

    public long totalMemory() {
        return 2048L * 1024L;
    }

    public void gc() {
    }
}
