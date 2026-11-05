package jargame;

import java.io.OutputStream;

public final class ConsoleStream extends OutputStream {
    private final int fd;

    public ConsoleStream(int fd) {
        this.fd = fd;
    }

    public void write(int b) {
        write0(fd, new byte[] {(byte) b}, 0, 1);
    }

    public void write(byte[] b, int off, int len) {
        write0(fd, b, off, len);
    }

    private static native void write0(int fd, byte[] b, int off, int len);
}
