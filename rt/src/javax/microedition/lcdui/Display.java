package javax.microedition.lcdui;

import jargame.Host;
import java.util.Vector;
import javax.microedition.midlet.MIDlet;

public class Display {
    public static final int LIST_ELEMENT = 1;
    public static final int CHOICE_GROUP_ELEMENT = 2;
    public static final int ALERT = 3;
    public static final int COLOR_BACKGROUND = 0;
    public static final int COLOR_FOREGROUND = 1;
    public static final int COLOR_HIGHLIGHTED_BACKGROUND = 2;
    public static final int COLOR_HIGHLIGHTED_FOREGROUND = 3;
    public static final int COLOR_BORDER = 4;
    public static final int COLOR_HIGHLIGHTED_BORDER = 5;

    static Display instance;
    static Thread eventThread;
    static MIDlet midlet;
    static final Object paintLock = new Object();
    static final Vector serialQueue = new Vector();

    private Displayable current;

    private Display() {
    }

    public static Display getDisplay(MIDlet m) {
        if (instance == null) {
            instance = new Display();
        }
        return instance;
    }

    public Displayable getCurrent() {
        return current;
    }

    public void setCurrent(Displayable next) {
        if (next == null) {
            return;
        }
        Displayable old = current;
        if (old == next) {
            if (next instanceof Canvas) {
                Host.requestRepaint();
            }
            return;
        }
        current = next;
        // the notifications run later on the event thread, as on devices
        synchronized (serialQueue) {
            serialQueue.addElement(new Transition(old, next));
        }
        Host.requestSerial();
        if (next instanceof Canvas) {
            Host.showCanvas();
            Host.requestRepaint();
        } else if (next instanceof Screen) {
            ((Screen) next).$showOnHost();
        }
    }

    public void setCurrent(Alert alert, Displayable next) {
        alert.next = next;
        setCurrent(alert);
    }

    public void setCurrentItem(Item item) {
    }

    public void callSerially(Runnable r) {
        synchronized (serialQueue) {
            serialQueue.addElement(r);
        }
        Host.requestSerial();
    }

    public boolean flashBacklight(int duration) {
        return true;
    }

    public boolean vibrate(int duration) {
        return true;
    }

    public boolean isColor() {
        return true;
    }

    public int numColors() {
        return 1 << 24;
    }

    public int numAlphaLevels() {
        return 256;
    }

    public int getColor(int colorSpecifier) {
        return colorSpecifier == COLOR_BACKGROUND || colorSpecifier == COLOR_HIGHLIGHTED_FOREGROUND ? 0xFFFFFF : 0;
    }

    public int getBorderStyle(boolean highlighted) {
        return highlighted ? Graphics.DOTTED : Graphics.SOLID;
    }

    public int getBestImageWidth(int imageType) {
        return 0;
    }

    public int getBestImageHeight(int imageType) {
        return 0;
    }

    // ---------------------------------------------------------------- host side

    private static final class Transition implements Runnable {
        private final Displayable from;
        private final Displayable to;

        Transition(Displayable from, Displayable to) {
            this.from = from;
            this.to = to;
        }

        public void run() {
            if (from != null) {
                from.$hidden();
            }
            if ($isCurrent(to)) {
                to.$shown();
            }
        }
    }

    static boolean $isCurrent(Displayable d) {
        return instance != null && instance.current == d;
    }

    static void $repaint(Displayable d) {
        if ($isCurrent(d)) {
            Host.requestRepaint();
        }
    }

    static void $serviceRepaints(Displayable d) {
        if (!$isCurrent(d)) {
            return;
        }
        // paint on the calling thread (as KEmulator/FreeJ2ME do): waiting for the event thread deadlocks games
        // that block it in startApp() or callSerially() loops
        if (Host.takeRepaint()) {
            instance.paintNow();
        } else {
            synchronized (paintLock) {
                // waits for a paint in progress on another thread
            }
        }
    }

    /** GameCanvas.flushGraphics: copies the off-screen buffer to the display without calling paint() */
    static void $flush(Displayable d, Image buffer, int x, int y, int width, int height) {
        if (!$isCurrent(d)) {
            return;
        }
        synchronized (paintLock) {
            Graphics g = Graphics.$forScreen();
            g.setClip(x, y, width, height);
            g.drawImage(buffer, 0, 0, Graphics.TOP | Graphics.LEFT);
            Host.present();
        }
    }

    private void paintNow() {
        synchronized (paintLock) {
            Displayable d = current;
            if (d instanceof Canvas) {
                Graphics g = Graphics.$forScreen();
                try {
                    ((Canvas) d).paint(g);
                } catch (Throwable t) {
                    t.printStackTrace();
                }
            }
            Host.present();
        }
    }

    public static void $run(MIDlet m) {
        midlet = m;
        eventThread = Thread.currentThread();
        getDisplay(m);
        try {
            MIDlet.$startApp(m);
        } catch (Throwable t) {
            t.printStackTrace();
        }
        while (true) {
            int[] ev = Host.waitEvent();
            try {
                dispatch(ev);
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }
    }

    private static void dispatch(int[] ev) throws Exception {
        Display d = instance;
        Displayable cur = d.current;
        switch (ev[0]) {
            case Host.EV_KEY_PRESSED:
            case Host.EV_KEY_RELEASED:
            case Host.EV_KEY_REPEATED:
                if (cur instanceof Canvas) {
                    ((Canvas) cur).$key(ev[0], ev[1]);
                }
                break;
            case Host.EV_POINTER_PRESSED:
            case Host.EV_POINTER_RELEASED:
            case Host.EV_POINTER_DRAGGED:
                if (cur instanceof Canvas) {
                    ((Canvas) cur).$pointer(ev[0], ev[1], ev[2]);
                }
                break;
            case Host.EV_COMMAND:
                if (cur != null) {
                    cur.$command(ev[1], ev[2]);
                }
                break;
            case Host.EV_REPAINT:
                d.paintNow();
                break;
            case Host.EV_SERIAL: {
                Object[] tasks;
                synchronized (serialQueue) {
                    tasks = new Object[serialQueue.size()];
                    serialQueue.copyInto(tasks);
                    serialQueue.removeAllElements();
                }
                for (int i = 0; i < tasks.length; i++) {
                    ((Runnable) tasks[i]).run();
                }
                break;
            }
            case Host.EV_PAUSE:
                if (cur != null) {
                    cur.$hidden();
                }
                MIDlet.$pauseApp(midlet);
                break;
            case Host.EV_RESUME:
                MIDlet.$startApp(midlet);
                if (cur != null) {
                    cur.$shown();
                }
                Host.requestRepaint();
                break;
            default:
                break;
        }
    }
}
