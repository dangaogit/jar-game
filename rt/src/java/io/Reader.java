package java.io;

public abstract class Reader {
    protected Object lock;

    protected Reader() {
        lock = this;
    }

    protected Reader(Object lock) {
        this.lock = lock;
    }

    public int read() throws IOException {
        char[] cb = new char[1];
        return read(cb, 0, 1) == -1 ? -1 : cb[0];
    }

    public int read(char[] cbuf) throws IOException {
        return read(cbuf, 0, cbuf.length);
    }

    public abstract int read(char[] cbuf, int off, int len) throws IOException;

    public long skip(long n) throws IOException {
        long r = 0;
        while (r < n && read() >= 0) {
            r++;
        }
        return r;
    }

    public boolean ready() throws IOException {
        return false;
    }

    public boolean markSupported() {
        return false;
    }

    public void mark(int readAheadLimit) throws IOException {
        throw new IOException("mark() not supported");
    }

    public void reset() throws IOException {
        throw new IOException("reset() not supported");
    }

    public abstract void close() throws IOException;
}
