package java.lang;

/** java.lang.StringBuilder is generated from this file by scripts/build-rt.mjs. */
public final class StringBuffer {
    private char[] value;
    private int count;

    public StringBuffer() {
        this(16);
    }

    public StringBuffer(int length) {
        value = new char[length];
    }

    public StringBuffer(String str) {
        this(str.length() + 16);
        append(str);
    }

    public int length() {
        return count;
    }

    public int capacity() {
        return value.length;
    }

    public void ensureCapacity(int minimumCapacity) {
        if (minimumCapacity > value.length) {
            int newCapacity = (value.length + 1) * 2;
            if (minimumCapacity > newCapacity) {
                newCapacity = minimumCapacity;
            }
            char[] newValue = new char[newCapacity];
            System.arraycopy(value, 0, newValue, 0, count);
            value = newValue;
        }
    }

    public void setLength(int newLength) {
        if (newLength < 0) {
            throw new StringIndexOutOfBoundsException(newLength);
        }
        ensureCapacity(newLength);
        for (int i = count; i < newLength; i++) {
            value[i] = '\0';
        }
        count = newLength;
    }

    public char charAt(int index) {
        if (index < 0 || index >= count) {
            throw new StringIndexOutOfBoundsException(index);
        }
        return value[index];
    }

    public void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin) {
        if (srcBegin < 0 || srcEnd > count || srcBegin > srcEnd) {
            throw new StringIndexOutOfBoundsException(srcBegin);
        }
        System.arraycopy(value, srcBegin, dst, dstBegin, srcEnd - srcBegin);
    }

    public void setCharAt(int index, char ch) {
        if (index < 0 || index >= count) {
            throw new StringIndexOutOfBoundsException(index);
        }
        value[index] = ch;
    }

    public StringBuffer append(Object obj) {
        return append(String.valueOf(obj));
    }

    public StringBuffer append(String str) {
        if (str == null) {
            str = "null";
        }
        int len = str.length();
        ensureCapacity(count + len);
        str.getChars(0, len, value, count);
        count += len;
        return this;
    }

    public StringBuffer append(StringBuffer sb) {
        return append(sb == null ? "null" : sb.toString());
    }

    public StringBuffer append(char[] str) {
        return append(str, 0, str.length);
    }

    public StringBuffer append(char[] str, int offset, int len) {
        ensureCapacity(count + len);
        System.arraycopy(str, offset, value, count, len);
        count += len;
        return this;
    }

    public StringBuffer append(boolean b) {
        return append(b ? "true" : "false");
    }

    public StringBuffer append(char c) {
        ensureCapacity(count + 1);
        value[count++] = c;
        return this;
    }

    public StringBuffer append(int i) {
        return append(Integer.toString(i, 10));
    }

    public StringBuffer append(long l) {
        return append(Long.toString(l, 10));
    }

    public StringBuffer append(float f) {
        return append(Float.toString(f));
    }

    public StringBuffer append(double d) {
        return append(Double.toString(d));
    }

    public StringBuffer delete(int start, int end) {
        if (end > count) {
            end = count;
        }
        if (start < 0 || start > end) {
            throw new StringIndexOutOfBoundsException(start);
        }
        int len = end - start;
        if (len > 0) {
            System.arraycopy(value, start + len, value, start, count - end);
            count -= len;
        }
        return this;
    }

    public StringBuffer deleteCharAt(int index) {
        if (index < 0 || index >= count) {
            throw new StringIndexOutOfBoundsException(index);
        }
        System.arraycopy(value, index + 1, value, index, count - index - 1);
        count--;
        return this;
    }

    public StringBuffer insert(int offset, Object obj) {
        return insert(offset, String.valueOf(obj));
    }

    public StringBuffer insert(int offset, String str) {
        if (offset < 0 || offset > count) {
            throw new StringIndexOutOfBoundsException(offset);
        }
        if (str == null) {
            str = "null";
        }
        int len = str.length();
        ensureCapacity(count + len);
        System.arraycopy(value, offset, value, offset + len, count - offset);
        str.getChars(0, len, value, offset);
        count += len;
        return this;
    }

    public StringBuffer insert(int offset, char[] str) {
        return insert(offset, new String(str));
    }

    public StringBuffer insert(int offset, boolean b) {
        return insert(offset, b ? "true" : "false");
    }

    public StringBuffer insert(int offset, char c) {
        return insert(offset, String.valueOf(c));
    }

    public StringBuffer insert(int offset, int i) {
        return insert(offset, Integer.toString(i, 10));
    }

    public StringBuffer insert(int offset, long l) {
        return insert(offset, Long.toString(l, 10));
    }

    public StringBuffer insert(int offset, float f) {
        return insert(offset, Float.toString(f));
    }

    public StringBuffer insert(int offset, double d) {
        return insert(offset, Double.toString(d));
    }

    public StringBuffer reverse() {
        for (int i = 0, j = count - 1; i < j; i++, j--) {
            char c = value[i];
            value[i] = value[j];
            value[j] = c;
        }
        return this;
    }

    public String toString() {
        return new String(value, 0, count);
    }
}
