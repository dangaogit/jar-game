package javax.microedition.lcdui;

import java.util.Vector;

public class ChoiceGroup extends Item implements Choice {
    private final int choiceType;
    private final Vector strings = new Vector();
    private final Vector images = new Vector();
    private boolean[] flags = new boolean[0];
    private int selected = -1;

    public ChoiceGroup(String label, int choiceType) {
        super(label);
        if (choiceType != EXCLUSIVE && choiceType != MULTIPLE && choiceType != POPUP) {
            throw new IllegalArgumentException();
        }
        this.choiceType = choiceType;
    }

    public ChoiceGroup(String label, int choiceType, String[] stringElements, Image[] imageElements) {
        this(label, choiceType);
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

    private void resizeFlags() {
        boolean[] n = new boolean[strings.size()];
        System.arraycopy(flags, 0, n, 0, Math.min(flags.length, n.length));
        flags = n;
    }

    public int append(String stringPart, Image imagePart) {
        if (stringPart == null) {
            throw new NullPointerException();
        }
        strings.addElement(stringPart);
        images.addElement(imagePart);
        resizeFlags();
        if (selected < 0 && choiceType != MULTIPLE) {
            selected = 0;
        }
        $changed();
        return strings.size() - 1;
    }

    public void insert(int elementNum, String stringPart, Image imagePart) {
        strings.insertElementAt(stringPart, elementNum);
        images.insertElementAt(imagePart, elementNum);
        resizeFlags();
        if (selected < 0 && choiceType != MULTIPLE) {
            selected = 0;
        }
        $changed();
    }

    public void delete(int elementNum) {
        strings.removeElementAt(elementNum);
        images.removeElementAt(elementNum);
        resizeFlags();
        if (selected >= strings.size()) {
            selected = strings.size() - 1;
        }
        $changed();
    }

    public void deleteAll() {
        strings.removeAllElements();
        images.removeAllElements();
        flags = new boolean[0];
        selected = -1;
        $changed();
    }

    public void set(int elementNum, String stringPart, Image imagePart) {
        strings.setElementAt(stringPart, elementNum);
        images.setElementAt(imagePart, elementNum);
        $changed();
    }

    public boolean isSelected(int elementNum) {
        if (elementNum < 0 || elementNum >= strings.size()) {
            throw new IndexOutOfBoundsException();
        }
        return choiceType == MULTIPLE ? flags[elementNum] : elementNum == selected;
    }

    public int getSelectedIndex() {
        return choiceType == MULTIPLE ? -1 : selected;
    }

    public int getSelectedFlags(boolean[] selectedArray) {
        int n = 0;
        for (int i = 0; i < strings.size(); i++) {
            selectedArray[i] = isSelected(i);
            if (selectedArray[i]) {
                n++;
            }
        }
        return n;
    }

    public void setSelectedIndex(int elementNum, boolean sel) {
        if (elementNum < 0 || elementNum >= strings.size()) {
            throw new IndexOutOfBoundsException();
        }
        if (choiceType == MULTIPLE) {
            flags[elementNum] = sel;
        } else if (sel) {
            selected = elementNum;
        }
        $changed();
    }

    public void setSelectedFlags(boolean[] selectedArray) {
        for (int i = 0; i < strings.size(); i++) {
            if (choiceType == MULTIPLE) {
                flags[i] = selectedArray[i];
            } else if (selectedArray[i]) {
                selected = i;
                break;
            }
        }
        $changed();
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

    int $kind() {
        return KIND_CHOICE;
    }

    private int firstSelected() {
        if (choiceType != MULTIPLE) {
            return selected;
        }
        for (int i = 0; i < flags.length; i++) {
            if (flags[i]) {
                return i;
            }
        }
        return -1;
    }

    /** "selected\u0001option\u0002option..." for the host overlay (shown as a single-choice list) */
    String $text() {
        StringBuffer sb = new StringBuffer();
        sb.append(firstSelected()).append('\u0001');
        for (int i = 0; i < strings.size(); i++) {
            if (i > 0) {
                sb.append('\u0002');
            }
            sb.append((String) strings.elementAt(i));
        }
        return sb.toString();
    }

    void $setText(String s) {
        try {
            int i = Integer.parseInt(s);
            if (i >= 0 && i < strings.size()) {
                if (choiceType == MULTIPLE) {
                    for (int k = 0; k < flags.length; k++) {
                        flags[k] = k == i;
                    }
                } else {
                    selected = i;
                }
            }
        } catch (NumberFormatException e) {
            // keep the previous selection
        }
    }
}
