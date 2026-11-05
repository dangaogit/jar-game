package javax.microedition.rms;

import java.util.Hashtable;
import java.util.Vector;

public class RecordStore {
    public static final int AUTHMODE_PRIVATE = 0;
    public static final int AUTHMODE_ANY = 1;

    private static final Hashtable openStores = new Hashtable();

    private final String name;
    private int openCount;
    private final Vector listeners = new Vector();

    private RecordStore(String name) {
        this.name = name;
    }

    public static RecordStore openRecordStore(String recordStoreName, boolean createIfNecessary)
            throws RecordStoreException, RecordStoreFullException, RecordStoreNotFoundException {
        if (recordStoreName == null || recordStoreName.length() == 0 || recordStoreName.length() > 32) {
            throw new IllegalArgumentException();
        }
        synchronized (openStores) {
            RecordStore rs = (RecordStore) openStores.get(recordStoreName);
            if (rs == null) {
                if (!open0(recordStoreName, createIfNecessary)) {
                    throw new RecordStoreNotFoundException(recordStoreName);
                }
                rs = new RecordStore(recordStoreName);
                openStores.put(recordStoreName, rs);
            }
            rs.openCount++;
            return rs;
        }
    }

    public static RecordStore openRecordStore(String recordStoreName, boolean createIfNecessary, int authmode,
            boolean writable) throws RecordStoreException {
        return openRecordStore(recordStoreName, createIfNecessary);
    }

    public static RecordStore openRecordStore(String recordStoreName, String vendorName, String suiteName)
            throws RecordStoreException {
        return openRecordStore(recordStoreName, false);
    }

    public static void deleteRecordStore(String recordStoreName)
            throws RecordStoreException, RecordStoreNotFoundException {
        synchronized (openStores) {
            if (openStores.containsKey(recordStoreName)) {
                throw new RecordStoreException("record store is open");
            }
            if (!delete0(recordStoreName)) {
                throw new RecordStoreNotFoundException(recordStoreName);
            }
        }
    }

    public static native String[] listRecordStores();

    public void closeRecordStore() throws RecordStoreNotOpenException, RecordStoreException {
        synchronized (openStores) {
            checkOpen();
            if (--openCount == 0) {
                openStores.remove(name);
                listeners.removeAllElements();
            }
        }
    }

    private void checkOpen() throws RecordStoreNotOpenException {
        if (openCount <= 0) {
            throw new RecordStoreNotOpenException(name);
        }
    }

    public void setMode(int authmode, boolean writable) {
    }

    public String getName() throws RecordStoreNotOpenException {
        checkOpen();
        return name;
    }

    public int getVersion() throws RecordStoreNotOpenException {
        checkOpen();
        return version0(name);
    }

    public int getNumRecords() throws RecordStoreNotOpenException {
        checkOpen();
        return ids0(name).length;
    }

    public int getSize() throws RecordStoreNotOpenException {
        checkOpen();
        return size0(name);
    }

    public int getSizeAvailable() throws RecordStoreNotOpenException {
        checkOpen();
        return 1024 * 1024;
    }

    public long getLastModified() throws RecordStoreNotOpenException {
        checkOpen();
        return lastModified0(name);
    }

    public void addRecordListener(RecordListener listener) {
        if (!listeners.contains(listener)) {
            listeners.addElement(listener);
        }
    }

    public void removeRecordListener(RecordListener listener) {
        listeners.removeElement(listener);
    }

    public int getNextRecordID() throws RecordStoreNotOpenException, RecordStoreException {
        checkOpen();
        return nextId0(name);
    }

    public int addRecord(byte[] data, int offset, int numBytes)
            throws RecordStoreNotOpenException, RecordStoreException, RecordStoreFullException {
        checkOpen();
        if (data == null && numBytes > 0) {
            throw new NullPointerException();
        }
        int id = add0(name, data, offset, numBytes);
        for (int i = 0; i < listeners.size(); i++) {
            ((RecordListener) listeners.elementAt(i)).recordAdded(this, id);
        }
        return id;
    }

    public void deleteRecord(int recordId)
            throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        if (!deleteRecord0(name, recordId)) {
            throw new InvalidRecordIDException(String.valueOf(recordId));
        }
        for (int i = 0; i < listeners.size(); i++) {
            ((RecordListener) listeners.elementAt(i)).recordDeleted(this, recordId);
        }
    }

    public int getRecordSize(int recordId)
            throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        byte[] data = get0(name, recordId);
        if (data == null) {
            throw new InvalidRecordIDException(String.valueOf(recordId));
        }
        return data.length;
    }

    public int getRecord(int recordId, byte[] buffer, int offset)
            throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        byte[] data = get0(name, recordId);
        if (data == null) {
            throw new InvalidRecordIDException(String.valueOf(recordId));
        }
        System.arraycopy(data, 0, buffer, offset, data.length);
        return data.length;
    }

    public byte[] getRecord(int recordId)
            throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        byte[] data = get0(name, recordId);
        if (data == null) {
            throw new InvalidRecordIDException(String.valueOf(recordId));
        }
        return data.length == 0 ? null : data;
    }

    public void setRecord(int recordId, byte[] newData, int offset, int numBytes)
            throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException,
            RecordStoreFullException {
        checkOpen();
        if (!set0(name, recordId, newData, offset, numBytes)) {
            throw new InvalidRecordIDException(String.valueOf(recordId));
        }
        for (int i = 0; i < listeners.size(); i++) {
            ((RecordListener) listeners.elementAt(i)).recordChanged(this, recordId);
        }
    }

    public RecordEnumeration enumerateRecords(RecordFilter filter, RecordComparator comparator,
            boolean keepUpdated) throws RecordStoreNotOpenException {
        checkOpen();
        return new RecordEnumerationImpl(this, filter, comparator);
    }

    int[] $ids() {
        return ids0(name);
    }

    byte[] $get(int id) {
        return get0(name, id);
    }

    private static native boolean open0(String name, boolean create);

    private static native boolean delete0(String name);

    private static native int version0(String name);

    private static native int size0(String name);

    private static native long lastModified0(String name);

    private static native int nextId0(String name);

    private static native int[] ids0(String name);

    private static native int add0(String name, byte[] data, int offset, int numBytes);

    private static native boolean deleteRecord0(String name, int id);

    private static native byte[] get0(String name, int id);

    private static native boolean set0(String name, int id, byte[] data, int offset, int numBytes);
}
