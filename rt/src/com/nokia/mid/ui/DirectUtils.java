package com.nokia.mid.ui;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public class DirectUtils {
    private DirectUtils() {
    }

    public static DirectGraphics getDirectGraphics(Graphics g) {
        if (g.$direct == null) {
            g.$direct = new DirectGraphicsImpl(g);
        }
        return (DirectGraphics) g.$direct;
    }

    public static Image createImage(byte[] imageData, int imageOffset, int imageLength) {
        return Image.createImage(imageData, imageOffset, imageLength);
    }

    public static Image createImage(int width, int height, int argb) {
        Image img = Image.createImage(width, height);
        img.$fill(argb);
        return img;
    }
}
