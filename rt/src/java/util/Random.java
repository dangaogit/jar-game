package java.util;

public class Random {
    private static final long multiplier = 0x5DEECE66DL;
    private static final long addend = 0xBL;
    private static final long mask = (1L << 48) - 1;
    private static long seedUniquifier = 8682522807148012L;

    private long seed;
    private double nextNextGaussian;
    private boolean haveNextNextGaussian;

    public Random() {
        this((seedUniquifier++) + System.currentTimeMillis());
    }

    public Random(long seed) {
        setSeed(seed);
    }

    public synchronized void setSeed(long seed) {
        this.seed = (seed ^ multiplier) & mask;
        haveNextNextGaussian = false;
    }

    protected synchronized int next(int bits) {
        seed = (seed * multiplier + addend) & mask;
        return (int) (seed >>> (48 - bits));
    }

    public int nextInt() {
        return next(32);
    }

    public int nextInt(int n) {
        if (n <= 0) {
            throw new IllegalArgumentException("n must be positive");
        }
        if ((n & -n) == n) {
            return (int) ((n * (long) next(31)) >> 31);
        }
        int bits;
        int val;
        do {
            bits = next(31);
            val = bits % n;
        } while (bits - val + (n - 1) < 0);
        return val;
    }

    public long nextLong() {
        return ((long) next(32) << 32) + next(32);
    }

    public boolean nextBoolean() {
        return next(1) != 0;
    }

    public float nextFloat() {
        return next(24) / ((float) (1 << 24));
    }

    public double nextDouble() {
        return (((long) next(26) << 27) + next(27)) / (double) (1L << 53);
    }
}
