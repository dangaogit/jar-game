package javax.microedition.lcdui;

import jargame.Host;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

public class Image {
    private Image() {
    }

    private native void initMutable(int width, int height);

    /** blocks the calling thread while the host decodes the image */
    private native void decode(byte[] data, int offset, int length);

    private native void initRGB(int[] rgb, int width, int height, boolean processAlpha);

    private native void initRegion(Image src, int x, int y, int width, int height, int transform);

    public static Image createImage(int width, int height) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException();
        }
        Image img = new Image();
        img.initMutable(width, height);
        return img;
    }

    public static Image createImage(String name) throws IOException {
        if (name == null) {
            throw new NullPointerException();
        }
        byte[] data = Host.resource(name);
        if (data == null) {
            throw new IOException(name);
        }
        Image img = new Image();
        try {
            img.decode(data, 0, data.length);
        } catch (IllegalArgumentException e) {
            throw new IOException(name);
        }
        return img;
    }

    public static Image createImage(byte[] data, int offset, int length) {
        if (offset < 0 || length < 0 || offset + length > data.length) {
            throw new ArrayIndexOutOfBoundsException();
        }
        Image img = new Image();
        img.decode(data, offset, length);
        return img;
    }

    public static Image createImage(Image source) {
        if (!source.isMutable()) {
            return source;
        }
        return createImage(source, 0, 0, source.getWidth(), source.getHeight(), 0);
    }

    public static Image createImage(Image image, int x, int y, int width, int height, int transform) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException();
        }
        Image img = new Image();
        img.initRegion(image, x, y, width, height, transform);
        return img;
    }

    public static Image createImage(InputStream stream) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int n;
        while ((n = stream.read(buf, 0, buf.length)) > 0) {
            bos.write(buf, 0, n);
        }
        byte[] data = bos.toByteArray();
        Image img = new Image();
        try {
            img.decode(data, 0, data.length);
        } catch (IllegalArgumentException e) {
            throw new IOException("bad image");
        }
        return img;
    }

    public static Image createRGBImage(int[] rgb, int width, int height, boolean processAlpha) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException();
        }
        if (rgb.length < width * height) {
            throw new ArrayIndexOutOfBoundsException();
        }
        Image img = new Image();
        img.initRGB(rgb, width, height, processAlpha);
        return img;
    }

    public Graphics getGraphics() {
        if (!isMutable()) {
            throw new IllegalStateException();
        }
        return Graphics.$forImage(this);
    }

    /** fills the whole image with an ARGB color, transparency included (Nokia DirectUtils.createImage) */
    public native void $fill(int argb);

    public native int getWidth();

    public native int getHeight();

    public native boolean isMutable();

    public native void getRGB(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height);
}
