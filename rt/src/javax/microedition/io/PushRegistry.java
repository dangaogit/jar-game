package javax.microedition.io;

import java.io.IOException;

public class PushRegistry {
    private PushRegistry() {
    }

    public static void registerConnection(String connection, String midlet, String filter)
            throws ClassNotFoundException, IOException {
        throw new ConnectionNotFoundException(connection);
    }

    public static boolean unregisterConnection(String connection) {
        return false;
    }

    public static String[] listConnections(boolean available) {
        return new String[0];
    }

    public static String getMIDlet(String connection) {
        return null;
    }

    public static String getFilter(String connection) {
        return null;
    }

    public static long registerAlarm(String midlet, long time) throws ClassNotFoundException {
        return 0;
    }
}
