package javax.microedition.lcdui;

public abstract class Item {
    public static final int LAYOUT_DEFAULT = 0;
    public static final int LAYOUT_LEFT = 1;
    public static final int LAYOUT_RIGHT = 2;
    public static final int LAYOUT_CENTER = 3;
    public static final int LAYOUT_TOP = 0x10;
    public static final int LAYOUT_BOTTOM = 0x20;
    public static final int LAYOUT_VCENTER = 0x30;
    public static final int LAYOUT_NEWLINE_BEFORE = 0x100;
    public static final int LAYOUT_NEWLINE_AFTER = 0x200;
    public static final int LAYOUT_SHRINK = 0x400;
    public static final int LAYOUT_EXPAND = 0x800;
    public static final int LAYOUT_VSHRINK = 0x1000;
    public static final int LAYOUT_VEXPAND = 0x2000;
    public static final int LAYOUT_2 = 0x4000;
    public static final int PLAIN = 0;
    public static final int HYPERLINK = 1;
    public static final int BUTTON = 2;

    /** host overlay item kinds */
    static final int KIND_TEXT = 0;
    static final int KIND_INPUT = 1;
    static final int KIND_OTHER = 2;
    static final int KIND_CHOICE = 3;

    String label;
    int layout;
    Screen owner;

    Item(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
        $changed();
    }

    public int getLayout() {
        return layout;
    }

    public void setLayout(int layout) {
        this.layout = layout;
    }

    public void addCommand(Command cmd) {
    }

    public void removeCommand(Command cmd) {
    }

    public void setDefaultCommand(Command cmd) {
    }

    public void setItemCommandListener(ItemCommandListener l) {
    }

    public void setPreferredSize(int width, int height) {
    }

    public int getPreferredWidth() {
        return 0;
    }

    public int getPreferredHeight() {
        return 0;
    }

    public int getMinimumWidth() {
        return 0;
    }

    public int getMinimumHeight() {
        return 0;
    }

    public void notifyStateChanged() {
    }

    int $kind() {
        return KIND_OTHER;
    }

    String $text() {
        return "";
    }

    void $setText(String s) {
    }

    void $changed() {
        if (owner != null) {
            owner.$changed();
        }
    }
}
