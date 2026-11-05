package javax.microedition.lcdui;

import jargame.Host;
import java.util.Vector;

public class List extends Screen implements Choice {
    public static final Command SELECT_COMMAND = new Command("", Command.SCREEN, 0);

    private final int listType;
    private final Vector strings = new Vector();
    private final Vector images = new Vector();
    private int selected = -1;
    private Command selectCommand = SELECT_COMMAND;

    public List(String title, int listType) {
        this.title = title;
        this.listType = listType;
    }

    public List(String title, int listType, String[] stringElements, Image[] imageElements) {
        this(title, listType);
        for (int i = 0; i < stringElements.length; i++) {
            append(stringElements[i], imageElements == null ? null : imageElements[i]);
        }
    }

    public int size() {
        return strings.size();
    }

    public String getString(int elementNum) {
        return (String) strings.elementAt(elementNum);
    }

    public Image getImage(int elementNum) {
        return (Image) images.elementAt(elementNum);
    }

    public int append(String stringPart, Image imagePart) {
        strings.addElement(stringPart);
        images.addElement(imagePart);
        if (selected < 0) {
            selected = 0;
        }
        $changed();
        return strings.size() - 1;
    }

    public void insert(int elementNum, String stringPart, Image imagePart) {
        strings.insertElementAt(stringPart, elementNum);
        images.insertElementAt(imagePart, elementNum);
        if (selected < 0) {
            selected = 0;
        }
        $changed();
    }

    public void delete(int elementNum) {
        strings.removeElementAt(elementNum);
        images.removeElementAt(elementNum);
        if (selected >= strings.size()) {
            selected = strings.size() - 1;
        }
        $changed();
    }

    public void deleteAll() {
        strings.removeAllElements();
        images.removeAllElements();
        selected = -1;
        $changed();
    }

    public void set(int elementNum, String stringPart, Image imagePart) {
        strings.setElementAt(stringPart, elementNum);
        images.setElementAt(imagePart, elementNum);
        $changed();
    }

    public boolean isSelected(int elementNum) {
        return elementNum == selected;
    }

    public int getSelectedIndex() {
        return selected;
    }

    public int getSelectedFlags(boolean[] selectedArray) {
        for (int i = 0; i < selectedArray.length; i++) {
            selectedArray[i] = i == selected;
        }
        return selected >= 0 ? 1 : 0;
    }

    public void setSelectedIndex(int elementNum, boolean sel) {
        if (sel) {
            selected = elementNum;
            $changed();
        }
    }

    public void setSelectedFlags(boolean[] selectedArray) {
        for (int i = 0; i < selectedArray.length; i++) {
            if (selectedArray[i]) {
                selected = i;
                break;
            }
        }
    }

    public void setSelectCommand(Command command) {
        selectCommand = command;
    }

    public void setFitPolicy(int fitPolicy) {
    }

    public int getFitPolicy() {
        return TEXT_WRAP_DEFAULT;
    }

    public void setFont(int elementNum, Font font) {
    }

    public Font getFont(int elementNum) {
        return Font.getDefaultFont();
    }

    void $showOnHost() {
        String[] texts = new String[strings.size()];
        strings.copyInto(texts);
        Host.showScreen(Host.SCREEN_LIST, title, texts, new int[texts.length], $commandLabels(), selected);
    }

    void $command(int index, int arg) {
        if (arg >= 0 && arg < strings.size()) {
            selected = arg;
        }
        if (index == -1) {
            if (listType == IMPLICIT && listener != null && selectCommand != null) {
                listener.commandAction(selectCommand, this);
            }
            return;
        }
        $fireCommand(index);
    }
}
