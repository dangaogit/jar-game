package javax.microedition.rms;

final class RecordEnumerationImpl implements RecordEnumeration {
    private final RecordStore store;
    private final RecordFilter filter;
    private final RecordComparator comparator;
    private int[] ids;
    private int index;

    RecordEnumerationImpl(RecordStore store, RecordFilter filter, RecordComparator comparator) {
        this.store = store;
        this.filter = filter;
        this.comparator = comparator;
        rebuild();
    }

    public void rebuild() {
        int[] all = store.$ids();
        int[] tmp = new int[all.length];
        int n = 0;
        for (int i = 0; i < all.length; i++) {
            if (filter == null || filter.matches(store.$get(all[i]))) {
                tmp[n++] = all[i];
            }
        }
        ids = new int[n];
        System.arraycopy(tmp, 0, ids, 0, n);
        if (comparator != null) {
            for (int i = 1; i < n; i++) {
                int key = ids[i];
                byte[] kd = store.$get(key);
                int j = i - 1;
                while (j >= 0 && comparator.compare(store.$get(ids[j]), kd) == RecordComparator.FOLLOWS) {
                    ids[j + 1] = ids[j];
                    j--;
                }
                ids[j + 1] = key;
            }
        }
        index = 0;
    }

    public int numRecords() {
        return ids.length;
    }

    public byte[] nextRecord() throws InvalidRecordIDException, RecordStoreNotOpenException, RecordStoreException {
        return store.getRecord(nextRecordId());
    }

    public int nextRecordId() throws InvalidRecordIDException {
        if (index >= ids.length) {
            throw new InvalidRecordIDException();
        }
        return ids[index++];
    }

    public byte[] previousRecord()
            throws InvalidRecordIDException, RecordStoreNotOpenException, RecordStoreException {
        return store.getRecord(previousRecordId());
    }

    public int previousRecordId() throws InvalidRecordIDException {
        if (index <= 0) {
            index = ids.length;
        }
        if (index <= 0) {
            throw new InvalidRecordIDException();
        }
        return ids[--index];
    }

    public boolean hasNextElement() {
        return index < ids.length;
    }

    public boolean hasPreviousElement() {
        return index > 0;
    }

    public void reset() {
        index = 0;
    }

    public void keepUpdated(boolean keepUpdated) {
    }

    public boolean isKeptUpdated() {
        return false;
    }

    public void destroy() {
    }
}
