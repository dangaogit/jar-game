package javax.microedition.lcdui;

import jargame.Host;
import java.util.Vector;

public abstract class Displayable {
    Vector commands = new Vector();
    CommandListener listener;
    String title;
    Ticker ticker;

    Displayable() {
    }

    public void addCommand(Command cmd) {
        if (cmd == null) {
            throw new NullPointerException();
        }
        if (!commands.contains(cmd)) {
            commands.addElement(cmd);
            $changed();
        }
    }

    public void removeCommand(Command cmd) {
        if (commands.removeElement(cmd)) {
            $changed();
        }
    }

    public void setCommandListener(CommandListener l) {
        listener = l;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String s) {
        title = s;
        $changed();
    }

    public Ticker getTicker() {
        return ticker;
    }

    public void setTicker(Ticker t) {
        ticker = t;
    }

    public boolean isShown() {
        return Display.$isCurrent(this);
    }

    public int getWidth() {
        return Host.screenWidth();
    }

    public int getHeight() {
        return Host.screenHeight();
    }

    protected void sizeChanged(int w, int h) {
    }

    void $shown() {
    }

    void $hidden() {
    }

    void $changed() {
        if (this instanceof Screen && isShown()) {
            ((Screen) this).$showOnHost();
        }
    }

    String[] $commandLabels() {
        String[] labels = new String[commands.size()];
        for (int i = 0; i < labels.length; i++) {
            labels[i] = ((Command) commands.elementAt(i)).getLabel();
        }
        return labels;
    }

    void $fireCommand(int index) {
        if (listener != null && index >= 0 && index < commands.size()) {
            listener.commandAction((Command) commands.elementAt(index), this);
        }
    }

    void $command(int index, int arg) {
        $fireCommand(index);
    }
}
