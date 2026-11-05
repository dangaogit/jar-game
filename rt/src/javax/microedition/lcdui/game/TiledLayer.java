package javax.microedition.lcdui.game;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public class TiledLayer extends Layer {
    private final int columns;
    private final int rows;
    private final int[][] cells;
    private Image image;
    private int cellWidth;
    private int cellHeight;
    private int tilesPerRow;
    private int tileCount;
    private int[] animatedTiles = new int[4];
    private int animatedCount;

    public TiledLayer(int columns, int rows, Image image, int tileWidth, int tileHeight) {
        super(columns * tileWidth, rows * tileHeight);
        if (columns < 1 || rows < 1) {
            throw new IllegalArgumentException();
        }
        this.columns = columns;
        this.rows = rows;
        this.cells = new int[rows][columns];
        setTiles(image, tileWidth, tileHeight);
    }

    private void setTiles(Image img, int tw, int th) {
        if (img == null) {
            throw new NullPointerException();
        }
        if (tw < 1 || th < 1 || img.getWidth() % tw != 0 || img.getHeight() % th != 0) {
            throw new IllegalArgumentException("bad tile size");
        }
        image = img;
        cellWidth = tw;
        cellHeight = th;
        tilesPerRow = img.getWidth() / tw;
        tileCount = tilesPerRow * (img.getHeight() / th);
    }

    public int createAnimatedTile(int staticTileIndex) {
        if (staticTileIndex < 0 || staticTileIndex > tileCount) {
            throw new IndexOutOfBoundsException();
        }
        if (animatedCount == animatedTiles.length) {
            int[] n = new int[animatedTiles.length * 2];
            System.arraycopy(animatedTiles, 0, n, 0, animatedCount);
            animatedTiles = n;
        }
        animatedTiles[animatedCount++] = staticTileIndex;
        return -animatedCount;
    }

    public void setAnimatedTile(int animatedTileIndex, int staticTileIndex) {
        int i = -animatedTileIndex - 1;
        if (i < 0 || i >= animatedCount) {
            throw new IndexOutOfBoundsException();
        }
        if (staticTileIndex < 0 || staticTileIndex > tileCount) {
            throw new IndexOutOfBoundsException();
        }
        animatedTiles[i] = staticTileIndex;
    }

    public int getAnimatedTile(int animatedTileIndex) {
        int i = -animatedTileIndex - 1;
        if (i < 0 || i >= animatedCount) {
            throw new IndexOutOfBoundsException();
        }
        return animatedTiles[i];
    }

    public void setCell(int col, int row, int tileIndex) {
        if (col < 0 || col >= columns || row < 0 || row >= rows) {
            throw new IndexOutOfBoundsException();
        }
        if (tileIndex > tileCount || -tileIndex > animatedCount) {
            throw new IndexOutOfBoundsException();
        }
        cells[row][col] = tileIndex;
    }

    public int getCell(int col, int row) {
        if (col < 0 || col >= columns || row < 0 || row >= rows) {
            throw new IndexOutOfBoundsException();
        }
        return cells[row][col];
    }

    public void fillCells(int col, int row, int numCols, int numRows, int tileIndex) {
        if (numCols < 0 || numRows < 0) {
            throw new IllegalArgumentException();
        }
        if (col < 0 || row < 0 || col + numCols > columns || row + numRows > rows) {
            throw new IndexOutOfBoundsException();
        }
        if (tileIndex > tileCount || -tileIndex > animatedCount) {
            throw new IndexOutOfBoundsException();
        }
        for (int r = row; r < row + numRows; r++) {
            for (int c = col; c < col + numCols; c++) {
                cells[r][c] = tileIndex;
            }
        }
    }

    public final int getCellWidth() {
        return cellWidth;
    }

    public final int getCellHeight() {
        return cellHeight;
    }

    public final int getColumns() {
        return columns;
    }

    public final int getRows() {
        return rows;
    }

    public void setStaticTileSet(Image image, int tileWidth, int tileHeight) {
        int oldCount = tileCount;
        setTiles(image, tileWidth, tileHeight);
        setWidthImpl(columns * tileWidth);
        setHeightImpl(rows * tileHeight);
        if (tileCount < oldCount) {
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < columns; c++) {
                    cells[r][c] = 0;
                }
            }
            animatedCount = 0;
        }
    }

    private int resolve(int tile) {
        return tile < 0 ? animatedTiles[-tile - 1] : tile;
    }

    /** ARGB pixels of a tile (cellWidth x cellHeight) */
    int[] tilePixels(int tile) {
        int t = resolve(tile) - 1;
        int[] px = new int[cellWidth * cellHeight];
        if (t >= 0) {
            image.getRGB(px, 0, cellWidth, (t % tilesPerRow) * cellWidth, (t / tilesPerRow) * cellHeight, cellWidth,
                    cellHeight);
        }
        return px;
    }

    public final void paint(Graphics g) {
        if (g == null) {
            throw new NullPointerException();
        }
        if (!visible) {
            return;
        }
        int clipX = g.getClipX() - x;
        int clipY = g.getClipY() - y;
        int c0 = Math.max(0, clipX / cellWidth);
        int r0 = Math.max(0, clipY / cellHeight);
        int c1 = Math.min(columns - 1, (clipX + g.getClipWidth() - 1) / cellWidth);
        int r1 = Math.min(rows - 1, (clipY + g.getClipHeight() - 1) / cellHeight);
        for (int r = r0; r <= r1; r++) {
            int[] line = cells[r];
            int py = y + r * cellHeight;
            for (int c = c0; c <= c1; c++) {
                int t = line[c];
                if (t == 0) {
                    continue;
                }
                t = resolve(t) - 1;
                if (t < 0) {
                    continue;
                }
                g.drawRegion(image, (t % tilesPerRow) * cellWidth, (t / tilesPerRow) * cellHeight, cellWidth,
                        cellHeight, Sprite.TRANS_NONE, x + c * cellWidth, py, Graphics.TOP | Graphics.LEFT);
            }
        }
    }
}
