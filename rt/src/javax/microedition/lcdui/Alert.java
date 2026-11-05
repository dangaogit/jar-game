package javax.microedition.lcdui;

import jargame.Host;

public class Alert extends Screen {
    public static final int FOREVER = -2;
    public static final Command DISMISS_COMMAND = new Command("", Command.OK, 0);

    private String string;
    private Image image;
    private AlertType type;
    private int timeout = 2000;
    Displayable next;

    public Alert(String title) {
        this(title, null, null, null);
    }

    public Alert(String title, String alertText, Image alertImage, AlertType alertType) {
        this.title = title;
        this.string = alertText;
        this.image = alertImage;
        this.type = alertType;
    }

    public int getDefaultTimeout() {
        return 2000;
    }

    public int getTimeout() {
        return timeout;
    }

    public void setTimeout(int time) {
        timeout = time;
    }

    public AlertType getType() {
        return type;
    }

    public void setType(AlertType type) {
        this.type = type;
    }

    public String getString() {
        return string;
    }

    public void setString(String str) {
        string = str;
        $changed();
    }

    public Image getImage() {
        return image;
    }

    public void setImage(Image img) {
        image = img;
    }

    public void setIndicator(Gauge indicator) {
    }

    public Gauge getIndicator() {
        return null;
    }

    void $showOnHost() {
        Host.showScreen(Host.SCREEN_ALERT, title, new String[] {string == null ? "" : string}, new int[] {timeout},
                $commandLabels(), -1);
    }

    void $command(int index, int arg) {
        if (index >= 0 && listener != null) {
            $fireCommand(index);
            return;
        }
        if (next != null) {
            Display.instance.setCurrent(next);
        }
    }
}
