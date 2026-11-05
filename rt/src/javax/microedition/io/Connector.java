package javax.microedition.io;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Networking and messaging are not available in the emulator. */
public class Connector {
    public static final int READ = 1;
    public static final int WRITE = 2;
    public static final int READ_WRITE = 3;

    private Connector() {
    }

    public static Connection open(String name) throws IOException {
        throw new ConnectionNotFoundException(name);
    }

    public static Connection open(String name, int mode) throws IOException {
        return open(name);
    }

    public static Connection open(String name, int mode, boolean timeouts) throws IOException {
        return open(name);
    }

    public static DataInputStream openDataInputStream(String name) throws IOException {
        throw new ConnectionNotFoundException(name);
    }

    public static DataOutputStream openDataOutputStream(String name) throws IOException {
        throw new ConnectionNotFoundException(name);
    }

    public static InputStream openInputStream(String name) throws IOException {
        throw new ConnectionNotFoundException(name);
    }

    public static OutputStream openOutputStream(String name) throws IOException {
        throw new ConnectionNotFoundException(name);
    }
}
