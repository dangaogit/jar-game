package java.io;

/** Decodes UTF-8 (default) or UTF-16 streams; other encodings fall back to UTF-8. */
public class InputStreamReader extends Reader {
    private InputStream in;
    private boolean utf16be;
    private boolean utf16le;

    public InputStreamReader(InputStream is) {
        in = is;
    }

    public InputStreamReader(InputStream is, String enc) throws UnsupportedEncodingException {
        in = is;
        if (enc != null) {
            String e = enc.toUpperCase();
            utf16be = e.equals("UTF-16BE") || e.equals("UTF-16") || e.equals("UNICODEBIG");
            utf16le = e.equals("UTF-16LE") || e.equals("UNICODELITTLE");
        }
    }

    private int readChar() throws IOException {
        int b0 = in.read();
        if (b0 < 0) {
            return -1;
        }
        if (utf16be || utf16le) {
            int b1 = in.read();
            if (b1 < 0) {
                return -1;
            }
            return utf16be ? ((b0 << 8) | b1) : ((b1 << 8) | b0);
        }
        if (b0 < 0x80) {
            return b0;
        }
        if ((b0 & 0xE0) == 0xC0) {
            return ((b0 & 0x1F) << 6) | (in.read() & 0x3F);
        }
        if ((b0 & 0xF0) == 0xE0) {
            int b1 = in.read();
            int b2 = in.read();
            return ((b0 & 0x0F) << 12) | ((b1 & 0x3F) << 6) | (b2 & 0x3F);
        }
        return 0xFFFD;
    }

    public int read(char[] cbuf, int off, int len) throws IOException {
        int n = 0;
        while (n < len) {
            int c = readChar();
            if (c < 0) {
                break;
            }
            cbuf[off + n++] = (char) c;
        }
        return n == 0 && len > 0 ? -1 : n;
    }

    public boolean ready() throws IOException {
        return in.available() > 0;
    }

    public void close() throws IOException {
        in.close();
    }
}
