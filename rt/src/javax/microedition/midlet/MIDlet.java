package javax.microedition.midlet;

import jargame.Host;

public abstract class MIDlet {
    protected MIDlet() {
    }

    protected abstract void startApp() throws MIDletStateChangeException;

    protected abstract void pauseApp();

    protected abstract void destroyApp(boolean unconditional) throws MIDletStateChangeException;

    public final void notifyDestroyed() {
        Host.notifyDestroyed();
    }

    public final void notifyPaused() {
    }

    public final void resumeRequest() {
    }

    public final String getAppProperty(String key) {
        return Host.getAppProperty(key);
    }

    public final boolean platformRequest(String url) throws javax.microedition.io.ConnectionNotFoundException {
        Host.platformRequest(url);
        return false;
    }

    public final int checkPermission(String permission) {
        return 1;
    }

    /** Lifecycle bridges for the host event loop (protected methods are not reachable from other packages). */
    public static void $startApp(MIDlet m) throws MIDletStateChangeException {
        m.startApp();
    }

    public static void $pauseApp(MIDlet m) {
        m.pauseApp();
    }

    public static void $destroyApp(MIDlet m) throws MIDletStateChangeException {
        m.destroyApp(true);
    }
}
