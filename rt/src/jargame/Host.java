package jargame;

/** Bridge between the Java side of the platform and the TypeScript host. */
public final class Host {
    public static final int EV_KEY_PRESSED = 1;
    public static final int EV_KEY_RELEASED = 2;
    public static final int EV_KEY_REPEATED = 3;
    public static final int EV_POINTER_PRESSED = 4;
    public static final int EV_POINTER_RELEASED = 5;
    public static final int EV_POINTER_DRAGGED = 6;
    public static final int EV_COMMAND = 7;
    public static final int EV_REPAINT = 8;
    public static final int EV_SERIAL = 9;
    public static final int EV_PAUSE = 10;
    public static final int EV_RESUME = 11;

    public static final int SCREEN_FORM = 1;
    public static final int SCREEN_LIST = 2;
    public static final int SCREEN_ALERT = 3;
    public static final int SCREEN_TEXTBOX = 4;

    private Host() {
    }

    /** Blocks until the next UI event: {type, arg1, arg2}. */
    public static native int[] waitEvent();

    public static native void requestRepaint();

    /** true while a repaint is requested or being painted */
    public static native boolean repaintPending();

    /** consumes a pending repaint request (marks painting in progress) */
    public static native boolean takeRepaint();

    /** copies the back buffer to the visible screen and ends the paint */
    public static native void present();

    public static native void requestSerial();

    public static native int screenWidth();

    public static native int screenHeight();

    public static native void notifyDestroyed();

    public static native String getAppProperty(String key);

    public static native void platformRequest(String url);

    /** resource bytes from the application jar (absolute path, leading '/' optional) */
    public static native byte[] resource(String name);

    public static native void showCanvas();

    public static native void showScreen(int kind, String title, String[] texts, int[] types, String[] commands,
            int selected);

    /** current values of the editable fields of the visible screen */
    public static native String[] screenTexts();
}
