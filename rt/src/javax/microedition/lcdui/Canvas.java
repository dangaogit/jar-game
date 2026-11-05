package javax.microedition.lcdui;

import jargame.Host;

public abstract class Canvas extends Displayable {
    public static final int UP = 1;
    public static final int DOWN = 6;
    public static final int LEFT = 2;
    public static final int RIGHT = 5;
    public static final int FIRE = 8;
    public static final int GAME_A = 9;
    public static final int GAME_B = 10;
    public static final int GAME_C = 11;
    public static final int GAME_D = 12;
    public static final int KEY_NUM0 = 48;
    public static final int KEY_NUM1 = 49;
    public static final int KEY_NUM2 = 50;
    public static final int KEY_NUM3 = 51;
    public static final int KEY_NUM4 = 52;
    public static final int KEY_NUM5 = 53;
    public static final int KEY_NUM6 = 54;
    public static final int KEY_NUM7 = 55;
    public static final int KEY_NUM8 = 56;
    public static final int KEY_NUM9 = 57;
    public static final int KEY_STAR = 42;
    public static final int KEY_POUND = 35;

    private boolean fullScreen;

    protected Canvas() {
    }

    protected abstract void paint(Graphics g);

    public final void repaint() {
        Display.$repaint(this);
    }

    public final void repaint(int x, int y, int width, int height) {
        Display.$repaint(this);
    }

    public final void serviceRepaints() {
        Display.$serviceRepaints(this);
    }

    protected void keyPressed(int keyCode) {
    }

    protected void keyReleased(int keyCode) {
    }

    protected void keyRepeated(int keyCode) {
    }

    protected void pointerPressed(int x, int y) {
    }

    protected void pointerReleased(int x, int y) {
    }

    protected void pointerDragged(int x, int y) {
    }

    protected void showNotify() {
    }

    protected void hideNotify() {
    }

    public boolean hasPointerEvents() {
        return true;
    }

    public boolean hasPointerMotionEvents() {
        return true;
    }

    public boolean hasRepeatEvents() {
        return true;
    }

    public boolean isDoubleBuffered() {
        return true;
    }

    public native int getGameAction(int keyCode);

    public native int getKeyCode(int gameAction);

    public native String getKeyName(int keyCode);

    public void setFullScreenMode(boolean mode) {
        fullScreen = mode;
    }

    public int getWidth() {
        return Host.screenWidth();
    }

    public int getHeight() {
        return Host.screenHeight();
    }

    void $shown() {
        showNotify();
    }

    void $hidden() {
        hideNotify();
    }

    /** set by GameCanvas(true): game keys update the key state only */
    protected boolean $suppressGameKeys;
    private int keyStates;
    private int latchedKeyStates;

    /** GameCanvas.getKeyStates(): current state plus keys pressed since the last call */
    protected final int $takeKeyStates() {
        int s = keyStates | latchedKeyStates;
        latchedKeyStates = 0;
        return s;
    }

    protected final void $flushImage(Image buffer, int x, int y, int width, int height) {
        Display.$flush(this, buffer, x, y, width, height);
    }

    void $key(int type, int keyCode) {
        if (type == Host.EV_KEY_PRESSED && !fullScreen && listener != null && commands.size() > 0
                && (keyCode == -6 || keyCode == -7)) {
            int idx = keyCode == -6 || commands.size() == 1 ? 0 : 1;
            $fireCommand(idx);
            return;
        }
        int action = getGameAction(keyCode);
        if (action != 0) {
            int bit = 1 << action;
            if (type == Host.EV_KEY_PRESSED) {
                keyStates |= bit;
                latchedKeyStates |= bit;
            } else if (type == Host.EV_KEY_RELEASED) {
                keyStates &= ~bit;
            }
            if ($suppressGameKeys) {
                return;
            }
        }
        if (type == Host.EV_KEY_PRESSED) {
            keyPressed(keyCode);
        } else if (type == Host.EV_KEY_RELEASED) {
            keyReleased(keyCode);
        } else {
            keyRepeated(keyCode);
        }
    }

    void $pointer(int type, int x, int y) {
        if (type == Host.EV_POINTER_PRESSED) {
            pointerPressed(x, y);
        } else if (type == Host.EV_POINTER_RELEASED) {
            pointerReleased(x, y);
        } else {
            pointerDragged(x, y);
        }
    }
}
