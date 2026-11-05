package java.io;

public class OutputStreamWriter extends Writer {
    private OutputStream out;
    private final String enc;

    public OutputStreamWriter(OutputStream os) {
        this.out = os;
        this.enc = null;
    }

    public OutputStreamWriter(OutputStream os, String enc) throws UnsupportedEncodingException {
        this.out = os;
        this.enc = enc;
        "".getBytes(enc);
    }

    public void write(char[] cbuf, int off, int len) throws IOException {
        byte[] b = enc == null ? new String(cbuf, off, len).getBytes() : new String(cbuf, off, len).getBytes(enc);
        out.write(b, 0, b.length);
    }

    public void flush() throws IOException {
        out.flush();
    }

    public void close() throws IOException {
        out.close();
    }
}
