package java.util;

public class Hashtable {
    private Entry[] table;
    private int count;
    private int threshold;

    public Hashtable(int initialCapacity) {
        if (initialCapacity < 0) {
            throw new IllegalArgumentException();
        }
        if (initialCapacity == 0) {
            initialCapacity = 1;
        }
        table = new Entry[initialCapacity];
        threshold = (initialCapacity * 3) / 4;
    }

    public Hashtable() {
        this(11);
    }

    public int size() {
        return count;
    }

    public boolean isEmpty() {
        return count == 0;
    }

    public synchronized Enumeration keys() {
        return new HashtableEnumerator(table, true);
    }

    public synchronized Enumeration elements() {
        return new HashtableEnumerator(table, false);
    }

    public synchronized boolean contains(Object value) {
        if (value == null) {
            throw new NullPointerException();
        }
        for (int i = table.length; i-- > 0;) {
            for (Entry e = table[i]; e != null; e = e.next) {
                if (e.value.equals(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    public synchronized boolean containsKey(Object key) {
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index]; e != null; e = e.next) {
            if (e.hash == hash && e.key.equals(key)) {
                return true;
            }
        }
        return false;
    }

    public synchronized Object get(Object key) {
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index]; e != null; e = e.next) {
            if (e.hash == hash && e.key.equals(key)) {
                return e.value;
            }
        }
        return null;
    }

    protected void rehash() {
        int oldCapacity = table.length;
        Entry[] oldMap = table;
        int newCapacity = oldCapacity * 2 + 1;
        Entry[] newMap = new Entry[newCapacity];
        threshold = (newCapacity * 3) / 4;
        table = newMap;
        for (int i = oldCapacity; i-- > 0;) {
            for (Entry old = oldMap[i]; old != null;) {
                Entry e = old;
                old = old.next;
                int index = (e.hash & 0x7FFFFFFF) % newCapacity;
                e.next = newMap[index];
                newMap[index] = e;
            }
        }
    }

    public synchronized Object put(Object key, Object value) {
        if (value == null) {
            throw new NullPointerException();
        }
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index]; e != null; e = e.next) {
            if (e.hash == hash && e.key.equals(key)) {
                Object old = e.value;
                e.value = value;
                return old;
            }
        }
        if (count >= threshold) {
            rehash();
            return put(key, value);
        }
        Entry e = new Entry();
        e.hash = hash;
        e.key = key;
        e.value = value;
        e.next = table[index];
        table[index] = e;
        count++;
        return null;
    }

    public synchronized Object remove(Object key) {
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index], prev = null; e != null; prev = e, e = e.next) {
            if (e.hash == hash && e.key.equals(key)) {
                if (prev != null) {
                    prev.next = e.next;
                } else {
                    table[index] = e.next;
                }
                count--;
                return e.value;
            }
        }
        return null;
    }

    public synchronized void clear() {
        for (int index = table.length; --index >= 0;) {
            table[index] = null;
        }
        count = 0;
    }

    public synchronized String toString() {
        StringBuffer buf = new StringBuffer();
        Enumeration k = keys();
        Enumeration e = elements();
        buf.append('{');
        for (int i = 0; i < count; i++) {
            if (i > 0) {
                buf.append(", ");
            }
            buf.append(String.valueOf(k.nextElement())).append('=').append(String.valueOf(e.nextElement()));
        }
        buf.append('}');
        return buf.toString();
    }

    static final class Entry {
        int hash;
        Object key;
        Object value;
        Entry next;
    }

    static final class HashtableEnumerator implements Enumeration {
        private final boolean keys;
        private int index;
        private final Entry[] table;
        private Entry entry;

        HashtableEnumerator(Entry[] table, boolean keys) {
            this.table = table;
            this.keys = keys;
            this.index = table.length;
        }

        public boolean hasMoreElements() {
            if (entry != null) {
                return true;
            }
            while (index-- > 0) {
                if ((entry = table[index]) != null) {
                    return true;
                }
            }
            return false;
        }

        public Object nextElement() {
            if (entry == null) {
                while ((index-- > 0) && ((entry = table[index]) == null)) {
                }
            }
            if (entry != null) {
                Entry e = entry;
                entry = e.next;
                return keys ? e.key : e.value;
            }
            throw new NoSuchElementException("HashtableEnumerator");
        }
    }
}
