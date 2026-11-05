package javax.microedition.lcdui.game;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public class Sprite extends Layer {
    public static final int TRANS_NONE = 0;
    public static final int TRANS_ROT90 = 5;
    public static final int TRANS_ROT180 = 3;
    public static final int TRANS_ROT270 = 6;
    public static final int TRANS_MIRROR = 2;
    public static final int TRANS_MIRROR_ROT90 = 7;
    public static final int TRANS_MIRROR_ROT180 = 1;
    public static final int TRANS_MIRROR_ROT270 = 4;

    private Image image;
    private int frameWidth;
    private int frameHeight;
    private int rawFrameCount;
    private int framesPerRow;
    private int[] frameSequence;
    private int sequenceIndex;
    private boolean customSequence;
    private int refX;
    private int refY;
    private int transform;
    private int collX;
    private int collY;
    private int collW;
    private int collH;

    private Image pixelCache;
    private int pixelCacheFrame = -1;
    private int pixelCacheTransform = -1;

    public Sprite(Image image) {
        this(image, image.getWidth(), image.getHeight());
    }

    public Sprite(Image image, int frameWidth, int frameHeight) {
        super(frameWidth, frameHeight);
        initFrames(image, frameWidth, frameHeight, false);
        collX = 0;
        collY = 0;
        collW = frameWidth;
        collH = frameHeight;
    }

    public Sprite(Sprite s) {
        super(s.getWidth(), s.getHeight());
        image = s.image;
        frameWidth = s.frameWidth;
        frameHeight = s.frameHeight;
        rawFrameCount = s.rawFrameCount;
        framesPerRow = s.framesPerRow;
        frameSequence = new int[s.frameSequence.length];
        System.arraycopy(s.frameSequence, 0, frameSequence, 0, frameSequence.length);
        sequenceIndex = s.sequenceIndex;
        customSequence = s.customSequence;
        refX = s.refX;
        refY = s.refY;
        transform = s.transform;
        collX = s.collX;
        collY = s.collY;
        collW = s.collW;
        collH = s.collH;
        x = s.x;
        y = s.y;
        visible = s.visible;
    }

    private void initFrames(Image img, int fw, int fh, boolean keepSequence) {
        if (img == null) {
            throw new NullPointerException();
        }
        if (fw < 1 || fh < 1 || img.getWidth() % fw != 0 || img.getHeight() % fh != 0) {
            throw new IllegalArgumentException("bad frame size");
        }
        image = img;
        frameWidth = fw;
        frameHeight = fh;
        framesPerRow = img.getWidth() / fw;
        rawFrameCount = framesPerRow * (img.getHeight() / fh);
        if (!keepSequence || !customSequence) {
            frameSequence = new int[rawFrameCount];
            for (int i = 0; i < rawFrameCount; i++) {
                frameSequence[i] = i;
            }
            customSequence = false;
            if (sequenceIndex >= rawFrameCount) {
                sequenceIndex = 0;
            }
        }
        pixelCacheFrame = -1;
    }

    public void defineReferencePixel(int x, int y) {
        refX = x;
        refY = y;
    }

    public void setRefPixelPosition(int x, int y) {
        this.x = x - transformedX(refX, refY, transform);
        this.y = y - transformedY(refX, refY, transform);
    }

    public int getRefPixelX() {
        return x + transformedX(refX, refY, transform);
    }

    public int getRefPixelY() {
        return y + transformedY(refX, refY, transform);
    }

    public void setFrame(int sequenceIndex) {
        if (sequenceIndex < 0 || sequenceIndex >= frameSequence.length) {
            throw new IndexOutOfBoundsException();
        }
        this.sequenceIndex = sequenceIndex;
    }

    public final int getFrame() {
        return sequenceIndex;
    }

    public int getRawFrameCount() {
        return rawFrameCount;
    }

    public int getFrameSequenceLength() {
        return frameSequence.length;
    }

    public void nextFrame() {
        sequenceIndex = (sequenceIndex + 1) % frameSequence.length;
    }

    public void prevFrame() {
        sequenceIndex = sequenceIndex == 0 ? frameSequence.length - 1 : sequenceIndex - 1;
    }

    public final void paint(Graphics g) {
        if (g == null) {
            throw new NullPointerException();
        }
        if (!visible) {
            return;
        }
        int f = frameSequence[sequenceIndex];
        int fx = (f % framesPerRow) * frameWidth;
        int fy = (f / framesPerRow) * frameHeight;
        g.drawRegion(image, fx, fy, frameWidth, frameHeight, transform, x, y, Graphics.TOP | Graphics.LEFT);
    }

    public void setFrameSequence(int[] sequence) {
        if (sequence == null) {
            frameSequence = new int[rawFrameCount];
            for (int i = 0; i < rawFrameCount; i++) {
                frameSequence[i] = i;
            }
            customSequence = false;
        } else {
            if (sequence.length < 1) {
                throw new IllegalArgumentException();
            }
            for (int i = 0; i < sequence.length; i++) {
                if (sequence[i] < 0 || sequence[i] >= rawFrameCount) {
                    throw new ArrayIndexOutOfBoundsException();
                }
            }
            frameSequence = new int[sequence.length];
            System.arraycopy(sequence, 0, frameSequence, 0, sequence.length);
            customSequence = true;
        }
        sequenceIndex = 0;
    }

    public void setImage(Image img, int frameWidth, int frameHeight) {
        int oldRefX = getRefPixelX();
        int oldRefY = getRefPixelY();
        boolean sameSize = frameWidth == this.frameWidth && frameHeight == this.frameHeight;
        int oldCount = rawFrameCount;
        initFrames(img, frameWidth, frameHeight, true);
        if (customSequence && rawFrameCount < oldCount) {
            setFrameSequence(null);
        }
        if (!sameSize) {
            collX = 0;
            collY = 0;
            collW = frameWidth;
            collH = frameHeight;
            updateSize();
            setRefPixelPosition(oldRefX, oldRefY);
        }
    }

    public void defineCollisionRectangle(int x, int y, int width, int height) {
        if (width < 0 || height < 0) {
            throw new IllegalArgumentException();
        }
        collX = x;
        collY = y;
        collW = width;
        collH = height;
    }

    public void setTransform(int transform) {
        if (transform < 0 || transform > 7) {
            throw new IllegalArgumentException();
        }
        int oldRefX = getRefPixelX();
        int oldRefY = getRefPixelY();
        this.transform = transform;
        updateSize();
        setRefPixelPosition(oldRefX, oldRefY);
    }

    private void updateSize() {
        boolean swap = transform >= 4;
        setWidthImpl(swap ? frameHeight : frameWidth);
        setHeightImpl(swap ? frameWidth : frameHeight);
    }

    private int transformedX(int px, int py, int t) {
        switch (t) {
            case TRANS_MIRROR:
            case TRANS_ROT180:
                return frameWidth - px - 1;
            case TRANS_ROT90:
            case TRANS_MIRROR_ROT90:
                return frameHeight - py - 1;
            case TRANS_ROT270:
            case TRANS_MIRROR_ROT270:
                return py;
            default:
                return px;
        }
    }

    private int transformedY(int px, int py, int t) {
        switch (t) {
            case TRANS_ROT180:
            case TRANS_MIRROR_ROT180:
                return frameHeight - py - 1;
            case TRANS_ROT90:
            case TRANS_MIRROR_ROT270:
                return px;
            case TRANS_ROT270:
            case TRANS_MIRROR_ROT90:
                return frameWidth - px - 1;
            default:
                return py;
        }
    }

    /** collision rectangle in screen coordinates: {x, y, w, h} */
    int[] collisionRect() {
        int fw = frameWidth;
        int fh = frameHeight;
        int cx = collX;
        int cy = collY;
        int cw = collW;
        int ch = collH;
        int rx;
        int ry;
        int rw = cw;
        int rh = ch;
        switch (transform) {
            case TRANS_MIRROR:
                rx = fw - cx - cw;
                ry = cy;
                break;
            case TRANS_ROT180:
                rx = fw - cx - cw;
                ry = fh - cy - ch;
                break;
            case TRANS_MIRROR_ROT180:
                rx = cx;
                ry = fh - cy - ch;
                break;
            case TRANS_ROT90:
                rx = fh - cy - ch;
                ry = cx;
                rw = ch;
                rh = cw;
                break;
            case TRANS_ROT270:
                rx = cy;
                ry = fw - cx - cw;
                rw = ch;
                rh = cw;
                break;
            case TRANS_MIRROR_ROT90:
                rx = fh - cy - ch;
                ry = fw - cx - cw;
                rw = ch;
                rh = cw;
                break;
            case TRANS_MIRROR_ROT270:
                rx = cy;
                ry = cx;
                rw = ch;
                rh = cw;
                break;
            default:
                rx = cx;
                ry = cy;
                break;
        }
        return new int[] {x + rx, y + ry, rw, rh};
    }

    /** ARGB pixels of the current (transformed) frame, laid out width x height in screen orientation */
    private int[] framePixels() {
        int f = frameSequence[sequenceIndex];
        if (pixelCache == null || pixelCacheFrame != f || pixelCacheTransform != transform) {
            int fx = (f % framesPerRow) * frameWidth;
            int fy = (f / framesPerRow) * frameHeight;
            pixelCache = Image.createImage(image, fx, fy, frameWidth, frameHeight, transform);
            pixelCacheFrame = f;
            pixelCacheTransform = transform;
        }
        int w = pixelCache.getWidth();
        int h = pixelCache.getHeight();
        int[] px = new int[w * h];
        pixelCache.getRGB(px, 0, w, 0, 0, w, h);
        return px;
    }

    static boolean opaque(int argb) {
        return (argb >>> 24) != 0;
    }

    public final boolean collidesWith(Sprite s, boolean pixelLevel) {
        if (!visible || !s.visible) {
            return false;
        }
        int[] a = collisionRect();
        int[] b = s.collisionRect();
        int x0 = Math.max(a[0], b[0]);
        int y0 = Math.max(a[1], b[1]);
        int x1 = Math.min(a[0] + a[2], b[0] + b[2]);
        int y1 = Math.min(a[1] + a[3], b[1] + b[3]);
        if (x0 >= x1 || y0 >= y1) {
            return false;
        }
        if (!pixelLevel) {
            return true;
        }
        int[] pa = framePixels();
        int[] pb = s.framePixels();
        for (int yy = y0; yy < y1; yy++) {
            for (int xx = x0; xx < x1; xx++) {
                if (opaque(pa[(yy - y) * width + (xx - x)]) && opaque(pb[(yy - s.y) * s.width + (xx - s.x)])) {
                    return true;
                }
            }
        }
        return false;
    }

    public final boolean collidesWith(TiledLayer t, boolean pixelLevel) {
        if (!visible || !t.visible) {
            return false;
        }
        int[] a = collisionRect();
        int x0 = Math.max(a[0], t.x);
        int y0 = Math.max(a[1], t.y);
        int x1 = Math.min(a[0] + a[2], t.x + t.width);
        int y1 = Math.min(a[1] + a[3], t.y + t.height);
        if (x0 >= x1 || y0 >= y1) {
            return false;
        }
        int cw = t.getCellWidth();
        int ch = t.getCellHeight();
        int[] pa = pixelLevel ? framePixels() : null;
        for (int row = (y0 - t.y) / ch; row <= (y1 - 1 - t.y) / ch; row++) {
            for (int col = (x0 - t.x) / cw; col <= (x1 - 1 - t.x) / cw; col++) {
                if (t.getCell(col, row) == 0) {
                    continue;
                }
                if (!pixelLevel) {
                    return true;
                }
                int cx0 = Math.max(x0, t.x + col * cw);
                int cy0 = Math.max(y0, t.y + row * ch);
                int cx1 = Math.min(x1, t.x + (col + 1) * cw);
                int cy1 = Math.min(y1, t.y + (row + 1) * ch);
                int[] tp = t.tilePixels(t.getCell(col, row));
                for (int yy = cy0; yy < cy1; yy++) {
                    for (int xx = cx0; xx < cx1; xx++) {
                        int tx = xx - t.x - col * cw;
                        int ty = yy - t.y - row * ch;
                        if (opaque(pa[(yy - y) * width + (xx - x)]) && opaque(tp[ty * cw + tx])) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    public final boolean collidesWith(Image img, int ix, int iy, boolean pixelLevel) {
        if (!visible) {
            return false;
        }
        int[] a = collisionRect();
        int iw = img.getWidth();
        int ih = img.getHeight();
        int x0 = Math.max(a[0], ix);
        int y0 = Math.max(a[1], iy);
        int x1 = Math.min(a[0] + a[2], ix + iw);
        int y1 = Math.min(a[1] + a[3], iy + ih);
        if (x0 >= x1 || y0 >= y1) {
            return false;
        }
        if (!pixelLevel) {
            return true;
        }
        int[] pa = framePixels();
        int[] pi = new int[iw * ih];
        img.getRGB(pi, 0, iw, 0, 0, iw, ih);
        for (int yy = y0; yy < y1; yy++) {
            for (int xx = x0; xx < x1; xx++) {
                if (opaque(pa[(yy - y) * width + (xx - x)]) && opaque(pi[(yy - iy) * iw + (xx - ix)])) {
                    return true;
                }
            }
        }
        return false;
    }
}
