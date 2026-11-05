package javax.microedition.lcdui;

public class StringItem extends Item {
    private String text;
    private int appearanceMode;
    private Font font;

    public StringItem(String label, String text) {
        this(label, text, PLAIN);
    }

    public StringItem(String label, String text, int appearanceMode) {
        super(label);
        this.text = text;
        this.appearanceMode = appearanceMode;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
        $changed();
    }

    public int getAppearanceMode() {
        return appearanceMode;
    }

    public void setFont(Font font) {
        this.font = font;
    }

    public Font getFont() {
        return font == null ? Font.getDefaultFont() : font;
    }

    int $kind() {
        return KIND_TEXT;
    }

    String $text() {
        return text == null ? "" : text;
    }
}
