package java.lang;

public final class Character {
    public static final int MIN_RADIX = 2;
    public static final int MAX_RADIX = 36;
    public static final char MIN_VALUE = '\u0000';
    public static final char MAX_VALUE = '\uffff';

    private final char value;

    public Character(char value) {
        this.value = value;
    }

    public static Character valueOf(char c) {
        return new Character(c);
    }

    public char charValue() {
        return value;
    }

    public int hashCode() {
        return value;
    }

    public boolean equals(Object obj) {
        return obj instanceof Character && ((Character) obj).value == value;
    }

    public String toString() {
        return String.valueOf(value);
    }

    public static boolean isLowerCase(char ch) {
        return toUpperCase(ch) != ch;
    }

    public static boolean isUpperCase(char ch) {
        return toLowerCase(ch) != ch;
    }

    public static boolean isDigit(char ch) {
        return ch >= '0' && ch <= '9';
    }

    public static native char toLowerCase(char ch);

    public static native char toUpperCase(char ch);

    public static int digit(char ch, int radix) {
        int d;
        if (ch >= '0' && ch <= '9') {
            d = ch - '0';
        } else if (ch >= 'a' && ch <= 'z') {
            d = ch - 'a' + 10;
        } else if (ch >= 'A' && ch <= 'Z') {
            d = ch - 'A' + 10;
        } else {
            return -1;
        }
        return d < radix ? d : -1;
    }
}
