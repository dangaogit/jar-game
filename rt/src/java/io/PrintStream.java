package java.io;

public class PrintStream extends OutputStream {
    private OutputStream out;
    private boolean trouble;

    public PrintStream(OutputStream out) {
        this.out = out;
    }

    public void flush() {
        try {
            out.flush();
        } catch (IOException e) {
            trouble = true;
        }
    }

    public void close() {
        try {
            out.close();
        } catch (IOException e) {
            trouble = true;
        }
    }

    public boolean checkError() {
        return trouble;
    }

    public void write(int b) {
        try {
            out.write(b);
        } catch (IOException e) {
            trouble = true;
        }
    }

    public void write(byte[] buf, int off, int len) {
        try {
            out.write(buf, off, len);
        } catch (IOException e) {
            trouble = true;
        }
    }

    private void writeString(String s) {
        byte[] b = jargame.Text.encodeUtf8(s);
        write(b, 0, b.length);
    }

    public void print(boolean b) {
        writeString(b ? "true" : "false");
    }

    public void print(char c) {
        writeString(String.valueOf(c));
    }

    public void print(int i) {
        writeString(String.valueOf(i));
    }

    public void print(long l) {
        writeString(String.valueOf(l));
    }

    public void print(float f) {
        writeString(String.valueOf(f));
    }

    public void print(double d) {
        writeString(String.valueOf(d));
    }

    public void print(char[] s) {
        writeString(new String(s));
    }

    public void print(String s) {
        writeString(s == null ? "null" : s);
    }

    public void print(Object obj) {
        writeString(String.valueOf(obj));
    }

    public void println() {
        writeString("\n");
    }

    public void println(boolean x) {
        writeString((x ? "true" : "false") + "\n");
    }

    public void println(char x) {
        writeString(String.valueOf(x) + "\n");
    }

    public void println(int x) {
        writeString(String.valueOf(x) + "\n");
    }

    public void println(long x) {
        writeString(String.valueOf(x) + "\n");
    }

    public void println(float x) {
        writeString(String.valueOf(x) + "\n");
    }

    public void println(double x) {
        writeString(String.valueOf(x) + "\n");
    }

    public void println(char[] x) {
        writeString(new String(x) + "\n");
    }

    public void println(String x) {
        writeString((x == null ? "null" : x) + "\n");
    }

    public void println(Object x) {
        writeString(String.valueOf(x) + "\n");
    }
}
