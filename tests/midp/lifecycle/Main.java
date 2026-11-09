import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;

public class Main extends MIDlet implements Runnable {
    private final Canvas canvas = new Canvas() {
        protected void paint(Graphics g) {
            g.setColor(0x336699);
            g.fillRect(0, 0, getWidth(), getHeight());
        }
    };
    private boolean running;
    protected void startApp() {
        System.out.println("start");
        Display.getDisplay(this).setCurrent(canvas);
        if (!running) {
            running = true;
            new Thread(this).start();
        }
    }
    protected void pauseApp() { System.out.println("pause"); }
    protected void destroyApp(boolean unconditional) {}
    public void run() {
        while (true) {
            canvas.repaint();
            try { Thread.sleep(20); } catch (Exception e) {}
        }
    }
}
