package java.lang;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

public final class Class {
    private Class() {
    }

    public static native Class forName(String className) throws ClassNotFoundException;

    public native Object newInstance() throws InstantiationException, IllegalAccessException;

    public native boolean isInstance(Object obj);

    public native boolean isAssignableFrom(Class cls);

    public native boolean isInterface();

    public native boolean isArray();

    public native String getName();

    public String toString() {
        return (isInterface() ? "interface " : "class ") + getName();
    }

    public InputStream getResourceAsStream(String name) {
        byte[] data = getResourceBytes(name);
        return data == null ? null : new ByteArrayInputStream(data);
    }

    private native byte[] getResourceBytes(String name);
}
