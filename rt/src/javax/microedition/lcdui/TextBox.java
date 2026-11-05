package javax.microedition.lcdui;

import jargame.Host;

public class TextBox extends Screen {
    private String text;
    private int maxSize;
    private int constraints;

    public TextBox(String title, String text, int maxSize, int constraints) {
        this.title = title;
        this.text = text == null ? "" : text;
        this.maxSize = maxSize;
        this.constraints = constraints;
    }

    public String getString() {
        return text;
    }

    public void setString(String text) {
        this.text = text == null ? "" : text;
        $changed();
    }

    public int getChars(char[] data) {
        text.getChars(0, text.length(), data, 0);
        return text.length();
    }

    public void setChars(char[] data, int offset, int length) {
        setString(data == null ? "" : new String(data, offset, length));
    }

    public void insert(String src, int position) {
        setString(text.substring(0, position) + src + text.substring(position));
    }

    public void delete(int offset, int length) {
        setString(text.substring(0, offset) + text.substring(offset + length));
    }

    public int getMaxSize() {
        return maxSize;
    }

    public int setMaxSize(int maxSize) {
        this.maxSize = maxSize;
        return maxSize;
    }

    public int size() {
        return text.length();
    }

    public int getCaretPosition() {
        return text.length();
    }

    public void setConstraints(int constraints) {
        this.constraints = constraints;
    }

    public int getConstraints() {
        return constraints;
    }

    public void setInitialInputMode(String characterSubset) {
    }

    void $showOnHost() {
        Host.showScreen(Host.SCREEN_TEXTBOX, title, new String[] {"", text}, new int[] {Item.KIND_INPUT},
                $commandLabels(), -1);
    }

    void $applyTexts(String[] texts) {
        if (texts.length > 0 && texts[0] != null) {
            text = texts[0];
        }
    }
}
