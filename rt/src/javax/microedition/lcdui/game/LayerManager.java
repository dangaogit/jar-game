package javax.microedition.lcdui.game;

import java.util.Vector;
import javax.microedition.lcdui.Graphics;

public class LayerManager {
    private final Vector layers = new Vector();
    private int viewX;
    private int viewY;
    private int viewWidth = Integer.MAX_VALUE;
    private int viewHeight = Integer.MAX_VALUE;

    public LayerManager() {
    }

    public void append(Layer l) {
        if (l == null) {
            throw new NullPointerException();
        }
        layers.removeElement(l);
        layers.addElement(l);
    }

    public void insert(Layer l, int index) {
        if (l == null) {
            throw new NullPointerException();
        }
        layers.removeElement(l);
        if (index < 0 || index > layers.size()) {
            throw new IndexOutOfBoundsException();
        }
        layers.insertElementAt(l, index);
    }

    public Layer getLayerAt(int index) {
        return (Layer) layers.elementAt(index);
    }

    public int getSize() {
        return layers.size();
    }

    public void remove(Layer l) {
        if (l == null) {
            throw new NullPointerException();
        }
        layers.removeElement(l);
    }

    public void paint(Graphics g, int x, int y) {
        if (g == null) {
            throw new NullPointerException();
        }
        int cx = g.getClipX();
        int cy = g.getClipY();
        int cw = g.getClipWidth();
        int ch = g.getClipHeight();
        int tx = g.getTranslateX();
        int ty = g.getTranslateY();
        g.clipRect(x, y, viewWidth, viewHeight);
        g.translate(x - viewX, y - viewY);
        for (int i = layers.size() - 1; i >= 0; i--) {
            Layer l = (Layer) layers.elementAt(i);
            if (l.visible) {
                l.paint(g);
            }
        }
        g.translate(tx - g.getTranslateX(), ty - g.getTranslateY());
        g.setClip(cx, cy, cw, ch);
    }

    public void setViewWindow(int x, int y, int width, int height) {
        if (width < 0 || height < 0) {
            throw new IllegalArgumentException();
        }
        viewX = x;
        viewY = y;
        viewWidth = width;
        viewHeight = height;
    }
}
