package javax.microedition.lcdui;

public class TextField extends Item {
    public static final int ANY = 0;
    public static final int EMAILADDR = 1;
    public static final int NUMERIC = 2;
    public static final int PHONENUMBER = 3;
    public static final int URL = 4;
    public static final int DECIMAL = 5;
    public static final int PASSWORD = 0x10000;
    public static final int UNEDITABLE = 0x20000;
    public static final int SENSITIVE = 0x40000;
    public static final int NON_PREDICTIVE = 0x80000;
    public static final int INITIAL_CAPS_WORD = 0x100000;
    public static final int INITIAL_CAPS_SENTENCE = 0x200000;
    public static final int CONSTRAINT_MASK = 0xFFFF;

    private String text;
    private int maxSize;
    private int constraints;

    public TextField(String label, String text, int maxSize, int constraints) {
        super(label);
        this.maxSize = maxSize;
        this.constraints = constraints;
        setString(text);
    }

    public String getString() {
        return text;
    }

    public void setString(String s) {
        if (s == null) {
            s = "";
        }
        if (s.length() > maxSize) {
            throw new IllegalArgumentException();
        }
        text = s;
        $changed();
    }

    public int getChars(char[] data) {
        text.getChars(0, text.length(), data, 0);
        return text.length();
    }

    public void setChars(char[] data, int offset, int length) {
        setString(data == null ? "" : new String(data, offset, length));
    }

    public void insert(String src, int position) {
        String s = text.substring(0, position) + src + text.substring(position);
        setString(s);
    }

    public void insert(char[] data, int offset, int length, int position) {
        insert(new String(data, offset, length), position);
    }

    public void delete(int offset, int length) {
        setString(text.substring(0, offset) + text.substring(offset + length));
    }

    public int getMaxSize() {
        return maxSize;
    }

    public int setMaxSize(int maxSize) {
        this.maxSize = maxSize;
        if (text.length() > maxSize) {
            text = text.substring(0, maxSize);
        }
        return maxSize;
    }

    public int size() {
        return text.length();
    }

    public int getCaretPosition() {
        return text.length();
    }

    public void setConstraints(int constraints) {
        this.constraints = constraints;
    }

    public int getConstraints() {
        return constraints;
    }

    public void setInitialInputMode(String characterSubset) {
    }

    int $kind() {
        return KIND_INPUT;
    }

    String $text() {
        return text;
    }

    void $setText(String s) {
        text = s.length() > maxSize ? s.substring(0, maxSize) : s;
    }
}
